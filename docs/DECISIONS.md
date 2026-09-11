# Decision log

A running record of the calls made about this pipeline, and — the part that makes
it worth keeping — **what each one predicted**.

The reason this file is not a diary is that a diary cannot be wrong. An entry here
states a decision *and* the falsifiable claims it rested on, written down before the
work, so that a debrief after the work can check the claim rather than re-narrate
the decision. An entry whose predictions turned out wrong is the most valuable kind
in here, and must not be quietly edited into having been right.

Rules:

- **Append, never rewrite.** A superseded decision gets a new entry that links back;
  the original text stays as it was written.
- **Predictions are falsifiable or they are not predictions.** "Performance will
  improve" is not one. "Brute-force cosine stays under 20 ms at 5,000 repos" is.
- **Fill the debrief after shipping, not during.** Record what actually happened,
  including the parts nobody predicted.
- Status is one of: `open`, `decided`, `shipped`, `debriefed`, `superseded`,
  `abandoned`.

---

## 2026-09-11 — D1: The model roster expires, and nothing was watching

**Status:** shipped, awaiting debrief

**What prompted it.** A health check of the forks feed and the LLM models. Every
scheduled run for seventeen days was green. Every model the pipeline named was
unusable.

| Model | Reality when probed |
|---|---|
| `nvidia/nv-embedqa-e5-v5` | 410, retired 2026-08-25 |
| `openai/gpt-oss-120b` | 410, retired 2026-09-03 — articles *and* Code Brain |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | alive; ~110 s before its first token |
| `deepseek-ai/deepseek-v4-flash-0731` | 3 s on a trivial prompt, 240 s timeout on all three real article prompts |

The embedding failure was silent by construction: the batch loop treated a 410 the
same as a 429, logged one line, broke, and let the job exit 0. `semantic.positioned`
sat at 1,407 in every commit, which reads like a settled number rather than a
stalled one. 127 repositories reached the site with no position on the semantic
graph.

**What was decided.**

1. Probe every configured model with a real call, weekly and on demand
   (`src/tools/check-models.js`, `.github/workflows/check-models.yml`). Reading
   `/v1/models` is not sufficient — see prediction P3.
2. A 404/410 in the embedding loop throws. A rate limit rolls over; a retirement
   does not.
3. The roster moves to repository variables, so a replacement is a variable change
   rather than a code change plus a full pipeline run.
4. Roster: `nvidia/nemotron-3-embed-1b` for embeddings; `mistralai/mistral-nemotron`,
   `openai/gpt-oss-20b`, `deepseek-ai/deepseek-v4-pro-0813` for articles.

**What was rejected.** Keeping `nemotron-3.5-lightning` as a slow fallback. The
rotation is round robin and cannot express a preference, so a slow model in the
list is not a fallback — it is a share of the articles.

**Predictions to check.**

- **P1.** The next model retirement is caught by the weekly probe or by a red
  pipeline run, not by a person noticing a stale number. *Check: at the next 404/410
  on any configured model, what surfaced it first?*
- **P2.** No article in the next 200 generated falls back because the rotation ran
  out of live models. *Check: `progress.fallback` and the "every model in the
  rotation has been tried" log line.*
- **P3.** The catalogue keeps disagreeing with entitlement — models will continue to
  appear in `/v1/models` that 404 for this key. *Evidence so far: 6 of 7 embedding
  models did exactly this.*
- **P4.** The move from 1,024 to 2,048 dimensions changes the UMAP layout wholesale
  but does not degrade cluster quality. *Check: cluster count and cross-domain
  cluster count in `data/clusters.md` — 41 groups, 14 crossing a domain boundary,
  before the swap.*
- **P5.** `deepseek-v4-pro` completes real article prompts within the 240 s timeout,
  where `v4-flash` did not. It answered a trivial prompt in 15 s, which is not the
  same test. *This is the weakest link in the roster and the one to watch.*

**Debrief.** _(after the next few runs that generate articles)_

---

## 2026-09-11 — D2: Splitting Glossa out as a product

**Status:** open

**What prompted it.** Running Glossa as a product rather than as part of a
portfolio site, on PostgreSQL, borrowing conventions from IntellichatV3 and autar
(Better Auth, Vault, Helm, ERDs).

**Where the thinking got to.**

