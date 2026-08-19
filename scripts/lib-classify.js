/*
 * lib-classify.js - what a repository is, from what its tree contains.
 *
 * Split out of update-forks.js at the 450-line limit. Everything here answers a
 * question about a repo that GitHub does not answer: what language it is really
 * written in, which domain that puts it in, what kind of artifact it is, and what
 * it can do. All of it derived from the file census rather than the API, which is
 * the only reason any of it is populated at all.
 */
'use strict';

const DOC_LANGS = new Set(['Markdown', 'YAML', 'JSON', 'Text', 'CSV', 'XML', 'TOML', 'INI', 'SVG', 'Config']);

const LANG_DOMAIN = {
  Python: 'AI & Data', 'Jupyter Notebook': 'AI & Data', R: 'AI & Data', Julia: 'AI & Data',
  TypeScript: 'Web & Interfaces', TSX: 'Web & Interfaces', JavaScript: 'Web & Interfaces',
  JSX: 'Web & Interfaces', Vue: 'Web & Interfaces', Svelte: 'Web & Interfaces',
  Astro: 'Web & Interfaces', HTML: 'Web & Interfaces', CSS: 'Web & Interfaces',
  Ruby: 'Web & Interfaces', PHP: 'Web & Interfaces',
  Go: 'Systems & Infra', Rust: 'Systems & Infra', C: 'Systems & Infra', 'C++': 'Systems & Infra',
  'C/C++ Header': 'Systems & Infra', Java: 'Systems & Infra', 'C#': 'Systems & Infra',
  Zig: 'Systems & Infra', Lua: 'Systems & Infra', Solidity: 'Systems & Infra', Shell: 'Systems & Infra',
  Swift: 'Mobile', Kotlin: 'Mobile', Dart: 'Mobile', 'Objective-C': 'Mobile'
};

// GitHub leaves `language` null on forks in both the list and the repo detail
// endpoints, which left it null on 1248 of 1275 repos and collapsed every domain
// in the Code Brain to "Other". The file-type census we already build from the
// tree recovers it with no extra API call.
function deriveLanguage(kg) {
  if (!kg || !kg.languages) return null;
  const ranked = Object.entries(kg.languages)
    .filter(([name]) => !DOC_LANGS.has(name))
    .sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : null;
}

function domainOf(language) {
  return (language && LANG_DOMAIN[language]) || 'Other';
}

