/*
 * lib-flow.js - entry points, the paths from them to the sinks, and what each
 * file is responsible for.
 *
 * The call graph says which functions call which. That is a fact about structure,
 * and a reader who wants to understand a repository asks a different question:
 * where does execution start, and what does it end up touching. A path from
 * main() through three functions to cursor.execute() answers "how does a request
 * reach the database" in one line, and no amount of coupling metrics does.
 *
 * Everything here is derived from data/symbols/<id>.json - the symbols, the
 * resolved internal call edges, and the effects recorded per function - so it
 * costs no requests and no model calls. Nothing is inferred that the data does
 * not support: a repository with no call edges yields no paths rather than a
 * plausible guess.
 *
 * The honest limits, which the fact block states rather than hides:
 *   - Edges resolve by name. Two functions with the same name in different files
 *     are one node, so a path can be real in shape while wrong in detail.
 *   - Only calls whose target is defined in the repository are edges, so a path
 *     through a framework callback is invisible: Flask calling a route handler is
 *     not an edge anyone can see from the source.
 *   - Effects are classified by receiver text, so a database reached through a
 *     repo's own wrapper is attributed to the wrapper.
 */
'use strict';
const { MEANING } = require('./lib-effects.js');

const MAX_PATHS = 8;
const MAX_PATH_LEN = 6;
const MAX_ENTRIES = 6;
const MAX_FILE_ROLES = 12;

// Names that mean "execution starts here" across every language in the estate.
const ENTRY_NAMES = /^(main|__main__|run|start|serve|cli|app|handler|handle|lambda_handler|execute|dispatch|bootstrap|init|setup|entrypoint|new_main)$/i;
// Files that mean the same thing, which is a stronger signal than the name: a
// function called run() in utils.py is a helper, in cli.py it is the program.
const ENTRY_FILES = /(^|\/)(main|__main__|cli|index|server|app|serve|run|bin|daemon|worker|handler|lambda_function)\.[a-z]+$|^(bin|cmd)\//i;

function baseName(file) {
  return String(file || '').split('/').pop();
}

/*
 * The call graph as adjacency, plus the reverse, both keyed by function name.
 * Names rather than name+file because that is what the edges record; see the
 * limits above.
 */
function buildGraph(calls) {
  const out = new Map();
  const inDeg = new Map();
  for (const [from, to] of calls || []) {
    if (!out.has(from)) out.set(from, new Set());
    out.get(from).add(to);
    inDeg.set(to, (inDeg.get(to) || 0) + 1);
  }
  return { out, inDeg };
}

