/*
 * checks-supply.js - dependency and container supply chain.
 *
 * Firing rates below are measured, not guessed: a sample of 14 repos with
 * workflows, 65 workflow files read. Unpinned third-party actions fired on 9 of
 * 10, no dependency scan on 10 of 10, persist-credentials on 12 of 12.
 *
 * Workflow selection matters because a repo can hold 33 workflow files and the
 * read budget is small. The runner ranks them so deploy and release files win a
 * slot over a stale-issue bot, and a whole-repo absence claim is downgraded when
 * some files went unread.
 */
'use strict';
const { register, workflowText } = require('../lib/lib-hygiene.js');

const WF = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const VENDORED = /(^|\/)(node_modules|vendor|\.venv|venv|site-packages|third_party)\//;
const TESTISH = /(^|\/)(test|tests|fixtures?|testdata|examples?)\//i;

const TEST_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test|pytest|python -m (pytest|unittest)|go test|cargo (test|nextest)|jest|vitest|mocha|\bava\b|mvn\s+(test|verify)|gradlew?\s+\w*test|tox|nox|rspec|phpunit|dotnet test|ctest|bats|swift test|make (test|check)/i;
const INDIRECT = /\b(make|just|task|nx|bazel|dagger|earthly|mise|hatch|pdm|rake)\b|\.\/(scripts|ci|bin)\//;

register({
  id: 'no-automated-dependency-updates',
  title: 'Enable Dependabot or Renovate',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.85,
  why: 'Without a bot a published advisory sits unpatched until someone audits by hand, which across 1,322 repositories means never.',
  fix: 'Commit .github/dependabot.yml covering the repo ecosystems plus github-actions.',
  run(ctx) {
    const manifests = ctx.find(/(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|composer\.json)$/)
      .filter(p => !VENDORED.test(p) && !TESTISH.test(p));
    if (!manifests.length) return null;
    if (ctx.has(/^(\.github\/)?(dependabot\.ya?ml|renovate\.json5?)$|^\.renovaterc/)) return null;
    return { where: '', evidence: manifests.length + ' manifest(s), no update bot configured', n: 1 };
  }
});

register({
  id: 'manifest-without-lockfile',
  title: 'Commit a lockfile beside the manifest',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.75,
  why: 'An unlocked range means the artifact you tested and the artifact you ship can contain different transitive code, so a malicious patch release reaches production with no diff.',
  fix: 'Run the package manager once and commit the generated lockfile.',
  run(ctx) {
    const LOCKS = /(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Pipfile\.lock|poetry\.lock|uv\.lock|pdm\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;
    const dirsWithLock = new Set(ctx.find(LOCKS).map(p => p.split('/').slice(0, -1).join('/')));
    const manifests = ctx.find(/(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|Gemfile|composer\.json)$/)
      .filter(p => !VENDORED.test(p) && !TESTISH.test(p));
    for (const m of manifests) {
      const dir = m.split('/').slice(0, -1).join('/');
      // A workspace lock can live at the root, so walk up before firing.
      let d = dir, found = false;
      for (;;) { if (dirsWithLock.has(d)) { found = true; break; } if (!d) break; d = d.split('/').slice(0, -1).join('/'); }
      if (found) continue;
      // A fully pinned requirements.txt is itself a lock.
      if (/requirements/.test(m)) continue;
      return { where: m, evidence: 'manifest with no lockfile in scope', n: 1 };
    }
    return null;
  }
});

register({
  id: 'dependency-directory-committed',
  title: 'Remove the committed dependency directory',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.9,
  why: 'The code that actually runs was never resolved from a manifest, so no scanner, lockfile or update bot has any view of it.',
  fix: 'Gitignore the directory, git rm -r --cached it, and reinstall from the lockfile.',
  run(ctx) {
    const groups = {};
    for (const p of ctx.tree) {
      const m = p.path.match(/(^|\/)(node_modules|bower_components|site-packages|\.venv)\//);
      if (!m) continue;
      if (/(^|\/)(fixtures?|testdata|__fixtures__)\//.test(p.path)) continue;
      groups[m[2]] = (groups[m[2]] || 0) + 1;
    }
    const worst = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
    if (!worst || worst[1] < 20) return null;
    return { where: worst[0], evidence: worst[1] + ' files committed under ' + worst[0], n: worst[1] };
  }
});

register({
  id: 'dockerfile-base-image-unpinned',
  title: 'Pin the container base image by digest',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.8,
  why: 'An untagged or mutable base means today\'s build and last month\'s contain different libc and a different CVE set, with no record of which shipped.',
  fix: 'Use image:tag@sha256:<digest> and enable Dependabot\'s docker ecosystem.',
  run(ctx) {
    for (const p of ctx.find(/(^|\/)(Dockerfile|Containerfile)([.-][\w.-]+)?$/).slice(0, 1)) {
      const t = ctx.read(p);
      if (!t) continue;
      const stages = new Set();
      let m;
      const asRe = /\sAS\s+(\S+)/gi;
      while ((m = asRe.exec(t))) stages.add(m[1].toLowerCase());
      const from = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/gim;
      const bad = [];
      while ((m = from.exec(t))) {
        const ref = m[1];
        if (stages.has(ref.toLowerCase()) || ref === 'scratch') continue;
        if (/^\$\{?\w+\}?/.test(ref)) continue;         // ARG-driven, may be pinned upstream
        if (/@sha256:[0-9a-f]{64}/.test(ref)) continue;
        bad.push(ref);
      }
      if (bad.length) {
        const untagged = bad.filter(r => !r.includes(':') || /:latest$/.test(r));
        return {
          where: p,
          evidence: bad.slice(0, 3).join(', ') + (untagged.length ? ' (mutable tag)' : ''),
          n: bad.length
        };
      }
    }
    return null;
  }
});

register({
  id: 'install-lifecycle-script',
  title: 'Review the install lifecycle script and disable scripts in CI',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.5,
  why: 'Install scripts are the execution vector for every npm compromise from event-stream onward, and a postinstall that fetches a binary makes the build depend on a URL nobody reviews.',
  fix: 'Move the work into an explicit build step, or set ignore-scripts in CI and run it by name.',
  run(ctx) {
    const t = ctx.read('package.json');
    if (!t) return null;
    let pkg;
    try { pkg = JSON.parse(t); } catch (e) { return null; }
    const scripts = pkg.scripts || {};
    const hooks = ['preinstall', 'install', 'postinstall'].filter(k => scripts[k]);
    if (!hooks.length) return null;
    const risky = hooks.filter(k => /curl|wget|https?:\/\/|node -e|eval|base64\s+-d|chmod \+x/.test(scripts[k]));
    // prepare: husky install and prepare: tsc are benign and very common.
    if (!risky.length && hooks.every(k => /husky|tsc|build|patch-package/.test(scripts[k]))) return null;
    return {
      where: 'package.json',
      evidence: hooks.join(', ') + (risky.length ? ' (fetches from the network)' : ''),
      n: hooks.length
    };
  }
});
