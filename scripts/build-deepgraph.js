#!/usr/bin/env node
/*
 * build-deepgraph.js — deep per-repo dependency graphs via NVIDIA-hosted LLMs.
 *
 * Layers a real module/coupling graph (+ architecture narrative) on top of the
 * file-tree structures from build-structure.js. Emits structure/<id>.json with a
 * module graph the Code Brain page already renders (nodes[0].kind === 'module').
 *
 * Split-by-task (per user choice):
 *   - STRUCT_MODEL (DeepSeek V4 Pro)  -> modules, import/call edges, Ca/Ce/instability
 *   - NARR_MODEL   (GLM 5.2)          -> architecture summary + notable findings
 *
 * Scope (per user choice): originals + top forks first. Tune with --top / --all.
 *
 * SECURITY: reads NVIDIA_API_KEY from the environment only. Never hard-code it,
 * never log it. Rotate the key before first use (the old one was exposed).
 *
 * Usage:
 *   node scripts/build-deepgraph.js --dry-run        # no API calls; show plan + token estimate
 *   node scripts/build-deepgraph.js --top 30         # originals + top 30 forks by stars
 *   node scripts/build-deepgraph.js --all            # every repo (heavy)
 *   node scripts/build-deepgraph.js --only <id>      # a single repo
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'structure');

// ---- Config (override via env) ----------------------------------------------
const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const API_KEY = process.env.NVIDIA_API_KEY || '';
// NVIDIA NIM model slugs — confirm exact IDs in build.nvidia.com and override via env.
const STRUCT_MODEL = process.env.DEEP_STRUCT_MODEL || 'deepseek-ai/deepseek-v4-pro';
const NARR_MODEL = process.env.DEEP_NARR_MODEL || 'zai/glm-5.2';

const SRC_BUDGET = 120 * 1024;    // max source bytes bundled per repo (keeps prompt sane)
const MAX_FILE = 24 * 1024;       // truncate any single file to this
const CODE_EXT = new Set(['js','jsx','mjs','cjs','ts','tsx','py','rs','go','java','kt','swift','dart','rb','php','c','h','cpp','cc','hpp','cs','sh','lua','zig','ex','exs','vue','svelte','astro','sol','sql']);
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|\.venv|venv|__pycache__|\.next|target|\.cache|coverage|test|tests|__tests__|fixtures|examples?)(\/|$)/;

// ---- CLI --------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const ALL = argv.includes('--all');
const FORCE = argv.includes('--force');
const TOP = (function () { const i = argv.indexOf('--top'); return i > -1 ? parseInt(argv[i + 1], 10) : 30; })();
const ONLY = (function () { const i = argv.indexOf('--only'); return i > -1 ? argv[i + 1] : null; })();

function gh(pathname) {
  return execFileSync('gh', ['api', pathname, '--cache', '24h'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}
function ext(p) { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; }

// ---- Repo selection ---------------------------------------------------------
function selectRepos(forks) {
  if (ONLY) return forks.filter(f => String(f.id) === ONLY);
  if (ALL) return forks;
  const originals = forks.filter(f => f.type === 'original');
  const rest = forks.filter(f => f.type !== 'original').sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, TOP);
  const seen = new Set();
  return originals.concat(rest).filter(f => !seen.has(f.id) && seen.add(f.id));
}

// ---- Source bundling (one tarball per repo, extracted locally, then removed) -
function walkCode(dir, base, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(base, full);
    if (SKIP_DIR.test('/' + rel)) continue;
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) walkCode(full, base, acc);
    else if (CODE_EXT.has(ext(name))) acc.push({ full: full, rel: rel, size: st.size });
  }
  return acc;
}
function bundleSource(owner, repo) {
  const tmp = fs.mkdtempSync('/tmp/dg-');
  try {
    // Single call: download the default-branch tarball and extract locally.
    execFileSync('bash', ['-c',
      `gh api repos/${owner}/${repo}/tarball > "${tmp}/a.tgz" 2>/dev/null && tar xzf "${tmp}/a.tgz" -C "${tmp}" 2>/dev/null`],
      { stdio: 'ignore', maxBuffer: 256 * 1024 * 1024 });
    const rootEntries = fs.readdirSync(tmp).filter(n => n !== 'a.tgz');
    const srcRoot = rootEntries.length ? path.join(tmp, rootEntries[0]) : tmp;
    let files = walkCode(srcRoot, srcRoot, []);
    files.sort((a, b) => a.size - b.size);   // many small files = architecture signal
    const bundle = []; let used = 0;
    for (const f of files) {
      if (used >= SRC_BUDGET) break;
      let content; try { content = fs.readFileSync(f.full, 'utf8'); } catch (e) { continue; }
      if (content.length > MAX_FILE) content = content.slice(0, MAX_FILE) + '\n… (truncated)';
      const block = `\n===== ${f.rel} =====\n${content}\n`;
      if (used + block.length > SRC_BUDGET) break;
      bundle.push(block); used += block.length;
    }
    return { text: bundle.join(''), fileCount: files.length, bundled: bundle.length, bytes: used };
  } finally {
    try { execFileSync('rm', ['-rf', tmp]); } catch (e) {}
  }
}

// ---- LLM calls (OpenAI-compatible) ------------------------------------------
async function chat(model, system, user, jsonMode) {
  const body = {
    model, temperature: 0.2, max_tokens: 8192,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices[0].message.content;
}

const STRUCT_SYS = 'You are a static-analysis engine. Given a repository\'s source, infer its internal module dependency graph. ' +
  'Return ONLY JSON: {"nodes":[{"id","name","full","lang","ca","ce"}],"links":[{"s","t"}]} where a link s->t means module s imports/depends on module t, ' +
  'ca = number of modules importing this one (fan-in), ce = number it imports (fan-out). Use dotted module paths for ids. Keep to the most significant <=300 modules.';
// Narrative + findings. Borrows CUPID's discipline so extraction stays smooth (low-noise):
//  - fixed taxonomy + severity tiers
//  - a 3-gate escalation rule that kills false positives and downgrades intentional idioms
//  - inspectable evidence (file/function/excerpt) on every finding
//  - explicit scope so nothing is silently dropped
const NARR_SYS = [
  'You are a principal engineer producing an architecture briefing AND a disciplined code-issue review.',
  'First: describe the repo\'s structure in 3-4 sentences and list up to 3 strengths.',
  'Then find code issues. Each finding MUST have:',
  '  category ∈ [clarity, efficiency, cognitive_load, resilience, soundness, resource_safety];',
  '  severity ∈ [error, warning, info];',
  '  file and (if applicable) function; a short evidence excerpt; a concrete recommendation;',
  '  rank = your estimate of severity × leverage (how much it matters) × removability (how easily fixed), 0-10.',
  'Apply THREE gates before escalating a finding above info — this keeps noise out:',
  '  1) Resolution: could naive parsing get this fact wrong (stdlib vs local name, guarded/conditional imports,',
  '     typing.overload stubs, re-export cycles)? If yes, do NOT report it as real.',
  '  2) Code role: does the code\'s role change the correct fix? If yes, rewrite the recommendation to fit the role.',
  '  3) Deliberate idiom: is the shape intentional? If yes, keep it but grade it down to info.',
  'Report scope honestly: how many files you actually reviewed vs. the sample you were given.',
  'Return ONLY JSON: {"summary": str, "strengths": [str], ',
  '"findings": [{"title","category","severity","file","function","evidence","recommendation","rank"}], ',
  '"scope": {"reviewed": int, "note": str}}. Cap findings at the 15 highest-rank.'
].join(' ');

// Build a framing preamble from the repo's existing knowledge-graph metadata.
// Gives the models priors (purpose, languages) so labels + narrative stay grounded
// and consistent with the macro graph's domain framing — instead of guessing from code alone.
function framing(f) {
  const kg = f.knowledgeGraph || {};
  const langs = kg.languages ? Object.keys(kg.languages).sort((a, b) => kg.languages[b] - kg.languages[a]).slice(0, 6).join(', ') : (f.language || 'unknown');
  const lines = [
    `Repository: ${f.displayName || f.name}`,
    f.summary || f.description ? `Purpose: ${f.summary || f.description}` : null,
    (f.topics && f.topics.length) ? `Topics: ${f.topics.join(', ')}` : null,
    `Primary languages: ${langs}`,
    kg.totalFiles ? `Total files: ${kg.totalFiles}` : null,
    `Type: ${f.type || 'fork'}`
  ].filter(Boolean);
  return lines.join('\n');
}

async function analyze(f) {
  const m = /github\.com\/([^/]+)\/([^/]+)/.exec(f.url || '');
  if (!m) throw new Error('no url');
  const src = bundleSource(m[1], m[2]);
  if (!src.text) throw new Error('no source bundled');
  if (DRY) return { dry: true, src };

  const context = framing(f) + '\n\nSource (a budget-limited sample of the repo):\n' + src.text;
  const [structRaw, narrRaw] = await Promise.all([
    chat(STRUCT_MODEL, STRUCT_SYS, context, true),
    chat(NARR_MODEL, NARR_SYS, context, true)
  ]);
  const struct = JSON.parse(structRaw);
  const narrative = JSON.parse(narrRaw);

  const nodes = (struct.nodes || []).map(n => {
    const ca = n.ca || 0, ce = n.ce || 0;
    return { id: n.id, name: n.name || String(n.id).split('.').slice(-2).join('.'), full: n.full || n.id,
      kind: 'module', lang: n.lang || f.language || null, ca, ce, inst: (ca + ce) ? +(ce / (ca + ce)).toFixed(2) : 0 };
  });
  const ids = new Set(nodes.map(n => n.id));
  const links = (struct.links || []).filter(l => ids.has(l.s) && ids.has(l.t));
  return { id: f.id, name: f.displayName || f.name, deep: true, kind: 'import-graph',
    model: { structure: STRUCT_MODEL, narrative: NARR_MODEL },
    shown: nodes.length, edges: links.length, narrative, nodes, links };
}

// ---- Main -------------------------------------------------------------------
(async function main() {
  if (!DRY && !API_KEY) {
    console.error('NVIDIA_API_KEY is not set. Rotate the exposed key, then:  export NVIDIA_API_KEY="nvapi-…"');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'forks.json'), 'utf8'));
  const repos = selectRepos(data.forks || []);
  console.log((DRY ? '[dry-run] ' : '') + `selected ${repos.length} repos (models: ${STRUCT_MODEL} + ${NARR_MODEL})`);

  let done = 0, failed = 0, estBytes = 0;
  for (const f of repos) {
    const outFile = path.join(OUT, f.id + '.deep.json');
    if (!FORCE && !DRY && fs.existsSync(outFile)) { continue; }
    try {
      const r = await analyze(f);
      if (DRY) { estBytes += r.src.bytes; console.log(`  ${f.name}: ${r.src.bundled}/${r.src.fileCount} files, ~${(r.src.bytes/1024|0)}KB source`); continue; }
      fs.writeFileSync(outFile, JSON.stringify(r));
      done++; console.log(`  ✓ ${f.name}: ${r.shown} modules, ${r.edges} edges`);
    } catch (e) { failed++; console.log(`  ✗ ${f.name}: ${e.message}`); }
  }
  if (DRY) console.log(`[dry-run] total source ~${(estBytes/1024|0)}KB across ${repos.length} repos → ~${Math.round(estBytes/4/1000)}k input tokens (rough, ×2 models)`);
  else console.log(`deepgraph: built=${done} failed=${failed} -> ${OUT}/<id>.deep.json`);
})();
