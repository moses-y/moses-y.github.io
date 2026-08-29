/*
 * lib-subprojects.js - find the separate projects living inside one repository.
 *
 * Some repos are not a project, they are a shelf of them.
 * Data-Science-Machine-Learning holds 1,302 files across 34 top-level
 * directories - "Cape Town Airbnb Data Science Project", "BI Analyst Case
 * study", "Amazon Product Review Sentiment Analysis" - each self-contained,
 * mostly notebooks with their own data beside them. Describing that repo as one
 * codebase is the reason its briefing said nothing: there is no single thing to
 * describe.
 *
 * A top-level directory counts as a project when it carries its own code or
 * notebooks. Directories that only hold assets (images, exports) do not.
 */
'use strict';

const CODE = /\.(ipynb|py|r|sql|js|ts|jsx|tsx|java|scala|go|rs|cpp|c)$/i;
const NOTEBOOK = /\.ipynb$/i;
const DATA = /\.(csv|tsv|xlsx|xls|parquet|db|sqlite|json)$/i;
const DOC = /\.(pdf|docx|pptx|md|txt)$/i;

/*
 * Directories that are shared scaffolding rather than a project of their own.
 *
 * The second group is the one that matters for counting. A conventionally
 * layered application has src/, api/, dashboard/ and notebooks/ sitting side by
 * side, which looks exactly like four projects to a directory count -
 * retail-analytics was detected as a collection of four on that basis. Those
 * names are architecture, not projects, so a repository using them is one
 * project however many of them it has.
 */
const NOT_A_PROJECT = new Set(['.github', '.vscode', '.idea', 'node_modules',
  'venv', '.venv', 'env', 'assets', 'images', 'img', 'static', 'public',
  'docs', 'doc', 'data', 'datasets', 'plots', 'figures', 'output', 'outputs',
  'test', 'tests', '__pycache__', 'dist', 'build',
  'src', 'lib', 'app', 'api', 'core', 'server', 'client', 'backend',
  'frontend', 'web', 'ui', 'cli', 'scripts', 'notebooks', 'config',
  'migrations', 'models', 'utils', 'common', 'internal', 'pkg', 'cmd']);

function detectSubProjects(fileTree, opts) {
  const min = (opts && opts.minCode) || 1;
  const groups = new Map();

  for (const p of fileTree || []) {
    const i = String(p).indexOf('/');
    if (i < 1) continue;                       // a root file is not a project
    const top = p.slice(0, i);
    if (NOT_A_PROJECT.has(top.toLowerCase())) continue;
    let g = groups.get(top);
    if (!g) { g = { name: top, files: 0, notebooks: 0, code: 0, data: 0, docs: 0 }; groups.set(top, g); }
    g.files++;
    if (CODE.test(p)) g.code++;
    if (NOTEBOOK.test(p)) g.notebooks++;
    if (DATA.test(p)) g.data++;
    if (DOC.test(p)) g.docs++;
  }

  return [...groups.values()]
    .filter(g => g.code >= min)
    .sort((a, b) => b.code - a.code || b.files - a.files);
}

// A repo is a collection when several independent projects sit side by side and
// no single one of them is the repository's purpose. Two is a coincidence; the
// threshold is deliberately not 2.
function isCollection(subProjects, totalFiles) {
  if (!subProjects || subProjects.length < 4) return false;
  const inProjects = subProjects.reduce((n, g) => n + g.files, 0);
  return inProjects >= (totalFiles || inProjects) * 0.5;
}

/*
 * How many distinct projects a repository holds. One, unless it is a shelf of
 * them - and then it is the number on the shelf.
 *
 * Counting repositories understates the original work here, because
 * Data-Science-Machine-Learning is 29 self-contained projects that happen to
 * share a remote. Counting them individually is the truer figure, and it is the
 * same reasoning the briefing already applies: describing that repository as
 * one codebase says nothing, because there is no single thing to describe.
 *
 * Reads the stored subProjects rather than a file tree, so a count can be taken
 * from forks.json without re-walking anything, and re-filters them through
 * NOT_A_PROJECT so a set extended here takes effect before the next full crawl
 * rewrites the stored lists.
 */
function projectCount(kg) {
  if (!kg) return 1;
  const subs = (kg.subProjects || [])
    .filter(g => !NOT_A_PROJECT.has(String(g.name || '').toLowerCase()));
  return isCollection(subs, kg.totalFiles) ? subs.length : 1;
}

module.exports = { detectSubProjects, isCollection, projectCount, NOT_A_PROJECT };
