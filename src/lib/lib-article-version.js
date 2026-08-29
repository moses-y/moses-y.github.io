/*
 * lib-article-version.js - decides when a stored article is stale.
 *
 * Until now an article was regenerated only when it was missing, a fallback, or
 * a reasoning leak. That made prompt improvements invisible: the wiring section
 * could land and every one of the 1,331 stored summaries would keep its
 * pre-wiring text forever, because the pipeline had no way to say "this text was
 * produced by an older prompt".
 *
 * So each generated summary now records the prompt generation that produced it.
 * Bump ARTICLE_VERSION when the prompt changes in a way that should change the
 * output, and the whole estate becomes due again, draining through the normal
 * per-run batch rather than in one burst. This is the same gate build-symbols
 * and build-hygiene already use for their own stored results.
 *
 * A version bump is a commitment of about 1,331 model calls at the current
 * batch ceiling, roughly two weeks of cron, so bump it for a change worth that
 * and use the targeted list below for anything smaller.
 *
 * Targeted rewrites: data/article-rewrite.json, hand-edited, either
 *   ["repo-name", 123456]            names or numeric ids
 * or
 *   { "repos": ["repo-name"], "note": "why" }
 * Entries are consumed by name or id and queue those repos regardless of
 * version. The file is advisory, not state: it is never rewritten by the
 * pipeline, so a name left in it keeps that repo in the retry pool. Remove the
 * entry once the article looks right.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// 1: original prompt.
// 2: measured facts block (import graph, findings, hygiene) plus How It Is Wired.
const ARTICLE_VERSION = 2;

const LIST = path.join('data', 'article-rewrite.json');

let requested = null;
function requestedSet() {
  if (requested) return requested;
  requested = new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(LIST, 'utf8'));
    const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.repos) ? raw.repos : []);
    for (const it of items) if (it != null) requested.add(String(it));
  } catch (e) { /* absent is the normal case */ }
  return requested;
}

// A version bump is worth nothing if it fires before the facts it depends on
// exist. Generation reads the call graph from data/symbols and the audit from
// data/hygiene.json, and both are themselves versioned and backfilling. Rewrite
// a repo before its own backfill lands and the model is handed the same thin
// inputs as last time, spending a model call to reproduce the article it already
// had, with "the wiring has not been mapped" where the wiring section belongs.
//
// So a version rewrite waits on that repo's own inputs. A repo with no symbol
// file at all is not waiting for one: most of the estate is not Python and never
// will be parsed, and holding those articles back forever would be worse than
// generating them from the import graph and audit alone.
let inputs = null;
function inputsFor(id) {
  if (!inputs) {
    const load = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
    const sym = load(path.join('data', 'symbols-status.json'));
    const hyg = load(path.join('data', 'hygiene.json'));
    // Fails closed. This used to swallow the error and leave hygVersion at 0,
    // which makes every audited repo compare `entry.v >= 0` - true - so every
    // article reads as current and ~1,300 of them regenerate against a version
    // nothing computed. A sibling module that will not load is a broken tree,
    // not a degraded input, and it must stop the run rather than quietly
    // change what the whole estate is graded against.
    const hygVersion = require('./lib-hygiene.js').CHECKS_VERSION;
    if (typeof hygVersion !== 'number') {
      throw new Error('lib-hygiene exports no numeric CHECKS_VERSION; article versions would be meaningless');
    }
    inputs = { sym, hyg, hygVersion };
  }
  const key = String(id);
  const symbols = !inputs.sym ? 'unknown'
    : inputs.sym.repos[key] == null ? 'absent'
    : inputs.sym.repos[key] >= (inputs.sym.v || 1) ? 'current' : 'stale';
  const entry = inputs.hyg && inputs.hyg.repos ? inputs.hyg.repos[key] : null;
  const audit = !entry ? 'absent' : (entry.v || 1) >= inputs.hygVersion ? 'current' : 'stale';
  return { symbols, audit };
}

function inputsReady(id) {
  const { symbols, audit } = inputsFor(id);
  return symbols !== 'stale' && audit === 'current';
}

// True when the article may stand as it is. Either the text was produced by the
// current prompt, or it is behind but the inputs a rewrite would need have not
// landed yet, so rewriting it now would waste the call.
//
// Note this only governs staleness by version: a fallback, a reasoning leak or a
// hand-flagged repo is regenerated regardless, because those are broken rather
// than merely out of date, and a broken article is worse than a thin one.
function articleIsCurrent(existing) {
  if (!existing || !existing.summary) return false;
  const want = requestedSet();
  if (want.size && (want.has(String(existing.id)) || want.has(String(existing.name)))) return false;
  if ((existing.av || 1) >= ARTICLE_VERSION) return true;
  return !inputsReady(existing.id);
}

// Reported once per run so a large backlog is visibly a version bump rather
// than an unexplained surge of work.
function versionReport(existingArticles) {
  const byVersion = {};
  let flagged = 0;
  const want = requestedSet();
  for (const f of existingArticles.values()) {
    if (!f || !f.summary) continue;
    const v = f.av || 1;
    byVersion[v] = (byVersion[v] || 0) + 1;
    if (want.size && (want.has(String(f.id)) || want.has(String(f.name)))) flagged++;
  }
  let ready = 0, waiting = 0;
  const blocked = { symbols: 0, audit: 0 };
  for (const f of existingArticles.values()) {
    if (!f || !f.summary || (f.av || 1) >= ARTICLE_VERSION) continue;
    if (inputsReady(f.id)) { ready++; continue; }
    waiting++;
    const st = inputsFor(f.id);
    if (st.symbols === 'stale') blocked.symbols++;
    if (st.audit !== 'current') blocked.audit++;
  }
  const parts = Object.keys(byVersion).sort().map(v => `v${v}: ${byVersion[v]}`);
  const lines = [`  - Prompt generation ${ARTICLE_VERSION} current | stored ${parts.join(', ') || 'none'}`];
  if (ready || waiting) {
    lines.push(`  - Behind the current prompt: ${ready} ready to rewrite, ${waiting} waiting on their own facts`);
    lines.push(`    (waiting on: call graph ${blocked.symbols}, audit ${blocked.audit})`);
  }
  if (want.size) lines.push(`  - Flagged for rewrite by hand: ${flagged} of ${want.size} listed`);
  return lines.join('\n');
}

module.exports = { ARTICLE_VERSION, articleIsCurrent, versionReport };
