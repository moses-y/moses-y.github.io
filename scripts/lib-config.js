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

/*
 * A ceiling on how long this process will keep spending on model calls.
 *
 * The workflow runs on a 2-hour cron with cancel-in-progress, and measured over
 * three days runs take 27 to 132 minutes: 8 of the last 20 were cancelled at the
 * 120-minute line by the next scheduled run, discarding everything they had not
 * committed. Retrying a timeout raises the worst case per repo from one 240s
 * abort to three, so without a clock the guardrail could push a run over that
 * line and cost more than it saves.
 *
 * Once past this, retries stop and the caller keeps the article it already has.
 * A thinner article that gets committed beats a better one that gets cancelled.
 */
const RUN_STARTED = Date.now();
const LLM_RETRY_BUDGET_MS = parseInt(process.env.LLM_RETRY_BUDGET_MS || '3600000', 10);
function retryBudgetSpent() {
  // Zero or less turns retries off outright, which is both a useful setting for a
  // run that has to finish and the only way to test this branch without making a
  // test wait an hour or sleep on a clock.
  if (!(LLM_RETRY_BUDGET_MS > 0)) return true;
  return Date.now() - RUN_STARTED > LLM_RETRY_BUDGET_MS;
}
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
    /*
     * 2000 put the ceiling exactly on the length the prompt asks for. The prompt
     * says "under 550 words", the median stored article is 3,503 characters, and
     * 66 of 1,350 ended mid-sentence because a briefing that ran slightly long, or
     * a reasoning model that spent part of the same budget thinking, hit the cap
     * and was guillotined. Nothing read finish_reason, so it published silently.
     *
     * Headroom rather than a longer target: the word limit in the prompt is what
     * governs length, and this only stops the limit being enforced by truncation.
     * Billing is on tokens produced, so the raise costs nothing on its own.
     */
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
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
  LLM_MODELS, EMBED_ENDPOINT, EMBED_MODEL, modelRateLimits, getNextModel,
  LLM_RETRY_BUDGET_MS, retryBudgetSpent };
