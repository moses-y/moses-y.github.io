# Glossa — architecture

Fourteen diagrams over the subsystem that reads roughly 1,440 GitHub repositories,
extracts facts about each, and has a model write the article. One file per
subsystem, because the interesting parts are the boundaries between them.

Diagrams are Mermaid inside markdown, so GitHub renders them with no assets and
no build step, and a diff shows what actually changed rather than that a binary
moved.

## Status, and why it is stated

Every file opens with a status line, for the same reason every fact in the
published data carries its provenance:

- **DERIVED** — every figure in the file was read from a named source file or
  computed from one. It can be checked, and it will be wrong in a visible way if
  the code moves.
- **AUTHORED** — a design claim. It cannot be measured, so it is cross-referenced
  to the code that enforces it and the test that guards it, and where no test
  guards it the file says so.

A diagram that mixes the two without saying which is which is the documentation
equivalent of scoring an unmeasured axis as clean.

## The set

| | Subsystem | Status |
|---|---|---|
| [00](00-overview.md) | The eight stages end to end, and where they interleave | DERIVED |
| [01](01-data-layer.md) | What is published, who writes it, what it costs to fetch | DERIVED |
| [02](02-parsers.md) | File tree, module graph, symbol table; the budgets on each | DERIVED |
| [03](03-scorer.md) | Findings to axes to a letter, and the honesty properties | DERIVED |
| [04](04-domains.md) | Classification, similarity, dependency edges, clustering | DERIVED |
| [05](05-generation.md) | The model path: facts in, prose out, and what the prompt forbids | mixed |
| [06](06-trust-boundary.md) | **The argument.** What may cross the line between measured and generated | AUTHORED |
| [07](07-frontend.md) | The build seam: partials to bundles to pages | DERIVED |
| [08](08-cicd.md) | The scheduled run, the budgets, and the pre-commit gate | DERIVED |
| [09](09-graph.md) | The two graphs, their node model, and walking between neighbours | DERIVED |
| [10](10-embeddings.md) | The vector pipeline, and why it never touches the grade | DERIVED |
| [11](11-agent-interface.md) | How a program asks this system a question | DERIVED |
| [12](12-publishing.md) | An article becomes a page, a feed, an index and a sitemap | DERIVED |
| [13](13-supply-chain.md) | Dependencies, advisories, and scanning other people's secrets | DERIVED |

Start at [06](06-trust-boundary.md) if you only read one. It is the picture that
explains why everything else is shaped as it is: when the code is not yours, a
claim about it is only worth publishing if it traces to a check that ran.

## What is not here

- **Observability** has no file of its own; the eleven hermetic test suites are
  the guards, and they are covered in [08](08-cicd.md).
- **Storage** has no file of its own; the sqlite database exists to serve the
  article pages, and is covered in [12](12-publishing.md).

## Keeping these true

These are hand-written and will drift, which is the same failure the published
figures had before they were counted. Two things reduce it: each file names its
sources, so a reader can re-run the measurement; and each figure was taken from
a command rather than recalled at the time of writing.

The stronger fix is to generate the DERIVED files rather than write them.
Roughly two thirds of what is in them — the stage order, the check inventory,
the axis weights, the artefact sizes, the bundle composition — is already
computable from the repository. That is not done yet, and until it is, these
files are a snapshot rather than a mirror.

Writing them surfaced a number of defects in the code they describe, including
several stale counts in comments that assert figures the estate has long since
passed. Those are tracked separately from this folder.
