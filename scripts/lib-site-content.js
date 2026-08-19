/*
 * lib-site-content.js - the words on the hand-written pages.
 *
 * The services, case studies and insight posts: 353 lines of content that were
 * sitting in the middle of build-pages.js, which is most of why that file was 834
 * lines. It references nothing and nothing references it except the templates, so
 * separating it means a copy edit no longer means opening a build script, and
 * reading the build script no longer means scrolling through prose.
 */
'use strict';

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
    description: 'AI readiness assessment consultant. I find the data, governance, and infrastructure gaps that quietly kill AI projects - before you spend the budget.',
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
    description: 'RAG pipeline consultant and developer. I design and ship production retrieval-augmented generation - accurate, evaluated, and grounded in your data.',
    intro: 'Demos are easy; production RAG that stays accurate is not. I build retrieval pipelines with real evaluation, grounding, and guardrails - so answers are trustworthy, not just plausible.',
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
      { q: 'Should I use RAG or fine-tuning?', a: 'Usually RAG first: it keeps knowledge fresh, is cheaper to update, and gives you citations. Fine-tuning is for style, format, or narrow tasks where the behavior - not the facts - needs to change. Many production systems combine both.' }
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
    intro: 'Vector RAG retrieves passages; it does not understand how facts connect. I build GraphRAG systems - knowledge graphs feeding LangGraph agents structured, relationship-aware context - for the questions plain retrieval cannot answer.',
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
      '7 specialist agents each served a tailored graph slice - fewer tokens, better output',
      "This site's own code-graph analysis is graph-driven"
    ],
    related: [
      { slug: 'rag-pipeline-consulting', label: 'RAG Pipelines' },
      { slug: 'ai-governance-consulting', label: 'AI Governance' }
    ],
    faqs: [
      { q: 'What is GraphRAG and when is it better than normal RAG?', a: 'GraphRAG retrieves from a knowledge graph instead of (or alongside) a vector store, so the model sees how entities relate - not just isolated text chunks. It shines on multi-hop questions, aggregation across documents, and domains where relationships carry the meaning.' }
    ]
  },
  {
    slug: 'llm-fine-tuning-consulting',
    title: 'LLM Fine-Tuning Consultant (LoRA/QLoRA) | Moses Yebei',
    h1: 'LLM Training & Fine-Tuning',
    serviceType: 'LLM Fine-Tuning',
    badge: 'Custom models',
    keywords: 'LLM fine-tuning consultant, LoRA, QLoRA, fine-tune LLaMA Mistral, custom model training, model distillation',
    description: 'LLM fine-tuning consultant. I fine-tune open models (LoRA/QLoRA) with the data pipelines and evaluation behind them - when a generic API is not enough.',
    intro: 'When prompting and RAG hit their limits, a fine-tuned model can be cheaper, faster, and more on-brand. I handle the data, the training, and the evaluation - end to end.',
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
      { q: 'Is fine-tuning worth it versus just using GPT or Claude?', a: 'Often not at first - prompting plus RAG covers most needs. Fine-tuning pays off when you need consistent style/format, lower per-call cost at scale, on-prem/private deployment, or a narrow task a general model does inconsistently. I will tell you honestly when it is not worth it.' }
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
    summary: 'As founding engineer at Autar.ai, I designed the knowledge-graph backbone for an automated software-analysis platform - turning raw context into structured graph slices that made a fleet of AI agents both cheaper to run and more accurate.',
    metrics: [
      { value: '149', label: 'Entity types modeled' },
      { value: '7', label: 'Specialist agents served' },
      { value: '20+', label: 'Languages analyzed' }
    ],
    challenge: 'The platform had to analyze codebases across 20+ languages and answer deep, cross-file questions. Feeding raw context to LLM agents was expensive and noisy - token budgets ballooned and answers drifted whenever the relevant facts were scattered across files.',
    approach: 'I designed a three-layer knowledge-graph pipeline in FalkorDB (Cypher, 149 entity types) and had each of 7 specialist agents query a tailored graph slice instead of raw context. I built 20+ Temporal workflows and 120+ activities for durable orchestration, with Kafka streaming, ClickHouse analytics, and full observability running on production GKE.',
    outcome: 'Graph-scoped retrieval cut the tokens each agent consumed and measurably lifted output quality - the model saw only the connected facts it needed. The platform runs in production with durable, observable workflows the team can reason about and extend.',
    stack: ['FalkorDB / Cypher', 'LangGraph', 'Temporal', 'Kafka', 'ClickHouse', 'GKE']
  },
  {
    slug: 'salix-ediscovery-nlp',
    sector: 'Legal / e-discovery',
    title: 'Case Study: NLP Over 1M+ Legal Documents at 99% | Moses Yebei',
    h1: 'Reviewing 1M+ litigation documents at 99% accuracy',
    keywords: 'e-discovery NLP case study, document classification, legal AI, NLP pipeline',
    description: 'How an NLP/ML pipeline processed over a million litigation documents at 99% accuracy, cutting retrieval time and lifting process efficiency.',
    summary: 'As technical lead at SALIX Data, I built the NLP/ML pipeline behind high-stakes litigation delivery - turning a manual review bottleneck into an accurate, auditable, automated process.',
    metrics: [
      { value: '1M+', label: 'Documents processed' },
      { value: '99%', label: 'Classification accuracy' },
      { value: '-25%', label: 'Retrieval time' }
    ],
    challenge: 'High-stakes litigation meant millions of documents had to be classified and retrieved accurately and defensibly. Manual review did not scale, and errors carried real legal and financial risk under strict compliance regimes.',
    approach: 'I architected an NLP/ML pipeline spanning Relativity, CloudNine Law, and Microsoft Purview, plus a speech-to-text pipeline for audio evidence. The design prioritized accuracy, auditability, and repeatability - aligning the AI roadmap with client needs alongside the CEO.',
    outcome: 'The pipeline processed 1M+ documents at 99% accuracy and speech-to-text at 99% accuracy, improved process efficiency ~30%, and cut retrieval time ~25% - while staying defensible under compliance review.',
    stack: ['Python / NLP', 'Relativity', 'CloudNine Law', 'MS Purview', 'Speech-to-Text']
  },
  {
    slug: 'fintech-fraud-detection',
    sector: 'Fintech / banking',
    title: 'Case Study: Cutting Bank Fraud 75% with ML | Moses Yebei',
    h1: 'Cutting fraudulent transactions by 75% for a bank',
    keywords: 'fraud detection case study, machine learning fintech, predictive modeling',
    description: 'How a machine-learning fraud-detection model reduced fraudulent transactions by 75% and lifted operational efficiency across client engagements.',
    summary: 'Consulting independently across fintech and banking, I built a fraud-detection model that sharply cut losses - one of a series of predictive systems delivered for measurable business outcomes.',
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
    description: 'A practical 7-step EU AI Act compliance checklist for small and mid-sized businesses - what applies to you, and what to do before the deadlines bite.',
    body: `            <p>The EU AI Act is the world's first comprehensive AI law, and its obligations are rolling in through 2026. The common myth is that it only targets Big Tech. It does not - if you <em>deploy</em> or <em>use</em> AI in the EU market, obligations can attach to you, even when the model was built by someone else. Here is a practical, non-legal checklist to get an SME oriented.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">1. Build an AI system inventory</h2>
            <p>You cannot govern what you have not listed. Catalogue every AI system you build, buy, or embed - including features inside SaaS tools. For each, note purpose, data used, and who is affected.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">2. Classify each system by risk</h2>
            <p>The Act is risk-tiered: <strong>prohibited</strong>, <strong>high-risk</strong>, <strong>limited-risk</strong> (transparency obligations), and <strong>minimal-risk</strong>. Most SME use cases fall into limited or minimal risk - but the ones touching hiring, credit, or biometrics can be high-risk and carry real obligations.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">3. Confirm your role: provider vs deployer</h2>
            <p>Obligations differ if you are the <em>provider</em> (you put the system on the market) versus a <em>deployer</em> (you use it). Fine-tuning or substantially modifying a model can make you a provider - a detail many teams miss.</p>

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
      { q: 'What happens if we fine-tune an open model - are we a provider?', a: 'Potentially yes. Substantially modifying or fine-tuning a model and putting it into service can shift you from deployer to provider, which carries additional obligations. Confirm your role before you ship.' }
    ],
    ctaTitle: 'Need an EU AI Act-ready governance baseline?',
    ctaText: 'I help SMEs build the inventory, risk classification, and oversight the Act expects - without enterprise overhead.',
    ctaHref: '/ai-governance-consulting.html',
    ctaLabel: 'See AI governance consulting'
  },
  {
    slug: 'rag-vs-fine-tuning',
    title: 'RAG vs Fine-Tuning: Which Does Your LLM Actually Need? | Moses Yebei',
    h1: 'RAG vs fine-tuning: which does your LLM actually need?',
    tag: 'LLM Engineering',
    date: '2026-07-28',
    dateHuman: 'July 28, 2026',
    keywords: 'RAG vs fine-tuning, when to fine-tune LLM, retrieval augmented generation, LoRA QLoRA, enterprise LLM',
    description: 'A practical decision guide to RAG vs fine-tuning for enterprise LLMs - what each fixes, what they cost, and why most production systems end up using both.',
    body: `            <p>"Should we fine-tune?" is the question I get most often, and it is usually the wrong first question. RAG and fine-tuning solve different problems. Confusing them burns budget and ships worse systems. Here is the decision framework I actually use.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">They fix different things</h2>
            <p><strong>RAG (retrieval-augmented generation)</strong> changes <em>what the model knows</em> at answer time - it looks up relevant facts and puts them in the prompt. <strong>Fine-tuning</strong> changes <em>how the model behaves</em> - its style, format, and its handling of a narrow task. If your problem is "the model doesn't know our data," that's RAG. If it's "the model knows enough but answers in the wrong shape," that's fine-tuning.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">Start with RAG almost every time</h2>
            <p>RAG keeps knowledge fresh (update the index, not the weights), gives you citations, and is far cheaper to iterate. At AICE Africa I built a FAISS-backed RAG pipeline serving live users precisely because the underlying data - jobs, CVs, requirements - changed constantly. Fine-tuning that knowledge in would have gone stale the same day.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">When fine-tuning earns its keep</h2>
            <p>Reach for fine-tuning (LoRA/QLoRA on an open model) when you need: consistent tone or a strict output format; lower per-call cost at high volume; on-prem or private deployment; or a narrow task a general model does inconsistently even with good prompts. The tell is that you're fighting the same behavior with ever-longer prompts - that's a training problem, not a retrieval one.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">In production, it's usually both</h2>
            <p>The 2026 consensus for serious stacks is a combination: fine-tune for behavior and format, RAG for current facts, and - when questions are multi-hop or relationship-heavy - a knowledge graph feeding retrieval (<a href="/insights/graphrag-and-graph-engineering.html">GraphRAG</a>). Vector DB plus a reranker is the cheapest high-leverage first move; add structure only when the questions demand it.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">The honest cost check</h2>
            <p>Fine-tuning has a long tail: dataset curation, evaluation harnesses, retraining as data drifts, and serving/quantization. If a well-built RAG system already hits your quality bar, fine-tuning is often cost without meaningful gain. I'll tell a client when that's the case rather than sell the more expensive project.</p>`,
    faqs: [
      { q: 'Is RAG or fine-tuning cheaper?', a: 'RAG is usually cheaper to build and maintain because you update an index instead of retraining a model, and you avoid the dataset-curation and evaluation overhead fine-tuning requires. Fine-tuning can lower per-call cost at very high volume, which is where its economics start to win.' },
      { q: 'Can you use RAG and fine-tuning together?', a: 'Yes, and most production systems do. A common pattern is fine-tuning for consistent tone/format and RAG for current, citable facts - plus a knowledge graph (GraphRAG) when questions require multi-hop reasoning.' },
      { q: 'When should I NOT fine-tune?', a: 'When your problem is missing or fast-changing knowledge (use RAG), when prompting plus retrieval already meets your quality bar, or when you lack a clean labeled dataset and an evaluation harness to prove the fine-tune actually helped.' }
    ],
    ctaTitle: 'Not sure whether to retrieve or retrain?',
    ctaText: 'I help teams make the RAG-vs-fine-tune call honestly - and then build whichever one (or both) actually moves the metric.',
    ctaHref: '/llm-fine-tuning-consulting.html',
    ctaLabel: 'See LLM fine-tuning consulting'
  },
  {
    slug: 'graphrag-and-graph-engineering',
    title: 'GraphRAG & Graph Engineering: When Knowledge Graphs Beat Vector RAG | Moses Yebei',
    h1: 'GraphRAG & graph engineering: when knowledge graphs beat vector RAG',
    tag: 'Knowledge Graphs',
    date: '2026-07-28',
    dateHuman: 'July 28, 2026',
    keywords: 'GraphRAG, graph engineering, knowledge graph LLM, multi-hop reasoning, FalkorDB, Neo4j, vector RAG',
    description: 'What graph engineering brings to LLM systems - how GraphRAG uses knowledge graphs for multi-hop reasoning that plain vector RAG cannot do, with real production lessons.',
    body: `            <p>Vector RAG retrieves passages that <em>look</em> similar to your question. It has no idea how those passages relate to each other. For a lot of real questions - "which of our vendors are affected if this supplier fails?", "trace how this function's output reaches the API layer" - the answer lives in the <em>relationships</em>, not any single chunk. That's where graph engineering earns its place.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">What graph engineering actually is</h2>
            <p>Graph engineering is modeling your domain as entities and the relationships between them, then building the pipelines to extract, store, and query that structure reliably. In an LLM context it means entity/relation extraction, a graph store (Neo4j, FalkorDB, NetworkX), and graph-aware retrieval. I keep a running set of experiments on this in my <a href="/blog/graph-engineering.html">graph engineering</a> and <a href="/blog/code-to-knowledge-graph.html">code-to-knowledge-graph</a> work.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">Why GraphRAG wins on multi-hop</h2>
            <p>Plain vector RAG struggles when an answer requires chaining several facts together, because each chunk is retrieved in isolation. GraphRAG traverses explicit edges, so the model sees the connected sub-graph - the entities <em>and</em> how they link. The 2026 consensus is clear: GraphRAG outperforms on multi-hop, relationship-heavy, and thematic questions, while vector search stays faster and cheaper for direct factual lookups.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">A production lesson: feed agents graph slices, not raw context</h2>
            <p>At Autar.ai I designed a three-layer knowledge-graph pipeline in FalkorDB (Cypher, 149 entity types) feeding 7 specialist agents. The key move was giving each agent a <em>tailored graph slice</em> instead of raw context. That cut token usage and lifted output quality at the same time - the model saw only the connected facts it needed, not a haystack. This is graph engineering as a cost lever, not just an accuracy one.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">Don't over-build it</h2>
            <p>Two failure modes to avoid. First: if your queries are mostly single-fact lookups, a knowledge graph adds cost without meaningful accuracy gains - start with a vector DB and a reranker. Second, and more common: treating graph construction as one-and-done. Entity graphs go stale exactly like any index; without a refresh pipeline, retrieval quality quietly degrades. Graph engineering is a living system, not a migration.</p>

            <h2 style="color:var(--text-primary);margin:32px 0 12px;">The pragmatic path</h2>
            <p>Start with vector RAG plus a reranker. Add a knowledge graph / GraphRAG layer when you hit multi-hop questions, entity-disambiguation pain, or compliance requirements that demand traceable reasoning. That progression - the same one I walked from <a href="/insights/rag-vs-fine-tuning.html">FAISS RAG at AICE to graph-backed agents at Autar</a> - gets you value early without over-engineering day one.</p>`,
    faqs: [
      { q: 'What is the difference between GraphRAG and vector RAG?', a: 'Vector RAG retrieves text chunks by semantic similarity and has no model of how they relate. GraphRAG builds an explicit knowledge graph of entities and relationships and retrieves connected sub-graphs, which enables multi-hop reasoning and more faithful answers on relationship-heavy questions.' },
      { q: 'When is a knowledge graph worth the effort?', a: 'When questions require chaining multiple facts (multi-hop), when entity disambiguation is causing errors, or when compliance requires traceable reasoning. For mostly single-fact lookups, a vector database with a reranker is cheaper and sufficient.' },
      { q: 'Which graph databases do you use?', a: 'FalkorDB and Neo4j for property graphs and Cypher queries, and NetworkX for in-memory analysis. The choice depends on scale, query patterns, and whether the graph feeds live agents or offline analysis.' }
    ],
    ctaTitle: 'Have questions vector RAG can\'t answer?',
    ctaText: 'GraphRAG and knowledge-graph agents are my sharpest specialty. If plain retrieval has plateaued, let\'s look at your data as a graph.',
    ctaHref: '/graphrag-knowledge-graph-agents.html',
    ctaLabel: 'See GraphRAG consulting'
  }
];


module.exports = { services, caseStudies, posts };
