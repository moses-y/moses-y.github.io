/*
 * checks-quality.js - verification, licensing, and reproducibility.
 *
 * Thresholds here are set from measured distributions over the estate rather
 * than taste. Test-to-source ratio: p50 is 0.091, and a 0.10 floor would fire on
 * 52% of repos, which is noise, so the line is 0.05 with a source-file minimum
 * and the ratio is always reported rather than reduced to a badge.
 *
 * The notebook rules matter disproportionately here: several repos are portfolios
 * of data-science work where the notebook IS the deliverable, so a notebook that
 * cannot be re-run is a real production failure, not a style note.
 */
'use strict';
const { register } = require('../lib/lib-hygiene.js');

const EXCLUDE = /(^|\/)(node_modules|bower_components|vendor|third_party|\.venv|venv|site-packages|dist|build|out|target|\.next|__pycache__|\.pytest_cache|coverage|htmlcov|examples?|docs?|fixtures?|testdata)\//i;
const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|kts|cs|cc|cpp|cxx|c|swift|php|scala|vue|svelte|ex|exs|dart|lua|r|jl)$/i;

// The corrected test rule. The old one matched any path containing "test", which
// caught "latest/", "contest.py" and "test_support/", inflating counts 3x to 20x,
// and it ran against a listing truncated at 200 paths so a well-tested repo could
// be recorded as having none.
const TEST_DIR = /(^|\/)(tests?|specs?|__tests__|__test__|testing|e2e|integration[_-]tests?|unit[_-]tests?)\//i;
const TEST_FILE = /(^|\/)(test_[^/]+|[^/]*[_.-]test|[^/]*[_.-]spec|[^/]*Test|[^/]*Spec|conftest)\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|cs|cpp|php|scala|ex|exs|dart)$/;

function sourceFiles(ctx) {
  return ctx.tree.filter(f => !EXCLUDE.test(f.path) && CODE_EXT.test(f.path));
}
function testFiles(ctx) {
  return sourceFiles(ctx).filter(f => TEST_DIR.test(f.path) || TEST_FILE.test(f.path));
}
function notebooks(ctx) {
  return ctx.tree.filter(f => /\.ipynb$/i.test(f.path) && !EXCLUDE.test(f.path));
}

register({
  id: 'no-tests-at-all',
  title: 'Add a test suite; this repository has none',
  category: 'verification',
  severity: 'high',
  confidence: 0.8,
  why: 'Any change ships with no signal that existing behaviour still holds, so a regression reaches production undetected.',
  fix: 'Add one test per public entry point, then a CI step that runs them.',
  run(ctx) {
    const src = sourceFiles(ctx);
    if (src.length < 10) return null;
    if (testFiles(ctx).length) return null;
    // A notebook portfolio legitimately has no unit tests; other rules cover it.
    if (notebooks(ctx).length > src.length) return null;
    return { where: '', evidence: src.length + ' source files, no test files', n: src.length };
  }
});

register({
  id: 'test-suite-too-small',
  title: 'Expand the test suite; it cannot cover this codebase',
  category: 'verification',
  severity: 'medium',
  confidence: 0.5,
  why: 'A reviewer reads "has tests" and assumes a safety net that covers two files out of eighty-five, which is how untested paths ship behind a green badge.',
  fix: 'Add tests for the highest fan-in modules first.',
  run(ctx) {
    const src = sourceFiles(ctx), tests = testFiles(ctx);
    if (src.length < 25 || !tests.length) return null;
    const ratio = tests.length / src.length;
    if (ratio >= 0.05) return null;
    // One large table-driven suite has a low file ratio and real coverage.
    const testBytes = tests.reduce((a, f) => a + (f.size || 0), 0);
    const srcBytes = src.reduce((a, f) => a + (f.size || 0), 0);
    if (srcBytes && testBytes / srcBytes > 0.08) return null;
    if (tests.some(f => (f.size || 0) > 20000)) return null;
    return {
      where: '',
      evidence: tests.length + ' test files against ' + src.length + ' source files (ratio ' + ratio.toFixed(3) + ')',
      n: tests.length
    };
  }
});

