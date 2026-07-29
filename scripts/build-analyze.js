#!/usr/bin/env node
/*
 * build-analyze.js — deterministic static analysis (no LLM, no tokens).
 *
 * Downloads one tarball per repo, builds the real intra-repo dependency graph
 * (Python + JS/TS import resolution, with cycle detection), and derives code
 * findings from measurable facts — never guesses. Emits structure/<id>.deep.json:
 * a module/file graph the Code Brain page renders, plus a ranked findings list.
 *
 * The LLM layer (build-enrich.js) is optional and only *explains/fixes* the top
 * findings this pass produces — the finding itself is deterministic and cheap.
 *
 * Taxonomy (our own vocabulary): clarity, efficiency, cognitive_load, resilience,
 * soundness, resource_safety. Severity: high | medium | low.
 * Rank = severity_weight × leverage (fan-in / size) × removability (localised = easier).
 *
 * Usage:
 *   node scripts/build-analyze.js --top 30        # originals + top 30 forks by stars
 *   node scripts/build-analyze.js --all           # every repo
 *   node scripts/build-analyze.js --only <id>     # one repo
 *   node scripts/build-analyze.js --force         # rebuild existing
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'structure');

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const FORCE = argv.includes('--force');
const TOP = (function () { const i = argv.indexOf('--top'); return i > -1 ? parseInt(argv[i + 1], 10) : 30; })();
const ONLY = (function () { const i = argv.indexOf('--only'); return i > -1 ? argv[i + 1] : null; })();
const BUDGET = (function () { const i = argv.indexOf('--budget'); return i > -1 ? parseInt(argv[i + 1], 10) : Infinity; })();
const MAXFILES_ARG = (function () { const i = argv.indexOf('--max-files'); return i > -1 ? parseInt(argv[i + 1], 10) : null; })();

const MAX_NODES = 1200;
const MAX_FILES = 1500;           // hard ceiling on files processed per repo (perf/memory guard)
const MAX_DUP_FILES = 800;        // duplication pass is O(files×lines); cap its input
const BIG_SKIP = 2500;            // repos with more code files than this skip deep analysis (keep file-tree)
const WALK_CAP = 4000;            // stop walking once this many code files are collected
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|\.venv|venv|__pycache__|\.next|target|\.cache|coverage|\.idea|\.vscode|migrations|generated|third_party|fixtures)(\/|$)/;
const PY = new Set(['py']);
const JS = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx']);
const CODE_EXT = new Set(['js','jsx','mjs','cjs','ts','tsx','py','rs','go','java','kt','swift','dart','rb','php','c','h','cpp','cc','hpp','cs','sh','lua','zig','ex','exs','vue','svelte','astro','sol']);
const EXT_LANG = { js:'JavaScript',jsx:'JavaScript',mjs:'JavaScript',cjs:'JavaScript',ts:'TypeScript',tsx:'TypeScript',py:'Python',rs:'Rust',go:'Go',java:'Java',kt:'Kotlin',swift:'Swift',dart:'Dart',rb:'Ruby',php:'PHP',c:'C',h:'C',cpp:'C++',cc:'C++',hpp:'C++',cs:'C#',sh:'Shell',lua:'Lua',zig:'Zig',ex:'Elixir',exs:'Elixir',vue:'Vue',svelte:'Svelte',astro:'Astro',sol:'Solidity' };

// Severity weights and rank helper.
const SEV_W = { high: 3, medium: 2, low: 1 };
function rank(sev, leverage, removability) { return +(SEV_W[sev] * leverage * removability).toFixed(2); }

function ext(p) { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; }
// Minified/generated files (huge single lines) cause pathological regex scans and
// carry no architectural signal — skip them everywhere.
function looksMinified(src) { return /[^\n]{2500,}/.test(src.slice(0, 200000)); }
function readSrc(full) { try { const s = fs.readFileSync(full, 'utf8'); return looksMinified(s) ? null : s; } catch (e) { return null; } }
function gh(pathname) { return execFileSync('gh', ['api', pathname, '--cache', '24h'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }

// ---- Fetch source (one tarball) ---------------------------------------------
function fetchSource(owner, repo) {
  const tmp = fs.mkdtempSync('/tmp/an-');
  // Bounded download + extract: a 120s cap on the fetch and a 60s cap on extraction
  // so one giant repo can never stall the whole run. Node also gets a wall-clock timeout.
  try {
    execFileSync('bash', ['-c',
      `timeout 120 gh api repos/${owner}/${repo}/tarball > "${tmp}/a.tgz" 2>/dev/null; timeout 60 tar xzf "${tmp}/a.tgz" -C "${tmp}" 2>/dev/null`],
      { stdio: 'ignore', maxBuffer: 256 * 1024 * 1024, timeout: 200 * 1000 });
  } catch (e) { /* partial extraction still usable; walkFiles will decide */ }
  const roots = fs.readdirSync(tmp).filter(n => n !== 'a.tgz');
  return { tmp, srcRoot: roots.length ? path.join(tmp, roots[0]) : tmp };
}
function walkFiles(dir, base, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (acc.length >= WALK_CAP) break;                     // bail early on giant trees
    const full = path.join(dir, name);
    const rel = path.relative(base, full);
    if (SKIP_DIR.test('/' + rel)) continue;
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) walkFiles(full, base, acc);
    else if (CODE_EXT.has(ext(name)) && st.size < 400 * 1024) acc.push({ full, rel: rel.split(path.sep).join('/'), size: st.size });
  }
  return acc;
}

