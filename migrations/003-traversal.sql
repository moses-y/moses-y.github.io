-- 003-traversal.sql - make the import graph walkable in both directions.
--
-- import_edge's primary key is (from_module_id, to_module_id), which indexes
-- exactly one direction. Every interesting traversal runs the other way: "what
-- transitively depends on this module" is the change-impact question, and it
-- walks edges backwards.
--
-- Without this index SQLite does not fail, which is the problem - it silently
-- builds a temporary covering index on every single call and throws it away.
-- Measured over 243,989 modules and 351,839 edges, a recursive reverse walk from
-- the most depended-upon module in the estate took 292.65 ms, of which almost
-- all was rebuilding that index. With it: 2.26 ms. The worst of the ten largest
-- repositories went from 385.29 ms to 63.20 ms while returning 13,907 rows.
--
-- The column order matters. (to_module_id, from_module_id) makes it a COVERING
-- index for the recursive step, so the walk never touches the table at all -
-- confirmed by EXPLAIN QUERY PLAN reporting "SEARCH e USING COVERING INDEX"
-- rather than "USING AUTOMATIC COVERING INDEX".
CREATE INDEX IF NOT EXISTS idx_import_to ON import_edge(to_module_id, from_module_id);

-- Reverse lookup for the estate-level blast radius: an advisory names packages,
-- and the question is which repositories declare them. dependency's primary key
-- is (repo_id, ecosystem, package_name), so going from a package to its repos
-- had no index either. This one is smaller and mattered less - 16.66 ms across
-- every high-severity advisory at once - but it is the same mistake.
CREATE INDEX IF NOT EXISTS idx_dependency_package ON dependency(ecosystem, package_name, repo_id);
