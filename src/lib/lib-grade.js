/*
 * lib-grade.js - the rubric that turns the deterministic audits into one grade.
 *
 * The report already surfaces every finding, but a reader who opens forty
 * repositories cannot hold forty finding lists in their head. A grade is the
 * one number that survives that, so long as it is reproducible from the same
 * inputs and every point of it traces back to a check that ran.
 *
 * Nothing here calls a model or the network. Given the same hygiene audit, deep
 * analysis, advisory set and repository metadata, the score is the same score,
 * which is the only property that makes publishing a letter defensible.
 *
 * The weights are not universal: a notebook collection is not judged on CI/CD
 * the way a service is, so a repository is graded against a profile chosen from
 * its kind and language, and the profile is named on the report next to the
 * grade rather than hidden inside it.
 */
'use strict';

// The eight axes, with the weights of the default profile. They sum to 100 so
// a weight reads as "percent of grade" on the page without further arithmetic.
const CATEGORIES = [
  { key: 'architecture', label: 'Architecture & Robustness', weight: 21 },
  { key: 'cleanliness',  label: 'Code Cleanliness',          weight: 17 },
  { key: 'docs',         label: 'Docs & Onboarding',         weight: 14 },
  { key: 'tests',        label: 'Test Coverage',             weight: 12 },
  { key: 'cicd',         label: 'CI/CD Maturity',            weight: 10 },
  { key: 'deps',         label: 'Dependency Health',         weight: 10 },
  { key: 'security',     label: 'Security Hygiene',          weight: 8 },
  { key: 'history',      label: 'History & Maintenance',     weight: 8 }
];

/*
 * Profile overrides, applied over the default weights and then renormalised
 * back to 100. Only the axes that genuinely matter differently are listed; an
 * axis left out keeps its default weight.
 *
 * The rule behind each: a library is consumed by other code, so its interface
 * docs and tests carry more than its deployment story; a notebook collection is
 * graded on reproducibility and documentation, not on a build pipeline it has
 * no reason to own; infrastructure is where a committed credential is not a
 * smell but an incident.
 */
const PROFILES = {
  frontend:  { tests: 12, cicd: 10, architecture: 21, cleanliness: 17 },
  service:   { tests: 14, cicd: 14, security: 12, architecture: 20, docs: 10 },
  library:   { tests: 18, docs: 18, architecture: 20, cleanliness: 16, cicd: 8 },
  notebook:  { tests: 4, cicd: 4, cleanliness: 22, docs: 20, architecture: 14, history: 12 },
  cli:       { tests: 14, docs: 16, cicd: 8, architecture: 18 },
  infra:     { security: 24, cicd: 16, tests: 6, architecture: 16, cleanliness: 12 },
  docs:      { docs: 34, cleanliness: 20, tests: 2, cicd: 4, architecture: 8, deps: 6 },
  default:   {}
};

/*
 * How each hygiene finding is charged, and to which axis.
 *
 * A penalty is the number of points removed from that axis' 100 for a single
 * occurrence. They are deliberately blunt: "no tests at all" takes the whole
 * axis, because partial credit for a repository with no test file is a claim
 * nobody would defend out loud.
 *
 * Every id here comes from src/checks/checks-*.js. A finding whose id is absent
 * costs nothing, so adding a check without adding it here quietly stops it
 * counting - test-grade.js asserts the two stay in step.
 */
