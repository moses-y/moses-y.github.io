const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const LLM_API_KEY = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY;
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODELS = (process.env.LLM_MODELS || 'moonshotai/kimi-k2.6,deepseek-ai/deepseek-v4-flash,meta/llama-3.3-70b-instruct').split(',').map(m => m.trim());

// Configuration
const CONFIG = {
  username: process.env.GITHUB_USERNAME || 'moses-y',
  reposToShow: parseInt(process.env.REPOS_LIMIT || '999', 10),
  batchSize: parseInt(process.env.BATCH_SIZE || '10', 10),
  kgBatchSize: parseInt(process.env.KG_BATCH_SIZE || '50', 10),
  apiDelay: parseInt(process.env.API_DELAY || '1000', 10),
  kgApiDelay: 200,
  maxFiles: 200,
  models: {
    endpoint: LLM_ENDPOINT,
    available: LLM_MODELS,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7')
  }
};

// Track rate limits per model
const modelRateLimits = {};
let currentModelIndex = 0;

function getNextModel() {
  // Try to find a model that hasn't hit rate limit
  for (let i = 0; i < CONFIG.models.available.length; i++) {
    const model = CONFIG.models.available[(currentModelIndex + i) % CONFIG.models.available.length];
    if (!modelRateLimits[model]) {
      currentModelIndex = (currentModelIndex + i + 1) % CONFIG.models.available.length;
      return model;
    }
  }
  return null; // All models rate limited
}

// Curated Unsplash photo IDs for tech/coding themes
const unsplashPhotos = [
  '1461749280684-dccba630e2f6', '1555066931-4365d14bab8c', '1504639725590-34d0984388bd',
  '1526374965328-7f61d4dc18c5', '1518770660439-4636190af475', '1451187580459-43490279c0fa',
  '1550751827-4bd374c3f58b', '1558494949-ef010cbdcc31', '1485827404703-89b55fcc595e',
  '1531482615713-2afd69097998', '1542831371-29b0f74f9713', '1607799279861-4dd421887fb3',
];

function getRandomUnsplashUrl(index) {
  const photoId = unsplashPhotos[index % unsplashPhotos.length];
  return `https://images.unsplash.com/photo-${photoId}?w=800&h=400&fit=crop&q=80`;
}

// Load existing forks.json to check for existing articles
function loadExistingArticles() {
  try {
    if (fs.existsSync('forks.json')) {
      const data = JSON.parse(fs.readFileSync('forks.json', 'utf8'));
      const existing = new Map();
      for (const fork of (data.forks || [])) {
        existing.set(fork.id, fork);
      }
      console.log(`Loaded ${existing.size} existing articles from forks.json`);
      return existing;
    }
  } catch (e) {
    console.log('No existing forks.json found, starting fresh');
  }
  return new Map();
}

// Check if article needs regeneration (fallback or AI-sounding)
function isFallbackArticle(article) {
  if (!article || article.length < 400) return true;

  const badPhrases = [
    // Fallback phrases
    'demonstrates thoughtful software design',
    'caught my attention for its practical approach',
    'Worth investigating if you\'re working with',
    'patterns and implementations that could accelerate',
    // AI-sounding phrases to regenerate
    'In the rapidly evolving',
    'In the world of',
    'In today\'s landscape',
    'is paramount',
    'aims to streamline',
    'comprehensive solution',
    'It\'s worth noting',
    'leveraging the power',
    'game-changer',
    'cutting-edge'
  ];

  return badPhrases.some(phrase => article.toLowerCase().includes(phrase.toLowerCase()));
}

// Strip markdown formatting from text for clean display
function stripMarkdown(text) {
  if (!text) return '';
  return text
    // Remove code blocks (triple backticks with optional language)
    .replace(/```[\w]*\n[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    // Remove malformed code blocks (double/single backticks at line start)
    .replace(/^`{1,3}\w*\s*$/gm, '')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove inline code (but keep the text inside)
    .replace(/`([^`]+)`/g, '$1')
    // Remove any remaining backticks
    .replace(/`/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Fetch README content from repo
