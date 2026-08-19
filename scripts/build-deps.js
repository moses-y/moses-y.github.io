#!/usr/bin/env node
/*
 * build-deps.js - real dependency data, replacing "staleness not yet measured".
 *
 * The knowledge graph only ever detected that a manifest EXISTS. Every report
 * therefore said dependencies were present but could say nothing about them.
 * This fetches the manifests it already knows about, parses them per format,
 * and resolves the declared packages against the registry.
 *
 * Two caches, both incremental and both committed:
 *   data/deps.json      repo -> packages, and the inverted package -> repos
 *   data/registry.json  package -> latest version + description (rarely changes)
 *
 * Budgeted per run like build-analyze, so a cron pass costs a bounded number of
 * requests and the backlog drains over successive runs.
 *
 * Usage:
 *   node scripts/build-deps.js --budget 120     # repos to fetch this run
 *   node scripts/build-deps.js --registry 200   # packages to resolve this run
 *   node scripts/build-deps.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const { parseManifest, isParseable } = require('./lib-manifest.js');

const argv = process.argv.slice(2);
const numArg = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i > -1 ? parseInt(argv[i + 1], 10) : dflt;
};
const BUDGET = numArg('--budget', 120);
const REG_BUDGET = numArg('--registry', 200);
const DRY = argv.includes('--dry-run');

const OUT = 'data';
const DEPS_FILE = path.join(OUT, 'deps.json');
const REG_FILE = path.join(OUT, 'registry.json');
const TOKEN = process.env.GITHUB_TOKEN;

// Bumped when extraction changes, so stored results from older parsers are
// re-read rather than trusted.
//   1: names, with versions for npm, PyPI and simple Cargo
//   2: versions for go.mod, Gemfile, composer.json, pubspec, Gradle and Cargo
//      inline tables, and Go module paths no longer lowercased
const DEPS_VERSION = 2;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = (p, dflt) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; }
};

// npm and PyPI are the only two registries worth the requests: they cover the
// overwhelming majority of what this estate declares.
function ecosystemOf(manifestPath) {
  if (/package\.json$/i.test(manifestPath)) return 'npm';
  if (/(requirements[^/]*\.txt|pyproject\.toml)$/i.test(manifestPath)) return 'pypi';
  if (/go\.mod$/i.test(manifestPath)) return 'go';
  if (/Cargo\.toml$/i.test(manifestPath)) return 'cargo';
  if (/composer\.json$/i.test(manifestPath)) return 'packagist';
  if (/pubspec\.yaml$/i.test(manifestPath)) return 'pub';
  if (/Gemfile$/i.test(manifestPath)) return 'rubygems';
  return 'other';
}

async function ghRaw(owner, repo, filePath) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(filePath)}`,
    { headers: Object.assign({ Accept: 'application/vnd.github.v3.raw' },
        TOKEN ? { Authorization: 'token ' + TOKEN } : {}) });
  if (!res.ok) return null;
  return res.text();
}

async function resolveNpm(name) {
  const res = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name));
  if (!res.ok) return null;
  const j = await res.json();
  const latest = (j['dist-tags'] || {}).latest || null;
  const t = latest && j.time ? j.time[latest] : null;
  return { v: latest, d: (j.description || '').slice(0, 160), t: t ? t.slice(0, 10) : null };
}

async function resolvePypi(name) {
  const res = await fetch('https://pypi.org/pypi/' + encodeURIComponent(name) + '/json');
  if (!res.ok) return null;
  const j = await res.json();
  const info = j.info || {};
  const rel = (j.releases || {})[info.version] || [];
  return { v: info.version || null, d: (info.summary || '').slice(0, 160),
           t: rel.length && rel[0].upload_time ? rel[0].upload_time.slice(0, 10) : null };
}

async function main() {
  const data = readJson('forks.json', null);
  if (!data) { console.error('forks.json not found.'); process.exit(1); }
  const forks = data.forks || [];
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const deps = readJson(DEPS_FILE, { repos: {}, generated: null });
  const registry = readJson(REG_FILE, {});

  // Repos with a parseable manifest we have not read yet, or read with an older
  // extraction. Without the version check the parser fixes never reach the stored
  // data: 366 repos were extracted when go.mod, Gemfile, composer.json, pubspec
  // and Gradle all discarded their versions, and they would have kept those
  // versionless entries permanently.
  const pending = forks.filter(f => {
    // Per repo, not per file: a file-level stamp would mark the whole estate
    // current as soon as one run finished, leaving the rest unread forever.
    const prev = deps.repos[f.id];
    if (prev && ((deps.versions || {})[f.id] || 1) >= DEPS_VERSION) return false;
    const m = ((f.knowledgeGraph || {}).dependencies) || [];
    return m.some(isParseable);
  });

  console.log('=== Dependencies ===');
  console.log(`  repos with a parseable manifest: ${forks.filter(f => (((f.knowledgeGraph||{}).dependencies)||[]).some(isParseable)).length}`);
  console.log(`  already extracted: ${Object.keys(deps.repos).length} | pending: ${pending.length}`);
  if (DRY) { console.log('  (dry run, stopping)'); return; }

  const batch = pending.slice(0, BUDGET);
  let fetched = 0, failed = 0;
  for (const f of batch) {
    const parts = String(f.url || '').split('/');
    const owner = parts[3], repo = parts[4];
    if (!owner || !repo) continue;
    const manifests = (((f.knowledgeGraph || {}).dependencies) || []).filter(isParseable).slice(0, 3);
    const found = {};
    for (const m of manifests) {
      try {
        const txt = await ghRaw(owner, repo, m);
        if (!txt) { failed++; continue; }
        const pkgs = parseManifest(m, txt);
        if (pkgs.length) found[ecosystemOf(m)] = (found[ecosystemOf(m)] || []).concat(pkgs);
        fetched++;
      } catch (e) { failed++; }
      await sleep(60);
    }
    // Recorded even when empty, so an unreadable repo is not retried every run.
    deps.repos[f.id] = {};
    if (!deps.versions) deps.versions = {};
    deps.versions[f.id] = DEPS_VERSION;
    for (const eco of Object.keys(found)) {
      const seen = new Set();
      deps.repos[f.id][eco] = found[eco]
        .filter(p => !seen.has(p.n) && seen.add(p.n))
        .slice(0, 120)
        .map(p => (p.s ? [p.n, p.s] : [p.n]));
    }
  }
  console.log(`  manifests read this run: ${fetched} (${failed} unreadable)`);

  // ---- invert: package -> repos -------------------------------------------
  const byPackage = {};
  for (const [rid, ecos] of Object.entries(deps.repos)) {
    for (const [eco, pkgs] of Object.entries(ecos)) {
      for (const entry of pkgs) {
        const p = Array.isArray(entry) ? entry[0] : entry;
        const key = eco + ':' + p;
        (byPackage[key] || (byPackage[key] = [])).push(+rid);
      }
    }
  }
  const ranked = Object.entries(byPackage).sort((a, b) => b[1].length - a[1].length);
  console.log(`  distinct packages: ${ranked.length}`);
  console.log(`  most used: ${ranked.slice(0, 8).map(([k, v]) => k.split(':')[1] + '(' + v.length + ')').join(' ')}`);

  // ---- resolve the most-used packages against their registry ---------------
  // Most-used first: those cover the most repos per request.
  const toResolve = ranked
    .filter(([k]) => /^(npm|pypi):/.test(k) && !registry[k])
    .slice(0, REG_BUDGET);
  let resolved = 0;
  for (const [key] of toResolve) {
    const [eco, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    try {
      const info = eco === 'npm' ? await resolveNpm(name) : await resolvePypi(name);
      registry[key] = info || { v: null, d: '', t: null };
      if (info) resolved++;
    } catch (e) { registry[key] = { v: null, d: '', t: null }; }
    await sleep(50);
  }
  console.log(`  registry entries resolved this run: ${resolved} (cache: ${Object.keys(registry).length})`);

  deps.generated = new Date().toISOString();
  deps.packages = Object.fromEntries(ranked.slice(0, 4000));
  fs.writeFileSync(DEPS_FILE, JSON.stringify(deps));
  fs.writeFileSync(REG_FILE, JSON.stringify(registry));

  const kb = p => (fs.statSync(p).size / 1024).toFixed(0);
  console.log(`  data/deps.json ${kb(DEPS_FILE)} KB | data/registry.json ${kb(REG_FILE)} KB`);
  const remaining = pending.length - batch.length;
  if (remaining > 0) console.log(`  ${remaining} repos remaining for the next run`);
}

main().catch(e => { console.error('build-deps failed:', e.message); process.exit(1); });
