---
name: run-moses-y-github-io
description: Build, run, screenshot, smoke-test and regression-check the moses-y.github.io static site and its data pipeline. Use when asked to run/serve/preview the site, screenshot a page, verify the projects feed, Code Graph, Code Brain or blog articles, regenerate blog pages/RSS/SQLite, iterate on site improvements, or check that a change did not break existing capability.
---

# Run moses-y.github.io

A static GitHub Pages site plus a Node data pipeline. There is no build step and no
framework: pages are hand-written HTML that fetch `/data/index.json` (~818KB, the lean
index) and per-repo shards under `/data/` and `/structure/` at runtime. `forks.json` is
no longer fetched by the pages, and `forks.db` has been removed - it was queried by
nothing.

Drive it with **`.claude/skills/run-moses-y-github-io/driver.mjs`**, a dependency-free
Chrome DevTools Protocol client. `chromium-cli` is not installed here and Playwright is
not a dependency of this repo; the driver uses Node's built-in `WebSocket` (Node >= 22)
against the system Chromium, so there is nothing to install.

All paths below are relative to the repo root.

## Prerequisites

Already present in this container (Chromium 150, Node v25.2.1, Python 3.14). Only
needed on a bare machine:

```bash
sudo apt-get update && sudo apt-get install -y chromium nodejs python3
```

Runtime deps for the pipeline. **Use `--no-save`**: a plain `npm install` rewrites the
caret ranges in the tracked `package.json`, which is what broke the CI pipeline for 15
consecutive runs.

```bash
npm install --no-save umap-js
```

## Serve (required before driving anything)

The pages fetch absolute paths (`/forks.json`), so the server must run from the repo
root. Do not skip this and open the file directly (see Gotchas).

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/    # 200
```

## Run: the improvement loop (start here for any change)

This site carries a lot of capability spread thinly across pages, and a redesign drops
things silently. `loop.mjs` walks the surfaces as a graph, asserts what each must still
do, and diffs against a recorded baseline. Run it after every change.

```bash
node .claude/skills/run-moses-y-github-io/loop.mjs              # check against baseline
node .claude/skills/run-moses-y-github-io/loop.mjs --pipeline   # regenerate first, then check
node .claude/skills/run-moses-y-github-io/loop.mjs --baseline   # re-record after intended change
```

Current baseline, all 21 probes verified in this container:

```
home              reveal_hidden_after_scroll 0 · nav_links 10 · hero_stats 5
projects          cards 13 · total_repos 1275 · filter_chips 5 · search_narrows true
code-brain        canvas 1 · repos 1275 · domains 7 · languages 35
knowledge-graph   canvas 1 · repos 1275
article           paragraphs 10 · listen_bar "flex" · analysis_section 1 ·
                  readiness_checks 7 · mermaid_svg 1 · graph_links 2
```

Numeric probes may go up, never down; string probes must match. A drop prints
`REGRESSION was <n>` and the run exits 1. The loop was confirmed to catch this: pointed
at `file://` it reported 9 regressions and exited 1. Only re-record the baseline when a
drop is intended, and say so.

The article probes assert the generated analysis section: the readiness checklist, the
Mermaid module diagram rendered to SVG, and the two links into Code Brain and the
knowledge graph. `loop.mjs` picks the first article that has a diagram, so it does not
depend on any one slug.

## Run: agent path (the driver)

```bash
node .claude/skills/run-moses-y-github-io/driver.mjs <url> [command...]
```

Commands run in order: `wait:<css>[:<ms>]`, `click:<css>`, `eval:<js>`, `text:<css>`,
`count:<css>`, `shot:<path>`, `sleep:<ms>`. Exit code is non-zero if any command fails
or the page throws.

Whole-site smoke, every line verified in this container:

