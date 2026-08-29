# Restructure plan

Goal: separate the Glossa pipeline (source) from the published site (build output),
and give both a conventional layout. Staged so each step is independently revertable.

Status legend: [ ] todo  [~] in progress  [x] done  [?] blocked on a decision

## Stage 0 — groundwork (no file moves, zero risk)

- [ ] 0.1  Pull the 2 commits from origin/master; confirm tree still clean
- [ ] 0.2  `package.json`: add name, version, private, license, engines (node >=20)
- [ ] 0.3  `package.json`: add `scripts` for the 9 pipeline stages the README documents
           (census, briefing, structure, supply, hygiene, grade, meaning, publish)
           plus `test`, `build:bundles`, `build:banner`
- [ ] 0.4  Add a `Makefile` as the single entry point (IntelliChat convention):
           make build / make test / make serve / make stage-N
- [ ] 0.5  Update README's "Running it" section to the new commands

## Stage 1 — scripts/ into real directories

68 flat files using `lib-` / `checks-` / `build-` / `test-` as directories-in-disguise.
All 100% CommonJS, no `"type"` field, no npm scripts yet -> the move is a pure
relative-path rewrite. Preserve the exec bit on the shebang files.

### THE REAL RISK: five things keep exiting 0 while checking nothing.

A broken `require` throws loudly and is easy to fix. These do not:

  build-stats.js:88-96   readdirSync(__dirname) to find and RUN every test-*.js
                         sibling, to count assertions for stats.json. Tests move ->
                         finds zero suites -> publishes "assertions: 0". No error.
                         (This number is on the README front page.)
  test-grade.js:65-67    readdirSync(__dirname) for checks-*.js. From tests/ this
                         finds nothing and "every check id is graded" passes VACUOUSLY.
  test-imports.js:35     DIRS = ['scripts'] literal, and jsFiles() :98-110 is NON-
                         RECURSIVE. This is the exact regression-catcher that exists
                         BECAUSE a module split once broke imports. It would stop
                         seeing the libs.
  .githooks/pre-commit:75  `for t in scripts/test-*.js` — non-recursive. Loop runs
                         zero suites, hook passes.
  update-forks.yml:13    path filter 'scripts/*.js' — non-recursive glob. CI stops
                         triggering on library edits.

  Plus the single most dangerous edge:
  lib-article-version.js:69  requires lib-hygiene INSIDE a try, and the catch does
                         `hygVersion = 0`. A broken path does not throw — it silently
                         changes ARTICLE_VERSION, the value deciding whether ~1,300
                         articles get regenerated.

- [ ] 1.1  FIRST, before moving anything: fix the five silent passes above so they
           fail loudly. A move is only safe once the safety net actually catches.
- [ ] 1.2  Make test-imports.js jsFiles() recursive and DIRS point at src/ + tests/
- [ ] 1.3  Make build-stats.js and test-grade.js discover by explicit path, not
           __dirname sibling scan
- [ ] 1.4  Remove the swallow in lib-article-version.js:69 (or make it fail closed)

### Bucket corrections from the import graph

- [ ] 1.5  build-pages.js -> src/site/  (not a stage: only consumer of lib-site-*,
           writes marketing HTML, absent from the workflow)
- [ ] 1.6  build-bundles.js -> src/site/  (asset concatenator, invoked only by the hook)
- [ ] 1.7  lib-article.js + lib-article-version.js -> src/lib/ NOT src/site/. The
           `lib-article*` glob is wrong: they are generation-pipeline libs driven by
           update-forks.js, depending on six src/lib/ modules.
- [ ] 1.8  DECIDE generate-*: generate-rss.js and generate-blog-pages.js are pipeline
           stages that merely start with "generate" (both run in CI). Either they go
           to src/stages/ with build-db.js, or the bucket rule is "produces pages" and
           build-db.js is the odd one out. Pick one rule and state it.
- [ ] 1.9  Find a home for the unbucketed: update-forks.js (THE pipeline entry, 18 KB,
           11 lib requires), measure-runtime-checks.js (ops tool, not a test),
           sync-forks.sh
- [ ] 1.10 Judgement calls: lib-cluster-report.js (markdown renderer, presentation
           concern, but not lib-site-*), lib-markdown.js (in lib/, only consumer is site)

### Then the mechanical work

