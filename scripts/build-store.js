#!/usr/bin/env node
/*
 * build-store.js - loads the published JSON into the relational store.
 *
 * This runs ALONGSIDE the existing pipeline, not instead of it. Nothing reads
 * the database yet. That is deliberate: the way to migrate a store that is
 * rebuilt every two hours is to build the new one from the old one, prove it
 * round-trips, and only then move readers across. Cutting over first would mean
 * debugging the schema and the pipeline at the same time.
 *
 * Its immediate value is as a check. Loading six denormalised JSON files into
 * one schema with enforced foreign keys is the first time anything has verified
 * that they agree - a finding charged to an axis that does not exist, or a
 * grade for a repo that is not in the census, fails the insert instead of
 * quietly rendering.
 *
 *   node scripts/build-store.js            # core + reference data
 *   node scripts/build-store.js --deep     # also per-repo modules and symbols
 *   node scripts/build-store.js --verify   # counts against the JSON sources
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { open, tx, bool } = require('./lib-db.js');
const G = require('./lib-grade.js');

const argv = process.argv.slice(2);
const DEEP = argv.includes('--deep');
const VERIFY = argv.includes('--verify');

const readJson = (p, d) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; }
};

/*
 * The reference tables, and the reason this migration exists. PROFILES and
 * PENALTIES are relationships: profile x axis -> weight, and check x axis ->
 * cost. They were a nested object and a two-element array, which is why the
 * weights a repo was graded under had to be copied onto all 1,440 grade
 * records, and why a check charged to no axis was invisible until a test went
 * looking for it.
 */
function loadReference(db) {
  const counts = {};

  const axis = db.prepare('INSERT INTO axis (key,label,default_weight) VALUES (?,?,?)');
  for (const c of G.CATEGORIES) axis.run(c.key, c.label, c.weight);
  counts.axis = G.CATEGORIES.length;

  const prof = db.prepare('INSERT INTO profile (name) VALUES (?)');
  const pw = db.prepare('INSERT INTO profile_weight (profile,axis_key,weight) VALUES (?,?,?)');
  let weights = 0;
  for (const name of Object.keys(G.PROFILES)) {
    prof.run(name);
    // weightsFor is the authority: a profile lists only its overrides, the rest
    // fall back to the axis default, and then the whole set is RENORMALISED to
    // sum to 100. Reimplementing the fallback here without the renormalisation
    // produced weights summing to 90-106, which is exactly the drift this table
    // exists to prevent - so call the real function rather than model it twice.
    for (const c of G.weightsFor(name)) {
      pw.run(name, c.key, c.weight);
      weights++;
    }
  }
  counts.profile = Object.keys(G.PROFILES).length;
  counts.profile_weight = weights;

  // Family comes from the file that declares the check, which is the only
  // place that knowledge exists.
  const family = {};
  for (const f of fs.readdirSync('scripts').filter(n => /^checks-.*\.js$/.test(n))) {
    if (f === 'checks-hygiene.js') continue;           // a barrel, declares nothing
    const src = fs.readFileSync(path.join('scripts', f), 'utf8');
    const fam = f.replace(/^checks-|\.js$/g, '');
    let m; const re = /\bid:\s*'([a-z0-9-]+)'/g;
    while ((m = re.exec(src))) family[m[1]] = fam;
  }

  const chk = db.prepare('INSERT OR IGNORE INTO check_def (id,family,checks_version) VALUES (?,?,?)');
  const chg = db.prepare('INSERT OR IGNORE INTO grade_charge (check_id,axis_key,cost) VALUES (?,?,?)');
  let charges = 0;
  for (const [id, rule] of Object.entries(G.PENALTIES)) {
    chk.run(id, family[id] || null, G.CHECKS_VERSION || 1);
    chg.run(id, rule[0], rule[1]);
    charges++;
  }
  // Checks that exist but are charged to nothing would otherwise never appear.
  for (const [id, fam] of Object.entries(family)) chk.run(id, fam, G.CHECKS_VERSION || 1);
  counts.check_def = db.prepare('SELECT count(*) c FROM check_def').get().c;
  counts.grade_charge = charges;

  return counts;
}

