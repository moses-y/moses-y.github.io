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

/*
 * Was the briefing cut off mid-thought?
 *
 * 67 of 1,350 stored summaries (5.0%) end without finishing a sentence: sift-kg
 * stops on the bare word "Extraction", openwolf on "the tracker resides in
 * `src/tracker", llama.cpp on "cross-platform LLM inference runtime with
 * first-". It spans every length, including 4,746 characters, so it is not a
 * matter of the model having little to say.
 *
 * The cause was max_tokens sitting exactly on the length the prompt asks for
 * (2,000 tokens against "under 550 words"), with nothing reading finish_reason to
 * notice the guillotine. The generator now checks that field, which stops new
 * ones; this predicate is what finds the ones already stored, and is the belt to
 * that braces for a provider that reports finish_reason wrongly.
 *
 * The test is the last character rather than anything cleverer, because that is
 * what the failure actually looks like. Prose, a table row, a closing fence and a
 * bolded label all end on punctuation; a guillotined sentence ends on a letter.
 */
const ENDS_CLEANLY = /[.!?:;)\]}"'”’`|*]$/;

function looksTruncated(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (!t) return false;
  // A closing fence terminates a code block without being punctuation.
  if (/```$/.test(t)) return false;
  return !ENDS_CLEANLY.test(t);
}

/*
 * Below this an article is not a briefing whatever the reason. Kept here so the
 * generator and the staleness gate cannot disagree about it, which they did: the
 * generator dropped anything under 400 characters silently, so two repos in one
 * run showed "fallback" in the log with no line saying why.
 */
const MIN_ARTICLE_CHARS = 400;

/*
 * Does this stored article need replacing regardless of its prompt version?
 *
 * Moved here from update-forks.js, where it sat above the orchestration it has
 * nothing to do with: it is the third of the three publish-fitness gates, and
 * keeping them together is what stops one of them being taught about a fault the
 * others do not know about.
 *
 * This is the brokenness gate, separate from the staleness gate in
 * lib-article-version.js, and the distinction matters: 65 of the 66 truncated
 * articles are stamped at the current ARTICLE_VERSION, so articleIsCurrent
 * returns true for them and a version bump would never reach them. Broken text
 * has to be caught here or it stays on the site permanently.
 */
const BAD_PHRASES = [
  // The fallback summary, which says nothing about the repository.
  'demonstrates thoughtful software design',
  'caught my attention for its practical approach',
  'Worth investigating if you\'re working with',
  'patterns and implementations that could accelerate',
  // Hype the prompt forbids, regenerated when a model produces it anyway.
  'In the rapidly evolving',
  'In the world of',
  'In today\'s landscape',
  'is paramount',
  'aims to streamline',
  'comprehensive solution',
  'It\'s worth noting',
  'leveraging the power',
  'game-changer',
  'cutting-edge'
];

function isFallbackArticle(article) {
  if (!article || article.length < MIN_ARTICLE_CHARS) return true;
  // Cut off mid-sentence. 66 of 1,350 were, spanning every length up to 4,746
  // characters, so this is not covered by the length floor above.
  if (looksTruncated(article)) return true;
  const lower = article.toLowerCase();
  return BAD_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()));
}

module.exports = { looksLikeReasoning, REASONING_TELLS, looksTruncated,
  MIN_ARTICLE_CHARS, isFallbackArticle, BAD_PHRASES };
