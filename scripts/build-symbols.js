#!/usr/bin/env node
/*
 * build-symbols.js - a symbol layer, parsed rather than inferred.
 *
 * build-analyze.js resolves imports with regex and stops at module granularity.
 * On a sample repo it found 59 modules and 69 edges; tree-sitter found the same
 * files plus 768 functions and 49 classes. The win is not a better module graph,
 * it is a level of detail that did not exist: named symbols with signatures and
 * locations, which is what cross-repo symbol search needs.
 *
 * Source is fetched as a tarball (one request per repo, ~1.7MB and ~9s measured)
 * rather than per-file blobs, extracted to a temp dir, parsed, and deleted.
 *
 * Emits data/symbols/<repoId>.json and a compact global data/symbols-index.json.
 *
 * Usage:
 *   node scripts/build-symbols.js --budget 20      # repos per run
 *   node scripts/build-symbols.js --lang python
 *   node scripts/build-symbols.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { LANGS, extensionsOf, acceptsLanguage, normalizeImport, ambiguousFor } = require('./lib-languages.js');

const argv = process.argv.slice(2);
const numArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? parseInt(argv[i + 1], 10) : d; };
const strArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };
const BUDGET = numArg('--budget', 20);
// Every language by default. Python was the default for as long as it was the
// only grammar, which quietly meant a cron run never touched the 464 repos in
// the other four languages even after they were supported.
const LANG = strArg('--lang', 'all');
const DRY = argv.includes('--dry-run');
const ONLY = strArg('--only', '');   // parse a single repo by name, for debugging
const TOKEN = process.env.GITHUB_TOKEN;

// Bumped when the extraction changes. A per-repo file written by an older
// version is re-parsed rather than skipped: without this, the 422 repos parsed
// before call edges existed would never gain them.
//   2: call edges and fan-in
//   3: TypeScript, JavaScript, Go and Rust, which had no symbols at all
const SYMBOLS_VERSION = 3;

const OUT_DIR = path.join('data', 'symbols');
const INDEX_FILE = path.join('data', 'symbols-index.json');
const STATUS_FILE = path.join('data', 'symbols-status.json');
const MAX_FILE = 400_000;                // a 400KB+ source file is generated, not written
const MAX_NOTEBOOK = 25 * 1024 * 1024;   // outputs inflate notebooks enormously
const MAX_FILES_PER_REPO = 600;
const MAX_TARBALL = 40 * 1024 * 1024;   // one giant repo must not eat a whole run
const RUN_MS = numArg('--max-seconds', 240) * 1000;

// Attribute calls cannot be resolved to a definition without type inference, so
// f.read() would be attributed to any function named read. These names collide
// with repo-defined functions often enough to be worth dropping outright.
const AMBIGUOUS_METHODS = new Set(['read', 'write', 'get', 'set', 'append', 'add',
  'remove', 'update', 'close', 'open', 'run', 'start', 'stop', 'send', 'join',
  'split', 'strip', 'format', 'keys', 'values', 'items', 'load', 'save', 'copy',
  'next', 'push', 'pop', 'sort', 'reverse', 'count', 'index', 'find', 'replace',
  // Logging and lifecycle methods, which inflated fan-in badly: self.logger()
  // ranked as the most-called "function" in a repo at 336 callers.
  'logger', 'log', 'debug', 'info', 'warning', 'warn', 'error', 'exception',
  'critical', 'notify', 'emit', 'time', 'now', 'connect', 'disconnect', 'cancel',
  'submit', 'execute', 'process', 'handle', 'validate', 'reset', 'clear', 'flush',
  'encode', 'decode', 'dumps', 'loads', 'json', 'text', 'items', 'get_json']);

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv',
  'site-packages', 'dist', 'build', 'vendor', 'third_party']);


function walk(dir, exts, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (out.length >= MAX_FILES_PER_REPO) return out;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, exts, out); }
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// A notebook is JSON; its code cells concatenate into ordinary Python, which the
// grammar already loaded here handles. Markdown cells and outputs are dropped.
// Cell magics (%%bash) and line magics (%pip) are not Python and would fail the
// parse, so those lines are blanked rather than removed, to keep line numbers
// meaningful against the source cell.
function notebookToPython(raw) {
  let nb;
  try { nb = JSON.parse(raw); } catch (e) { return null; }
  const cells = nb && (nb.cells || (nb.worksheets && nb.worksheets[0] && nb.worksheets[0].cells));
  if (!Array.isArray(cells)) return null;
  const out = [];
  for (const c of cells) {
    if (!c || c.cell_type !== 'code') continue;
    const src = Array.isArray(c.source) ? c.source.join('') : String(c.source || c.input || '');
    if (!src.trim()) continue;
    for (const line of src.split('\n')) {
      out.push(/^\s*[%!]/.test(line) ? '' : line);
    }
    out.push('');
  }
  return out.length ? out.join('\n') : null;
}

async function fetchTarball(owner, repo, dest) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/tarball`, {
    headers: Object.assign({ 'User-Agent': 'build-symbols' }, TOKEN ? { Authorization: 'token ' + TOKEN } : {}),
    redirect: 'follow',
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) return false;
  const len = +(res.headers.get('content-length') || 0);
  if (len && len > MAX_TARBALL) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_TARBALL) return false;
  fs.writeFileSync(dest, buf);
  return true;
}

// Some repos cannot be fetched as a tarball at all. Data-Science-Machine-Learning
// carries 330 PDFs and 265 images beside its code, so its archive runs to
// hundreds of megabytes and the download does not finish. The tree API lists
// every blob with its size, so the code can be fetched selectively instead:
// 346 code blobs there total 102MB, but 328 of them are under 1.5MB and come to
// 44.8MB, and the median notebook is 47KB. Bounded by bytes and by count.
const TREE_MAX_BLOB = 1_500_000;
const TREE_BYTE_BUDGET = 24 * 1024 * 1024;

async function fetchViaTree(owner, repo, exts, dest) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, {
    headers: Object.assign({ 'User-Agent': 'build-symbols' }, TOKEN ? { Authorization: 'token ' + TOKEN } : {}),
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) return 0;
  const tree = (await res.json()).tree || [];
  const wanted = tree
    .filter(f => f.type === 'blob' && exts.some(x => f.path.endsWith(x)))
    .filter(f => (f.size || 0) > 0 && f.size <= TREE_MAX_BLOB)
    .sort((a, b) => a.size - b.size)
    .slice(0, MAX_FILES_PER_REPO);

  let spent = 0, written = 0;
  for (const f of wanted) {
    if (spent + f.size > TREE_BYTE_BUDGET) break;
    let body;
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${f.path.split('/').map(encodeURIComponent).join('/')}`,
        { headers: { 'User-Agent': 'build-symbols' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      body = await r.text();
    } catch (e) { continue; }
    spent += f.size;
    // Mirrored into the same layout the tarball produces, so the parse loop is
    // identical for both paths: a single top directory, then the real path.
    const target = path.join(dest, 'repo', f.path);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
      written++;
    } catch (e) { /* path we cannot write, skip it */ }
  }
  return written;
}

