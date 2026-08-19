/*
 * checks-ci.js - workflow safety: tokens, untrusted code, and false green.
 *
 * Firing rates are measured over 14 repos and 65 workflow files: unpinned
 * third-party actions 9 of 10, no dependency scan 10 of 10, persist-credentials
 * 12 of 12, no job timeout 13 of 14. Several of these fire on this repository's
 * own pipeline, which is how they earned their place.
 *
 * A repo can hold 33 workflow files against a small read budget, so the runner
 * ranks deploy and release files above bots. When some go unread, a whole-repo
 * absence claim says so rather than asserting the gate is missing.
 */
'use strict';
const { register, workflowText } = require('./lib-hygiene.js');

const WF = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const VENDORED = /(^|\/)(node_modules|vendor|\.venv|venv|site-packages|third_party)\//;
const TESTISH = /(^|\/)(test|tests|fixtures?|testdata|examples?)\//i;

const TEST_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test|pytest|python -m (pytest|unittest)|go test|cargo (test|nextest)|jest|vitest|mocha|\bava\b|mvn\s+(test|verify)|gradlew?\s+\w*test|tox|nox|rspec|phpunit|dotnet test|ctest|bats|swift test|make (test|check)/i;
const INDIRECT = /\b(make|just|task|nx|bazel|dagger|earthly|mise|hatch|pdm|rake)\b|\.\/(scripts|ci|bin)\//;