register({
  id: 'no-license',
  title: 'Add a LICENSE; redistribution rights are undefined',
  category: 'legal',
  severity: 'high',
  confidence: 0.85,
  why: 'With no licence the default is all rights reserved, so this code cannot legally be reused, which matters most for the owner\'s own work carried into client engagements.',
  fix: 'Add MIT or Apache-2.0 at the repository root.',
  run(ctx) {
    // Anchored, unlike the old substring test, which matched docs/licensing.md
    // and every vendored third-party licence text.
    const has = ctx.find(/^(LICEN[CS]E|COPYING|COPYRIGHT|UNLICENSE)([-.][A-Za-z0-9]+)?(\.(md|txt|rst))?$/i).length ||
      ctx.find(/^LICENSES\//i).length;
    if (has) return null;
    if (sourceFiles(ctx).length < 5) return null;
    return { where: '', evidence: 'no licence file at the repository root', n: 1 };
  }
});

register({
  id: 'readme-stub',
  title: 'Expand the README; it does not say how to run this',
  category: 'documentation',
  severity: 'medium',
  confidence: 0.7,
  why: 'A 236-byte README for 1,302 files leaves no way to find the entry point, which is the state of the largest repository in this estate.',
  fix: 'Add install, run, and one worked example.',
  run(ctx) {
    const readme = ctx.find(/^README(\.md|\.rst|\.txt)?$/i)[0];
    const src = sourceFiles(ctx).length + notebooks(ctx).length;
    if (src < 40) return null;
    if (!readme) return { where: '', evidence: 'no README at all, for ' + src + ' code files', n: 1 };
    const bytes = ctx.sizeOf(readme);
    // Docs may live elsewhere.
    if (ctx.find(/^docs?\//).length >= 5 || ctx.has(/^(mkdocs\.yml|docusaurus\.config\.[jt]s)$/)) return null;
    if (bytes >= 1500) return null;
    return { where: readme, evidence: bytes + ' bytes of README for ' + src + ' code files', n: 1 };
  }
});

register({
  id: 'build-output-committed',
  title: 'Remove generated build output from version control',
  category: 'hygiene',
  severity: 'medium',
  confidence: 0.6,
  why: 'The reviewer reads src, production runs dist, and a stale bundle means the fix that was reviewed is not the code that executes.',
  fix: 'Gitignore the output directory and build in CI.',
  run(ctx) {
    // A Pages site must commit built assets at the root, including this one.
    if (ctx.has(/^(CNAME|\.nojekyll)$/)) return null;
    const out = ctx.tree.filter(f => /(^|\/)(dist|build|out|\.next|\.nuxt)\//.test(f.path))
      .filter(f => !/(^|\/)(examples?|docs)\//.test(f.path));
    if (out.length < 5) return null;
    // Only a finding when the source it was built from is also here.
    if (!ctx.has(/^(src|lib|app)\//)) return null;
    return { where: out[0].path.split('/')[0], evidence: out.length + ' generated files committed', n: out.length };
  }
});

register({
  id: 'large-binary-not-in-lfs',
  title: 'Move large binaries to Git LFS or out of the repository',
  category: 'hygiene',
  severity: 'medium',
  confidence: 0.7,
  why: 'One repository here carries twenty blobs over 5MB including a 10.9MB spreadsheet, so every clone and every CI checkout pays for data nobody diffs.',
  fix: 'Track those extensions with LFS, or move datasets to object storage and fetch them in a setup step.',
  run(ctx) {
    const big = ctx.tree.filter(f => (f.size || 0) >= 5000000);
    if (!big.length) return null;
    const attrs = ctx.read('.gitattributes');
    if (attrs && /filter=lfs/.test(attrs)) return null;
    if (ctx.has(/^(\.dvc\/|dvc\.yaml$)/)) return null;
    const top = big.sort((a, b) => b.size - a.size).slice(0, 3)
      .map(f => f.path.split('/').pop() + ' ' + (f.size / 1048576).toFixed(1) + 'MB');
    return { where: big[0].path, evidence: big.length + ' blobs over 5MB: ' + top.join(', '), n: big.length };
  }
});

register({
  id: 'repo-conventions-not-configured',
  title: 'Add the repository convention files this project lacks',
  category: 'hygiene',
  severity: 'low',
  confidence: 0.7,
  why: 'Without them one contributor\'s editor writes tabs into a Python file, a shell script commits with CRLF and fails in the container, and a notebook diff is unreviewable.',
  fix: 'Add .editorconfig, .gitattributes with text=auto eol=lf, and a formatter config.',
  run(ctx) {
    // Reported as one finding rather than three: individually each fires on
    // roughly 87% of the estate, which is noise, and the fix is a single sitting.
    const missing = [];
    if (!ctx.has(/^\.editorconfig$/)) missing.push('.editorconfig');
    if (!ctx.has(/^\.gitattributes$/)) missing.push('.gitattributes');
    const formatter = ctx.has(/^(\.prettierrc[a-z.]*|prettier\.config\.[mc]?js|\.clang-format|rustfmt\.toml|\.pre-commit-config\.ya?ml)$/);
    if (!formatter) missing.push('a formatter config');
    if (missing.length < 3) return null;           // only when all three are absent
    const langs = new Set(sourceFiles(ctx).map(f => f.path.split('.').pop().toLowerCase()));
    if (langs.size < 3) return null;
    return { where: '', evidence: 'missing ' + missing.join(', '), n: missing.length };
  }
});

/* ---- notebooks ----------------------------------------------------------
 * Read at most three, largest first, since output volume carries the risk, and
 * skip anything over 4MB. Every finding says how many were sampled: three of 261
 * cannot support a claim about all of them.
 */
function sampleNotebooks(ctx, limit) {
  return notebooks(ctx)
    .filter(f => (f.size || 0) <= 4194304)
    .sort((a, b) => (b.size || 0) - (a.size || 0))
    .slice(0, limit || 3)
    .map(f => {
      const t = ctx.read(f.path);
      if (!t) return null;
      try { return { path: f.path, nb: JSON.parse(t), size: f.size || 0 }; } catch (e) { return null; }
    })
    .filter(Boolean);
}
const codeCells = nb => (nb.cells || []).filter(c => c && c.cell_type === 'code');
const cellSource = c => (Array.isArray(c.source) ? c.source.join('') : String(c.source || ''));

register({
  id: 'notebook-outputs-committed',
  title: 'Strip notebook outputs before committing',
  category: 'reproducibility',
  severity: 'medium',
  confidence: 0.8,
  why: 'Outputs are where a printed dataframe of customer rows or a traceback containing a connection string ends up, and diff review never reads them.',
  fix: 'Install nbstripout and clear the existing outputs once.',
  run(ctx) {
    const big = notebooks(ctx).filter(f => (f.size || 0) > 1048576);
    if (!big.length) return null;
    // Rendered output is the deliverable in a docs or tutorial gallery.
    if (big.every(f => /(^|\/)(docs?|examples?|cookbook|tutorials?)\//i.test(f.path))) return null;
    const mb = (big.reduce((a, f) => a + f.size, 0) / 1048576).toFixed(1);
    return {
      where: big[0].path,
      evidence: big.length + ' notebook(s) over 1MB, ' + mb + 'MB total, dominated by stored output',
      n: big.length
    };
  }
});

register({
  id: 'notebook-monolithic-cell',
  title: 'Split the oversized notebook cell into steps',
  category: 'reproducibility',
  severity: 'medium',
  confidence: 0.75,
  why: 'A failure anywhere in a 22,000-character cell means rerunning the whole pipeline from load to model, so nothing can be debugged in isolation.',
  fix: 'Break at the load, clean, feature, model and evaluate boundaries.',
  run(ctx) {
    const sampled = sampleNotebooks(ctx);
    if (!sampled.length) return null;
    for (const { path, nb } of sampled) {
      const cells = codeCells(nb);
      if (cells.length < 1) continue;
      const sizes = cells.map(c => cellSource(c).replace(/"""[\s\S]*?"""/g, '').length);
      const total = sizes.reduce((a, b) => a + b, 0);
      const largest = Math.max(...sizes);
      if (largest > 4000 || (total >= 3000 && largest / total > 0.6)) {
        return {
          where: path,
          evidence: 'largest cell ' + largest + ' characters of ' + total + ' (' + sampled.length + ' notebooks sampled)',
          n: 1
        };
      }
    }
    return null;
  }
});

register({
  id: 'notebook-missing-random-seed',
  title: 'Set a random seed in notebooks that train or sample',
  category: 'reproducibility',
  severity: 'medium',
  confidence: 0.7,
  why: 'The accuracy figure in a client deliverable moves on every rerun, so nobody can tell whether a change helped.',
  fix: 'Set one SEED constant at the top and pass it to every stochastic call.',
  run(ctx) {
    const STOCHASTIC = /\b(train_test_split|KFold|shuffle\s*=\s*True|RandomForest|XGB|LGBM|KMeans|\.sample\(|np\.random\.|torch\.(randn|rand)|Dropout|umap\.UMAP|TSNE)\b/;
    const SEEDED = /\b(random_state\s*=|np\.random\.seed|random\.seed|torch\.manual_seed|tf\.random\.set_seed|set_seed|SEED)\b/;
    for (const { path, nb } of sampleNotebooks(ctx)) {
      const src = codeCells(nb).map(cellSource).join('\n');
      if (STOCHASTIC.test(src) && !SEEDED.test(src)) {
        return { where: path, evidence: 'stochastic operations with no seed', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'notebook-absolute-local-path',
  title: 'Replace absolute local paths with repository-relative ones',
  category: 'reproducibility',
  severity: 'high',
  confidence: 0.8,
  why: 'The notebook is the deliverable and it raises FileNotFoundError on the first cell for anyone but the author, which is total loss of reproducibility.',
  fix: 'Use paths relative to the notebook, or an environment variable with a documented default.',
  run(ctx) {
    const ABS = /["'](?:[A-Za-z]:\\{1,2}|\/(?:Users|home|Volumes|mnt\/[a-z])\/)[^"']{0,120}["']/;
    for (const { path, nb } of sampleNotebooks(ctx)) {
      for (const c of codeCells(nb)) {
        const src = cellSource(c).split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
        const m = src.match(ABS);
        if (!m) continue;
        if (/\/home\/(runner|vscode)\//.test(m[0])) continue;
        return { where: path, evidence: 'hardcoded path ' + m[0].slice(0, 60), n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'notebook-no-environment',
  title: 'Pin the environment these notebooks need',
  category: 'reproducibility',
  severity: 'high',
  confidence: 0.85,
  why: 'One repository here holds 261 notebooks and no requirements file anywhere in 1,302 files, so nothing in it can be run again by anyone.',
  fix: 'Freeze a requirements.txt or environment.yml beside the notebooks.',
  run(ctx) {
    const nbs = notebooks(ctx);
    if (nbs.length < 3) return null;
    if (ctx.has(/(^|\/)(requirements[^/]*\.txt|environment\.ya?ml|pyproject\.toml|Pipfile|uv\.lock|conda-lock\.yml)$/)) return null;
    if (ctx.has(/(^|\/)(Dockerfile|\.devcontainer\/)/)) return null;
    return { where: '', evidence: nbs.length + ' notebooks, no dependency manifest anywhere', n: nbs.length };
  }
});
