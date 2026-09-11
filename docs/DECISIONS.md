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