const PENALTIES = {
  // Tests
  'no-tests-at-all':                             ['tests', 100],
  'test-suite-too-small':                        ['tests', 45],
  'ci-never-runs-tests':                         ['tests', 25],
  // CI/CD
  'ci-absent-entirely':                          ['cicd', 100],
  'deploy-artifacts-without-ci':                 ['cicd', 40],
  'gha-step-swallows-exit-code':                 ['cicd', 20],
  'gha-continue-on-error-masks-failure':         ['cicd', 16],
  'no-dependency-vulnerability-gate':            ['cicd', 15],
  'ci-install-ignores-lockfile':                 ['cicd', 15],
  'gha-pushes-to-default-branch':                ['cicd', 10],
  'gha-missing-job-timeout':                     ['cicd', 8],
  // Security - committed credentials first, because they are the only findings
  // here that are already an incident rather than a risk.
  'private-key-committed':                       ['security', 100],
  'cloud-credential-file-committed':             ['security', 100],
  'service-account-json-committed':              ['security', 100],
  'env-secret-value-real':                       ['security', 90],
  'provider-token-committed':                    ['security', 90],
  'registry-auth-committed':                     ['security', 70],
  'db-url-inline-password':                      ['security', 60],
  'terraform-state-committed':                   ['security', 55],
  'database-dump-committed':                     ['security', 50],
  'gitignore-contradicts-tracked-secret':        ['security', 45],
  'env-file-committed':                          ['security', 40],
  'gha-pr-target-untrusted-checkout':            ['security', 40],
  'hardcoded-secret-key-fallback':               ['security', 35],
  'gha-script-injection':                        ['security', 35],
  'gha-secrets-in-forkable-trigger':             ['security', 35],
  'shell-history-committed':                     ['security', 30],
  'unsafe-deserialization':                      ['security', 30],
  'sql-built-by-string-interpolation':           ['security', 30],
  'shell-command-from-interpolation':            ['security', 30],
  'eval-on-runtime-value':                       ['security', 28],
  'tls-verification-disabled':                   ['security', 28],
  'secret-passed-as-build-arg':                  ['security', 25],
  'compose-privileged-or-host-network':          ['security', 22],
  'gha-permissions-write-all':                   ['security', 20],
  'allowed-hosts-wildcard':                      ['security', 18],
  'cors-allows-any-origin':                      ['security', 18],
  'debug-mode-enabled-in-config':                ['security', 18],
  'gha-checkout-persists-credentials':           ['security', 15],
  'gha-third-party-action-unpinned':             ['security', 12],
  'container-runs-as-root':                      ['security', 12],
  'gha-no-permissions-block':                    ['security', 10],
  'no-secret-scanning-gate':                     ['security', 10],
  'network-call-without-timeout':                ['security', 8],
  // Docs & onboarding
  'readme-stub':                                 ['docs', 45],
  'no-license':                                  ['docs', 35],
  'notebook-no-environment':                     ['docs', 20],
  'repo-conventions-not-configured':             ['docs', 15],
  // Dependency health
  'dependency-pinned-to-critical-vulnerability': ['deps', 45],
  'manifest-without-lockfile':                   ['deps', 30],
  'dependency-pinned-to-known-vulnerability':    ['deps', 25],
  'no-automated-dependency-updates':             ['deps', 20],
  'dependency-directory-committed':              ['deps', 20],
  'dependency-range-permits-vulnerability':      ['deps', 12],
  'dockerfile-base-image-unpinned':              ['deps', 15],
  'install-lifecycle-script':                    ['deps', 15],
  // Cleanliness
  'build-output-committed':                      ['cleanliness', 22],
  'notebook-outputs-committed':                  ['cleanliness', 20],
  'large-binary-not-in-lfs':                     ['cleanliness', 16],
  'notebook-monolithic-cell':                    ['cleanliness', 14],
  'notebook-absolute-local-path':                ['cleanliness', 12],
  // Architecture & robustness
  'notebook-missing-random-seed':                ['architecture', 12]
};

// A finding that fires 30 times is worse than one that fires once, but not 30
// times worse, and a linear charge would zero an axis on a single check. The
// repeat multiplier is capped so the ceiling for any one finding is 1.6x.
function repeatFactor(n) {
  const count = Math.max(1, Number(n) || 1);
  return Math.min(1.6, 1 + Math.log2(count) * 0.18);
}

function clamp(v) { return Math.max(0, Math.min(100, v)); }

