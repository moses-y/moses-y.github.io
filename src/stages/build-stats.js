#!/usr/bin/env node
/*
 * build-stats.js - precompute the honest hero stats for the home page.
 *
 * Writes stats.json aggregating real numbers from forks.json + the Code Brain
 * deep graphs (structure/*.deep.json). No fabricated multipliers.
 */
const fs = require('fs');
const path = require('path');
const { writeStable } = require('../lib/lib-json.js');
const { execFileSync } = require('child_process');
const { projectCount } = require('../lib/lib-subprojects.js');
const ROOT = path.join(__dirname, '..', '..');

const NON_CODE = { Markdown:1, JSON:1, YAML:1, TOML:1, INI:1, XML:1, CSV:1, Text:1, SVG:1, Dockerfile:1, Makefile:1, HTML:1 };
function primaryLanguage(f) {
  if (f.language) return f.language;
  const langs = (f.knowledgeGraph && f.knowledgeGraph.languages) || {};
  let best = null, bestN = 0;
  Object.keys(langs).forEach(k => { if (NON_CODE[k]) return; if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
  if (!best) Object.keys(langs).forEach(k => { if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
  return best || null;
}

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'forks.json'), 'utf8'));
const forks = data.forks || [];

const langs = new Set();
let filesAnalyzed = 0;
forks.forEach(f => {
  const l = primaryLanguage(f); if (l) langs.add(l);
  filesAnalyzed += (f.knowledgeGraph && f.knowledgeGraph.totalFiles) || 0;
});

// Map repo id -> display metadata so the report index reads nicely.
const metaById = {};
forks.forEach(f => { metaById[String(f.id)] = f; });

let modulesMapped = 0, findings = 0, analyzedRepos = 0;
const reports = [];
const dir = path.join(ROOT, 'structure');
if (fs.existsSync(dir)) {
  fs.readdirSync(dir).filter(n => n.endsWith('.deep.json')).forEach(n => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
      if (!j.totals) return;
      modulesMapped += j.totals.modules || 0;
      findings += j.totals.findings || 0;
      if (j.nodes && j.nodes.length) {
        analyzedRepos++;
        const id = n.replace(/\.deep\.json$/, '');
        const m = metaById[id] || {};
        const sev = j.totals.severity || {};
        reports.push({
          id,
          name: j.name || m.displayName || m.name || id,
          language: m.language || null,
          modules: j.totals.modules || 0,
          cycles: j.totals.cycles || 0,
          findings: j.totals.findings || 0,
          high: sev.high || 0,
          medium: sev.medium || 0,
          low: sev.low || 0
        });
      }
    } catch (e) {}
  });
}
// Rank by findings, then by high-severity - the most interesting reports first.
reports.sort((a, b) => (b.findings - a.findings) || (b.high - a.high));
writeStable(path.join(ROOT, 'structure', 'reports.json'), reports, { indent: 2 });
console.log('reports.json:', reports.length, 'reports');

/*
 * The pipeline's own figures, counted rather than typed.
 *
 * The home page states how many scripts run, how many checks they charge and
 * how many assertions hold the claims in place. Those were prose, which means
 * they were wrong the moment a script was added and nobody would notice - the
 * page would keep asserting a number with the same confidence as a measured
 * one. Counting them here from the files the claims are about is the same
 * discipline the rest of the pipeline already applies to the estate.
 *
 * Assertions come from running the suites, not from grepping for check()
 * calls: several are generated in loops, so the static count and the real one
 * disagree by roughly thirty.
 */
// Both counts are read from the tree they describe, not from this file's own
// directory. The sibling scan this replaced threw on the src/ move, which is
// what it was written to do: nothing downstream can tell "no suites ran" from
// "no assertions hold", so the figure must not ship at zero.
const SRC_DIR = path.join(ROOT, 'src');
const TESTS_DIR = path.join(ROOT, 'tests');

function jsUnder(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsUnder(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function pipelineStats() {
  const all = jsUnder(SRC_DIR);
  const suites = fs.existsSync(TESTS_DIR)
    ? fs.readdirSync(TESTS_DIR).filter(n => /^test-.*\.js$/.test(n)).map(n => path.join(TESTS_DIR, n))
    : [];

  if (suites.length === 0) {
    throw new Error('no test-*.js suites found under ' + TESTS_DIR + ' - ' +
      'assertion count would publish as 0; fix the discovery path, do not ship the figure');
  }
  const okLine = /^\s*ok\s/gm;
  let assertions = 0;

  for (const s of suites) {
    let out = '';
    try {
      out = execFileSync(process.execPath, [s], { cwd: ROOT,
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
    } catch (e) {
      // A suite that exits non-zero still reports the assertions it got
      // through, and one broken suite must not silently shrink the published
      // figure to something that looks like a deliberate claim.
      out = e.stdout || '';
    }
    assertions += (out.match(okLine) || []).length;
  }

  if (assertions === 0) {
    throw new Error(suites.length + ' suites ran and reported no assertions at all - ' +
      'that is a broken harness, not a measurement');
  }

  const G = require('../lib/lib-grade.js');
  return {
    // suites no longer live under src/, so nothing to subtract.
    scripts: all.length,
    suites: suites.length,
    assertions,
    checks: Object.keys(G.PENALTIES).length,
    axes: G.CATEGORIES.length
  };
}

const stats = {
  repos: forks.length,
  // Split out because a claim about forks is not a claim about the estate, and
  // the two differ by the handful I did write.
  original: forks.filter(f => !f.parent).length,
  forked: forks.filter(f => f.parent).length,
  /*
   * Projects, not repositories. Counting originals by repository understates
   * them: one of mine is a shelf of 29 self-contained projects sharing a
   * remote, and calling that one project is as wrong as calling it one
   * codebase - which is the mistake that made its briefing say nothing and its
   * grade an F about something other than code quality.
   */
  originalProjects: forks.filter(f => !f.parent)
    .reduce((n, f) => n + projectCount(f.knowledgeGraph), 0),
  languages: langs.size,
  filesAnalyzed,
  modulesMapped,
  findings,
  analyzedRepos,
  pipeline: pipelineStats()
};
writeStable(path.join(ROOT, 'stats.json'), stats, { indent: 2 });
console.log('stats.json:', JSON.stringify(stats));
