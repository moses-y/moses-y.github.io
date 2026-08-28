# Articles as technical papers

Goal: the ~1,440 generated briefings in `blog/` should read like arXiv papers,
not blog posts.

## The headline

**Most of the paper is buildable with zero model calls and no ARTICLE_VERSION
bump.**

The expensive assumption would be that "make them papers" means "rewrite the
prompt", which bumps ARTICLE_VERSION and regenerates all 1,440 articles - about
1,331 model calls draining at 10 per 2-hour run, roughly **12 days of cron**
(the cost is stated in lib-article-version.js:16-18).

But the structured parts of a paper - tables, figures, methods, limitations,
references, numbered claims - are all things the pipeline ALREADY MEASURED. They
do not need a model; they need rendering. Move them out of the prompt and into
deterministic rendering, and the paper skeleton lands on all 1,440 articles on
the next `generate-blog-pages.js` run, for free.

That also makes the result MORE correct, not less: a number the model retypes is
a number it can inflate. A number rendered from the fact bundle cannot be.

The model's job then shrinks to what it is actually good at - the abstract, the
interpretation, the bottom line - which is where a version bump finally earns
its 12 days.

## What exists already

More than expected. The scaffolding is largely built and partly unused:

  Numbered sections     LIVE. CSS counters, lib-blog-css-article.js:27-44.
                        h4 SUB-numbering (N.M) at :44 is live CSS WITH NO
                        PRODUCER - the prompt never asks for h4.
  Stable anchors        LIVE. lib-blog-toc.js:29-42, and its header comment
                        says explicitly they are for citation, not navigation.
  Numbered figures      LIVE but confined to the analysis block -
                        lib-blog-css-article.js:254-258, `Figure N` counters on
                        diagram-bearing blocks. Two per page.
  Table of contents     LIVE. lib-blog-toc.js:73-81, at >= 4 sections.
  Abstract              NOMINAL ONLY. The ".post-abstract" block
                        (generate-blog-pages.js:91) contains GitHub's one-line
                        description. It is labelled Abstract and is not one.
  Provenance vocabulary EXISTS, UNUSED IN ARTICLES. EXTRACTED vs INFERRED is
                        defined, tested (test-relations.js:226-243), and
                        `grep -rl EXTRACTED blog/` returns NOTHING.
  Methods / limitations PARTIAL, as boilerplate. lib-blog-audit.js:117-122
                        already names its check set and states "No language
                        model is involved in this section".
  References            NONE. No citation mechanism anywhere in the article path.

Current article body is 403-1,250 words across seven fixed sections, with zero
tables and zero inline citations in the prose. All tables and figures sit in the
deterministic sections BELOW the article and are never referenced by it.

## Supported by the facts - no speculation needed

Each of these is already in the fact bundle or on disk:

  Real abstract         4-6 sentences from the bundle: what it does, how it is
                        wired, measured scale, health verdict.
  Methods section       Deterministic. The pipeline knows exactly which analyses
                        ran for a given repo (inputsFor, lib-article-version.js:80-86).
                        GENERATE this - the model must not describe the pipeline.
  Limitations section   Deterministic. The honest limits are already enumerated
                        in lib-flow.js:17-23 and lib-facts.js:240-242,326 -
                        name-collapsed call edges, invisible framework callbacks,
                        effects attributed to wrappers, the 200-file cap.
                        Emit the ones that apply per repo.
  Tables                Hubs (Ca/Ce/instability), fan-in, entry points with
                        file:line, file responsibilities, stale deps, findings.
                        All already tabular in the bundle and currently flattened
                        into paragraphs. lib-markdown.js already renders pipe
                        tables and .post-content table is already styled.
  Numbered claims       Every audit finding already carries
                        {severity, title, where, evidence, why, fix, rank}.
                        These are claim-shaped already. Number them C1, C2 and
                        have prose cite them.
  References            Zero model involvement. Upstream repo URL, parent fork,
                        data/kin/<id>.json neighbours WITH their EXTRACTED
                        shared-dependency evidence, data/osv.json advisory ids,
                        registry entries backing the stale-dep claims.
                        Highest value per unit of effort in this document.
  Provenance labels     Label per section: import graph / symbols / audit / deps
                        = EXTRACTED; the model's framing = INFERRED.

## Requires speculation - do NOT add

These would violate the constraint at lib-article.js:92 ("Never invent an edge,
a path or an effect that is not in those blocks"). The constraint is the point
of the whole project; a paper format that breaks it is worse than a blog that
does not.

  Related work          Nothing in the bundle knows what other projects do. The
                        semantic edges in relations.json are explicitly INFERRED
                        and are not in the prompt.
  Benchmarks / results   No runtime data exists. The pipeline is entirely static.
                        Any throughput, latency or complexity claim is fabricated.
  Contributions/novelty  Most of the estate is FORKS OF OTHER PEOPLE'S CODE.
                        "We contribute" is false on its face.
  Experimental setup     No experiments run.
  Causal history         No commit or issue data in the bundle. "The authors
                        chose X because Y" is unsupported.

## The one gap worth closing first

**lib-facts.js:71 throws away file and line for every symbol.**

`data/symbols/<id>.json` stores `{n, k, f, l}` per symbol - name, kind, FILE and
LINE. `symbolsFor` keeps only `s.n`. So the model is shown `parseConfig` with no
idea which file it lives in, and the single largest block of facts in the bundle
is uncitable. Entry points are the lone exception (lib-facts.js:224 prints
`file:line`).

Asking for `src/foo.py:42`-style citations today would force the model to guess.
Retaining `f` and `l` - and attaching files to call-graph edges, which also carry
none - is a small change that converts the largest fact block from uncitable to
citable. It is the prerequisite for paper-grade claims, and it should land before
any prompt work.

## Sequencing

  A1  Enrich the bundle           lib-facts.js:71 keep f/l. Consider adding the
                                  8-axis grades (data/grades.json) and OSV
                                  advisory ids - both already computed, both
                                  exactly the sourced evidence a paper needs.
  A2  Deterministic rendering     Tables, figures, methods, limitations,
      NO MODEL CALLS              references, claim numbering into
                                  lib-blog-analysis.js or a new module.
                                  >>> Lands on all 1,440 articles on the next
                                  >>> generate-blog-pages.js run. No version bump.
  A3  Raise LLM_MAX_TOKENS        lib-config.js:67 is 4096 and ALREADY truncated
      BEFORE any bump             66 articles at the current length. A
                                  1,500-2,500 word target needs ~8-12k.
                                  Skipping this reproduces that incident at scale.
  A4  Structural quality gates    test-quality.js has NO structural assertion
                                  today. Add: required sections present and
                                  ordered, abstract length bounds, every numbered
                                  claim resolving to a real finding id.
                                  Update lib-quality.js:30-32 in the SAME commit -
                                  two of its reasoning-leak regexes hard-code the
                                  current prompt's scaffold ("2-3 short
                                  paragraphs", "under NNN words") and will either
                                  stop catching leaks or start rejecting good text.
  A5  Pilot                       data/article-rewrite.json is built for exactly
                                  this - request 20-30 repos across languages and
                                  sizes by name or id, advisory, never rewritten.
  A6  Bump ARTICLE_VERSION to 3   Only now. ~1,331 calls, ~12 days of cron.
                                  It is staged by design and versionReport()
                                  prints ready-vs-waiting so the backlog reads as
                                  a bump rather than a surge.

A1 + A2 are the bulk of the visible change and cost no model calls. A6 is the
expensive irreversible one and must not be triggered as a side effect of editing
a prompt.
