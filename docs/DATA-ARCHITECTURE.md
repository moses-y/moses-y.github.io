# Data layer: audit and target architecture

Measured 2026-08-29. Working tree ~500 MB across ~8,900 tracked files.

## The verdict

The sharded-JSON-over-static-files design is CORRECT for what this is: a
1,400-row dataset addressed by primary key, read by both browsers and language
models, served with no server. Its problems are not architectural. They are an
unseeded PRNG, a mutable sort key, a missing skip-if-unchanged guard, one page
that forgot to use the shards, and a 20 MB binary nobody reads.

Explicitly REJECTED, with reasons:

  SQLite consolidation / sql.js-httpvfs
    The queries actually issued are "give me repo X" (point lookup) and "give me
    the index" (full scan) - the two shapes a range-request VFS wins least at. A
    4.6 KB kin shard is already one round trip. It needs Range support to survive
    any CDN placed in front. And it is opaque to the agent readers this dataset
    exists to court: a model can curl data/kin/123.json; it cannot speak the
    SQLite page protocol. Consolidating trades away the one property this
    project is actually optimising for.

  Parquet / DuckDB-WASM
    Columnar formats shine on analytical scans over millions of rows. There are
    1,440. The DuckDB-WASM bundle is larger than the entire published JSON layer.

## Findings, by size of win

### D1. forks.db is 20.8 MB of binary read by nobody          [DELETE]

No fetch of forks.db, no sql.js, no initSqlJs anywhere in assets/js or any HTML.
Referenced only by the workflow that builds and commits it, plus two STALE
comments (site.js:291, site/02-stats.js:51) claiming forks.json gzips to ~750 KB
- it is 7.42 MB - and that forks.db is "already loaded", which it is not.

Contents are a lossy subset of forks.json plus an FTS4 index that
data/search.json (142 KB) already replaces at 0.3% of the size. Its topics table
has TWO rows for 1,440 repositories, so that table and its index are dead too.

### D2. Unseeded UMAP was ~96% of all churn                   [FIXED 2026-08-29]

lib-embeddings.js passed no random option, so umap-js used Math.random and every
run re-projected all 1,440 repos. 1,440 x 3 coords x 2 = ~8,640 lines of noise
out of a ~9,036-line forks.json diff, every two hours, plus the similarity links
derived from it churning into index.json, clusters.json and all 1,425 kin
shards. Now seeded with mulberry32. Verified: seeded runs byte-identical,
unseeded runs differ.

### D3. Sort by a mutable key                                 [TODO]

update-forks.js:345 sorts by updatedAt descending, so any upstream push
reshuffles the array and moves whole 60-line repo blocks. Worse:
data/search.json stores ARRAY POSITIONS, not ids (build-index.js:158-165), so
the search index is coupled to a volatile sort order.

Fix: sort by id (immutable); let the client sort by updatedAt at read time
(microseconds over 1,440 records). Emit ids rather than positions in search.json.

### D4. No stable serialiser, and no skip-if-unchanged        [TODO]

update-forks.js:391 is the ONLY writer that indents (null, 2) - on the 46 MB
file, where it costs the most. The other 12 writers minify to one line, so git
stores a whole new 4.3 MB blob for hygiene.json when one byte changes. Both
extremes are present and both are wrong.

Every file also carries its own generated timestamp, so ~10 files change every
run whether or not any content did - 11 MB of git objects every two hours to
record that the clock moved.

Fix: src/lib/lib-json.js exporting writeStable(path, obj): sort keys
recursively, indent, and compare against disk with the timestamp field MASKED,
skipping the write entirely when nothing else changed. Move generated to a
sidecar.

### D5. report.html reaches past the shards                   [TODO]

It fetches the full 4.29 MB data/hygiene.json (report.html:108) and the full
2.97 MB data/grades.json (:120) to render ONE repository - ~534 KB gzipped for a
single view. It already fetches structure/<id>.deep.json, so the page is
half-sharded and simply forgot the other two.

Fix: emit data/findings/<id>.json and data/grade/<id>.json alongside the
monoliths (agents and the cluster builder still want the monoliths). ~15 KB per
view. Largest client-side win available, and a two-file change.

