#!/usr/bin/env node
/*
 * build-osv.js - name the actual vulnerabilities in the declared dependencies.
 *
 * build-deps can say "12 packages behind a major", which is a maintenance fact.
 * This turns the subset that matters into named advisories with severities, so a
 * report can say GHSA-xxxx affects the requests version this repo pins rather
 * than gesturing at staleness.
 *
 * The honesty problem is versions. 67% of the 11,424 declared dependencies carry
 * a version and almost all of those are ranges: "^1.7.0" does not mean 1.7.0 is
 * installed, it means anything up to the next major is, and npm resolves it to
 * the newest match, which is usually patched. Querying the floor and publishing
 * the result as a live vulnerability would be wrong most of the time, and this
 * audit is public.
 *
 * So a version is classified before it is used:
 *
 *   pinned    ==1.2.3, =1.2.3, or a bare 1.2.3. What installs is known, so an
 *             advisory against it is a statement about this repository.
 *   ranged    ^1.2.3, ~1.2.3, >=1.2.3. What installs is undetermined. An
 *             advisory against the floor supports only the weaker claim that the
 *             range permits a vulnerable version, which is worth reporting when
 *             nothing pins the resolution, and worth nothing when a lockfile
 *             does. The check that consumes this draws that distinction.
 *
 * Cost: api.osv.dev is unauthenticated, off GitHub's REST limit, and batches 100
 * queries per request, so the whole estate is roughly 60 requests. Advisory
 * details are fetched once per vulnerability id and cached, because those are one
 * request each and are the only part that grows.
 *
 * Usage:
 *   node scripts/build-osv.js
 *   node scripts/build-osv.js --budget 40 --dry-run
 *   node scripts/build-osv.js --refresh        # ignore the cached query results
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const numArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? parseInt(argv[i + 1], 10) : d; };
const BATCHES = numArg('--budget', 80);          // querybatch requests per run
const DETAILS = numArg('--details', 120);        // advisory lookups per run
const DRY = argv.includes('--dry-run');
const REFRESH = argv.includes('--refresh');

const OUT = path.join('data', 'osv.json');
const BATCH_SIZE = 100;
const API = 'https://api.osv.dev/v1';

// deps.json ecosystem keys to OSV's, which are exact strings and rejected when
// wrong rather than fuzzy-matched. "other" has no OSV equivalent and is dropped.
const ECOSYSTEM = {
  pypi: 'PyPI',
  npm: 'npm',
  cargo: 'crates.io',
  go: 'Go',
  rubygems: 'RubyGems',
  packagist: 'Packagist'
};

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };

/*
 * A declared constraint, reduced to the version to ask about and how much that
 * answer is worth. Returns null when there is nothing concrete to ask.
 */
function classify(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s || s === '*' || s === 'latest' || /^https?:|^git\+|^file:|^workspace:|^link:/.test(s)) return null;
  // A comma or double-pipe list is a compound constraint; the floor of the first
  // clause is the only thing that generalises, and it is a range by definition.
  const compound = /[,|]/.test(s);
  if (compound) s = s.split(/\s*(?:,|\|\|)\s*/)[0].trim();

  const m = s.match(/^([=<>~^!]*)\s*v?(\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?)/);
  if (!m) return null;
  const op = m[1];
  const version = m[2];
  // An exact pin: no operator at all, or an equality. Everything else, including
  // a bare >= floor, leaves the installed version open.
  const pinned = !compound && (op === '' || op === '==' || op === '=');
  return { version, pinned };
}

// OSV wants the Go module version with its v prefix; the others without.
function osvVersion(ecosystem, version) {
  return ecosystem === 'Go' ? 'v' + version.replace(/^v/, '') : version;
}

function collect(deps) {
  // key -> { ecosystem, name, version, pinned, repos:Set }
  const queries = new Map();
  for (const [repoId, entry] of Object.entries(deps.repos || {})) {
    for (const [key, list] of Object.entries(entry || {})) {
      const ecosystem = ECOSYSTEM[key];
      if (!ecosystem || !Array.isArray(list)) continue;
      for (const item of list) {
        const name = Array.isArray(item) ? item[0] : item;
        const rawVersion = Array.isArray(item) ? item[1] : null;
        if (!name) continue;
        const c = classify(rawVersion);
        if (!c) continue;                          // no version means no question to ask
        const k = ecosystem + '|' + name + '|' + c.version;
        let q = queries.get(k);
        if (!q) { q = { ecosystem, name, version: c.version, pinned: false, repos: new Set() }; queries.set(k, q); }
        // The same package can be pinned in one repo and ranged in another, so
        // the record keeps both: pinned is per repo, recorded below.
        q.repos.add(repoId + (c.pinned ? '!' : ''));
        if (c.pinned) q.pinned = true;
        continue;
      }
    }
  }
  return queries;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'build-osv' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000)
  });
  if (!res.ok) throw new Error('osv ' + res.status);
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'build-osv' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  return res.json();
}

// The highest severity OSV states for an advisory. Advisories carry CVSS vectors
// rather than a word, and several carry none at all, so the word is derived and
// "unknown" is kept as itself rather than guessed at.
function severityOf(vuln) {
  const db = (vuln.database_specific || {}).severity;
  if (db && /critical|high|moderate|medium|low/i.test(db)) {
    return db.toLowerCase().replace('moderate', 'medium');
  }
  const sev = (vuln.severity || []).map(s => s.score || '').join(' ');
  const m = sev.match(/CVSS:3\.\d\/([A-Z:\/]+)/);
  if (m) {
    // Only the fields needed to bucket it, rather than a full CVSS implementation.
    const av = /AV:N/.test(m[1]), ui = /UI:N/.test(m[1]), pr = /PR:N/.test(m[1]);
    const impact = (m[1].match(/[CIA]:H/g) || []).length;
    if (av && pr && ui && impact >= 2) return 'critical';
    if (av && impact >= 1) return 'high';
    return 'medium';
  }
  return 'unknown';
}

