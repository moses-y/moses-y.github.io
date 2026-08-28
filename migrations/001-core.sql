-- 001-core.sql
--
-- The relational core. Every table here maps to data the pipeline already
-- writes; nothing is speculative structure. See docs/DATA-MODEL.md.
--
-- The point of this migration is the join tables. Three relationships were
-- many-to-many all along and were stored as nested objects, which is why the
-- same fact ended up copied into six files with no way to check they agreed:
--
--   PROFILE_WEIGHT   profile x axis -> weight     (was PROFILES, nested object)
--   GRADE_CHARGE     check x axis -> cost         (was PENALTIES, nested array)
--   ADVISORY_AFFECTS advisory x package -> range  (was nested in osv.json)
--
-- Foreign keys are declared and enforced. That is most of the value: a finding
-- charged to an axis that does not exist, or a grade for a repo that is gone,
-- becomes impossible rather than merely unlikely.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- core ----

CREATE TABLE repo (
  id            INTEGER PRIMARY KEY,          -- GitHub numeric id, the join key everywhere
  name          TEXT    NOT NULL,
  display_name  TEXT,
  description   TEXT,
  url           TEXT,
  language      TEXT,                          -- null for 82 of 1440, legitimately
  stars         INTEGER NOT NULL DEFAULT 0,
  forks         INTEGER NOT NULL DEFAULT 0,
  type          TEXT    NOT NULL DEFAULT 'fork' CHECK (type IN ('fork','original')),
  image         TEXT,
  forked_at     TEXT,
  updated_at    TEXT,
  read_time     INTEGER NOT NULL DEFAULT 2,
  -- The upstream is often itself in the estate, so this is a real self key.
  -- It was three denormalised columns copied onto every fork.
  parent_id     INTEGER REFERENCES repo(id) ON DELETE SET NULL,
  parent_name   TEXT,                          -- kept: upstream may be outside the estate
  parent_url    TEXT,
  parent_stars  INTEGER
);
CREATE INDEX idx_repo_language ON repo(language);
CREATE INDEX idx_repo_type     ON repo(type);
CREATE INDEX idx_repo_updated  ON repo(updated_at DESC);
CREATE INDEX idx_repo_parent   ON repo(parent_id);

-- TIER 1. Model-written, ~1,331 calls and ~12 days of cron to reproduce.
-- This table and `embedding` are the only things here that cost real money.
CREATE TABLE article (
  repo_id         INTEGER PRIMARY KEY REFERENCES repo(id) ON DELETE CASCADE,
  summary         TEXT    NOT NULL,
  article_version INTEGER NOT NULL DEFAULT 1,  -- was forks.json `av`
  model           TEXT,
  generated_at    TEXT
);
CREATE INDEX idx_article_version ON article(article_version);

-- TIER 1.
CREATE TABLE embedding (
  repo_id  INTEGER PRIMARY KEY REFERENCES repo(id) ON DELETE CASCADE,
  vector   BLOB    NOT NULL,                   -- float32, `dims` wide
  dims     INTEGER NOT NULL,
  model    TEXT,
  built_at TEXT
);

CREATE TABLE knowledge_graph (
  repo_id         INTEGER PRIMARY KEY REFERENCES repo(id) ON DELETE CASCADE,
  total_files     INTEGER,
  has_docker      INTEGER,
  has_ci          INTEGER,
  ci_platform     TEXT,
  package_manager TEXT,
  test_file_count INTEGER,
  doc_count       INTEGER,
  is_collection   INTEGER NOT NULL DEFAULT 0   -- a shelf of projects, not one codebase
);

CREATE TABLE subproject (
  id        INTEGER PRIMARY KEY,
  repo_id   INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  path      TEXT    NOT NULL,
  files     INTEGER,
  notebooks INTEGER,
  UNIQUE (repo_id, path)
);

-- ------------------------------------------------------ static analysis ----

CREATE TABLE module (
  id          INTEGER PRIMARY KEY,
  repo_id     INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  path        TEXT    NOT NULL,
  ca          INTEGER,                          -- afferent coupling
  ce          INTEGER,                          -- efferent coupling
  instability REAL,                             -- ce / (ca + ce)
  in_cycle    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (repo_id, path)
);
CREATE INDEX idx_module_repo  ON module(repo_id);
CREATE INDEX idx_module_cycle ON module(repo_id, in_cycle);

