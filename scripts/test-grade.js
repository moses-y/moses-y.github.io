#!/usr/bin/env node
/*
 * test-grade.js - the properties the published grade has to hold.
 *
 * A letter on a page is a claim about someone's repository, so the things worth
 * pinning down are the ones that would make it a false claim: a weight set that
 * silently stops summing to 100 after a profile edit, a check added to
 * checks-*.js that nothing charges, a grade that moves when the same inputs are
 * graded twice, or a repository scoring well on an axis nothing measured.
 *
 * Hermetic: fixtures only, no forks.json, no network.
 *
 *   node scripts/test-grade.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const G = require('./lib-grade.js');

let fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fail++;
  console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
}

// A repository with everything in place, used as the baseline that the failure
// cases are varied from one field at a time.
function healthyRepo(over) {
  return Object.assign({
    id: 1, name: 'healthy', kind: 'Web app', language: 'TypeScript',
    updatedAt: '2026-08-01T00:00:00Z', asOf: '2026-08-20T00:00:00Z',
    health: { hasTests: true, hasCI: true, hasLicense: true, hasReadme: true, hasLockfile: true },
    kg: {
      totalFiles: 200, hasCI: true, ciPlatform: 'GitHub Actions', packageManager: 'npm',
      testFiles: new Array(30).fill('t'), docs: new Array(8).fill('d')
    },
    hygiene: { audited: '2026-08-20T00:00:00Z', findings: [] },
    deep: { deep: true, totals: { modules: 40, edges: 90, cycles: 0, severity: { high: 0, medium: 2, low: 4 } } },
    osv: null
  }, over || {});
}

console.log('weights');

// Renormalisation is the one piece of arithmetic between an edited profile and
// a wrong grade, and an off-by-a-few there is invisible on the page.
Object.keys(G.PROFILES).forEach(function (p) {
  const sum = G.weightsFor(p).reduce(function (s, c) { return s + c.weight; }, 0);
  check(p + ' weights sum to 100', Math.abs(sum - 100) < 1e-9, String(sum));
});
check('every profile weights all eight axes',
  Object.keys(G.PROFILES).every(function (p) { return G.weightsFor(p).length === G.CATEGORIES.length; }));
check('no profile zeroes an axis outright',
  Object.keys(G.PROFILES).every(function (p) {
    return G.weightsFor(p).every(function (c) { return c.weight > 0; });
  }));

console.log('the rubric covers the checks that exist');

// The failure this guards against is silent: a check ships, fires on real
// repositories, appears in the findings list, and costs nothing.
const ids = [];
fs.readdirSync(__dirname).filter(function (f) { return /^checks-.*\.js$/.test(f); })
  .forEach(function (f) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    const re = /\bid:\s*'([a-z0-9-]+)'/g;
    let m;
    while ((m = re.exec(src))) ids.push(m[1]);
  });
check('found check ids to compare against', ids.length > 20, String(ids.length));
const uncharged = ids.filter(function (id) { return !G.PENALTIES[id]; });
check('every check id is charged to an axis', uncharged.length === 0, uncharged.join(', '));
const orphans = Object.keys(G.PENALTIES).filter(function (id) { return ids.indexOf(id) === -1; });
check('no penalty refers to a check that no longer exists', orphans.length === 0, orphans.join(', '));
const axes = G.CATEGORIES.map(function (c) { return c.key; });
check('every penalty names a real axis',
  Object.keys(G.PENALTIES).every(function (id) { return axes.indexOf(G.PENALTIES[id][0]) !== -1; }));

console.log('grading');

const healthy = G.grade(healthyRepo());
check('a healthy repository grades B or better', healthy.score >= 75, healthy.score + ' ' + healthy.letter);
check('healthy repository is not flagged partial', healthy.partial === false);
check('profile comes from the kind', healthy.profile === 'frontend', healthy.profile);
check('categories are returned worst-first',
  healthy.categories.every(function (c, i, a) { return i === 0 || a[i - 1].score <= c.score; }));

// Determinism is the whole basis for publishing the number, and the easiest
// property to lose to a stray Date.now() in a scorer.
const a = G.grade(healthyRepo()), b = G.grade(healthyRepo());
check('same inputs grade identically', JSON.stringify(a) === JSON.stringify(b));

const noTests = G.grade(healthyRepo({
  health: { hasTests: false, hasCI: true, hasLicense: true, hasReadme: true, hasLockfile: true },
  kg: Object.assign(healthyRepo().kg, { testFiles: [] }),
  hygiene: { audited: '2026-08-20T00:00:00Z', findings: [{ id: 'no-tests-at-all', title: 'x', severity: 'high', n: 1 }] }
}));
check('no tests zeroes the test axis',
  noTests.categories.find(function (c) { return c.key === 'tests'; }).score === 0);
check('no tests costs the overall grade', noTests.score < healthy.score);

const noCi = G.grade(healthyRepo({
  kg: Object.assign(healthyRepo().kg, { hasCI: false, ciPlatform: null }),
  health: Object.assign(healthyRepo().health, { hasCI: false }),
  hygiene: { audited: '2026-08-20T00:00:00Z', findings: [{ id: 'ci-absent-entirely', title: 'x', severity: 'high', n: 1 }] }
}));
check('no CI zeroes the CI axis',
  noCi.categories.find(function (c) { return c.key === 'cicd'; }).score === 0);

// A committed private key should take the security axis to the floor on its
// own; needing a second finding to get there would be the bug.
const leaked = G.grade(healthyRepo({
  hygiene: { audited: '2026-08-20T00:00:00Z', findings: [{ id: 'private-key-committed', title: 'x', severity: 'critical', n: 1 }] }
}));
check('a committed private key zeroes security',
  leaked.categories.find(function (c) { return c.key === 'security'; }).score === 0);

console.log('bounds and honesty');

check('scores stay inside 0..100',
  [healthy, noTests, noCi, leaked].every(function (g) {
    return g.score >= 0 && g.score <= 100 &&
      g.categories.every(function (c) { return c.score >= 0 && c.score <= 100; });
  }));

// The worst possible repository must still land on the scale rather than
// underflowing it, since every axis floors at zero independently. It does not
// reach a literal zero: maintenance has no finding charged against it, so an
// abandoned repository keeps the few points that axis awards for having a push
// date at all, and that residue is the floor of the scale.
const worst = G.grade(healthyRepo({
  health: { hasTests: false, hasCI: false, hasLicense: false, hasReadme: false, hasLockfile: false },
  kg: { totalFiles: 500, hasCI: false, packageManager: 'npm', testFiles: [], docs: [] },
  updatedAt: '2019-01-01T00:00:00Z',
  deep: { deep: true, totals: { modules: 40, edges: 900, cycles: 38, severity: { high: 60, medium: 200, low: 300 } } },
  hygiene: {
    audited: '2026-08-20T00:00:00Z',
    findings: Object.keys(G.PENALTIES).map(function (id) {
      return { id: id, title: id, severity: 'high', n: 5 };
    })
  }
}));
check('the worst case bottoms out without going negative',
  worst.score >= 0 && worst.score < 5, String(worst.score));
check('the worst case grades F', worst.letter === 'F');

// "Not analyzed" reading as "clean" is the failure mode that would make the
// grade dishonest rather than merely wrong.
const noDeep = G.grade(healthyRepo({ deep: null }));
check('a missing deep pass is flagged partial', noDeep.partial === true);
check('a missing deep pass does not score architecture as clean',
  noDeep.categories.find(function (c) { return c.key === 'architecture'; }).score < 92);
const thinDeep = G.grade(healthyRepo({
  deep: { deep: true, totals: { modules: 1, edges: 0, cycles: 0, severity: {} } }
}));
check('a one-module graph is treated as no analysis', thinDeep.partial === true);

check('an unaudited repository is marked unaudited', G.grade({ id: 2 }).audited === false);

console.log('ladder');

check('letters cover the range',
  G.letterFor(95) === 'A' && G.letterFor(40) === 'D' && G.letterFor(39.9) === 'F');
check('the next grade is the one above', G.nextGrade(39.8).letter === 'D');
check('the gap to the next grade is the real gap',
  Math.abs(G.nextGrade(39.8).points - 0.2) < 1e-9, String(G.nextGrade(39.8).points));
check('an A has nothing above it', G.nextGrade(96) === null);

// Repeat charges have to compound sublinearly or one noisy check would sink an
// axis that is otherwise fine.
check('repeats compound but stay capped',
  G.repeatFactor(1) === 1 && G.repeatFactor(5) > 1 && G.repeatFactor(10000) <= 1.6);

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