// What kind of thing is this? Every rule below reads a signal we actually have,
// and the evidence is kept so the site can show why rather than asserting it.
// Ordered most-specific first; the first match wins.
function classifyArtifact(kg, repo) {
  if (!kg) return { kind: 'Unknown', confidence: 0, evidence: [] };

  const langs = kg.languages || {};
  const files = kg.totalFiles || 0;
  const cfg = (kg.configFiles || []).map(f => f.toLowerCase());
  const deps = (kg.dependencies || []).map(f => f.toLowerCase());
  const entry = (kg.entryPoints || []).map(f => f.toLowerCase());
  const fw = (kg.frameworks || []).map(f => f.toLowerCase());
  const all = cfg.concat(deps, entry);
  const has = re => all.some(f => re.test(f));
  const fwHas = re => fw.some(f => re.test(f));
  const codeShare = name => (langs[name] || 0) / Math.max(1, files);

  const rules = [
    ['Notebook / research', () => codeShare('Jupyter Notebook') > 0.15,
      () => `${langs['Jupyter Notebook']} notebooks`],
    ['Browser extension', () => has(/(^|\/)manifest\.json$/) && (has(/content[-_]?script/) || has(/background\./)),
      () => 'extension manifest with background or content script'],
    ['Mobile app', () => has(/(^|\/)(pubspec\.yaml|podfile|build\.gradle(\.kts)?|info\.plist)$/)
      || codeShare('Swift') > 0.2 || codeShare('Dart') > 0.2 || codeShare('Kotlin') > 0.2,
      () => 'mobile toolchain or platform sources dominate'],
    ['Web app', () => fwHas(/react|next|vue|svelte|astro|nuxt|remix|angular/)
      || has(/(^|\/)(vite|next|nuxt|astro|svelte|webpack|angular)\.config\./),
      () => kg.frameworks && kg.frameworks.length ? kg.frameworks.join(', ') : 'front-end build config'],
    ['Service / API', () => (kg.hasDocker && has(/(^|\/)(docker-compose|k8s|helm)/))
      || fwHas(/fastapi|flask|django|express|nest|gin|actix|rails|spring/),
      () => kg.hasDocker ? 'container and orchestration config' : 'server framework detected'],
    ['CLI tool', () => has(/(^|\/)(cli|main|cmd)\.(py|js|ts|go|rs)$/) || has(/(^|\/)cmd\//)
      || has(/(^|\/)bin\//),
      () => 'command entry point'],
    ['Library / SDK', () => (has(/(^|\/)(setup\.py|pyproject\.toml|cargo\.toml|go\.mod|package\.json|gemfile)$/))
      && (kg.testFiles || []).length > 0,
      () => 'package manifest with a test suite and no application entry point'],
    ['Docs / content', () => codeShare('Markdown') > 0.5, () => 'mostly prose'],
    ['Infrastructure', () => has(/\.(tf|tfvars)$/) || has(/(^|\/)(ansible|terraform|helm)/),
      () => 'infrastructure-as-code definitions']
  ];

  for (const [kind, test, why] of rules) {
    let ok = false;
    try { ok = test(); } catch (e) { ok = false; }
    if (ok) {
      const evidence = [];
      try { evidence.push(why()); } catch (e) { /* evidence is optional */ }
      if (kg.packageManager) evidence.push(`${kg.packageManager} project`);
      return { kind, confidence: 0.7, evidence };
    }
  }

  const lang = deriveLanguage(kg);
  return lang
    ? { kind: 'Codebase', confidence: 0.3, evidence: [`${lang} sources, no distinguishing manifest`] }
    : { kind: 'Unknown', confidence: 0, evidence: [] };
}

// Capabilities are the bridge between the corpus and the skills claimed on the
// site: each one is only ever shown with the number of repos that evidence it,
// so the positioning is auditable rather than asserted.
const CAPABILITY_SIGNALS = {
  'Computer Vision': { fw: ['OpenCV', 'YOLO'], lang: [] },
  'Deep Learning': { fw: ['PyTorch', 'TensorFlow', 'ONNX', 'CUDA'], lang: [] },
  'LLM & Agents': { fw: ['Transformers', 'LangChain'], lang: [] },
  'RAG & Vector Search': { fw: ['Vector store'], lang: [] },
  'Knowledge Graphs': { fw: ['Neo4j', 'GraphQL'], lang: [] },
  'Data Engineering': { fw: ['pandas', 'Spark', 'Airflow', 'dbt'], lang: [] },
  'MLOps': { fw: ['MLflow', 'DVC', 'Docker', 'Kubernetes'], lang: [] },
  'Full-Stack Web': { fw: ['React', 'Next.js', 'Vue', 'Svelte', 'Angular', 'Express', 'NestJS', 'Tailwind'], lang: [] },
  'Backend & APIs': { fw: ['FastAPI', 'Flask', 'Django', 'Rails', 'Spring', 'Laravel'], lang: ['Go', 'Rust'] },
  'Cloud & Infra': { fw: ['Terraform', 'Kubernetes'], lang: [] }
};

function deriveCapabilities(kg, language) {
  if (!kg) return [];
  const fw = new Set(kg.frameworks || []);
  const out = [];
  for (const [cap, sig] of Object.entries(CAPABILITY_SIGNALS)) {
    const hits = sig.fw.filter(f => fw.has(f));
    const langHit = sig.lang.includes(language);
    if (hits.length || langHit) out.push({ name: cap, via: hits.length ? hits : [language] });
  }
  return out;
}

// Applied to every repo in the output, including ones carried through without an
// article, so the facets are complete rather than only covering what got written.
function enrichFork(fork) {
  const kg = fork.knowledgeGraph;
  const language = fork.language || deriveLanguage(kg);
  const cls = classifyArtifact(kg, fork);
  return Object.assign(fork, {
    language,
    domain: domainOf(language),
    kind: cls.kind,
    kindEvidence: cls.evidence,
    kindConfidence: cls.confidence,
    capabilities: deriveCapabilities(kg, language)
  });
}

module.exports = { deriveLanguage, domainOf, classifyArtifact, deriveCapabilities,
  enrichFork, DOC_LANGS, LANG_DOMAIN, CAPABILITY_SIGNALS };
