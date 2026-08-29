#!/usr/bin/env node
/*
 * measure-runtime-checks.js - firing rates for the runtime catalogue.
 *
 * A check nobody measured is a guess. This runs the runtime checks alone over a
 * named sample of repositories and prints, per rule, how often it fired and on
 * what, so a rule that fires on everything can be thrown out or downgraded
 * before it is published rather than after. Every other catalogue in this audit
 * was specified against measured rates; this one is held to the same bar.
 *
 * Not part of the pipeline. Run it by hand when a rule changes:
 *   node src/tools/measure-runtime-checks.js --sample 24
 *   node src/tools/measure-runtime-checks.js --repos a,b,c --verbose
 */
'use strict';
const fs = require('fs');
const hygiene = require('../lib/lib-hygiene.js');
require('../checks/checks-runtime.js');
const { configFiles } = require('../checks/checks-runtime.js');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };
const VERBOSE = argv.includes('--verbose');
const SAMPLE = parseInt(arg('--sample', '24'), 10);
const NAMED = arg('--repos', '');
const OWNER = process.env.GITHUB_USERNAME || 'moses-y';
const TOKEN = process.env.GITHUB_TOKEN;
const RUNTIME_IDS = hygiene.CHECKS.filter(c => c.category === 'runtime').map(c => c.id);

async function tree(name) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${name}/git/trees/HEAD?recursive=1`,
    { headers: Object.assign({ 'User-Agent': 'measure' }, TOKEN ? { Authorization: 'token ' + TOKEN } : {}),
      signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const j = await res.json();
  return j.tree ? j.tree.filter(t => t.type === 'blob').map(t => ({ path: t.path, size: t.size || 0 })) : null;
}

async function raw(name, p) {
  const enc = p.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`https://raw.githubusercontent.com/${OWNER}/${name}/HEAD/${enc}`,
    { headers: { 'User-Agent': 'measure' }, signal: AbortSignal.timeout(20000) });
  return res.ok ? res.text() : null;
}

function pickSample(forks) {
  if (NAMED) return NAMED.split(',').map(s => s.trim()).filter(Boolean);
  // A spread rather than the first N: the owner's own repos are where reach is 1
  // and a false positive costs the most, and the language mix decides which rules
  // are exercised at all.
  const own = forks.filter(f => f.type === 'original');
  const py = forks.filter(f => f.language === 'Python' && f.type !== 'original');
  const node = forks.filter(f => /JavaScript|TypeScript/.test(f.language || '') && f.type !== 'original');
  const out = [];
  const take = (arr, n) => { for (const f of arr.slice(0, n)) if (!out.includes(f.name)) out.push(f.name); };
  take(own, Math.ceil(SAMPLE * 0.4));
  take(py, Math.ceil(SAMPLE * 0.35));
  take(node, Math.ceil(SAMPLE * 0.25));
  return out.slice(0, SAMPLE);
}

async function main() {
  const forks = JSON.parse(fs.readFileSync('forks.json', 'utf8')).forks;
  const byName = new Map(forks.map(f => [f.name, f]));
  const names = pickSample(forks);

  const fired = {};
  for (const id of RUNTIME_IDS) fired[id] = [];
  let audited = 0, noConfig = 0;

  for (const name of names) {
    const files = await tree(name);
    if (!files) { console.log(`  ${name}: unreachable`); continue; }
    const f = byName.get(name) || {};

    // The selector itself decides what to read, rather than a copy of its rules
    // living here: a harness that measures a different file set than the pipeline
    // uses is measuring nothing. Selection is pure, so it runs first, against a
    // context that cannot read.
    const texts = new Map();
    const mkCtx = () => hygiene.makeContext({
      tree: files,
      readFile: p => (texts.has(p) ? texts.get(p) : null),
      kg: f.knowledgeGraph, isOriginal: f.type === 'original', repoId: f.id, readBudget: 99
    });
    const chosen = require('../checks/checks-runtime.js').selectPaths(mkCtx());
    if (!chosen.length) noConfig++;
    for (const p of chosen) texts.set(p, await raw(name, p));

    const found = hygiene.audit(mkCtx(), { repoId: f.id, only: RUNTIME_IDS });
    audited++;
    for (const hit of found) fired[hit.id].push({ repo: name, where: hit.where, evidence: hit.evidence });
    if (VERBOSE) {
      console.log(`  ${name} (${chosen.length} config files): ${found.length ? found.map(x => x.id).join(', ') : 'clean'}`);
    }
  }

  console.log(`\n=== runtime checks over ${audited} repos (${noConfig} had no config-shaped file) ===`);
  const rows = RUNTIME_IDS.map(id => ({ id, n: fired[id].length })).sort((a, b) => b.n - a.n);
  for (const r of rows) {
    const pct = audited ? Math.round(100 * r.n / audited) : 0;
    const flag = pct >= 60 ? '  <-- fires on most repos, downgrade or tighten' : '';
    console.log(`  ${String(pct).padStart(3)}%  ${String(r.n).padStart(2)}/${audited}  ${r.id}${flag}`);
    for (const h of fired[r.id].slice(0, 3)) {
      console.log(`         ${h.repo}: ${h.where} - ${h.evidence}`);
    }
  }
  const total = rows.reduce((s, r) => s + r.n, 0);
  console.log(`\n  ${total} findings, ${audited ? (total / audited).toFixed(1) : 0} per repo`);
}

main().catch(e => { console.error(e); process.exit(1); });
