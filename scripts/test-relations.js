#!/usr/bin/env node
/*
 * test-relations.js - the relation layer and the schema that describes it.
 *
 * Both of these fail silently by construction, which is why they are worth
 * asserting. A schema is a second copy of the record shape, so it rots the day a
 * field is added to build-index and nobody remembers to document it - and the
 * rot is invisible, because the file still parses and still looks authoritative.
 * The relation files fail the same way: an empty neighbourhood, a cluster whose
 * keeper is not in it, or a threshold advertised in llms.txt that no longer
 * matches the one the builder used all read as working output.
 *
 *   node scripts/test-relations.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { describe, RECORD } = require('./lib-schema.js');
const {
  cluster, communities, stackEdges, packageSets, CLUSTER_AT
} = require('./lib-relations.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

let fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fail++;
  console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
}
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

console.log('the schema describes what is actually emitted');

const schema = describe();
check('the schema names its source', /index\.json$/.test(schema.source || ''));
check('every documented field has a type and a description',
  Object.keys(schema.record).every(k => schema.record[k].type && schema.record[k].description));

const index = readJson(path.join(DATA, 'index.json'));
if (index) {
  // The drift that matters: a key in the data with no entry here means a reader
  // hits a field the schema does not mention, which is worse than no schema
  // because it was trusted.
  const emitted = new Set();
  for (const r of index.repos) for (const k of Object.keys(r)) emitted.add(k);
  const undocumented = [...emitted].filter(k => !RECORD[k]);
  check('every key in the index is documented', undocumented.length === 0, undocumented.join(', '));

  // And the other direction, which is the cheaper failure but still a lie: a
  // documented field that build-index stopped writing.
  const stale = Object.keys(RECORD).filter(k => !emitted.has(k));
  check('every documented key still appears in the index', stale.length === 0, stale.join(', '));

  const top = Object.keys(index).filter(k => !schema.top[k]);
  check('every top-level key is documented', top.length === 0, top.join(', '));

  // The domain list in the schema is prose, and prose about an enum goes stale
  // the moment a domain is added - which happened once already.
  const domains = Object.keys((index.taxonomy && index.taxonomy.domains) || {});
  const missing = domains.filter(d => schema.record.g.description.indexOf(d) === -1);
  check('the schema lists every domain the index contains', missing.length === 0, missing.join(', '));
} else {
  console.log('  skip  data/index.json not built');
}

console.log('clustering');

// Single-link over a chain: a-b-c must be one group of three, not two pairs.
const chain = [[1, 2, 0.9], [2, 3, 0.8], [4, 5, 0.4]];
const groups = cluster(chain, 0.68);
check('similarity below the threshold does not join anything', groups.length === 1);
check('a chain of strong links is one cluster', groups[0].length === 3, String(groups[0].length));
check('a repository with no strong link is in no cluster',
  groups.every(g => g.indexOf(4) === -1));

/*
 * Louvain replaced connected components because components chain: one bridge
 * repository merged two neighbourhoods into a group of 21 that was not one
 * project. The invariant worth asserting is not the group count, which moves
 * with the data, but the relationship between the two methods - modularity
 * partitions each component and never reaches across one, so every group it
 * returns must sit inside exactly one component. If that ever fails the new
 * method is not refining the old one, it is describing a different graph.
 */
const barbell = [
  [1, 2, 0.9], [1, 3, 0.9], [2, 3, 0.9],
  [4, 5, 0.9], [4, 6, 0.9], [5, 6, 0.9],
  [3, 4, 0.7],
  [7, 8, 0.4]
];
const dense = communities(barbell, 0.68);
check('two triangles joined by one bridge are two groups, not one',
  dense.length === 2, JSON.stringify(dense));
check('the bridge does not pull a weak pair in',
  dense.every(g => g.indexOf(7) === -1));
check('modularity never groups across a connected component', (() => {
  const owner = new Map();
  cluster(barbell, 0.68).forEach((g, i) => g.forEach(id => owner.set(id, i)));
  return dense.every(g => new Set(g.map(id => owner.get(id))).size === 1);
})());
check('the same edges always produce the same groups',
  JSON.stringify(communities(barbell, 0.68)) === JSON.stringify(dense));
