#!/usr/bin/env node
/*
 * test-quality.js - the gates that decide whether a generated briefing is fit to
 * publish, and the retry that runs when it is not.
 *
 * Written after a run where five repositories published boilerplate because a
 * model timed out and the code returned null instead of trying the next model,
 * and after finding 66 stored briefings that end mid-sentence because nothing
 * read finish_reason. Both are cheap to get wrong again, and neither shows up in
 * a page load: the article is there, it is just cut in half or empty of content.
 *
 * The generator is exercised against a stubbed fetch rather than the real
 * endpoint, so this needs no key and no network. The stub scripts one response
 * per model in the rotation, which is the only way to assert that a fault
 * actually advances the rotation rather than giving up.
 *
 *   node tests/test-quality.js
 */
'use strict';

// Hermetic: a fixed three-model rotation and a placeholder key, set before
// lib-config is required because it reads the environment once at load.
delete process.env.NVIDIA_API_KEY;
process.env.LLM_API_KEY = 'placeholder-not-a-real-key';
process.env.LLM_MODELS = 'model-a,model-b,model-c';
process.env.LLM_TIMEOUT_MS = '1000';

const { looksTruncated, looksLikeReasoning, isFallbackArticle,
  MIN_ARTICLE_CHARS } = require('../src/lib/lib-quality.js');

let fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fail++;
  console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
}

console.log('truncation predicate');

// The real cut-off endings, copied from stored articles.
check('a bare word ending is truncated',
  looksTruncated('The package supports 75 formats via `ocr.py`). Extraction'));
check('an unclosed inline code span is truncated',
  looksTruncated('The tracker resides in `src/tracker'));
check('a trailing hyphenated word is truncated',
  looksTruncated('a cross-platform LLM inference runtime with first-'));
check('an open parenthesis is truncated',
  looksTruncated('the aisix-guardrails pipeline ('));
check('a dangling bold marker is truncated',
  looksTruncated('before they are consumed by AI tools.\n**Low'));

// Endings that are complete and must not be regenerated. A false positive here
// is expensive: it spends a model call rewriting an article that was fine.
check('a full stop ends cleanly', !looksTruncated('this is a solid foundation.'));
check('a question mark ends cleanly', !looksTruncated('is it worth the dependency?'));
check('a closing fence ends cleanly', !looksTruncated('```\nnpm install foo\n```'));
check('a table row ends cleanly', !looksTruncated('| src/main.py | entry point |'));
check('a closed bold label ends cleanly', !looksTruncated('**Low risk overall**'));
check('a closing quote ends cleanly', !looksTruncated('the README calls it "experimental"'));
check('empty is not truncated', !looksTruncated('') && !looksTruncated(null));

console.log('\nregeneration gate');
const REAL = 'The service exposes a CLI over src/main.py. ' +
  'Configuration is read from src/config.py and cached under ~/.cache. '.repeat(8) + 'It works.';
check('a real briefing is kept', !isFallbackArticle(REAL));
check('the fallback boilerplate is replaced',
  isFallbackArticle('mimeographs is a Python project that demonstrates thoughtful software design. '.repeat(8)));
check('hype the prompt forbids is replaced',
  isFallbackArticle('In the rapidly evolving world of tooling, this is a comprehensive solution. '.repeat(8)));
// The whole point of the truncation work: these are stamped current, so only this
// gate can reach them.
check('a truncated briefing is replaced', isFallbackArticle(REAL.slice(0, 700) + ' the tracker resides in `src/tracker'));
check('anything under the floor is replaced', isFallbackArticle('Too short.'));
check('nothing at all is replaced', isFallbackArticle('') && isFallbackArticle(null));

console.log('\nreasoning predicate still holds');
check('a scratchpad leak is caught', looksLikeReasoning('We need to parse the repo data first.'));
check('a briefing is not', !looksLikeReasoning('The service reads config from src/config.py.'));

/*
 * The generator. Each case scripts one reply per model and asserts both the
 * returned article and how far the rotation got, because "returned something"
 * would pass even if the retry never fired.
 */
console.log('\ngeneration retries');

// Trimmed, because the generator trims what the model returns and an untrimmed
// fixture makes every identity assertion here fail for a reason that is not the
// thing under test.
const GOOD = ('The service exposes a CLI. ' + 'It reads configuration from src/config.py and writes to a local cache. '.repeat(9)).trim();
const REPO = { id: 1, name: 'fixture', description: 'a fixture', language: 'Python', html_url: 'https://example.invalid/f', topics: [], stargazers_count: 0 };

function reply(body) {
  return { ok: true, status: 200, json: async () => body };
}
function completion(content, finish_reason) {
  return reply({ choices: [{ message: { content }, finish_reason }] });
}