// A deep pass that resolved one or two modules resolved nothing: an import
// graph that small says the analyzer found no internal structure to measure,
// not that the structure it found is perfect. Below this it is treated as
// absent, which is the honest reading and keeps a notebook repo from scoring
// 92 on architecture off a single node.
const MIN_MODULES = 3;
function round1(v) { return Math.round(v * 10) / 10; }

/*
 * Test coverage, in the only sense measurable without running the suite: does a
 * test surface exist, and is it proportionate to the code it covers.
 *
 * A file ratio is not a coverage percentage and is not presented as one. It
 * answers whether the repository has a test surface at all, which across an
 * estate this size is the question that actually discriminates.
 */
function scoreTests(sig) {
  const kg = sig.kg || {};
  const health = sig.health || {};
  const tests = (kg.testFiles || []).length;
  if (!tests && health.hasTests !== true) return { score: 0, evidence: 'no test files found' };

  const code = Math.max(1, kg.totalFiles || sig.files || 1);
  const ratio = tests / code;
  // One test file per ten code files reads as a maintained suite; below one in
  // sixty is a token suite. Between the two the score moves linearly.
  const floor = 1 / 60, target = 1 / 10;
  const score = ratio >= target ? 92
    : ratio <= floor ? 25
      : 25 + ((ratio - floor) / (target - floor)) * 67;
  return {
    score: score,
    evidence: tests + ' test file' + (tests === 1 ? '' : 's') + ' against ' + code + ' files'
  };
}

function scoreCicd(sig) {
  const kg = sig.kg || {};
  const has = kg.hasCI === true || (sig.health || {}).hasCI === true;
  if (!has) return { score: 0, evidence: 'no CI configuration' };
  // A configured pipeline is the floor, not the ceiling: the gha-* findings
  // charged against this axis are what separate a pipeline from a green tick.
  return { score: 85, evidence: (kg.ciPlatform || 'CI') + ' configured' };
}

function scoreDocs(sig) {
  const kg = sig.kg || {};
  const health = sig.health || {};
  const docs = (kg.docs || []).length;
  let score = health.hasReadme === false ? 20 : 70;
  if (health.hasLicense === true) score += 8;
  // Beyond the README each committed document is onboarding surface, to a
  // ceiling: twenty design docs do not make a repository twice as approachable
  // as ten.
  score += Math.min(18, docs * 2.5);
  return {
    score: score,
    evidence: (health.hasReadme === false ? 'no README' : 'README present') +
      (docs ? ' + ' + docs + ' doc file' + (docs === 1 ? '' : 's') : '')
  };
}

function scoreDeps(sig) {
  const kg = sig.kg || {};
  const health = sig.health || {};
  if (!kg.packageManager && !(kg.dependencies || []).length) {
    return { score: 75, evidence: 'no declared dependencies to age' };
  }
  let score = health.hasLockfile === true ? 88 : 60;
  const osv = sig.osv || {};
  const vulns = [].concat(osv.pinned || [], osv.ranged || [])
    .reduce((n, p) => n + (p.vulns || []).filter(v => !v.withdrawn).length, 0);
  score -= Math.min(55, vulns * 6);
  return {
    score: score,
    evidence: (health.hasLockfile === true ? 'lockfile present' : 'no lockfile') +
      (vulns ? ' · ' + vulns + ' open advisor' + (vulns === 1 ? 'y' : 'ies')
             : ' · no known advisories')
  };
}

/*
 * Maintenance is measured as recency of the last push against the date the
 * audit ran, not against the clock, so re-rendering an old snapshot reproduces
 * the same grade instead of decaying it every day the page is served.
 */
