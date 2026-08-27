---
name: query-repo-estate
description: Answer questions about the 1400+ public repositories at moses-y.github.io - which ones solve a given problem, which are near-duplicates of each other, which one of a group is worth cloning, what a repository shares a dependency stack with, and how good it is. Use when asked to find, compare, consolidate, audit or pick between repositories in this estate, or when asked what to clone or archive.
---

# Query the repo estate

1400-odd public repositories, each measured and graded, related to each other by two
kinds of edge. Everything is a static file on GitHub Pages: **no server, no API key,
no clone, no install.** Node >= 18 for global `fetch` is the only requirement.

```bash
node .claude/skills/query-repo-estate/estate.mjs kin openwiki
```

Add `--local` to read `./data` from a checkout instead of the network. Point
`ESTATE_SITE` elsewhere to test against a staging copy.

## Read this before trusting an answer

Every fact this returns is tagged **EXTRACTED** or **INFERRED**, and the tags are not
decoration:

| | EXTRACTED | INFERRED |
|---|---|---|
| Comes from | the tree, the git history, a dependency manifest | a neural embedding (`nvidia/nv-embedqa-e5-v5`) |
| Covers | grades, hygiene, capabilities, `stack` edges | `semantic` edges, UMAP coordinates, clusters |
| Evidence | names the shared packages; you can check it | the similarity score, and nothing else |
| Reproducible | yes, from the same inputs | only from the same model |

So: **a `stack` edge is a fact, a `semantic` edge is a strong hint.** When both lists
name the same repository the tool prints `CORROBORATED`, and that is the single
highest-confidence signal in the layer — a guess that something measured agrees with.

Two more that are easy to get wrong:

- **Not audited is not a good grade and not a bad one.** ~500 repositories have never
  been through the hygiene pass. They print as `not audited`, never as `clean`.
- **A cluster is not a set of duplicates.** It is a modularity partition of an
  embedding graph. Members are closely related; that is all it means.

## Commands

| Command | Cost | What it answers |
|---|---|---|
| `find <text>` | 774 KB | which repositories mention this |
| `show <id\|name>` | 774 KB | every measured fact about one repository |
| `kin <id>` | **~1 KB** | what else is like this, and what shares its stack |
| `kin <name>` | 775 KB | the same, but pays for the index to resolve the name |
| `cluster <id\|name>` | 36 KB | the group it belongs to and which member is the keeper |
| `report` | 32 KB | all 61 groups as prose, cross-domain first |

**Resolve a name to an id once, then work in ids.** `kin 1324517271` is one 1 KB fetch;
`kin openwiki` downloads the whole index first to learn that id. Multi-hop traversal in
ids is cheap and in names is not.

## The traversal that matters

"I need X. What in the estate is a usable starting point?"

```bash
node .claude/skills/query-repo-estate/estate.mjs find "documentation"   # get an id
node .claude/skills/query-repo-estate/estate.mjs kin 1324517271         # neighbours, 1 KB
node .claude/skills/query-repo-estate/estate.mjs cluster 1324517271     # is it the keeper?
```

Then pick by grade, and prefer a `CORROBORATED` neighbour over a merely semantic one.

Verified output shape for `kin`:

```
openwiki  (1324517271)  Web & Interfaces  grade B+ 82.7
cluster c002

EXTRACTED - shares declared dependencies  (0)
  none: no manifest this pipeline reads, or nothing distinctive shared

INFERRED - similar embedding, no evidence beyond the score  (11)
  0.687  1204594437 whoami                        Web & Interfaces
```

## Going direct, without this tool

The tool is a convenience over plain HTTP. Any agent can skip it:

```
https://moses-y.github.io/llms.txt                  start here, it is generated
https://moses-y.github.io/data/schema.json          the single-letter keys, decoded
https://moses-y.github.io/data/kin/<id>.json        one neighbourhood, ~1 KB
https://moses-y.github.io/data/clusters.json        61 groups with keepers
https://moses-y.github.io/data/clusters.md          the same groups as prose
https://moses-y.github.io/data/index.json           everything, 774 KB
```

`estate.mjs` decodes records using the fetched `schema.json` rather than a private copy
of the mapping, so if the schema is ever insufficient to read the index, this tool
breaks first. That is intended.

## Gotchas

- **`data/index.json` is 774 KB and parses to roughly 198k tokens.** Never read it into
  a context window to answer a question about one repository. That is precisely what
  the `kin` files exist to avoid; `find` and `show` pay the cost because they have no
  alternative, and every other command does not.
- **`/data/kin/` is not browsable.** GitHub Pages serves no directory listings, so
  fetching the directory 404s. You need an id.
- **Not every repository has stack edges.** Only ~390 declare dependencies in a manifest
  this pipeline reads; the rest print `(0)` and that is a missing input, not a finding.
  Coverage is always quoted against 387, never against 1421.
- **`l` (language) is null on prose and config repositories.** It is derived from the
  file census, not from the GitHub API, so null means the tree holds no code — not that
  the language is unknown.
- **`v` is the trap.** `0` means audited and clean; an array is `[critical, high,
  medium, low]`; **absent means never audited.** Collapsing absent into clean is the
  one mistake that turns this data into a lie.
- **The site is rebuilt nightly**, so ids are stable but grades, clusters and counts
  move. Cluster ids (`c001`) are positional and will renumber; never store one.
- **`--local` reads `./data` relative to the working directory**, not to the skill. Run
  it from the repo root.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `estate: 404 .../data/kin/<id>.json` | That id is not in the estate, or the nightly build has not published it yet. Check with `show <id>`. |
| `estate: ambiguous: a, b, c` | The name matched several slugs. Use the full slug or an id. |
| `estate: N repositories match` | Too broad for `kin`. Use `find` first and pick an id. |
| `fetch failed` | No network. Use `--local` against a checkout. |
| Numbers disagree with a blog page | The page was generated on an earlier run. `llms.txt` carries the build date. |