### D6. 184 MB of symbols serve zero page loads               [DECIDE]

data/symbols/<id>.json - 1,052 files, avg 179 KB - is read ONLY by lib-facts.js,
a build-time module. Same for the non-deep half of structure/ (~118 MB), which
no browser fetches. Either this is agent-readable published data, in which case
declare it in COMPANIONS and give it a schema, or it is build state, in which
case it belongs in the state store and not on the served branch.

### D7. Schema discipline is excellent and covers one file    [TODO]

lib-schema.js is genuinely good - schema as code, emitted as data, drift-tested
in BOTH directions by test-relations.js (emitted-but-undeclared AND
declared-but-no-longer-emitted). But test-relations.js:41 asserts the source is
index.json, which pins the scope to a single 818 KB file out of ~500 MB.

Undeclared: forks.json (46 MB), hygiene.json, osv.json (not even listed in
COMPANIONS), grades.json, deps.json, registry.json, symbols/, structure/, kin/.

Fix: generalise to a registry of {path, title, top, record, provenance}, then add
the check that cannot currently fail: every file under data/ and structure/ must
have an entry, and every entry must have a file.

### D8. Stale files served as if current                      [TODO]

data/registry.json, data/clusters.md and data/symbols-status.json are dated a
full day behind their siblings. Wire them into the run or delete them - a stale
file at a live URL with no checkable generated field is worse than a missing one.

### D9. No single source of truth                             [STRUCTURAL]

Repo attributes {name, language, stars, domain, grade} are copied into six
artifacts with six writers. Grade alone lives in grades.json, grade-map.json,
clusters.json members, and kin/*.json (self AND every neighbour), so one grade
change fans out across N shards.

Drift is already documented in the code rather than hypothetical:
build-index.js:130-134 explains that stored taxonomy disagreed with the records
("98 in Other on the page while only 2 were left in the data") and the fix was to
recount at index time rather than repair the upstream copy.

The read-model fan-out is a defensible pattern, but only with ONE authoritative
write store. Here the write store (forks.json) is itself a read model carrying
derived fields, which is why build-index.js has to override it.

## Target architecture

Split the three things forks.json currently is at once:

  STATE      .state/repos/<id>.json - raw GitHub facts, AI summary, embedding.
             Sharded, so a run touching 40 repos writes 40 small files rather
             than one 46 MB file. Lives in an orphan branch or the Actions
             cache - embeddings.json already sets exactly this precedent, and
             the reasoning written in .gitignore for it is right.

  PUBLISHED  data/ and structure/ on master. Pure derivations. No accumulator
             semantics, no fallback role.

  DELETE     forks.json from the published surface, and the 7.42 MB-gzipped
             fallback paths at index-record.js:95 and site.js:845. Pulling 7 MB
             onto a phone is not graceful degradation; show an error.

Caching: emit data/index-<sha256:8>.json as immutable plus a ~200 B mutable
data/manifest.json mapping logical name to hashed path. index.json is currently
fetched with cache no-cache in three places precisely because it is mutable at a
fixed URL. Keep data/index.json as a stable alias for agent readers. Do NOT hash
the shards - kin/<id>.json derives its URL from the id, which is the point.

## Sequencing

| Step | Effort | Removes | Risk |
|---|---|---|---|
| D1 delete forks.db | 1 h | 20.8 MB/run of binary churn | none, zero consumers |
| D2 seed UMAP | DONE | ~96% of text churn | verified |
| D3 sort by id | 2 h | block reshuffling | low |
| D4 stable serialiser | 4 h | timestamp-only rewrites | low |
| D5 shard report.html | 4 h | 534 KB to ~15 KB per view | low |
| D6 symbols/structure home | 1 h | a decision, then a move | low |
| D7 schema registry | 2-3 d | undeclared blobs | low, incremental |
| D9 STATE/PUBLISHED split | 1-2 d | 46 MB from master | MEDIUM, do last |

D1 + D3 + D4 are most of the benefit in under a day and are individually
revertable. D9 needs D2 through D4 first, so that the churn is legible enough to
verify the split actually worked.
