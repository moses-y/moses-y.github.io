/*
 * lib-hygiene.js - the code-health audit: deterministic, actionable checks.
 *
 * build-analyze.js answers "what shape is this code in" - coupling, cycles,
 * nesting, duplication. Those are descriptive: they tell you a file is deeply
 * nested. This answers "what would stop me shipping it" - an unpinned action, a
 * committed .env, a workflow that never runs the tests. Those are actionable:
 * they name a thing to do.
 *
 * Every check is a pure function of inputs the pipeline already pays for, so a
 * full audit of a repo costs one tree request plus a bounded number of file
 * reads. No check may issue an unbudgeted request.
 *
 * A check registers itself with:
 *   id          stable kebab-case identifier, used as the memory key
 *   title       the action, as a reviewer would phrase it
 *   severity    critical | high | medium | low
 *   confidence  0..1, how often a hit is genuinely a problem
 *   why         the production failure it prevents
 *   fix         one line, what resolves it
 *   reads       paths (or a selector) it needs, so the runner can batch them
 *   run(ctx)    null when clean, or { where, evidence, n }
 */
'use strict';

// Bumped whenever a rule changes. A stored result from an older version is
// re-audited rather than trusted, so a false positive that has been fixed stops
// being published immediately instead of surviving the recheck window.
// 2: the four original catalogues, with the placeholder-gate fixes.
// 3: the runtime catalogue, 13 rules that read the running program's config.
const CHECKS_VERSION = 3;

const SEVERITY_WEIGHT = { critical: 8, high: 5, medium: 2, low: 1 };

// Ranking, borrowed from how build-analyze already ranks its findings and from
// the reach idea: production reach x confidence x severity. Reach is the honest
// discriminator in this estate - most of these repos are other people's code
// that the owner collected and will never deploy, so a finding in one of his own
// projects matters more than the same finding in a fork.
function reachOf(ctx) {
  if (ctx.isOriginal) return 1;
  if (ctx.hasCI || ctx.hasDocker) return 0.6;   // a fork wired to build something
  return 0.3;
}

function rank(check, ctx) {
  const w = SEVERITY_WEIGHT[check.severity] || 1;
  return +(w * (check.confidence == null ? 1 : check.confidence) * reachOf(ctx)).toFixed(2);
}

/*
 * ctx, the audit context handed to every check:
 *   tree        [{ path, size }] every blob in the repo
 *   paths       Set of every path, for O(1) existence tests
 *   has(re)     does any path match this pattern
 *   find(re)    every path matching this pattern
 *   read(path)  file text, or null. Budgeted: returns null once the budget is
 *               spent, so a check must treat null as "unknown", never as "clean"
 *   kg          the stored knowledgeGraph
 *   deep        structure/<id>.deep.json, or null
 *   symbols     { fns, classes, names[] } or null
 *   isOriginal  the owner wrote it, rather than collected it
 */
function makeContext({ tree, readFile, kg, deep, symbols, isOriginal, readBudget, repoId, osv }) {
  const paths = new Set((tree || []).map(f => f.path));
  let spent = 0;
  const cache = new Map();
  const budget = readBudget == null ? 8 : readBudget;

  return {
    tree: tree || [],
    paths,
    kg: kg || {},
    deep: deep || null,
    symbols: symbols || null,
    // This repo's entry from data/osv.json: named advisories against the declared
    // dependencies, already split into versions that are pinned and ranges that
    // merely permit a vulnerable resolution. Absent when the lookup has not
    // reached this repo yet, which is unknown rather than clean.
    osv: osv || null,
    isOriginal: !!isOriginal,
    repoId: repoId == null ? null : String(repoId),
    // Set by the runner between tiers, so a cause-of-leak check can require that
    // a leak was actually found first.
    hasSecretFinding: false,
    hasCI: !!(kg && kg.hasCI),
    hasDocker: !!(kg && kg.hasDocker),
    has: re => [...paths].some(p => re.test(p)),
    find: re => [...paths].filter(p => re.test(p)),
    sizeOf: p => { const f = (tree || []).find(x => x.path === p); return f ? (f.size || 0) : 0; },
    read(p) {
      if (cache.has(p)) return cache.get(p);
      if (spent >= budget) return null;          // unknown, not clean
      spent++;
      let text = null;
      try { text = readFile(p); } catch (e) { text = null; }
      cache.set(p, text);
      return text;
    },
    readsLeft: () => Math.max(0, budget - spent),
    // Files already fetched, so a scanning check can sweep them for free rather
    // than spending budget of its own.
    readPaths: () => [...cache.keys()].filter(k => cache.get(k))
  };
}


/* ---- the placeholder gate -------------------------------------------------
 * Every weak pattern routes through this. Publishing "leaked key" against a
 * placeholder is worse than missing one, because this audit is public.
 * Measured against six repos with committed .env files: five contain only
 * placeholders and stay silent, one contains four generated values and fires.
 */