function loadCore(db, forks) {
  const counts = { repo: 0, article: 0, knowledge_graph: 0, subproject: 0 };
  const byName = new Map(forks.map(f => [String(f.name).toLowerCase(), f.id]));

  const repo = db.prepare(`INSERT INTO repo
    (id,name,display_name,description,url,language,stars,forks,type,image,
     forked_at,updated_at,read_time,parent_id,parent_name,parent_url,parent_stars)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const art = db.prepare('INSERT INTO article (repo_id,summary,article_version) VALUES (?,?,?)');
  const kg = db.prepare(`INSERT INTO knowledge_graph
    (repo_id,total_files,has_docker,has_ci,ci_platform,package_manager,
     test_file_count,doc_count,is_collection) VALUES (?,?,?,?,?,?,?,?,?)`);
  const sub = db.prepare('INSERT OR IGNORE INTO subproject (repo_id,path,files,notebooks) VALUES (?,?,?,?)');

  // Pass one: repos with no parent link, so the self-reference can resolve.
  for (const f of forks) {
    repo.run(f.id, f.name, f.displayName || null, f.description || null, f.url || null,
      f.language || null, f.stars || 0, f.forks || 0,
      f.type === 'original' ? 'original' : 'fork', f.image || null,
      f.forkedAt || null, f.updatedAt || null, f.readTime || 2,
      null, f.parent?.name || null, f.parent?.url || null, f.parent?.stars ?? null);
    counts.repo++;
  }

  // Pass two: link upstreams that are themselves in the estate. The rest keep
  // the denormalised name/url, because the upstream is genuinely external.
  const link = db.prepare('UPDATE repo SET parent_id = ? WHERE id = ?');
  let linked = 0;
  for (const f of forks) {
    const pn = f.parent?.name;
    if (!pn) continue;
    const short = String(pn).split('/').pop().toLowerCase();
    const pid = byName.get(short);
    if (pid && pid !== f.id) { link.run(pid, f.id); linked++; }
  }
  counts.parent_linked = linked;

  for (const f of forks) {
    if (f.summary) { art.run(f.id, f.summary, f.av || 1); counts.article++; }
    const k = f.knowledgeGraph;
    if (k) {
      kg.run(f.id, k.totalFiles ?? null, bool(k.hasDocker), bool(k.hasCI),
        k.ciPlatform || null, k.packageManager || null,
        (k.testFiles || []).length, (k.docs || []).length, bool(k.isCollection));
      counts.knowledge_graph++;
      for (const sp of (k.subProjects || [])) {
        sub.run(f.id, sp.path || sp.name || '?', sp.files ?? null, sp.notebooks ?? null);
        counts.subproject++;
      }
    }
  }
  return counts;
}

function loadGrades(db, ids) {
  const g = readJson(path.join('data', 'grades.json'), null);
  // The real audit timestamp lives in hygiene.json, under the same field name.
  const hyg = readJson(path.join('data', 'hygiene.json'), { repos: {} });
  const auditedAt = new Map(Object.entries(hyg.repos || {}).map(([k, v]) => [k, v.audited]));
  if (!g || !g.repos) return { grade: 0, grade_axis: 0 };
  const counts = { grade: 0, grade_axis: 0, skipped_unknown_repo: 0 };
  const ins = db.prepare(`INSERT OR IGNORE INTO grade
    (repo_id,score,letter,next_letter,next_points,profile,audited,audited_at,partial)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const ax = db.prepare(`INSERT OR IGNORE INTO grade_axis
    (repo_id,axis_key,weight,score,evidence,partial) VALUES (?,?,?,?,?,?)`);
  const profiles = new Set(Object.keys(G.PROFILES));

  for (const [id, r] of Object.entries(g.repos)) {
    const rid = Number(id);
    if (!ids.has(rid)) { counts.skipped_unknown_repo++; continue; }
    ins.run(rid, r.score ?? null, r.letter || null,
      r.next?.letter || null, r.next?.points ?? null,
      profiles.has(r.profile) ? r.profile : null,
      bool(r.audited), auditedAt.get(String(rid)) || null, bool(r.partial));
    counts.grade++;
    for (const c of (r.categories || [])) {
      ax.run(rid, c.key, c.weight ?? null, c.score ?? null, c.evidence || null, bool(c.partial));
      counts.grade_axis++;
    }
  }
  return counts;
}

function loadFindings(db, ids) {
  const h = readJson(path.join('data', 'hygiene.json'), null);
  if (!h || !h.repos) return { finding: 0 };
  const counts = { finding: 0, skipped_unknown_repo: 0 };
  const known = new Set(db.prepare('SELECT id FROM check_def').all().map(r => r.id));
  const ins = db.prepare(`INSERT INTO finding
    (repo_id,check_id,severity,category,title,where_at,evidence,why,fix,rank,n,checks_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const [id, r] of Object.entries(h.repos)) {
    const rid = Number(id);
    if (!ids.has(rid)) { counts.skipped_unknown_repo++; continue; }
    for (const f of (r.findings || [])) {
      ins.run(rid, known.has(f.id) ? f.id : null, f.severity || null, f.category || null,
        f.title || null, f.where || null, f.evidence || null, f.why || null,
        f.fix || null, f.rank ?? null, f.n || 1, r.v || null);
      counts.finding++;
    }
  }
  return counts;
}

function loadSupplyChain(db, ids) {
  const counts = { package: 0, dependency: 0, advisory: 0, advisory_affects: 0, repo_advisory: 0 };

  const reg = readJson(path.join('data', 'registry.json'), {}) || {};
  const pkg = db.prepare('INSERT OR IGNORE INTO package (ecosystem,name,latest_version,description,published_at) VALUES (?,?,?,?,?)');
  for (const [key, v] of Object.entries(reg)) {
    const i = key.indexOf(':');
    if (i < 0) continue;
    pkg.run(key.slice(0, i), key.slice(i + 1), v.v || null, v.d || null, v.t || null);
    counts.package++;
  }

  const deps = readJson(path.join('data', 'deps.json'), null);
  const dep = db.prepare('INSERT OR IGNORE INTO dependency (repo_id,ecosystem,package_name,spec) VALUES (?,?,?,?)');
  if (deps && deps.repos) {
    for (const [id, ecos] of Object.entries(deps.repos)) {
      const rid = Number(id);
      if (!ids.has(rid)) continue;
      for (const [eco, list] of Object.entries(ecos)) {
        for (const entry of list) {
          const name = Array.isArray(entry) ? entry[0] : entry;
          const spec = Array.isArray(entry) ? (entry[1] || null) : null;
          dep.run(rid, eco, name, spec);
          counts.dependency++;
        }
      }
    }
  }

  const osv = readJson(path.join('data', 'osv.json'), null);
  if (osv) {
    const adv = db.prepare('INSERT OR IGNORE INTO advisory (osv_id,severity,summary) VALUES (?,?,?)');
    for (const [id, v] of Object.entries(osv.vulns || {})) {
      adv.run(id, v.severity || null, v.summary || null);
      counts.advisory++;
    }
    const aff = db.prepare('INSERT OR IGNORE INTO advisory_affects (osv_id,ecosystem,package_name,version_range) VALUES (?,?,?,?)');
    const ra = db.prepare('INSERT OR IGNORE INTO repo_advisory (repo_id,osv_id,status) VALUES (?,?,?)');
    const seenAdv = new Set(Object.keys(osv.vulns || {}));
    // pinned  -> the repo declares an affected version: confirmed.
    // ranged  -> the version could not be resolved: a weaker claim, kept weaker.
    for (const [id, r] of Object.entries(osv.repos || {})) {
      const rid = Number(id);
      if (!ids.has(rid)) continue;
      for (const [bucket, status] of [['pinned', 'confirmed'], ['ranged', 'version-unknown']]) {
        for (const p of (r[bucket] || [])) {
          for (const v of (p.vulns || [])) {
            if (!seenAdv.has(v.id)) { adv.run(v.id, v.severity || null, v.summary || null); seenAdv.add(v.id); counts.advisory++; }
            aff.run(v.id, (p.ecosystem || '').toLowerCase(), p.package, p.version || null);
            counts.advisory_affects++;
            ra.run(rid, v.id, status);
            counts.repo_advisory++;
          }
        }
      }
    }
  }
  return counts;
}

function loadClusters(db, ids) {
  const c = readJson(path.join('data', 'clusters.json'), null);
  if (!c || !c.clusters) return { cluster: 0, cluster_member: 0 };
  const counts = { cluster: 0, cluster_member: 0 };
  const ins = db.prepare(`INSERT OR IGNORE INTO cluster
    (id,size,method,threshold,mean_score,cross_domain,keeper_repo_id) VALUES (?,?,?,?,?,?,?)`);
  const mem = db.prepare('INSERT OR IGNORE INTO cluster_member (cluster_id,repo_id) VALUES (?,?)');
  for (const cl of c.clusters) {
    const keeper = cl.keeper && ids.has(cl.keeper.id) ? cl.keeper.id : null;
    ins.run(cl.id, cl.size ?? null, c.method || null, c.threshold ?? null,
      cl.meanScore ?? null, bool(cl.crossDomain), keeper);
    counts.cluster++;
    for (const m of (cl.members || [])) {
      const rid = typeof m === 'object' ? m.id : m;
      if (!ids.has(rid)) continue;
      mem.run(cl.id, rid);
      counts.cluster_member++;
    }
  }
  return counts;
}

function loadDeep(db, ids) {
  const counts = { module: 0, import_edge: 0, symbol: 0, entry_point: 0, effect: 0 };
  const mod = db.prepare('INSERT OR IGNORE INTO module (repo_id,path,ca,ce,instability,in_cycle) VALUES (?,?,?,?,?,?)');
  const edge = db.prepare('INSERT OR IGNORE INTO import_edge (repo_id,from_module_id,to_module_id) VALUES (?,?,?)');
  const sym = db.prepare('INSERT INTO symbol (repo_id,name,kind,file,line) VALUES (?,?,?,?,?)');
  const ep = db.prepare('INSERT INTO entry_point (repo_id,file,line,reach) VALUES (?,?,?,?)');
  const eff = db.prepare('INSERT OR IGNORE INTO effect (repo_id,kind,count) VALUES (?,?,?)');
  const modId = db.prepare('SELECT id FROM module WHERE repo_id=? AND path=?');

  for (const rid of ids) {
    const deep = readJson(path.join('structure', rid + '.deep.json'), null);
    if (deep) {
      const mods = deep.modules || deep.nodes || [];
      for (const m of mods) {
        const p = m.path || m.id || m.name;
        if (!p) continue;
        mod.run(rid, p, m.ca ?? null, m.ce ?? null, m.instability ?? null, bool(m.inCycle || m.in_cycle));
        counts.module++;
      }
      for (const e of (deep.edges || [])) {
        const a = modId.get(rid, e.from || e.source), b = modId.get(rid, e.to || e.target);
        if (a && b) { edge.run(rid, a.id, b.id); counts.import_edge++; }
      }
      for (const e of ((deep.flow || {}).entries || [])) {
        ep.run(rid, e.file || '?', e.line ?? null, e.reach ?? null);
        counts.entry_point++;
      }
      const effects = (deep.flow || {}).effects || deep.effects || {};
      for (const [kind, n] of Object.entries(effects)) {
        if (typeof n === 'number') { eff.run(rid, kind, n); counts.effect++; }
      }
    }
    const sj = readJson(path.join('data', 'symbols', rid + '.json'), null);
    if (sj && Array.isArray(sj.symbols)) {
      for (const s of sj.symbols) {
        sym.run(rid, s.n, s.k || 'function', s.f || null, s.l ?? null);
        counts.symbol++;
      }
    }
  }
  return counts;
}

function main() {
  const t0 = Date.now();
  console.log('=== Relational store ===');

  const data = readJson('forks.json', null);
  if (!data) { console.error('forks.json not found. Run update-forks.js first.'); process.exit(1); }
  const forks = data.forks || [];

  const dbPath = process.env.GLOSSA_DB || path.join('.state', 'glossa.db');
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix, { force: true });
  }

  const db = open({ path: dbPath });
  const ids = new Set(forks.map(f => f.id));
  const all = {};

  tx(db, () => Object.assign(all, loadReference(db)));
  tx(db, () => Object.assign(all, loadCore(db, forks)));
  tx(db, () => Object.assign(all, loadGrades(db, ids)));
  tx(db, () => Object.assign(all, loadFindings(db, ids)));
  tx(db, () => Object.assign(all, loadSupplyChain(db, ids)));
  tx(db, () => Object.assign(all, loadClusters(db, ids)));
  if (DEEP) tx(db, () => Object.assign(all, loadDeep(db, ids)));

  for (const [k, v] of Object.entries(all)) {
    console.log('  ' + k.padEnd(24) + String(v).padStart(8));
  }

  // Enforced foreign keys are the point; report any violation loudly rather
  // than leaving it to be discovered by a page rendering something impossible.
  const bad = db.prepare('PRAGMA foreign_key_check').all();
  console.log('  ' + 'foreign key violations'.padEnd(24) + String(bad.length).padStart(8));
  if (bad.length) {
    console.error('  FK VIOLATIONS:', JSON.stringify(bad.slice(0, 5)));
    process.exitCode = 1;
  }

  db.exec('PRAGMA optimize');
  const size = fs.existsSync(dbPath) ? (fs.statSync(dbPath).size / 1048576).toFixed(1) : '?';
  console.log(`  ${'database'.padEnd(24)}${(size + ' MB').padStart(8)}  ${dbPath}`);
  console.log(`  ${'elapsed'.padEnd(24)}${(((Date.now() - t0) / 1000).toFixed(1) + ' s').padStart(8)}`);

  if (VERIFY) verify(db, forks);
  db.close();
}

function verify(db, forks) {
  console.log('\n  --- verify against the JSON sources ---');
  const q = s => db.prepare(s).get().c;
  const rows = [
    ['repo', q('SELECT count(*) c FROM repo'), forks.length],
    ['article', q('SELECT count(*) c FROM article'), forks.filter(f => f.summary).length],
    ['axis', q('SELECT count(*) c FROM axis'), G.CATEGORIES.length],
    ['grade_charge', q('SELECT count(*) c FROM grade_charge'), Object.keys(G.PENALTIES).length],
  ];
  for (const [name, got, want] of rows) {
    console.log('  ' + name.padEnd(16) + String(got).padStart(7) + ' vs ' + String(want).padEnd(7) +
      (got === want ? 'match' : 'MISMATCH'));
    if (got !== want) process.exitCode = 1;
  }
  const w = db.prepare('SELECT profile, round(sum(weight),2) t FROM profile_weight GROUP BY profile').all();
  for (const r of w) {
    console.log('  weights ' + String(r.profile).padEnd(10) + String(r.t).padStart(8) +
      (Math.abs(r.t - 100) < 0.01 ? '  sum to 100' : '  DOES NOT SUM TO 100'));
  }
}

if (require.main === module) main();
module.exports = { loadReference, loadCore };
