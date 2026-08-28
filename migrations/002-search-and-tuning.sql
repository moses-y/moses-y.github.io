-- 002-search-and-tuning.sql
--
-- Full-text search, and the index shapes that matter for the queries this
-- pipeline actually runs.
--
-- SEARCH. Removing forks.db removed an FTS4 index over name, display_name,
-- description and summary. data/search.json was described as its replacement,
-- and for three of those four fields it is - but it tokenises only
-- name/title/description/language/kind/domain (build-index.js:158). It has
-- never covered `summary`, which is the article prose: 7.3 MB of the most
-- expensive text in the estate, searchable by nothing.
--
-- FTS5 with external content stores no second copy of the prose - it indexes
-- the article table in place - so this costs an index, not a duplicate.

CREATE VIRTUAL TABLE article_fts USING fts5(
  summary,
  content     = 'article',
  content_rowid = 'repo_id',
  tokenize    = 'porter unicode61'
);

-- External-content FTS does not track writes on its own. These keep it exact;
-- getting this wrong is how an FTS index silently returns stale hits.
CREATE TRIGGER article_ai AFTER INSERT ON article BEGIN
  INSERT INTO article_fts(rowid, summary) VALUES (new.repo_id, new.summary);
END;
CREATE TRIGGER article_ad AFTER DELETE ON article BEGIN
  INSERT INTO article_fts(article_fts, rowid, summary) VALUES ('delete', old.repo_id, old.summary);
END;
CREATE TRIGGER article_au AFTER UPDATE ON article BEGIN
  INSERT INTO article_fts(article_fts, rowid, summary) VALUES ('delete', old.repo_id, old.summary);
  INSERT INTO article_fts(rowid, summary) VALUES (new.repo_id, new.summary);
END;

-- PARTIAL INDEXES. Indexing only the rows a query actually filters to. The
-- estate is 1,440 repos but only a few hundred carry a high-severity finding,
-- so an index over just those is a fraction of the size and stays hot.
CREATE INDEX idx_finding_high ON finding(repo_id, rank DESC)
  WHERE severity = 'high';

-- "Which repos are due for a recheck" is the pipeline's most repeated question
-- and was a 4.3 MB JSON parse plus a filter. Partial, because a fully graded
-- repo is not a candidate.
CREATE INDEX idx_grade_partial ON grade(repo_id)
  WHERE partial = 1;

-- Cycles are rare and always queried as a subset.
CREATE INDEX idx_module_in_cycle ON module(repo_id, path)
  WHERE in_cycle = 1;

-- COVERING INDEX. grade-map.json is id -> [score, letter, partial] and is
-- fetched by every graph page. With these three columns in the index, the
-- projection never touches the table at all.
CREATE INDEX idx_grade_map ON grade(repo_id, score, letter, partial);

-- The two provenance classes are queried separately - an EXTRACTED edge can be
-- checked, an INFERRED one is a cosine score - so keep them separable cheaply.
CREATE INDEX idx_relation_kind ON relation(kind, provenance, weight DESC);

-- Symbols are looked up by name across the whole estate ("who else defines
-- retryWithBackoff"), which is a different access path from per-repo listing.
CREATE INDEX idx_symbol_lookup ON symbol(name, repo_id, file, line);
