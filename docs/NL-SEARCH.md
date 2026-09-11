# Natural-language search over the estate

What it would take to ask this estate questions in English, and — more usefully —
which questions it can currently answer honestly, which it can only answer by
substituting a different question, and which it cannot answer at all.

The design conclusion up front: **this should be text-to-query, not RAG over the
articles.** The reasoning is in §3, and it follows from the thing that makes this
estate unusual rather than from anything about language models.

---

## 1. What the four example questions actually ask for

These came from a real conversation, and they look like one feature. They are
four, with four different failure modes.

| Question | What it needs | Answerable today? |
|---|---|---|
| "which repos can do X and Y and Z" | boolean filter over structured facts | **Yes** — this is a query, not a search |
| "which let me build mobile apps faster" | a velocity signal | **No** — see §2 |
| "what ideas can I get for a first project" | synthesis over clusters and gaps | Partly, and weakest on provenance |
| "generate a project and deploy it" | an agent with write access | Out of scope — different risk class entirely |

Treating all four as "ask the LLM with some context" is how a system ends up
confidently answering the one it cannot.

## 2. The honest answer to "faster"

There is no velocity data anywhere in this estate. Nothing measures how long
anything took to build, and nothing could — the pipeline reads trees, manifests
and histories, not calendars against outcomes.

So "which ones let me build mobile apps faster" has to be answered by substituting
a question the data *can* support, and the substitution must be stated rather than
performed silently:

> 105 repositories are classified `kind = 'Mobile app'` and 56 sit in the `Mobile`
> domain. Of those, the ones most likely to save you time are the ones that are
> ready to run: a lockfile, CI configured, tests present, a README that documents
> setup. Those are four of the eight graded axes. That is a readiness proxy, not a
> speed measurement, and it has never been validated against anyone actually
> building anything.

That paragraph is the correct answer. An answer that just says "try these five,
they'll be faster" is a fabrication dressed as a recommendation, and the estate
already has a vocabulary for the distinction: readiness is **EXTRACTED**, speed
would be **INFERRED**, and nothing here measures speed at all.

**Design rule:** when a question asks for a dimension the schema does not carry,
the system names the substitution it is making. It does not quietly answer a
neighbouring question.

## 3. Text-to-query, not RAG

The default architecture for "ask my documents in English" is retrieval-augmented
generation: embed the question, pull the nearest chunks of prose, let the model
write from them. That is the wrong shape here, and the reason is specific to this
estate rather than general.

**The prose is the least reliable thing in the repository.** Every article is
INFERRED — a model's summary of a tree. The *facts* are EXTRACTED: the file census,
the dependency manifests, the advisory matches, the eight-axis grade, the symbol
table, the import graph. RAG over the articles would retrieve the inferred layer,
launder it through a second model, and produce an answer whose provenance is two
models deep and impossible to check.

Turning the question into a query against the structured store inverts that. The
model's job becomes **translation**, not knowledge:

```
question (English)
   ↓  LLM #1: translate to a query plan, validated against data/schema.json
query plan (JSON: filters, ranking, limit)
   ↓  executed against the store — SQL, FTS5, vector, or a fusion of them
rows (repo ids + the columns that justified each one)
   ↓  LLM #2: narrate, citing row ids
answer, where every claim resolves to a row
```

The model never states a fact. It states a filter, and it describes rows. That is
the same discipline the rest of the pipeline applies to the estate, applied to the
question layer.

### The hallucination gate becomes mechanical

This is the part worth building for. Because the answer is generated *from a result
set*, the check is set membership, not judgement:

- every repository named in the answer must appear in the rows returned
- every number quoted must appear in a returned column
- a named repository that is not in the result set is a hard failure, not a
  quality concern

No judge model, no rubric, no LLM-as-judge pathologies to reason about. A string
scan against a set of ids. That check is cheap enough to run on every answer in
production, which is the only kind of check that actually runs.

## 4. What exists to query today

Verified against the current build, not assumed:

**Structured facts** — the strong layer.

| Field | Coverage |
|---|---|
| `kind` | 9 values, e.g. Web app 752, Service/API 178, CLI tool 133, Mobile app 105 |
| `domain` | 7 values, e.g. Web & Interfaces 531, AI & Data 520, Systems & Infra 309 |
| `capabilities` | 10 named, on 1,193 of 1,534 repos, each with the evidence that triggered it |
| `grade` | 8 axes plus a letter, with every charged finding |
| `dependency` | 17,841 declared edges over 5,501 packages |
| `advisory` | 3,909 advisories, 3,768 affects rows, 16,280 repo links |
| `module` / `import_edge` | 243,989 modules, 351,839 edges |
| `symbol` | 1,381,909 extracted names with file and line |

