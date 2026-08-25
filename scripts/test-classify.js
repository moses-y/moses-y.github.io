#!/usr/bin/env node
/*
 * test-classify.js - the domain a repository is filed under.
 *
 * Written after finding 98 repositories in "Other" on the build side and 198 on
 * the graph side, where almost every one was a language the map simply did not
 * list: TSX and JSX accounted for 86 of them, which is React filed as
 * unclassifiable. Nothing failed, nothing logged, the bucket just grew.
 *
 * So the assertions here are less about any individual mapping and more about
 * the two ways this silently rots: a language that shows up in the estate but
 * not in the map, and the site's two copies of the taxonomy drifting apart.
 *
 *   node scripts/test-classify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { domainOf, deriveLanguage, LANG_DOMAIN, CENSUS_DOMAIN, DOC_LANGS } = require('./lib-classify.js');

let fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fail++;
  console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
}

console.log('domain from language');

check('a code language maps to its domain', domainOf('Python') === 'AI & Data');
check('TSX is web, not other', domainOf('TSX') === 'Web & Interfaces');
check('JSX is web, not other', domainOf('JSX') === 'Web & Interfaces');
check('a C header is systems', domainOf('C/C++ Header') === 'Systems & Infra');
check('Terraform is infrastructure', domainOf('Terraform') === 'Systems & Infra');

console.log('domain from the file census');

// The case that produced 71 of the 98: a repository whose entire tree is prose,
// so deriveLanguage returns null by design and there is no code language to map.
const proseRepo = { languages: { Markdown: 240, YAML: 3, JSON: 2 } };
check('a prose-only repo has no code language', deriveLanguage(proseRepo) === null);
check('a prose-only repo is knowledge, not other',
  domainOf(null, proseRepo) === 'Knowledge & Content', domainOf(null, proseRepo));

const configRepo = { languages: { YAML: 60, Markdown: 4 } };
check('a config-dominant repo is infrastructure',
  domainOf(null, configRepo) === 'Systems & Infra', domainOf(null, configRepo));

// The census is a fallback, not an override: a repo with real code in it is
// filed by the code even when the prose files outnumber it.
const mixed = { languages: { Markdown: 500, Python: 12 } };
check('code wins over prose when both are present',
  domainOf(deriveLanguage(mixed), mixed) === 'AI & Data');

console.log('what Other is allowed to mean');

check('a repo with no census at all is Other', domainOf(null, null) === 'Other');
check('a repo with an empty census is Other', domainOf(null, { languages: {} }) === 'Other');

/*
 * The regression guard. Every language the estate actually contains has to be
 * placeable, or it silently lands in Other exactly as before. Doc languages are
 * exempt from LANG_DOMAIN because deriveLanguage never returns them, but they
 * must be placeable through the census instead.
 */
const idx = path.join(__dirname, '..', 'data', 'index.json');
if (fs.existsSync(idx)) {
  const data = JSON.parse(fs.readFileSync(idx, 'utf8'));
  const langs = Object.keys((data.taxonomy && data.taxonomy.languages) || {});
  check('the index lists languages to check', langs.length > 5, String(langs.length));
  const unplaceable = langs.filter(function (l) {
    return !LANG_DOMAIN[l] && !CENSUS_DOMAIN[l];
  });
  check('every language in the estate can be placed', unplaceable.length === 0, unplaceable.join(', '));

  // A bucket is allowed to exist; a bucket holding a tenth of the estate is a
  // classifier that stopped working.
  const domains = (data.taxonomy && data.taxonomy.domains) || {};
  const total = Object.keys(domains).reduce(function (s, k) { return s + domains[k]; }, 0);
  const other = domains['Other'] || 0;
  check('Other is a remainder, not a domain',
    total === 0 || other / total < 0.02, other + ' of ' + total);
} else {
  console.log('  skip  data/index.json not built, estate-wide checks skipped');
}

console.log('the two taxonomies stay in step');

/*
 * The graph carries its own copy of the map in assets/js/cb-dom.js, under
 * different domain names, because it colours nodes client-side from forks.json
 * rather than from the built index. Two copies is the actual defect; until they
 * are merged, the least this can do is fail when one grows a language the other
 * has never heard of.
 */
const cb = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cb-dom.js'), 'utf8');
const block = (cb.match(/var LANG_DOMAIN = \{[\s\S]*?\n {4}\};/) || [''])[0];
check('found the graph copy of the map', block.length > 100);
const graphLangs = (block.match(/'([^']+)':\s*'/g) || []).map(function (m) {
  return m.slice(1, m.indexOf("':"));
});
const missingInGraph = Object.keys(LANG_DOMAIN).filter(function (l) {
  return graphLangs.indexOf(l) === -1 && !DOC_LANGS.has(l);
});
check('the graph knows every language the build knows',
  missingInGraph.length === 0, missingInGraph.join(', '));

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
