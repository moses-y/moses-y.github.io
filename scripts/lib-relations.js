#!/usr/bin/env node
/*
 * lib-relations.js - the two ways one repository relates to another.
 *
 * The estate already carried 3,444 semantic similarity edges, and they were
 * drawn on a canvas and then thrown away. Nothing could answer "what else is
 * like this?" without loading a 774 KB index and re-deriving the answer, which
 * is a question a person asks constantly and an agent cannot afford to ask at
 * all.
 *
 * Two edge types, because they say different things and only the pair is useful:
 *
 *   semantic  cosine similarity of the embedding. "Solves the same problem."
 *   stack     shared declared dependencies, IDF-weighted. "Built the way you
 *             build things."
 *
 * The weighting matters. Sharing `react` is worth almost nothing because half
 * the estate shares it; sharing `duckdb-engine` is worth a great deal. So each
 * package is weighted by ln(N/df) and the pair score is the cosine of the two
 * IDF vectors, which normalises out the repository that simply declares three
 * hundred dependencies and would otherwise be everybody's neighbour.
 */
'use strict';

const CLUSTER_AT = 0.68;      // the threshold the graph already treats as "kin"
const MAX_DF_SHARE = 0.25;    // a package in a quarter of the estate is furniture
const MIN_STACK = 0.12;       // below this the shared stack is coincidence
const KIN_LIMIT = 12;         // per repository, per edge type

// ---- semantic ------------------------------------------------------------

/*
 * Union-find over the edges at or above the threshold. Single-link clustering
 * is the honest choice here: the claim being made is "these are reachable from
 * each other by strong similarity", not "these are all mutually similar", and a
 * tighter method would silently drop the chains that are exactly what a
 * consolidation queue wants to see.
 */
function cluster(links, at) {
  const parent = new Map();
  const find = x => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const [a, b, sim] of links) if (sim >= at) union(a, b);

  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

function nearestByRepo(links, limit) {
  const by = new Map();
  const push = (a, b, sim) => {
    if (!by.has(a)) by.set(a, []);
    by.get(a).push([b, sim]);
  };
  for (const [a, b, sim] of links) { push(a, b, sim); push(b, a, sim); }
  for (const [id, rows] of by) {
    rows.sort((x, y) => y[1] - x[1]);
    by.set(id, rows.slice(0, limit));
  }
  return by;
}

// ---- stack ---------------------------------------------------------------

function packageSets(depsRepos) {
  const sets = new Map();
  for (const id of Object.keys(depsRepos)) {
    const eco = depsRepos[id] || {};
    const names = new Set();
    for (const key of Object.keys(eco)) {
      for (const entry of eco[key] || []) {
        const name = Array.isArray(entry) ? entry[0] : entry;
        if (name) names.add(key + ':' + String(name).toLowerCase().trim());
      }
    }
    if (names.size) sets.set(Number(id), names);
  }
  return sets;
}

/*
 * Candidate pairs come from an inverted package -> repositories index, so the
 * only pairs scored are ones that actually share something. Packages above the
 * document-frequency ceiling are skipped before that: they contribute nearly
 * nothing to the score and would generate hundreds of thousands of pairs to say
 * so.
 */
function stackEdges(sets, opts) {
  const o = opts || {};
  const maxDfShare = o.maxDfShare == null ? MAX_DF_SHARE : o.maxDfShare;
  const min = o.min == null ? MIN_STACK : o.min;
  const limit = o.limit == null ? KIN_LIMIT : o.limit;

  const N = sets.size;
  const postings = new Map();
  for (const [id, names] of sets) {
    for (const p of names) {
      if (!postings.has(p)) postings.set(p, []);
      postings.get(p).push(id);
    }
  }

  const idf = new Map();
  const norm = new Map();
  for (const [p, repos] of postings) {
    const w = Math.log(N / repos.length);
    idf.set(p, w);
  }
  for (const [id, names] of sets) {
    let sum = 0;
    for (const p of names) { const w = idf.get(p); sum += w * w; }
    norm.set(id, Math.sqrt(sum) || 1);
  }

  const dfCap = Math.max(2, Math.floor(N * maxDfShare));
  const pairs = new Map();
  const shared = new Map();
  for (const [p, repos] of postings) {
    if (repos.length < 2 || repos.length > dfCap) continue;
    const w = idf.get(p);
    const ww = w * w;
    for (let i = 0; i < repos.length; i++) {
      for (let j = i + 1; j < repos.length; j++) {
        const key = repos[i] < repos[j] ? repos[i] + '|' + repos[j] : repos[j] + '|' + repos[i];
        pairs.set(key, (pairs.get(key) || 0) + ww);
        if (!shared.has(key)) shared.set(key, []);
        shared.get(key).push([p, w]);
      }
    }
  }

  const by = new Map();
  const push = (a, b, score, names) => {
    if (!by.has(a)) by.set(a, []);
    by.get(a).push({ id: b, weight: +score.toFixed(3), shared: names });
  };
  for (const [key, dot] of pairs) {
    const [a, b] = key.split('|').map(Number);
    const score = dot / (norm.get(a) * norm.get(b));
    if (score < min) continue;
    // The evidence, not just the number: the packages that carried the most
    // weight, so a reader can see why the two were linked and disagree.
    const names = (shared.get(key) || []).sort((x, y) => y[1] - x[1])
      .slice(0, 6).map(x => x[0]);
    push(a, b, score, names);
    push(b, a, score, names);
  }
  for (const [id, rows] of by) {
    rows.sort((x, y) => y.weight - x.weight);
    by.set(id, rows.slice(0, limit));
  }
  return by;
}

module.exports = {
  cluster, nearestByRepo, packageSets, stackEdges,
  CLUSTER_AT, MAX_DF_SHARE, MIN_STACK, KIN_LIMIT
};
