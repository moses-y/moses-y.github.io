#!/usr/bin/env node
/*
 * build-hygiene.js - run the code-health audit across the estate.
 *
 * One REST request per repo for the tree, then a bounded number of file reads
 * from raw.githubusercontent.com, which is not on the REST rate limit. A full
 * sweep of 1,322 repos is therefore about 1,322 API requests, a quarter of one
 * hour's allowance, but it is still budgeted per run like build-deps and
 * build-symbols so a cron pass has a predictable ceiling and the backlog drains
 * over successive runs.
 *
 * Results are incremental and committed: data/hygiene.json holds the findings
 * per repo, keyed by repo id, plus the audit date so a repo can be re-checked
 * when it changes rather than every run.
 *
 * Dismissed findings live in data/hygiene-dismissed.json, hand-edited. A finding
 * judged not worth acting on stays gone instead of resurfacing every two hours.
 *
 * Usage:
 *   node src/stages/build-hygiene.js --budget 60
 *   node src/stages/build-hygiene.js --only <repo-name>
 *   node src/stages/build-hygiene.js --recheck-after 14   # days before a re-audit
 *   node src/stages/build-hygiene.js --dry-run
 */
'use strict';
const fs = require('fs');
const path = require('path');
const hygiene = require('../lib/lib-hygiene.js');
require('../checks/checks-hygiene.js');            // registers the checks
const runtime = require('../checks/checks-runtime.js');
const { mapLimit } = require('../lib/lib-net.js');

const argv = process.argv.slice(2);
const numArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? parseInt(argv[i + 1], 10) : d; };
const strArg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };
const BUDGET = numArg('--budget', 60);
const ONLY = strArg('--only', '');
const RECHECK_DAYS = numArg('--recheck-after', 14);
// Raised from 14 with the runtime catalogue, which needs the config files that
// govern the running process on top of the secret and workflow reads. raw is not
// on the REST limit, so the extra cost is bandwidth and time, not API budget.
const READS = numArg("--reads", 20);
const RUN_MS = numArg('--max-seconds', 300) * 1000;
const DRY = argv.includes('--dry-run');
const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_USERNAME || 'moses-y';

const OUT = path.join('data', 'hygiene.json');
const DISMISSED = path.join('data', 'hygiene-dismissed.json');
const OSV = path.join('data', 'osv.json');

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };
const ghHeaders = () => Object.assign({ 'User-Agent': 'build-hygiene' },
  TOKEN ? { Authorization: 'token ' + TOKEN } : {});

