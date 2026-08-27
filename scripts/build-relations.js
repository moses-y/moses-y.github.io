#!/usr/bin/env node
/*
 * build-relations.js - materialise the relation layer.
 *
 * Everything here was already derivable from data/index.json and data/deps.json,
 * and that was the problem: derivable meant a 774 KB download and a rebuild of
 * the adjacency in a browser closure, where nothing else could reach it. The
 * whole point of this file is that a question which used to cost 198k tokens of
 * context now costs one small fetch.
 *
 * Writes:
 *   data/clusters.json     groups of near-duplicate work, graded, with a keeper
 *   data/kin/<id>.json     one repository's neighbourhood, both edge types
 *   data/relations.json    the manifest: thresholds, counts, where things are
 *
 * Runs after build-index.js (which writes the index it reads) and after
 * build-grade.js. No network, no model.
 *
 *   node scripts/build-relations.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  cluster, nearestByRepo, packageSets, stackEdges,
  CLUSTER_AT, MAX_DF_SHARE, MIN_STACK, KIN_LIMIT
} = require('./lib-relations.js');
const { SITE } = require('./lib-schema.js');
const { render } = require('./lib-cluster-report.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data');
const KIN = path.join(OUT, 'kin');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return fallback; }
}

/*
 * Which repository in a cluster is worth keeping. The grade first, because the
 * whole point of grading was to have an answer to this that is not "the one I
 * remember"; then the size of the tree, because between two ungraded
 * repositories the one with more in it is the one that was worked on.
 */
function pickKeeper(members) {
  return members.slice().sort((a, b) =>
    (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) ||
    (b.stars || 0) - (a.stars || 0) ||
    (b.files || 0) - (a.files || 0))[0];
}

/*
 * llms.txt - the convention for telling a model what a site holds and where the
 * machine-readable version of it is. robots.txt points only at a sitemap of HTML
 * pages, so until now the data layer was unfindable even by something that had
 * already decided to look.
 *
 * Generated rather than hand-written because every number in it is a count that
 * moves, and a stale advertised figure is worse than none: it is the one thing a
 * reader will quote back without checking.
 */
