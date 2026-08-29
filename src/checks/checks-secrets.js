/*
 * checks-secrets.js - credentials and sensitive data.
 *
 * Replaces the heuristic in update-forks.js, which was measured against 19 real
 * trees: it fired on 15 of them, and on 9 of those the only thing it matched was
 * ordinary source code named "secrets.go", "secrets.ts", "getSecrets.ts", or in
 * one case a secret *scanner*. It also matched honeypot bait pages and a PNG. It
 * never read a byte of content, so it could not tell a .env full of
 * "your-key-here" from one holding four generated values, and published High for
 * both.
 *
 * Two tiers here. Path-only checks flag a file as worth opening. Content checks
 * confirm, and only a confirmed finding is published above low.
 */
'use strict';
const { register, looksReal, DEV_PASSWORDS } = require('../lib/lib-hygiene.js');

const NOT_REAL_ENV = /\.(example|sample|template|tpl|dist|defaults?|schema|md|txt|html|htm|j2|tmpl)$/i;
const VENDORED = /(^|\/)(node_modules|vendor|\.venv|venv|site-packages|third_party)\//;
const TESTISH = /(^|\/)(test|tests|spec|specs|fixtures?|testdata|__tests__|examples?|templates?|deception|honeypot)\//i;

// A real environment file, not an example of one.
function envFiles(ctx) {
  return ctx.find(/(^|\/)\.env($|\.[A-Za-z0-9_.-]+$)/)
    .filter(p => !NOT_REAL_ENV.test(p) && !VENDORED.test(p))
    .filter(p => !/(^|\/)\.env\.(example|sample|template|dist|defaults?)$/.test(p));
}

register({
  id: 'env-file-committed',
  title: 'Remove the committed .env and rotate what it holds',
  category: 'secrets',
  severity: 'high',
  confidence: 0.7,
  why: 'A tracked .env is the most common route for a working key to reach a public clone, and it is the file the app actually loads, so the value is usually live.',
  fix: 'git rm --cached the file, add it to .gitignore, rotate every credential it names, commit a .env.example with empty values.',
  run(ctx) {
    const hits = envFiles(ctx);
    if (!hits.length) return null;
    return { where: hits[0], evidence: hits.slice(0, 4).join(', '), n: hits.length };
  }
});

