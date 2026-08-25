#!/usr/bin/env node
/*
 * lib-schema.js - what the single-letter keys in data/index.json mean.
 *
 * The record keys were shortened because at 1,400 records the key names were a
 * measurable share of the file, and that trade is still right. What was wrong is
 * that the meaning then lived only in build-index.js, so data/index.json was 774
 * KB of `g`, `k`, `c`, `v` that nothing outside this repository could read - and
 * increasingly the reader is a model rather than a person, which cannot infer
 * from the surrounding code because it does not have the surrounding code.
 *
 * So the schema is data, emitted next to the file it describes. It is declared
 * here rather than hand-written into data/ because a schema that is maintained
 * separately from the builder drifts from it, and test-schema.js asserts the two
 * agree by comparing this against the keys actually emitted.
 *
 * Field order is the order build-index writes them, so a diff of the two reads
 * top to bottom.
 */
'use strict';

const SITE = 'https://moses-y.github.io';

// key -> [type, description, optional note on encoding]
const RECORD = {
  i: ['integer', 'GitHub repository id. Stable across renames and the join key for every other file in data/.'],
  n: ['string', 'Repository slug. Also the article path: /blog/<n>.html.'],
  t: ['string', 'Display title. Falls back to the slug when no title was set.'],
  d: ['string', 'Description, truncated to 180 characters.'],
  l: ['string|null', 'Primary code language, derived from the file census rather than the GitHub API, which returns null on most forks. Null means the tree holds no code language - prose and config repositories are the usual case.'],
  g: ['string', 'Domain. One of: AI & Data, Web & Interfaces, Systems & Infra, Mobile, Knowledge & Content, Agent Skills & Plugins, Other. Recomputed at index time from the language and the file census, so it is a function of the tree and not a stored label.'],
  k: ['string|null', 'Repository kind, e.g. "Web app", "Library", "CLI". Coarser than the domain and used for grading profiles.'],
  s: ['integer', 'Stars on the upstream repository.'],
  y: ['0|1', '1 when this is an original repository, 0 when it is a fork.'],
  f: ['integer', 'Total files in the tree.'],
  x: ['integer', 'Count of structural issues found by the architecture pass.'],
  a: ['0|1', '1 when a written briefing exists at /blog/<n>.html.'],
  c: ['string', 'Five capability bits as characters, in order: hasTests, hasCI, hasDocker, hasLicense, committedSecrets. "11110" means tested, CI, Docker, licensed, no secrets found. The fifth bit is the only one where 1 is bad.'],
  v: ['integer[4]|0|absent', 'Hygiene findings by severity: [critical, high, medium, low]. The scalar 0 means audited and clean. Absent means not audited - which is not the same as clean, and the two must not be collapsed.'],
  m: ['string|absent', 'Card image URL.'],
  r: ['integer|absent', 'Estimated read time of the briefing, in minutes.'],
  z: ['string|absent', 'Last update, already formatted for display.'],
  p: ['object|absent', 'Upstream parent for a fork: {n: full name, u: URL, s: stars}.'],
  u: ['number[3]|absent', 'UMAP coordinates in the semantic embedding space, 4 decimal places. The same space the similarity links in `links` are drawn from, so two repositories close in `u` are close in meaning.']
};

const TOP = {
  generated: ['string', 'ISO timestamp of the feed this index was built from.'],
  total: ['integer', 'Number of records in `repos`.'],
  totals: ['object', 'Estate-wide counts: files, findings, links, withArticle.'],
  taxonomy: ['object', 'Counts by domain, language, kind and capability. `domains` is recounted from `repos` at build time; the rest is carried from the feed.'],
  links: ['array', 'Semantic similarity edges as [sourceId, targetId, similarity]. Undirected despite the ordering, cosine similarity in the embedding space, 3 decimal places. Both ids are `i` values in `repos`.'],
  repos: ['array', 'The records. See `record`.']
};

/*
 * A schema is only useful if it also says what the file is for and what else is
 * next to it, because the reader that most needs it arrived at the URL with no
 * other context. These are the files a traversal actually needs.
 */
const COMPANIONS = [
  ['data/index.json', 'This file. Every repository, one lean record each, plus the similarity edges.'],
  ['data/clusters.json', 'Repositories grouped into clusters of near-duplicate work, with the grade of each member and which one is the keeper.'],
  ['data/kin/<id>.json', 'One repository\'s neighbourhood: nearest semantic kin and repositories sharing its dependency stack. One small fetch per hop, so walking the graph does not require parsing this file.'],
  ['data/grades.json', 'Deterministic grade per audited repository across eight weighted categories. No model is involved.'],
  ['data/hygiene.json', 'Raw audit findings by severity, the input to grades.json.'],
  ['data/deps.json', 'Declared dependencies per repository by ecosystem.'],
  ['data/search.json', 'Inverted index: token -> positions in index.json `repos`.']
];

function describe() {
  const fields = obj => Object.keys(obj).reduce((acc, k) => {
    acc[k] = { type: obj[k][0], description: obj[k][1] };
    return acc;
  }, {});

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'moses-y.github.io repository index',
    description: 'The read side of a deterministic analysis pipeline over ' +
      'every repository in the estate. Record keys are single letters to keep ' +
      'the file small; this document is the key. Nothing here is generated by ' +
      'a language model - every field is measured from the repository tree, ' +
      'its history, or its manifests.',
    source: SITE + '/data/index.json',
    licence: 'Facts about public repositories. Reuse freely; attribution appreciated.',
    top: fields(TOP),
    record: fields(RECORD),
    companions: COMPANIONS.map(([p, d]) => ({ path: p, url: SITE + '/' + p, description: d }))
  };
}

module.exports = { describe, RECORD, TOP, COMPANIONS, SITE };