*Postgres.* The schema ports nearly as-is: 24 tables, forward-only numbered SQL
migrations, a runner already in `src/lib/lib-db.js`. Real changes are `INTEGER`
booleans → `BOOLEAN`, ISO-string timestamps → `TIMESTAMPTZ`, JSON blobs → `JSONB`,
`WITHOUT ROWID` → composite primary key (no equivalent, and no longer needed), and
FTS5 external-content plus three sync triggers → a generated `tsvector` column with
a GIN index, which is strictly less machinery.

*The forcing function is pgvector, not Postgres.* Embeddings currently live in a
~4 MB JSON file inside a GitHub Actions cache — outside the database, outside git,
evictable. An evicted cache means re-embedding the whole corpus. That is the thing a
product cannot ship with.

*Graph layer — deferred, deliberately.* Polygres (Evokoa) is a managed Postgres
bundling relational + graph + pgvector + full-text; its engines, **pgGraph** and
pgContext, are Apache-2.0 and self-hostable. pgGraph builds a *derived* CSR graph
index over registered relational tables, queried in plain SQL, Postgres 14–18, at
v1.2.0. Apache AGE is the alternative: openCypher, Apache TLP since 2022, more
mature, but a second query language.

Against what Glossa computes today, neither is needed: the estate is ~1,534 nodes
and ~19,000 edges, per-repo module graphs are ~40 nodes, and brute-force cosine
measured 3.57 ms at 1,024 dimensions. The query that *would* justify a graph engine
does not exist yet — transitive advisory blast radius across 15,375 dependency edges
and 14,761 advisory links, which is genuinely multi-hop and genuinely a product
feature.

**Decisions taken now.**

1. Postgres + pgvector on day one of the split.
2. No graph extension until a traversal query exists that relational SQL serves
   badly. Then pgGraph over AGE, because derived state is reversible — drop the
   extension and the tables are untouched — and because it needs no second query
   language.
3. Do not buy Polygres managed while the destination is a VPS or bare metal. The
   components are Apache-2.0.

**Predictions to check.**

- **P6.** Brute-force k-NN in Postgres stays fast enough to make an HNSW index
  unnecessary below roughly 10,000 repositories. *Baseline: 3.57 ms over 1,440 ×
  1,024; now 2,048 dimensions, so expect ~7 ms.*
- **P7.** The SQLite → Postgres migration needs no schema redesign — only type
  changes and the FTS swap. *Check: does any table's shape actually change?*
- **P8.** The advisory blast-radius query is the first one that relational SQL
  serves badly. If something else gets there first, the graph-layer reasoning was
  wrong about which feature drives the need.
- **P9.** pgGraph at v1.2.0 is the risk in this plan, not Postgres or pgvector.
  *Check at adoption: was the derived-state design enough to contain it?*

**Open questions.** Better Auth, Vault, and Helm follow from "runs as a service",
not from "uses Postgres" — the claim that IntellichatV3's and autar's conventions
transfer directly is an assumption from a directory listing, not something verified
by reading either codebase.

**Debrief.** _(after the split)_

---

## How to use this in a debrief

Read the predictions first, before re-reading the reasoning. The question is not
"was this a good decision" — hindsight makes every shipped decision look
reasonable — but "which specific claim was wrong, and what would have shown it
sooner?"

D1 exists because of a claim nobody wrote down: that a green pipeline run meant a
working pipeline. That went unchallenged for seventeen days precisely because it was
never stated as something that could be false.

---

## Reasoning notes

The entries above record decisions. This section records *how the decisions were
reached*, because the same few mistakes keep producing them, and naming a mistake
with evidence is cheaper than resolving to think harder.

Each note is drawn from something that actually went wrong in the session that
produced D1 and D2, not from a list of biases.

### R1. A log describes a measurement; it is not the measurement

The first health report said one of three chat models worked. That came from
reading seventeen days of CI logs. Calling the models said **all four were
unusable**, for four different reasons, one of which — the Code Brain's structure
model — appeared in no log at all, because that stage is operator-run and had not
been invoked since the retirement.

The gap was not carelessness. The logs were real evidence, and they were evidence
about a different question: what happened when the pipeline ran, not what is true
now. An artifact that describes a system is always about the past.

**Applies when:** a claim about a live external dependency is sourced from
anything other than calling it. Cost of checking: one probe script. Cost of not:
seventeen days.

### R2. A new instrument needs calibrating before its output is evidence

The first version of the probe used a 45-second ceiling and a 16-token budget. It
reported `nemotron-3.5-lightning` dead while that model was demonstrably writing
articles, and `deepseek-v4-flash` empty when it was a reasoning model that had
spent the whole budget thinking. Two false verdicts, stated in the same tone as
the true ones.