register({
  id: 'env-secret-value-real',
  title: 'Rotate the credentials in the committed environment file',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.9,
  why: 'These values are loaded by the application at boot, so a generated value here is a working credential for something that runs.',
  fix: 'Rotate each named credential, remove the file from the index, and replace it with a keys-only example.',
  run(ctx) {
    for (const p of envFiles(ctx).slice(0, 3)) {
      const text = ctx.read(p);
      if (!text) continue;                       // unread is unknown, not clean
      const names = [];
      const re = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\n#]*))/gm;
      let m;
      while ((m = re.exec(text))) {
        const key = m[1];
        const val = (m[2] ?? m[3] ?? m[4] ?? '').trim();
        // Bare "API" matched VITE_API_URL, and a public API URL is not a
        // credential. The name must denote a secret, not merely mention an API.
        if (!/(API[_-]?(KEY|SECRET|TOKEN)|(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|PRIVATE|SALT|DSN)(_|$)|_PW$)/i.test(key)) continue;
        if (/(_URL|_URI|_HOST|_PORT|_ENDPOINT|_ORIGIN|_DOMAIN|_PATH|_DIR|_MODE|_ENV|_VERSION)$/i.test(key)) continue;
        if (/^(https?:\/\/|\/|\.\/|[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$)/i.test(val)) continue;   // a URL or path
        if (looksReal(val, ctx.repoId)) names.push(key);
      }
      if (names.length) {
        return { where: p, evidence: names.slice(0, 6).join(', ') + ' hold generated values', n: names.length };
      }
    }
    return null;
  }
});

register({
  id: 'private-key-committed',
  title: 'Rotate and purge the committed private key',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.85,
  why: 'A published signing or TLS private key cannot be unpublished, and it lets anyone impersonate the service or decrypt captured traffic.',
  fix: 'Reissue the key pair, then purge the blob from history; deleting it in a later commit is not enough.',
  run(ctx) {
    const named = ctx.find(/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/);
    const keyish = ctx.find(/\.(pem|key|pfx|p12|jks|keystore|bks|ppk|pk8)$/i)
      .filter(p => !/(^|[._-])(pub|public|cert|ca|chain|fullchain|crt|cer)([._-]|$)/i.test(p));
    const all = [...named, ...keyish];
    if (!all.length) return null;
    // .pem is also used for certificates, so a body check decides severity.
    const first = all.find(p => !TESTISH.test(p)) || all[0];
    const text = ctx.read(first);
    if (text && !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(text)) return null;
    if (!text && /\.(pem|key)$/i.test(first)) return null;   // unconfirmed, stay quiet
    const fixture = TESTISH.test(first) || /localhost|selfsigned|self-signed|dummy|sample/i.test(first);
    return {
      where: first,
      evidence: (fixture ? 'test fixture material: ' : '') + all.slice(0, 3).join(', '),
      n: all.length
    };
  }
});

register({
  id: 'cloud-credential-file-committed',
  title: 'Revoke and remove the committed cloud credential file',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.9,
  why: 'These stores hold non-expiring account-level keys, so one leak is full-account compromise rather than one API quota.',
  fix: 'Revoke the access keys in the provider console, remove the file, purge it from history.',
  run(ctx) {
    const hits = ctx.find(/(^|\/)(\.aws\/credentials|\.azure\/(accessTokens|azureProfile)\.json|\.config\/gcloud\/(application_default_credentials\.json|credentials\.db)|\.kube\/config|\.oci\/config|\.databrickscfg|gcloud-service-key\.json|\.boto|\.s3cfg)$/)
      // Honeypot repos publish these as .html bait pages; a real store has no such suffix.
      .filter(p => !/\.(html|md|txt|j2|tmpl)$/i.test(p) && !TESTISH.test(p))
      .filter(p => ctx.sizeOf(p) > 200);
    if (!hits.length) return null;
    return { where: hits[0], evidence: hits.slice(0, 3).join(', '), n: hits.length };
  }
});

register({
  id: 'service-account-json-committed',
  title: 'Delete the committed service-account key',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.95,
  why: 'A service-account key carries whatever IAM roles that account holds, with no expiry and no second factor.',
  fix: 'Delete the key in IAM, remove the file, purge history, and review audit logs since the commit.',
  run(ctx) {
    const cands = ctx.find(/(service[-_ ]?account|serviceaccountkey|firebase[-_]adminsdk|client_secret[-_a-z0-9]*|gcp[-_]?(sa|key))[^/]*\.json$/i)
      .filter(p => !TESTISH.test(p) && !VENDORED.test(p));
    for (const p of cands.slice(0, 2)) {
      const t = ctx.read(p);
      if (!t) continue;
      // Firebase *client* config is public by design and has no private_key.
      if (/"type"\s*:\s*"service_account"/.test(t) && /"private_key"\s*:\s*"-----BEGIN/.test(t)) {
        return { where: p, evidence: 'service_account with an embedded private key', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'gitignore-contradicts-tracked-secret',
  title: 'Untrack the file your own .gitignore says to ignore',
  category: 'secrets',
  severity: 'high',
  confidence: 0.95,
  why: 'The author already decided this file must never be committed, so its presence is an accident nobody noticed, which means the credentials in it are the ones actually in use.',
  fix: 'git rm --cached the path and rotate; the ignore rule is already correct.',
  run(ctx) {
    const ignore = ctx.read('.gitignore');
    if (!ignore) return null;
    const pats = ignore.split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && !l.startsWith('!'));
    if (!pats.length) return null;
    const toRegex = pat => {
      const anchored = pat.startsWith('/');
      const body = pat.replace(/^\//, '').replace(/\/$/, '');
      const esc = body.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
      return new RegExp(anchored ? '^' + esc + '(/|$)' : '(^|/)' + esc + '(/|$)');
    };
    const rules = pats.map(toRegex);
    const flagged = [...envFiles(ctx), ...ctx.find(/(^|\/)(terraform\.tfstate|\.npmrc|\.pypirc|\.netrc)$/)]
      .filter(p => !TESTISH.test(p));
    for (const p of flagged) {
      if (rules.some(r => r.test(p))) {
        return { where: p, evidence: 'tracked although .gitignore excludes it', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'terraform-state-committed',
  title: 'Remove the committed Terraform state',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.85,
  why: 'State stores every resource attribute in cleartext, including generated database passwords and IAM secret keys, so one committed state is an inventory plus the keys to it.',
  fix: 'Delete it, move state to an encrypted remote backend, and rotate every credential the plan generated.',
  run(ctx) {
    const hits = ctx.find(/\.tfstate(\.backup)?$/)
      .filter(p => !/\.(html|md|txt|tmpl|example)$/i.test(p) && !TESTISH.test(p));
    if (!hits.length) return null;
    return { where: hits[0], evidence: hits.slice(0, 3).join(', '), n: hits.length };
  }
});

register({
  id: 'shell-history-committed',
  title: 'Remove the committed shell or client history file',
  category: 'secrets',
  severity: 'high',
  confidence: 0.8,
  why: 'History files record whole commands, so they carry Authorization headers and database URLs that no key-format pattern would ever have matched in source.',
  fix: 'Remove, purge from history, and rotate anything that appears in it.',
  run(ctx) {
    const hits = ctx.find(/(^|\/)(\.(bash|zsh|sh|psql|mysql|python|irb|rediscli)_history|\.netrc|_netrc|\.pgpass|\.my\.cnf)$/)
      .filter(p => ctx.sizeOf(p) > 200);
    if (!hits.length) return null;
    return { where: hits[0], evidence: hits.join(', '), n: hits.length };
  }
});

register({
  id: 'registry-auth-committed',
  title: 'Revoke the publish token in the committed registry config',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.9,
  why: 'A leaked npm or PyPI publish token lets an attacker ship a malicious version of the package under the owner name, which is a supply-chain compromise rather than a data leak.',
  fix: 'Revoke at the registry, replace the value with an ${ENV_VAR} reference, and set it in CI secrets.',
  run(ctx) {
    for (const p of ctx.find(/(^|\/)(\.npmrc|\.pypirc|\.yarnrc\.yml)$/).slice(0, 2)) {
      const t = ctx.read(p);
      if (!t) continue;
      // The lookahead is mandatory: without it every correctly configured repo fires.
      const m = t.match(/(_auth(Token)?|npmAuthToken|password)\s*[:=]\s*(?!\$\{|\$[A-Z_]|__)([^\s#]{12,})/i);
      if (m && looksReal(m[4], ctx.repoId)) {
        return { where: p, evidence: m[1] + ' is set to a literal value', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'database-dump-committed',
  title: 'Remove the committed database dump',
  category: 'secrets',
  severity: 'high',
  confidence: 0.6,
  why: 'A dump is the one artefact that leaks other people\'s data rather than the owner\'s, which turns a hygiene problem into a notification obligation.',
  fix: 'Remove and purge from history; if it held personal data, assess it as a disclosure.',
  run(ctx) {
    const hits = ctx.tree
      .filter(f => /\.(sql|dump|bak|sqlite3?|db|mdb|rdb)$/i.test(f.path) && (f.size || 0) > 262144)
      .filter(f => !/(^|\/)(migrations?|schema|seeds?|fixtures?|tests?)\//i.test(f.path))
      .filter(f => !/schema|migration|structure|ddl|create_table/i.test(f.path))
      // Teaching material: a 300KB .sql in "SQL 3/Lesson 4" is an exercise, not a
      // dump of anyone's data, and calling it a disclosure on a public page is
      // worse than missing it.
      .filter(f => !/lesson|tutorial|course|exercise|workshop|day[-_ ]?\d|chapter/i.test(f.path))
      // A real dump either says so or is genuinely large.
      .filter(f => /(dump|backup|export|snapshot)/i.test(f.path) || (f.size || 0) > 2000000)
      .map(f => f.path);
    if (!hits.length) return null;
    return { where: hits[0], evidence: hits.slice(0, 3).join(', '), n: hits.length };
  }
});

// Provider formats that are machine-verifiable, so a committed one is found by
// scrapers within minutes. Only unambiguous prefixes are listed; a generic
// high-entropy sweep would drown in lockfile hashes and notebook output.
const PROVIDER_PATTERNS = [
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_\-]{35}\b/],
  ['Anthropic key', /\bsk-ant-(?:api03|admin01)-[A-Za-z0-9_\-]{40,}\b/],
  ['NVIDIA key', /\bnvapi-[A-Za-z0-9_\-]{40,}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_\-]{20,}\b/],
  ['Slack token', /\bxox[abposr]-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{20,}\b/],
  ['Slack webhook', /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]{8,}\/B[A-Za-z0-9]{8,}\/[A-Za-z0-9]{20,}/],
  ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{24,}\b/],
  ['SendGrid key', /\bSG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{30,}\b/],
  ['HuggingFace token', /\bhf_[A-Za-z0-9]{34,}\b/],
  ['Groq key', /\bgsk_[A-Za-z0-9]{52}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['Supabase token', /\bsbp_[0-9a-f]{40}\b/],
  ['Telegram bot token', /\b[0-9]{8,10}:AA[A-Za-z0-9_\-]{33}\b/]
];

register({
  id: 'provider-token-committed',
  title: 'Revoke the provider token committed in this file',
  category: 'secrets',
  severity: 'critical',
  confidence: 0.9,
  why: 'These formats are machine-verifiable, so committed ones are harvested by automated scrapers within minutes of the push.',
  fix: 'Revoke at the provider, purge from history, and add the pattern to a pre-commit hook.',
  run(ctx) {
    // Only files another check already pulled in, so this costs no extra reads.
    for (const p of ctx.readPaths()) {
      if (TESTISH.test(p)) continue;
      const t = ctx.read(p);
      if (!t) continue;
      for (const [label, re] of PROVIDER_PATTERNS) {
        const m = t.match(re);
        if (!m) continue;
        // Documentation repeats a sample value; a real key appears once.
        const occurrences = t.split(m[0]).length - 1;
        if (occurrences > 2) continue;
        if (/example|placeholder|redacted|dummy|fake|your[-_ ]?key/i.test(
          t.slice(Math.max(0, m.index - 80), m.index + 80))) continue;
        return { where: p, evidence: label + ' pattern matched', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'db-url-inline-password',
  title: 'Move the database password out of the connection string',
  category: 'secrets',
  severity: 'high',
  confidence: 0.7,
  why: 'A connection string is a complete credential including the endpoint, so unlike a bare password it is directly usable against a reachable database.',
  fix: 'Reference the password from the environment and rotate the database user.',
  run(ctx) {
    const LOCAL = /^(localhost|127\.0\.0\.1|db|database|postgres|mysql|redis|mongo|host\.docker\.internal)/;
    for (const p of ctx.readPaths()) {
      const t = ctx.read(p);
      if (!t) continue;
      const re = /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|clickhouse):\/\/([^\s:@/"']{1,64}):([^\s:@/"']{6,128})@([^\s/"']+)/gi;
      let m;
      while ((m = re.exec(t))) {
        const pw = m[3], host = m[4];
        if (DEV_PASSWORDS.has(pw.toLowerCase())) continue;
        if (/^(\$\{|\$[A-Z_]|<|\{\{|%)/.test(pw)) continue;
        // A short password still counts when the host is not local: 6 generated
        // characters against a remote database is a usable credential, and the
        // 12-character floor that protects other rules would drop it.
        const local = LOCAL.test(host);
        if (local && !looksReal(pw, ctx.repoId)) continue;
        if (!local && pw.length < 6) continue;
        return {
          where: p,
          evidence: m[1] + ' URL with an inline password, host ' + (LOCAL.test(host) ? 'is local' : 'is remote'),
          n: 1
        };
      }
    }
    return null;
  }
});

register({
  id: 'no-secret-scanning-gate',
  title: 'Add a pre-commit secret gate',
  category: 'secrets',
  severity: 'medium',
  confidence: 0.8,
  why: 'Without a gate the same class of leak recurs on the next commit, so a leak finding is the symptom and this is the cause.',
  fix: 'Add a pre-commit hook scanning staged content, and enable push protection.',
  run(ctx) {
    if (!ctx.hasSecretFinding) return null;      // set by the runner after the tier-1 pass
    // A directory prefix cannot be anchored with $: an earlier version required a
    // path ENDING in ".githooks/", so this repo's own hook directory never matched
    // and it reported itself as ungated.
    const gated = ctx.has(/(^|\/)(\.pre-commit-config\.ya?ml|\.gitleaks\.toml|\.secrets\.baseline|\.talismanrc)$/) ||
      ctx.has(/(^|\/)\.githooks\//) ||
      ctx.find(/^\.github\/workflows\//).some(p => /secret|gitleaks|trufflehog|scan|security/i.test(p));
    if (gated) return null;
    return { where: '', evidence: 'a secret-shaped file is tracked and no repo-level gate is visible', n: 1 };
  }
});
