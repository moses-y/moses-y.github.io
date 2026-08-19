/*
 * lib-config.js - the run's configuration, and which model to ask next.
 *
 * Extracted so the modules split out of update-forks.js can read the same
 * settings without importing the orchestrator, which would be circular. The model
 * rotation state lives here too, because it is per-run state that both the caller
 * and the article writer have to agree on: two copies of "which models are rate
 * limited" would mean the rotation silently stopped working.
 */
'use strict';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const LLM_API_KEY = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY;
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '240000', 10);   // 120s aborted legitimate work on large prompts
const LLM_BASE = LLM_ENDPOINT.replace(/\/chat\/completions\/?$/, '');
const EMBED_ENDPOINT = process.env.EMBED_ENDPOINT || `${LLM_BASE}/embeddings`;
const EMBED_MODEL = process.env.EMBED_MODEL || 'nvidia/nv-embedqa-e5-v5';
const LLM_MODELS = (process.env.LLM_MODELS || 'openai/gpt-oss-120b,nvidia/nemotron-3.5-lightning-30b-a3b,deepseek-ai/deepseek-v4-flash-0731').split(',').map(m => m.trim());

// Configuration
const CONFIG = {
  username: process.env.GITHUB_USERNAME || 'moses-y',
  reposToShow: parseInt(process.env.REPOS_LIMIT || '0', 10),
  batchSize: parseInt(process.env.BATCH_SIZE || '10', 10),
  kgBatchSize: parseInt(process.env.KG_BATCH_SIZE || '50', 10),
  apiDelay: parseInt(process.env.API_DELAY || '1600', 10),   // 40 rpm account ceiling
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

module.exports = { CONFIG, GITHUB_TOKEN, LLM_API_KEY, LLM_ENDPOINT, LLM_TIMEOUT_MS,
  LLM_MODELS, EMBED_ENDPOINT, EMBED_MODEL, modelRateLimits, getNextModel };