// How many distinct functions this one can reach. Used to rank entry candidates:
// of two functions that both look like entry points, the one that drives more of
// the program is the one worth naming.
function reachOf(graph, start, limit) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length && seen.size < (limit || 400)) {
    const cur = queue.shift();
    for (const next of graph.out.get(cur) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size - 1;
}

// Constructors and dunders are not ways into a program, and because edges resolve
// by name they are also the worst possible candidates: every __init__ in the repo
// collapses into one node, so it inherits the reach of all of them at once. On
// hummingbot that put six identical __init__ rows at the top, each claiming to
// reach 409 functions.
const NOT_ENTRY = /^(__\w+__|new|constructor|setup_class|teardown|__init__)$/;

function findEntryPoints(symbols, graph) {
  const fns = symbols.filter(s => s.k === 'function');
  const scored = [];
  for (const s of fns) {
    if (NOT_ENTRY.test(s.n)) continue;
    const named = ENTRY_NAMES.test(s.n);
    const located = ENTRY_FILES.test(s.f);
    // A name or a location is required, not merely a large reach. Reach alone
    // describes the most connected function in the graph, which is usually a
    // utility everything funnels through - the opposite of an entry point.
    if (!named && !located) continue;
    const reasons = [];
    if (named) reasons.push('named ' + s.n);
    if (located) reasons.push('in ' + baseName(s.f));
    // A function nothing else calls is a root of the graph: either an entry point
    // or dead code, and the reach below tells those apart.
    const calledBy = graph.inDeg.get(s.n) || 0;
    const reach = reachOf(graph, s.n);
    if (!reach) continue;                       // reaches nothing: not a way in
    let score = (named ? 40 : 0) + (located ? 35 : 0) + (calledBy ? 0 : 15) + Math.min(30, reach);
    scored.push({ name: s.n, file: s.f, line: s.l, reach, calledBy, score, why: reasons.join(', ') });
  }
  // One row per name. Edges collapse same-named functions into a single node, so
  // listing six files for one name repeats one graph fact six times.
  const byName = new Map();
  for (const e of scored.sort((a, b) => b.score - a.score || b.reach - a.reach)) {
    if (!byName.has(e.name)) byName.set(e.name, e);
  }
  return [...byName.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_ENTRIES);
}

/*
 * The shortest path from an entry point to a function with a recorded effect.
 * Shortest rather than every path, because the point is to show that the route
 * exists and how short it is: a database write two calls from the CLI is a
 * different program from one buried eight layers down.
 */
function pathToEffect(graph, start, effects) {
  const prev = new Map([[start, null]]);
  const queue = [start];
  let depth = new Map([[start, 0]]);
  while (queue.length) {
    const cur = queue.shift();
    const d = depth.get(cur);
    const eff = effects[cur];
    if (eff && cur !== start) {
      const chain = [];
      for (let n = cur; n; n = prev.get(n)) chain.unshift(n);
      return { chain, effects: eff };
    }
    if (d >= MAX_PATH_LEN) continue;
    for (const next of graph.out.get(cur) || []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      depth.set(next, d + 1);
      queue.push(next);
    }
  }
  // The entry point itself may be the sink.
  if (effects[start]) return { chain: [start], effects: effects[start] };
  return null;
}

/*
 * One path per entry point, then deduplicated by the sink reached, because eight
 * entry points that all funnel into the same write are one fact about the program
 * and eight lines of noise in a prompt.
 */
function tracePaths(entries, graph, effects) {
  const out = [];
  const seenSinks = new Set();
  for (const e of entries) {
    const p = pathToEffect(graph, e.name, effects);
    if (!p) continue;
    const sink = p.chain[p.chain.length - 1];
    const kinds = Object.keys(p.effects).sort().join(',');
    const key = sink + '|' + kinds;
    if (seenSinks.has(key)) continue;
    seenSinks.add(key);
    out.push({
      entry: e.name,
      entryFile: e.file,
      chain: p.chain,
      sink,
      kinds: Object.keys(p.effects),
      examples: p.effects
    });
    if (out.length >= MAX_PATHS) break;
  }
  return out;
}

/*
 * What each file is responsible for, derived rather than described: the symbols
 * it defines, whether other files call into it, what it calls out to, and which
 * effects happen inside it. A reader wants a map, and a directory listing is not
 * one.
 */
function fileRoles(symbols, calls, effects) {
  const fileOfSymbol = new Map();
  const byFile = new Map();
  for (const s of symbols) {
    if (!fileOfSymbol.has(s.n)) fileOfSymbol.set(s.n, s.f);
    let f = byFile.get(s.f);
    if (!f) {
      f = { file: s.f, functions: [], classes: [], inbound: 0, outbound: 0, effects: {},
        // Distinct files rather than call counts: being called five times by one
        // function is one dependent, and counting volume ranked a string helper
        // above the module that owns the database.
        callers: new Set(), callees: new Set() };
      byFile.set(s.f, f);
    }
    (s.k === 'class' ? f.classes : f.functions).push(s.n);
  }
  for (const [from, to, n] of calls || []) {
    const src = fileOfSymbol.get(from);
    const dst = fileOfSymbol.get(to);
    if (!dst || src === dst) continue;          // a call within one file says nothing about its role
    const d = byFile.get(dst);
    if (d && src) d.callers.add(src);
    if (src && byFile.has(src)) byFile.get(src).callees.add(dst);
  }
  for (const [fn, kinds] of Object.entries(effects || {})) {
    const file = fileOfSymbol.get(fn);
    if (!file || !byFile.has(file)) continue;
    for (const k of Object.keys(kinds)) byFile.get(file).effects[k] = true;
  }
  return [...byFile.values()]
    // Ranked by how much of the program routes through the file, not by size: a
    // 40-line module every other file calls matters more than a 900-line one
    // nothing calls.
    .map(f => Object.assign(f, {
      inbound: f.callers.size,
      outbound: f.callees.size,
      // An effect outweighs a dependent: a file that writes to the database is
      // where the behaviour is, and that is what a reader is looking for.
      weight: f.callers.size * 4 + f.callees.size + f.functions.length + f.classes.length * 2 +
        Object.keys(f.effects).length * 8
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_FILE_ROLES)
    .map(f => ({ file: f.file, functions: f.functions, classes: f.classes,
      inbound: f.inbound, outbound: f.outbound, effects: f.effects, weight: f.weight }));
}

// The whole analysis for one repo's symbol file, or null when the data cannot
// support any of it.
function flowFor(sym) {
  if (!sym || !Array.isArray(sym.symbols) || !sym.symbols.length) return null;
  const calls = sym.calls || [];
  /*
   * Null-prototype, because the keys are function names read out of source and
   * pathToEffect tests them with effects[name]. A JS class declares constructor,
   * so effects['constructor'] would return the inherited Function and the trace
   * would report an effect the repository does not have. Same root cause as the
   * fanIn crash in build-symbols, but silent: a fabricated path rather than a
   * throw. Object.keys/values/entries behave identically on a null prototype.
   */
  const effects = Object.assign(Object.create(null), sym.effects || {});
  const graph = buildGraph(calls);
  const entries = findEntryPoints(sym.symbols, graph);
  const paths = calls.length ? tracePaths(entries, graph, effects) : [];
  const roles = fileRoles(sym.symbols, calls, effects);
  const effectTotals = {};
  for (const kinds of Object.values(effects)) {
    for (const k of Object.keys(kinds)) effectTotals[k] = (effectTotals[k] || 0) + 1;
  }
  if (!entries.length && !paths.length && !roles.length) return null;
  return { entries, paths, roles, effectTotals, meaning: MEANING };
}

module.exports = { flowFor, findEntryPoints, buildGraph, fileRoles, tracePaths };