function summarise(vuln) {
  const aliases = vuln.aliases || [];
  const cve = aliases.find(a => /^CVE-/.test(a));
  return {
    id: vuln.id,
    cve: cve || null,
    severity: severityOf(vuln),
    summary: (vuln.summary || '').slice(0, 200),
    withdrawn: !!vuln.withdrawn
  };
}

async function main() {
  const deps = readJson(path.join('data', 'deps.json'), null);
  if (!deps) { console.error('data/deps.json not found. Run build-deps.js first.'); process.exit(1); }
  const store = readJson(OUT, { generated: null, queries: {}, vulns: {}, repos: {} });
  if (REFRESH) store.queries = {};

  const queries = collect(deps);
  const pending = [...queries.entries()].filter(([k]) => !store.queries[k]);

  console.log('=== OSV vulnerability lookup ===');
  console.log(`  askable dependencies: ${queries.size} | already known: ${queries.size - pending.length} | to query: ${pending.length}`);
  if (DRY) {
    const byEco = {};
    for (const q of queries.values()) byEco[q.ecosystem] = (byEco[q.ecosystem] || 0) + 1;
    console.log('  by ecosystem:', byEco);
    console.log('  (dry run)');
    return;
  }

  let asked = 0, hits = 0, failed = 0;
  for (let i = 0; i < pending.length && asked < BATCHES * BATCH_SIZE; i += BATCH_SIZE) {
    const slice = pending.slice(i, i + BATCH_SIZE);
    const body = { queries: slice.map(([, q]) => ({
      package: { name: q.name, ecosystem: q.ecosystem },
      version: osvVersion(q.ecosystem, q.version)
    })) };
    let out;
    try { out = await post(API + '/querybatch', body); } catch (e) { failed += slice.length; continue; }
    const results = out.results || [];
    for (let j = 0; j < slice.length; j++) {
      const ids = ((results[j] || {}).vulns || []).map(v => v.id);
      store.queries[slice[j][0]] = ids;
      if (ids.length) hits++;
    }
    asked += slice.length;
    process.stdout.write(`\r  queried ${asked}/${pending.length}, ${hits} affected`);
  }
  if (asked) console.log('');

  // Advisory detail, once per id ever. This is the only unbatched call, so it is
  // budgeted separately and the backlog drains over runs like everything else.
  const needed = new Set();
  for (const ids of Object.values(store.queries)) for (const id of ids) if (!store.vulns[id]) needed.add(id);
  let fetched = 0;
  for (const id of needed) {
    if (fetched >= DETAILS) break;
    const v = await getJson(API + '/vulns/' + encodeURIComponent(id));
    if (!v) continue;
    store.vulns[id] = summarise(v);
    fetched++;
    process.stdout.write(`\r  advisories ${fetched}/${Math.min(needed.size, DETAILS)}`);
  }
  if (fetched) console.log('');

  /*
   * Per-repo rollup, which is what the audit and the prompt consume. A repo's
   * entry separates the two claims the version data can support, because they
   * are different findings with different severities and only one of them is
   * unambiguous.
   */
  const repos = {};
  for (const [k, q] of queries) {
    const ids = (store.queries[k] || []).filter(id => store.vulns[id] && !store.vulns[id].withdrawn);
    if (!ids.length) continue;
    for (const tagged of q.repos) {
      const pinnedHere = tagged.endsWith('!');
      const repoId = pinnedHere ? tagged.slice(0, -1) : tagged;
      const r = repos[repoId] || (repos[repoId] = { pinned: [], ranged: [] });
      const rec = {
        package: q.name,
        ecosystem: q.ecosystem,
        version: q.version,
        vulns: ids.map(id => store.vulns[id]).sort((a, b) =>
          ['critical', 'high', 'medium', 'low', 'unknown'].indexOf(a.severity) -
          ['critical', 'high', 'medium', 'low', 'unknown'].indexOf(b.severity))
      };
      (pinnedHere ? r.pinned : r.ranged).push(rec);
    }
  }
  for (const r of Object.values(repos)) {
    const worst = list => list.reduce((w, x) => {
      const s = x.vulns[0] ? x.vulns[0].severity : 'unknown';
      const order = ['critical', 'high', 'medium', 'low', 'unknown'];
      return order.indexOf(s) < order.indexOf(w) ? s : w;
    }, 'unknown');
    r.worstPinned = r.pinned.length ? worst(r.pinned) : null;
    r.worstRanged = r.ranged.length ? worst(r.ranged) : null;
  }
  store.repos = repos;
  store.generated = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(store));

  const known = Object.keys(store.queries).length;
  const affected = Object.values(store.queries).filter(v => v.length).length;
  const pinnedRepos = Object.values(repos).filter(r => r.pinned.length).length;
  console.log(`  cached ${known} dependency answers, ${affected} affected by at least one advisory`);
  console.log(`  advisories described: ${Object.keys(store.vulns).length}`);
  console.log(`  repos with a finding: ${Object.keys(repos).length} (${pinnedRepos} of them on a pinned version)`);
  if (failed) console.log(`  ${failed} queries failed and will be retried next run`);
  const left = pending.length - asked;
  if (left > 0) console.log(`  ${left} dependencies remaining for the next run`);
  console.log(`  data/osv.json ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}

main().catch(e => { console.error('build-osv failed:', e.message); process.exit(1); });
