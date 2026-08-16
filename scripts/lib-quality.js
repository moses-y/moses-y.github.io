/*
 * lib-quality.js - does a generated briefing describe the repository, or the
 * task of writing about the repository?
 *
 * 110 of 1,297 stored summaries (8.5%) were the model's scratchpad rather than
 * its answer: the prompt echoed back, then deliberation about how to comply,
 * then the article. They average 7,839 characters against 3,220 for a clean
 * one, and they were published as briefings on a public site.
 *
 * These are single-hit tells on purpose. Every one of them is a phrase about
 * the writing task, not about code, so a briefing has no legitimate reason to
 * contain it. Validated against the full corpus: catches all 110, and the
 * hits outside the original sample were checked by hand and were also leaks.
 *
 * Used in two places, which is why it lives here:
 *   update-forks.js        rejects at generation, so the retry path runs again
 *   generate-blog-pages.js refuses to publish one that is already stored
 */
'use strict';

const REASONING_TELLS = [
  /\b(let me|i'?ll|i will) (write|draft|outline|start|produce|structure)\b/i,
  /\bunder \d{3} words\b/i,
  /\bwe need to (parse|produce|be careful|keep|avoid|mention)\b/i,
  /\bwe'?ll (phrase|say|mention|produce|write)\b/i,
  /\bthe (instructions?|prompt) (say|says|asks?|require)\b/i,
  /\bas an ai\b/i,
  /\bstyle rules\b/i,
  /\bneed to keep (it )?(under|within)\b/i,
  // The prompt's own section scaffold, echoed back verbatim.
  /One paragraph about the specific pain point/i,
  /\b2-3 short paragraphs\b/i
];

function looksLikeReasoning(text) {
  if (!text) return false;
  return REASONING_TELLS.some(re => re.test(text));
}

module.exports = { looksLikeReasoning, REASONING_TELLS };
