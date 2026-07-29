#!/usr/bin/env node
/*
 * build-autar.js — deep flagship import graph for the autar codebase.
 *
 * Scans the real Python source at AUTAR_ROOT, resolves intra-package imports,
 * and emits structure/autar.json: module nodes + directed import edges, with
 * fan-in (Ca) / fan-out (Ce) so the page can size/highlight the load-bearing core.
 *
 * This is the "deep dive" tier — every other repo gets a file/dir tree from
 * build-structure.js; autar gets a true module dependency graph.
 */
const fs = require('fs');
const path = require('path');

const AUTAR_ROOT = process.env.AUTAR_ROOT || '/home/moe/Autar/App/Site/ai';
const PREFIX = 'ai';               // module namespace root (keeps names short)
const OUT = path.join(__dirname, '..', 'structure', 'autar.json');
const MAX_NODES = 360;
const SKIP = /(^|\/)(\.venv|venv|__pycache__|htmlcov|\.ruff_cache|\.mypy_cache|\.pytest_cache|\.tmp|tests|test)(\/|$)/;

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(AUTAR_ROOT, full);
    if (SKIP.test('/' + rel)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith('.py')) acc.push(full);
  }
  return acc;
}

// file path -> dotted module id (dropping trailing __init__)
function modId(full) {
  let rel = path.relative(AUTAR_ROOT, full).replace(/\.py$/, '').split(path.sep);
  if (rel[rel.length - 1] === '__init__') rel.pop();
  return [PREFIX].concat(rel).join('.');
}

function parseImports(src, selfId) {
  const edges = new Set();
  const selfParts = selfId.split('.');
  const lines = src.split('\n');
  for (let raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = /^from\s+(\.+)([\w.]*)\s+import\b/.exec(line))) {
      // relative import: dots climb up from the current package
      const up = m[1].length;
      const base = selfParts.slice(0, Math.max(1, selfParts.length - up));
      const tail = m[2] ? m[2].split('.') : [];
      edges.add(base.concat(tail).join('.'));
    } else if ((m = /^from\s+([\w.]+)\s+import\b/.exec(line))) {
      edges.add(m[1]);
    } else if ((m = /^import\s+([\w.]+)/.exec(line))) {
      edges.add(m[1]);
    }
  }
  return edges;
}

function main() {
  if (!fs.existsSync(AUTAR_ROOT)) { console.error('autar root not found:', AUTAR_ROOT); process.exit(1); }
  const files = walk(AUTAR_ROOT, []);
  const ids = new Set(files.map(modId));

  // Also register package (dir) ids so `from ai.executor import x` resolves.
  const pkgIds = new Set();
  ids.forEach(id => { const p = id.split('.'); for (let i = 2; i < p.length; i++) pkgIds.add(p.slice(0, i).join('.')); });

  const links = [];
  const ca = {}, ce = {};       // fan-in, fan-out
  ids.forEach(id => { ca[id] = 0; ce[id] = 0; });

  for (const full of files) {
    const self = modId(full);
    const targets = parseImports(fs.readFileSync(full, 'utf8'), self);
    const seen = new Set();
    for (let t of targets) {
      // resolve an import to a concrete module we know about
      let hit = ids.has(t) ? t : (ids.has(t + '.__init__') ? t : null);
      if (!hit && pkgIds.has(t)) hit = t;              // package import -> its __init__ node if present
      if (!hit) {
        // trim trailing symbol (from ai.a.b import C where a.b is the module)
        const parts = t.split('.'); parts.pop();
        const p = parts.join('.');
        if (ids.has(p)) hit = p;
      }
      if (!hit || hit === self || seen.has(hit)) continue;
      if (!ids.has(hit)) continue;                     // only edges between real modules
      seen.add(hit);
      links.push({ s: self, t: hit });
      ce[self]++; ca[hit]++;
    }
  }

  // Rank by total coupling; keep the load-bearing core if we exceed the cap.
  let keep = Array.from(ids).sort((a, b) => (ca[b] + ce[b]) - (ca[a] + ce[a]));
  if (keep.length > MAX_NODES) keep = keep.slice(0, MAX_NODES);
  const keepSet = new Set(keep);

  const nodes = keep.map(id => {
    const short = id.replace(/^ai\./, '');
    return { id, name: short.split('.').slice(-2).join('.'), full: short, kind: 'module',
      lang: 'Python', ca: ca[id], ce: ce[id],
      inst: (ca[id] + ce[id]) ? +(ce[id] / (ca[id] + ce[id])).toFixed(2) : 0 };
  });
  const flinks = links.filter(l => keepSet.has(l.s) && keepSet.has(l.t));

  fs.writeFileSync(OUT, JSON.stringify({
    id: 'autar', name: 'autar', deep: true, kind: 'import-graph',
    totalModules: ids.size, shown: nodes.length, edges: flinks.length,
    nodes, links: flinks
  }));
  console.log('autar: ' + ids.size + ' modules found, ' + nodes.length + ' shown, ' + flinks.length + ' import edges -> ' + OUT);
}
main();