async function fetchReadme(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.username}/${repo.name}/readme`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );
    if (response.ok) {
      const readme = await response.text();
      return readme.slice(0, 4000);
    }
  } catch (e) {
    console.log(`  Failed to fetch README for ${repo.name}: ${e.message}`);
  }
  return null;
}

// Fetch repo file structure
async function fetchRepoTree(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.username}/${repo.name}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );
    if (response.ok) {
      const data = await response.json();
      return (data.tree || []).filter(f => f.type === 'blob').map(f => f.path).slice(0, CONFIG.maxFiles);
    }
  } catch (e) {
    console.log(`  Failed to fetch tree for ${repo.name}: ${e.message}`);
  }
  return [];
}

// Build knowledge graph from file tree to extract structured relationships
function buildKnowledgeGraph(fileTree) {
  const graph = {
    totalFiles: fileTree.length,
    directories: {},
    languages: {},
    frameworks: [],
    packageManager: null,
    hasDocker: false,
    hasCI: false,
    ciPlatform: null,
    entryPoints: [],
    configFiles: [],
    dependencies: [],
    testFiles: [],
    docs: [],
    fileTypes: {}
  };

  const extToLang = {
    '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python', '.rb': 'Ruby',
    '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
    '.cs': 'C#', '.cpp': 'C++', '.c': 'C', '.h': 'C/C++ Header',
    '.swift': 'Swift', '.php': 'PHP', '.r': 'R', '.scala': 'Scala',
    '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
    '.vue': 'Vue', '.svelte': 'Svelte', '.jsx': 'JSX', '.tsx': 'TSX',
    '.yml': 'YAML', '.yaml': 'YAML', '.json': 'JSON', '.toml': 'TOML',
    '.md': 'Markdown', '.rst': 'reStructuredText',
    '.sql': 'SQL', '.graphql': 'GraphQL', '.proto': 'Protocol Buffers',
    '.tf': 'Terraform', '.hcl': 'HCL',
    '.dockerfile': 'Docker', '.ex': 'Elixir', '.exs': 'Elixir',
    '.lua': 'Lua', '.dart': 'Dart', '.zig': 'Zig'
  };

  const entryFileNames = [
    'main.js', 'main.ts', 'main.py', 'main.go', 'main.rs', 'main.c', 'main.cpp', 'main.java', 'main.kt', 'main.dart',
    'index.js', 'index.ts', 'index.jsx', 'index.tsx', 'index.html',
    'app.js', 'app.ts', 'app.py', 'app.jsx', 'app.tsx',
    'server.js', 'server.ts', 'server.py', 'server.go',
    'cli.js', 'cli.ts', 'cli.py',
    '__main__.py', 'manage.py', 'setup.py', 'lib.rs'
  ];
  const entryDirPatterns = ['cmd/'];

  const configPatterns = [
    'package.json', 'tsconfig.json', 'webpack.config', 'vite.config',
    'docker-compose', 'dockerfile', '.env.example', 'makefile',
    'cargo.toml', 'go.mod', 'pyproject.toml', 'setup.cfg', 'setup.py',
    'requirements.txt', 'gemfile', 'build.gradle', 'pom.xml',
    'cmakelists.txt', '.eslintrc', '.prettierrc', 'jest.config',
    'tailwind.config', 'next.config', 'nuxt.config'
  ];

  const depFiles = [
    'package.json', 'requirements.txt', 'go.mod', 'cargo.toml',
    'gemfile', 'build.gradle', 'pom.xml', 'pyproject.toml',
    'pipfile', 'poetry.lock', 'yarn.lock', 'package-lock.json',
    'composer.json', 'pubspec.yaml'
  ];

  const testPatterns = ['test', 'spec', '__test__', '__tests__', '_test.'];
  const docPatterns = ['doc/', 'docs/', 'readme', 'changelog', 'contributing', 'license', 'guide'];

  // Framework detection patterns
  const frameworkIndicators = {
    'React': ['package.json', () => fileTree.some(f => f.includes('react') || f.endsWith('.jsx') || f.endsWith('.tsx'))],
    'Next.js': ['next.config.js', 'next.config.ts', 'next.config.mjs'],
    'Vue': ['.vue', 'vue.config.js', 'nuxt.config.js', 'nuxt.config.ts'],
    'Svelte': ['.svelte', 'svelte.config.js'],
    'Angular': ['angular.json', '.angular'],
    'Django': ['manage.py', 'settings.py', 'wsgi.py'],
    'Flask': ['app.py', () => fileTree.some(f => f.includes('flask'))],
    'FastAPI': [() => fileTree.some(f => f.includes('fastapi'))],
    'Express': ['app.js', 'server.js', () => fileTree.some(f => f.includes('express'))],
    'NestJS': ['nest-cli.json'],
    'Rails': ['Gemfile', 'config/routes.rb'],
    'Spring': ['pom.xml', () => fileTree.some(f => f.includes('spring'))],
    'Laravel': ['artisan', 'composer.json'],
    'Tailwind': ['tailwind.config.js', 'tailwind.config.ts'],
    'Docker': ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'],
    'Kubernetes': [() => fileTree.some(f => f.endsWith('.yaml') && (f.includes('deployment') || f.includes('service') || f.includes('k8s')))],
    'Terraform': ['.tf'],
    'GraphQL': ['.graphql', 'schema.graphql'],
  };

  // CI/CD detection
  const ciIndicators = {
    'GitHub Actions': ['.github/workflows'],
    'GitLab CI': ['.gitlab-ci.yml'],
    'CircleCI': ['.circleci/config.yml'],
    'Travis CI': ['.travis.yml'],
    'Jenkins': ['Jenkinsfile'],
    'Azure Pipelines': ['azure-pipelines.yml'],
  };

  // Package manager detection
  const pmIndicators = {
    'npm': ['package-lock.json'],
    'yarn': ['yarn.lock'],
    'pnpm': ['pnpm-lock.yaml'],
    'pip': ['requirements.txt'],
    'poetry': ['poetry.lock'],
    'cargo': ['Cargo.lock'],
    'go modules': ['go.sum'],
    'composer': ['composer.lock'],
    'bundler': ['Gemfile.lock'],
    'maven': ['pom.xml'],
    'gradle': ['build.gradle', 'build.gradle.kts'],
  };

  for (const filePath of fileTree) {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1].toLowerCase();
    const originalFileName = parts[parts.length - 1];
    const dotIndex = fileName.lastIndexOf('.');
    const ext = dotIndex > 0 ? fileName.substring(dotIndex) : '';
    const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';

    // Count directory distribution (all levels)
    const topDir = parts.length > 1 ? parts[0] : '(root)';
    graph.directories[topDir] = (graph.directories[topDir] || 0) + 1;

    // Language distribution
    if (ext && extToLang[ext]) {
      graph.languages[extToLang[ext]] = (graph.languages[extToLang[ext]] || 0) + 1;
    }

    // File type distribution
    if (ext) {
      graph.fileTypes[ext] = (graph.fileTypes[ext] || 0) + 1;
    }

    // Entry points
    if (entryFileNames.some(p => fileName === p) || entryDirPatterns.some(p => filePath.toLowerCase().startsWith(p) || filePath.toLowerCase().includes('/' + p))) {
      graph.entryPoints.push(filePath);
    }

    // Config files
    if (configPatterns.some(p => fileName === p || fileName.startsWith(p))) {
      graph.configFiles.push(filePath);
    }

    // Dependency files
    if (depFiles.some(p => fileName === p)) {
      graph.dependencies.push(filePath);
    }

    // Test files
    if (testPatterns.some(p => filePath.toLowerCase().includes(p))) {
      graph.testFiles.push(filePath);
    }

    // Documentation
    if (docPatterns.some(p => filePath.toLowerCase().includes(p))) {
      graph.docs.push(filePath);
    }

    // Docker detection
    if (fileName === 'dockerfile' || fileName.startsWith('docker-compose')) {
      graph.hasDocker = true;
    }

    // CI detection
    for (const [ci, patterns] of Object.entries(ciIndicators)) {
      if (patterns.some(p => filePath.toLowerCase().includes(p.toLowerCase()))) {
        graph.hasCI = true;
        graph.ciPlatform = ci;
      }
    }

    // Package manager detection
    for (const [pm, patterns] of Object.entries(pmIndicators)) {
      if (patterns.some(p => fileName === p.toLowerCase())) {
        graph.packageManager = pm;
      }
    }
  }

  // Framework detection (run after file loop for function-based checks)
  for (const [framework, indicators] of Object.entries(frameworkIndicators)) {
    const detected = indicators.some(indicator => {
      if (typeof indicator === 'function') {
        return indicator();
      }
      return fileTree.some(f => f.toLowerCase().includes(indicator.toLowerCase()));
    });
    if (detected) {
      graph.frameworks.push(framework);
    }
  }

  // Dedupe frameworks
  graph.frameworks = [...new Set(graph.frameworks)];

  // --- Lightweight SDLC / code-health signals (heuristic, structure-based) ---
  // Concrete evidence the analysis prompt can cite. Not a substitute for a full
  // AST/tree-sitter pass, but a cheap first line of "issues before the graph".
  const lower = fileTree.map(f => f.toLowerCase());
  const hasCodeFiles = Object.keys(graph.languages).length > 0;
  const hasLicense = lower.some(f => f.includes('license') || f.includes('licence') || f.includes('copying'));
  const hasReadme = lower.some(f => f.split('/').pop().startsWith('readme'));
  const hasLockfile = lower.some(f => /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|cargo\.lock|go\.sum|gemfile\.lock|composer\.lock)$/.test(f));
  // Committed secrets: a real .env (not an example/sample) or key/credential material
  const committedSecrets = fileTree.filter(f => {
    const n = f.toLowerCase().split('/').pop();
    if (n === '.env' || /^\.env\.(local|prod|production|dev|development)$/.test(n)) return true;
    if (/\.(pem|pfx|p12)$/.test(n) || n === 'id_rsa' || n.includes('credentials.json') || n.includes('secrets.')) return true;
    return false;
  });

  const issues = [];
  if (hasCodeFiles && graph.testFiles.length === 0)
    issues.push({ severity: 'Medium', kind: 'SDLC', issue: 'No test files detected — untested code paths', where: 'repository-wide' });
  if (hasCodeFiles && !graph.hasCI)
    issues.push({ severity: 'Medium', kind: 'SDLC', issue: 'No CI/CD pipeline detected — no automated build/test gate', where: '.github/ or CI config' });
  if (!hasLicense)
    issues.push({ severity: 'Medium', kind: 'SDLC', issue: 'No LICENSE file — unclear usage/redistribution rights', where: 'root' });
  if (!hasReadme)
    issues.push({ severity: 'Low', kind: 'SDLC', issue: 'No README — onboarding and intent are undocumented', where: 'root' });
  if (graph.dependencies.length > 0 && !hasLockfile)
    issues.push({ severity: 'Low', kind: 'Risk', issue: 'Dependencies declared without a lockfile — non-reproducible builds', where: graph.dependencies[0] });
  if (committedSecrets.length > 0)
    issues.push({ severity: 'High', kind: 'Security', issue: 'Possible secrets/credentials committed to the repo', where: committedSecrets.slice(0, 3).join(', ') });

  graph.issues = issues;
  graph.codeHealth = {
    hasTests: graph.testFiles.length > 0,
    hasCI: graph.hasCI,
    hasLicense,
    hasReadme,
    hasLockfile,
    committedSecrets: committedSecrets.length
  };

  return graph;
}

// Format knowledge graph as structured context for AI prompt
function formatKnowledgeGraph(graph) {
  const sections = [];

  // Overview
  sections.push(`OVERVIEW: ${graph.totalFiles} files total`);

  // Frameworks detected
  if (graph.frameworks.length > 0) {
    sections.push('FRAMEWORKS/TOOLS DETECTED:\n  ' + graph.frameworks.join(', '));
  }

  // Tech stack info
  const stackInfo = [];
  if (graph.packageManager) stackInfo.push(`Package Manager: ${graph.packageManager}`);
  if (graph.hasDocker) stackInfo.push('Docker: Yes');
  if (graph.hasCI) stackInfo.push(`CI/CD: ${graph.ciPlatform}`);
  if (stackInfo.length > 0) {
    sections.push('TECH STACK:\n  ' + stackInfo.join('\n  '));
  }

  // Top directories by file count
  const sortedDirs = Object.entries(graph.directories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (sortedDirs.length > 0) {
    sections.push('DIRECTORY STRUCTURE:\n' + sortedDirs.map(([d, c]) => `  ${d}/ (${c} files)`).join('\n'));
  }

  // Language breakdown
  const sortedLangs = Object.entries(graph.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (sortedLangs.length > 0) {
    sections.push('LANGUAGE BREAKDOWN:\n' + sortedLangs.map(([l, c]) => `  ${l}: ${c} files`).join('\n'));
  }

  // Entry points
  if (graph.entryPoints.length > 0) {
    sections.push('ENTRY POINTS:\n' + graph.entryPoints.slice(0, 5).map(f => `  ${f}`).join('\n'));
  }

  // Config/build
  if (graph.configFiles.length > 0) {
    sections.push('CONFIG & BUILD:\n' + graph.configFiles.slice(0, 8).map(f => `  ${f}`).join('\n'));
  }

  // Dependencies
  if (graph.dependencies.length > 0) {
    sections.push('DEPENDENCY FILES:\n' + graph.dependencies.slice(0, 5).map(f => `  ${f}`).join('\n'));
  }

  // Tests
  if (graph.testFiles.length > 0) {
    sections.push(`TESTS: ${graph.testFiles.length} test files found`);
  }

  // Docs
  if (graph.docs.length > 0) {
    sections.push(`DOCUMENTATION: ${graph.docs.length} doc files found`);
  }

  // Detected code-health / SDLC issues (heuristic signals for the reviewer)
  if (graph.issues && graph.issues.length > 0) {
    sections.push('DETECTED ISSUES (heuristic — verify against the code):\n' +
      graph.issues.map(i => `  [${i.severity}/${i.kind}] ${i.issue} — ${i.where}`).join('\n'));
  } else if (graph.codeHealth) {
    sections.push('CODE HEALTH: no structural red flags detected (tests/CI/license/lockfile present where expected).');
  }

  return sections.join('\n\n');
}

async function generateBlogArticle(repo, readme, fileTree, knowledgeGraph) {
  if (!LLM_API_KEY) {
    return generateFallbackSummary(repo);
  }

  const model = getNextModel();
  if (!model) {
    console.log(`  All models rate limited`);
    return null;
  }

  try {
    const graphContext = knowledgeGraph ? formatKnowledgeGraph(knowledgeGraph) : '';
    const context = `