- [ ] 1.11 src/lib/ src/checks/ src/stages/ src/site/ tests/ — git mv, keep mode bits
- [ ] 1.12 Rewrite require() paths. Watch update-forks.js:37 (four requires on ONE line)
           and the lazy mid-function ones: build-stats.js:107, build-pages.js:250,
           test-quality.js:116, measure-runtime-checks.js:86
- [ ] 1.13 Every `path.join(__dirname,'..')` ROOT becomes '..','..' —
           build-analyze:27 build-banner:24 build-deepgraph:28 build-grade:23
           build-pages:13 build-relations:32 build-stats:12 build-structure:19
           test-classify:143,174 test-grade:189,217 test-relations:25
- [ ] 1.14 test-globals.js:316,318 hardcode the 'scripts' prefix
- [ ] 1.15 External callers: update-forks.yml (15 invocations + the :13 filter),
           sync-forks.yml:34, .githooks/pre-commit:62,63,65,74,75,90,92,93,
           .claude/skills/run-moses-y-github-io/SKILL.md:162-165,180 and loop.mjs:218
           (CONSTRUCTED path 'scripts/'+s+'.js' — grep for the script name misses it)
- [ ] 1.16 README:109-117,131,137,150 and docs/architecture/*.md "Sources:" manifests
- [ ] 1.17 CAREFUL: build-bundles.js:71 writes "Built by src/site/build-bundles.js"
           INTO the generated bundle header, and --check string-compares against disk.
           Changing that string makes all three bundles report STALE and fails the
           hook. Same for lib-cluster-report.js:170, asserted on by test-relations.js.
- [ ] 1.18 Run the suites — but only after 1.1-1.4, or they prove nothing

## Stage 2 — site sources out of the repo root   [MOSTLY CANCELLED — see finding]

### FINDING: 8 of the 13 root .html files are GENERATED AT ROOT. They cannot move.

  build-pages.js:399-400   services.html, case-studies.html
  build-pages.js:396       the 5 consulting pages, slugs declared in lib-site-content.js
  build-index.js:393       sitemap.html
  build-bundles.js:59      index.html  (file itself says "GENERATED FILE - do not edit")

Moving them is meaningless: the next pipeline run recreates them at root.
To relocate these you would move the GENERATOR'S OUTPUT PATH, which is Stage 3's
served-layout question, not a source-tree question.

Only 5 root pages are hand-authored:
  projects.html, report.html, code-brain.html, knowledge-graph.html, callback.html

### And moving even those 5 is a trap.

Their shared JS uses PAGE-RELATIVE fetch(), so the page's depth — not the script's —
resolves the data URL:
  code-brain.js:27   fetch('structure/reports.json')
  graph-grade.js:48  fetch('data/grade-map.json')
  index-record.js:74 fetch('data/index.json')      :95 fetch('forks.json')
  kg-traverse.js:37  fetch('data/kin/...')
  reader.js:261,285,286,289                        site.js:845 fetch('forks.json')
At site/pages/ these resolve to /site/pages/data/... -> 404, with no build error.
Plus test-globals.js:181,271 readFileSync('code-brain.html') would fail immediately.

### What is actually worth doing here

- [ ] 2.1  DONE — classification complete (8 generated, 5 authored)
- [ ] 2.2  CANCELLED — site/pages/ move. Wrong target; see above.
- [ ] 2.3  DELETE root images/ — confirmed DEAD. 24 HTML5UP-template leftovers
           (pic01-09.jpg, overlay.png, stock photos), 3.3 MB, touched only by the
           first commit and one 3-year-old CSS commit. Zero references anywhere in
           the repo. Live images are assets/img/banner.svg and og-image.png.
- [ ] 2.4  FIX THE REAL BUG: relative-vs-absolute URL convention is inconsistent.
           Generated pages use /assets/... (services.html:61); authored pages use
           assets/... (projects.html:21). site.js itself is split — :457,461,826 use
           /data/, /stats.json while :845 uses forks.json. Normalise to root-absolute.
           This is what makes the pages movable AT ALL, and is worth doing on its own.
- [ ] 2.5  OPTIONAL: assets/partials/index/ -> site/partials/ is safe IF you also fix
           build-bundles.js:38-66 src paths AND .githooks/pre-commit:89-96, whose
           trigger regex '^assets/(css|js)/site/|^assets/partials/' would otherwise
           SILENTLY stop firing — shipping a stale index.html with no error.
           The generated header embeds the src path, so expect one STALE report.
           Low value for the risk. Recommend deferring.
- [ ] 2.6  MUST STAY AT SERVED ROOT (verified, no CNAME, Pages serves repo root):
           robots.txt (spec), sitemap.xml, llms.txt, og-image.png (hardcoded absolute
           in lib-site-chrome.js:34,38 and build-pages.js:150,201 — moving it breaks
           every social card with no build error), index.html, feed.xml, atom.xml,
           forks.json, stats.json, and the data/ blog/ structure/ insights/
           case-studies/ directories.

## Stage 3 — generated output leaves git   [? BLOCKED — see finding]

~480 MB committed: structure/ 236M, data/ 203M, blog/ 41M, plus forks.db,
forks.json, stats.json, feed.xml, atom.xml, sitemap.xml.

### FINDING: the pipeline is stateful and reads its own committed output.

This is not a publishing concern, it is a correctness one. Every network stage is
budgeted and RESUMES from what the last run committed:

  src build-structure.js:100   skip if structure/<id>.json already exists
  src build-analyze.js:383     same existence skip
  src build-symbols.js:172     freshness check on data/symbols/<id>.json
  src build-hygiene.js:198     reads structure/<id>.deep.json  ("incremental and committed", :12)
  src build-osv.js / build-deps.js   budgeted resumption
  forks.json is the census input read by build-analyze.js:370, build-structure.js:93

With nothing committed, every run starts from an empty tree, and `--budget 40`
means the site would publish a permanently near-empty data layer. The backlog
would never drain. So Stage 3 CANNOT be a simple "gitignore it and deploy an
artifact" — the state has to live somewhere the next run can read.

### The good news: every RUNTIME consumer is URL-relative, not git-relative.

All browser JS (site.js, reader.js, code-brain.js, kg-traverse.js, graph-grade.js,
index-record.js), report.html's inline fetches, estate.mjs's default network mode,
the README's five advertised public URLs and the shields.io badge — all hit
https://moses-y.github.io/... Nothing runtime cares whether the file is in git,
provided the artifact preserves the exact root layout (/data/**, /structure/**,
/blog/**, /forks.json, /stats.json, feeds, sitemap).

- [ ] 3.1  DONE — consumer inventory complete
- [ ] 3.2  DECIDE where pipeline state lives. Three options:
           (a) LEAVE AS IS. Committed output IS the state store. Costs 480 MB and
               a commit every 2h; costs nothing else. Honest default.
           (b) Orphan `data` branch. Source history stays clean, state still in git,
               Pages deploys from an action. Precedent already exists in this repo:
               embeddings.json lives in the Actions cache for exactly this reason.
           (c) Actions cache / artifact. Cleanest, but caches EVICT (7 days, 10 GB)
               and an eviction silently resets the backlog. Risky for 480 MB.
- [ ] 3.3  If (b) or (c): keep the 5 advertised public URLs stable —
           llms.txt, data/schema.json, data/kin/<id>.json, data/grade-map.json, stats.json
- [ ] 3.4  Fix `.claude/skills/query-repo-estate/estate.mjs:33` `--local` mode —
           reads cwd/data, documented as the offline fallback (SKILL.md:16,118,128)
- [ ] 3.5  Fix `.claude/skills/run-moses-y-github-io` — breaks entirely. Serves the
           repo dir over http.server, does `git checkout -- blog/ feed.xml atom.xml
           forks.db stats.json` (SKILL.md:171), baseline.json assumes 1275 committed repos
- [ ] 3.6  update-forks.yml: the "Build status" step reads ./forks.json and stats
           forks.db AFTER commit — must run in-job before any artifact upload
- [ ] 3.7  .githooks/pre-commit:24-25 is_generated() exemptions become dead code
- [ ] 3.8  History rewrite: NO. Breaks every clone and permalink on a public site.

## Open questions

- Stage 3: where does pipeline state live — (a) leave as is, (b) orphan data
  branch, (c) Actions cache? See the finding above; this is the whole decision.
- Stage 1: what is the generate-* bucket rule? (1.8)
- Stage 1: where do update-forks.js / measure-runtime-checks.js live? (1.9)
- Rewrite history to reclaim the 480 MB, or accept it? (3.8 — recommend NO)
