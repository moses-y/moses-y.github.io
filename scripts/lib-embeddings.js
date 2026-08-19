/*
 * lib-embeddings.js - the embedding, UMAP and nearest-neighbour layer.
 *
 * Split out of update-forks.js at the 450-line limit. This is the self-contained
 * half of that file: it takes forks, produces vectors, projects them to three
 * dimensions for the graph, and computes the neighbour edges. It shares nothing
 * with article generation except the API key.
 *
 * The endpoint chain is re-derived from the environment here rather than passed
 * in, because it is two lines of env reading and threading it through would make
 * every caller carry configuration it has no other use for. LLM_API_KEY is read
 * in both files for the same reason.
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { stripMarkdown } = require('./lib-text.js');

const LLM_API_KEY = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY;
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_BASE = LLM_ENDPOINT.replace(/\/chat\/completions\/?$/, '');
const EMBED_ENDPOINT = process.env.EMBED_ENDPOINT || `${LLM_BASE}/embeddings`;
const EMBED_MODEL = process.env.EMBED_MODEL || 'nvidia/nv-embedqa-e5-v5';

const EMBED_CACHE_FILE = process.env.EMBED_CACHE_FILE || 'embeddings.json';
const EMBED_BATCH = parseInt(process.env.EMBED_BATCH || '32', 10);
const EMBED_DIMS = 3;              // UMAP output dimensions (the graph is 3D)
const KNN_K = parseInt(process.env.KNN_K || '3', 10);
const KNN_MIN_SIM = parseFloat(process.env.KNN_MIN_SIM || '0.3');

function buildEmbeddingText(fork) {
  const parts = [];
  if (fork.description) parts.push(fork.description);
  if (fork.summary) parts.push(stripMarkdown(fork.summary).slice(0, 500));
  if (fork.language) parts.push(`Primary language: ${fork.language}`);
  const langs = fork.knowledgeGraph?.languages;
  if (langs && Object.keys(langs).length) {
    parts.push('Languages: ' + Object.keys(langs).join(', '));
  }
  if (fork.knowledgeGraph?.frameworks?.length) {
    parts.push('Frameworks: ' + fork.knowledgeGraph.frameworks.join(', '));
  }
  if (fork.topics?.length) parts.push('Topics: ' + fork.topics.join(', '));
  return parts.join('. ').slice(0, 2000);
}

function embedTextHash(text) {
  return crypto.createHash('sha1').update(`${EMBED_MODEL}\n${text}`).digest('hex').slice(0, 16);
}

function loadEmbeddingsCache() {
  try {
    if (fs.existsSync(EMBED_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(EMBED_CACHE_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.log(`  Embeddings cache unreadable (${e.message}), starting fresh`);
  }
  return {};
}

function saveEmbeddingsCache(cache) {
  fs.writeFileSync(EMBED_CACHE_FILE, JSON.stringify(cache));
}

// One embeddings call. Returns { vectors } or { error, status }.
// The nv-embedqa-* models require input_type; symmetric models ignore or reject it,
// so the caller probes rather than assuming when it is not pinned via env.
async function embedBatch(texts, inputType) {
  const body = {
    model: EMBED_MODEL,
    input: texts,
    encoding_format: 'float',
    truncate: 'END'
  };
  if (inputType) body.input_type = inputType;

  const response = await fetch(EMBED_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LLM_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { error: text.slice(0, 300), status: response.status };
  }

  const data = await response.json();
  if (!Array.isArray(data.data) || !data.data.length) {
    return { error: 'response contained no embeddings', status: response.status };
  }
  // NIM returns items with an index; do not rely on array order.
  const vectors = [];
  data.data.forEach((item, i) => {
    vectors[typeof item.index === 'number' ? item.index : i] = item.embedding;
  });
  return { vectors };
}

async function generateEmbeddings(forks, cache) {
  if (!LLM_API_KEY) {
    console.log('  No NVIDIA_API_KEY, skipping embeddings');
    return { cache, embedded: 0 };
  }

  // Work out which repos need a vector: absent, or metadata changed since last run.
  const pending = [];
  for (const fork of forks) {
    const text = buildEmbeddingText(fork);
    if (!text) continue;
    const hash = embedTextHash(text);
    const cached = cache[fork.id];
    if (cached && cached.hash === hash && Array.isArray(cached.vector)) continue;
    pending.push({ fork, text, hash });
  }

  if (!pending.length) {
    console.log(`  All ${forks.length} repos already embedded (cache hit)`);
    return { cache, embedded: 0 };
  }

  console.log(`  Embedding ${pending.length} repos with ${EMBED_MODEL} (batch ${EMBED_BATCH})`);

  // 'passage' suits the default embedqa model; the probe below still covers a
  // symmetric model that rejects the field, if EMBED_MODEL is overridden.
  let inputType = process.env.EMBED_INPUT_TYPE || 'passage';
  let probed = false;
  let embedded = 0;

  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const texts = batch.map(p => p.text);
    const batchNo = Math.floor(i / EMBED_BATCH) + 1;

    let result = await embedBatch(texts, inputType);

    if (result.error && !probed && result.status === 400 && /input_type/i.test(result.error)) {
      console.log(`  ${EMBED_MODEL} rejects input_type, retrying without it`);
      inputType = null;
      result = await embedBatch(texts, inputType);
    }
    probed = true;

    if (result.error) {
      // Give up on the rest of the run rather than burning quota on a systemic
      // failure. Whatever landed in the cache is still saved and reused next run.
      console.log(`  Embedding batch ${batchNo} failed (HTTP ${result.status}): ${result.error}`);
      if (result.status === 429) console.log('  Rate limited; remaining repos roll over to the next run');
      break;
    }

    batch.forEach((p, idx) => {
      const vector = result.vectors[idx];
      if (!Array.isArray(vector)) return;
      cache[p.fork.id] = { hash: p.hash, vector };
      embedded++;
    });

    console.log(`  Batch ${batchNo}: ${batch.length} repos (${embedded}/${pending.length} done)`);
    saveEmbeddingsCache(cache);

    if (i + EMBED_BATCH < pending.length) {
      // Account rate limit is 40 rpm, so requests must be spaced past 1500ms.
      await new Promise(r => setTimeout(r, parseInt(process.env.EMBED_DELAY || '1600', 10)));
    }
  }

  saveEmbeddingsCache(cache);
  return { cache, embedded };
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

// UMAP down to 3 dimensions (the graph is 3D) plus top-K cosine neighbors.
function computeUmapAndKnn(forks, cache) {
  const embedded = forks.filter(f => Array.isArray(cache[f.id]?.vector));
  if (embedded.length < 5) {
    console.log(`  Only ${embedded.length} vectors available, skipping UMAP`);
    return { positions: {}, links: [] };
  }

  let UMAP;
  try {
    UMAP = require('umap-js').UMAP;
  } catch (e) {
    console.log('  umap-js not installed, skipping semantic layout (npm install umap-js)');
    return { positions: {}, links: [] };
  }

  const vectors = embedded.map(f => cache[f.id].vector);
  const dim = vectors[0].length;
  // A ragged matrix would corrupt UMAP silently; a model switch mid-cache can cause it.
  const ragged = vectors.filter(v => v.length !== dim).length;
  if (ragged) {
    console.log(`  ${ragged} vectors have a mismatched dimension, skipping UMAP (clear ${EMBED_CACHE_FILE} to rebuild)`);
    return { positions: {}, links: [] };
  }

  console.log(`  Computing ${EMBED_DIMS}D UMAP over ${embedded.length} vectors (dim ${dim})`);
  const umap = new UMAP({
    nComponents: EMBED_DIMS,
    nNeighbors: Math.max(2, Math.min(15, embedded.length - 1)),
    minDist: 0.1
  });
  const coords = umap.fit(vectors);

  // Normalize each axis to [0,1] so the front end can scale to any box size.
  const mins = new Array(EMBED_DIMS).fill(Infinity);
  const maxs = new Array(EMBED_DIMS).fill(-Infinity);
  coords.forEach(c => {
    for (let d = 0; d < EMBED_DIMS; d++) {
      if (c[d] < mins[d]) mins[d] = c[d];
      if (c[d] > maxs[d]) maxs[d] = c[d];
    }
  });

  const positions = {};
  embedded.forEach((f, i) => {
    const p = [];
    for (let d = 0; d < EMBED_DIMS; d++) {
      const range = maxs[d] - mins[d] || 1;
      p.push(Math.round(((coords[i][d] - mins[d]) / range) * 10000) / 10000);
    }
    positions[f.id] = p;
  });

  // Top-K neighbors per repo, deduped so an edge appears once regardless of direction.
  const links = [];
  const seen = new Set();
  for (let i = 0; i < embedded.length; i++) {
    const sims = [];
    for (let j = 0; j < embedded.length; j++) {
      if (i === j) continue;
      sims.push({ j, sim: cosineSimilarity(vectors[i], vectors[j]) });
    }
    sims.sort((a, b) => b.sim - a.sim);
    for (const { j, sim } of sims.slice(0, KNN_K)) {
      if (sim < KNN_MIN_SIM) break;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        source: embedded[i].id,
        target: embedded[j].id,
        similarity: Math.round(sim * 1000) / 1000
      });
    }
  }

  console.log(`  UMAP done: ${Object.keys(positions).length} positions, ${links.length} similarity links`);
  return { positions, links };
}

module.exports = { buildEmbeddingText, embedTextHash, loadEmbeddingsCache,
  saveEmbeddingsCache, embedBatch, generateEmbeddings, cosineSimilarity, computeUmapAndKnn };