REPOSITORY: ${repo.name}
DESCRIPTION: ${repo.description || 'No description'}
PRIMARY LANGUAGE: ${repo.language || 'Not specified'}
TOPICS/TAGS: ${(repo.topics || []).join(', ') || 'None'}
STARS: ${repo.stargazers_count || 0}
${repo.parent ? `FORKED FROM: ${repo.parent.name} (${repo.parent.stars} stars)` : 'ORIGINAL PROJECT'}

${graphContext ? `PROJECT ANALYSIS:\n${graphContext}\n` : ''}
FILE STRUCTURE:
${fileTree.length > 0 ? fileTree.join('\n') : 'Not available'}

README EXCERPT:
${readme || 'No README available'}
`.trim();

    const prompt = `You're a senior AI engineer writing a concise, professional technical briefing about this repo — the kind a consultant would share with a technical client.

${context}

FORMAT (use markdown):
## The Problem
One paragraph about the specific pain point this solves. Be concrete.

## What This Does
2-3 short paragraphs. Reference actual files/folders from the structure. Use \`inline code\` for file names and functions.

## Real-World Use
A practical scenario. Maybe a code snippet or example workflow.

## Code Health & Issues
Before the verdict, assess the codebase like a reviewer. Call out concrete, likely issues you can infer from the structure, README, and analysis — be specific and reference files. Cover:
- **Bugs / risks**: probable defects, unsafe patterns, missing error handling, race conditions, untested paths.
- **SDLC & code violations**: missing tests/CI, no license, secrets or config in the repo, no input validation, weak separation of concerns, missing docs, dependency/security hygiene.
Format each as a short bullet: \`Severity (High/Med/Low) — the issue — where\`. If the repo looks genuinely clean, say so briefly and note what evidence supports that (tests present, CI configured, etc.). Do not invent issues.

## The Bottom Line
Your honest take in 2-3 sentences. What's good, what's not, who should use it.

---

STYLE RULES:
- Short paragraphs (2-4 sentences max)
- Use \`code formatting\` for technical terms
- Be specific and evidence-based: "the config.yaml handles..." not "it provides configuration..."
- Professional and clear — write for a technical decision-maker, not a casual reader
- Give a measured, honest assessment. A clear trade-off ("better suited to large teams than solo projects") is welcome; sarcasm and snark are not.

NEVER USE:
- Buzzword filler: "rapidly evolving", "paramount", "leverage", "streamline", "robust"
- Empty openers: "In the realm of...", "It's worth noting...", "This project aims to..."
- Hype: "comprehensive", "cutting-edge", "game-changer", "seamlessly", "foster"
- Jokes, snark, or a sarcastic tone — keep it credible and consultant-grade
- Starting multiple sentences with "This" or "The"

Keep it under 400 words. Precision over volume.`;

    console.log(`  Using model: ${model}`);
    const response = await fetch(CONFIG.models.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a senior AI engineer writing professional, credible technical briefings. You are direct and practical, cite specific code and files, and give measured, honest assessments. You avoid corporate jargon, AI-sounding fluff, hype, and sarcasm.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: CONFIG.models.maxTokens,
        temperature: CONFIG.models.temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  ${model} returned ${response.status}: ${errorText.slice(0, 80)}`);

      // Mark model as rate limited if 429
      if (response.status === 429) {
        modelRateLimits[model] = true;
        console.log(`  Model ${model} rate limited, trying next...`);
        // Retry with next model
        return generateBlogArticle(repo, readme, fileTree, knowledgeGraph);
      }
      return null;
    }

    const data = await response.json();
    const article = data.choices?.[0]?.message?.content?.trim();

    if (article && article.length > 400) {
      return article;
    }
    return null;
  } catch (error) {
    console.log(`AI generation failed for ${repo.name}:`, error.message);
    return null;
  }
}

function generateFallbackSummary(repo) {
  const desc = repo.description || '';
  const lang = repo.language || 'various technologies';
  const name = repo.name.replace(/-/g, ' ').replace(/_/g, ' ');

  if (desc.length > 100) {
    return `${desc}\n\nThis ${lang} project caught my attention for its practical approach to solving real developer problems. The codebase offers patterns worth studying for anyone working in this space.`;
  }

  return `${name} is a ${lang} project that demonstrates thoughtful software design. While exploring the codebase, I found patterns and implementations that could accelerate similar projects. Worth investigating if you're working with ${lang} or interested in clean, maintainable code architecture.`;
}

