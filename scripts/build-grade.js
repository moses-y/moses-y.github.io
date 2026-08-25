#!/usr/bin/env node
/*
 * build-grade.js - grade every audited repository into data/grades.json.
 *
 * Purely a join: forks.json for the repository facts, data/hygiene.json for the
 * audit, structure/<id>.deep.json for the module-level pass, data/osv.json for
 * advisories. No network, no model, so it is cheap enough to run on every pass
 * and must run after build-hygiene, build-analyze and build-osv have written
 * the inputs it reads.
 *
 * A repository with no hygiene audit is skipped rather than graded from
 * defaults: an F awarded because nothing has looked at the repository yet is a
 * false claim, and the page has to be able to tell the two apart.
 *
 *   node scripts/build-grade.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { grade } = require('./lib-grade.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'grades.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return fallback; }
}

function main() {
  const forks = readJson(path.join(ROOT, 'forks.json'), {});
  const repos = forks.forks || forks.repos || (Array.isArray(forks) ? forks : []);
  const hygiene = (readJson(path.join(ROOT, 'data', 'hygiene.json'), {}) || {}).repos || {};
  const osv = (readJson(path.join(ROOT, 'data', 'osv.json'), {}) || {}).repos || {};

  const grades = {};
  const dist = {};
  let skipped = 0;

  for (const repo of repos) {
    const id = String(repo.id);
    const audit = hygiene[id];
    if (!audit) { skipped++; continue; }

    const kg = repo.knowledgeGraph || {};
    const deep = readJson(path.join(ROOT, 'structure', id + '.deep.json'), null);

    const result = grade({
      id: repo.id,
      name: repo.displayName || repo.name,
      kind: repo.kind,
      domain: repo.domain,
      language: repo.language,
      updatedAt: repo.updatedAt,
      // The audit date, not today's, so a rebuild of an unchanged estate is a
      // no-op in the diff rather than a thousand one-point drifts.
      asOf: audit.audited,
      files: kg.totalFiles,
      health: kg.codeHealth || {},
      kg: kg,
      hygiene: audit,
      deep: deep && deep.deep ? deep : null,
      osv: osv[id] || null
    });

    grades[id] = result;
    dist[result.letter] = (dist[result.letter] || 0) + 1;
  }

  const ids = Object.keys(grades);
  const mean = ids.length
    ? Math.round((ids.reduce((s, k) => s + grades[k].score, 0) / ids.length) * 10) / 10
    : 0;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    graded: ids.length,
    mean: mean,
    distribution: dist,
    repos: grades
  }));

  console.log('graded ' + ids.length + ' repositories (mean ' + mean + '), ' +
    skipped + ' not yet audited');
  console.log('  ' + Object.keys(dist).sort()
    .map(k => k + ':' + dist[k]).join('  '));
}

main();
