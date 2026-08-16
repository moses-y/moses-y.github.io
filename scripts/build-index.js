#!/usr/bin/env node
/*
 * build-index.js - the read side of the pipeline.
 *
 * forks.json is a write-side artifact: 10.3MB, of which 44% is article prose and
 * 26% is file trees. Listings show none of that, yet index.html and projects.html
 * were downloading it AND the 11.7MB SQLite build of the same data.
 *
 * Emits three small files instead:
 *   data/index.json   lean records for listings, facets and the graph
 *   data/search.json  a prebuilt inverted index for instant client-side search
 *   sitemap.xml       every page, including the 1275 articles that were missing
 *
 * Detail (summary, knowledgeGraph) stays in forks.json and the per-repo pages,
 * fetched only when something is actually opened.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SITE = 'https://moses-y.github.io';
const OUT = 'data';

const STOP = new Set(('a an the and or but if then of for to in on at by with from as is are was ' +
  'were be been being it its this that these those you your we our i my me he she they them ' +
  'not no so such can will just very also more most other some any each which who whom what ' +
  'when where why how all both few own same than too s t don now').split(' '));

function tokenize(text) {
  return String(text || '').toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map(t => t.replace(/^[.]+|[.]+$/g, ''))
    .filter(t => t.length > 1 && t.length < 24 && !STOP.has(t) && !/^\d+$/.test(t));
}

function main() {
  if (!fs.existsSync('forks.json')) {
    console.error('forks.json not found. Run update-forks.js first.');
    process.exit(1);
  }
  const raw = fs.readFileSync('forks.json', 'utf8');
  const data = JSON.parse(raw);
  const forks = data.forks || [];
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // ---- lean index -------------------------------------------------------
  // Single-letter keys: at 1295 records the key names themselves were a
  // measurable share of the file.
  const records = forks.map(f => {
    const kg = f.knowledgeGraph || {};
    const h = kg.codeHealth || {};
    const rec = {
      i: f.id,
      n: f.name,
      t: f.displayName || f.name,
      d: (f.description || '').slice(0, 180),
      l: f.language || null,
      g: f.domain || null,
      k: f.kind || null,
      s: f.stars || 0,
      y: f.type === 'original' ? 1 : 0,
      f: kg.totalFiles || 0,
      x: (kg.issues || []).length,
      a: f.summary ? 1 : 0,
      c: [h.hasTests ? 1 : 0, kg.hasCI ? 1 : 0, kg.hasDocker ? 1 : 0,
          h.hasLicense ? 1 : 0, (h.committedSecrets > 0) ? 1 : 0].join('')
    };
    // Fields the card renderer reads directly. Small, and including them keeps the
    // front-end swap to a change of data source rather than a rewrite.
    if (f.image) rec.m = f.image;
    if (f.readTime) rec.r = f.readTime;
    if (f.updatedAt) rec.z = f.updatedAt;
    if (f.parent) rec.p = { n: f.parent.name, u: f.parent.url, s: f.parent.stars || 0 };
    if (Array.isArray(f.umap)) rec.u = f.umap.map(v => +v.toFixed(4));
    return rec;
  });

  const index = {
    generated: data.lastUpdated || null,
    total: records.length,
    totals: {
      files: forks.reduce((a, f) => a + (((f.knowledgeGraph || {}).totalFiles) || 0), 0),
      findings: forks.reduce((a, f) => a + (((f.knowledgeGraph || {}).issues) || []).length, 0),
      links: (data.similarityLinks || []).length,
      withArticle: records.filter(r => r.a).length
    },
    taxonomy: data.taxonomy || null,
    links: (data.similarityLinks || []).map(l => [l.source, l.target, +(l.similarity || l.sim || 0).toFixed(3)]),
    repos: records
  };
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));

  // ---- inverted index ---------------------------------------------------
  // token -> positions in `repos`, so a query is a set intersection rather
  // than a scan over every record.
  const postings = Object.create(null);
  records.forEach((r, pos) => {
    const seen = new Set();
    for (const tok of tokenize([r.n, r.t, r.d, r.l, r.k, r.g].join(' '))) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      (postings[tok] || (postings[tok] = [])).push(pos);
    }
  });
  // A token in almost every document cannot narrow anything and costs the most bytes.
  const cap = Math.floor(records.length * 0.4);
  let dropped = 0;
  for (const tok of Object.keys(postings)) {
    if (postings[tok].length > cap) { delete postings[tok]; dropped++; }
  }
  fs.writeFileSync(path.join(OUT, 'search.json'), JSON.stringify({ n: records.length, t: postings }));

  // ---- sitemap ----------------------------------------------------------
  // The old one listed 17 pages and none of the articles, so the largest body
  // of writing on the site was undiscoverable.
  const today = (data.lastUpdated || new Date().toISOString()).slice(0, 10);
  const staticPages = fs.readdirSync('.')
    .filter(f => f.endsWith('.html') && !['callback.html', 'elements.html', 'generic.html'].includes(f));
  const urls = [];
  const add = (loc, priority, freq) => urls.push(
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`);

  add(`${SITE}/`, '1.0', 'daily');
  for (const p of staticPages.sort()) {
    if (p === 'index.html') continue;
    add(`${SITE}/${p}`, '0.8', 'weekly');
  }
  const articles = fs.existsSync('blog')
    ? fs.readdirSync('blog').filter(f => f.endsWith('.html') && f !== 'index.html').sort()
    : [];
  for (const a of articles) add(`${SITE}/blog/${a}`, '0.6', 'monthly');

  fs.writeFileSync('sitemap.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n');

  // ---- report -----------------------------------------------------------
  const kb = p => (fs.statSync(p).size / 1024).toFixed(0);
  const gz = p => (zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length / 1024).toFixed(0);
  const before = (Buffer.byteLength(raw) / 1048576).toFixed(1);
  console.log('=== Index build ===');
  console.log(`  data/index.json    ${kb(OUT + '/index.json')} KB  (${gz(OUT + '/index.json')} KB gzipped)`);
  console.log(`  data/search.json   ${kb(OUT + '/search.json')} KB  (${gz(OUT + '/search.json')} KB gzipped)`);
  console.log(`  tokens indexed     ${Object.keys(postings).length} (${dropped} too common to keep)`);
  console.log(`  sitemap.xml        ${urls.length} urls (${articles.length} articles)`);
  console.log(`  replaces           forks.json ${before} MB + forks.db on listing pages`);
}

main();
