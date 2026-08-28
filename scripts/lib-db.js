/*
 * lib-db.js - the state store, and the one migration system.
 *
 * Uses node:sqlite, built into Node 22+ and therefore not a dependency. CI runs
 * Node 24. That matters more than it sounds: the last database here was 20 MB
 * of sql.js output committed to git and read by nobody, and part of why it
 * rotted was that it cost a dependency and a build step to touch.
 *
 * The database is the system of record. It is NOT committed - a binary rewritten
 * every two hours is exactly the mistake forks.db made. Published JSON is a
 * projection of this, and serving does not change: static files on a CDN remain
 * the cheapest read path available.
 *
 * On migrations. The pipeline already had a migration system; it had simply been
 * invented four times, stored under four different keys and compared four
 * different ways:
 *
 *   build-deps.js           DEPS_VERSION     versions[id] >= X
 *   build-symbols.js        SYMBOLS_VERSION  (j.v || 1) !== X
 *   lib-hygiene.js          CHECKS_VERSION   (prev.v || 1) !== X
 *   lib-article-version.js  ARTICLE_VERSION  (existing.av || 1) >= X
 *
 * Those conflated two different things. Schema shape belongs here, applied once,
 * forward-only. Per-row staleness stays a column - finding.checks_version,
 * article.article_version - because it drives RECOMPUTE, not structure. Keeping
 * them separate is what stops a fifth system from being invented.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.GLOSSA_DB || path.join('.state', 'glossa.db');
const MIGRATIONS_DIR = 'migrations';

function ensureDir(p) {
  const d = path.dirname(p);
  if (d && d !== '.' && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/*
 * Forward-only, applied in filename order, each in its own transaction. A
 * migration that throws leaves the ones before it applied and itself rolled
 * back, which is the only failure mode worth designing for here: the database
 * is rebuildable from JSON and GitHub, so recovery is re-running, not repair.
 */
function migrate(db, dir) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => Number(r.version))
  );

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort()
    : [];

  const ran = [];
  for (const f of files) {
    const version = parseInt(f, 10);
    if (!Number.isFinite(version)) {
      throw new Error(`migration "${f}" does not start with a version number`);
    }
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(version, f, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
    ran.push(f);
  }
  return ran;
}

function open(opts) {
  const o = opts || {};
  const file = o.path || DB_PATH;
  if (file !== ':memory:') ensureDir(file);

  const db = new DatabaseSync(file);
  // Enforced, not decorative. A finding charged to an axis that does not exist
  // becomes impossible rather than merely unlikely - which is the whole reason
  // the six denormalised copies were able to drift apart.
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');

  const ran = migrate(db, o.migrations || MIGRATIONS_DIR);
  if (ran.length && !o.quiet) {
    console.log(`  migrations applied: ${ran.join(', ')}`);
  }
  return db;
}

/*
 * Runs fn inside a transaction. The loaders below write tens of thousands of
 * rows; without this each INSERT is its own transaction and its own fsync,
 * which is the difference between seconds and minutes.
 */
function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const bool = v => (v ? 1 : 0);

module.exports = { open, migrate, tx, bool, DB_PATH };
