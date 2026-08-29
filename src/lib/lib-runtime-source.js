/*
 * lib-runtime-source.js - which files the runtime catalogue reads, and how.
 *
 * Split out of checks-runtime.js when that file crossed the project's 450-line
 * limit, and the seam is a real one rather than a convenience: this half decides
 * what a repository's running program consists of, the other half decides what is
 * wrong with it. The selection is the part with a cost attached, so it is also
 * the part the runner has to be able to budget and the measurement harness has to
 * be able to reproduce exactly.
 *
 * Everything here is a pure function of the tree plus ctx.read, so it can be
 * exercised against a fixture with no network at all.
 */
'use strict';

// Paths that are not the running program: tests assert on insecure behaviour,
// examples demonstrate it, vendored code belongs to someone else, and a notebook
// is a scratchpad rather than a deployment.
const NOT_PRODUCTION = /(^|\/)(tests?|spec|specs|__tests__|fixtures?|testdata|examples?|samples?|demos?|docs?|node_modules|vendor|\.venv|venv|site-packages|third_party|migrations|scripts?\/dev)\//i;
const TEST_FILE = /(^|\/)(test_[^/]*|[^/]*_test|conftest|[^/]*\.spec|[^/]*\.test)\.[a-z]+$/i;

// Ranked by how much a decision in the file governs the whole process. A Django
// settings module is the top of this list because one line in it changes the
// behaviour of every request the application will ever serve.
function configScore(p) {
  const base = p.split('/').pop().toLowerCase();
  const depth = p.split('/').length;
  let s = 0;
  if (/^settings?\.py$/.test(base)) s += 120;
  if (/^(production|prod|staging)\.py$/.test(base)) s += 130;
  if (/^config\.py$/.test(base)) s += 90;
  if (/^(app|main|server|wsgi|asgi)\.py$/.test(base)) s += 85;
  if (/^(server|app|index|main)\.(js|ts|mjs|cjs)$/.test(base)) s += 80;
  if (/^docker-compose[.\w-]*\.ya?ml$/.test(base)) s += 75;
  if (/^(next|vite|nuxt|webpack)\.config\.\w+$/.test(base)) s += 40;
  if (/^(dev|development|local|test)\.py$/.test(base)) s -= 60;   // dev config is meant to be loose
  s -= depth * 2;                                                  // shallower is more likely the real entry
  return s;
}

const CONFIG_RE = /(^|\/)(settings?\.py|production\.py|prod\.py|staging\.py|config\.py|app\.py|main\.py|server\.py|wsgi\.py|asgi\.py|(server|app|index|main)\.(js|ts|mjs|cjs)|docker-compose[.\w-]*\.ya?ml|(next|vite|nuxt|webpack)\.config\.(js|ts|mjs|cjs))$/i;

const MAX_CONFIG_FILES = 5;

// Measured: a third of a 24-repo sample had no conventionally-named config file
// at all, so the whole catalogue sat out. Transformers keeps its work in
// gpt2finetune.py, twitter-data-analysis in Twitter.py, omp-best-of in
// runner.ts. Rather than concede those repos, fall back to the largest source
// files, which is a weaker signal about the program as a whole but the same
// signal about the lines it does read: verify=False is verify=False wherever it
// appears. Only the absence-shaped conclusions would be unsafe here, and this
// catalogue does not draw any.
const SOURCE_RE = /\.(py|js|ts|mjs|cjs|tsx|jsx)$/i;
const MAX_FALLBACK_FILES = 2;

// Resolved once per repo and cached on ctx, so twelve checks share four reads.
// ctx.read is itself cached, so the cost is paid by whichever check runs first.
// Which paths this catalogue wants, as a pure function of the tree. Separated
// from the reading so the measurement harness can prefetch exactly what the
// pipeline would, and so the runner can count the cost before paying it.
function selectPaths(ctx) {
  const candidates = ctx.find(CONFIG_RE)
    .filter(p => !NOT_PRODUCTION.test(p) && !TEST_FILE.test(p))
    .filter(p => ctx.sizeOf(p) <= 300000)
    .sort((a, b) => configScore(b) - configScore(a) || a.length - b.length)
    .slice(0, MAX_CONFIG_FILES);
  if (!candidates.length) {
    const src = ctx.tree
      .filter(f => SOURCE_RE.test(f.path) && !NOT_PRODUCTION.test(f.path) && !TEST_FILE.test(f.path))
      .filter(f => f.size > 200 && f.size <= 300000)
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_FALLBACK_FILES)
      .map(f => f.path);
    candidates.push(...src);
  }
  // The Dockerfile is a runtime decision as much as a build one, and two checks
  // here need it. In a full run the supply-chain catalogue has already fetched
  // it and ctx.read serves it from cache, so naming it costs nothing there and
  // makes this catalogue self-sufficient when it runs alone.
  for (const p of ctx.find(/(^|\/)(Dockerfile|Containerfile)([.-][\w.-]+)?$/).slice(0, 1)) {
    if (!candidates.includes(p)) candidates.push(p);
  }
  return candidates;
}

function configFiles(ctx) {
  if (ctx._runtimeFiles) return ctx._runtimeFiles;
  const out = [];
  for (const p of selectPaths(ctx)) {
    const t = ctx.read(p);
    if (t) out.push({ path: p, text: t });
  }
  // Files other catalogues already fetched are free to reuse, and a Dockerfile
  // is a runtime decision as much as a build one.
  for (const p of ctx.readPaths()) {
    if (out.some(f => f.path === p)) continue;
    if (!/(Dockerfile|Containerfile)/i.test(p)) continue;
    const t = ctx.read(p);
    if (t) out.push({ path: p, text: t });
  }
  ctx._runtimeFiles = out;
  return out;
}

// Comment-stripping is deliberately crude but one-directional: it can leave a
// comment behind, it cannot delete real code, so it only ever costs a false
// positive that the surrounding checks already guard against.
// An f-string carrying a substitution. The obvious /f["'][^"']*\{/ is wrong on
// the most common SQL case, f"... email = '{email}'", because the inner quote
// ends the character class before the brace is reached and the rule goes quiet on
// exactly the line it exists to catch. Anything but a newline is allowed instead.
const FSTRING = /\bf["'][^\n]*\{/;

function stripComments(text) {
  return text
    .replace(/^\s*#.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

// Arguments of the call beginning at `from`, by paren balance, so "does this call
// pass a timeout" can be asked without a parser and without a regex that runs off
// the end of the call into the next one.
function callArgs(text, from, limit) {
  const open = text.indexOf('(', from);
  if (open < 0) return '';
  let depth = 0;
  const end = Math.min(text.length, open + (limit || 400));
  for (let i = open; i < end; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return text.slice(open + 1, end);   // unterminated within the window
}

// Every check below reports the first file that hits, with a count across all of
// them, because "3 files disable it" is a stronger sentence than three findings.
function scan(ctx, fn) {
  let first = null, n = 0;
  for (const f of configFiles(ctx)) {
    const hit = fn(stripComments(f.text), f.path);
    if (!hit) continue;
    n += hit.n || 1;
    if (!first) first = { where: f.path, evidence: hit.evidence, n: 0 };
  }
  if (!first) return null;
  first.n = n;
  return first;
}

module.exports = { selectPaths, configFiles, configScore, stripComments, callArgs, scan,
  FSTRING, NOT_PRODUCTION, TEST_FILE };