What caught it was not re-reading the code: it was that the output **contradicted
something already known** — those articles existed. That contradiction is the
signal, and it is easy to explain away as the instrument being right and the old
belief being stale.

**Applies when:** a new check, script or measurement produces its first results.
Before acting on them, find one case where the answer is already known and
confirm the instrument agrees.

### R3. Naming something is not knowing it

"The IntellichatV3 and autar conventions carry over directly" was written from a
pasted directory tree and a listing of `d:\autar`. Neither codebase had been read.
The sentence was plausible, useful-sounding, and unearned — and it was the user
who caught it, not the author.

This repository already has the right vocabulary for this and applies it to data
while exempting its own prose: **EXTRACTED** for measured, **INFERRED** for
derived. A claim about a system nobody has opened is INFERRED, and saying so costs
one clause.

**Applies when:** a recommendation leans on a system, tool or codebase that has
been described but not inspected.

### R4. Stable is not the same as correct

`semantic.positioned` read 1,407 in every commit for seventeen days. Nothing about
that looks like a fault; a number that does not move looks like a number that has
settled. Coverage decayed underneath it one repository at a time — 1,407 of 1,407,
then of 1,420, then of 1,534.

The generalisation: any figure derived from a growing corpus has an expected
*ratio*, and the ratio is the thing worth stating. `tests/test-coverage.js` now
states four of them. It trips on this outage around day ten rather than day one —
the probe is what catches day one — but a floor converts silent decay into a date.

**Applies when:** publishing any aggregate over a set that grows. State the
coverage, not just the count.

### R5. Proactivity is asking what else has this shape

The useful move after D1 was not "monitor models better". It was: *this failed
open, silently, in a step whose job still exited 0 — what else does that?* The
sweep that followed found the `|| note` pattern in the workflow already handles it
correctly, recording each failure and failing the job at the end, and that the real
unguarded gap was coverage ratios. One of those was a relief, one became R4 and a
test suite.

That sweep took minutes and needed no permission, because it only read. The
asymmetry is the point: looking is cheap, and the answer is useful whether it finds
something or not.

**Applies when:** any incident is resolved. Before closing it, name the *shape* of
the failure rather than its subject, and grep for the shape.

### The common root

R1, R2 and R3 are one error wearing three hats: **a confident claim about
something not executed.** The errors in this project cluster almost entirely in
the gap between "I read it" and "I ran it" — and every one of them was cheap to
resolve by running something. That is the check worth making a habit, because it
is mechanical and does not depend on being in a careful mood.

---

## 2026-09-11 - D3: P8 settled by measurement - the graph engine is not needed

**Status:** decided. Settles **D2/P8**, informs **D2/P6**.

**What prompted it.** D2 predicted that transitive advisory blast radius would be
the first query relational SQL serves badly, and that it would be what justified a
graph extension. Writing it costs an afternoon; the migration it would justify
costs considerably more. So it was written and timed against the current store.

**The prediction was wrong, and interestingly wrong.** Blast radius is not one
query. It is two, and they sit on opposite sides of the line:

| Question | Shape | Measured |
|---|---|---|
| Advisory -> affected packages -> repositories | 2 joins, depth known when written | **0.42 ms**, 94 rows |
| Every high-severity advisory at once | same, unbounded | **13.41 ms**, 11,075 rows |
| Which modules transitively import this one | recursive, depth unknown | **58.89 ms** worst of the 10 largest repositories |

The estate question - the one P8 named - **is not a traversal at all.** An advisory
names packages and packages are declared by repositories: two hops, both known when
the query is written. There is no package-to-package edge in this data, so
dependency depth is capped at one and no amount of graph engine changes that.

The genuinely recursive query is a different one that D2 never considered:
**module-level change impact**, walking `import_edge` backwards over 243,989
modules and 351,839 edges. That is the query worth building a product on - "if I
change this file, what breaks, and how far away is it" - and Postgres serves it in
tens of milliseconds.

**Decision.** No graph extension. Not now, and not for this. Revisit if a query
appears whose depth is unknown *and* whose working set is large enough that a
recursive CTE stops being tens of milliseconds - the estate would need to grow by
one to two orders of magnitude first.

**What the measurement found that nobody predicted.**