async function fetchTree(name) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${name}/git/trees/HEAD?recursive=1`,
    { headers: ghHeaders(), signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.tree) return null;
  // truncated means the repo is enormous; the audit still runs on what arrived,
  // and the flag is recorded so a finding is never read as complete coverage.
  return { files: j.tree.filter(t => t.type === 'blob').map(t => ({ path: t.path, size: t.size || 0 })),
           truncated: !!j.truncated };
}

// Reads go to raw rather than the contents API: same bytes, no REST budget.
async function fetchRaw(name, filePath) {
  const enc = filePath.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`https://raw.githubusercontent.com/${OWNER}/${name}/HEAD/${enc}`,
    { headers: { 'User-Agent': 'build-hygiene' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  return res.text();
}

// Checks are synchronous by design - a check that could await would make the
// read budget impossible to reason about - so the files a repo needs are
// resolved up front, in one pass, and handed over as a map.
async function prefetch(name, ctxTree, wanted) {
  // The paths are chosen up front and none of the reads depends on another, so
  // awaiting them one at a time cost this stage its whole time budget: 80 repos
  // x 20 reads was 1,600 strictly serial round trips, and --max-seconds cut the
  // run off long before --budget did. Selection stays exactly as it was - the
  // priority order in pathsToRead is what decides which 20 paths are worth a
  // slot - only the fetching overlaps.
  const take = [];
  for (const p of wanted) {
    if (take.length >= READS) break;
    if (!ctxTree.has(p)) continue;
    take.push(p);
  }
  const bodies = await mapLimit(take, 6, p => fetchRaw(name, p));
  const map = new Map();
  take.forEach((p, i) => map.set(p, bodies[i]));
  return map;
}

// Which paths earn a read, in priority order. The budget is spent once and
// shared, so a secret-shaped file outranks a README: confirming a credential is
// worth more than confirming prose.
//
// Workflow files are ranked rather than taken in directory order, because a repo
// can hold 33 of them and the deploy one matters far more than a stale-issue bot.
function workflowScore(path, size) {
  const base = path.split('/').pop();
  let s = 0;
  if (/(deploy|release|publish|cd|pages|docker|npm|pypi|cargo|sign)/i.test(base)) s += 100;
  if (/(ci|test|build|main|lint|check)/i.test(base)) s += 60;
  if (size > 4096) s += 40;
  if (/(codeql|security|scan)/i.test(base)) s += 30;
  if (/(stale|label|greet|lock|issue|welcome|triage|sponsor|comment)/i.test(base)) s -= 50;
  return s;
}

function pathsToRead(files) {
  const has = re => files.filter(f => re.test(f.path));
  const ordered = [];
  // A Set alongside the array: `ordered.includes` was a linear scan per candidate
  // path, and the ordering it protects is load-bearing, so the array stays.
  const seen = new Set();
  const push = arr => { for (const p of arr) if (!seen.has(p)) { seen.add(p); ordered.push(p); } };

  // 1. Anything secret-shaped, because a confirmed credential is the finding
  //    that most deserves a slot.
  push(has(/(^|\/)\.env($|\.[A-Za-z0-9_.-]+$)/)
    .filter(f => !/\.(example|sample|template|dist|md|txt|html)$/i.test(f.path))
    .slice(0, 3).map(f => f.path));
  push(has(/(^|\/)(\.npmrc|\.pypirc|\.aws\/credentials)$/).slice(0, 1).map(f => f.path));
  push(has(/(service[-_]?account|client_secret)[^/]*\.json$/i).slice(0, 1).map(f => f.path));

  // 2. .gitignore: the contradiction rule is the highest-precision check there is.
  push(has(/^\.gitignore$/).map(f => f.path));

  // 3. Workflows, ranked.
  const wf = has(/^\.github\/workflows\/[^/]+\.ya?ml$/)
    .sort((a, b) => workflowScore(b.path, b.size) - workflowScore(a.path, a.size) ||
      a.path.localeCompare(b.path));
  push(wf.slice(0, 4).map(f => f.path));

  // 4. Build and dependency surfaces.
  push(has(/^(Dockerfile|Containerfile)$/).slice(0, 1).map(f => f.path));
  push(has(/^package\.json$/).map(f => f.path));

  // 5. Notebooks, largest first, since stored output carries the risk.
  push(has(/\.ipynb$/).filter(f => f.size <= 4194304)
    .sort((a, b) => b.size - a.size).slice(0, 3).map(f => f.path));

  push(has(/^\.gitattributes$/).map(f => f.path));

  // 6. The runtime catalogue picks its own files, because "which file governs
  //    the running process" is a judgement about names and depth that belongs
  //    next to the rules that depend on it. It goes last: a confirmed credential
  //    or a workflow that ships is worth a slot ahead of a settings module.
  // One pass to index, rather than a full scan of the repo's file list on every
  // sizeOf call. On a 10k-file repo that was ~500k comparisons per repository.
  const sizeByPath = new Map(files.map(f => [f.path, f.size || 0]));
  const shim = {
    tree: files,
    find: re => files.map(f => f.path).filter(p => re.test(p)),
    sizeOf: p => sizeByPath.get(p) || 0
  };
  push(runtime.selectPaths(shim));

  return ordered;
}

async function main() {
  const data = readJson('forks.json', null);
  if (!data) { console.error('forks.json not found. Run update-forks.js first.'); process.exit(1); }
  const forks = data.forks || [];
  const store = readJson(OUT, { generated: null, repos: {} });
  const dismissed = readJson(DISMISSED, {});
  // Loaded once: the advisory data is one file for the whole estate, and a repo
  // absent from it has not been looked up rather than been found clean.
  const osvByRepo = (readJson(OSV, { repos: {} }) || {}).repos || {};

  const cutoff = Date.now() - RECHECK_DAYS * 86400000;
  const due = forks.filter(f => {
    if (ONLY) return f.name === ONLY;
    const prev = store.repos[f.id];
    if (!prev) return true;
    // A result produced by older rules is not trusted: fixed false positives
    // would otherwise stay published until the recheck window expired.
    if ((prev.v || 1) !== hygiene.CHECKS_VERSION) return true;
    return !prev.audited || Date.parse(prev.audited) < cutoff;
  });

  console.log('=== Code health audit ===');
  console.log(`  checks registered: ${hygiene.CHECKS.length}`);
  console.log(`  repos audited before: ${Object.keys(store.repos).length} | due now: ${due.length}`);
  if (DRY) { console.log('  (dry run)'); return; }
  if (!due.length) { console.log('  nothing due'); return; }

  const t0 = Date.now();
  let done = 0, failed = 0, findings = 0;

  for (const f of due.slice(0, BUDGET)) {
    if (Date.now() - t0 > RUN_MS) { console.log('  time budget reached, stopping early'); break; }
    let tree;
    try { tree = await fetchTree(f.name); } catch (e) { tree = null; }
    if (!tree) { failed++; continue; }

    const paths = new Set(tree.files.map(x => x.path));
    const files = await prefetch(f.name, paths, pathsToRead(tree.files));

    const wfCount = tree.files.filter(f => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f.path)).length;
    const ctx = hygiene.makeContext({
      tree: tree.files,
      readFile: p => (files.has(p) ? files.get(p) : null),
      kg: f.knowledgeGraph,
      deep: readJson(path.join('structure', f.id + '.deep.json'), null),
      symbols: readJson(path.join('data', 'symbols', f.id + '.json'), null),
      isOriginal: f.type === 'original',
      repoId: f.id,
      osv: osvByRepo[f.id] || null,
      readBudget: READS
    });
    ctx.workflowsUnread = Math.max(0, wfCount - 4);

    let found = hygiene.audit(ctx, { repoId: f.id, memory: dismissed });
    // Second pass for the checks that depend on the first pass having found
    // something, so "no secret gate" only fires where a secret was found.
    if (found.some(x => x.category === 'secrets')) {
      ctx.hasSecretFinding = true;
      const extra = hygiene.audit(ctx, { repoId: f.id, memory: dismissed, only: ['no-secret-scanning-gate'] });
      for (const e of extra) if (!found.some(x => x.id === e.id)) found.push(e);
      found.sort((a, b) => b.rank - a.rank);
    }
    store.repos[f.id] = {
      name: f.name,
      v: hygiene.CHECKS_VERSION,
      audited: new Date().toISOString(),
      truncated: tree.truncated,
      files: tree.files.length,
      totals: hygiene.summarise(found),
      findings: found
    };
    done++;
    findings += found.length;
  }

  store.generated = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(store));

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  audited ${done} repos in ${secs}s (${failed} unreachable)`);
  console.log(`  findings this run: ${findings} (${done ? (findings / done).toFixed(1) : 0} per repo)`);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`  data/hygiene.json ${kb} KB`);
  const left = due.length - Math.min(due.length, BUDGET);
  if (left > 0) console.log(`  ${left} repos remaining for the next run`);
}

main().catch(e => { console.error('build-hygiene failed:', e.message); process.exit(1); });