async function fetchRepos() {
  let allRepos = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/users/${CONFIG.username}/repos?sort=updated&per_page=100&page=${page}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

    const repos = await response.json();
    if (repos.length === 0) break;

    allRepos = allRepos.concat(repos);
    console.log(`Fetched page ${page}: ${repos.length} repos (total: ${allRepos.length})`);

    if (repos.length < 100) break;
    page++;
  }

  allRepos.forEach(r => { r._type = r.fork ? 'fork' : 'original'; });

  return allRepos
    .filter(r => !r.name.includes('.github.io') && !r.archived)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function fetchRepoDetails(repo) {
  try {
    const response = await fetch(repo.url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Pages-Blog-Generator',
        ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        ...repo,
        topics: data.topics || [],
        parent: data.parent ? {
          name: data.parent.full_name,
          url: data.parent.html_url,
          stars: data.parent.stargazers_count
        } : null
      };
    }
  } catch (e) {
    console.log(`  Failed to fetch details for ${repo.name}: ${e.message}`);
  }
  return repo;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function estimateReadTime(content) {
  const words = (content || '').split(/\s+/).length;
  return Math.max(2, Math.ceil(words / 200));
}

async function main() {
  console.log('=== Incremental Blog Generator ===\n');

  // Load existing articles
  const existingArticles = loadExistingArticles();

  console.log('Fetching repositories...');
  const repos = await fetchRepos();
  const forkCount = repos.filter(r => r._type === 'fork').length;
  const ownedCount = repos.filter(r => r._type === 'original').length;
  console.log(`Found ${repos.length} repos (${forkCount} forks, ${ownedCount} original)\n`);

  const recentRepos = repos.slice(0, CONFIG.reposToShow);

  // Separate repos into: needs generation vs already has article
  const needsGeneration = [];
  const hasArticle = [];

  for (const repo of recentRepos) {
    const existing = existingArticles.get(repo.id);
    if (existing && !isFallbackArticle(existing.summary)) {
      hasArticle.push({ repo, existing });
    } else {
      needsGeneration.push(repo);
    }
  }

  console.log(`Articles status:`);
  console.log(`  - Already have good articles: ${hasArticle.length}`);
  console.log(`  - Need AI generation: ${needsGeneration.length}`);

  // Batch processing: only process up to batchSize per run
  const batchToProcess = needsGeneration.slice(0, CONFIG.batchSize);
  const remaining = needsGeneration.length - batchToProcess.length;

  if (batchToProcess.length < needsGeneration.length) {
    console.log(`  - This batch: ${batchToProcess.length} (${remaining} remaining for next run)`);
  }
  console.log('');

  const forks = [];
  let aiCallCount = 0;

  // First, add repos that already have good articles
  // Also generate knowledgeGraph if missing (in batches)
  const needsKnowledgeGraph = hasArticle.filter(({ existing }) => !existing.knowledgeGraph);
  console.log(`Repos with articles but missing knowledgeGraph: ${needsKnowledgeGraph.length}`);

  let kgGeneratedCount = 0;
  const kgBatchLimit = CONFIG.kgBatchSize;

  for (let i = 0; i < hasArticle.length; i++) {
    const { repo, existing } = hasArticle[i];
    const detailed = await fetchRepoDetails(repo);

    let knowledgeGraph = existing.knowledgeGraph;

    // Generate knowledgeGraph if missing (respect batch limit)
    if (!knowledgeGraph && kgGeneratedCount < kgBatchLimit) {
      const fileTree = await fetchRepoTree(repo);
      if (fileTree.length > 0) {
        knowledgeGraph = buildKnowledgeGraph(fileTree);
        kgGeneratedCount++;
        console.log(`  [${kgGeneratedCount}/${kgBatchLimit}] Generated knowledgeGraph for ${repo.name}: ${fileTree.length} files`);
        // Small delay to avoid rate limiting
        if (kgGeneratedCount < kgBatchLimit) {
          await new Promise(r => setTimeout(r, CONFIG.kgApiDelay));
        }
      }
    }

    // Strip markdown from summary if needed
    const cleanSummary = stripMarkdown(existing.summary);

    forks.push({
      ...existing,
      // Update metadata but keep the article
      summary: cleanSummary,
      description: repo.description || existing.description,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      topics: detailed.topics || existing.topics || [],
      parent: detailed.parent || existing.parent,
      type: repo._type,
      updatedAt: formatDate(repo.updated_at),
      knowledgeGraph: knowledgeGraph || null,
    });
  }

  const remainingKg = needsKnowledgeGraph.length - kgGeneratedCount;
  console.log(`Generated ${kgGeneratedCount} knowledgeGraphs this run`);
  if (remainingKg > 0) {
    console.log(`Remaining repos needing knowledgeGraph: ${remainingKg}`);
  }
  console.log(`Preserved ${hasArticle.length} existing articles\n`);

  // Generate articles only for repos in this batch
  if (batchToProcess.length > 0) {
    console.log(`Generating articles for ${batchToProcess.length} repos (batch ${Math.ceil((hasArticle.length + batchToProcess.length) / CONFIG.batchSize)} of ${Math.ceil(recentRepos.length / CONFIG.batchSize)})...\n`);

    let consecutiveRateLimits = 0;
    let aiSuccessCount = 0;
    let rateLimitHit = false;

    for (let i = 0; i < batchToProcess.length; i++) {
      const repo = batchToProcess[i];
      console.log(`Processing ${i + 1}/${batchToProcess.length}: ${repo.name}`);

      const [detailed, readme, fileTree] = await Promise.all([
        fetchRepoDetails(repo),
        fetchReadme(repo),
        fetchRepoTree(repo)
      ]);

      console.log(`  - README: ${readme ? `${readme.length} chars` : 'not found'}`);
      console.log(`  - Files: ${fileTree.length} discovered`);

      // Build knowledge graph from file tree
      const knowledgeGraph = buildKnowledgeGraph(fileTree);
      const langCount = Object.keys(knowledgeGraph.languages).length;
      const dirCount = Object.keys(knowledgeGraph.directories).length;
      console.log(`  - Knowledge graph: ${dirCount} dirs, ${langCount} languages, ${knowledgeGraph.entryPoints.length} entry points`);

      // Try to generate AI article (skip if rate limited)
      let article = null;
      if (!rateLimitHit) {
        article = await generateBlogArticle(detailed, readme, fileTree, knowledgeGraph);
        aiCallCount++;

        if (article) {
          consecutiveRateLimits = 0;
          aiSuccessCount++;
        } else {
          consecutiveRateLimits++;
          // Stop trying AI after 3 consecutive failures (likely rate limited)
          if (consecutiveRateLimits >= 3) {
            console.log(`\n⚠️  Rate limit detected. Skipping AI for remaining ${batchToProcess.length - i - 1} repos in batch.`);
            console.log(`   Successfully generated ${aiSuccessCount} AI articles before limit.\n`);
            rateLimitHit = true;
          }
        }
      }

      // Prefer: AI article > existing article > fallback
      const existing = existingArticles.get(repo.id);
      const rawArticle = article || (existing && existing.summary) || generateFallbackSummary(repo);
      const finalArticle = stripMarkdown(rawArticle);
      const source = article ? 'AI generated' : (existing && existing.summary) ? 'preserved' : 'fallback';
      console.log(`  - Article: ${finalArticle.length} chars (${source})`);

      forks.push({
        id: repo.id,
        name: repo.name,
        displayName: repo.name.replace(/-/g, ' ').replace(/_/g, ' '),
        description: repo.description || 'No description available',
        summary: finalArticle,
        url: repo.html_url,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        topics: detailed.topics || [],
        parent: detailed.parent || null,
        type: repo._type || 'fork',
        image: (existing && existing.image) || getRandomUnsplashUrl(i),
        forkedAt: formatDate(repo.created_at),
        updatedAt: formatDate(repo.updated_at),
        readTime: estimateReadTime(finalArticle),
        knowledgeGraph: knowledgeGraph
      });

      // Rate limiting delay (only between AI calls, skip if rate limited)
      if (!rateLimitHit && i < batchToProcess.length - 1) {
        await new Promise(r => setTimeout(r, CONFIG.apiDelay));
      }
    }

    console.log(`\nBatch summary: ${aiSuccessCount} AI generated, ${batchToProcess.length - aiSuccessCount} fallback`);
  }

  // Sort by updated date
  forks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // Count how many have AI articles vs fallback
  const aiArticleCount = forks.filter(f => !isFallbackArticle(f.summary)).length;
  const fallbackCount = forks.length - aiArticleCount;
  const pendingCount = needsGeneration.length - batchToProcess.length;

  const output = {
    lastUpdated: new Date().toISOString(),
    generatedWith: `NVIDIA API (${CONFIG.models.available.join(', ')})`,
    totalRepos: forks.length,
    progress: {
      aiGenerated: aiArticleCount,
      fallback: fallbackCount,
      pending: pendingCount,
      complete: pendingCount === 0
    },
    forks
  };

  fs.writeFileSync('forks.json', JSON.stringify(output, null, 2));
  console.log(`\n=== Complete ===`);
  console.log(`Total repos: ${forks.length}`);
  console.log(`AI articles: ${aiArticleCount}`);
  console.log(`Fallback articles: ${fallbackCount}`);
  console.log(`Pending (next run): ${pendingCount}`);
  if (pendingCount > 0) {
    console.log(`\n→ Run workflow again to process next batch of ${Math.min(CONFIG.batchSize, pendingCount)} repos`);
  } else {
    console.log(`\n✓ All repos have been processed!`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
