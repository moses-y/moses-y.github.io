#!/usr/bin/env node
/*
 * blast-radius.js - what does this break, and how far away is it?
 *
 * Written to settle a specific claim rather than to ship a feature. The decision
 * log (docs/DECISIONS.md, D2/P8) predicted that transitive advisory blast radius
 * would be the first query relational SQL serves badly, and therefore the thing
 * that would justify adding a graph engine to Postgres. The way to find out is to
 * write it and time it, which is cheaper than the migration it would justify.
 *
 * It turns out to be two different questions with two different answers.
 *
 *   node src/tools/blast-radius.js --advisory GHSA-xxxx    estate: who declares it
 *   node src/tools/blast-radius.js --package npm:lodash    estate: who declares it
 *   node src/tools/blast-radius.js --module <id>           code: what depends on it
 *   node src/tools/blast-radius.js --bench                 time all of the above
 */
'use strict';

const { open } = require('../lib/lib-db.js');
const db = open();

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };

/*
 * The estate question: an advisory names packages, which repositories declare
 * them. Two hops, both of them joins, and the depth is known when the query is
 * written - so this is not a traversal at all and never needed to be. It is
 * listed here because the prediction was that it would be one.
 */
function estateFromAdvisory(osvId) {
  return db.prepare(`
    SELECT r.id, r.name, af.package_name, af.ecosystem, af.version_range,
           ra.status
    FROM advisory_affects af
    JOIN dependency d ON d.ecosystem = af.ecosystem AND d.package_name = af.package_name
    JOIN repo r ON r.id = d.repo_id
    LEFT JOIN repo_advisory ra ON ra.repo_id = r.id AND ra.osv_id = af.osv_id
    WHERE af.osv_id = ?
    ORDER BY r.name`).all(osvId);
}

function estateFromPackage(ecosystem, name) {
  return db.prepare(`
    SELECT r.id, r.name, d.spec, a.osv_id, a.severity
    FROM dependency d
    JOIN repo r ON r.id = d.repo_id
    LEFT JOIN advisory_affects af ON af.ecosystem = d.ecosystem AND af.package_name = d.package_name
    LEFT JOIN advisory a ON a.osv_id = af.osv_id
    WHERE d.ecosystem = ? AND d.package_name = ?
    ORDER BY r.name`).all(ecosystem, name);
}

/*
 * The code question, and the only one here that genuinely traverses: which
 * modules transitively import this one. Depth is not known when the query is
 * written - it is whatever the import graph happens to be - so this is a
 * recursive CTE walking import_edge backwards.
 *
 * MIN(depth), and the reason matters. A naive `UNION` over (id, depth) returns a
 * module once for every distinct depth it is reachable at, which in a graph with
 * any diamond in it is most of them: the first version of this query reported
 * 13,907 affected modules in a repository that contains 1,200. That number is not
 * wrong by a little, it is a different quantity - path count, not impact set -
 * and it reads as a catastrophe rather than a diamond. The shortest path is the
 * honest answer to "how far away is it".
 *
 * The depth ceiling is a guard, not a limit: a cycle in the import graph would
 * otherwise walk forever, and this estate has 9,515 modules sitting in one.
 */
const REVERSE = `
  WITH RECURSIVE impact(id, depth) AS (
    SELECT ?, 0
    UNION
    SELECT e.from_module_id, impact.depth + 1
    FROM import_edge e
    JOIN impact ON e.to_module_id = impact.id
    WHERE impact.depth < ?
  )
  SELECT m.id, m.path, m.ca, m.in_cycle, MIN(i.depth) AS depth
  FROM impact i JOIN module m ON m.id = i.id
  WHERE i.depth > 0
  GROUP BY m.id
  ORDER BY depth, m.path`;

function dependents(moduleId, maxDepth = 20) {
  return db.prepare(REVERSE).all(moduleId, maxDepth);
}