function writeLlmsTxt(index, gradesFile, manifest, sample) {
  const domains = (index.taxonomy && index.taxonomy.domains) || {};
  const ranked = Object.keys(domains).sort((a, b) => domains[b] - domains[a])
    .map(d => d + ' ' + domains[d]).join(', ');
  const graded = gradesFile.graded || 0;

  const text = [
    '# Moses Yebei - repository estate',
    '',
    '> ' + index.total + ' public repositories, analysed and related to each other.',
    '> Provenance is stated per fact rather than claimed for the site as a whole.',
    '> The file census, architecture pass, dependency scan, advisory scan, hygiene',
    '> audit, domain classification and eight-category grade are EXTRACTED: measured',
    '> from a tree, a history or a manifest, reproducible from the same inputs, no',
    '> model involved. The semantic similarity edges are INFERRED: cosine distance',
    '> between neural embeddings (nvidia/nv-embedqa-e5-v5) of a text built from each',
    '> repository description, topics and generated summary. Treat them as a strong',
    '> hint, not as a measurement. Every edge in the relation layer carries which of',
    '> the two it is. Repositories that have not been analysed are marked as such',
    '> rather than being reported as clean.',
    '',
    '## Data',
    '',
    '- [Schema](' + SITE + '/data/schema.json): what every field in the index means. Read this first; the record keys are single letters.',
    '- [Index](' + SITE + '/data/index.json): all ' + index.total + ' repositories with language, domain, kind, capabilities, hygiene severities and semantic coordinates, plus ' + (index.links || []).length + ' similarity edges. Large - prefer the neighbourhood files below for traversal.',
    '- [Relations manifest](' + SITE + '/data/relations.json): edge types, thresholds and counts for the relation layer.',
    '- [Clusters](' + SITE + '/data/clusters.json): ' + manifest.counts.clusters + ' groups of near-duplicate work covering ' + manifest.counts.clusteredRepositories + ' repositories, each with member grades and which one is the keeper.',
    '- [Cluster report](' + SITE + '/data/clusters.md): the same ' + manifest.counts.clusters + ' groups written out as prose, cross-domain ones first, each with its keeper and how much of it is unaudited. Read this instead of clusters.json if you want the argument rather than the records.',
    '- [Neighbourhood](' + SITE + '/data/kin/' + sample + '.json): one file per repository id, about 1 KB each: nearest semantic kin and repositories sharing its dependency stack, with the shared packages named. Fetch ' + SITE + '/data/kin/<id>.json to walk from one repository to its neighbours without loading the index.',
    '- [Grades](' + SITE + '/data/grades.json): ' + graded + ' graded repositories, mean ' + gradesFile.mean + ', with the per-category score, weight and the findings charged against each.',
    '- [Hygiene](' + SITE + '/data/hygiene.json): the raw audit findings behind the grades.',
    '- [Dependencies](' + SITE + '/data/deps.json): declared dependencies per repository by ecosystem.',
    '- [Search](' + SITE + '/data/search.json): inverted index, token to position in the index records.',
    '',
    '## Pages',
    '',
    '- [Projects](' + SITE + '/projects.html): every repository with its measured facts.',
    '- [Code Graph](' + SITE + '/knowledge-graph.html): the semantic map, similarity edges drawn.',
    '- [Code Brain](' + SITE + '/code-brain.html): domains to languages to repositories to modules.',
    '- [Briefings](' + SITE + '/blog/): a written analysis per repository at /blog/<name>.html.',
    '- [Site map](' + SITE + '/sitemap.html): everything, grouped by domain.',
    '',
    '## Notes',
    '',
    '- Domains: ' + ranked + '.',
    '- Two edge types relate repositories, and they differ in how much they can be trusted. "stack" is EXTRACTED: IDF-weighted overlap of dependencies both repositories declare in a manifest, and each edge names the packages it was drawn from, so it can be checked and disagreed with. It answers "built the way you build things". "semantic" is INFERRED: cosine distance between embeddings, with no evidence attached beyond the number itself. It answers "probably solves the same problem". A pair scoring on both is the strongest signal that one repository is a usable starting point for the other, because the extracted edge corroborates the inferred one.',
    '- Clusters in clusters.json are built from semantic edges only, so they inherit that provenance: they are INFERRED. Single-link union-find at the threshold, which chains, so the largest clusters are "reachable by strong similarity" rather than "all alike".',
    '- Stack edges exist only for the ' + manifest.counts.withDeclaredDependencies + ' repositories that declare dependencies in a manifest this pipeline reads.',
    '- Grades cover ' + graded + ' of ' + index.total + ' repositories. An absent grade means not yet audited, not a bad grade.',
    '- Generated ' + manifest.generated.slice(0, 10) + '.',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(ROOT, 'llms.txt'), text);
  return text;
}

