#!/usr/bin/env node
/*
 * build-css.js - concatenate the site stylesheet from its partials.
 *
 * assets/css/site.css was 2,578 lines, the largest file in the repository and the
 * last big one on the 450-line ratchet. It is loaded by nine pages, so splitting
 * it into eight stylesheets would have traded one request for eight on every page
 * of the site. Splitting the source and joining it back keeps the delivered file
 * exactly as it was and makes the source editable in pieces - the same shape as
 * lib-blog-css and lib-blog-css-article, which produce assets/css/blog-post.css.
 *
 * Order is the filename order, and it is load-bearing rather than cosmetic: the
 * cascade of the original single file is preserved only because these are joined
 * in sequence. That is why the partials are numbered.
 *
 * The output is committed, because GitHub Pages serves what is in the repository
 * and no build runs before it. A committed artifact can go stale, so --check
 * exists and the pre-commit hook uses it: editing a partial without rebuilding is
 * caught at commit time rather than discovered as a visual regression.
 *
 * Usage:
 *   node scripts/build-css.js            rebuild the stylesheet
 *   node scripts/build-css.js --check     exit non-zero if it is out of date
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join('assets', 'css', 'site');
const OUT = path.join('assets', 'css', 'site.css');
const CHECK = process.argv.includes('--check');

const HEADER = [
  '/* GENERATED FILE - do not edit.',
  ' *',
  ' * Built by scripts/build-css.js from the partials in assets/css/site/.',
  ' * Edit those and run: node scripts/build-css.js',
  ' *',
  ' * One file rather than eight stylesheets because nine pages load it, and eight',
  ' * <link> tags per page would be a worse trade than a build step.',
  ' */',
  ''
].join('\n');

function partials() {
  return fs.readdirSync(SRC_DIR)
    .filter(f => f.endsWith('.css'))
    // Numeric prefix order. The cascade depends on it, so it is sorted explicitly
    // rather than trusted to whatever order the filesystem returns.
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function build() {
  const files = partials();
  if (!files.length) {
    console.error('No partials found in ' + SRC_DIR);
    process.exit(1);
  }
  // Each partial's own header explains that it is a partial, which is useful in
  // the source and noise in the output. It is replaced by a one-line marker so the
  // delivered file still says which section a rule came from when someone is
  // reading it in devtools.
  const body = files.map(f => {
    const raw = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
    const withoutHeader = raw.replace(/^\/\*[\s\S]*?\*\/\n+/, '');
    return '/* ' + f.replace(/^\d+-/, '').replace(/\.css$/, '') + ' */\n' +
      withoutHeader.replace(/\s+$/, '');
  }).join('\n\n');
  return { text: HEADER + body + '\n', files };
}

const { text, files } = build();

if (CHECK) {
  let current = null;
  try { current = fs.readFileSync(OUT, 'utf8'); } catch (e) { current = null; }
  if (current === text) {
    console.log(`assets/css/site.css is up to date (${files.length} partials)`);
    process.exit(0);
  }
  console.error('assets/css/site.css is out of date with assets/css/site/.');
  console.error('Run:  node scripts/build-css.js');
  process.exit(1);
}

fs.writeFileSync(OUT, text);
const lines = text.split('\n').length;
console.log(`=== Site stylesheet ===`);
for (const f of files) {
  console.log(`  ${f.padEnd(20)} ${fs.readFileSync(path.join(SRC_DIR, f), 'utf8').split('\n').length} lines`);
}
console.log(`  -> ${OUT}  ${lines} lines, ${(text.length / 1024).toFixed(0)} KB`);