// Each entry is consumed by one call, in order. A function is thrown instead.
function runWith(script) {
  const seen = [];
  global.fetch = async (url, opts) => {
    const model = JSON.parse(opts.body).model;
    seen.push(model);
    const next = script[seen.length - 1];
    if (typeof next === 'function') throw next();
    if (!next) throw new Error('stub ran out of scripted replies');
    return next;
  };
  // Required fresh each time: the rotation index and the rate-limit map are
  // module state, and a case that marked a model dead would leak into the next.
  for (const k of Object.keys(require.cache)) {
    if (/lib-(article|config)\.js$/.test(k)) delete require.cache[k];
  }
  const { generateBlogArticle } = require('../src/lib/lib-article.js');
  return generateBlogArticle(REPO, 'A readme.', ['src/main.py'], null).then(a => ({ article: a, seen }));
}

const timeout = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; return e; };

(async () => {
  let r;

  r = await runWith([completion(GOOD, 'stop')]);
  check('a clean article is returned on the first try', r.article === GOOD);
  check('a clean article costs one call', r.seen.length === 1, r.seen.join(','));

  r = await runWith([completion('The briefing begins and then stops mid', 'length'), completion(GOOD, 'stop')]);
  check('finish_reason=length retries', r.seen.length === 2, r.seen.join(','));
  check('finish_reason=length returns the retry result', r.article === GOOD);

  r = await runWith([timeout, completion(GOOD, 'stop')]);
  check('a timeout retries the next model', r.seen.length === 2, r.seen.join(','));
  check('a timeout returns the retry result', r.article === GOOD);

  // Ends cleanly, so this isolates the length floor from the truncation check.
  r = await runWith([completion('Too short to be a briefing.', 'stop'), completion(GOOD, 'stop')]);
  check('an article under the floor retries', r.seen.length === 2, r.seen.join(','));
  check('an article under the floor returns the retry result', r.article === GOOD);

  // finish_reason says stop, but the text plainly is not finished.
  r = await runWith([completion(GOOD.slice(0, 900) + ' the tracker resides in `src/tracker', 'stop'),
                     completion(GOOD, 'stop')]);
  check('a mid-sentence ending retries even when finish_reason is stop',
    r.seen.length === 2 && r.article === GOOD, r.seen.join(','));

  r = await runWith([completion('', 'stop'), completion(GOOD, 'stop')]);
  check('an empty article retries', r.seen.length === 2, r.seen.join(','));

  const netFail = () => new TypeError('fetch failed');
  r = await runWith([netFail, completion(GOOD, 'stop')]);
  check('a network failure retries', r.seen.length === 2 && r.article === GOOD, r.seen.join(','));

  /*
   * A bug in our own code must not be retried into silence. This is the shape of
   * the fault that shipped twice: a name that was not imported, reached only on
   * the branch that runs when a model misbehaves.
   */
  const bug = () => new ReferenceError('EMBED_MODEL is not defined');
  r = await runWith([bug, completion(GOOD, 'stop')]);
  check('a ReferenceError is not retried away', r.seen.length === 1 && r.article === null,
    r.seen.join(',') + ' -> ' + JSON.stringify(r.article));

  // The bound. Three models, three attempts, then null rather than recursion.
  r = await runWith([timeout, timeout, timeout]);
  check('the retry stops after one pass over the rotation', r.seen.length === 3, r.seen.join(','));
  check('exhausting the rotation returns null, not boilerplate', r.article === null,
    JSON.stringify(r.article));
  check('each attempt used a different model', new Set(r.seen).size === 3, r.seen.join(','));

  /*
   * The wall clock. Retrying a timeout costs up to 240s a go, and the workflow
   * runs on a 2-hour cron with cancel-in-progress: a run that crosses the
   * boundary is killed by its successor and commits nothing, which was
   * happening to 8 of every 20 runs. So the retry has to be bounded in time as
   * well as in attempts - past the budget, a thin article that lands beats a
   * better one that never gets written.
   *
   * Exercised at zero rather than by waiting, which is why zero means spent.
   */
  console.log('\nretry budget');
  process.env.LLM_RETRY_BUDGET_MS = '0';
  r = await runWith([timeout, completion(GOOD, 'stop')]);
  check('a spent budget stops the retry', r.seen.length === 1, r.seen.join(','));
  check('a spent budget keeps what it has rather than looping', r.article === null,
    JSON.stringify(r.article));

  // A typo in the workflow must not silently buy an unlimited budget: parseInt
  // gives NaN, and every comparison against NaN is false, so a naive check would
  // have read as "never spent".
  process.env.LLM_RETRY_BUDGET_MS = 'twenty minutes';
  r = await runWith([timeout, completion(GOOD, 'stop')]);
  check('an unparseable budget is treated as spent, not as unlimited',
    r.seen.length === 1 && r.article === null, r.seen.join(','));

  delete process.env.LLM_RETRY_BUDGET_MS;
  r = await runWith([timeout, completion(GOOD, 'stop')]);
  check('the default budget leaves the retry alone', r.seen.length === 2 && r.article === GOOD,
    r.seen.join(','));

  console.log(fail
    ? `\n  ${fail} failures`
    : `\n  quality gates hold (floor ${MIN_ARTICLE_CHARS} chars, rotation bounded at 3)`);
  process.exit(fail ? 1 : 0);
})();
