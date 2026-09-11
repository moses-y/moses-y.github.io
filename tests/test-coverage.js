#!/usr/bin/env node
/*
 * test-coverage.js - does every published layer still cover the estate?
 *
 * Written after a failure nothing caught for seventeen days. The embedding model
 * was retired on 2026-08-25; the batch loop logged its 410, broke, and let the
 * job exit 0. Coverage then decayed one new repository at a time - 1,407 of
 * 1,407, then of 1,420, then of 1,534 - while `semantic.positioned` sat at the
 * same number in every commit. A number that stops changing reads as settled.
 *
 * The lesson is not "watch that field". It is that every layer here is built
 * against a backlog and therefore has an expected coverage, and none of them
 * stated it anywhere a check could fail. A floor turns gradual decay into a
 * date.
 *
 * Floors, not equality. These stages are budgeted on purpose: a run analyses
 * what it can afford and the rest rolls over, so a handful of repositories
 * behind the corpus is the system working. Whole percentages behind it is not.
 *
 * Honest about what this would have caught: the semantic floor here trips around
 * day ten of that outage, not day one. Ten days beats seventeen days and beats
 * never, and the probe in src/tools/check-models.js is what catches day one.
 *
 * Skips rather than fails when a layer is not built, because a fresh clone has
 * no published data and a test that fails there teaches people to ignore it.
 *
 *   node tests/test-coverage.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fail++;
  console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
}

const ROOT = path.join(__dirname, '..');
const read = p => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch (e) { return null; }
};

const forks = read('forks.json');
if (!forks || !Array.isArray(forks.forks)) {
  console.log('  skip  forks.json not built, coverage checks skipped');
  process.exit(0);
}

const repos = forks.forks;
const n = repos.length;
console.log('estate: ' + n + ' repositories');

// A ratio with its numbers attached, so a failure says how far behind it is
// rather than only that it is behind.
function floor(name, have, floorPct) {
  const pct = n ? (have / n) * 100 : 0;
  check(name, pct >= floorPct,
    have + ' of ' + n + ' = ' + pct.toFixed(1) + '%, floor ' + floorPct + '%');
}

console.log('\narticles');
// Generation is the most expensive layer and the most visibly wrong when absent:
// a repository with no briefing has a blog page with nothing on it.
floor('every repository has a summary', repos.filter(r => r.summary).length, 99);
floor('summaries are at the current article version',
  repos.filter(r => r.av === require('../src/lib/lib-article-version.js').ARTICLE_VERSION).length, 95);

console.log('\nsemantic layer');
/*
 * The one that failed. A repository with no `umap` is absent from the graph
 * page entirely - not greyed out, not marked unpositioned, absent - so the page
 * looks complete while describing a smaller estate than the one it claims.
 */
floor('repositories have a position on the semantic graph',
  repos.filter(r => r.umap).length, 95);

const sem = forks.semantic || {};
// The header and the records are written by the same run and can still
// disagree, which would make the stated figure a claim about nothing.
check('the stated position count matches the records',
  !sem.positioned || sem.positioned === repos.filter(r => r.umap).length,
  sem.positioned + ' stated vs ' + repos.filter(r => r.umap).length + ' present');
check('the semantic layer names the model that produced it',
  typeof sem.model === 'string' && sem.model.length > 0, sem.model);

console.log('\nknowledge graph');
floor('repositories have a file census',
  repos.filter(r => r.knowledgeGraph && r.knowledgeGraph.totalFiles).length, 98);

console.log('\ngrading');
const grades = read('data/grades.json');
if (grades && grades.repos) {
  // Budgeted by design: grading depends on the deep pass, which runs against a
  // per-run budget, so this floor is deliberately the loosest here.
  floor('repositories carry a grade', Object.keys(grades.repos).length, 85);
} else {
  console.log('  skip  data/grades.json not built');
}

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
