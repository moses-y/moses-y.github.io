/*
 * lib-net.js - bounded concurrency and retry for the pipeline's network stages.
 *
 * Every network stage in this pipeline was written as `await` inside a `for`,
 * which means one request at a time and a run whose wall clock is the sum of
 * ~3,500 round trips rather than the slowest of them. That is also why the
 * budget flags exist: --budget 80 does not mean 80 repositories get audited, it
 * means the stage runs until --max-seconds cuts it off somewhere short of 80,
 * and the backlog drains at whatever rate that leaves. Concurrency here is not
 * an optimisation, it is what makes the budgets mean what they say.
 *
 * Neither did anything retry. A single 502 from GitHub dropped a repository
 * from the run silently and it waited two hours for another attempt. Retrying
 * matters more once requests overlap, not less: concurrency is exactly what
 * raises 429 and secondary-limit exposure, so the two ship together.
 */
'use strict';

/*
 * Runs `fn` over `items` with at most `limit` in flight, and returns results in
 * INPUT order regardless of completion order - callers index the output against
 * the input array, so preserving order is part of the contract, not a nicety.
 *
 * A rejection from `fn` rejects the whole call. The stages here do not want
 * that (one unreachable repository must not end a run over 1,400), so they pass
 * functions that resolve to a sentinel instead. That decision stays with the
 * caller, which is where the knowledge of what a missing result means lives.
 */
async function mapLimit(items, limit, fn) {
  const list = Array.from(items);
  const out = new Array(list.length);
  const width = Math.max(1, Math.min(limit | 0 || 1, list.length));
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  }

  const workers = [];
  for (let i = 0; i < width; i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/*
 * Retries on the failures that are actually transient: a network throw, a 429,
 * and 5xx. A 404 is an answer - the repository is gone or private - and
 * retrying it three times just spends the rate limit to be told again.
 *
 * Retry-After is honoured when the server sends it, because GitHub's secondary
 * rate limiter does send it and ignoring it is how a run gets itself blocked
 * for longer than it would have waited.
 */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchRetry(url, options, opts) {
  const o = opts || {};
  const attempts = o.attempts || 3;
  const base = o.baseDelay || 500;
  let lastErr = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res = null;
    try {
      res = await fetch(url, options);
    } catch (e) {
      lastErr = e;
    }

    if (res && !RETRYABLE.has(res.status)) return res;
    if (attempt === attempts) return res;  // caller inspects status; null means it threw

    let wait = base * Math.pow(2, attempt - 1);
    if (res) {
      const ra = res.headers && res.headers.get && res.headers.get('retry-after');
      if (ra) {
        const secs = Number(ra);
        if (Number.isFinite(secs) && secs >= 0) wait = Math.min(secs * 1000, 60000);
      }
    }
    // Jitter: without it, a burst of concurrent workers that all hit the same
    // limit retry in lockstep and hit it again together.
    await sleep(wait + Math.floor(Math.random() * 250));
  }

  if (lastErr) throw lastErr;
  return null;
}

module.exports = { mapLimit, fetchRetry, sleep };
