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

  // ---- human sitemap ----------------------------------------------------
  // Built from the same records as sitemap.xml so the page a person reads and
  // the file a crawler reads cannot disagree.
  writeSitemapPage(records, staticPages, articles);

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


// A sitemap a person can actually use. sitemap.xml is a flat list of 1,300+
// URLs for crawlers; this groups the same set the way the site is organised,
// which also gives every briefing an internal link from a real page instead of
// only from the XML.
const PAGE_LABELS = {
  'projects.html': ['Projects', 'Every repository, with its measured facts'],
  'knowledge-graph.html': ['Code Graph', 'Semantic map of the estate'],
  'code-brain.html': ['Code Brain', 'Domains to languages to repos to modules'],
  'report.html': ['Architecture reports', 'Deterministic analysis per repository'],
  'services.html': ['Services', 'How I work with clients'],
  'case-studies.html': ['Case studies', 'Selected engagements'],
  'ai-readiness-assessment.html': ['AI readiness assessment', ''],
  'ai-governance-consulting.html': ['AI governance consulting', ''],
  'graphrag-knowledge-graph-agents.html': ['GraphRAG & knowledge-graph agents', ''],
  'llm-fine-tuning-consulting.html': ['LLM fine-tuning', ''],
  'rag-pipeline-consulting.html': ['RAG pipelines', '']
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function writeSitemapPage(records, staticPages, articles) {
  const have = new Set(articles.map(a => a.replace(/\.html$/, '')));
  const byDomain = new Map();
  for (const r of records) {
    if (!have.has(r.n)) continue;          // only list writing that exists
    const d = r.g || 'Other';
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(r);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  const surfaces = ['projects.html', 'knowledge-graph.html', 'code-brain.html', 'report.html']
    .filter(p => staticPages.includes(p));
  const advisory = ['services.html', 'case-studies.html', 'ai-readiness-assessment.html',
    'ai-governance-consulting.html', 'graphrag-knowledge-graph-agents.html',
    'llm-fine-tuning-consulting.html', 'rag-pipeline-consulting.html']
    .filter(p => staticPages.includes(p));

  const linkList = pages => pages.map(p => {
    const [label, sub] = PAGE_LABELS[p] || [p.replace(/\.html$/, ''), ''];
    return `<li><a href="/${p}">${esc(label)}</a>` +
      (sub ? `<span class="sm-sub">${esc(sub)}</span>` : '') + '</li>';
  }).join('\n            ');

  const sections = domains.map(([domain, rows]) => {
    rows.sort((a, b) => (a.t || a.n).toLowerCase().localeCompare((b.t || b.n).toLowerCase()));
    const items = rows.map(r =>
      `<li><a href="/blog/${encodeURIComponent(r.n)}.html">${esc(r.t || r.n)}</a>` +
      (r.l ? `<span class="sm-lang">${esc(r.l)}</span>` : '') + '</li>').join('');
    return `        <section class="sm-domain">
          <h3>${esc(domain)} <span class="sm-count">${rows.length}</span></h3>
          <ul class="sm-briefings">${items}</ul>
        </section>`;
  }).join('\n');

  const total = domains.reduce((n, [, r]) => n + r.length, 0);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site map | Moses Yebei</title>
    <meta name="description" content="Every page and every repository briefing on this site, grouped by domain.">
    <link rel="canonical" href="${SITE}/sitemap.html">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#9889;</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/site.css">
    <style>
        body { margin: 0; background: var(--bg-primary); }
        .sm-wrap { max-width: 1100px; margin: 0 auto; padding: 40px 28px 90px; }
        .sm-eyebrow { font-family: var(--font-mono); font-size: 0.66rem; letter-spacing: 0.16em;
            text-transform: uppercase; color: var(--text-tertiary); }
        .sm-wrap h1 { font-family: var(--font-display); font-weight: 600;
            font-size: clamp(1.9rem, 4vw, 2.6rem); margin: 12px 0 10px; }
        .sm-lede { color: var(--text-secondary); max-width: 62ch; margin: 0 0 34px; }
        .sm-lede a { color: var(--accent); }
        .sm-nav { display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
            padding: 14px 28px; border-bottom: 1px solid var(--border); }
        .sm-nav a { color: var(--text-secondary); text-decoration: none; font-size: 0.9rem; }
        .sm-nav a:hover { color: var(--text-primary); }
        .sm-nav .sm-logo { font-weight: 800; font-size: 1.1rem; background: var(--gradient);
            -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .sm-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 28px; }
        .sm-cols h2, .sm-domain h3 { font-family: var(--font-display); font-size: 1.05rem;
            font-weight: 600; margin: 0 0 12px; }
        .sm-cols ul, .sm-briefings { list-style: none; margin: 0; padding: 0; }
        .sm-cols li { padding: 7px 0; border-bottom: 1px solid var(--border); }
        .sm-cols a, .sm-briefings a { color: var(--accent); text-decoration: none; }
        .sm-cols a:hover, .sm-briefings a:hover { color: var(--accent-secondary); }
        .sm-sub { display: block; font-size: 0.76rem; color: var(--text-tertiary); }
        hr.sm-rule { border: 0; border-top: 1px solid var(--border); margin: 42px 0 30px; }
        .sm-domain { margin-bottom: 34px; }
        .sm-count { font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-tertiary); }
        .sm-briefings { columns: 4 210px; column-gap: 26px; }
        .sm-briefings li { padding: 4px 0; font-size: 0.86rem; break-inside: avoid; }
        .sm-lang { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-tertiary);
            margin-left: 7px; }
    </style>
</head>
<body>
    <nav class="sm-nav">
        <a href="/" class="sm-logo">MY</a>
        <a href="/projects.html">Projects</a>
        <a href="/knowledge-graph.html">Code Graph</a>
        <a href="/code-brain.html">Code Brain</a>
        <a href="/services.html">Services</a>
        <a href="/case-studies.html">Case Studies</a>
    </nav>
    <div class="sm-wrap">
        <div class="sm-eyebrow">Site map</div>
        <h1>Everything on this site</h1>
        <p class="sm-lede">${total.toLocaleString()} repository briefings and every page, grouped the way the
        site is organised. Regenerated with the feed, so this list and
        <a href="/sitemap.xml">sitemap.xml</a> are always the same set.</p>

        <div class="sm-cols">
          <div>
            <h2>Surfaces</h2>
            <ul>
            <li><a href="/">Home</a><span class="sm-sub">The estate at a glance</span></li>
            ${linkList(surfaces)}
            </ul>
          </div>
          <div>
            <h2>Advisory</h2>
            <ul>
            ${linkList(advisory)}
            </ul>
          </div>
          <div>
            <h2>Writing</h2>
            <ul>
            <li><a href="/insights/">Insights</a><span class="sm-sub">Longer-form pieces</span></li>
            <li><a href="/blog/">All briefings</a><span class="sm-sub">Flat list of ${total.toLocaleString()}</span></li>
            <li><a href="/feed.xml">RSS</a></li>
            </ul>
          </div>
        </div>

        <hr class="sm-rule">
        <h2 style="font-family:var(--font-display);font-size:1.15rem;margin:0 0 20px">Briefings by domain</h2>
${sections}
    </div>
</body>
</html>
`;
  fs.writeFileSync('sitemap.html', html);
  console.log(`  sitemap.html       ${total} briefings in ${domains.length} domains`);
}

main();
