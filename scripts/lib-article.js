/*
 * lib-article.js - the prompt, and the call that turns it into an article.
 *
 * Extracted from update-forks.js at the 450-line limit, and the seam worth having
 * most: the prompt is the thing that decides whether an article is any good, so it
 * should be editable without touching the pipeline that schedules it, and it
 * should be findable without scrolling past a thousand lines of orchestration.
 *
 * Everything measured about the repository reaches the model through factsFor,
 * which is deterministic and separately tested. This file decides what to ask for
 * and what to forbid.
 */
'use strict';
const { CONFIG, LLM_API_KEY, LLM_TIMEOUT_MS, modelRateLimits, getNextModel } = require('./lib-config.js');
const { factsFor } = require('./lib-facts.js');
const { formatKnowledgeGraph } = require('./lib-knowledge-graph.js');
const { isCollection } = require('./lib-subprojects.js');
// The fallback path needs it, and the fallback path is the one that runs when a
// model times out - so a missing import here fails only in the situation the code
// exists to handle. It failed exactly that way in CI.
const { generateFallbackSummary } = require('./lib-github.js');
const { looksTruncated, MIN_ARTICLE_CHARS } = require('./lib-quality.js');

/*
 * `attempt` bounds the retry recursion. The rate-limit path could recurse freely
 * because it marks the model dead first, so getNextModel eventually starves. The
 * faults added here - a timeout, a truncated response - are transient and say
 * nothing bad about the model, so marking it would be wrong and the recursion
 * needs its own bound: one pass over the rotation.
 */