function scoreHistory(sig) {
  const updated = Date.parse(sig.updatedAt || '');
  const asOf = Date.parse(sig.asOf || '') || Date.now();
  if (!updated) return { score: 50, evidence: 'no push date recorded' };
  const days = Math.max(0, (asOf - updated) / 86400000);
  // Fresh inside a month, cold past two years, linear between.
  const score = days <= 30 ? 95
    : days >= 730 ? 20
      : 95 - ((days - 30) / 700) * 75;
  return { score: score, evidence: 'last pushed ' + Math.round(days) + ' days before the audit' };
}

/*
 * Architecture reads the deep analysis when there is one: what share of modules
 * sit inside an import cycle, and how dense the high-severity structural
 * findings are per module. Without a deep pass the axis takes a neutral score
 * and is flagged partial, because "not analyzed" must not read as "clean".
 */
function scoreArchitecture(sig) {
  const t = (sig.deep && sig.deep.totals) || null;
  if (!t || !t.modules || t.modules < MIN_MODULES) {
    return { score: 55, partial: true, evidence: 'no module-level analysis available' };
  }
  const sev = t.severity || {};
  const cycleShare = (t.cycles || 0) / t.modules;
  const highPerModule = (sev.high || 0) / t.modules;
  let score = 92;
  score -= Math.min(40, cycleShare * 160);
  score -= Math.min(35, highPerModule * 220);
  return {
    score: score,
    evidence: t.modules + ' modules · ' + (t.cycles || 0) + ' in cycles · ' +
      (sev.high || 0) + ' high-severity structural findings'
  };
}

function scoreCleanliness(sig) {
  const t = (sig.deep && sig.deep.totals) || null;
  if (!t || !t.modules || t.modules < MIN_MODULES) {
    return { score: 60, partial: true, evidence: 'no module-level analysis available' };
  }
  const sev = t.severity || {};
  // Medium and low findings are the cleanliness signal: size, nesting, branch
  // density, duplication. High severity is charged to architecture instead, so
  // no finding is billed to two axes.
  const perModule = ((sev.medium || 0) + (sev.low || 0) * 0.4) / t.modules;
  const score = 95 - Math.min(55, perModule * 90);
  return {
    score: score,
    evidence: (sev.medium || 0) + ' medium and ' + (sev.low || 0) + ' low findings across ' +
      t.modules + ' modules'
  };
}

const SCORERS = {
  architecture: scoreArchitecture,
  cleanliness: scoreCleanliness,
  docs: scoreDocs,
  tests: scoreTests,
  cicd: scoreCicd,
  deps: scoreDeps,
  history: scoreHistory,
  // Security starts clean and is only ever lowered by a check that fired. There
  // is no structural proxy for "secure", so the absence of a finding is scored
  // as the absence of a finding, and the axis says as much on the page.
  security: function () { return { score: 90, evidence: 'no secret or runtime check fired' }; }
};

/*
 * Which profile a repository is graded against, from the kind the classifier
 * already assigned and its dominant language. Kind wins when it is decisive;
 * language only breaks the tie.
 */
function pickProfile(sig) {
  const kind = String(sig.kind || '').toLowerCase();
  const lang = String(sig.language || '').toLowerCase();
  // A skills or plugin distribution is prose that an agent reads. Grading it on
  // module coupling and a build pipeline measures nothing that exists, so it is
  // graded the way the other document repositories are.
  if (sig.domain === 'Agent Skills & Plugins') return 'docs';
  if (/notebook|dataset|analysis|research/.test(kind)) return 'notebook';
  if (/infra|terraform|devops|deploy|kubernetes|docker/.test(kind)) return 'infra';
  if (/\b(cli|tool)\b/.test(kind)) return 'cli';
  if (/librar|sdk|package|framework/.test(kind)) return 'library';
  if (/api|service|server|backend|bot|agent/.test(kind)) return 'service';
  if (/web app|frontend|site|ui|extension|game/.test(kind)) return 'frontend';
  if (/docs|book|awesome|list|course|tutorial/.test(kind)) return 'docs';
  if (lang === 'jupyter notebook') return 'notebook';
  if (lang === 'hcl' || lang === 'dockerfile') return 'infra';
  if (lang === 'html' || lang === 'css' || lang === 'vue' || lang === 'svelte') return 'frontend';
  if (lang === 'markdown') return 'docs';
  return 'default';
}

