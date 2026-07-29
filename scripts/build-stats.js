#!/usr/bin/env node
/*
 * build-stats.js — precompute the honest hero stats for the home page.
 *
 * Writes stats.json aggregating real numbers from forks.json + the Code Brain
 * deep graphs (structure/*.deep.json). No fabricated multipliers.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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
// Rank by findings, then by high-severity — the most interesting reports first.
reports.sort((a, b) => (b.findings - a.findings) || (b.high - a.high));
fs.writeFileSync(path.join(ROOT, 'structure', 'reports.json'), JSON.stringify(reports, null, 2));
console.log('reports.json:', reports.length, 'reports');

const stats = {
  repos: forks.length,
  languages: langs.size,
  filesAnalyzed,
  modulesMapped,
  findings,
  analyzedRepos
};
fs.writeFileSync(path.join(ROOT, 'stats.json'), JSON.stringify(stats, null, 2));
console.log('stats.json:', JSON.stringify(stats));
