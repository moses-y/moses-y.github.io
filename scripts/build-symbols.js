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

const argv = process.argv.slice(2);
const numArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? parseInt(argv[i + 1], 10) : d; };
const strArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };
const BUDGET = numArg('--budget', 20);
const LANG = strArg('--lang', 'python');
const DRY = argv.includes('--dry-run');
const TOKEN = process.env.GITHUB_TOKEN;

const OUT_DIR = path.join('data', 'symbols');
const INDEX_FILE = path.join('data', 'symbols-index.json');
const MAX_FILE = 400_000;      // a single 400KB+ source file is generated, not written
const MAX_FILES_PER_REPO = 600;
const MAX_TARBALL = 40 * 1024 * 1024;   // one giant repo must not eat a whole run
const RUN_MS = numArg('--max-seconds', 240) * 1000;

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv',
  'site-packages', 'dist', 'build', 'vendor', 'third_party']);

const LANGS = {
  python: { ext: '.py', wasm: 'tree-sitter-python/tree-sitter-python.wasm', query: `
      (function_definition name: (identifier) @fn)
      (class_definition name: (identifier) @cls)
      (import_statement name: (dotted_name) @imp)
      (import_from_statement module_name: (dotted_name) @imp)` }
};

function walk(dir, ext, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (out.length >= MAX_FILES_PER_REPO) return out;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, ext, out); }
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
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

async function main() {
  const spec = LANGS[LANG];
  if (!spec) { console.error('Unsupported --lang ' + LANG); process.exit(1); }

  const idx = JSON.parse(fs.readFileSync(path.join('data', 'index.json'), 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const langName = LANG === 'python' ? 'Python' : LANG;
  const candidates = idx.repos
    .filter(r => r.l === langName && r.f > 5)
    .filter(r => !fs.existsSync(path.join(OUT_DIR, r.i + '.json')))
    .sort((a, b) => (a.f || 0) - (b.f || 0));

  console.log('=== Symbols (' + LANG + ') ===');
  console.log(`  candidates: ${candidates.length} | already parsed: ${fs.readdirSync(OUT_DIR).length}`);
  if (DRY) { console.log('  (dry run)'); return; }
  if (!candidates.length) { console.log('  nothing to do'); return; }

  // web-tree-sitter is loaded lazily so --dry-run works without it installed.
  const { Parser, Language, Query } = require('web-tree-sitter');
  await Parser.init();
  const wasmPath = require.resolve(spec.wasm, { paths: [process.cwd(), path.join(process.cwd(), 'node_modules')] });
  const lang = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(lang);
  const query = new Query(lang, spec.query);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'symbols-'));
  const batch = candidates.slice(0, BUDGET);
  let okRepos = 0, totalFns = 0, totalCls = 0, totalFiles = 0, t0 = Date.now();

  let skippedBig = 0;
  for (const r of batch) {
    // Wall-clock guard: a cron step needs a predictable ceiling, not a repo count.
    if (Date.now() - t0 > RUN_MS) { console.log('  time budget reached, stopping early'); break; }
    const dir = path.join(tmpRoot, String(r.i));
    fs.mkdirSync(dir, { recursive: true });
    const tgz = path.join(dir, 'src.tar.gz');
    try {
      if (!await fetchTarball('moses-y', r.n, tgz)) { skippedBig++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
      execFileSync('tar', ['xzf', 'src.tar.gz'], { cwd: dir, stdio: 'ignore' });
    } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); continue; }

    const files = walk(dir, spec.ext);
    const symbols = [];
    const imports = new Set();
    for (const f of files) {
      let src;
      try {
        if (fs.statSync(f).size > MAX_FILE) continue;
        src = fs.readFileSync(f, 'utf8');
      } catch (e) { continue; }
      let tree;
      try { tree = parser.parse(src); } catch (e) { continue; }
      if (!tree) continue;
      const rel = path.relative(dir, f).split(path.sep).slice(1).join('/');
      for (const cap of query.captures(tree.rootNode)) {
        const text = cap.node.text;
        if (cap.name === 'imp') { imports.add(text.split('.')[0]); continue; }
        symbols.push({
          n: text,
          k: cap.name === 'fn' ? 'function' : 'class',
          f: rel,
          l: cap.node.startPosition.row + 1
        });
      }
      if (tree.delete) tree.delete();
    }

    fs.writeFileSync(path.join(OUT_DIR, r.i + '.json'), JSON.stringify({
      id: r.i, name: r.n, lang: langName, files: files.length,
      imports: [...imports].sort(),
      symbols: symbols.slice(0, 4000)
    }));
    okRepos++;
    totalFiles += files.length;
    totalFns += symbols.filter(s => s.k === 'function').length;
    totalCls += symbols.filter(s => s.k === 'class').length;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  // Compact global index: enough to search and locate, not to reconstruct.
  const all = [];
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
      for (const s of j.symbols) all.push([s.n, s.k === 'class' ? 1 : 0, j.id, s.f, s.l]);
    } catch (e) { /* skip unreadable */ }
  }
  fs.writeFileSync(INDEX_FILE, JSON.stringify({ generated: new Date().toISOString(), n: all.length, s: all }));

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  parsed ${okRepos} repos, ${totalFiles} files in ${secs}s (${skippedBig} skipped: too large or unavailable)`);
  console.log(`  functions ${totalFns} | classes ${totalCls}`);
  console.log(`  global index: ${all.length} symbols, ${(fs.statSync(INDEX_FILE).size / 1024).toFixed(0)} KB`);
  const left = candidates.length - batch.length;
  if (left > 0) console.log(`  ${left} repos remaining for the next run`);
}

main().catch(e => { console.error('build-symbols failed:', e.message); process.exit(1); });