async function generateBlogArticle(repo, readme, fileTree, knowledgeGraph, attempt = 0) {
  if (!LLM_API_KEY) {
    return generateFallbackSummary(repo);
  }

  const model = getNextModel();
  if (!model) {
    console.log(`  All models rate limited`);
    return null;
  }

  const retry = (why) => {
    if (attempt + 1 >= CONFIG.models.available.length) {
      console.log(`  ${why}; every model in the rotation has been tried, giving up on ${repo.name}`);
      return null;
    }
    console.log(`  ${why}; trying the next model`);
    return generateBlogArticle(repo, readme, fileTree, knowledgeGraph, attempt + 1);
  };

  try {
    const graphContext = knowledgeGraph ? formatKnowledgeGraph(knowledgeGraph) : '', measured = factsFor(repo, knowledgeGraph);
    const context = `
REPOSITORY: ${repo.name}
CLONE URL: ${repo.html_url || ''} (use this verbatim in any clone command)
DESCRIPTION: ${repo.description || 'No description'}
PRIMARY LANGUAGE: ${repo.language || 'Not specified'}
TOPICS/TAGS: ${(repo.topics || []).join(', ') || 'None'}
STARS: ${repo.stargazers_count || 0}
${repo.parent ? `FORKED FROM: ${repo.parent.name} (${repo.parent.stars} stars)` : 'ORIGINAL PROJECT'}

${graphContext ? `PROJECT ANALYSIS:\n${graphContext}\n` : ''}${measured ? `\nMEASURED ANALYSIS - deterministic, produced by this pipeline's static analysis. These are facts, not guesses. Use them; do not contradict or pad them:\n${measured}\n` : ''}
FILE STRUCTURE:
${(() => { const cap = (knowledgeGraph && knowledgeGraph.isCollection) ? 60 : CONFIG.maxFiles; if (!fileTree.length) return 'Not available'; return fileTree.slice(0, cap).join('\n') + (fileTree.length > cap ? `\n... and ${fileTree.length - cap} more files not listed here` : ''); })()}

README EXCERPT:
${readme || 'No README available'}
`.trim();

    const prompt = `You're a senior AI engineer writing a concise, professional technical briefing about this repo - the kind a consultant would share with a technical client.

${context}

FORMAT (use markdown):
## The Problem
One paragraph about the specific pain point this solves. Be concrete.

## What This Does
2-3 short paragraphs. Reference actual files/folders from the structure. Use \`inline code\` for file names and functions.

## How It Is Wired
The section a technical reader comes for: how control actually flows, not how files are filed. Use the INTERNAL CALL GRAPH, ENTRY POINTS, WHAT THIS CODE TOUCHES OUTSIDE ITSELF and WHAT EACH FILE IS RESPONSIBLE FOR blocks where they are present. Start where execution starts, naming the real entry point and file, then follow it to the work: the traced paths give you entry -> function -> the call that leaves the process, so say what a run actually does to the database, the network or the filesystem, and how few hops it takes to get there. Name the functions everything routes through, say what depends on them, and say which carry the widest blast radius and why, with the real counts. Give the reader a file-by-file map from the responsibility block rather than a directory listing, and say which file owns each effect. Where the module graph shows a hub or a cycle, explain what that costs someone trying to change it. Never invent an edge, a path or an effect that is not in those blocks; where one is absent, say the wiring has not been mapped for this repository yet.

## How To Use It
Concrete steps to get this running, grounded in files that actually exist in the structure above. Where the evidence supports it, cover:
- **Setup**: the real install or build command, inferred from the dependency and config files present (\`package.json\` implies npm/pnpm, \`pyproject.toml\` implies pip or uv, \`Dockerfile\` implies a container build, \`Makefile\` implies make targets).
- **Configuration**: required environment variables, keys, or config files, naming the actual file where they belong.
- **Running it**: the entry point to invoke and how, referencing the real file (a CLI script, \`main.py\`, a server start command, an exported function).
Use a fenced code block for commands. If the README documents the commands, use those verbatim rather than guessing. If the repo gives no evidence for a step, say what is missing instead of inventing a plausible command.

## Real-World Use
A practical scenario showing where this fits in a working system. A short code snippet or example workflow.

## Code Health & Issues
If a MEASURED ANALYSIS block is present, this section reports it. Lead with what it found, quoting the real counts and the real file paths, and say plainly that it comes from static analysis rather than opinion. Do not add invented issues alongside it, do not soften or inflate its numbers, and do not repeat the same finding kind more than once - it is already grouped with a count.
Beyond the measured findings you may add SDLC observations the block does not cover, but only where the file structure is evidence for them: missing tests or CI, absent licence, configuration or secrets committed, missing docs.
Format each as a short bullet: \`Severity (High/Med/Low) - the issue - where\`. With no measured block, say that deep analysis has not run for this repo yet and keep this section to what the structure genuinely supports.
If the analysis found nothing, say so and name the axes it checked.

## The Bottom Line
Your honest take in 2-3 sentences. What's good, what's not, who should use it.

---

STYLE RULES:
- Short paragraphs (2-4 sentences max), \`code formatting\` for technical terms, and specific evidence: "the config.yaml handles..." not "it provides configuration..."
- Write for an engineer who will change this code, and give a measured, honest assessment: a clear trade-off is welcome, sarcasm is not.

NEVER USE:
- Buzzword filler: "rapidly evolving", "paramount", "leverage", "streamline", "robust"
- Empty openers: "In the realm of...", "It's worth noting...", "This project aims to..."
- Hype: "comprehensive", "cutting-edge", "game-changer", "seamlessly", "foster"
- Jokes, snark, or a sarcastic tone - keep it credible and consultant-grade
- Starting multiple sentences with "This" or "The"

- Inventing setup commands, flags, or env var names with no evidence in the repo

Keep it under 550 words. Precision over volume.`;

    console.log(`  Using model: ${model}`);
    const response = await fetch(CONFIG.models.endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),   // a hung request stalled the whole run
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a senior AI engineer writing professional, credible technical briefings. You are direct and practical, cite specific code and files, and give measured, honest assessments. You avoid corporate jargon, AI-sounding fluff, hype, and sarcasm.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: CONFIG.models.maxTokens,
        temperature: CONFIG.models.temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  ${model} returned ${response.status}: ${errorText.slice(0, 80)}`);

      const transient = [429, 500, 502, 503, 504].includes(response.status);
      const unavailable = [404, 410].includes(response.status);

      if (transient || unavailable) {
        modelRateLimits[model] = true;
        console.log(unavailable
          ? `  Model ${model} is ${response.status === 410 ? 'retired' : 'not available on this account'} - update LLM_MODELS. Trying next...`
          : `  Model ${model} unavailable (${response.status}), trying next...`);
        // Bounded by the same counter as the transient retries. This path marks the
        // model dead first so it terminated on its own, but sharing one bound means
        // no future edit can reintroduce an unbounded recursion here.
        return generateBlogArticle(repo, readme, fileTree, knowledgeGraph, attempt + 1);
      }
      return null;
    }

    const data = await response.json();
    const choice = data.choices?.[0] || {};
    const article = choice.message?.content?.trim();
    const stopped = choice.finish_reason;

    /*
     * finish_reason is the field that would have caught 66 truncated briefings,
     * and nothing read it. The API says "length" when it hits max_tokens and the
     * response is a sentence cut in half; retrying is right, because the next
     * model may be terser or may not spend the budget on reasoning first.
     */
    if (stopped && stopped !== 'stop') {
      return retry(`${model} stopped early (finish_reason=${stopped}) after ${article ? article.length : 0} chars`);
    }
    if (!article) {
      return retry(`${model} returned an empty article`);
    }
    /*
     * The floor is tested before the shape, so the log names the more fundamental
     * fault: almost anything too short also ends mid-word, and reporting that as a
     * truncation buries the fact that there was barely any article at all.
     *
     * This used to be a bare `return null`, which is why two repos in one run
     * logged "fallback" with nothing above them saying what went wrong.
     */
    if (article.length < MIN_ARTICLE_CHARS) {
      return retry(`${model} returned only ${article.length} chars, under the ${MIN_ARTICLE_CHARS} floor`);
    }
    // Belt to that braces: some providers report "stop" on a response that plainly
    // is not finished, and the stored corpus is the evidence that this happens.
    if (looksTruncated(article)) {
      return retry(`${model} returned ${article.length} chars ending mid-sentence (${JSON.stringify(article.slice(-32))})`);
    }
    return article;
  } catch (error) {
    /*
     * A timeout landed here and returned null, so the one failure a retry fixes
     * most reliably was the only one that did not retry. In a real run all five
     * timeouts were the same model in a degraded window while another model in the
     * rotation answered every single time, one line away.
     */
    const msg = error.message || '';
    const transient = error.name === 'TimeoutError' ||
      /abort|timeout|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(msg);
    /*
     * A ReferenceError here is our bug, not the network's, and retrying it three
     * times and returning null would bury it in a fallback article. That is
     * exactly how two missing imports survived a split and only surfaced in CI
     * days later, on the branch that runs when a model times out. Code faults stay
     * loud even when their message happens to contain one of the words above.
     */
    const codeFault = error instanceof ReferenceError || error instanceof SyntaxError;
    if (transient && !codeFault) {
      const why = error.name === 'TimeoutError' || /abort|timeout/i.test(msg)
        ? `timed out after ${Math.round(LLM_TIMEOUT_MS / 1000)}s`
        : `could not be reached (${msg})`;
      return retry(`${model} ${why}`);
    }
    console.log(`AI generation failed for ${repo.name}:`, error.message);
    return null;
  }
}

module.exports = { generateBlogArticle };
