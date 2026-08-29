#!/usr/bin/env node
/*
 * build-pages.js - generates SEO service pages + blog from a shared template.
 *
 * Keeps nav/footer/head consistent across the site (separation of concerns:
 * one source of truth for chrome, page-specific content lives in data below).
 * Re-run after editing content:  node src/site/build-pages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/* Shared chrome ---------------------------------------------------------- */
// The chrome, plus the three constants and the escaper it needs. Extracted at the
// 450-line limit, and imported back rather than declared twice: two definitions of
// SITE is the kind of duplication that survives until the two disagree.
const { head, NAV, FOOTER, SITE, CAL, YEAR, esc } = require('./lib-site-chrome.js');
function checkItem(text) {
  return `<li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> ${text}</li>`;
}

/* Service page ----------------------------------------------------------- */
function servicePage(s) {
  const canonical = `${SITE}/${s.slug}.html`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${canonical}#service`,
        serviceType: s.serviceType,
        name: s.h1,
        description: s.description,
        areaServed: 'Worldwide',
        provider: { '@type': 'Person', name: 'Moses Yebei', url: SITE + '/' }
      },
      s.faqs && s.faqs.length ? {
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        mainEntity: s.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      } : null
    ].filter(Boolean)
  };

  const related = s.related.map((r) =>
    `<a href="/${r.slug}.html" class="timeline-tag" style="text-decoration:none;">${r.label} →</a>`
  ).join('\n                    ');

  const faqHtml = (s.faqs && s.faqs.length) ? `
    <section class="reveal">
        <div class="container">
            <div class="section-header">
                <span class="section-label">FAQ</span>
                <h2 class="section-title">Common Questions</h2>
            </div>
            <div class="timeline">
                ${s.faqs.map((f) => `<div class="timeline-item"><div class="timeline-content">
                    <h3 class="timeline-title">${esc(f.q)}</h3>
                    <p class="timeline-description">${esc(f.a)}</p>
                </div></div>`).join('\n                ')}
            </div>
        </div>
    </section>` : '';

  return `${head({ title: s.title, description: s.description, canonical, keywords: s.keywords, jsonld })}
<body>
${NAV}
    <main id="main-content">
    <section class="hero" style="min-height:auto;padding-top:160px;">
        <div class="container">
            <div class="hero-content">
                <div class="hero-badge"><span class="dot"></span> ${s.badge}</div>
                <h1><span class="gradient-text">${esc(s.h1)}</span></h1>
                <p class="bio" style="max-width:680px;">${esc(s.intro)}</p>
                <div class="hero-buttons">
                    <a href="${CAL}" target="_blank" rel="noopener" class="btn btn-primary">Book a call
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
                    <a href="/case-studies.html" class="btn btn-secondary">See case studies</a>
                </div>
            </div>
        </div>
    </section>

    <section class="reveal">
        <div class="container">
            <div class="section-header">
                <span class="section-label">What's included</span>
                <h2 class="section-title">${esc(s.includedTitle)}</h2>
            </div>
            <div class="services-grid">
                <div class="service-card">
                    <h3>Scope</h3>
                    <ul>
                        ${s.included.map(checkItem).join('\n                        ')}
                    </ul>
                </div>
                <div class="service-card featured">
                    <span class="popular-badge">How it works</span>
                    <h3>Engagement</h3>
                    <ul>
                        ${s.process.map(checkItem).join('\n                        ')}
                    </ul>
                    <a href="${CAL}" target="_blank" rel="noopener" class="cta">Book a call</a>
                </div>
                <div class="service-card">
                    <h3>Proof</h3>
                    <ul>
                        ${s.proof.map(checkItem).join('\n                        ')}
                    </ul>
                </div>
            </div>
        </div>
    </section>
${faqHtml}
    <section class="reveal">
        <div class="container" style="text-align:center;">
            <div class="section-header">
                <span class="section-label">Related</span>
                <h2 class="section-title">Explore related services</h2>
            </div>
            <div class="timeline-tags" style="justify-content:center;">
                ${related}
            </div>
        </div>
    </section>
    </main>
${FOOTER}`;
}