```bash
node .claude/skills/run-moses-y-github-io/driver.mjs http://127.0.0.1:8765/projects.html \
  'wait:.project-card:40000' \
  'count:.project-card' \
  'eval:document.body.innerText.match(/of\s+[\d,]+\s+repos/)?.[0]' \
  'shot:/tmp/shots/projects.png'
```

Expected: `count 13`, and `"of 1275 repos"`. A total of `30` means you are on `file://`.

The homepage needs scrolling before it is worth screenshotting:

```bash
node .claude/skills/run-moses-y-github-io/driver.mjs http://127.0.0.1:8765/ \
  'eval:window.scrollTo(0,document.body.scrollHeight/3),1' 'sleep:900' \
  'eval:window.scrollTo(0,document.body.scrollHeight),1' 'sleep:1200' \
  'eval:[...document.querySelectorAll(".reveal")].filter(e=>getComputedStyle(e).opacity==="0").length' \
  'shot:/tmp/shots/home.png'
```

The last `eval` must print `0`. If it prints `7`, the reveal animations never fired and
your screenshot is a black page.

The two WebGL pages work headless (SwiftShader). They need ~6s before the canvas fills:

```bash
node .claude/skills/run-moses-y-github-io/driver.mjs http://127.0.0.1:8765/code-brain.html \
  'sleep:6000' \
  'eval:document.querySelectorAll("canvas").length' \
  'eval:(document.getElementById("s-repos")||{}).textContent' \
  'shot:/tmp/shots/code-brain.png'
```

Expected: `1` canvas and `"1275"`. Same shape works for `knowledge-graph.html`.

A generated article, including the read-aloud control:

```bash
node .claude/skills/run-moses-y-github-io/driver.mjs http://127.0.0.1:8765/blog/clawdbot.html \
  'count:#post-content p' \
  'eval:getComputedStyle(document.getElementById("listen-bar")).display'
```

Expected: `5` paragraphs and `"flex"` (the bar hides itself when speechSynthesis is
missing, so `"none"` means feature detection failed).

Real interaction. Search is `#search-input` (dispatch `input`, not `change`); the filter
chips key off `data-filter`:

```bash
node .claude/skills/run-moses-y-github-io/driver.mjs http://127.0.0.1:8765/projects.html \
  'wait:.project-card' \
  'click:.filter-chip[data-filter="javascript"]' 'sleep:1000' \
  'eval:document.getElementById("projects-container").children.length' \
  'eval:(()=>{const s=document.getElementById("search-input");s.value="agent";s.dispatchEvent(new Event("input",{bubbles:true}));return true})()' \
  'sleep:1000' \
  'eval:document.getElementById("projects-container").children.length'
```

Observed: `1` after the JavaScript chip, `1` after searching "agent".

## Run: the data pipeline

Offline stages. These read the committed `forks.json` and need no network or keys:

```bash
node scripts/generate-blog-pages.js  # 1275 blog pages   ~0.2s
node scripts/generate-rss.js         # feed.xml, atom.xml
node scripts/build-stats.js          # stats.json
```

They rewrite tracked files. Reset after a smoke run:

```bash
git checkout -- blog/ feed.xml atom.xml stats.json
```

The online stage hits GitHub and NVIDIA and takes ~25 minutes cold (1275 repos, 40
embedding batches). Keep the batch small unless you actually want articles written:

```bash
export GITHUB_TOKEN=$(gh auth token)
source ~/.nvidia-api-key            # exports NVIDIA_API_KEY; never inline the key
BATCH_SIZE=2 KG_BATCH_SIZE=0 node scripts/update-forks.js
```

It overwrites `forks.json`. `git checkout -- forks.json` to undo.

## Run: human path

Serve and open `http://127.0.0.1:8765/` in a browser. There is no dev server, no HMR and
no build; edit the HTML or `assets/js/site.js` and reload.

## Gotchas

- **A screenshot of the homepage is blank by default.** Seven `.reveal` sections sit at
  `opacity: 0` until GSAP ScrollTrigger fires, which needs real scrolling. GSAP loads
  fine from its CDN; the content is simply invisible. Scroll in steps with sleeps, then
  assert the hidden count is `0` before trusting the image.