1. `--deep` in build-store.js **had never worked.** A `.deep.json` calls its
   adjacency `links` with `{s,t}` and keeps `edges` as a count, so
   `for (const e of deep.edges)` iterated a number and threw. Both `module` and
   `import_edge` had read 0 rows since the store was written, and nothing noticed
   because nothing read them. The node fields were wrong too - `inst` and `cycle`,
   not `instability` and `inCycle` - so even the modules that would have loaded
   were about to store null coupling and false for every cycle.
2. **The reverse index was missing, and its absence was silent.** `import_edge`'s
   primary key indexes one direction; every interesting traversal runs the other
   way. SQLite did not fail - it built a throwaway covering index on every single
   call. 292.65 ms became **2.26 ms** once the index existed, a factor of 129.
   Migration `003-traversal.sql`.
3. **The first version of the query was wrong in a way that reads as plausible.**
   A naive `UNION` over `(id, depth)` returns a module once per depth it is
   reachable at, so it reported 13,907 affected modules in a repository containing
   1,200. Not an overcount - a different quantity, path count rather than impact
   set. `MIN(depth)` per module is the honest answer, and it is 802.
4. `migrate(db)` with no directory argument applied nothing and returned success.
   Fixed to default the path and to throw on an empty migration set.

**On P6.** Not settled here - that one is about vector search at scale and needs
Postgres. But the shape of this result is a warning about it: the predicted
bottleneck was not the real one, and the real one was an index nobody had thought
about.

**The pattern, for the debrief.** Every one of the four findings above was invisible
until something *ran*. Two empty tables, a missing index, a wrong aggregate, and a
no-op migration runner, none of which any amount of reading the schema would have
surfaced. That is R1 with a price tag attached.

---

## 2026-09-11 - D4: natural-language search is text-to-query, not RAG

**Status:** decided (design only, nothing built). Full design in `docs/NL-SEARCH.md`.

**What prompted it.** Asking the estate questions in English - "which repos can do
X and Y and Z", "which let me build mobile apps faster", "what should I build
first", "generate a project and deploy it".

**What was decided.** Translate the question into a query plan against the
structured store and have the model narrate the rows, rather than retrieving
article prose and letting a model write from it.

The reason is specific to this estate, not general. Every article is INFERRED - a
model's summary of a tree. The facts are EXTRACTED. RAG would retrieve the inferred
layer, launder it through a second model, and produce an answer two models deep
from anything measured. Text-to-query makes the model a translator that never
states a fact: it states a filter, and describes rows.

The consequence worth building for: **the hallucination check becomes set
membership.** Because the answer is generated from a result set, "did it name a
repository that was not returned" is a string scan against a set of ids - no judge
model, no rubric, and none of the LLM-as-judge pathologies apply. Cheap enough to
run on every answer, which is the only kind of check that runs.

**What was rejected.** Answering "faster" at all. No velocity signal exists here
and none could - the pipeline reads trees and manifests, not calendars against
outcomes. The system substitutes readiness (lockfile, CI, tests, docs - four of the
eight graded axes) and must say that it did.

**Predictions to check.**

- **P10.** Stage 1 - structured filters only, no embeddings - delivers most of the
  perceived value. *Check: after shipping it, how many real questions need the
  semantic arm?*
- **P11.** The set-membership check catches every fabricated repository name, and
  narration quality is a much smaller problem than retrieval quality.
- **P12.** A golden set of ~50 questions with hand-computable id sets is sufficient
  evaluation, and no judge model is needed at any point.
- **P13.** NL search is the forcing function for D2 rather than a consumer of it:
  full vectors are ~12.6 MB and embedding a question needs a key, so it cannot run
  on a public static site. *If someone ships a usable version on Pages, this is
  wrong.*

**Debrief.** _(after stage 1)_

---

## 2026-09-11 - D5: positioning - a rating, not a search engine

**Status:** open. Strategy, nothing built. The circularity trap in P16 should be
settled before anything is built on it.

**What prompted it.** "So we become a Google for repos that developers find
useful." Partly - and the wrong half is the half that decides everything after it.

### The framing

"Google for repos" is a losing frame. GitHub search, Sourcegraph and grep.app
already index far more code than this ever will, and Google's moat is crawl plus
index - breadth. The per-repo cost here is a model call for the article, a budgeted
deep pass and a symbol extraction: fine at 1,534 repositories, ruinous at a million.
That frame competes precisely where there is no advantage.

Both incumbents also rank by **popularity** - links, or stars. Stars measure who
noticed a repository, which is a claim about marketing.

