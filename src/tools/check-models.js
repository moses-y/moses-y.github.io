#!/usr/bin/env node
/*
 * check-models.js - does every model this pipeline is configured to use still exist?
 *
 * Written after nvidia/nv-embedqa-e5-v5 reached end of life on 2026-08-25 and the
 * pipeline kept running green for seventeen days: the embedding step logged one
 * 410 line, broke out of its loop, and the job exited 0. 127 repositories reached
 * the site with no position on the semantic graph and nothing said so. In the same
 * window openai/gpt-oss-120b was retired and deepseek-v4-flash-0731 began timing
 * out on every call, leaving a three-model rotation with one working model.
 *
 * A model roster is configuration that rots on someone else's schedule, so it
 * needs the same treatment as any other external dependency: something that
 * checks it and turns red. This lists the catalogue, then actually calls each
 * configured model - a name present in /v1/models is not proof it answers, which
 * is exactly the deepseek case.
 *
 *   NVIDIA_API_KEY=... node src/tools/check-models.js
 *   node src/tools/check-models.js --list       # print the whole catalogue
 */
'use strict';

const { CONFIG, LLM_API_KEY, LLM_ENDPOINT, EMBED_ENDPOINT, EMBED_MODEL } =
  require('../lib/lib-config.js');

const LIST = process.argv.includes('--list');
const BASE = LLM_ENDPOINT.replace(/\/chat\/completions\/?$/, '');
/*
 * Bounded, but not as tightly as the first version of this file: a 45s probe
 * called nemotron-3.5-lightning dead when it was demonstrably writing articles
 * in the pipeline, just slowly. Latency is reported instead of being folded into
 * the verdict, so "retired" and "slow" stay different findings.
 */
const PROBE_TIMEOUT_MS = parseInt(process.env.PROBE_TIMEOUT_MS || '150000', 10);
// Sixteen tokens was also unfair: a reasoning model spends the whole budget
// thinking and returns empty content, which is not the same as being broken.
const PROBE_TOKENS = parseInt(process.env.PROBE_TOKENS || '64', 10);

// Every model the pipeline names, not just the article rotation. The Code Brain's
// structure pass had been pointing at a retired model for eight days and nothing
// listed it anywhere a check could see.
const EXTRA = (process.argv.find(a => a.startsWith('--probe=')) || '').slice(8);
const DEEP = {
  'deepgraph structure': process.env.DEEP_STRUCT_MODEL || 'openai/gpt-oss-120b',
  'deepgraph narrative': process.env.DEEP_NARR_MODEL || 'nvidia/nemotron-3-super-120b-a12b'
};

if (!LLM_API_KEY) {
  console.error('No NVIDIA_API_KEY / LLM_API_KEY in the environment.');
  process.exit(2);
}

const auth = { 'Authorization': `Bearer ${LLM_API_KEY}`, 'Content-Type': 'application/json' };

async function catalogue() {
  const r = await fetch(`${BASE}/models`, { headers: auth, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return { error: `HTTP ${r.status}`, ids: [] };
  const j = await r.json();
  return { ids: (j.data || []).map(m => m.id).sort() };
}

// One real call. Returns { ok, detail, ms } - the timing matters as much as the
// status, because the failure that cost the most was a model that answered 200
// eventually and never within the run's budget.
async function probeChat(model) {
  const t0 = Date.now();
  try {
    const r = await fetch(CONFIG.models.endpoint, {
      method: 'POST', headers: auth,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: PROBE_TOKENS, temperature: 0
      })
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).slice(0, 160);
      return { ok: false, detail: `HTTP ${r.status} ${body}`, ms };
    }
    const j = await r.json();
    const msg = j.choices?.[0]?.message || {};
    const text = msg.content?.trim();
    if (!text) {
      // Distinguish the two ways a 200 can be useless, because they need
      // different answers: a reasoning model needs a bigger budget, an empty
      // response needs a different model.
      const thought = (msg.reasoning_content || '').length;
      return { ok: false, detail: thought
        ? `spent the whole ${PROBE_TOKENS}-token budget reasoning (${thought} chars), returned no content`
        : 'answered 200 with no content', ms };
    }
    return { ok: true, detail: JSON.stringify(text.slice(0, 24)), ms };
  } catch (e) {
    return { ok: false, detail: /timeout|abort/i.test(e.message || e.name)
      ? `no answer in ${Math.round(PROBE_TIMEOUT_MS / 1000)}s` : e.message, ms: Date.now() - t0 };
  }
}

