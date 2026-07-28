#!/usr/bin/env node
/*
 * build-pages.js — generates SEO service pages + blog from a shared template.
 *
 * Keeps nav/footer/head consistent across the site (separation of concerns:
 * one source of truth for chrome, page-specific content lives in data below).
 * Re-run after editing content:  node scripts/build-pages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://moses-y.github.io';
const CAL = 'https://cal.com/moses-yebei';
const YEAR = 2025;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Shared chrome ---------------------------------------------------------- */
function head({ title, description, canonical, jsonld, keywords }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${SITE}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${SITE}/og-image.png">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
${jsonld ? `    <script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n    </script>\n` : ''}    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/site.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
</head>`;
}

const NAV = `    <a href="#main-content" class="skip-link">Skip to main content</a>
    <div class="gradient-bg"></div>
    <div class="grid-pattern"></div>
    <nav id="navbar">
        <div class="container nav-content">
            <a href="/" class="nav-logo">MY</a>
            <ul class="nav-links">
                <li><a href="/#skills">Skills</a></li>
                <li><a href="/#experience">Experience</a></li>
                <li><a href="/services.html">Services</a></li>
                <li><a href="/case-studies.html">Case Studies</a></li>
                <li><a href="/projects.html">Projects</a></li>
                <li><a href="/insights/">Insights</a></li>
                <li><a href="/knowledge-graph.html">Code Graph</a></li>
            </ul>
            <a href="${CAL}" target="_blank" rel="noopener" class="nav-cta">Book a call</a>
        </div>
    </nav>`;

const FOOTER = `    <footer>
        <div class="container">
            <p>&copy; ${YEAR} Moses Yebei. Based in Nairobi, Kenya. Built with <a href="https://github.com/moses-y/moses-y.github.io" target="_blank">passion</a>.</p>
        </div>
    </footer>
    <button class="back-to-top" id="back-to-top" aria-label="Back to top">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
    </button>
    <script src="/assets/js/site.js"></script>
    <script src="/assets/js/animations.js" defer></script>
</body>
</html>`;

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

const services = [
  {
    slug: 'ai-governance-consulting',
    title: 'AI Governance Consultant | Moses Yebei',
    h1: 'AI Governance & Policy Consulting',
    serviceType: 'AI Governance Consulting',
    badge: 'Strategy & guardrails',
    keywords: 'AI governance consultant, responsible AI, AI policy, EU AI Act compliance, AI risk management',
    description: 'AI governance consultant helping organizations set responsible-AI policy, risk controls, and EU AI Act-ready governance before they scale.',
    intro: 'Guardrails before you scale. I help teams put responsible-AI policy, risk classification, and accountable oversight in place so AI ships without regulatory or reputational surprises.',
    includedTitle: 'Governance that holds up in production',
    included: [
      'Responsible-AI policy &amp; principles tailored to your risk profile',
      'AI system inventory &amp; risk classification (EU AI Act-aligned)',
      'Model &amp; data documentation, audit trails, human-oversight design',
      'Third-party / vendor AI risk review'
    ],
    process: [
      'Discovery workshop &amp; current-state assessment',
      'Gap analysis against your target framework',
      'Prioritized remediation roadmap',
      'Retainer or fixed-scope delivery'
    ],
    proof: [
      'Built governed knowledge-graph + multi-agent systems in production',
      'E-discovery / forensic pipelines under strict compliance regimes',
      'Data governance across regulated fintech &amp; legal clients'
    ],
    related: [
      { slug: 'ai-readiness-assessment', label: 'AI Readiness' },
      { slug: 'graphrag-knowledge-graph-agents', label: 'GraphRAG Agents' }
    ],
    faqs: [
      { q: 'Do I need AI governance if I only use third-party models like GPT or Claude?', a: 'Yes. Under frameworks like the EU AI Act, obligations attach to how you deploy and use AI, not just who built the model. You still need an inventory, risk classification, human oversight, and documentation for the systems you put in front of users.' },
      { q: 'How long does an initial governance engagement take?', a: 'A focused current-state assessment and prioritized roadmap typically takes 2–4 weeks. Ongoing implementation support runs on a monthly retainer scaled to your risk profile.' }
    ]
  },
  {
    slug: 'ai-readiness-assessment',
    title: 'AI Readiness Assessment Consultant | Moses Yebei',
    h1: 'AI & Data Readiness Assessment',
    serviceType: 'AI Readiness Assessment',
    badge: 'Before you build',
    keywords: 'AI readiness assessment consultant, data readiness, AI strategy, data governance for AI',
    description: 'AI readiness assessment consultant. I find the data, governance, and infrastructure gaps that quietly kill AI projects — before you spend the budget.',
    intro: 'Most AI projects fail on readiness, not modeling. I assess your data, governance, skills, and infrastructure and hand you a clear, prioritized path to your first production win.',
    includedTitle: 'Know the gaps before you spend the budget',
    included: [
      'Data quality, availability &amp; lineage review',
      'Use-case triage &amp; ROI prioritization',
      'Infrastructure &amp; MLOps maturity assessment',
      'Skills &amp; operating-model gap analysis'
    ],
    process: [
      'Stakeholder interviews &amp; data audit',
      'Readiness scorecard across 5 dimensions',
      'Prioritized, costed roadmap',
      'Optional hands-on delivery of the first use case'
    ],
    proof: [
      'Delivered AI across fintech, legal, agriculture, supply chain &amp; healthcare',
      'Improved client operational efficiency up to 40%',
      'Turned ambiguous briefs into shipped, measured systems'
    ],
    related: [
      { slug: 'ai-governance-consulting', label: 'AI Governance' },
      { slug: 'rag-pipeline-consulting', label: 'RAG Pipelines' }
    ],
    faqs: [
      { q: 'What do I get at the end of a readiness assessment?', a: 'A readiness scorecard across data, governance, infrastructure, skills, and use-case value; a shortlist of high-ROI use cases; and a costed, sequenced roadmap you can act on with or without me.' }
    ]
  },
  {
    slug: 'rag-pipeline-consulting',
    title: 'RAG Pipeline Consultant & Developer | Moses Yebei',
    h1: 'RAG Pipeline Consulting & Development',
    serviceType: 'RAG Development',
    badge: 'Retrieval that works',
    keywords: 'RAG pipeline consultant, RAG developer for hire, retrieval augmented generation, vector database, LLM search',
    description: 'RAG pipeline consultant and developer. I design and ship production retrieval-augmented generation — accurate, evaluated, and grounded in your data.',
    intro: 'Demos are easy; production RAG that stays accurate is not. I build retrieval pipelines with real evaluation, grounding, and guardrails — so answers are trustworthy, not just plausible.',
    includedTitle: 'Production RAG, not a notebook demo',
    included: [
      'Chunking, embedding &amp; vector store design (Pinecone, FAISS, Chroma, pgvector)',
      'Hybrid &amp; re-ranked retrieval, query rewriting',
      'Grounding, citations &amp; hallucination guardrails',
      'Evaluation harness &amp; observability (Langfuse)'
    ],
    process: [
      'Retrieval quality baseline on your data',
      'Iterative pipeline design with eval gates',
      'Production deployment &amp; monitoring',
      'Handover &amp; team enablement'
    ],
    proof: [
      'FAISS-backed RAG pipeline serving live users at AICE Africa',
      'NLP pipeline over 1M+ documents at 99% accuracy',
      'Deep knowledge-graph + retrieval work at Autar.ai'
    ],
    related: [
      { slug: 'graphrag-knowledge-graph-agents', label: 'GraphRAG Agents' },
      { slug: 'llm-fine-tuning-consulting', label: 'LLM Fine-Tuning' }
    ],
    faqs: [
      { q: 'Should I use RAG or fine-tuning?', a: 'Usually RAG first: it keeps knowledge fresh, is cheaper to update, and gives you citations. Fine-tuning is for style, format, or narrow tasks where the behavior — not the facts — needs to change. Many production systems combine both.' }
    ]
  },
  {
    slug: 'graphrag-knowledge-graph-agents',
    title: 'GraphRAG & Knowledge-Graph Agent Consultant | Moses Yebei',
    h1: 'GraphRAG & Knowledge-Graph Agents',
    serviceType: 'GraphRAG Consulting',
    badge: 'My specialty',
    keywords: 'GraphRAG consultant, knowledge graph LLM, LangGraph agent developer, Neo4j, FalkorDB, multi-agent systems',
    description: 'GraphRAG and knowledge-graph agent consultant. When vanilla vector RAG plateaus, I use knowledge graphs to give LLM agents structured, connected context.',
    intro: 'Vector RAG retrieves passages; it does not understand how facts connect. I build GraphRAG systems — knowledge graphs feeding LangGraph agents structured, relationship-aware context — for the questions plain retrieval cannot answer.',
    includedTitle: 'When vector RAG plateaus, graphs win',
    included: [
      'Knowledge-graph modeling (Neo4j, FalkorDB, NetworkX)',
      'Entity &amp; relation extraction pipelines',
      'GraphRAG retrieval feeding LLM agents',
      'LangGraph multi-agent orchestration &amp; routing'
    ],
    process: [
      'Model your domain as a graph schema',
      'Build extraction &amp; ingestion pipeline',
      'Wire graph-aware retrieval into agents',
      'Evaluate against a vector-RAG baseline'
    ],
    proof: [
      'Three-layer knowledge-graph pipeline (FalkorDB/Cypher, 149 entity types) at Autar.ai',
      '7 specialist agents each served a tailored graph slice — fewer tokens, better output',
      "This site's own code-graph analysis is graph-driven"
    ],
    related: [
      { slug: 'rag-pipeline-consulting', label: 'RAG Pipelines' },
      { slug: 'ai-governance-consulting', label: 'AI Governance' }
    ],
    faqs: [
      { q: 'What is GraphRAG and when is it better than normal RAG?', a: 'GraphRAG retrieves from a knowledge graph instead of (or alongside) a vector store, so the model sees how entities relate — not just isolated text chunks. It shines on multi-hop questions, aggregation across documents, and domains where relationships carry the meaning.' }
    ]
  },
  {
    slug: 'llm-fine-tuning-consulting',
    title: 'LLM Fine-Tuning Consultant (LoRA/QLoRA) | Moses Yebei',
    h1: 'LLM Training & Fine-Tuning',
    serviceType: 'LLM Fine-Tuning',
    badge: 'Custom models',
    keywords: 'LLM fine-tuning consultant, LoRA, QLoRA, fine-tune LLaMA Mistral, custom model training, model distillation',
    description: 'LLM fine-tuning consultant. I fine-tune open models (LoRA/QLoRA) with the data pipelines and evaluation behind them — when a generic API is not enough.',
    intro: 'When prompting and RAG hit their limits, a fine-tuned model can be cheaper, faster, and more on-brand. I handle the data, the training, and the evaluation — end to end.',
    includedTitle: 'Custom models, with the data behind them',
    included: [
      'Fine-tuning open models (LLaMA, Mistral) with LoRA / QLoRA',
      'Instruction &amp; preference dataset curation',
      'Evaluation, guardrails &amp; regression testing',
      'Serving, quantization &amp; cost optimization'
    ],
    process: [
      'Decide: prompt vs RAG vs fine-tune (honest cost/benefit)',
      'Dataset construction &amp; cleaning',
      'Train, evaluate, iterate against a baseline',
      'Deploy &amp; hand over reproducible pipelines'
    ],
    proof: [
      'Production ML across PyTorch, scikit-learn, XGBoost',
      'Speech-to-text &amp; NLP pipelines at 99% accuracy',
      'Model training &amp; team enablement for non-technical stakeholders'
    ],
    related: [
      { slug: 'rag-pipeline-consulting', label: 'RAG Pipelines' },
      { slug: 'ai-readiness-assessment', label: 'AI Readiness' }
    ],
    faqs: [
      { q: 'Is fine-tuning worth it versus just using GPT or Claude?', a: 'Often not at first — prompting plus RAG covers most needs. Fine-tuning pays off when you need consistent style/format, lower per-call cost at scale, on-prem/private deployment, or a narrow task a general model does inconsistently. I will tell you honestly when it is not worth it.' }
    ]
  }
];

const caseStudies = [
  {
    slug: 'autar-knowledge-graph-agents',
    sector: 'Developer tooling / AI platform',
    title: 'Case Study: Knowledge-Graph Multi-Agent Platform | Moses Yebei',
    h1: 'A knowledge graph that made 7 AI agents cheaper and sharper',
    keywords: 'knowledge graph case study, GraphRAG, multi-agent system, FalkorDB, LangGraph',
    description: 'How a three-layer knowledge-graph pipeline feeding 7 specialist agents cut token usage and lifted output quality on a production code-analysis platform.',
    summary: 'As founding engineer at Autar.ai, I designed the knowledge-graph backbone for an automated software-analysis platform — turning raw context into structured graph slices that made a fleet of AI agents both cheaper to run and more accurate.',
    metrics: [
      { value: '149', label: 'Entity types modeled' },
      { value: '7', label: 'Specialist agents served' },
      { value: '20+', label: 'Languages analyzed' }
    ],
    challenge: 'The platform had to analyze codebases across 20+ languages and answer deep, cross-file questions. Feeding raw context to LLM agents was expensive and noisy — token budgets ballooned and answers drifted whenever the relevant facts were scattered across files.',
    approach: 'I designed a three-layer knowledge-graph pipeline in FalkorDB (Cypher, 149 entity types) and had each of 7 specialist agents query a tailored graph slice instead of raw context. I built 20+ Temporal workflows and 120+ activities for durable orchestration, with Kafka streaming, ClickHouse analytics, and full observability running on production GKE.',
    outcome: 'Graph-scoped retrieval cut the tokens each agent consumed and measurably lifted output quality — the model saw only the connected facts it needed. The platform runs in production with durable, observable workflows the team can reason about and extend.',
    stack: ['FalkorDB / Cypher', 'LangGraph', 'Temporal', 'Kafka', 'ClickHouse', 'GKE']
  },
  {
    slug: 'salix-ediscovery-nlp',
    sector: 'Legal / e-discovery',
    title: 'Case Study: NLP Over 1M+ Legal Documents at 99% | Moses Yebei',
    h1: 'Reviewing 1M+ litigation documents at 99% accuracy',
    keywords: 'e-discovery NLP case study, document classification, legal AI, NLP pipeline',
    description: 'How an NLP/ML pipeline processed over a million litigation documents at 99% accuracy, cutting retrieval time and lifting process efficiency.',
    summary: 'As technical lead at SALIX Data, I built the NLP/ML pipeline behind high-stakes litigation delivery — turning a manual review bottleneck into an accurate, auditable, automated process.',
    metrics: [
      { value: '1M+', label: 'Documents processed' },
      { value: '99%', label: 'Classification accuracy' },
      { value: '-25%', label: 'Retrieval time' }
    ],
    challenge: 'High-stakes litigation meant millions of documents had to be classified and retrieved accurately and defensibly. Manual review did not scale, and errors carried real legal and financial risk under strict compliance regimes.',
    approach: 'I architected an NLP/ML pipeline spanning Relativity, CloudNine Law, and Microsoft Purview, plus a speech-to-text pipeline for audio evidence. The design prioritized accuracy, auditability, and repeatability — aligning the AI roadmap with client needs alongside the CEO.',
    outcome: 'The pipeline processed 1M+ documents at 99% accuracy and speech-to-text at 99% accuracy, improved process efficiency ~30%, and cut retrieval time ~25% — while staying defensible under compliance review.',
    stack: ['Python / NLP', 'Relativity', 'CloudNine Law', 'MS Purview', 'Speech-to-Text']
  },
  {
    slug: 'fintech-fraud-detection',
    sector: 'Fintech / banking',
    title: 'Case Study: Cutting Bank Fraud 75% with ML | Moses Yebei',
    h1: 'Cutting fraudulent transactions by 75% for a bank',
    keywords: 'fraud detection case study, machine learning fintech, predictive modeling',
    description: 'How a machine-learning fraud-detection model reduced fraudulent transactions by 75% and lifted operational efficiency across client engagements.',
    summary: 'Consulting independently across fintech and banking, I built a fraud-detection model that sharply cut losses — one of a series of predictive systems delivered for measurable business outcomes.',
    metrics: [
      { value: '-75%', label: 'Fraudulent transactions' },
      { value: '+60%', label: 'Lead engagement (chatbots)' },
      { value: '+40%', label: 'Operational efficiency' }
    ],
    challenge: 'A banking client was losing money to fraudulent transactions that rule-based checks kept missing, while non-technical teams needed insight they could actually act on.',
    approach: 'I built a machine-learning fraud-detection model tuned to the client\'s transaction patterns, paired it with real-time analytics dashboards, and ran hands-on training so non-technical staff could use and trust the outputs.',
    outcome: 'Fraudulent transactions dropped 75%. Across the wider engagement, AI chatbots lifted lead engagement 60% and predictive solutions improved operational efficiency up to 40%.',
    stack: ['Python', 'scikit-learn', 'XGBoost', 'Dashboards', 'A/B Testing']
  }
];

const posts = [
  {
    slug: 'eu-ai-act-sme-compliance-checklist',
    title: 'EU AI Act for SMEs: A 7-Step Compliance Checklist (2026)',
    h1: 'EU AI Act for SMEs: A 7-Step Compliance Checklist',
    tag: 'AI Governance',
    date: '2026-07-28',
    dateHuman: 'July 28, 2026',
    keywords: 'EU AI Act SME, EU AI Act compliance checklist, how to prepare for the EU AI Act, AI governance small business',
    description: 'A practical 7-step EU AI Act compliance checklist for small and mid-sized businesses — what applies to you, and what to do before the deadlines bite.',
    body: `            <p>The EU AI Act is the world's first comprehensive AI law, and its obligations are rolling in through 2026. The common myth is that it only targets Big Tech. It does not — if you <em>deploy</em> or <em>use</em> AI in the EU market, obligations can attach to you, even when the model was built by someone else. Here is a practical, non-legal checklist to get an SME oriented.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">1. Build an AI system inventory</h2>
            <p>You cannot govern what you have not listed. Catalogue every AI system you build, buy, or embed — including features inside SaaS tools. For each, note purpose, data used, and who is affected.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">2. Classify each system by risk</h2>
            <p>The Act is risk-tiered: <strong>prohibited</strong>, <strong>high-risk</strong>, <strong>limited-risk</strong> (transparency obligations), and <strong>minimal-risk</strong>. Most SME use cases fall into limited or minimal risk — but the ones touching hiring, credit, or biometrics can be high-risk and carry real obligations.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">3. Confirm your role: provider vs deployer</h2>
            <p>Obligations differ if you are the <em>provider</em> (you put the system on the market) versus a <em>deployer</em> (you use it). Fine-tuning or substantially modifying a model can make you a provider — a detail many teams miss.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">4. Meet transparency duties</h2>
            <p>Users must generally be told when they are interacting with AI, and AI-generated content (including deepfakes) must be labelled. For most SMEs this is the single most common obligation to action.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">5. Ensure human oversight</h2>
            <p>Design a human in the loop for consequential decisions. Document who can review, override, and shut down each system.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">6. Document data &amp; keep records</h2>
            <p>Track training/reference data provenance, known limitations, and testing. Even where full technical documentation is not mandated for your tier, lightweight records make audits and incidents survivable.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">7. Assign ownership and review regularly</h2>
            <p>Name an accountable owner, set a review cadence, and re-run this checklist whenever you add a system or change how one is used. Governance is a habit, not a one-off project.</p>

            <p style="margin-top:24px;"><em>This article is general information, not legal advice. For your specific obligations, combine this with qualified legal counsel.</em></p>`,
    faqs: [
      { q: 'Does the EU AI Act apply to small businesses?', a: 'Yes, it can. Obligations attach to deployers and users of AI systems placed on the EU market, not only to large model providers. Most SMEs fall into limited or minimal risk tiers with lighter transparency-focused duties, but some use cases (hiring, credit scoring, biometrics) are high-risk.' },
      { q: 'When are the EU AI Act deadlines?', a: 'The Act phases in through 2026. Prohibited-practice bans and AI-literacy duties applied first, with core obligations for general-purpose AI and other requirements following through August 2026 and beyond. Check the current phase for your system class.' },
      { q: 'What happens if we fine-tune an open model — are we a provider?', a: 'Potentially yes. Substantially modifying or fine-tuning a model and putting it into service can shift you from deployer to provider, which carries additional obligations. Confirm your role before you ship.' }
    ],
    ctaTitle: 'Need an EU AI Act-ready governance baseline?',
    ctaText: 'I help SMEs build the inventory, risk classification, and oversight the Act expects — without enterprise overhead.',
    ctaHref: '/ai-governance-consulting.html',
    ctaLabel: 'See AI governance consulting'
  }
];

/* Services hub ----------------------------------------------------------- */
function servicesHub() {
  const canonical = `${SITE}/services.html`;
  const cards = services.map((s) => `                <div class="service-card">
                    <h3>${esc(s.h1)}</h3>
                    <p class="description">${esc(s.intro.split('.')[0])}.</p>
                    <a href="/${s.slug}.html" class="cta">Learn more →</a>
                </div>`).join('\n');
  return `${head({
    title: 'AI Consulting Services — Governance, RAG, GraphRAG, Fine-Tuning | Moses Yebei',
    description: 'AI consulting services: AI governance, AI readiness assessment, RAG pipelines, GraphRAG knowledge-graph agents, and LLM fine-tuning — from strategy to shipped systems.',
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
                <p class="bio" style="max-width:680px;">One advisor across the full lifecycle — from AI governance and readiness to shipping RAG, GraphRAG agents, and fine-tuned models in production.</p>
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
    title: 'Blog — AI Governance, RAG & LLM Engineering | Moses Yebei',
    description: 'Practical writing on AI governance, the EU AI Act, RAG, GraphRAG, and LLM fine-tuning for teams shipping real systems.',
    canonical,
    keywords: 'AI governance blog, EU AI Act, RAG, GraphRAG, LLM fine-tuning',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      url: canonical,
      name: 'Moses Yebei — Blog',
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
    title: 'Case Studies — Shipped AI Systems & Outcomes | Moses Yebei',
    description: 'Real AI engagements with quantified outcomes — knowledge-graph agents, e-discovery NLP at 99%, and a fraud model that cut losses 75%.',
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
                <p class="bio" style="max-width:680px;">A few engagements where the numbers did the talking — from knowledge-graph agents in production to fraud losses cut by three quarters.</p>
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
const urls = [
  { loc: `${SITE}/`, pri: '1.0', freq: 'weekly' },
  { loc: `${SITE}/services.html`, pri: '0.9', freq: 'monthly' },
  ...services.map((s) => ({ loc: `${SITE}/${s.slug}.html`, pri: '0.8', freq: 'monthly' })),
  { loc: `${SITE}/case-studies.html`, pri: '0.9', freq: 'monthly' },
  ...caseStudies.map((c) => ({ loc: `${SITE}/case-studies/${c.slug}.html`, pri: '0.8', freq: 'monthly' })),
  { loc: `${SITE}/insights/`, pri: '0.7', freq: 'weekly' },
  ...posts.map((p) => ({ loc: `${SITE}/insights/${p.slug}.html`, pri: '0.7', freq: 'monthly' })),
  { loc: `${SITE}/projects.html`, pri: '0.8', freq: 'daily' },
  { loc: `${SITE}/knowledge-graph.html`, pri: '0.6', freq: 'weekly' }
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`).join('\n')}
</urlset>
`;
write('sitemap.xml', sitemap);

console.log('Generated:\n' + written.map((w) => '  ' + w).join('\n'));