/* Blog post -------------------------------------------------------------- */
function blogPost(p) {
  const canonical = `${SITE}/insights/${p.slug}.html`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${canonical}#post`,
        headline: p.h1,
        description: p.description,
        datePublished: p.date,
        dateModified: p.date,
        author: { '@type': 'Person', name: 'Moses Yebei', url: SITE + '/' },
        image: `${SITE}/og-image.png`,
        mainEntityOfPage: canonical
      },
      p.faqs && p.faqs.length ? {
        '@type': 'FAQPage',
        mainEntity: p.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      } : null
    ].filter(Boolean)
  };

  return `${head({ title: p.title, description: p.description, canonical, keywords: p.keywords, jsonld })}
<body>
${NAV}
    <main id="main-content">
    <article class="hero" style="min-height:auto;padding-top:160px;">
        <div class="container" style="max-width:820px;">
            <div class="hero-badge"><span class="dot"></span> ${p.tag}</div>
            <h1 style="font-size:clamp(2rem,5vw,3.2rem);margin:18px 0;">${esc(p.h1)}</h1>
            <p style="color:var(--text-secondary);margin-bottom:8px;">Published ${p.dateHuman} · by Moses Yebei</p>
        </div>
    </article>
    <section class="reveal">
        <div class="container blog-body" style="max-width:820px;line-height:1.8;color:var(--text-secondary);font-size:1.05rem;">
${p.body}
            <div style="margin-top:48px;padding:28px;border-radius:var(--radius);background:var(--bg-card);border:1px solid var(--border);">
                <h3 style="color:var(--text-primary);margin-bottom:10px;">${esc(p.ctaTitle)}</h3>
                <p style="margin-bottom:18px;">${esc(p.ctaText)}</p>
                <a href="${p.ctaHref}" class="btn btn-primary" style="display:inline-flex;">${esc(p.ctaLabel)}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
            </div>
            <p style="margin-top:32px;"><a href="/insights/">← Back to all articles</a></p>
        </div>
    </section>
    </main>
${FOOTER}`;
}

/* Data ------------------------------------------------------------------- */
/* Case study page -------------------------------------------------------- */
function caseStudyPage(c) {
  const canonical = `${SITE}/case-studies/${c.slug}.html`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.h1,
    description: c.description,
    author: { '@type': 'Person', name: 'Moses Yebei', url: SITE + '/' },
    image: `${SITE}/og-image.png`,
    mainEntityOfPage: canonical
  };
  const block = (label, title, body) => `
    <section class="reveal">
        <div class="container" style="max-width:820px;">
            <span class="section-label">${label}</span>
            <h2 class="section-title" style="text-align:left;margin:6px 0 14px;">${esc(title)}</h2>
            <p style="color:var(--text-secondary);line-height:1.8;font-size:1.05rem;">${body}</p>
        </div>
    </section>`;
  const metrics = c.metrics.map((m) => `<div class="stat-item">
                    <div class="stat-number">${esc(m.value)}</div>
                    <div class="stat-label">${esc(m.label)}</div>
                </div>`).join('\n                ');
  const tags = c.stack.map((t) => `<span class="timeline-tag">${esc(t)}</span>`).join(' ');
  return `${head({ title: c.title, description: c.description, canonical, keywords: c.keywords, jsonld })}
<body>
${NAV}
    <main id="main-content">
    <article class="hero" style="min-height:auto;padding-top:160px;">
        <div class="container" style="max-width:820px;">
            <div class="hero-badge"><span class="dot"></span> ${c.sector}</div>
            <h1 style="font-size:clamp(2rem,5vw,3rem);margin:18px 0;"><span class="gradient-text">${esc(c.h1)}</span></h1>
            <p class="bio" data-parallax="6">${esc(c.summary)}</p>
            <div class="stats-bar" style="margin-top:28px;">
                ${metrics}
            </div>
        </div>
    </article>
${block('Challenge', 'The problem', c.challenge)}
${block('Approach', 'What I did', c.approach)}
${block('Outcome', 'The result', c.outcome)}
    <section class="reveal">
        <div class="container" style="max-width:820px;">
            <div class="timeline-tags">${tags}</div>
            <div style="margin-top:36px;padding:28px;border-radius:var(--radius);background:var(--bg-card);border:1px solid var(--border);">
                <h3 style="color:var(--text-primary);margin-bottom:10px;">Have a similar challenge?</h3>
                <p style="color:var(--text-secondary);margin-bottom:18px;">I take on a small number of engagements like this. Let's talk about yours.</p>
                <a href="${CAL}" target="_blank" rel="noopener" class="btn btn-primary" style="display:inline-flex;">Book a call
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
            </div>
            <p style="margin-top:32px;"><a href="/case-studies.html">← All case studies</a></p>
        </div>
    </section>
    </main>
${FOOTER}`;
}

const { services, caseStudies, posts } = require('./lib-site-content.js');

/* Services hub ----------------------------------------------------------- */
function servicesHub() {
  const canonical = `${SITE}/services.html`;
  const cards = services.map((s) => `                <div class="service-card">
                    <h3>${esc(s.h1)}</h3>
                    <p class="description">${esc(s.intro.split('.')[0])}.</p>
                    <a href="/${s.slug}.html" class="cta">Learn more →</a>
                </div>`).join('\n');
  return `${head({
    title: 'AI Consulting Services - Governance, RAG, GraphRAG, Fine-Tuning | Moses Yebei',
    description: 'AI consulting services: AI governance, AI readiness assessment, RAG pipelines, GraphRAG knowledge-graph agents, and LLM fine-tuning - from strategy to shipped systems.',
    canonical,
    keywords: 'AI consulting services, AI governance, RAG, GraphRAG, LLM fine-tuning, AI readiness',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: services.map((s, i) => ({
        '@type': 'ListItem', position: i + 1, name: s.h1, url: `${SITE}/${s.slug}.html`
      }))
    }
  })}
<body>
${NAV}
    <main id="main-content">
    <section class="hero" style="min-height:auto;padding-top:160px;">
        <div class="container">
            <div class="hero-content">
                <div class="hero-badge"><span class="dot"></span> Services</div>
                <h1><span class="gradient-text">AI Consulting Services</span></h1>
                <p class="bio" style="max-width:680px;">One advisor across the full lifecycle - from AI governance and readiness to shipping RAG, GraphRAG agents, and fine-tuned models in production.</p>
            </div>
        </div>
    </section>
    <section class="reveal">
        <div class="container">
            <div class="services-grid">
${cards}
            </div>
        </div>
    </section>
    </main>
${FOOTER}`;
}