// The token must end or be followed by a non-alphanumeric. Without that guard
// `an?` matched a leading "a", so every value starting with "a" was suppressed.
const PLACEHOLDER = /^(?:your|my|the|an?|xxx+|x{4,}|<|\{|\$|%|\.\.\.|todo|tbd|fixme|change[-_ ]?me|placeholder|example|sample|dummy|fake|test|dev|local|none|null|nil|undefined|redacted|removed|hidden|insert|add[-_ ]?your|paste|abc|123|0000|foo|bar|baz|secret|password|apikey|api[-_]key|s3cr3t|hunter2)(?:$|[^A-Za-z0-9])/i;
const WORDY = /^[a-z]+([-_][a-z]+){1,6}$/;          // your-api-key-here
// Anchoring alone missed ANTHROPIC_PLACEHOLDER, where the marker is at the end.
const MARKER = /(placeholder|redacted|changeme|change_me|your[-_]?(api|key|token|secret)|example|dummy|sample|notreal|not[-_]?real|fill[-_]?me|insert[-_]?here)/i;
const DEV_PASSWORDS = new Set(['password', 'passwd', 'pass', 'secret', 'changeme',
  'example', 'yourpassword', 'mysecretpassword', 'postgres', 'root', 'admin',
  'guest', 'test', 'dev', 'devkey', 'mysql', 'redis']);

function entropy(s) {
  const freq = Object.create(null);
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0;
  for (const k in freq) { const p = freq[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// Values seen in three or more repositories are upstream sample data, not
// anyone's credential. In a estate that is 98% forks this is the single most
// effective suppressor available, and it costs one Map.
const seenValues = new Map();
function noteValue(value, repoId) {
  const k = value.length + ':' + value.slice(0, 12);
  let set = seenValues.get(k);
  if (!set) { set = new Set(); seenValues.set(k, set); }
  set.add(String(repoId));
  return set.size;
}

function looksReal(value, repoId) {
  if (!value) return false;
  const v = String(value).trim().replace(/^["']|["']$/g, '');
  if (v.length < 12) return false;
  if (PLACEHOLDER.test(v)) return false;
  if (WORDY.test(v)) return false;
  if (MARKER.test(v)) return false;
  if (/[<>{}]|\.\.\.|\*{3,}|X{6,}/.test(v)) return false;
  if (/^(.)\1+$/.test(v)) return false;
  if (DEV_PASSWORDS.has(v.toLowerCase())) return false;
  const h = entropy(v);
  if (h < (v.length >= 20 ? 3.5 : 3.2)) return false;
  if (repoId != null && noteValue(v, repoId) >= 3) return false;   // shared = sample
  return true;
}

// The workflows the runner chose to read, concatenated. Shared because both the
// CI and supply-chain catalogues need them and neither should spend reads twice.
function workflowText(ctx) {
  const out = [];
  for (const p of ctx.find(/^\.github\/workflows\/[^/]+\.ya?ml$/)) {
    const t = ctx.read(p);
    if (t) out.push({ path: p, text: t });
  }
  return out;
}

const CHECKS = [];
function register(check) {
  if (!check || !check.id || typeof check.run !== 'function') {
    throw new Error('hygiene check must have an id and a run()');
  }
  if (CHECKS.some(c => c.id === check.id)) throw new Error('duplicate check id: ' + check.id);
  CHECKS.push(check);
  return check;
}

// Findings the owner has judged not worth acting on stay dismissed, so the next
// audit starts where the last one ended instead of re-reporting the same thing
// forever. Keyed by check id and location.
function isDismissed(memory, repoId, checkId, where) {
  const key = `${repoId}|${checkId}|${where || ''}`;
  return !!(memory && memory[key]);
}

function audit(ctx, opts) {
  const o = opts || {};
  const out = [];
  for (const check of CHECKS) {
    if (o.only && !o.only.includes(check.id)) continue;
    let hit = null;
    try { hit = check.run(ctx); } catch (e) { hit = null; }   // a broken check must not fail the audit
    if (!hit) continue;
    const where = hit.where || '';
    if (isDismissed(o.memory, o.repoId, check.id, where)) continue;
    out.push({
      id: check.id,
      title: check.title,
      severity: check.severity,
      category: check.category || 'hygiene',
      where,
      evidence: hit.evidence || '',
      n: hit.n || 1,
      why: check.why,
      fix: check.fix,
      rank: rank(check, ctx)
    });
  }
  return out.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}

function summarise(findings) {
  const sev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) if (sev[f.severity] != null) sev[f.severity]++;
  return { total: findings.length, severity: sev };
}

module.exports = { register, audit, summarise, makeContext, CHECKS, rank,
  SEVERITY_WEIGHT, looksReal, entropy, DEV_PASSWORDS, workflowText, CHECKS_VERSION };