check('an edge list below the threshold produces no groups',
  communities([[1, 2, 0.4]], 0.68).length === 0);

console.log('stack edges weight by rarity, not by count');

/*
 * The case the IDF weighting exists for. A and B share one rare package; A and C
 * share three packages that everything in the estate declares. Counting shared
 * names ranks C first, which is the wrong answer: the common three say nothing
 * about either repository.
 */
const common = ['npm:react', 'npm:typescript', 'npm:eslint'];
const sets = new Map([
  [1, new Set(common.concat(['npm:duckdb-wasm']))],
  [2, new Set(['npm:duckdb-wasm', 'npm:svelte'])],
  [3, new Set(common.concat(['npm:next']))]
]);
for (let i = 10; i < 30; i++) sets.set(i, new Set(common));
const edges = stackEdges(sets, { min: 0 });
const from1 = edges.get(1) || [];
check('a rare shared package outranks three common ones',
  from1.length && from1[0].id === 2, JSON.stringify(from1.slice(0, 2)));
check('the edge names the packages it was drawn from',
  from1.length && from1[0].shared.indexOf('npm:duckdb-wasm') !== -1);
check('a repository declaring nothing distinctive gets no strong edge',
  !(stackEdges(sets, { min: 0.5 }).get(11) || []).length);
check('an empty dependency map produces no sets', packageSets({}).size === 0);

console.log('the built files agree with each other');

const clusters = readJson(path.join(DATA, 'clusters.json'));
const manifest = readJson(path.join(DATA, 'relations.json'));
if (clusters && manifest && index) {
  check('the advertised threshold is the one that was used',
    clusters.threshold === CLUSTER_AT && manifest.thresholds.cluster === CLUSTER_AT);
  check('every cluster has more than one member',
    clusters.clusters.every(c => c.size > 1));
  check('the keeper is a member of its own cluster',
    clusters.clusters.every(c => c.members.some(m => m.id === c.keeper.id)));
  check('size matches the member list',
    clusters.clusters.every(c => c.size === c.members.length));
  check('the ungraded count is the members with no score',
    clusters.clusters.every(c => c.ungraded === c.members.filter(m => m.score == null).length));
  check('the manifest count matches the file',
    manifest.counts.clusters === clusters.clusters.length);

  const ids = new Set(index.repos.map(r => r.i));
  check('every clustered repository exists in the index',
    clusters.clusters.every(c => c.members.every(m => ids.has(m.id))), 'orphan member');

  const kinDir = path.join(DATA, 'kin');
  if (fs.existsSync(kinDir)) {
    const files = fs.readdirSync(kinDir);
    check('a neighbourhood was written for most of the estate',
      files.length > index.repos.length * 0.5, files.length + ' of ' + index.repos.length);

    // Every clustered repository must be reachable by one fetch, or the
    // clusters file is the only way in and the whole point is lost.
    const missing = clusters.clusters.flatMap(c => c.members.map(m => m.id))
      .filter(id => !fs.existsSync(path.join(kinDir, id + '.json')));
    check('every clustered repository has a neighbourhood file',
      missing.length === 0, missing.slice(0, 5).join(', '));

    const sample = readJson(path.join(kinDir, files[0]));
    check('a neighbourhood names its own repository', sample && sample.id && sample.name);
    check('a neighbourhood is not empty',
      sample && ((sample.semantic || []).length || (sample.stack || []).length));
    check('a neighbourhood never links to itself',
      (sample.semantic || []).concat(sample.stack || []).every(n => n.id !== sample.id));

    // One small fetch is the entire premise. A kin file the size of the index
    // would be the index with extra steps.
    const bytes = files.reduce((s, f) => s + fs.statSync(path.join(kinDir, f)).size, 0);
    check('a neighbourhood costs a fetch, not a parse of the index',
      bytes / files.length < 8192, (bytes / files.length).toFixed(0) + ' bytes mean');
  } else {
    console.log('  skip  data/kin not built');
  }
} else {
  console.log('  skip  relation files not built');
}

