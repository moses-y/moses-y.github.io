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
const { domainOf, deriveLanguage, isSkillDistribution, skillShare,
  LANG_DOMAIN, CENSUS_DOMAIN, DOC_LANGS } = require('./lib-classify.js');

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

console.log('agent skills and plugins');

/*
 * The line this has to hold is between a repository that is a skill or plugin
 * distribution and an application that merely ships one. Both contain
 * .claude/skills; only the first is defined by it, and getting this wrong in
 * the permissive direction swept in a 12,769-file design tool.
 */
const skillPack = {
  totalFiles: 11, directories: { '(root)': 1, skills: 10 },
  languages: { Markdown: 11 }, docs: ['README.md']
};
check('a skills pack is its own domain',
  domainOf(null, skillPack) === 'Agent Skills & Plugins', domainOf(null, skillPack));

const pluginPack = {
  totalFiles: 57, directories: { '.claude-plugin': 1, '(root)': 7, 'startup-design': 16, 'startup-pitch': 33 },
  languages: { Markdown: 50, YAML: 3, JSON: 1 }, docs: ['README.md']
};
check('a plugin marketplace is a distribution',
  domainOf(null, pluginPack) === 'Agent Skills & Plugins', domainOf(null, pluginPack));

/*
 * Claude is not the only harness and the rubric must not read as though it is.
 * The estate already carries .codex-plugin and .cursor-plugin, and a list of
 * vendor names would go stale the week a new tool ships, so the manifest test
 * matches the shape .<harness>-plugin instead.
 */
['.claude-plugin', '.codex-plugin', '.cursor-plugin', '.opencode-plugin', '.brand-new-plugin']
  .forEach(function (dir) {
    const dirs = { '(root)': 6 };
    dirs[dir] = 1;
    dirs['content'] = 40;
    const kg = { totalFiles: 47, directories: dirs, languages: { Markdown: 45, JSON: 2 } };
    check(dir + ' is a distribution manifest',
      domainOf(null, kg) === 'Agent Skills & Plugins', domainOf(null, kg));
  });

// A directory merely ending in the word is not a manifest, and neither is a
// harness working directory on its own.
check('an ordinary plugins folder is not a manifest by itself',
  domainOf('TypeScript', { totalFiles: 400, directories: { 'my-plugin': 300, src: 100 },
    languages: { TypeScript: 380, Markdown: 20 } }) === 'Web & Interfaces');

// The false positive that mattered: a real application with a skills folder.
const appWithSkills = {
  totalFiles: 707, directories: { '.claude': 130, app: 34, components: 153, lib: 50, public: 165, '(root)': 175 },
  languages: { TSX: 165, TypeScript: 90, Markdown: 261, JSON: 17 },
  docs: ['.claude/skills/web-design-guidelines/SKILL.md']
};
check('an app that ships a skill is still an app',
  domainOf('TSX', appWithSkills) === 'Web & Interfaces', domainOf('TSX', appWithSkills));

const bigPlugin = {
  totalFiles: 12769, directories: { '.claude-plugin': 2, src: 8000, app: 4000, '(root)': 767 },
  languages: { TypeScript: 9000, Markdown: 1200 }
};
check('a plugin manifest alone does not reclassify a product',
  domainOf('TypeScript', bigPlugin) === 'Web & Interfaces', domainOf('TypeScript', bigPlugin));

// A course is prose with a skills folder in the corner of it, which is not the
// same thing as a skills pack.
const course = {
  totalFiles: 2478, directories: { '.github': 8, skills: 40, lessons: 2430 },
  languages: { Markdown: 1800, Python: 600 }
};
check('a skills folder in the corner of a course does not reclassify it',
  domainOf('Python', course) !== 'Agent Skills & Plugins', domainOf('Python', course));

check('skillShare measures the tree, not the presence',
  skillShare(skillPack) > 0.8 && skillShare(appWithSkills) < 0.25,
  skillShare(skillPack).toFixed(2) + ' vs ' + skillShare(appWithSkills).toFixed(2));
check('nothing without a census is a skill distribution',
  isSkillDistribution(null) === false && isSkillDistribution({}) === false);

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
 * The graph now reads the domain the build assigned rather than deriving a
 * second opinion, so the two taxonomies no longer disagree by construction. Two
 * things still have to hold: its language map remains a working fallback for a
 * repository the build has not enriched, and it has a colour for every domain
 * the build can produce - a missing one renders as grey, which reads as "Other"
 * to anyone looking at the graph.
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

check('the graph prefers the domain the build assigned',
  /function domainOf\(lang, topics, fork\)[\s\S]{0,200}fork\.domain/.test(cb));

const colours = (cb.match(/var DOMAIN_COLORS = \{[\s\S]*?\n {4}\};/) || [''])[0];
const buildDomains = ['AI & Data', 'Web & Interfaces', 'Systems & Infra', 'Mobile',
  'Knowledge & Content', 'Agent Skills & Plugins', 'Other'];
const uncoloured = buildDomains.filter(function (d) { return colours.indexOf("'" + d + "'") === -1; });
check('the graph has a colour for every domain the build emits',
  uncoloured.length === 0, uncoloured.join(', '));

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