- **`file://` looks like it works and lies.** `projects.html` opened directly renders 10
  cards and reports **"of 30 repos"** — a built-in fallback list. Over HTTP the same page
  reports **"of 1275 repos"**. Any conclusion drawn from `file://` is drawn from 30 fake
  repos. Always serve.
- **`npm install umap-js` mutates tracked `package.json`**, bumping caret ranges
  when a dependency publishes. In CI that left the file unstaged and aborted
  `git pull --rebase`, failing 15 runs in a row while every run still did 20-35 minutes
  of work first. Use `--no-save`.
- **The homepage has no repo cards.** `#projects` there is a teaser linking to
  `/projects.html`. `#projects-container` and `.project-card` only exist on
  `projects.html`. Do not wait on them at `/`.
- **Chromium needs `--no-sandbox`** in this container or it exits instantly with no
  diagnostic. The driver already passes it.
- **WebGL does work headless.** `ForceGraph3D` renders the full 1275-node graph under
  `--disable-gpu` via SwiftShader. Do not assume the 3D pages are undriveable.
- **The loading text stays on screen** on the graph pages ("Wiring the brain…") even
  after the canvas is populated, so it is not a readiness signal. Sleep ~6s and assert
  on `#s-repos` instead.
- **`language` is null on 1248 of 1275 repos** in `forks.json`, because GitHub omits it
  for forks on both the list and detail endpoints. `code-brain.html` works around this
  with its own `primaryLanguage()` derived from `knowledgeGraph.languages`; anything
  reading `fork.language` directly does not.
- **Mermaid is a CDN script and used to crash the page.** `initMermaid()` called
  `mermaid.initialize()` unguarded, so a slow or blocked jsDelivr threw
  `ReferenceError: mermaid is not defined` and killed the rest of the handler, including
  the theme toggle that calls it. It was intermittent, passing one run and throwing the
  next. `generate-blog-pages.js` now returns early when `mermaid` is undefined or the
  page has no `.mermaid` node. If you re-templatise the article, keep that guard.
- **Only ~784 of 1275 articles have a diagram**, because `moduleDiagram()` needs a
  `structure/<id>.deep.json` with at least 3 modules and one intra-top-10 edge. An
  article without one is not a bug; `loop.mjs` deliberately samples an article that has
  a diagram so the probe stays meaningful.
- **Mermaid node ids cannot be module paths.** They contain `/`, `.` and `-`, which the
  parser rejects, so `mermaidId()` rewrites them. Diagrams are capped at 10 nodes and 18
  edges: the real graphs reach 1459 modules and 5943 edges and Mermaid becomes
  unreadable long before that.
- **First paint.** `projects.html` pulls `data/index.json` (~818KB, ~195KB gzipped).
  `report.html` is the heavy page: it still fetches the full `data/hygiene.json` and
  `data/grades.json` to render one repository. Allow a generous `wait:` budget there.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Chromium never exposed a CDP page target` | Another Chromium holds port 9222. `CDP_PORT=9333 node ... driver.mjs` |
| Driver exits 0 but the PNG is black | You screenshotted `/` without scrolling. See the first gotcha. |
| `curl` to port 8765 returns 000 | Server not running, or started from the wrong directory. It must run from the repo root. |
| Page total says `of 30 repos` | You are on `file://`. Serve over HTTP. |
| `wait: selector never appeared: .project-card` at `/` | Those elements are only on `projects.html`. |
| `git pull --rebase` fails with "unstaged changes" after a pipeline run | `npm install` rewrote `package.json`. `git checkout -- package.json` and use `--no-save`. |
| Article smoke exits 1 with `ReferenceError: mermaid is not defined` | jsDelivr did not load in time. The page content is fine; re-run to confirm it is the CDN and not your change. |
