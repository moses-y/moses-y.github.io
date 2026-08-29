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
 *   data/symbols/<id>.json    real function and class names with locations
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
const { flowFor } = require('./lib-flow.js');

const MAX_HUBS = 8;
const MAX_FINDINGS = 14;
const MAX_SYMBOLS = 16;
const MAX_STALE = 8;
const MAX_PROJECTS = 18;
const MAX_HYGIENE = 10;
const MAX_FANIN = 12;
const MAX_EDGES = 14;

let HYGIENE = null;
let SYMBOLS = null;      // lazily built id -> {fns, classes, names[]}
let DEPS = null;
let REGISTRY = null;

function readJson(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; }
}

/*
 * One repository's functions and classes, read from the file that holds exactly
 * that repository's functions and classes.
 *
 * This used to parse data/symbols-index.json - a single flat array of 1.26
 * million entries, 97 MB - and group it by repository id, to answer a question
 * about one repository. The grouping it performed was undoing a split that
 * build-symbols had already done: data/symbols/<id>.json is the same symbols,
 * already separated, already committed.
 *
 * So the index was a second copy of 181 MB of data, derived from it by
 * concatenation, costing a 97 MB parse and a resident Map on every build. It is
 * no longer written or read.
 */
function symbolsFor(id) {
  const key = String(id);
  if (SYMBOLS === null) SYMBOLS = new Map();
  if (SYMBOLS.has(key)) return SYMBOLS.get(key);

  const j = readJson(path.join('data', 'symbols', key + '.json'), null);
  let e = null;
  if (j && Array.isArray(j.symbols)) {
    e = { fns: 0, classes: 0, names: [] };
    for (const s of j.symbols) {
      if (s.k === 'class') e.classes++; else e.fns++;
      // The same cap the flat index applied, kept so the sample of names an
      // article draws on does not change with this file.
      //
      // File and line are carried through now. They were already on disk -
      // every record in data/symbols/<id>.json is {n, k, f, l} - and this
      // function kept only the name, which is why the header above promises
      // "names with locations" and the prompt could never deliver one.
      // A symbol the model cannot locate is a symbol it cannot cite, and to a
      // reader an uncitable fact is indistinguishable from an invented one.
      if (e.names.length < MAX_SYMBOLS * 3) {
        e.names.push({ n: s.n, k: s.k, f: s.f || null, l: s.l || null });
      }
    }
  }
  SYMBOLS.set(key, e);
  return e;
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

// The code-health audit: actionable findings, already ranked by severity times
// confidence times production reach. Descriptive findings say a file is deeply
// nested; these say what to do before shipping, which is what the health section
// of a briefing should be reporting.
function hygieneFor(id) {
  if (HYGIENE === null) HYGIENE = readJson(path.join('data', 'hygiene.json'), { repos: {} });
  const e = (HYGIENE.repos || {})[String(id)];
  return e && e.findings && e.findings.length ? e : null;
}

// Returns a prompt-ready block, or '' when nothing has been measured yet. The
// caller must treat absence as normal: analysis lags the feed by design.
function factsFor(repo, kg) {
  const id = repo && repo.id;
  if (id == null) return '';
  const deep = readJson(path.join('structure', id + '.deep.json'), null);
  const sym = symbolsFor(id);
  const deps = depsFor(id);
  const hyg = hygieneFor(id);
  if (!deep && !sym && !deps && !hyg) return '';

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

  // The internal call graph. This is the difference between "which module ripples
  // widest" and "which function breaks what", and it is the part a reader needs to
  // understand how the thing is wired rather than how it is filed.
  const perRepo = readJson(path.join('data', 'symbols', id + '.json'), null);
  if (perRepo && perRepo.calls && perRepo.calls.length) {
    const fanIn = Object.entries(perRepo.fanIn || {}).slice(0, MAX_FANIN);
    out.push('');
    out.push(`INTERNAL CALL GRAPH: ${perRepo.calls.length} resolved call edges between functions ` +
      'defined in this repository. Edges to libraries and to unresolvable method calls are excluded, ' +
      'so this is the code calling itself.');
    if (fanIn.length) {
      out.push('  Called from the most distinct places (change these and the most breaks):');
      for (const [name, n] of fanIn) out.push(`    ${name} - called from ${n} places`);
    }
    const sample = perRepo.calls.filter(c => c[0] !== '<module>').slice(0, MAX_EDGES);
    if (sample.length) {
      out.push('  Representative edges (caller -> callee, times):');
      for (const [from, to, n] of sample) out.push(`    ${from} -> ${to}${n > 1 ? ' x' + n : ''}`);
    }
  }

  /*
   * Where execution starts, what it ends up touching, and what each file is for.
   * This is the part a reader actually came for: a call graph says which functions
   * call which, and it still does not say where the program begins or that a CLI
   * flag ends up in a database write two calls later.
   */
  const flow = perRepo ? flowFor(perRepo) : null;
  if (flow) {
    if (flow.entries.length) {
      out.push('');
      out.push('ENTRY POINTS (where execution starts, by name, file and how much of the program each reaches):');
      for (const e of flow.entries) {
        out.push(`    ${e.name}  ${e.file}:${e.line}  reaches ${e.reach} function(s)` +
          `${e.calledBy ? `, itself called from ${e.calledBy} place(s)` : ', called by nothing else in the repo'}`);
      }
    }
    const kinds = Object.entries(flow.effectTotals || {});
    if (kinds.length) {
      out.push('');
      out.push('WHAT THIS CODE TOUCHES OUTSIDE ITSELF: ' +
        kinds.map(([k, n]) => `${n} function(s) ${flow.meaning[k] || k}`).join('; ') + '.');
    }
    if (flow.paths.length) {
      out.push('  Traced paths from an entry point to the call that leaves the process:');
      for (const p of flow.paths) {
        const ev = Object.entries(p.examples).map(([k, v]) => `${k} via ${v}`).join(', ');
        out.push(`    ${p.chain.join(' -> ')}  [${ev}]`);
      }
      out.push('  These are shortest paths over resolved edges. A route through a framework ' +
        'callback is invisible here, because the framework calling a handler is not an edge in the source.');
    }
    if (flow.roles.length) {
      out.push('');
      out.push('WHAT EACH FILE IS RESPONSIBLE FOR (ranked by how much routes through it, not by size):');
      for (const r of flow.roles) {
        const bits = [];
        if (r.functions.length) bits.push(`${r.functions.length} function(s)`);
        if (r.classes.length) bits.push(`${r.classes.length} class(es)/type(s)`);
        if (r.inbound) bits.push(`called from ${r.inbound} other file(s)`);
        if (r.outbound) bits.push(`calls into ${r.outbound}`);
        const eff = Object.keys(r.effects);
        if (eff.length) bits.push(eff.map(k => flow.meaning[k] || k).join(' and '));
        const named = r.functions.concat(r.classes).slice(0, 5).join(', ');
        out.push(`    ${r.file} - ${bits.join(', ')}${named ? `. Defines ${named}` : ''}`);
      }
    }
  }

  if (sym) {
    out.push('');
    out.push(`NAMED SYMBOLS (parsed with tree-sitter): ${sym.fns} functions, ${sym.classes} classes.`);
    // __init__ and __call__ appear in almost every file and say nothing about
    // what the repo does.
    // Deduped by name, then rendered one per line as name (kind) - file:line,
    // so a claim about a symbol can be checked against the repository rather
    // than taken on trust.
    const seen = new Set();
    const picked = [];
    for (const sm of sym.names) {
      if (/^__/.test(sm.n) || seen.has(sm.n)) continue;
      seen.add(sm.n);
      picked.push(sm);
      if (picked.length >= MAX_SYMBOLS) break;
    }
    if (picked.length) {
      out.push('  Examples (name, kind, location):');
      for (const sm of picked) {
        const where = sm.f ? sm.f + (sm.l ? ':' + sm.l : '') : 'location not recorded';
        out.push('    ' + sm.n + ' (' + sm.k + ') - ' + where);
      }
    }
  }

  // Some repos are a shelf of separate projects, not one codebase. Told to
  // describe "the architecture" of 29 unrelated projects, the model can only
  // generalise, which is what made these briefings say nothing.
  if (kg && (kg.subProjects || []).length) {
    const sp = kg.subProjects;
    out.push('');
    if (kg.isCollection) {
      out.push(`THIS REPOSITORY IS A COLLECTION of ${sp.length} self-contained projects, not one codebase.`);
      out.push('  Describe it as a portfolio: what the projects cover, the techniques recurring across');
      out.push('  them, and name the substantial ones. Do not invent a single architecture for it.');
    } else {
      out.push(`PROJECTS INSIDE THIS REPOSITORY (${sp.length}):`);
    }
    for (const g of sp.slice(0, MAX_PROJECTS)) {
      const bits = [`${g.files} files`];
      if (g.notebooks) bits.push(`${g.notebooks} notebook${g.notebooks === 1 ? '' : 's'}`);
      if (g.code) bits.push(`${g.code} code file${g.code === 1 ? '' : 's'}`);
      if (g.data) bits.push(`${g.data} data file${g.data === 1 ? '' : 's'}`);
      out.push(`  ${g.name} - ${bits.join(', ')}`);
    }
    if (sp.length > MAX_PROJECTS) out.push(`  ... and ${sp.length - MAX_PROJECTS} more`);
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
    // Exactly 200 is the fingerprint of the old cap; a real total rarely lands there.
    if ((kg.totalFiles || 0) === 200) {
      out.push('  Note: this count predates the removal of a 200-file cap, so read it as "at least 200".');
    }
  }

  if (hyg) {
    const sev = hyg.totals.severity;
    out.push('');
    out.push(`CODE HEALTH AUDIT - ${hyg.totals.total} findings ` +
      `(${sev.critical} critical, ${sev.high} high, ${sev.medium} medium, ${sev.low} low), ` +
      'ranked by severity, confidence and production reach. Report these as the health section; ' +
      'each already carries its own fix, so do not invent alternatives:');
    for (const f of hyg.findings.slice(0, MAX_HYGIENE)) {
      out.push(`  [${f.severity.toUpperCase()}] ${f.title}` + (f.where ? ` - ${f.where}` : ''));
      if (f.evidence) out.push(`      evidence: ${f.evidence}`);
      out.push(`      why it matters: ${f.why}`);
      out.push(`      fix: ${f.fix}`);
    }
    if (hyg.findings.length > MAX_HYGIENE) out.push(`  ... and ${hyg.findings.length - MAX_HYGIENE} lower-ranked findings`);
    if (hyg.truncated) out.push('  Note: the file listing was truncated, so absence of a finding is not proof of its absence.');
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