function main() {
  const index = readJson(path.join(OUT, 'index.json'), null);
  if (!index || !Array.isArray(index.repos)) {
    console.error('data/index.json not found. Run build-index.js first.');
    process.exit(1);
  }
  const grades = (readJson(path.join(OUT, 'grades.json'), {}) || {}).repos || {};
  const deps = (readJson(path.join(OUT, 'deps.json'), {}) || {}).repos || {};

  const meta = new Map();
  for (const r of index.repos) {
    meta.set(r.i, {
      id: r.i, name: r.n, title: r.t, domain: r.g, language: r.l,
      kind: r.k, stars: r.s, files: r.f, article: r.a ? '/blog/' + r.n + '.html' : null,
      // Null when the repository has not been audited, and the readers of this
      // file have to treat that as "not looked at" rather than as a bad grade.
      letter: grades[String(r.i)] ? grades[String(r.i)].letter : null,
      score: grades[String(r.i)] ? grades[String(r.i)].score : null
    });
  }

  const links = index.links || [];
  const groups = cluster(links, CLUSTER_AT);
  const semantic = nearestByRepo(links, KIN_LIMIT);
  const depSets = packageSets(deps);
  const stack = stackEdges(depSets);

  // ---- clusters ---------------------------------------------------------
  const clusterOf = new Map();
  const clusters = groups.map((ids, n) => {
    const members = ids.map(id => meta.get(id)).filter(Boolean);
    if (!members.length) return null;
    const keeper = pickKeeper(members);
    const cid = 'c' + String(n + 1).padStart(3, '0');
    for (const m of members) clusterOf.set(m.id, cid);
    const domains = {};
    for (const m of members) domains[m.domain || 'Other'] = (domains[m.domain || 'Other'] || 0) + 1;
    const graded = members.filter(m => m.score != null);
    return {
      id: cid,
      size: members.length,
      domains: domains,
      // A cluster spanning domains is the interesting case, not a defect: it is
      // the same problem solved twice in two different stacks.
      crossDomain: Object.keys(domains).length > 1,
      keeper: { id: keeper.id, name: keeper.name, letter: keeper.letter, score: keeper.score },
      ungraded: members.length - graded.length,
      meanScore: graded.length
        ? +(graded.reduce((s, m) => s + m.score, 0) / graded.length).toFixed(1)
        : null,
      members: members
        .sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score))
        .map(m => ({
          id: m.id, name: m.name, title: m.title, domain: m.domain,
          language: m.language, letter: m.letter, score: m.score, files: m.files
        }))
    };
  }).filter(Boolean).sort((a, b) => b.size - a.size);

  // ---- per-repository neighbourhoods ------------------------------------
  if (fs.existsSync(KIN)) {
    for (const f of fs.readdirSync(KIN)) fs.unlinkSync(path.join(KIN, f));
  }
  fs.mkdirSync(KIN, { recursive: true });

  const brief = m => m && ({
    id: m.id, name: m.name, domain: m.domain, language: m.language,
    letter: m.letter, score: m.score
  });

  let written = 0;
  let withStack = 0;
  for (const [id, m] of meta) {
    const sem = (semantic.get(id) || [])
      .map(([other, sim]) => {
        const b = brief(meta.get(other));
        return b ? Object.assign(b, { similarity: sim }) : null;
      }).filter(Boolean);
    const stk = (stack.get(id) || [])
      .map(row => {
        const b = brief(meta.get(row.id));
        return b ? Object.assign(b, { weight: row.weight, shared: row.shared }) : null;
      }).filter(Boolean);
    if (!sem.length && !stk.length && !clusterOf.has(id)) continue;
    if (stk.length) withStack++;

    fs.writeFileSync(path.join(KIN, id + '.json'), JSON.stringify({
      id: id,
      name: m.name,
      title: m.title,
      domain: m.domain,
      language: m.language,
      letter: m.letter,
      score: m.score,
      article: m.article,
      cluster: clusterOf.get(id) || null,
      // The provenance of each list, restated per file so that a reader who
      // fetched one neighbourhood and nothing else still knows which half of it
      // is measured and which half is a guess.
      provenance: {
        semantic: 'INFERRED',
        stack: 'EXTRACTED'
      },
      semantic: sem,
      stack: stk
    }));
    written++;
  }

  // ---- manifest ---------------------------------------------------------
  const covered = clusters.reduce((s, c) => s + c.size, 0);
  const manifest = {
    generated: new Date().toISOString(),
    description: 'Materialised relations between repositories. Two edge types, ' +
      'differing in provenance, which is the thing to check before trusting ' +
      'either of them.',
    /*
     * The distinction this file exists to make. It was originally written as
     * "both are computed, not inferred by a model", which was simply false: the
     * similarity edges come out of a neural embedding of text that itself
     * includes a generated summary. Stating it per edge type is the only version
     * of this claim that survives contact with the pipeline.
     */
    edgeTypes: {
      stack: {
        provenance: 'EXTRACTED',
        derivedFrom: 'dependency manifests committed to both repositories',
        method: 'IDF-weighted cosine over declared packages, ln(N/df), packages ' +
          'above ' + MAX_DF_SHARE + ' document frequency excluded as furniture',
        evidence: 'each edge names the shared packages that carried the most weight',
        answers: 'built the way you build things'
      },
      semantic: {
        provenance: 'INFERRED',
        derivedFrom: 'neural embedding of the repository description, topics, ' +
          'languages, frameworks and generated summary',
        model: 'nvidia/nv-embedqa-e5-v5',
        method: 'cosine similarity in the embedding space',
        evidence: 'none beyond the similarity score itself',
        answers: 'probably solves the same problem'
      }
    },
    clusterProvenance: 'INFERRED - clusters are built from semantic edges only',
    thresholds: {
      cluster: CLUSTER_AT,
      stackMin: MIN_STACK,
      stackMaxDocumentFrequency: MAX_DF_SHARE,
      neighboursPerRepository: KIN_LIMIT
    },
    counts: {
      repositories: meta.size,
      // Coverage is stated against the repositories that actually declare
      // dependencies, not the whole estate: most of data/deps.json is empty
      // objects for trees with no manifest, and counting those as misses would
      // report a working join as a broken one.
      withDeclaredDependencies: depSets.size,
      semanticEdges: links.length,
      clusters: clusters.length,
      clusteredRepositories: covered,
      neighbourhoods: written,
      withStackEdges: withStack
    },
    files: {
      clusters: '/data/clusters.json',
      neighbourhood: '/data/kin/<repository-id>.json',
      schema: '/data/schema.json'
    }
  };

  const clustersFile = {
    generated: manifest.generated,
    threshold: CLUSTER_AT,
    clusters: clusters
  };
  fs.writeFileSync(path.join(OUT, 'clusters.json'), JSON.stringify(clustersFile));

  // The same clusters as sentences. Written from the object above rather than
  // read back from disk, so the two can never describe different builds.
  fs.writeFileSync(path.join(OUT, 'clusters.md'), render(clustersFile));
  fs.writeFileSync(path.join(OUT, 'relations.json'), JSON.stringify(manifest, null, 2));

  // Pages serves files, not directory listings, so the advertised example has
  // to be a real file rather than /data/kin/.
  writeLlmsTxt(index, readJson(path.join(OUT, 'grades.json'), {}) || {}, manifest,
    fs.readdirSync(KIN)[0].replace(/\.json$/, ''));

  const kb = p => (fs.statSync(p).size / 1024).toFixed(0);
  const kinBytes = fs.readdirSync(KIN)
    .reduce((s, f) => s + fs.statSync(path.join(KIN, f)).size, 0);
  console.log('=== Relations ===');
  console.log('  clusters           ' + clusters.length + ' covering ' + covered +
    ' repositories at >= ' + CLUSTER_AT);
  console.log('  cross-domain       ' + clusters.filter(c => c.crossDomain).length);
  console.log('  stack edges        ' + withStack + ' of ' + depSets.size +
    ' repositories that declare dependencies');
  console.log('  data/clusters.json ' + kb(path.join(OUT, 'clusters.json')) + ' KB');
  console.log('  data/clusters.md   ' + kb(path.join(OUT, 'clusters.md')) + ' KB');
  console.log('  data/kin/          ' + written + ' files, ' +
    (kinBytes / 1024).toFixed(0) + ' KB total, ' +
    (kinBytes / Math.max(1, written) / 1024).toFixed(1) + ' KB each');
  console.log('  llms.txt           ' + kb(path.join(ROOT, 'llms.txt')) + ' KB');
}

main();