CREATE TABLE import_edge (
  repo_id        INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  from_module_id INTEGER NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  to_module_id   INTEGER NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  PRIMARY KEY (from_module_id, to_module_id)
) WITHOUT ROWID;
CREATE INDEX idx_import_repo ON import_edge(repo_id);

-- file and line are what make a claim citable. They were on disk all along and
-- the fact bundle discarded them until 3ffe5ac1.
CREATE TABLE symbol (
  id      INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  name    TEXT    NOT NULL,
  kind    TEXT    NOT NULL,                     -- function | class
  file    TEXT,
  line    INTEGER
);
CREATE INDEX idx_symbol_repo ON symbol(repo_id);
CREATE INDEX idx_symbol_name ON symbol(name);
CREATE INDEX idx_symbol_file ON symbol(repo_id, file);

CREATE TABLE entry_point (
  id      INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  file    TEXT    NOT NULL,
  line    INTEGER,
  reach   INTEGER                               -- how much of the repo it reaches
);
CREATE INDEX idx_entry_repo ON entry_point(repo_id);

CREATE TABLE effect (
  repo_id INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  kind    TEXT    NOT NULL,                     -- db write | network | fs | subprocess
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, kind)
) WITHOUT ROWID;

-- -------------------------------------------------------------- grading ----

CREATE TABLE axis (
  key            TEXT PRIMARY KEY,              -- 8 of them
  label          TEXT NOT NULL,
  default_weight REAL NOT NULL
);

CREATE TABLE profile (
  name TEXT PRIMARY KEY                         -- frontend service library notebook cli infra docs default
);

-- JOIN TABLE 1. Was PROFILES, a nested object of overrides, which meant the
-- weights a repo was graded under were copied onto all 1,440 grade records.
CREATE TABLE profile_weight (
  profile  TEXT NOT NULL REFERENCES profile(name) ON DELETE CASCADE,
  axis_key TEXT NOT NULL REFERENCES axis(key)    ON DELETE CASCADE,
  weight   REAL NOT NULL,
  PRIMARY KEY (profile, axis_key)
) WITHOUT ROWID;

CREATE TABLE check_def (
  id               TEXT PRIMARY KEY,            -- 62 of them, e.g. no-license
  family           TEXT,                        -- ci secrets supply quality runtime osv
  default_severity TEXT,
  checks_version   INTEGER NOT NULL DEFAULT 1
);

-- JOIN TABLE 2. Was PENALTIES: {checkId: [axisKey, cost]} - a two-element
-- array standing in for a relationship. A check charged to no axis was
-- invisible; a test exists precisely because that had happened.
CREATE TABLE grade_charge (
  check_id TEXT NOT NULL REFERENCES check_def(id) ON DELETE CASCADE,
  axis_key TEXT NOT NULL REFERENCES axis(key)     ON DELETE CASCADE,
  cost     REAL NOT NULL,
  PRIMARY KEY (check_id, axis_key)
) WITHOUT ROWID;

CREATE TABLE finding (
  id             INTEGER PRIMARY KEY,
  repo_id        INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  check_id       TEXT    REFERENCES check_def(id),
  severity       TEXT,
  category       TEXT,
  title          TEXT,
  where_at       TEXT,                          -- `where` is reserved
  evidence       TEXT,
  why            TEXT,
  fix            TEXT,
  rank           REAL,                          -- severity x confidence x reach
  n              INTEGER NOT NULL DEFAULT 1,
  checks_version INTEGER
);
CREATE INDEX idx_finding_repo     ON finding(repo_id);
CREATE INDEX idx_finding_check    ON finding(check_id);
CREATE INDEX idx_finding_severity ON finding(severity);