// Weights for a profile: the defaults with that profile's overrides applied,
// renormalised so they still sum to 100 and still read as percentages.
function weightsFor(profile) {
  const over = PROFILES[profile] || PROFILES.default;
  const raw = CATEGORIES.map(c => ({
    key: c.key, label: c.label, w: over[c.key] != null ? over[c.key] : c.weight
  }));
  const sum = raw.reduce((s, c) => s + c.w, 0) || 1;
  return raw.map(c => ({ key: c.key, label: c.label, weight: (c.w / sum) * 100 }));
}

const LADDER = [
  [90, 'A'], [85, 'A-'], [80, 'B+'], [75, 'B'], [70, 'B-'],
  [65, 'C+'], [60, 'C'], [50, 'C-'], [40, 'D'], [0, 'F']
];

function letterFor(score) {
  for (const step of LADDER) if (score >= step[0]) return step[1];
  return 'F';
}

// The distance to the next letter up, which is the sentence a reader acts on:
// "0.2 points from a D" is a to-do, "39.8 / 100" is only a verdict.
function nextGrade(score) {
  for (let i = LADDER.length - 1; i >= 0; i--) {
    if (LADDER[i][0] > score) {
      return { letter: LADDER[i][1], points: round1(LADDER[i][0] - score) };
    }
  }
  return null;
}

/*
 * grade(sig) -> the whole result.
 *
 * sig: { id, name, kind, language, updatedAt, asOf, files,
 *        health, kg, hygiene, deep, osv }
 *
 * Returns { score, letter, profile, next, categories, audited, partial }.
 * Every category carries its own score, weight, evidence line and the findings
 * charged against it, so the report can show the arithmetic rather than assert
 * the total.
 */
function grade(sig) {
  sig = sig || {};
  const profile = pickProfile(sig);
  const weights = weightsFor(profile);

  // Charge each hygiene finding to its axis once, carrying the title through so
  // the report can name what cost the points rather than only how many.
  const charged = {};
  const findings = (sig.hygiene && sig.hygiene.findings) || [];
  for (const f of findings) {
    const rule = PENALTIES[f.id];
    if (!rule) continue;
    (charged[rule[0]] = charged[rule[0]] || []).push({
      id: f.id, title: f.title, severity: f.severity,
      cost: round1(rule[1] * repeatFactor(f.n))
    });
  }

  const categories = weights.map(w => {
    const base = SCORERS[w.key](sig);
    const hits = (charged[w.key] || []).sort((a, b) => b.cost - a.cost);
    const deducted = hits.reduce((s, h) => s + h.cost, 0);
    return {
      key: w.key,
      label: w.label,
      weight: round1(w.weight),
      score: round1(clamp(base.score - deducted)),
      evidence: base.evidence,
      partial: !!base.partial,
      charged: hits
    };
  });

  const score = round1(categories.reduce((s, c) => s + c.score * (c.weight / 100), 0));
  return {
    id: sig.id,
    name: sig.name,
    score: score,
    letter: letterFor(score),
    next: nextGrade(score),
    profile: profile,
    audited: !!(sig.hygiene && sig.hygiene.audited),
    partial: categories.some(c => c.partial),
    // Worst axis first: the reader's next action is at the top of the list.
    categories: categories.sort((a, b) => a.score - b.score || b.weight - a.weight)
  };
}

module.exports = {
  grade: grade, pickProfile: pickProfile, weightsFor: weightsFor,
  letterFor: letterFor, nextGrade: nextGrade, repeatFactor: repeatFactor,
  CATEGORIES: CATEGORIES, PROFILES: PROFILES, PENALTIES: PENALTIES
};