// Cheap pre-check via the (cached) trees API — avoids downloading a giant tarball.
function codeFileCount(owner, repo) {
  try {
    const tree = JSON.parse(gh(`repos/${owner}/${repo}/git/trees/HEAD?recursive=1`)).tree || [];
    return tree.filter(t => t.type === 'blob' && CODE_EXT.has(ext(t.path)) && !SKIP_DIR.test('/' + t.path)).length;
  } catch (e) { return 0; }
}

// ---- Dependency graph -------------------------------------------------------
// Module id = repo-relative path without extension (POSIX slashes).
function modId(rel) { return rel.replace(/\.(jsx?|tsx?|mjs|cjs|py)$/i, ''); }

function resolveJs(fromRel, spec, byId) {
  if (!spec.startsWith('.')) return null;                     // external / bare import
  const base = path.posix.dirname(fromRel);
  let target = path.posix.normalize(path.posix.join(base, spec)).replace(/\.(jsx?|tsx?|mjs|cjs)$/i, '');
  if (byId[target]) return target;
  for (const idx of ['/index', '']) if (byId[target + idx]) return target + idx;
  return null;
}
function resolvePy(fromRel, spec, byId, roots) {
  // dotted absolute (pkg.mod) or relative (.mod / ..pkg.mod)
  let parts;
  const rel = /^(\.+)(.*)$/.exec(spec);
  if (rel) {
    const up = rel[1].length;
    const baseParts = path.posix.dirname(fromRel).split('/');
    parts = baseParts.slice(0, Math.max(0, baseParts.length - (up - 1))).concat(rel[2] ? rel[2].split('.') : []);
  } else {
    parts = spec.split('.');
  }
  const cand = parts.join('/');
  if (byId[cand]) return cand;
  if (byId[cand + '/__init__']) return cand + '/__init__';
  // try trimming a trailing imported symbol
  const trimmed = parts.slice(0, -1).join('/');
  if (trimmed && byId[trimmed]) return trimmed;
  return null;
}