/* Blog index ------------------------------------------------------------- */
function blogIndex() {
  const canonical = `${SITE}/insights/`;
  const cards = posts.map((p) => `                <div class="service-card">
                    <div class="hero-badge" style="margin-bottom:14px;"><span class="dot"></span> ${p.tag}</div>
                    <h3>${esc(p.h1)}</h3>
                    <p class="description">${esc(p.description)}</p>
                    <a href="/insights/${p.slug}.html" class="cta">Read article →</a>
                </div>`).join('\n');
  return `${head({
    title: 'Blog - AI Governance, RAG & LLM Engineering | Moses Yebei',
    description: 'Practical writing on AI governance, the EU AI Act, RAG, GraphRAG, and LLM fine-tuning for teams shipping real systems.',
    canonical,
    keywords: 'AI governance blog, EU AI Act, RAG, GraphRAG, LLM fine-tuning',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      url: canonical,
      name: 'Moses Yebei - Blog',
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.h1, url: `${SITE}/insights/${p.slug}.html`, datePublished: p.date }))
    }
  })}
<body>
${NAV}
    <main id="main-content">
    <section class="hero" style="min-height:auto;padding-top:160px;">
        <div class="container">
            <div class="hero-content">
                <div class="hero-badge"><span class="dot"></span> Insights</div>
                <h1><span class="gradient-text">Field notes</span></h1>
                <p class="bio" style="max-width:680px;">Practical writing on AI governance, the EU AI Act, RAG, GraphRAG, and shipping LLM systems that hold up in production.</p>
            </div>
        </div>
    </section>
    <section class="reveal">
        <div class="container">
            <div class="services-grid">
${cards}
            </div>
        </div>
    </section>
    </main>
${FOOTER}`;
}

/* Case studies hub ------------------------------------------------------- */
function caseStudiesHub() {
  const canonical = `${SITE}/case-studies.html`;
  const cards = caseStudies.map((c) => `                <div class="service-card">
                    <div class="hero-badge" style="margin-bottom:14px;"><span class="dot"></span> ${c.sector}</div>
                    <h3>${esc(c.h1)}</h3>
                    <div class="timeline-tags" style="margin:12px 0;">${c.metrics.map((m) => `<span class="timeline-tag">${esc(m.value)} ${esc(m.label)}</span>`).join(' ')}</div>
                    <p class="description">${esc(c.summary)}</p>
                    <a href="/case-studies/${c.slug}.html" class="cta">Read case study →</a>
                </div>`).join('\n');
  return `${head({
    title: 'Case Studies - Shipped AI Systems & Outcomes | Moses Yebei',
    description: 'Real AI engagements with quantified outcomes - knowledge-graph agents, e-discovery NLP at 99%, and a fraud model that cut losses 75%.',
    canonical,
    keywords: 'AI case studies, machine learning results, knowledge graph, fraud detection, NLP e-discovery',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: caseStudies.map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: c.h1, url: `${SITE}/case-studies/${c.slug}.html`
      }))
    }
  })}
<body>
${NAV}
    <main id="main-content">
    <section class="hero" style="min-height:auto;padding-top:160px;">
        <div class="container">
            <div class="hero-content">
                <div class="hero-badge"><span class="dot"></span> Case Studies</div>
                <h1><span class="gradient-text">Outcomes, not adjectives</span></h1>
                <p class="bio" style="max-width:680px;">A few engagements where the numbers did the talking - from knowledge-graph agents in production to fraud losses cut by three quarters.</p>
            </div>
        </div>
    </section>
    <section class="reveal">
        <div class="container">
            <div class="services-grid">
${cards}
            </div>
        </div>
    </section>
    </main>
${FOOTER}`;
}

/* Write ------------------------------------------------------------------ */
const written = [];
function write(rel, content) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  written.push(rel);
}

services.forEach((s) => write(`${s.slug}.html`, servicePage(s)));
posts.forEach((p) => write(`insights/${p.slug}.html`, blogPost(p)));
caseStudies.forEach((c) => write(`case-studies/${c.slug}.html`, caseStudyPage(c)));
write('services.html', servicesHub());
write('case-studies.html', caseStudiesHub());
write('insights/index.html', blogIndex());

/* Sitemap ---------------------------------------------------------------- */
// Not written here. It used to be, and because build-index writes one too, running
// this by hand replaced a 1,344-URL sitemap with a 38-URL one and the 1,331
// articles vanished until the next cron run put them back. build-index now scans
// case-studies/ and insights/ as well, so it is the single owner.

console.log('Generated:\n' + written.map((w) => '  ' + w).join('\n'));