// A repo needs re-parsing when it has no symbol file or the file predates the
// current extraction.
function isDue(id) {
  const p = path.join(OUT_DIR, id + '.json');
  if (!fs.existsSync(p)) return true;
  try { return (JSON.parse(fs.readFileSync(p, 'utf8')).v || 1) !== SYMBOLS_VERSION; }
  catch (e) { return true; }
}

/*
 * Candidates across every requested language, interleaved rather than
 * concatenated. Concatenating starves: Python alone has a backlog larger than any
 * single run's budget, so every run would spend itself on Python and the Go and
 * Rust repos would stay unparsed forever no matter how many times cron fired.
 * Round-robin gives each language a share of every run.
 */
function selectCandidates(idx, langKeys) {
  const perLang = langKeys.map(key => {
    const spec = LANGS[key];
    return idx.repos
      // --only still has to respect the language, or the first spec in the loop
      // claims the repo and parses it with the wrong grammar: a Go repo went
      // through the Python pass and reported 0 files rather than an error.
      .filter(r => acceptsLanguage(spec, r.l) && (ONLY ? r.n === ONLY : r.f > 5))
      .filter(r => isDue(r.i))
      // Smallest first, so a run completes many repos rather than stalling on one.
      .sort((a, b) => (a.f || 0) - (b.f || 0))
      .map(r => Object.assign({ lang: key }, r));
  });
  const out = [];
  for (let i = 0; out.length < perLang.reduce((n, l) => n + l.length, 0); i++) {
    for (const list of perLang) if (i < list.length) out.push(list[i]);
  }
  return { out, perLang };
}