function buildGraph(files, srcRoot) {
  const byId = {};
  files.forEach(f => { byId[modId(f.rel)] = f; });
  const nodes = {}, edgeSet = new Set(), links = [];
  const ca = {}, ce = {};
  function ensure(id, f) {
    if (nodes[id]) return;
    const e = ext(f.rel);
    nodes[id] = { id, name: id.split('/').slice(-1)[0], full: id, kind: 'module', lang: EXT_LANG[e] || null };
    ca[id] = 0; ce[id] = 0;
  }
  const graphable = files.filter(f => PY.has(ext(f.rel)) || JS.has(ext(f.rel)));
  graphable.forEach(f => ensure(modId(f.rel), f));

  for (const f of graphable) {
    const self = modId(f.rel);
    const src = readSrc(f.full); if (src === null) continue;
    const isPy = PY.has(ext(f.rel));
    const specs = new Set();
    if (isPy) {
      const re = /^\s*(?:from\s+(\.[.\w]*|[.\w]+)\s+import|import\s+([.\w]+))/gm; let m;
      while ((m = re.exec(src))) specs.add(m[1] || m[2]);
    } else {
      const re = /(?:import\s[^'"]*from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]|export\s[^'"]*from\s*['"]([^'"]+)['"])/g; let m;
      while ((m = re.exec(src))) specs.add(m[1] || m[2] || m[3] || m[4]);
    }
    for (const spec of specs) {
      const hit = isPy ? resolvePy(f.rel, spec, byId) : resolveJs(f.rel, spec, byId);
      const tid = hit ? modId(byId[hit].rel) : null;
      if (!tid || tid === self || !nodes[tid]) continue;
      const key = self + '>' + tid; if (edgeSet.has(key)) continue; edgeSet.add(key);
      links.push({ s: self, t: tid }); ce[self]++; ca[tid]++;
    }
  }

  // Cycle detection (Tarjan SCCs of size > 1, or self-loops).
  const inCycle = detectCycles(Object.keys(nodes), links);
  Object.keys(nodes).forEach(id => {
    nodes[id].ca = ca[id]; nodes[id].ce = ce[id];
    nodes[id].inst = (ca[id] + ce[id]) ? +(ce[id] / (ca[id] + ce[id])).toFixed(2) : 0;
    nodes[id].cycle = !!inCycle[id];
  });
  return { nodes, links, ca, ce, inCycle, byId, graphableCount: graphable.length };
}

function detectCycles(ids, links) {
  const adj = {}; ids.forEach(i => adj[i] = []);
  links.forEach(l => { if (adj[l.s]) adj[l.s].push(l.t); });
  let idx = 0; const stack = [], onStack = {}, index = {}, low = {}, inCycle = {};
  function strongconnect(v) {
    index[v] = idx; low[v] = idx; idx++; stack.push(v); onStack[v] = true;
    for (const w of adj[v]) {
      if (index[w] === undefined) { strongconnect(w); low[v] = Math.min(low[v], low[w]); }
      else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
    }
    if (low[v] === index[v]) {
      const comp = []; let w;
      do { w = stack.pop(); onStack[w] = false; comp.push(w); } while (w !== v);
      if (comp.length > 1) comp.forEach(n => inCycle[n] = true);
    }
  }
  for (const v of ids) if (index[v] === undefined) strongconnect(v);
  return inCycle;
}

// ---- Findings (deterministic, measured facts only) --------------------------
const BRANCH = /\b(if|elif|else if|for|while|case|catch|except)\b|&&|\|\||\?\s*[^:]/g;
function analyzeFile(f, lang) {
  const src = readSrc(f.full); if (src === null) return null;
  const lines = src.split('\n');
  const loc = lines.filter(l => l.trim() && !/^\s*(#|\/\/|\*)/.test(l)).length;
  let maxIndent = 0;
  for (const l of lines) { if (!l.trim()) continue; const sp = (l.match(/^[ \t]*/)[0]).replace(/\t/g, '    ').length; maxIndent = Math.max(maxIndent, Math.floor(sp / 4)); }
  const branches = (src.match(BRANCH) || []).length;
  return { loc, maxIndent, branches, src, lines };
}

function findingsFor(f, lang, node, fileStats) {
  const out = [];
  const fs_ = fileStats; if (!fs_) return out;
  const rel = f.rel;
  const lev = node ? Math.max(1, 1 + (node.ca || 0) / 3) : 1.2;   // widely-imported = higher leverage
  // God file
  if (fs_.loc > 600) out.push({ category: 'cognitive_load', severity: fs_.loc > 1200 ? 'high' : 'medium',
    title: 'Oversized file (' + fs_.loc + ' lines)', file: rel,
    evidence: fs_.loc + ' code lines — hard to hold in one head; a change here ripples widely.',
    recommendation: 'Split into cohesive units by responsibility.', rank: rank(fs_.loc > 1200 ? 'high' : 'medium', lev, 0.6) });
  // Deep nesting
  if (fs_.maxIndent >= 6) out.push({ category: 'cognitive_load', severity: fs_.maxIndent >= 8 ? 'high' : 'medium',
    title: 'Deep nesting (depth ' + fs_.maxIndent + ')', file: rel,
    evidence: 'Max indentation depth ' + fs_.maxIndent + ' — control flow is hard to follow.',
    recommendation: 'Flatten with early returns / guard clauses; extract inner blocks.', rank: rank(fs_.maxIndent >= 8 ? 'high' : 'medium', lev, 0.7) });
  // Branch density (cyclomatic proxy)
  if (fs_.loc > 40 && fs_.branches / fs_.loc > 0.28) out.push({ category: 'cognitive_load', severity: 'medium',
    title: 'High branching density', file: rel,
    evidence: fs_.branches + ' branch points over ' + fs_.loc + ' lines.',
    recommendation: 'Decompose decision-heavy logic; consider table/strategy dispatch.', rank: rank('medium', lev, 0.5) });
  // Cycle membership
  if (node && node.cycle) out.push({ category: 'soundness', severity: 'high',
    title: 'Import cycle member', file: rel,
    evidence: 'Participates in a circular import dependency (mutually reachable modules).',
    recommendation: 'Break the cycle: extract shared types, invert a dependency, or defer an import.', rank: rank('high', Math.max(lev, 1.5), 0.5) });
  // God module by fan-in
  if (node && node.ca >= 12) out.push({ category: 'clarity', severity: node.ca >= 25 ? 'high' : 'medium',
    title: 'Hub module (imported by ' + node.ca + ')', file: rel,
    evidence: node.ca + ' modules depend on this one; churn here is high-blast-radius.',
    recommendation: 'Keep it stable and small; move volatile logic out.', rank: rank(node.ca >= 25 ? 'high' : 'medium', 1 + node.ca / 6, 0.4) });

  // Language-specific, conservative (only clear cases).
  const src = fs_.src;
  if (lang === 'Python') {
    if (/^\s*except\s*:/m.test(src) || /^\s*except\s+Exception\s*:/m.test(src)) out.push({ category: 'resilience', severity: 'medium',
      title: 'Broad exception handling', file: rel, evidence: 'Bare or Exception-wide `except` swallows errors indiscriminately.',
      recommendation: 'Catch specific exceptions; re-raise or log the rest.', rank: rank('medium', lev, 0.8) });
    if (/(?<!with\s)\bopen\s*\([^)]*\)(?!\s*as)/.test(src) && !/\bwith\s+open/.test(src)) out.push({ category: 'resource_safety', severity: 'medium',
      title: 'File opened without context manager', file: rel, evidence: '`open(...)` not wrapped in `with` — handle may leak on error.',
      recommendation: 'Use `with open(...) as f:` for deterministic close.', rank: rank('medium', lev, 0.85) });
  }
  if (lang === 'JavaScript' || lang === 'TypeScript') {
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(src)) out.push({ category: 'resilience', severity: 'medium',
      title: 'Empty catch block', file: rel, evidence: 'A `catch {}` silently discards errors.',
      recommendation: 'Handle, rethrow, or at least log the error.', rank: rank('medium', lev, 0.85) });
    if (/==(?!=)/.test(src.replace(/===/g, ''))) { /* too noisy; skipped intentionally */ }
  }
  // Markers (info-level; never noisy escalation).
  const markers = (src.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;
  if (markers >= 3) out.push({ category: 'clarity', severity: 'low',
    title: markers + ' TODO/FIXME markers', file: rel, evidence: markers + ' unresolved in-code markers.',
    recommendation: 'Triage into issues or resolve; stale markers erode signal.', rank: rank('low', 1, 0.9) });
  return out;
}

// ---- Duplication (cross-file, normalized 6-line windows) --------------------
function duplication(fileList) {
  const WIN = 6; const seen = {}; const hits = [];
  for (const f of fileList) {
    if (!f._lines) continue;
    const norm = f._lines.map(l => l.trim()).filter(l => l.length > 3 && !/^[)}\];,]+$/.test(l));
    for (let i = 0; i + WIN <= norm.length; i++) {
      const key = norm.slice(i, i + WIN).join('\n');
      if (key.length < 60) continue;
      (seen[key] = seen[key] || []).push(f.rel);
    }
  }
  const groups = Object.keys(seen).filter(k => new Set(seen[k]).size >= 2);
  if (groups.length) {
    const files = new Set(); groups.forEach(k => seen[k].forEach(x => files.add(x)));
    hits.push({ category: 'clarity', severity: groups.length > 12 ? 'high' : 'medium',
      title: 'Duplicated code blocks (' + groups.length + ')', file: Array.from(files).slice(0, 4).join(', ') + (files.size > 4 ? ' …' : ''),
      evidence: groups.length + ' repeated ' + WIN + '-line blocks across ' + files.size + ' files.',
      recommendation: 'Extract shared helpers; DRY the repeated logic.', rank: rank(groups.length > 12 ? 'high' : 'medium', 1.4, 0.6) });
  }
  return hits;
}

// ---- Assemble per-repo output ----------------------------------------------
function analyzeRepo(f) {
  const m = /github\.com\/([^/]+)\/([^/]+)/.exec(f.url || '');
  if (!m) throw new Error('no url');
  const bigSkip = MAXFILES_ARG || BIG_SKIP;
  const nCode = codeFileCount(m[1], m[2]);
  if (nCode > bigSkip) throw new Error('too large (' + nCode + ' code files) — file-tree retained');
  const { tmp, srcRoot } = fetchSource(m[1], m[2]);
  try {
    let files = walkFiles(srcRoot, srcRoot, []);
    if (!files.length) throw new Error('no source');
    const discovered = files.length;
    if (files.length > MAX_FILES) { files.sort((a, b) => a.size - b.size); files = files.slice(0, MAX_FILES); }
    const g = buildGraph(files, srcRoot);

    const findings = [];
    const langCount = {};
    for (const file of files) {
      const lang = EXT_LANG[ext(file.rel)] || null;
      if (lang) langCount[lang] = (langCount[lang] || 0) + 1;
      const stats = analyzeFile(file, lang);
      if (stats) file._lines = stats.lines;
      const node = g.nodes[modId(file.rel)] || null;
      findingsFor(file, lang, node, stats).forEach(x => findings.push(x));
    }
    duplication(files.slice(0, MAX_DUP_FILES)).forEach(x => findings.push(x));
    files.forEach(f => { delete f._lines; });   // release line buffers
    findings.sort((a, b) => b.rank - a.rank);

    // Graph payload: prefer the module graph; cap to load-bearing core.
    let nodeArr = Object.keys(g.nodes).map(id => g.nodes[id]);
    nodeArr.sort((a, b) => (b.ca + b.ce) - (a.ca + a.ce));
    if (nodeArr.length > MAX_NODES) nodeArr = nodeArr.slice(0, MAX_NODES);
    const keep = new Set(nodeArr.map(n => n.id));
    const linkArr = g.links.filter(l => keep.has(l.s) && keep.has(l.t));

    const cats = {};
    findings.forEach(x => { cats[x.category] = (cats[x.category] || 0) + 1; });
    const sev = { high: 0, medium: 0, low: 0 };
    findings.forEach(x => sev[x.severity]++);

    return {
      id: f.id, name: f.displayName || f.name, deep: true, kind: 'import-graph', engine: 'static',
      scope: { discovered: discovered, analyzed: files.length, graphable: g.graphableCount, languages: langCount },
      totals: { modules: Object.keys(g.nodes).length, edges: g.links.length, cycles: Object.values(g.inCycle).length,
        findings: findings.length, severity: sev, categories: cats },
      shown: nodeArr.length, edges: linkArr.length,
      nodes: nodeArr, links: linkArr,
      findings: findings.slice(0, 60)
    };
  } finally { try { execFileSync('rm', ['-rf', tmp]); } catch (e) {} }
}

// ---- Selection + main -------------------------------------------------------
function select(forks) {
  if (ONLY) return forks.filter(f => String(f.id) === ONLY);
  if (ALL) return forks;
  const originals = forks.filter(f => f.type === 'original');
  const rest = forks.filter(f => f.type !== 'original').sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, TOP);
  return originals.concat(rest);
}

