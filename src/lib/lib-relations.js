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

/*
 * Louvain modularity clustering over the same thresholded edges.
 *
 * cluster() above is honest about what it computes and the computation is the
 * wrong one. Connected components ask "is there a path of strong links between
 * these two", and the answer is yes far too often: one repository that happens
 * to sit between two unrelated neighbourhoods welds them into a single group of
 * twenty, which then has to carry a paragraph of warning explaining that it is
 * not what it looks like. Modularity asks a better question - are these two
 * linked more densely to each other than chance would predict - so a bridge
 * node joins whichever side it is more tied to instead of merging both.
 *
 * Same edge list, same threshold, so every group this returns is a subset of
 * some group cluster() returns. It is a refinement, not a different graph, and
 * test-relations.js asserts exactly that.
 *
 * Node iteration is sorted and no randomness is used anywhere, because the
 * output is committed to the repository and a clustering that reshuffled itself
 * on every build would produce a large meaningless diff every night.
 */
const MAX_LEVELS = 12;
const MAX_PASSES = 20;
const EPS = 1e-12;

/*
 * One level: move each node to the neighbouring community that most improves
 * modularity, repeating until nothing moves. Degree is the sum of a row
 * including its self-loop, which makes an aggregated node's degree equal the
 * sum of the degrees of everything collapsed into it - the invariant the whole
 * method rests on.
 */
function localMoving(graph) {
  const nodes = [...graph.keys()].sort((a, b) => a - b);
  const deg = new Map();
  let twoM = 0;
  for (const n of nodes) {
    let d = 0;
    for (const w of graph.get(n).values()) d += w;
    deg.set(n, d);
    twoM += d;
  }
  const comm = new Map(nodes.map(n => [n, n]));
  if (!twoM) return comm;

  const sumTot = new Map(nodes.map(n => [n, deg.get(n)]));

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = 0;
    for (const n of nodes) {
      const ki = deg.get(n);
      const cur = comm.get(n);
      sumTot.set(cur, sumTot.get(cur) - ki);

      // Weight from this node into each neighbouring community. The self-loop
      // is skipped: it travels with the node and cannot argue for a move.
      const wTo = new Map();
      for (const [j, w] of graph.get(n)) {
        if (j === n) continue;
        const c = comm.get(j);
        wTo.set(c, (wTo.get(c) || 0) + w);
      }

      let best = cur;
      let bestGain = (wTo.get(cur) || 0) - (sumTot.get(cur) || 0) * ki / twoM;
      for (const [c, w] of wTo) {
        const gain = w - (sumTot.get(c) || 0) * ki / twoM;
        if (gain > bestGain + EPS) { bestGain = gain; best = c; }
      }

      sumTot.set(best, (sumTot.get(best) || 0) + ki);
      if (best !== cur) { comm.set(n, best); moved++; }
    }
    if (!moved) break;
  }
  return comm;
}

function communities(links, at) {
  const adj = new Map();
  const bump = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, new Map());
    adj.get(a).set(b, (adj.get(a).get(b) || 0) + w);
  };
  for (const [a, b, sim] of links) {
    if (sim < at || a === b) continue;
    bump(a, b, sim);
    bump(b, a, sim);
  }
  if (!adj.size) return [];

  let members = new Map([...adj.keys()].map(id => [id, [id]]));
  let graph = adj;

  for (let level = 0; level < MAX_LEVELS; level++) {
    const comm = localMoving(graph);

    const groups = new Map();
    for (const n of [...graph.keys()].sort((a, b) => a - b)) {
      const c = comm.get(n);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(n);
    }
    // Nothing collapsed, so no further level can collapse anything either.
    if (groups.size === graph.size) break;

    const index = new Map();
    const nextMembers = new Map();
    let next = 0;
    for (const nodes of groups.values()) {
      const id = next++;
      const collapsed = [];
      for (const n of nodes) {
        index.set(n, id);
        for (const original of members.get(n)) collapsed.push(original);
      }
      nextMembers.set(id, collapsed);
    }

    // Edges between communities become edges between super-nodes; edges inside
    // one become its self-loop, counted from both endpoints so that the degree
    // invariant above still holds.
    const folded = new Map();
    for (const [n, nbrs] of graph) {
      const a = index.get(n);
      if (!folded.has(a)) folded.set(a, new Map());
      const row = folded.get(a);
      for (const [j, w] of nbrs) {
        const b = index.get(j);
        row.set(b, (row.get(b) || 0) + w);
      }
    }

    graph = folded;
    members = nextMembers;
  }

  return [...members.values()]
    .filter(g => g.length > 1)
    .map(g => g.slice().sort((a, b) => a - b))
    .sort((a, b) => b.length - a.length || a[0] - b[0]);
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

/*
 * One sentence describing how the clusters were made, exported rather than
 * retyped, because it is quoted in the manifest, in llms.txt and in the prose
 * report - three places that would otherwise describe three different methods
 * the day one of them is changed.
 */
const CLUSTER_METHOD = 'Louvain modularity over the thresholded semantic edges';

module.exports = {
  cluster, communities, nearestByRepo, packageSets, stackEdges,
  CLUSTER_AT, MAX_DF_SHARE, MIN_STACK, KIN_LIMIT, CLUSTER_METHOD
};