What exists here instead is a **normalised quality signal over a whole corpus**:
62 checks applied uniformly, 8 axes, one rubric, findings charged consistently
across 1,534 repositories. Nobody else has that, and it is the prerequisite for
every idea below. The closer analogy is a credit rating - "should I depend on
this?" - than a search engine - "does this exist?". Search is the interface; the
rating is the asset.

### Three corpora, three different products

Depth is affordable here and breadth is not, so the real question is which corpus
to go deep on.

1. **The estate you own.** What it does today. "Know your own sprawl." Clearest
   value, smallest market, longest sale, and the demo already exists.
2. **A vertical, indexed exhaustively.** 58 repositories already classify as Agent
   Skills & Plugins and 233 carry the LLM & Agents capability. Being *the* graded
   index of every MCP server or agent skill is winnable because the corpus is
   bounded and moving faster than anyone has mapped it.
3. **Dependency-anchored.** Index only what appears in someone's dependency graph.
   The corpus defines itself and every entry is known to matter. Most defensible,
   most work.

**Leaning: (2)**, as the cheapest test of the rating thesis.

### The idea that closes the loop

**Glossa as the eval harness for agent-generated code.** An agent builds a project;
the same 62 checks, the same 8 axes and the same rubric that grade 1,534 real
repositories grade the generated one, and return a score *plus a percentile against
the corpus*.

This needs no new machinery - checks, rubric and baseline all exist - and it is the
only honest answer to "faster" found so far. Speed still cannot be measured here.
**Good on the first try, calibrated against real repositories**, can be.

It also completes the pair with D4: provenance-tagged facts going into an agent,
corpus-calibrated grading coming out. Agents do not lack capability; they lack
grounded context in and any check on their output coming back.

### The trap, and a first measurement of it

Best practices as an empirical finding - "of 752 web apps, the ones grading B or
better share these traits" - is the genuinely novel computation here. The naive
version is circular: **the rubric already rewards the traits.** "A-graded
repositories have tests" is a restatement of `no-tests-at-all` being a charged
check, not a discovery.

So the extraction has to run on signals the rubric does not score. A first pass over
the store, comparing grade bands on four structural signals:

| band | n | avg deps | avg modules | avg instability | avg modules in a cycle |
|---|---|---|---|---|---|
| B+ or better | 103 | 10.8 | 256.8 | 0.354 | 3.3 |
| middle | 1232 | 10.7 | 158.7 | 0.280 | 6.2 |
| D or worse | 198 | 18.1 | 111.3 | 0.244 | 7.7 |

Two of those four are contaminated and two are not, which is the useful result:

- **Cycles are contaminated.** Not through a named check id but through the
  architecture scorer, which divides cycles by modules directly
  (`lib-grade.js:260`). The separation is partly the rubric looking at itself.
- **Dependency count is contaminated.** Seven charged checks concern dependencies
  and advisories, so more dependencies mechanically means more advisory exposure
  means a lower grade.
- **Module count and instability appear clean.** Neither is charged by any of the
  62 checks nor read by any scorer. And they separate the bands anyway, in a
  direction worth noticing: well-graded repositories here are **larger** (256.8
  modules against 111.3) and **more unstable** in the coupling sense (0.354 against
  0.244), not smaller and tidier.

That is a real, non-circular, mildly counter-intuitive signal, found in one query.
It is also n=103 against n=198 with no significance testing and every confounder
intact - size almost certainly proxies for something else - so it is a reason to
run the experiment properly, not a finding.

**Predictions to check.**

- **P14.** A vertical corpus (corpus option 2) reaches useful coverage at a cost the
  current pipeline can carry, where a general index cannot. *Check: cost per
  repository times the size of the bounded corpus.*
- **P15.** The grade is the whole differentiator and **has never been validated
  against anything external** - not adoption, not breakage, not maintainer
  responsiveness. Internally consistent and provenance-clean beats stars, but "our
  ranking is better" is an assumption. *Check: correlate the grade against any
  external outcome at all.*
- **P16.** **Non-rubric signals separate grade bands.** First measurement above says
  yes for module count and instability. *Check properly: hold size constant, test
  significance, and confirm that no scorer reads either field.*
- **P17.** The eval harness grades agent-generated projects without modification -
  the rubric is not secretly tuned to repositories that grew over time rather than
  being generated at once. *This is the one most likely to be wrong.*
- **P18.** The engine is corpus-agnostic: the scoring and provenance layers transfer
  to a non-code corpus with the adapter layer replaced and `lib-grade.js`
  substantially intact. *Currently a claim from reading imports, not a finding.*

**Debrief.** _(after the first vertical, or the first non-code corpus)_
