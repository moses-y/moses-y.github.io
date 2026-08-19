#!/usr/bin/env node
/*
 * build-bundles.js - join the partials that make up the two large site assets.
 *
 * assets/css/site.css was 2,578 lines and assets/js/site.js was 1,077, the last
 * two hand-written files over the 450-line limit. Both are loaded by nine pages,
 * so splitting either into separate files would have traded one request for eight
 * on every page of the site.
 *
 * For the stylesheet that is only a delivery argument. For the script it is a
 * correctness one: site.js is a flat classic script with a single shared top-level
 * scope - allProjects, langColors and currentPage are declared in one place and
 * used in several others, and the boot calls at the end must run after every
 * declaration. Separate <script> tags would change when each binding is
 * initialised. Concatenation preserves the scope exactly, which is what makes the
 * split provably behaviour-neutral rather than probably so.
 *
 * Order is the filename order and it is load-bearing in both cases: the cascade
 * for the CSS, the declaration order for the JS. Hence the numeric prefixes and
 * an explicit numeric sort rather than trusting readdir.
 *
 * The outputs are committed, because Pages serves the repository and no build runs
 * before it. A committed artifact can go stale, so --check exists and the
 * pre-commit hook uses it: editing a partial without rebuilding is refused at
 * commit time rather than found later as a broken page.
 *
 * Usage:
 *   node scripts/build-bundles.js            rebuild both
 *   node scripts/build-bundles.js --check     exit non-zero if either is stale
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BUNDLES = [
  {
    src: path.join('assets', 'css', 'site'),
    out: path.join('assets', 'css', 'site.css'),
    ext: '.css',
    note: 'One file rather than eight stylesheets because nine pages load it.'
  },
  {
    src: path.join('assets', 'js', 'site'),
    out: path.join('assets', 'js', 'site.js'),
    ext: '.js',
    note: 'Concatenated, not separate scripts: these partials share one top-level scope.'
  }
];

const CHECK = process.argv.includes('--check');

function header(bundle) {
  return [
    '/* GENERATED FILE - do not edit.',
    ' *',
    ' * Built by scripts/build-bundles.js from ' + bundle.src.replace(/\\/g, '/') + '/',
    ' * Edit the partials there and run: node scripts/build-bundles.js',
    ' *',
    ' * ' + bundle.note,
    ' */',
    ''
  ].join('\n');
}

function partials(bundle) {
  return fs.readdirSync(bundle.src)
    .filter(f => f.endsWith(bundle.ext))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function build(bundle) {
  const files = partials(bundle);
  if (!files.length) throw new Error('no partials in ' + bundle.src);
  // Each partial's own header explains that it is a partial, which is useful in
  // the source and noise in the output. It becomes a one-line marker so the built
  // file still says which section a line came from when read in devtools.
  const body = files.map(f => {
    const raw = fs.readFileSync(path.join(bundle.src, f), 'utf8');
    const stripped = raw.replace(/^\/\*[\s\S]*?\*\/\n+/, '');
    const label = f.replace(/^\d+-/, '').replace(new RegExp('\\' + bundle.ext + '$'), '');
    return '/* ' + label + ' */\n' + stripped.replace(/\s+$/, '');
  }).join('\n\n');
  return { text: header(bundle) + body + '\n', files };
}

let stale = 0;
for (const bundle of BUNDLES) {
  const { text, files } = build(bundle);
  if (CHECK) {
    let current = null;
    try { current = fs.readFileSync(bundle.out, 'utf8'); } catch (e) { current = null; }
    if (current === text) {
      console.log(`  up to date  ${bundle.out}  (${files.length} partials)`);
    } else {
      console.error(`  STALE       ${bundle.out} does not match ${bundle.src}/`);
      stale++;
    }
    continue;
  }
  fs.writeFileSync(bundle.out, text);
  console.log(`=== ${bundle.out} ===`);
  for (const f of files) {
    const n = fs.readFileSync(path.join(bundle.src, f), 'utf8').split('\n').length;
    console.log(`  ${f.padEnd(22)} ${String(n).padStart(4)} lines`);
  }
  console.log(`  -> ${text.split('\n').length} lines, ${(text.length / 1024).toFixed(0)} KB`);
}

if (CHECK && stale) {
  console.error('Run:  node scripts/build-bundles.js');
  process.exit(1);
}