function bench() {
  const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
  const best = (f, n = 5) => { let b = Infinity, last; for (let i = 0; i < n; i++) { const [t, r] = ms(f); b = Math.min(b, t); last = r; } return [b, last]; };
  const line = (label, t, rows) =>
    console.log(`  ${t.toFixed(2).padStart(8)} ms  ${String(rows).padStart(6)} rows  ${label}`);

  const scale = db.prepare(`SELECT
    (SELECT count(*) FROM repo) repos, (SELECT count(*) FROM module) modules,
    (SELECT count(*) FROM import_edge) edges, (SELECT count(*) FROM dependency) deps,
    (SELECT count(*) FROM advisory) advisories`).get();
  console.log(`scale: ${scale.repos} repos, ${scale.modules} modules, ${scale.edges} import edges, ` +
    `${scale.deps} dependency edges, ${scale.advisories} advisories\n`);

  console.log('estate blast radius (joins, depth known)');
  const widest = db.prepare(`
    SELECT a.osv_id, count(DISTINCT d.repo_id) n FROM advisory a
    JOIN advisory_affects af ON af.osv_id = a.osv_id
    JOIN dependency d ON d.ecosystem = af.ecosystem AND d.package_name = af.package_name
    WHERE a.severity = 'high' GROUP BY a.osv_id ORDER BY n DESC LIMIT 1`).get();
  if (widest) {
    const [t, r] = best(() => estateFromAdvisory(widest.osv_id));
    line(`widest high-severity advisory (${widest.osv_id})`, t, r.length);
  }
  const [ta, ra] = best(() => db.prepare(`
    SELECT a.osv_id, d.repo_id FROM advisory a
    JOIN advisory_affects af ON af.osv_id = a.osv_id
    JOIN dependency d ON d.ecosystem = af.ecosystem AND d.package_name = af.package_name
    WHERE a.severity = 'high'`).all());
  line('every high-severity advisory at once', ta, ra.length);

  console.log('\ncode blast radius (recursive, depth unknown)');
  const big = db.prepare(`SELECT repo_id, count(*) n FROM module GROUP BY repo_id ORDER BY n DESC LIMIT 10`).all();
  let worst = 0, worstRows = 0;
  for (const b of big) {
    const m = db.prepare('SELECT id FROM module WHERE repo_id=? ORDER BY ca DESC LIMIT 1').get(b.repo_id);
    if (!m) continue;
    const [t, r] = best(() => dependents(m.id), 3);
    if (t > worst) { worst = t; worstRows = r.length; }
  }
  line(`worst of the 10 largest repositories`, worst, worstRows);

  // The plan is part of the measurement. "AUTOMATIC COVERING INDEX" here means
  // SQLite is building a throwaway index on every call, which is what the
  // 003-traversal migration exists to stop.
  const plan = db.prepare('EXPLAIN QUERY PLAN ' + REVERSE).all(1, 20)
    .map(r => r.detail).filter(d => /import_edge|idx_import|AUTOMATIC/.test(d));
  console.log('\n  plan for the recursive step:');
  plan.forEach(d => console.log('    ' + d));
  if (plan.some(d => /AUTOMATIC/.test(d))) {
    console.log('    ^ no usable index - run the migrations; this costs about 130x');
  }
}

if (argv.includes('--bench')) { bench(); process.exit(0); }

const adv = arg('--advisory'), pkg = arg('--package'), mod = arg('--module');
if (adv) {
  const rows = estateFromAdvisory(adv);
  console.log(`${adv}: ${rows.length} repositories declare an affected package\n`);
  rows.slice(0, 40).forEach(r =>
    console.log(`  ${r.name}  ${r.ecosystem}:${r.package_name} ${r.version_range || ''} ${r.status || '(not linked)'}`));
} else if (pkg) {
  const [eco, ...rest] = pkg.split(':');
  const rows = estateFromPackage(eco, rest.join(':'));
  const vulns = [...new Set(rows.filter(r => r.osv_id).map(r => r.osv_id))];
  console.log(`${pkg}: declared by ${new Set(rows.map(r => r.id)).size} repositories, ` +
    `${vulns.length} advisories against it\n`);
  [...new Set(rows.map(r => r.name))].slice(0, 40).forEach(n => console.log('  ' + n));
} else if (mod) {
  const m = db.prepare('SELECT id, path, repo_id FROM module WHERE id = ?').get(Number(mod));
  if (!m) { console.error('no module with id ' + mod); process.exit(1); }
  const rows = dependents(m.id);
  const hist = {};
  rows.forEach(r => { hist[r.depth] = (hist[r.depth] || 0) + 1; });
  console.log(`${m.path}: ${rows.length} modules transitively import it`);
  console.log('  by distance: ' + Object.entries(hist).map(([d, n]) => `${d}:${n}`).join('  ') + '\n');
  rows.slice(0, 40).forEach(r => console.log(`  ${String(r.depth).padStart(2)}  ${r.path}`));
} else {
  console.log('usage: --advisory <osv-id> | --package <eco>:<name> | --module <id> | --bench');
}