CREATE TABLE grade (
  repo_id      INTEGER PRIMARY KEY REFERENCES repo(id) ON DELETE CASCADE,
  score        REAL,
  letter       TEXT,
  next_letter  TEXT,
  next_points  REAL,
  profile      TEXT REFERENCES profile(name),
  -- Two source files use the name 'audited' for different things:
  -- grades.json means WHETHER (boolean), hygiene.json means WHEN (ISO string).
  -- Reading one as the other is exactly the class of mistake typed columns are
  -- for, and it was caught on the first load.
  audited      INTEGER NOT NULL DEFAULT 0,
  audited_at   TEXT,
  -- Load-bearing. A repo graded without module-level analysis is partial and
  -- drawn desaturated: a neutral score on an axis nothing measured is a false
  -- claim, not a safe default. Must survive every future migration.
  partial      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_grade_letter ON grade(letter);

CREATE TABLE grade_axis (
  repo_id  INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  axis_key TEXT    NOT NULL REFERENCES axis(key) ON DELETE CASCADE,
  weight   REAL,
  score    REAL,
  evidence TEXT,
  partial  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, axis_key)
) WITHOUT ROWID;

-- --------------------------------------------------------- supply chain ----

CREATE TABLE package (
  ecosystem      TEXT NOT NULL,                 -- npm pypi cargo go packagist
  name           TEXT NOT NULL,
  latest_version TEXT,
  description    TEXT,
  published_at   TEXT,
  PRIMARY KEY (ecosystem, name)
);

CREATE TABLE dependency (
  repo_id      INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  ecosystem    TEXT    NOT NULL,
  package_name TEXT    NOT NULL,
  spec         TEXT,                            -- declared range, e.g. ==1.26.4
  PRIMARY KEY (repo_id, ecosystem, package_name)
) WITHOUT ROWID;
CREATE INDEX idx_dependency_pkg ON dependency(ecosystem, package_name);

CREATE TABLE advisory (
  osv_id    TEXT PRIMARY KEY,
  severity  TEXT,
  summary   TEXT,
  published TEXT
);

-- JOIN TABLE 3. Was a nested array inside osv.json, so "which repos use a
-- package this advisory affects" required a full scan and a manual join.
CREATE TABLE advisory_affects (
  osv_id        TEXT NOT NULL REFERENCES advisory(osv_id) ON DELETE CASCADE,
  ecosystem     TEXT NOT NULL,
  package_name  TEXT NOT NULL,
  version_range TEXT,
  PRIMARY KEY (osv_id, ecosystem, package_name)
) WITHOUT ROWID;

CREATE TABLE repo_advisory (
  repo_id INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  osv_id  TEXT    NOT NULL REFERENCES advisory(osv_id) ON DELETE CASCADE,
  -- Two different claims, and flattening them would overstate what is known:
  -- pinned to an affected version, versus a version that could not be resolved.
  status  TEXT    NOT NULL CHECK (status IN ('confirmed','version-unknown')),
  PRIMARY KEY (repo_id, osv_id)
) WITHOUT ROWID;

-- ------------------------------------------------ relations and clusters ----

CREATE TABLE cluster (
  id          TEXT PRIMARY KEY,              -- c001 style, not numeric
  size        INTEGER,
  method      TEXT,                          -- louvain modularity
  threshold   REAL,
  mean_score  REAL,
  cross_domain INTEGER NOT NULL DEFAULT 0,
  keeper_repo_id INTEGER REFERENCES repo(id) ON DELETE SET NULL
);

CREATE TABLE cluster_member (
  cluster_id TEXT    NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  repo_id    INTEGER NOT NULL REFERENCES repo(id)    ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, repo_id)
) WITHOUT ROWID;

CREATE TABLE relation (
  from_repo_id INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  to_repo_id   INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,                -- shared-dependency | semantic-similarity
  -- The project's best idea, currently applied to two edge types and nothing
  -- else. As a column it is queryable and every consumer can be made to state it.
  provenance   TEXT    NOT NULL CHECK (provenance IN ('EXTRACTED','INFERRED')),
  weight       REAL,
  evidence     TEXT,                            -- named packages, or a cosine score
  PRIMARY KEY (from_repo_id, to_repo_id, kind)
) WITHOUT ROWID;
CREATE INDEX idx_relation_to         ON relation(to_repo_id);
CREATE INDEX idx_relation_provenance ON relation(provenance);
