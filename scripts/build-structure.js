#!/usr/bin/env node
/*
 * build-structure.js — per-repo intra-structure graphs for the Code Brain page.
 *
 * For every repo in forks.json, fetch its git tree via the GitHub API (one call,
 * no cloning) and emit structure/<id>.json: a directory/file graph the front-end
 * can lazily load and "sprout" as tendrils from a repo node.
 *
 * Progressive fidelity: this gives EVERY repo a real internal file/dir structure.
 * Flagship repos (autar) get a deeper import graph from a separate generator.
 *
 * Resumable: skips repos whose structure/<id>.json already exists (pass --force to rebuild).
 * Auth: uses `gh api` (gh must be logged in). ~1 API call per repo.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'structure');
const FORCE = process.argv.includes('--force');
const LIMIT = (function () { var i = process.argv.indexOf('--limit'); return i > -1 ? parseInt(process.argv[i + 1], 10) : Infinity; })();

const MAX_NODES = 340;            // cap per repo so the tendril subgraph stays legible
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|\.venv|venv|__pycache__|\.next|target|\.cache|coverage|\.idea|\.vscode)(\/|$)/;

// Extension → language (mirrors the palette on the page; keeps colors consistent).
const EXT_LANG = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', rs: 'Rust', go: 'Go',
  java: 'Java', kt: 'Kotlin', swift: 'Swift', dart: 'Dart', rb: 'Ruby',
  php: 'PHP', c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', cs: 'C#',
  sh: 'Shell', bash: 'Shell', lua: 'Lua', zig: 'Zig', ex: 'Elixir', exs: 'Elixir',
  vue: 'Vue', svelte: 'Svelte', astro: 'Astro', sol: 'Solidity',
  html: 'HTML', css: 'CSS', scss: 'CSS', md: 'Markdown', json: 'JSON',
  yml: 'YAML', yaml: 'YAML', toml: 'TOML', ipynb: 'Jupyter Notebook', sql: 'SQL'
};
// Source-code extensions are prioritised when we have to trim large trees.
const CODE_EXT = new Set(['js','jsx','mjs','cjs','ts','tsx','py','rs','go','java','kt','swift','dart','rb','php','c','h','cpp','cc','hpp','cs','sh','lua','zig','ex','exs','vue','svelte','astro','sol','sql']);

function ext(p) { var m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; }

function ghTree(owner, repo) {
  var out = execFileSync('gh', ['api', 'repos/' + owner + '/' + repo + '/git/trees/HEAD?recursive=1',
    '--cache', '24h'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function buildGraph(tree) {
  // Keep blobs (files); dirs are derived from paths so we only keep dirs that matter.
  var files = tree.filter(function (t) { return t.type === 'blob' && !SKIP_DIR.test('/' + t.path); });

  // Rank files: source code first, then by size — so trimming keeps the architecture.
  files.sort(function (a, b) {
    var ac = CODE_EXT.has(ext(a.path)) ? 1 : 0, bc = CODE_EXT.has(ext(b.path)) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (b.size || 0) - (a.size || 0);
  });

  var nodes = {}, links = [];
  function ensureDir(dir) {
    if (dir === '' || nodes[dir]) return;
    var parts = dir.split('/');
    var name = parts[parts.length - 1];
    var parent = parts.slice(0, -1).join('/');
    ensureDir(parent);
    nodes[dir] = { id: dir, name: name, kind: 'dir' };
    links.push({ s: parent || '__repo__', t: dir });
  }

  var count = 0;
  for (var i = 0; i < files.length && count < MAX_NODES; i++) {
    var f = files[i];
    var parts = f.path.split('/');
    var name = parts[parts.length - 1];
    var parent = parts.slice(0, -1).join('/');
    ensureDir(parent);
    if (nodes[f.path]) continue;
    var e = ext(f.path);
    nodes[f.path] = { id: f.path, name: name, kind: 'file', ext: e, lang: EXT_LANG[e] || null, size: f.size || 0 };
    links.push({ s: parent || '__repo__', t: f.path });
    count++;
  }
  return { nodes: Object.keys(nodes).map(function (k) { return nodes[k]; }), links: links, files: files.length };
}

function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  var data = JSON.parse(fs.readFileSync(path.join(ROOT, 'forks.json'), 'utf8'));
  var forks = data.forks || [];
  var done = 0, skipped = 0, failed = 0, made = 0;

  for (var i = 0; i < forks.length && made < LIMIT; i++) {
    var f = forks[i];
    var outFile = path.join(OUT, f.id + '.json');
    if (!FORCE && fs.existsSync(outFile)) { skipped++; continue; }
    // owner/repo from the GitHub URL (all forks live under the user's account).
    var m = /github\.com\/([^/]+)\/([^/]+)/.exec(f.url || '');
    if (!m) { failed++; continue; }
    try {
      var tree = ghTree(m[1], m[2]);
      var g = buildGraph(tree.tree || []);
      fs.writeFileSync(outFile, JSON.stringify({
        id: f.id, name: f.displayName || f.name, truncated: !!tree.truncated,
        totalFiles: g.files, nodes: g.nodes, links: g.links
      }));
      made++; done++;
      if (done % 25 === 0) console.log('  …' + done + ' built (' + f.name + ': ' + g.nodes.length + ' nodes)');
    } catch (e) {
      failed++;
      // Empty/renamed/deleted repos: write a stub so we don't retry forever.
      fs.writeFileSync(outFile, JSON.stringify({ id: f.id, name: f.displayName || f.name, empty: true, nodes: [], links: [] }));
    }
  }
  console.log('structure: built=' + done + ' skipped=' + skipped + ' failed=' + failed + ' -> ' + OUT);
}
main();