console.log('the site advertises the data layer');

const llms = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llms) && manifest) {
  const text = fs.readFileSync(llms, 'utf8');
  check('llms.txt opens with a heading and a summary',
    /^# .+\n\n> /.test(text));
  for (const f of ['schema.json', 'clusters.json', 'relations.json', 'index.json']) {
    check('llms.txt points at ' + f, text.indexOf('/data/' + f) !== -1);
  }
  // The advertised example has to be a file that exists, because a 404 in the
  // one document a machine reads first is worse than not publishing it.
  const m = text.match(/\/data\/kin\/(\d+)\.json/);
  check('the example neighbourhood exists',
    !!m && fs.existsSync(path.join(DATA, 'kin', m[1] + '.json')), m ? m[1] : 'no example');
  check('llms.txt states the current counts',
    text.indexOf(String(manifest.counts.clusters) + ' groups') !== -1);

  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  check('robots.txt points at llms.txt', /llms\.txt/.test(robots));
} else {
  console.log('  skip  llms.txt not built');
}

console.log('provenance is stated, not claimed');

/*
 * This section exists because of a claim that shipped and was wrong. llms.txt
 * asserted that no language model produced any figure on the site, which was
 * true of the grades and the audit and false of the similarity edges: those come
 * out of a neural embedding of a text that itself contains a generated summary.
 * A blanket honesty claim is the easiest thing in the pipeline to get wrong,
 * because nothing breaks when it stops being true.
 */
if (manifest) {
  check('both edge types declare a provenance',
    manifest.edgeTypes && manifest.edgeTypes.stack.provenance === 'EXTRACTED' &&
    manifest.edgeTypes.semantic.provenance === 'INFERRED');
  check('the inferred edge names the model it came from',
    /\S/.test((manifest.edgeTypes.semantic || {}).model || ''));
  check('the extracted edge says what evidence it carries',
    /names the shared packages/.test(manifest.edgeTypes.stack.evidence || ''));
  check('clusters inherit the provenance of the edges they are built from',
    /INFERRED/.test(manifest.clusterProvenance || ''));
}

if (fs.existsSync(llms)) {
  const text = fs.readFileSync(llms, 'utf8');
  // The specific regression: an unqualified site-wide no-model claim.
  check('llms.txt makes no blanket no-model claim',
    !/no language model produces any figure/i.test(text));
  check('llms.txt names both provenance levels',
    /EXTRACTED/.test(text) && /INFERRED/.test(text));
  check('llms.txt discloses the embedding model by name', /nv-embedqa/.test(text));

  const kinDir2 = path.join(DATA, 'kin');
  if (fs.existsSync(kinDir2)) {
    const one = readJson(path.join(kinDir2, fs.readdirSync(kinDir2)[0]));
    check('a neighbourhood restates provenance for a reader who fetched only it',
      one.provenance && one.provenance.semantic === 'INFERRED' &&
      one.provenance.stack === 'EXTRACTED');
  }
}

console.log('the cluster report says what clusters.json says');

/*
 * A prose report is the easiest file in the pipeline to let rot: it renders
 * fine when it is describing a build from three weeks ago, and nothing about
 * reading it reveals that. So the assertions are all agreement assertions -
 * the report is only allowed to contain figures the source file also contains.
 * The last one is the important one. Prose is where a hedge gets dropped for
 * being wordy, and "duplicates" is the specific word that would turn an
 * inferred grouping into an instruction to delete a repository.
 */
const report = fs.existsSync(path.join(DATA, 'clusters.md'))
  ? fs.readFileSync(path.join(DATA, 'clusters.md'), 'utf8') : null;

if (report && clusters) {
  const cross = clusters.clusters.filter(c => c.crossDomain);
  const covered = clusters.clusters.reduce((s, c) => s + c.size, 0);

  check('the report counts the groups the file contains',
    report.indexOf(clusters.clusters.length + ' groups covering ' + covered) !== -1);
  check('the report advertises the threshold that was used',
    report.indexOf('at least ' + clusters.threshold) !== -1);
  check('the report names the clustering method the file was built with',
    !!clusters.method && report.indexOf(clusters.method) !== -1, clusters.method);
  check('every group appears in the report',
    clusters.clusters.every(c => report.indexOf('### ' + c.id + ' -') !== -1));
  check('every clustered repository is named',
    clusters.clusters.every(c => c.members.every(m => report.indexOf(m.name) !== -1)));
  check('the cross-domain count agrees with the file',
    report.indexOf(cross.length + ' of the ' + clusters.clusters.length + ' groups cross') !== -1);
  check('the report carries the provenance of what it describes',
    /INFERRED/.test(report) && /embedding/.test(report));
  // The word is allowed exactly once, in the sentence that forbids the reading.
  check('the report warns against reading a group as duplicates',
    /never as a list of duplicates to delete/.test(report));
  check('the report makes no bare duplicate claim',
    !/\b(are|these are) duplicates\b/i.test(report));
  // Conditional on the data, not on the wording: as grading catches up the
  // ungraded rows disappear, and an assertion that demands the phrase would
  // then fail on an estate that had got better rather than worse.
  const anyUngraded = clusters.clusters.some(c => c.ungraded > 0);
  check('an unaudited member reads as unaudited, not as a bad grade',
    !anyUngraded || /\| not audited \|/.test(report),
    anyUngraded ? 'ungraded members exist but none rendered' : 'none ungraded');
  check('llms.txt points at the report',
    fs.existsSync(llms) &&
    fs.readFileSync(llms, 'utf8').indexOf('/data/clusters.md') !== -1);
} else {
  console.log('  skip  data/clusters.md not built');
}

console.log('the skill can still read the files it ships against');

/*
 * .claude/skills/query-repo-estate is a consumer that lives outside scripts/,
 * so nothing else in this suite would notice it breaking. It reads field names
 * out of the built files - and it already broke once during development by
 * reading `sim` where the kin files write `similarity`, which produced a clean
 * exit and a column of "undefined". Exit code alone is not enough, so these
 * assert on the output.
 */
const SKILL = path.join(ROOT, '.claude', 'skills', 'query-repo-estate', 'estate.mjs');
function estate(argv) {
  return execFileSync(process.execPath, [SKILL].concat(argv, ['--local']),
    { cwd: ROOT, encoding: 'utf8' });
}

if (fs.existsSync(SKILL) && clusters && index) {
  const sample = clusters.clusters[0].keeper;
  try {
    const kin = estate(['kin', String(sample.id)]);
    check('the skill prints both provenance levels for a neighbourhood',
      /EXTRACTED/.test(kin) && /INFERRED/.test(kin));
    check('the skill reads the similarity field the kin files actually write',
      !/undefined/.test(kin), 'a field name drifted');

    const group = estate(['cluster', String(sample.id)]);
    check('the skill finds the cluster a keeper belongs to',
      group.indexOf(sample.name) !== -1);
    check('the skill names the clustering method from the file, not a hardcoded one',
      !clusters.method || group.indexOf(clusters.method) !== -1);
    check('the skill refuses to call a cluster a set of duplicates',
      /not duplicates/.test(group));

    const shown = estate(['show', String(sample.id)]);
    check('the skill decodes single-letter keys into schema descriptions',
      /GitHub repository id/.test(shown));
    check('the skill cuts a description at a sentence, not at an abbreviation',
      !/, e {2,}/.test(shown));
  } catch (err) {
    check('the skill runs against the built data', false, String(err.message).slice(0, 90));
  }

  // An unknown repository has to fail loudly. Exiting 0 with no output would
  // read as "nothing is like this", which is a different and wrong answer.
  let exited = 0;
  try { estate(['kin', 'definitely-not-a-repository-name']); } catch (e) { exited = e.status; }
  check('an unknown repository is an error, not an empty answer', exited === 1, String(exited));
} else {
  console.log('  skip  skill or built data not present');
}

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
