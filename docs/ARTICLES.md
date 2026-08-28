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

---

# Grounded assessment, and how it is checked

## A correction

An earlier draft of this document argued against letting the model assess
architecture at all, on the grounds that it would violate lib-article.js:92.
That was wrong, and the prompt already contradicts it. lib-article.js:110 asks
for "The Bottom Line - your honest take in 2-3 sentences", :116 asks for "a
measured, honest assessment", and :105 permits SDLC observations beyond the
measured block "but only where the file structure is evidence for them".

The constraint at :92 forbids inventing a FACT - an edge, a path, an effect.
It has never forbidden INTERPRETING facts. The real line is not fact versus
judgement. It is CITED versus UNCITED.

## Make citation mechanical

The reason groundedness cannot be checked today is that the facts have no ids.
Give every fact in the bundle a stable id at assembly time:

  F<n>  audit / deep finding      M<n>  hub module
  E<n>  entry point               P<n>  traced path
  S<n>  symbol                    D<n>  dependency
  Q<n>  percentile vs the estate

Require prose to cite them. Then "is this grounded?" becomes a set operation:
every cited id resolves, and every number quoted matches the value at that id.
That belongs in test-quality.js and costs no model calls on 1,440 articles.

Most of the judging does not need a model. Mechanise first; spend calls only on
what is left.

## Where a judge earns its place

What survives mechanisation is: does the INTERPRETATION follow from the cited
fact? "47 cycles [M4], so the module boundaries were never enforced" - the
number is checkable, the inference is not.

Design against the known failure modes:

  Self-preference   Models favour their own family's output. update-forks
                    already rotates 3 models (lib-config.js:41) - judge with a
                    DIFFERENT one than wrote the article. Free.
  Verbosity/assent  An open "rate 1-10" collects inflated agreement. Ask a
                    CLOSED question per claim: does this follow from the cited
                    fact - yes / no / overreaches? Overreach is the failure mode
                    that matters and it is nameable.
  Blind judging     Give the judge the FACT BUNDLE, not just the article.
                    Otherwise it is a second opinion on prose style.
  Cost              Judge only new or changed articles, on the cheap model.
                    Route failures into the retry path that already exists
                    (lib-article.js:43) with the objection appended - a
                    groundedness failure has the same shape as a truncation.

## The bundle is context, so engineer it as context

lib-facts.js currently assembles prose blocks meant to be read. If this is the
model's context, it should be structured for one: stable ids, a consistent
schema per evidence class, and the EXTRACTED / INFERRED tag inline.

That tagging also resolves the assessment question honestly. A grounded
assessment is safe the moment it is LABELLED INFERRED beside EXTRACTED evidence,
because the reader can see which is which. That is better than banning it.

The vocabulary already exists, is tested (test-relations.js:226-243), and
appears in zero articles.

  [ ] Assign ids at bundle assembly (lib-facts.js)
  [ ] Require citations in the prompt; render them as anchors to the evidence
  [ ] Mechanical citation resolver in test-quality.js - ids resolve, numbers match
  [ ] Judge pass for interpretation only, different model family, closed question
  [ ] EXTRACTED / INFERRED labelling per section

---

# Three ideas the facts already support

Not format changes. These are things the pipeline has measured all along and
never said out loud. All three render deterministically, so they land on all
1,440 articles with no ARTICLE_VERSION bump.

## I. Complexity as located functions, never as a score

Cyclomatic complexity is computable from the tree-sitter walk that already runs
in build-symbols.js - counting decision points per function is the same pass,
at near-zero marginal cost, and it is an EXTRACTED fact.

But CC is the most-cited and least-reliable metric in static analysis. A
30-branch switch scores terribly and reads fine; a 9-branch nested conditional
with three escapes scores fine and is where the bugs live. Publishing
"Maintainability Index: 62" about someone else's repository would be exactly
the confident-but-hollow number this project exists to avoid.

So: adopt it, and never as a repository-level score.

  DO    "The five functions most likely to resist change" - ranked, each with
        file:line and its actual branch count. A reader clicks and checks it in
        ten seconds.
  DONT  A single aggregate number, a grade, or a maintainability index. A
        reader can only believe or disbelieve those.

Same measurement, opposite epistemics. Depends on B.2 (symbol file/line), which
has landed.

## II. Percentiles against the estate

1,440 repositories measured by identical checks is a corpus, and almost nobody
generating repository documentation has one.

  "47 import cycles"  - a number a reader cannot place.
  "47 cycles - 94th percentile across 1,440 measured repositories,
   where the median is 3"  - the same measurement, made meaningful.

Still EXTRACTED. No model judgement, no speculation: a rank against a
distribution already computed. One pass over data on disk.

The honest caveat, stated once in Methods rather than per claim: the corpus is
what was forked, not a random sample of software, so it is the 94th percentile
OF THIS ESTATE. That is a limitation, not a disqualifier, and saying it is
cheaper than pretending the corpus is universal.

Cheapest high-value idea in this document.

## III. Open with the reading order, not the problem

Every article currently opens with "The Problem". For a developer landing cold
the first question is not what problem this solves - it is WHERE DO I START
READING.

The bundle already answers that and never says it: entry points with file:line
and reach counts, fan-in ranked, traced paths from entry to sink.

  "Start at src/cli.py:42 - it reaches 88% of the codebase. The three functions
   everything calls are parseConfig (src/config.py:19), loadPlugins
   (src/plugins.py:64) and emit (src/io.py:12)."

Derived, not guessed, and probably the most useful 60 seconds on the page. This
is the "repo intro" the format has been missing.

## Rejected, and why

An LLM-written architecture verdict as a SEPARATE section. Not because the
model may not assess - see the correction above, it already does and should -
but because a standalone verdict floats free of the evidence. Interpretation
belongs next to the fact it interprets, carrying its citation and its INFERRED
label. A section called "Assessment" is where uncited claims go to hide.