`kind` carries `kindConfidence` and `kindEvidence` — e.g. `0.7` from
`["260 notebooks", "pip project"]` — so a filter on it can report *why* a
repository matched and how sure the classifier was. Very few estates can do that,
and it is the difference between a result list and an explanation.

**Lexical search** — `data/search.json`, an inverted index over 1,534 documents
keyed on repository id, ~390 KB. Good for exact names, bad for paraphrase.

**Full-text over prose** — FTS5 over `article.summary` in the store, with the three
sync triggers from `002-search-and-tuning.sql`.

**Semantic search** — **does not currently exist as a servable layer.** Only the
3-dimensional UMAP projection is published. The full 2,048-dimension vectors live
in `embeddings.json`, which is gitignored and kept in an Actions cache. Nothing a
page can fetch has enough information to do a similarity search.

## 5. The constraint that decides the architecture

Two hard limits point the same way:

1. **Full vectors are ~12.6 MB** at 1,534 × 2,048 × 4 bytes. That is not a fetch a
   web page makes.
2. **Embedding the question requires an API call**, which requires a key, which
   cannot live in a public static site. The repository's own rule says so.

So natural-language search **cannot run on the GitHub Pages site as it stands**. It
needs a process that holds a key and a database.

That is not an obstacle to route around — it is the clearest argument yet for the
product split in `DECISIONS.md` D2. NL search is the feature that makes Postgres
and pgvector necessary rather than merely tidier. Any attempt to ship it on the
static site will produce a worse version of lexical search that calls itself AI.

## 6. Retrieval, in the order worth building it

**Stage 1 — structured only.** Translate to filters over `kind`, `domain`,
`capabilities`, `language`, `grade`. Answers "which repos can do X and Y and Z"
completely and provably. No embeddings, no vector store, and it works against the
SQLite store today. *Most of the perceived value of the whole feature is here.*

**Stage 2 — hybrid.** Add lexical (FTS5) and semantic (pgvector) as two more
retrieval arms, fused by reciprocal rank. Needed for paraphrase — "something that
watches a folder and reacts" matches no keyword.

**Stage 3 — graph-aware.** Use the traversal measured in D3: "repos like this one,
and what would break if I swapped its core dependency." This is where the estate
answers something no package search can.

**Stage 4 — generative.** "What should I build?" Cluster analysis plus gap
analysis: 41 clusters exist, 14 of which cross a domain boundary — those are
already the interesting ones. This stage is the weakest on provenance and should
be labelled as such in the interface, not just in a doc.

## 7. What "generate a project and deploy it" actually is

Not a search feature. It is an agent with write access to a repository and a
deployment target, and it belongs behind a different set of decisions: what it may
create, what it may never touch, who approved it, and what the rollback is. The
one thing worth saying here is that the estate is a genuinely good *source* for it
— 1,193 repositories with identified capabilities and graded quality is a better
starting corpus than a template gallery — and that this makes it more tempting,
not less dangerous.

Keep it out of the search surface. A system that answers questions and a system
that takes actions should not share an entry point.

## 8. Evaluating it without a judge model

The facts are deterministic, so the ground truth is free. Build a golden set of
perhaps 50 questions whose correct answer is a **set of repository ids** computable
by hand:

- "Python CLI tools with tests" → a SQL query anyone can write
- "repos affected by GHSA-353f-5xf4-qw67" → 94 ids, already measured
- "mobile apps graded B or better" → a query

Then measure recall and precision of the generated query plan against the
hand-written one. That tests the only part where the model can be wrong in a way
that matters: translation. It needs no rubric, no preference model, and none of the
LLM-as-judge pathologies — self-preference, verbosity bias, agreement bias — apply,
because nothing is being judged. Two sets are being compared.

Narration quality is a separate, smaller problem, and §3's membership check covers
the failure mode that actually harms anyone.

## 9. Summary

- **Translate, don't retrieve.** The structured facts are the asset; the prose is
  the derived layer. Text-to-query preserves provenance, RAG destroys it.
- **Name the substitution.** "Faster" is not in the schema. Say so, answer
  readiness instead, and say that is what you did.
- **The hallucination check is set membership**, which is why this shape is worth
  the extra component.
- **Stage 1 alone delivers most of the value** and needs no embeddings at all.
- **It cannot ship on the static site.** This feature is the forcing function for
  D2, not a consumer of it.

Related: `DECISIONS.md` D2 (the product split), D3 (graph traversal, measured),
`docs/architecture/11-agent-interface.md` (the existing agent surface), `llms.txt`
and `data/schema.json` (the contract a query planner would validate against).