register({
  id: 'gha-third-party-action-unpinned',
  title: 'Pin third-party GitHub Actions to a commit SHA',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.9,
  why: 'A tag can be moved, so the action running with your token and secrets is whatever its owner last pushed; this is how tj-actions/changed-files leaked secrets from thousands of repos.',
  fix: 'Replace each @vN with the 40-character commit SHA, keep # vN as a comment, and let Dependabot bump the SHAs.',
  run(ctx) {
    const bad = new Set();
    for (const { text } of workflowText(ctx)) {
      const re = /^\s*(?:-\s*)?uses:\s*["']?([A-Za-z0-9][\w.-]*)\/([\w./-]+)@([^\s"'#]+)/gm;
      let m;
      while ((m = re.exec(text))) {
        const owner = m[1], ref = m[3];
        if (owner === 'actions' || owner === 'github' || owner === 'moses-y') continue;
        if (/^[0-9a-f]{40}$/.test(ref) || /^[0-9a-f]{64}$/.test(ref)) continue;
        bad.add(`${owner}/${m[2]}@${ref}`);
      }
    }
    if (!bad.size) return null;
    const list = [...bad];
    return { where: '.github/workflows', evidence: list.slice(0, 4).join(', '), n: list.length };
  }
});

register({
  id: 'gha-no-permissions-block',
  title: 'Declare least-privilege permissions for GITHUB_TOKEN',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.85,
  why: 'With no declaration the token inherits the repository default, so any injected step can push commits or mint releases from inside your own CI.',
  fix: 'Add permissions: contents: read at the top of the workflow and widen per job only where needed.',
  run(ctx) {
    const files = workflowText(ctx).filter(({ text }) => !/^\s*permissions:/m.test(text));
    if (!files.length) return null;
    const withSecrets = files.filter(({ text }) => /secrets\.[A-Z0-9_]{3,}/.test(text));
    return {
      where: files[0].path,
      evidence: files.length + ' workflow(s) declare no permissions' +
        (withSecrets.length ? `, ${withSecrets.length} of them reference secrets` : ''),
      n: files.length
    };
  }
});

register({
  id: 'gha-permissions-write-all',
  title: 'Replace write-all with the scopes the job actually needs',
  category: 'supply-chain',
  severity: 'critical',
  confidence: 0.95,
  why: 'One malicious step gets simultaneous write to code, packages, releases, deployments and Actions itself.',
  fix: 'Enumerate only the scopes each job uses and default the workflow to contents: read.',
  run(ctx) {
    for (const { path, text } of workflowText(ctx)) {
      if (/^\s*permissions:\s*write-all\s*$/m.test(text)) {
        return { where: path, evidence: 'permissions: write-all', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'gha-pr-target-untrusted-checkout',
  title: 'Do not check out pull request code in a privileged workflow',
  category: 'supply-chain',
  severity: 'critical',
  confidence: 0.9,
  why: 'This is the most reliably exploited Actions pattern: anyone opening a pull request gets code execution with your repository secrets.',
  fix: 'Split into an unprivileged pull_request build and a workflow_run job that only consumes its artifact.',
  run(ctx) {
    for (const { path, text } of workflowText(ctx)) {
      if (!/^\s*on:[\s\S]{0,600}?(pull_request_target|workflow_run)/m.test(text)) continue;
      if (/ref:\s*\$\{\{\s*github\.event\.(pull_request\.head\.(sha|ref)|workflow_run\.head_(sha|branch))/.test(text)) {
        return { where: path, evidence: 'privileged trigger checks out the untrusted ref', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'gha-script-injection',
  title: 'Pass untrusted event data through env, never into run directly',
  category: 'supply-chain',
  severity: 'critical',
  confidence: 0.85,
  why: 'A branch or issue title containing shell metacharacters executes on your runner with whatever the job token can reach.',
  fix: 'Bind the value to an env var on the step and reference "$VAR" inside the script.',
  run(ctx) {
    const TAINT = /\$\{\{[^}]*(github\.event\.(issue|pull_request|discussion)\.(title|body)|github\.event\.(comment|review)\.body|github\.event\.pull_request\.head\.(ref|label)|github\.head_ref)/;
    for (const { path, text } of workflowText(ctx)) {
      // Only inside a run: body; the same expression in an if: or env: is fine.
      const runs = text.match(/^[ \t]*(?:-[ \t]*)?run:[\s\S]*?(?=\n[ \t]*(?:-[ \t]*)?\w+:|\n\S|$)/gm) || [];
      for (const body of runs) {
        if (TAINT.test(body)) {
          return { where: path, evidence: 'attacker-controlled value interpolated into a shell step', n: 1 };
        }
      }
    }
    return null;
  }
});

register({
  id: 'gha-secrets-in-forkable-trigger',
  title: 'Keep secrets out of workflows a fork can trigger',
  category: 'supply-chain',
  severity: 'critical',
  confidence: 0.7,
  why: 'Contributor-controlled input reaches a job holding a publish token or cloud credential, so a pull request becomes credential exfiltration.',
  fix: 'Move secret-using steps into a workflow_run job that never checks out pull request code, or gate on an environment with required reviewers.',
  run(ctx) {
    for (const { path, text } of workflowText(ctx)) {
      if (!/^\s*on:[\s\S]{0,600}?(pull_request_target|workflow_run|issue_comment)/m.test(text)) continue;
      const names = [...new Set((text.match(/secrets\.([A-Z0-9_]{3,})/g) || [])
        .map(s => s.replace('secrets.', ''))
        .filter(n => n !== 'GITHUB_TOKEN'))];
      if (!names.length) continue;
      const hot = names.some(n => /NPM|PYPI|CARGO|DOCKER|AWS|GCP|AZURE|SSH|DEPLOY|PROD|TOKEN/.test(n));
      return {
        where: path,
        evidence: names.slice(0, 4).join(', ') + (hot ? ' (publish or cloud scope)' : ''),
        n: names.length
      };
    }
    return null;
  }
});

register({
  id: 'gha-step-swallows-exit-code',
  title: 'Stop discarding the exit code of steps whose failure matters',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.7,
  why: 'The job reports green while the artifact it was supposed to produce was never produced, so a crash becomes a successful run built on stale data.',
  fix: 'Let the step fail, or test the specific expected condition instead of discarding all exit codes.',
  run(ctx) {
    // Cleanup commands legitimately ignore failure.
    const CLEANUP = /prune|rm -|pkill|kill |docker (stop|rm)|unlink|find .* -type f|true$/;
    for (const { path, text } of workflowText(ctx)) {
      const lines = text.split('\n');
      const hits = [];
      lines.forEach((l, i) => {
        if (!/\|\|\s*(true|:)\s*$/.test(l)) return;
        if (CLEANUP.test(l.replace(/\|\|\s*(true|:)\s*$/, ''))) return;
        if (/\b(node|npm|python|pytest|go|cargo|make|build|test|lint|tsc)\b/.test(l)) hits.push(i + 1);
      });
      if (hits.length) {
        return { where: path, evidence: 'lines ' + hits.slice(0, 6).join(', ') + ' discard failure', n: hits.length };
      }
    }
    return null;
  }
});

register({
  id: 'gha-continue-on-error-masks-failure',
  title: 'Remove continue-on-error from steps that gate correctness',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.6,
  why: 'A failing test suite reports a green check, which is precisely the path this audit exists to close.',
  fix: 'Delete continue-on-error, or move a genuinely advisory step into a separate non-required job.',
  run(ctx) {
    for (const { path, text } of workflowText(ctx)) {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/continue-on-error:\s*true/.test(lines[i])) continue;
        if (/\$\{\{/.test(lines[i])) continue;            // matrix-driven, deliberate
        const near = lines.slice(Math.max(0, i - 6), i + 1).join(' ');
        if (/cleanup|teardown|prune|upload.*log|notify/i.test(near)) continue;
        if (/test|lint|typecheck|tsc|build|audit|scan|codeql/i.test(near)) {
          return { where: path, evidence: 'line ' + (i + 1) + ' on a correctness step', n: 1 };
        }
      }
    }
    return null;
  }
});

register({
  id: 'gha-checkout-persists-credentials',
  title: 'Set persist-credentials: false on checkout',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.6,
  why: 'The token stays in .git/config for every later step, so a malicious postinstall script reads a pushable credential without one ever being passed to it.',
  fix: 'Add with: persist-credentials: false, and pass an explicit token only to the step that pushes.',
  run(ctx) {
    for (const { path, text } of workflowText(ctx)) {
      if (!/uses:\s*actions\/checkout@/.test(text)) continue;
      if (/persist-credentials:\s*false/.test(text)) continue;
      const installs = /\b(npm (ci|install)|yarn|pnpm|pip install|cargo build|go mod|bundle install|composer install)\b/.test(text);
      if (!installs) continue;                    // without an install step the risk is theoretical
      return { where: path, evidence: 'checkout keeps the token, then dependencies are installed', n: 1 };
    }
    return null;
  }
});

register({
  id: 'gha-missing-job-timeout',
  title: 'Set timeout-minutes on the workflow jobs',
  category: 'supply-chain',
  severity: 'low',
  confidence: 0.9,
  why: 'A wedged step runs to the six-hour platform default, which on a two-hourly schedule means three runs overlap behind it.',
  fix: 'Add timeout-minutes with a realistic bound to each job.',
  run(ctx) {
    const files = workflowText(ctx).filter(({ text }) => !/timeout-minutes:/.test(text));
    if (!files.length) return null;
    return { where: files[0].path, evidence: files.length + ' workflow(s) declare no job timeout', n: files.length };
  }
});

register({
  id: 'gha-pushes-to-default-branch',
  title: 'Open a pull request instead of pushing to the default branch',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.6,
  why: 'Automated commits land on the branch that deploys, with no test having run against the result.',
  fix: 'Push to a bot branch and open a pull request, or restrict the push to a tag ref.',
  run(ctx) {
    for (const { path, text } of workflowText(ctx)) {
      if (!/git commit/.test(text) || !/\bgit push\b/.test(text)) continue;
      const m = text.match(/git push[^\n]*/);
      const line = m ? m[0] : '';
      if (/refs\/tags\/|\$\{?\{?\s*(github\.ref_name|VERSION)/.test(line)) continue;  // tag push
      if (/gitlab|bitbucket|[^o]origin\s+\w+:/.test(line)) continue;                  // mirror
      return { where: path, evidence: line.trim().slice(0, 90), n: 1 };
    }
    return null;
  }
});

register({
  id: 'ci-absent-entirely',
  title: 'Add a workflow that builds and tests this repository',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.7,
  why: 'Every change merges with nobody having run the build once, which across this estate is 499 repositories.',
  fix: 'Add a workflow running the project build and test command on push and pull_request.',
  run(ctx) {
    if (ctx.has(WF)) return null;
    if (ctx.has(/(^|\/)(\.gitlab-ci\.yml|\.circleci\/config\.yml|\.travis\.yml|Jenkinsfile|azure-pipelines\.yml|\.drone\.yml)$/)) return null;
    const src = ctx.find(/\.(js|jsx|mjs|ts|tsx|py|rb|go|rs|java|kt|cs|cpp|c|swift|php|scala)$/)
      .filter(p => !VENDORED.test(p) && !/^(docs?|examples?|website)\//.test(p));
    if (src.length < 8) return null;
    return { where: '', evidence: src.length + ' source files, no CI configuration', n: 1 };
  }
});

register({
  id: 'ci-never-runs-tests',
  title: 'Make CI invoke the test suite it has',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.6,
  why: 'A green check that never executed an assertion is worse than no check, because reviewers trust it.',
  fix: 'Add a test step to the existing workflow rather than a new workflow.',
  run(ctx) {
    const tests = ctx.find(/(^|\/)(tests?|specs?|__tests__)\/|(^|\/)(test_[^/]+|[^/]*[_.-](test|spec))\.[a-z]+$/)
      .filter(p => !VENDORED.test(p));
    if (tests.length < 3) return null;
    const wfs = workflowText(ctx);
    if (!wfs.length) return null;                 // ci-absent-entirely covers this
    const all = wfs.map(w => w.text).join('\n');
    if (TEST_CMD.test(all)) return null;
    if (INDIRECT.test(all)) return null;          // invoked via make/just: unverifiable, stay quiet
    const partial = ctx.workflowsUnread > 0;
    return {
      where: '.github/workflows',
      evidence: tests.length + ' test files, no test command in ' +
        (partial ? 'the ' + wfs.length + ' workflows read' : 'any workflow'),
      n: tests.length
    };
  }
});

register({
  id: 'deploy-artifacts-without-ci',
  title: 'Add a build gate for the deployable artifacts here',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.7,
  why: 'Something in the repo is meant to reach a server and no automated step has ever validated it, which is the state of 125 repositories here.',
  fix: 'Add a workflow that at least builds the image and validates the manifests.',
  run(ctx) {
    if (ctx.has(WF)) return null;
    const dep = ctx.find(/(^|\/)(Dockerfile|docker-compose\.ya?ml|fly\.toml|vercel\.json|Procfile|serverless\.yml)$/)
      .concat(ctx.find(/(^|\/)(charts|k8s|kubernetes|terraform|helm)\//))
      .filter(p => !/(^|\/)(examples?|docs|test|\.devcontainer)\//.test(p));
    if (!dep.length) return null;
    return { where: dep[0], evidence: 'deployment artifacts with no workflow', n: dep.length };
  }
});

register({
  id: 'no-dependency-vulnerability-gate',
  title: 'Gate pull requests on a dependency vulnerability scan',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.8,
  why: 'This is the one gate that would catch a known-vulnerable package before it reaches a build, and no repository in the sample had it.',
  fix: 'Add dependency-review-action on pull_request, or osv-scanner on push and a schedule.',
  run(ctx) {
    const manifests = ctx.find(/(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|composer\.json)$/)
      .filter(p => !VENDORED.test(p) && !TESTISH.test(p));
    if (!manifests.length) return null;
    const wfs = workflowText(ctx);
    if (!wfs.length) return null;                 // no CI at all is a different finding
    const all = wfs.map(w => w.text).join('\n');
    if (/dependency-review-action|osv-scanner|trivy-action|anchore\/scan|snyk|npm\s+audit|pnpm\s+audit|pip-audit|safety\s+check|cargo[\s-]audit|govulncheck|bundler-audit|composer\s+audit/i.test(all)) return null;
    return { where: '.github/workflows', evidence: 'no dependency scan in CI', n: 1 };
  }
});

register({
  id: 'ci-install-ignores-lockfile',
  title: 'Install from the lockfile in CI',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.8,
  why: 'A fresh resolution in CI means the tested dependency set is not the locked one, so the failure only appears after merge.',
  fix: 'Use npm ci, yarn install --immutable, or pnpm install --frozen-lockfile.',
  run(ctx) {
    const wfs = workflowText(ctx);
    if (!wfs.length) return null;
    const all = wfs.map(w => w.text).join('\n');
    if (ctx.has(/(^|\/)package-lock\.json$/) && /\bnpm\s+install\b(?![^\n]*(-g|--global))/.test(all) && !/\bnpm\s+ci\b/.test(all)) {
      return { where: '.github/workflows', evidence: 'npm install with a committed package-lock.json', n: 1 };
    }
    if (ctx.has(/(^|\/)yarn\.lock$/) && /\byarn\s+install\b/.test(all) && !/--immutable|--frozen-lockfile/.test(all)) {
      return { where: '.github/workflows', evidence: 'yarn install without --immutable', n: 1 };
    }
    return null;
  }
});
