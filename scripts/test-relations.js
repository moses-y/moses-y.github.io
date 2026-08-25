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
const { describe, RECORD } = require('./lib-schema.js');
const { cluster, stackEdges, packageSets, CLUSTER_AT } = require('./lib-relations.js');

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

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
