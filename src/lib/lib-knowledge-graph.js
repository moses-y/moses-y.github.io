/*
 * lib-knowledge-graph.js - the file census, and its prose form for the prompt.
 *
 * Split out of update-forks.js at the 450-line limit. buildKnowledgeGraph walks a
 * flat list of paths and answers what the repository contains - languages, entry
 * points, tests, docs, CI, containers, dependency manifests, sub-projects - and
 * formatKnowledgeGraph renders that for the model. Together they were the single
 * largest block in that file and they depend on nothing else in it.
 */
'use strict';
const { detectSubProjects, isCollection } = require('./lib-subprojects.js');

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
    fileTypes: {}, subProjects: [], isCollection: false
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
    '.md': 'Markdown', '.rst': 'reStructuredText', '.ipynb': 'Jupyter Notebook', '.sql': 'SQL', '.graphql': 'GraphQL', '.proto': 'Protocol Buffers',
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

    // The table above detected only web and infra stacks, so an estate that is 447
    // repos of Python read as though it contained no ML at all. These are path
    // signals only (the tree is all we fetch), so they are indicative, not proof.
    'PyTorch': [() => fileTree.some(f => /(^|\/)torch|\.pt$|\.pth$|\.ckpt$|lightning/i.test(f))],
    'TensorFlow': [() => fileTree.some(f => /tensorflow|keras|\.h5$|saved_model/i.test(f))],
    'OpenCV': [() => fileTree.some(f => /opencv|cv2|haarcascade/i.test(f))],
    'Transformers': [() => fileTree.some(f => /transformers|tokenizer|\.safetensors$|huggingface/i.test(f))],
    'YOLO': [() => fileTree.some(f => /yolo|ultralytics|darknet/i.test(f))],
    'ONNX': [() => fileTree.some(f => /\.onnx$|onnxruntime/i.test(f))],
    'LangChain': [() => fileTree.some(f => /langchain|langgraph|llama_?index/i.test(f))],
    'Vector store': [() => fileTree.some(f => /faiss|chroma|pinecone|qdrant|weaviate|pgvector/i.test(f))],
    'pandas': [() => fileTree.some(f => /(^|\/)(pandas|dataframe)|\.parquet$/i.test(f))],
    'Spark': [() => fileTree.some(f => /pyspark|spark-|\.scala$/i.test(f))],
    'Airflow': [() => fileTree.some(f => /airflow|(^|\/)dags\//i.test(f))],
    'dbt': ['dbt_project.yml'],
    'MLflow': [() => fileTree.some(f => /mlflow|mlruns/i.test(f))],
    'DVC': ['dvc.yaml', '.dvc'],
    'CUDA': [() => fileTree.some(f => /\.cu$|cudnn|nvidia/i.test(f))],
    'Neo4j': [() => fileTree.some(f => /neo4j|cypher|\.cql$/i.test(f))],
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
    issues.push({ severity: 'Medium', kind: 'SDLC', issue: 'No test files detected - untested code paths', where: 'repository-wide' });
  if (hasCodeFiles && !graph.hasCI)
    issues.push({ severity: 'Medium', kind: 'SDLC', issue: 'No CI/CD pipeline detected - no automated build/test gate', where: '.github/ or CI config' });
  if (!hasLicense) issues.push({ severity: 'Medium', kind: 'SDLC', issue: 'No LICENSE file - unclear usage/redistribution rights', where: 'root' });
  if (!hasReadme)
    issues.push({ severity: 'Low', kind: 'SDLC', issue: 'No README - onboarding and intent are undocumented', where: 'root' });
  if (graph.dependencies.length > 0 && !hasLockfile)
    issues.push({ severity: 'Low', kind: 'Risk', issue: 'Dependencies declared without a lockfile - non-reproducible builds', where: graph.dependencies[0] });
  // Measured on 19 real trees this path heuristic fired on 15, and on 9 it had
  // matched source named secrets.go, honeypot bait, or a PNG. build-hygiene.js
  // reads the file instead, so this stays a signal and is no longer a High.
  if (committedSecrets.length > 0) issues.push({ severity: 'Low', kind: 'Security', issue: 'Secret-shaped paths present; the code-health audit confirms or clears them', where: committedSecrets.slice(0, 3).join(', ') });

  graph.issues = issues;
  graph.codeHealth = {
    hasTests: graph.testFiles.length > 0,
    hasCI: graph.hasCI,
    hasLicense,
    hasReadme,
    hasLockfile,
    committedSecrets: committedSecrets.length
  };
  graph.subProjects = detectSubProjects(fileTree); graph.isCollection = isCollection(graph.subProjects, fileTree.length);
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
    sections.push('DETECTED ISSUES (heuristic - verify against the code):\n' +
      graph.issues.map(i => `  [${i.severity}/${i.kind}] ${i.issue} - ${i.where}`).join('\n'));
  } else if (graph.codeHealth) {
    sections.push('CODE HEALTH: no structural red flags detected (tests/CI/license/lockfile present where expected).');
  }

  return sections.join('\n\n');
}

module.exports = { buildKnowledgeGraph, formatKnowledgeGraph };
