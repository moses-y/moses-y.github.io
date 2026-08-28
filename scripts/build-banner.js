#!/usr/bin/env node
/*
 * build-banner.js - draw the README banner from the estate it describes.
 *
 * A banner is the first claim a repository makes about itself, and the usual
 * way to make one is to place a stock image behind a title. This one is drawn
 * from data/index.json: every dot is a repository at its own UMAP coordinate,
 * coloured by domain, which is the same projection the home page draws behind
 * the hero. So the picture is the thing, not a picture of the thing - and it
 * redraws as the estate grows rather than going quietly out of date the way
 * the headline count already did once.
 *
 * SVG rather than a raster because GitHub renders it inline at any width and
 * it costs about 40 KB for 1,400 points. No script element: GitHub strips
 * those, and a banner that needs one would not render.
 *
 *   node scripts/build-banner.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'img', 'banner.svg');

const W = 1280;
const H = 340;

// The home page's warm set, not Code Brain's. This sits next to the site in a
// reader's mind, so it should look like the site.
const DOMAIN_COLORS = {
  'AI & Data': '#E0521F',
  'Web & Interfaces': '#C08457',
  'Systems & Infra': '#6D9E70',
  'Mobile': '#D9A441',
  'Knowledge & Content': '#D9A441',
  'Agent Skills & Plugins': '#E0521F'
};
const FALLBACK = '#6B5D51';

const GROUND = '#0D0A08';
const INK = '#F3EBE2';
const MUTED = '#A99584';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return fallback; }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function percentile(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

/*
 * Fit the bulk, not the extent.
 *
 * UMAP leaves a handful of repositories far outside the main cloud, and
 * scaling to min/max hands most of the canvas to those few - the first version
 * of this banner drew 1,407 points into one corner and looked like a smudge.
 * Fitting the 2nd-to-98th percentile and clamping the rest to the edge spends
 * the width on where the estate actually is, at the cost of stacking the
 * outliers against the border, which is the right trade for a banner.
 */
function project(points) {
  const sx = points.map(p => p.u[0]).sort((a, b) => a - b);
  const sy = points.map(p => p.u[1]).sort((a, b) => a - b);
  const minX = percentile(sx, 0.02), maxX = percentile(sx, 0.98);
  const minY = percentile(sy, 0.02), maxY = percentile(sy, 0.98);
  const spanX = (maxX - minX) || 1;
  const spanY = (maxY - minY) || 1;
  const pad = 14;
  const fit = (v, min, span, size) =>
    pad + Math.max(0, Math.min(1, (v - min) / span)) * (size - pad * 2);
  return points.map(p => ({
    x: fit(p.u[0], minX, spanX, W),
    y: fit(p.u[1], minY, spanY, H),
    c: DOMAIN_COLORS[p.g] || FALLBACK
  }));
}

function main() {
  const idx = readJson(path.join(ROOT, 'data', 'index.json'), null);
  const stats = readJson(path.join(ROOT, 'stats.json'), {});
  if (!idx || !idx.repos) {
    console.error('build-banner: data/index.json not readable, banner not written');
    process.exit(1);
  }

  const points = project(idx.repos.filter(r => Array.isArray(r.u) && r.u.length >= 2));
  const forked = stats.forked || 0;
  const scripts = (stats.pipeline && stats.pipeline.scripts) || 0;
  const assertions = (stats.pipeline && stats.pipeline.assertions) || 0;

  /*
   * Points first, then a scrim, then the type. The scrim is a horizontal fade
   * rather than a flat panel so the cloud stays visible behind the text and
   * the two read as one image instead of a caption pasted onto a picture.
   */
  const dots = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.9" fill="${p.c}"/>`
  ).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(forked.toLocaleString('en-US'))} codebases I did not write">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GROUND}" stop-opacity="0.97"/>
      <stop offset="0.52" stop-color="${GROUND}" stop-opacity="0.88"/>
      <stop offset="1" stop-color="${GROUND}" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#D9A441"/>
      <stop offset="0.46" stop-color="#C08457"/>
      <stop offset="1" stop-color="#E0521F"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  <g opacity="0.85">${dots}</g>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect x="64" y="84" width="72" height="3" fill="url(#rule)"/>
  <text x="64" y="70" fill="${MUTED}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" letter-spacing="3.4">MOSES YEBEI</text>
  <text x="64" y="150" fill="${INK}" font-family="Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif" font-size="52" font-weight="600">${esc(forked.toLocaleString('en-US'))} codebases I did not write.</text>
  <text x="64" y="196" fill="${MUTED}" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="19">A static-analysis pipeline that reads open source, so I can study how</text>
  <text x="64" y="224" fill="${MUTED}" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="19">real systems are designed, shipped and kept alive.</text>
  <text x="64" y="284" fill="${MUTED}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" letter-spacing="0.6">${scripts} scripts &#183; ${assertions} assertions &#183; no model in the scoring path</text>
  <text x="64" y="306" fill="#6B5D51" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" letter-spacing="0.6">every dot is a repository at its own coordinate in the semantic map</text>
</svg>
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, svg);
  console.log('banner.svg: ' + points.length + ' repositories, ' +
    Math.round(svg.length / 1024) + ' KB');
}

main();
