/*
 * lib-facts.js - the measured facts, formatted for the prompt.
 *
 * The briefing prompt was assembled from repo metadata, a file tree and a README
 * excerpt. It could not see anything the deterministic pipeline produces, so its
 * "Code Health & Issues" section asked the model to infer defects from a
 * directory listing while a ranked list of measured findings sat in a file
 * beside it.
 *
 * Four sources, all already on disk and all optional:
 *   structure/<id>.deep.json  module graph, coupling, cycles, ranked findings
 *   data/symbols-index.json   real function and class names with locations
 *   data/deps.json            declared packages per repo
 *   data/registry.json        current published version per package
 *
 * Everything is budgeted. A repo can carry 1,459 modules and 1,326 findings; the
 * prompt has to stay small enough that the README and the instructions still fit,
 * so each section is capped and the cap is stated in the text rather than
 * silently truncating.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_HUBS = 8;
const MAX_FINDINGS = 14;
const MAX_SYMBOLS = 16;
const MAX_STALE = 8;

let SYMBOLS = null;      // lazily built id -> {fns, classes, names[]}
let DEPS = null;
let REGISTRY = null;

function readJson(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; }
}

// The global symbol index is one flat array of 300k+ entries, so it is grouped
// once per process rather than scanned per repo.
function symbolsFor(id) {
  if (SYMBOLS === null) {
    SYMBOLS = new Map();
    const idx = readJson(path.join('data', 'symbols-index.json'), null);
    for (const s of (idx && idx.s) || []) {
      const key = String(s[2]);
      let e = SYMBOLS.get(key);
      if (!e) { e = { fns: 0, classes: 0, names: [] }; SYMBOLS.set(key, e); }
      if (s[1] === 1) e.classes++; else e.fns++;
      if (e.names.length < MAX_SYMBOLS * 3) e.names.push(s[0]);
    }
  }
  return SYMBOLS.get(String(id)) || null;
}

const majorOf = v => {
  const m = String(v || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

function depsFor(id) {
  if (DEPS === null) DEPS = readJson(path.join('data', 'deps.json'), { repos: {} });
  if (REGISTRY === null) REGISTRY = readJson(path.join('data', 'registry.json'), {});
  const entry = (DEPS.repos || {})[String(id)];
  if (!entry) return null;
  let total = 0;
  const stale = [];
  for (const [eco, pkgs] of Object.entries(entry)) {
    for (const p of pkgs) {
      total++;
      const name = Array.isArray(p) ? p[0] : p;
      const spec = Array.isArray(p) ? p[1] : null;
      const reg = REGISTRY[eco + ':' + name];
      const declared = majorOf(spec), latest = reg ? majorOf(reg.v) : null;
      if (declared !== null && latest !== null && latest > declared) {
        stale.push({ name, spec, latest: reg.v, behind: latest - declared });
      }
    }
  }
  if (!total) return null;
  stale.sort((a, b) => b.behind - a.behind);
  return { total, stale };
}

// Returns a prompt-ready block, or '' when nothing has been measured yet. The
// caller must treat absence as normal: analysis lags the feed by design.
function factsFor(repo, kg) {
  const id = repo && repo.id;
  if (id == null) return '';
  const deep = readJson(path.join('structure', id + '.deep.json'), null);
  const sym = symbolsFor(id);
  const deps = depsFor(id);
  if (!deep && !sym && !deps) return '';

  const out = [];

  if (deep && deep.totals) {
    const t = deep.totals, sev = t.severity || {}, scope = deep.scope || {};
    out.push('IMPORT GRAPH (resolved from source, not inferred):');
    out.push(`  ${t.modules || 0} internal modules, ${t.edges || 0} import edges, ` +
      `${t.cycles || 0} modules inside circular dependencies.`);
    if (scope.analyzed) {
      const langs = scope.languages
        ? Object.entries(scope.languages).map(([l, n]) => `${l} ${n}`).join(', ') : '';
      out.push(`  Analyzed ${scope.analyzed} of ${scope.discovered || scope.analyzed} code files${langs ? ' (' + langs + ')' : ''}.`);
    }

    const hubs = (deep.nodes || []).filter(n => n.kind === 'module')
      .sort((a, b) => ((b.ca || 0) + (b.ce || 0)) - ((a.ca || 0) + (a.ce || 0)))
      .slice(0, MAX_HUBS);
    if (hubs.length) {
      out.push('');
      out.push(`MOST CONNECTED MODULES (Ca = modules importing it, Ce = modules it imports):`);
      for (const n of hubs) {
        out.push(`  ${n.full || n.name}  Ca ${n.ca || 0}  Ce ${n.ce || 0}` +
          (n.inst != null ? `  instability ${n.inst}` : '') + (n.cycle ? '  IN CYCLE' : ''));
      }
    }

    // Findings repeat heavily: a repo with 379 modules in cycles emits 379
    // near-identical "Import cycle member" entries. Listing them one by one
    // burned prompt budget to say the same thing, so distinct kinds are grouped
    // and counted, with a few real files as evidence.
    const groups = new Map();
    for (const x of (deep.findings || [])) {
      const kind = String(x.title || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const key = (x.category || '-') + '|' + kind;
      let g = groups.get(key);
      if (!g) {
        g = { kind, category: x.category, severity: x.severity, n: 0,
              files: [], evidence: x.evidence, fix: x.recommendation, rank: x.rank || 0 };
        groups.set(key, g);
      }
      g.n++;
      if (x.file && g.files.length < 3) g.files.push(x.file);
      if ((x.rank || 0) > g.rank) g.rank = x.rank || 0;
      // Keep the worst severity seen for the kind.
      if (x.severity === 'high') g.severity = 'high';
      else if (x.severity === 'medium' && g.severity !== 'high') g.severity = 'medium';
    }
    const kinds = [...groups.values()].sort((a, b) => b.rank - a.rank);
    if (kinds.length) {
      out.push('');
      out.push(`MEASURED FINDINGS - ${t.findings || 0} total ` +
        `(${sev.high || 0} high, ${sev.medium || 0} medium, ${sev.low || 0} low), ` +
        `${kinds.length} distinct kinds:`);
      for (const g of kinds.slice(0, MAX_FINDINGS)) {
        out.push(`  [${String(g.severity || 'low').toUpperCase()}/${g.category || '-'}] ${g.kind}` +
          (g.n > 1 ? ` x${g.n}` : ''));
        if (g.files.length) out.push(`      files: ${g.files.join(', ')}`);
        // For a group the evidence is one member's, so it is labelled as such.
        if (g.evidence) out.push(`      ${g.n > 1 ? 'example ' : ''}evidence: ${g.evidence}`);
        if (g.fix) out.push(`      fix: ${g.fix}`);
      }
    }
  }

  if (sym) {
    out.push('');
    out.push(`NAMED SYMBOLS (parsed with tree-sitter): ${sym.fns} functions, ${sym.classes} classes.`);
    // __init__ and __call__ appear in almost every file and say nothing about
    // what the repo does.
    const names = [...new Set(sym.names)]
      .filter(n => !/^__/.test(n)).slice(0, MAX_SYMBOLS);
    if (names.length) out.push(`  Examples: ${names.join(', ')}`);
  }

  // The model invented "no LICENSE file" for a repo that has one, because these
  // were measured but never shown to it. State them rather than leave a gap.
  if (kg) {
    const h = kg.codeHealth || {};
    const yn = v => (v ? 'yes' : 'no');
    out.push('');
    out.push('REPOSITORY HYGIENE (detected, do not contradict):');
    out.push(`  tests present: ${yn(h.hasTests)} | CI: ${yn(kg.hasCI)}${kg.hasCI && kg.ciPlatform ? ' (' + kg.ciPlatform + ')' : ''}` +
      ` | Dockerfile: ${yn(kg.hasDocker)} | licence: ${yn(h.hasLicense)}` +
      ` | lockfile: ${yn(h.hasLockfile)} | committed secrets: ${h.committedSecrets ? 'YES' : 'none found'}`);
    // The file tree is capped at 200 entries, so a count of exactly 200 is a
    // floor rather than a total, and test detection over that tree can miss a
    // test directory the import graph clearly contains.
    if ((kg.totalFiles || 0) >= 200) {
      out.push('  Note: the file listing is capped at 200 entries, so treat file counts as "at least".');
    }
  }

  if (deps) {
    out.push('');
    out.push(`DECLARED DEPENDENCIES: ${deps.total} packages.`);
    if (deps.stale.length) {
      out.push(`  ${deps.stale.length} behind the current published major version:`);
      for (const s of deps.stale.slice(0, MAX_STALE)) {
        out.push(`    ${s.name} declared ${s.spec || '?'}, current ${s.latest} (${s.behind} major behind)`);
      }
    } else {
      out.push('  None are behind a published major version.');
    }
  }

  return out.join('\n');
}

module.exports = { factsFor };
