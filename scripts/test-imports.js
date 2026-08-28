#!/usr/bin/env node
/*
 * test-imports.js - every name a file uses is a name it can reach.
 *
 * This exists because of a specific failure. update-forks.js was split into
 * seven modules and the move was checked against a hand-written list of the names
 * that had moved. modelRateLimits was not on that list, and neither was
 * generateFallbackSummary, so two files referenced bindings they no longer
 * imported. Both sat in the fallback path - the branch that runs when a model
 * times out - so requiring the modules worked, the happy path worked, and the
 * pipeline ran fine until a model timed out in CI four days later.
 *
 * The lesson is not "be more careful with the list". It is that the list should
 * not be hand-written. This derives it: every name exported by any lib, checked
 * against every file that references it.
 *
 * A name can legitimately collide with a local variable, a string, or an object
 * key, so a reference only counts when it is used as a value - called, indexed,
 * or member-accessed - and comments and string literals are stripped first. The
 * remaining false positives are listed explicitly rather than hidden behind a
 * looser rule.
 *
 *   node scripts/test-imports.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

/*
 * Node modules only. A browser file cannot require anything, so comparing it
 * against Node exports only produces collisions: code-brain.js binds domainOf
 * from CBDom, and lib-classify.js happens to export a function of the same name.
 * The browser side has its own checker, test-globals.js.
 */
const DIRS = ['scripts'];

/*
 * The partials under assets/js/site/ are concatenated into one file and share one
 * top-level scope, which is the whole reason they are concatenated rather than
 * loaded separately. So they are checked as a single unit: escapeHtml declared in
 * 03-index-records is reachable from 04-projects, and treating them as separate
 * files reports that as a missing import.
 */
const BUNDLES = [path.join('assets', 'js', 'site')];

/*
 * Names that read like an export but are something else where they appear.
 * Each is checked by eye once and recorded here, so a genuine miss is never
 * lost in a pile of noise.
 */
const NOT_A_REFERENCE = {
  'build-deepgraph.js': ['rank'],          // a field name inside the prompt text
  'generate-blog-pages.js': ['audit'],     // the word in a comment
  'build-index.js': ['services'],          // 'services.html', a string key
  'lib-site-chrome.js': ['services'],      // /services.html in the nav markup
  'site.js': ['services'],                 // same, in the generated nav
  'lib-article.js': ['LLM_MODELS'],        // named in an operator-facing message
  // Declared inside a template-literal interpolation, which the string stripper
  // removes along with the declaration.
  'lib-blog-analysis.js': ['head'],
  // Inside the ENTRY_NAMES and ENTRY_FILES patterns, which the regex stripper
  // declines to touch because they are assigned across a line break.
  'lib-flow.js': ['main'],
  // Bound from the shared dom object, which this checker reads as a property.
  'cb-panel.js': ['esc']
};

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    /*
     * Regex literals, which this file is full of and which read as code to a
     * pattern matcher. /^(main|cli|index)\./ contains four words that are also
     * exported names elsewhere, and once a bare read counted as a use, every one
     * of them was reported. They go after the strings so a slash inside a string
     * cannot start a false pattern.
     */
    .replace(/([=(,:[!&|?+]\s*|\breturn\s+)\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g, '$1/0/');
}

// A bundle directory becomes one virtual file: its partials joined in the same
// order the builder joins them.
function bundleUnits() {
  return BUNDLES.filter(d => fs.existsSync(d)).map(d => ({
    label: d.replace(/\\/g, '/') + '/*',
    src: fs.readdirSync(d)
      .filter(f => f.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map(f => fs.readFileSync(path.join(d, f), 'utf8'))
      .join('\n')
  }));
}

// Recursive, and loud about a directory it cannot read. This walk is the input
// to every assertion below, so a silent `continue` on a missing directory turns
// the whole suite green while it checks nothing - which is precisely the failure
// it was written to catch. It is also why the walk recurses: the moment these
// files live in subdirectories, a flat readdir would check only what is left at
// the top and still pass.
function walk(dir, out) {
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n.charAt(0) === '.') continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile() && n.endsWith('.js')) out.push(p);
  }
  return out;
}

function jsFiles() {
  const out = [];
  for (const d of DIRS) {
    if (!fs.existsSync(d)) {
      throw new Error('test-imports: source directory "' + d + '" does not exist - ' +
        'nothing would be checked; update DIRS to match the tree');
    }
    walk(d, out);
  }
  if (out.length === 0) {
    throw new Error('test-imports: found no .js files under ' + DIRS.join(', '));
  }
  return out;
}

const files = jsFiles();
const units = files.map(f => ({ label: path.basename(f), src: fs.readFileSync(f, 'utf8') }))
  .concat(bundleUnits());

// What every module exports.
const exportedBy = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const m = src.match(/module\.exports\s*=\s*\{([^}]*)\}/);
  if (!m) continue;
  for (const raw of m[1].split(',')) {
    const name = raw.trim().split(':')[0].trim();
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    if (!exportedBy.has(name)) exportedBy.set(name, []);
    exportedBy.get(name).push(path.basename(f));
  }
}

let fail = 0;
for (const unit of units) {
  const base = unit.label;
  const src = stripCommentsAndStrings(unit.src);

  const imported = new Set();
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*require/g)) {
    for (const n of m[1].split(',')) {
      const name = n.trim().split(':')[0].trim();
      if (name) imported.add(name);
    }
  }
  // A default-style require binds one name.
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require/g)) imported.add(m[1]);

  const declared = new Set();
  for (const m of src.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // Destructured locals that are not requires.
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const n of m[1].split(',')) {
      const name = n.trim().split(':').pop().trim();
      if (name) declared.add(name);
    }
  }
  // Parameters count as declared: a name passed in is reachable.
  for (const m of src.matchAll(/function[^(]*\(([^)]*)\)/g)) {
    for (const n of m[1].split(',')) {
      const name = n.trim().split(/[=\s]/)[0].replace(/[{}[\].]/g, '');
      if (name) declared.add(name);
    }
  }
  for (const m of src.matchAll(/\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) declared.add(m[1]);

  const allowed = new Set(NOT_A_REFERENCE[base] || []);

  for (const [name, homes] of exportedBy) {
    if (homes.includes(base)) continue;          // its own export
    if (imported.has(name) || declared.has(name) || allowed.has(name)) continue;
    /*
     * Any read of the name counts, not only a call. Matching name( name[ name.
     * missed `model: EMBED_MODEL,` - a bare value in an object literal - and that
     * shipped to CI as the second ReferenceError of this kind. The exclusions are
     * what a bare match cannot mean: a property after a dot, and a key before a
     * colon.
     */
    const esc = name.replace(/\$/g, '\\$');
    const used = new RegExp('(?<![.\\w$])' + esc + '(?![\\w$])(?!\\s*:)');
    if (!used.test(src)) continue;
    fail++;
    console.log(`FAIL  ${base} references ${name}, exported by ${homes.join(', ')}, without importing it`);
  }
}

console.log(fail
  ? `\n  ${fail} unreachable reference(s)`
  : `\n  every referenced export is imported (${units.length} units, ${exportedBy.size} exported names)`);
process.exit(fail ? 1 : 0);