async function probeEmbed(model) {
  const t0 = Date.now();
  try {
    const r = await fetch(EMBED_ENDPOINT, {
      method: 'POST', headers: auth,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      body: JSON.stringify({ model, input: ['health probe'], encoding_format: 'float',
        truncate: 'END', input_type: 'passage' })
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).slice(0, 160);
      return { ok: false, detail: `HTTP ${r.status} ${body}`, ms };
    }
    const j = await r.json();
    const dim = j.data?.[0]?.embedding?.length;
    if (!dim) return { ok: false, detail: 'answered 200 with no vector', ms };
    // The dimension is reported because changing it changes the UMAP input and
    // invalidates every cached vector, which is a migration, not a swap.
    return { ok: true, detail: `${dim} dims`, ms };
  } catch (e) {
    return { ok: false, detail: /timeout|abort/i.test(e.message || e.name)
      ? `no answer in ${Math.round(PROBE_TIMEOUT_MS / 1000)}s` : e.message, ms: Date.now() - t0 };
  }
}

(async () => {
  const cat = await catalogue();
  if (cat.error) console.log(`catalogue unavailable (${cat.error}) - probing anyway\n`);
  else console.log(`catalogue: ${cat.ids.length} models visible to this key\n`);

  if (LIST) { cat.ids.forEach(id => console.log('  ' + id)); console.log(''); }

  const known = new Set(cat.ids);
  let dead = 0;

  const row = (kind, model, res) => {
    const listed = known.size ? (known.has(model) ? '' : '  [not in catalogue]') : '';
    console.log(`  ${res.ok ? 'ok  ' : 'DEAD'}  ${kind.padEnd(19)} ${model}  ${(res.ms + 'ms').padStart(7)}  ${res.detail}${listed}`);
    if (!res.ok) dead++;
  };

  console.log('chat rotation');
  for (const m of CONFIG.models.available) row('chat', m, await probeChat(m));

  console.log('\ncode brain');
  for (const [role, m] of Object.entries(DEEP)) row(role, m, await probeChat(m));

  if (EXTRA) {
    console.log('\ncandidates');
    for (const m of EXTRA.split(',').map(x => x.trim()).filter(Boolean)) {
      const res = /embed|retriev|arctic/i.test(m) ? await probeEmbed(m) : await probeChat(m);
      // Candidates are informational: a rejected option, not a fault, so they
      // do not count toward the exit code.
      console.log(`  ${res.ok ? 'ok  ' : 'no  '}  candidate           ${m}  ${(res.ms + 'ms').padStart(7)}  ${res.detail}`);
    }
  }
  console.log('\nembeddings');
  row('embed', EMBED_MODEL, await probeEmbed(EMBED_MODEL));

  // Candidates for whatever is dead, so the report is actionable rather than
  // just a red mark. Filtered by name because the catalogue has no capability field.
  if (dead && known.size) {
    const embeds = cat.ids.filter(id => /embed|embedqa|retrieval/i.test(id));
    const chats = cat.ids.filter(id => !/embed|embedqa|retrieval|rerank|ocr|vila|vision|speech|riva/i.test(id));
    console.log(`\nlive alternatives\n  embedding (${embeds.length}):`);
    embeds.forEach(id => console.log('    ' + id));
    console.log(`  chat (${chats.length}, first 40):`);
    chats.slice(0, 40).forEach(id => console.log('    ' + id));
  }

  console.log(dead ? `\n${dead} configured model(s) unusable` : '\nall configured models answer');
  process.exit(dead ? 1 : 0);
})();