// Worker mode: analyze exactly one repo (invoked as a subprocess by the driver).
function runWorker(f) {
  const outFile = path.join(OUT, f.id + '.deep.json');
  try {
    const r = analyzeRepo(f);
    fs.writeFileSync(outFile, JSON.stringify(r));
    console.log('  ✓ ' + r.name + ': ' + r.totals.modules + ' modules, ' + r.totals.cycles + ' in-cycle, ' + r.totals.findings + ' findings (H' + r.totals.severity.high + '/M' + r.totals.severity.medium + '/L' + r.totals.severity.low + ')');
  } catch (e) {
    // Terminal skips (giant / no source): write a stub so CI won't retry forever.
    // The page treats a nodeless deep file as "fall back to the file tree".
    if (/too large|no source|no url/.test(e.message)) {
      fs.writeFileSync(outFile, JSON.stringify({ id: f.id, name: f.displayName || f.name, deep: false, skipped: e.message, nodes: [], links: [], findings: [] }));
    }
    console.log('  ✗ ' + f.name + ': ' + e.message); process.exit(3);
  }
}

(function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'forks.json'), 'utf8'));

  // Single-repo mode (also the unit the driver spawns).
  if (ONLY) { const f = (data.forks || []).find(x => String(x.id) === ONLY); if (f) runWorker(f); return; }

  // Driver mode: each repo runs in its own subprocess with a hard timeout, so no
  // single pathological repo (giant tarball, weird source) can ever stall the batch.
  const repos = select(data.forks || []);
  console.log('analyzing ' + repos.length + ' repos (deterministic, no LLM; isolated workers)…');
  let done = 0, failed = 0, skipped = 0;
  for (const f of repos) {
    if (done >= BUDGET) { console.log('  … budget reached (' + BUDGET + '); remaining repos will fill on the next run'); break; }
    const outFile = path.join(OUT, f.id + '.deep.json');
    if (!FORCE && fs.existsSync(outFile)) { skipped++; continue; }
    try {
      const out = execFileSync('node', [__filename, '--only', String(f.id), '--force'],
        { encoding: 'utf8', timeout: 90 * 1000, stdio: ['ignore', 'pipe', 'ignore'] });
      process.stdout.write(out); done++;
    } catch (e) {
      failed++;
      console.log('  ✗ ' + f.name + ': ' + (e.killed ? 'timed out (90s) — skipped' : 'worker error'));
    }
  }
  console.log('analyze: ok=' + done + ' failed=' + failed + ' skipped(existing)=' + skipped + ' -> ' + OUT + '/<id>.deep.json');
})();
