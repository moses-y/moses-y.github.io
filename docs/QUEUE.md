# Work queue

One ordered backlog. Supersedes the sequencing sections in RESTRUCTURE.md and
DATA-ARCHITECTURE.md, which stay as the detailed reference for each item.

Two tracks run in parallel because they barely touch the same files:

  Track A  the tree and the data layer   (src/, data/, workflow, hooks)
  Track B  the articles                  (the prompt, the fact bundle, blog/)

Track B's design work needs no code and blocks on nothing, so it can start
immediately and proceed while Track A moves files underneath it.

---

## Wave 0 - DONE 2026-08-29

  [x] Five fail-open sites hardened: lib-article-version.js swallow,
      build-stats.js zero-suite scan, test-imports.js non-recursive walk,
      pre-commit empty glob, CI path filter
  [x] scripts/lib-net.js - bounded concurrency + retry with backoff
  [x] Concurrency applied: update-forks (8-wide + updated_at gate),
      build-hygiene prefetch (6), build-osv (8), build-deps (6, sleeps dropped)
  [x] Two O(n^2) fixes in build-hygiene: ordered.includes, sizeOf scan
  [x] UMAP seeded - verified byte-identical across runs

Not committed yet. 10 modified, 3 new.

---

## Wave 1 - slim the repo before moving it   (Track A, ~1 day)

Rationale for going first: every one of these SHRINKS the tree or QUIETS the
churn. Doing them before the file move means the move's diff is legible instead
of buried under 4,500 lines of noise per run. Moving first and slimming second
would mean reviewing the restructure against a repo that rewrites itself every
two hours.

  [ ] 1.1  Delete forks.db and scripts/build-db.js        (D1)
           20.8 MB binary, zero consumers. Remove from workflow lines 62/121/139,
           fix the two stale comments (site.js:291, site/02-stats.js:51) and
           docs/architecture/12-publishing.md:35,57,169
  [ ] 1.2  Sort forks by id, not updatedAt                (D3)
           update-forks.js:345. Client sorts at read time.
  [ ] 1.3  search.json emits ids, not array positions     (D3)
           build-index.js:158-165 - decouples the index from sort order
  [ ] 1.4  scripts/lib-json.js writeStable()              (D4)
           sorted keys, indent, skip-write-if-unchanged with the timestamp
           masked. Roll across all 15 write sites.
  [ ] 1.5  Move `generated` timestamps to a sidecar       (D4)
  [ ] 1.6  Resolve the stale trio                         (D8)
           registry.json, clusters.md, symbols-status.json - wire in or delete
  [ ] 1.7  Decide: is data/symbols/ (184 MB) published or state?  (D6)

Checkpoint: one CI run should now produce a diff of tens of lines, not
thousands. Do not start Wave 2 until that is true - it is the evidence Wave 1
worked.

## Wave 2 - the tree                        (Track A, ~1 day)

Approved. Full task list in RESTRUCTURE.md Stage 1; the safety-net work it
depended on is already done in Wave 0.

  [ ] 2.1  src/lib/ src/checks/ src/stages/ src/site/ + tests/
  [ ] 2.2  Bucket corrections: build-pages.js and build-bundles.js to src/site/;
           lib-article*.js to src/lib/ (NOT src/site/ - they are generation
           libraries, not renderers)
  [ ] 2.3  DECIDE the generate-* rule (RESTRUCTURE 1.8) and where update-forks.js,
           measure-runtime-checks.js and sync-forks.sh live (1.9)
  [ ] 2.4  Rewrite require() paths and every __dirname/'..' ROOT
  [ ] 2.5  Rewrite the string references: workflow, hooks, skills, README,
           docs/architecture. Watch loop.mjs:218 - it CONSTRUCTS 'scripts/'+s
  [ ] 2.6  CAREFUL: build-bundles.js:71 writes its own path into the generated
           bundle header and --check string-compares it. Same for
           lib-cluster-report.js:170, which test-relations.js asserts on.
  [ ] 2.7  package.json metadata + scripts; Makefile as the entry point
  [ ] 2.8  Delete root images/ - 3.3 MB, zero references
  [ ] 2.9  Normalise the URL convention: generated pages use /assets/...,
           authored pages use assets/..., and site.js disagrees with itself
           (:457,461,826 absolute vs :845 relative)

## Wave 3 - the client                      (Track A, ~1 day)

  [ ] 3.1  Shard report.html's two big fetches            (D5)
           data/findings/<id>.json + data/grade/<id>.json. 534 KB -> ~15 KB/view
  [ ] 3.2  Hashed index + manifest.json for caching       (D6/R6)
  [ ] 3.3  Delete the 7.42 MB forks.json fallback paths
           index-record.js:95, site.js:845

## Wave 4 - structural                      (Track A, 2-3 days)

  [ ] 4.1  STATE / PUBLISHED split                        (D9)
           .state/repos/<id>.json for the accumulator; data/ and structure/
           become pure derivations. Needs Waves 1-3 first so the churn is quiet
           enough to verify the split worked.
  [ ] 4.2  Schema registry across every published artifact (D7)
           plus the test that cannot currently fail: every file under data/ has
           a registry entry and vice versa
  [ ] 4.3  build-structure.js: execFileSync('gh') -> fetch + token, 8-wide
           (perf Rank 3, deferred from Wave 0 - changes the auth path and drops
           gh's 24h cache, so it is a decision not a mechanical fix)

---

# Track B - articles as technical papers

Standing goal, not a one-off: the generated briefings should read like arXiv
papers rather than blog posts. See docs/ARTICLES.md once the audit lands.

The reason this fits rather than fights the pipeline: Glossa already holds a
paper's evidentiary standard. A model writes prose and never a number; the
prompt already forbids naming an edge, path or effect absent from the extracted
facts; provenance is already tagged EXTRACTED vs INFERRED per fact. The format
is the only part still shaped like a blog.

  [x] B.1  Audit the generation path and fact bundle - DONE, see ARTICLES.md
  [ ] B.2  lib-facts.js:71 - keep symbol file+line (they are stored and thrown
           away). Prerequisite for any citable claim. Consider adding the 8-axis
           grades and OSV ids to the bundle - both already computed.
  [ ] B.3  DETERMINISTIC RENDERING, NO MODEL CALLS. Tables, figures, methods,
           limitations, references, numbered claims. Lands on all 1,440 articles
           on the next generate-blog-pages.js run with NO version bump.
           This is the bulk of the visible change.
  [ ] B.4  Raise LLM_MAX_TOKENS (lib-config.js:67, currently 4096 and already
           the cause of 66 truncated articles) BEFORE any prose work
  [ ] B.5  Structural quality gates in test-quality.js - none exist today.
           Update lib-quality.js:30-32 in the SAME commit: two reasoning-leak
           regexes hard-code the current prompt scaffold.
  [ ] B.6  Pilot 20-30 repos via data/article-rewrite.json, built for this
  [ ] B.7  Bump ARTICLE_VERSION to 3. ~1,331 calls, ~12 days of cron.
           EXPENSIVE AND IRREVERSIBLE - never as a side effect of a prompt edit.

Track B ordering note: B.2 and B.3 deliver the paper skeleton across the whole
estate for zero model cost. Only B.7 spends the 12 days, and only for prose.