// One parser per grammar, held for the whole run: loading a wasm grammar costs
// far more than parsing a file with it, and TypeScript needs two.
async function loadGrammars(ts, langKeys) {
  const { Parser, Language, Query } = ts;
  const loaded = {};
  for (const key of langKeys) {
    const spec = LANGS[key];
    loaded[key] = { spec, byExt: new Map() };
    for (const g of spec.grammars) {
      const wasmPath = require.resolve(g.wasm, { paths: [process.cwd(), path.join(process.cwd(), 'node_modules')] });
      const lang = await Language.load(wasmPath);
      const parser = new Parser();
      parser.setLanguage(lang);
      const query = new Query(lang, spec.query);
      for (const e of g.ext) loaded[key].byExt.set(e, { parser, query });
    }
  }
  return loaded;
}

async function main() {
  const langKeys = LANG === 'all' ? Object.keys(LANGS) : [LANG];
  for (const k of langKeys) {
    if (!LANGS[k]) { console.error('Unsupported --lang ' + k); process.exit(1); }
  }

  const idx = JSON.parse(fs.readFileSync(path.join('data', 'index.json'), 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { out: candidates, perLang } = selectCandidates(idx, langKeys);

  console.log('=== Symbols (' + langKeys.join(', ') + ') ===');
  langKeys.forEach((k, i) => console.log(`  ${k.padEnd(11)} due: ${perLang[i].length}`));
  console.log(`  total due: ${candidates.length} | files on disk: ${fs.readdirSync(OUT_DIR).length}`);
  if (DRY) { console.log('  (dry run)'); return; }
  if (!candidates.length) { console.log('  nothing to do'); return; }

  // web-tree-sitter is loaded lazily so --dry-run works without it installed.
  const treeSitter = require('web-tree-sitter');
  await treeSitter.Parser.init();
  const grammars = await loadGrammars(treeSitter, langKeys);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'symbols-'));
  const batch = candidates.slice(0, BUDGET);
  let okRepos = 0, totalFns = 0, totalCls = 0, totalFiles = 0, t0 = Date.now();

  let skippedBig = 0;
  const perLangCount = {};
  for (const r of batch) {
    // Wall-clock guard: a cron step needs a predictable ceiling, not a repo count.
    if (Date.now() - t0 > RUN_MS) { console.log('  time budget reached, stopping early'); break; }
    const { spec, byExt } = grammars[r.lang];
    const exts = extensionsOf(spec);
    const ambiguous = ambiguousFor(spec, AMBIGUOUS_METHODS);
    const dir = path.join(tmpRoot, String(r.i));
    fs.mkdirSync(dir, { recursive: true });
    const tgz = path.join(dir, 'src.tar.gz');
    try {
      // A tarball that aborts on timeout throws, and that used to escape to the
      // outer catch and skip the repo, so the tree fallback never ran for the
      // repos that needed it most.
      let got = false;
      try {
        if (await fetchTarball('moses-y', r.n, tgz)) {
          execFileSync('tar', ['xzf', 'src.tar.gz'], { cwd: dir, stdio: 'ignore' });
          got = true;
        }
      } catch (e) { got = false; }
      if (!got && !await fetchViaTree('moses-y', r.n, exts, dir)) {
        skippedBig++; fs.rmSync(dir, { recursive: true, force: true }); continue;
      }
    } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); continue; }

    const files = walk(dir, exts);
    const symbols = [];
    const imports = new Set();
    const rawCalls = [];
    for (const f of files) {
      let src;
      try {
        // A notebook carries its outputs inline - base64 images push a file with
        // 19KB of code to 8.9MB - so it gets a much larger raw budget, and the
        // real limit is applied to the code after the outputs are stripped.
        const nb = f.endsWith('.ipynb');
        if (fs.statSync(f).size > (nb ? MAX_NOTEBOOK : MAX_FILE)) continue;
        src = fs.readFileSync(f, 'utf8');
        if (nb) { src = notebookToPython(src); if (!src || src.length > MAX_FILE) continue; }
      } catch (e) { continue; }
      // .tsx and .ts are different grammars, so the parser is chosen per file
      // rather than per repo.
      const g = byExt.get(path.extname(f).toLowerCase());
      if (!g) continue;
      let tree;
      try { tree = g.parser.parse(src); } catch (e) { continue; }
      if (!tree) continue;
      const rel = path.relative(dir, f).split(path.sep).slice(1).join('/');
      // The nearest enclosing function names the caller. Calls outside any
      // function belong to module-level code, which is worth keeping: that is
      // where scripts do their work.
      const enclosing = node => {
        for (let n = node; n; n = n.parent) {
          if (!spec.fnNodes.includes(n.type)) continue;
          const nm = n.childForFieldName('name');
          if (nm) return nm.text;
          // An anonymous function is named by what it is bound to, because
          // `const handler = async () => {...}` is a named function to every
          // reader of the code and attributing its calls to <module> would lose
          // most of the call graph in any modern JavaScript repo.
          for (let up = n.parent; up; up = up.parent) {
            if (spec.fnNodes.includes(up.type)) break;
            if (up.type === 'variable_declarator' || up.type === 'pair' ||
                up.type === 'assignment_expression' || up.type === 'public_field_definition') {
              const bound = up.childForFieldName('name') || up.childForFieldName('key') ||
                up.childForFieldName('left');
              if (bound) return bound.text;
            }
          }
          return null;
        }
        return null;
      };
      for (const cap of g.query.captures(tree.rootNode)) {
        const text = cap.node.text;
        if (cap.name === 'imp') {
          const mod = normalizeImport(spec, text);
          if (mod) imports.add(mod);
          continue;
        }
        if (cap.name === 'call' || cap.name === 'mcall') {
          if (cap.name === 'mcall' && ambiguous.has(text)) continue;
          rawCalls.push([enclosing(cap.node) || '<module>', text, rel]);
          continue;
        }
        symbols.push({
          n: text,
          k: cap.name === 'fn' ? 'function' : 'class',
          f: rel,
          l: cap.node.startPosition.row + 1
        });
      }
      if (tree.delete) tree.delete();
    }

    // An edge is kept only when its target is defined in this repository: the
    // internal call graph is the useful part, and it drops stdlib and library
    // calls that cannot be followed anyway.
    const defined = new Set(symbols.map(s2 => s2.n));
    const edgeCount = new Map();
    for (const [from, to] of rawCalls) {
      if (!defined.has(to) || from === to) continue;
      const k = from + '\u0000' + to;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
    const calls = [...edgeCount.entries()]
      .map(([k, n]) => { const [from, to] = k.split('\u0000'); return [from, to, n]; })
      .sort((a, b) => b[2] - a[2])
      .slice(0, 6000);
    // Fan-in per symbol: how many distinct callers reach it. This is blast radius
    // at function level, which the module graph cannot express.
    const callers = {};
    for (const [from, to] of calls) {
      (callers[to] || (callers[to] = new Set())).add(from);
    }
    const fanIn = Object.fromEntries(Object.entries(callers)
      .map(([k, v]) => [k, v.size]).filter(([, v]) => v > 1)
      .sort((a, b) => b[1] - a[1]).slice(0, 300));

    fs.writeFileSync(path.join(OUT_DIR, r.i + '.json'), JSON.stringify({
      id: r.i, name: r.n, v: SYMBOLS_VERSION, lang: spec.language, files: files.length,
      imports: [...imports].sort(),
      symbols: symbols.slice(0, 4000),
      calls: calls,
      fanIn: fanIn
    }));
    okRepos++;
    perLangCount[r.lang] = (perLangCount[r.lang] || 0) + 1;
    totalFiles += files.length;
    totalFns += symbols.filter(s => s.k === 'function').length;
    totalCls += symbols.filter(s => s.k === 'class').length;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  // Compact global index: enough to search and locate, not to reconstruct.
  // The same pass records which extraction version produced each repo's file,
  // because article generation needs to know whether a repo's call graph exists
  // yet without opening 41 MB of symbol data to find out.
  const all = [];
  const status = {};
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
      for (const s of j.symbols) all.push([s.n, s.k === 'class' ? 1 : 0, j.id, s.f, s.l]);
      status[j.id] = j.v || 1;
    } catch (e) { /* skip unreadable */ }
  }
  fs.writeFileSync(INDEX_FILE, JSON.stringify({ generated: new Date().toISOString(), n: all.length, s: all }));
  fs.writeFileSync(STATUS_FILE, JSON.stringify({ v: SYMBOLS_VERSION, repos: status }));

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  parsed ${okRepos} repos, ${totalFiles} files in ${secs}s (${skippedBig} skipped: too large or unavailable)`);
  console.log(`  functions ${totalFns} | classes ${totalCls}`);
  const share = Object.entries(perLangCount).map(([k, n]) => `${k} ${n}`).join(', ');
  if (share) console.log(`  by language: ${share}`);
  console.log(`  global index: ${all.length} symbols, ${(fs.statSync(INDEX_FILE).size / 1024).toFixed(0)} KB`);
  const left = candidates.length - batch.length;
  if (left > 0) console.log(`  ${left} repos remaining for the next run`);
}

main().catch(e => { console.error('build-symbols failed:', e.message); process.exit(1); });
