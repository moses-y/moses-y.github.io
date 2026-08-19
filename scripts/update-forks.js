const fs = require('fs');
const crypto = require('crypto');

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
const { looksLikeReasoning } = require('./lib-quality.js'), { factsFor } = require('./lib-facts.js'), { detectSubProjects, isCollection } = require('./lib-subprojects.js'), { ARTICLE_VERSION, articleIsCurrent, versionReport } = require('./lib-article-version.js');
// Extracted at the 450-line limit. This file was 1,466 lines and had become the
// one every change was squeezed into: three edits this week were paid for by
// folding unrelated logging together, which is a bad reason to change code.
const { CONFIG, LLM_API_KEY } = require('./lib-config.js');
const { stripMarkdown } = require('./lib-text.js');
const { fetchReadme, fetchRepoTree, fetchRepos, fetchRepoDetails,
  generateFallbackSummary } = require('./lib-github.js');
const { generateBlogArticle } = require('./lib-article.js');
const { deriveLanguage, domainOf, classifyArtifact, deriveCapabilities, enrichFork } = require('./lib-classify.js');
const { buildKnowledgeGraph, formatKnowledgeGraph } = require('./lib-knowledge-graph.js');
const { buildEmbeddingText, loadEmbeddingsCache, saveEmbeddingsCache, generateEmbeddings,
  cosineSimilarity, computeUmapAndKnn } = require('./lib-embeddings.js');

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

  const recentRepos = CONFIG.reposToShow > 0 ? repos.slice(0, CONFIG.reposToShow) : repos;
  if (recentRepos.length < repos.length) {
    console.log(`REPOS_LIMIT=${CONFIG.reposToShow} is dropping ${repos.length - recentRepos.length} repos from this run.`);
  }

  // Separate repos into: needs generation vs already has article
  const needsGeneration = [];
  const hasArticle = [];

  for (const repo of recentRepos) {
    const existing = existingArticles.get(repo.id);
    // A stored scratchpad is not a good article, and neither is one written by
    // an older prompt than the one running now.
    if (existing && articleIsCurrent(existing) && !isFallbackArticle(existing.summary) && !looksLikeReasoning(existing.summary)) {
      hasArticle.push({ repo, existing });
    } else {
      needsGeneration.push(repo);
    }
  }

  console.log(`Articles status:\n  - Already have good articles: ${hasArticle.length}\n  - Need AI generation: ${needsGeneration.length}\n${versionReport(existingArticles)}`);

  // Batch processing: only process up to batchSize per run.
  const wasAttempted = (repo) => {
    const e = existingArticles.get(repo.id);
    return Boolean(e && e.summary);
  };

  const fresh = [];
  const retries = [];
  for (const repo of needsGeneration) {
    (wasAttempted(repo) ? retries : fresh).push(repo);
  }

  const retryQuota = Math.min(retries.length, Math.max(1, Math.floor(CONFIG.batchSize * 0.3)));
  const batchToProcess = [
    ...fresh.slice(0, CONFIG.batchSize - retryQuota),
    ...retries.slice(0, retryQuota)
  ].slice(0, CONFIG.batchSize);

  if (batchToProcess.length < CONFIG.batchSize) {
    for (const repo of [...fresh, ...retries]) {
      if (batchToProcess.length >= CONFIG.batchSize) break;
      if (!batchToProcess.includes(repo)) batchToProcess.push(repo);
    }
  }

  const remaining = needsGeneration.length - batchToProcess.length;
  console.log(`  - Never attempted: ${fresh.length} | awaiting retry: ${retries.length}`);

  if (batchToProcess.length < needsGeneration.length) {
    const freshInBatch = batchToProcess.filter(r => !wasAttempted(r)).length;
    console.log(`  - This batch: ${batchToProcess.length} (${freshInBatch} new, ${batchToProcess.length - freshInBatch} retry), ${remaining} remaining for next run`);
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
  if (remainingKg > 0) console.log(`Remaining repos needing knowledgeGraph: ${remainingKg}`);
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

        // Reasoning models sometimes emit their scratchpad as the answer. There
        // was no gate here, so 16 of those shipped as published briefings -
        // paragraphs of "We need to parse the repo data" on a public site.
        // Rejecting rather than storing lets the normal retry path pick it up
        // with another model on a later run.
        if (article && looksLikeReasoning(article)) {
          console.log(`  - Article rejected: model returned its reasoning, not a briefing`);
          article = null;
        }

        if (article) {
          consecutiveRateLimits = 0;
          aiSuccessCount++;
        } else {
          consecutiveRateLimits++;
          if (consecutiveRateLimits >= 3) {
            const exhausted = CONFIG.models.available.every(m => modelRateLimits[m]);
            console.log(`\n⚠️  3 consecutive AI failures - skipping AI for remaining ${batchToProcess.length - i - 1} repos in batch.`);
            console.log(exhausted
              ? `   All ${CONFIG.models.available.length} models in LLM_MODELS are unavailable. Check the key and the slugs above.`
              : `   See the per-model status above for the cause (auth, quota, or a stale slug).`);
            console.log(`   Successfully generated ${aiSuccessCount} AI articles before stopping.\n`);
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
        // Records the prompt generation, so a later bump can find this article.
        av: article ? ARTICLE_VERSION : (existing && existing.av) || 1,
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

  const inBatch = new Set(batchToProcess.map(r => r.id));
  const carried = needsGeneration.filter(r => !inBatch.has(r.id));
  let carriedWithArticle = 0;

  for (let i = 0; i < carried.length; i++) {
    const repo = carried[i];
    const existing = existingArticles.get(repo.id);
    if (existing && existing.summary) carriedWithArticle++;

    forks.push({
      ...(existing || {}),
      id: repo.id,
      name: repo.name,
      displayName: repo.name.replace(/-/g, ' ').replace(/_/g, ' '),
      description: repo.description || (existing && existing.description) || 'No description available',
      summary: (existing && existing.summary) || null,
      url: repo.html_url,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      topics: (existing && existing.topics) || [],
      parent: (existing && existing.parent) || null,
      type: repo._type || 'fork',
      image: (existing && existing.image) || getRandomUnsplashUrl(forks.length + i),
      forkedAt: formatDate(repo.created_at),
      updatedAt: formatDate(repo.updated_at),
      readTime: (existing && existing.summary) ? estimateReadTime(existing.summary) : 0,
      knowledgeGraph: (existing && existing.knowledgeGraph) || null,
      awaitingArticle: true
    });
  }

  if (carried.length > 0) {
    console.log(`\nCarried ${carried.length} repos into the output without a new article (${carriedWithArticle} kept a previous one).`);
  }

  forks.forEach(enrichFork);

  const taxonomy = { domains: {}, languages: {}, kinds: {}, capabilities: {} };
  for (const f of forks) {
    taxonomy.domains[f.domain] = (taxonomy.domains[f.domain] || 0) + 1;
    if (f.language) taxonomy.languages[f.language] = (taxonomy.languages[f.language] || 0) + 1;
    taxonomy.kinds[f.kind] = (taxonomy.kinds[f.kind] || 0) + 1;
    for (const c of f.capabilities) taxonomy.capabilities[c.name] = (taxonomy.capabilities[c.name] || 0) + 1;
  }
  const rank = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  console.log(`\nTaxonomy: ${rank(taxonomy.languages).length} languages, ` +
    `${rank(taxonomy.kinds).length} artifact kinds, ${rank(taxonomy.capabilities).length} capabilities`);
  console.log(`  Kinds: ${rank(taxonomy.kinds).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  Capabilities: ${rank(taxonomy.capabilities).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ')}`);

  // Sort by updated date
  forks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  console.log('\n=== Semantic Layer ===');
  let similarityLinks = [];
  let semanticCount = 0;
  try {
    const { cache } = await generateEmbeddings(forks, loadEmbeddingsCache());
    const { positions, links } = computeUmapAndKnn(forks, cache);
    for (const fork of forks) {
      const p = positions[fork.id];
      if (!p) continue;
      fork.umap = p;   // [x, y, z], each normalized to [0,1]
      semanticCount++;
    }
    similarityLinks = links;
  } catch (e) {
    console.log(`  Semantic layer failed, continuing without it: ${e.message}`);
  }

  // Count how many have AI articles vs fallback
  const aiArticleCount = forks.filter(f => f.summary && !isFallbackArticle(f.summary)).length;
  const fallbackCount = forks.filter(f => f.summary && isFallbackArticle(f.summary)).length;
  const noArticleCount = forks.filter(f => !f.summary).length;
  const pendingCount = needsGeneration.length - batchToProcess.length;

  const output = {
    lastUpdated: new Date().toISOString(),
    generatedWith: `NVIDIA API (${CONFIG.models.available.join(', ')})`,
    totalRepos: forks.length,
    progress: {
      aiGenerated: aiArticleCount,
      fallback: fallbackCount,
      noArticle: noArticleCount,
      pending: pendingCount,
      complete: pendingCount === 0
    },
    semantic: {
      model: EMBED_MODEL,
      positioned: semanticCount,
      links: similarityLinks.length
    },
    taxonomy,
    similarityLinks,
    forks
  };

  fs.writeFileSync('forks.json', JSON.stringify(output, null, 2));
  console.log(`\n=== Complete ===`);
  console.log(`Total repos: ${forks.length}`);
  console.log(`AI articles: ${aiArticleCount}`);
  console.log(`Fallback articles: ${fallbackCount}`);
  console.log(`Awaiting first article: ${noArticleCount}`);
  console.log(`Pending (next run): ${pendingCount}`);
  console.log(`Semantic positions: ${semanticCount} | similarity links: ${similarityLinks.length}`);
  if (pendingCount > 0) {
    console.log(`\n→ Run workflow again to process next batch of ${Math.min(CONFIG.batchSize, pendingCount)} repos`);
  } else {
    console.log(`\n✓ All repos have been processed!`);
  }
}

// Only run when invoked directly, so the semantic helpers can be required in tests.
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

// Only main is this file's own now. The rest moved to lib-classify,
// lib-knowledge-graph and lib-embeddings, and re-exporting them from here would
// misrepresent where they live.
module.exports = { main };
