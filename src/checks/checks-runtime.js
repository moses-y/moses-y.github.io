/*
 * checks-runtime.js - how the code behaves once it is running.
 *
 * The other four catalogues audit the repository: what is committed, what CI
 * does, what the manifest declares. This one audits the program. A wildcard CORS
 * policy, a disabled certificate check, a pickle load over a network payload:
 * none of those are visible in a tree listing, they only appear when you read the
 * source, and they are the findings that most deserve the phrase "would stop me
 * shipping this" because each is a live production hole rather than a process gap.
 *
 * Reading source is the expensive part, so every check here works from the same
 * small set of runtime-shaped files the runner already fetched, and none of them
 * asks for a file of its own. The set is chosen by name (settings.py, app.py,
 * server.js, docker-compose.yml) because those are where configuration decisions
 * live, and a decision in a config file applies to the whole process, whereas the
 * same pattern in one module of four hundred may be dead code.
 *
 * That bounded view is also why absence is never reported here. Every finding is
 * "this file does X", never "this repo does not do Y": with four files read out
 * of a possible four hundred, a negative claim would be unfounded.
 */
'use strict';
const { register } = require('../lib/lib-hygiene.js');
const { configFiles, selectPaths, configScore, stripComments, callArgs, scan, FSTRING }
  = require('../lib/lib-runtime-source.js');

/* ---- exposure of internals ---------------------------------------------- */

register({
  id: 'debug-mode-enabled-in-config',
  title: 'Turn off debug mode and drive it from the environment',
  category: 'runtime',
  severity: 'high',
  confidence: 0.6,
  why: 'Django and Flask debug pages render local variables, settings and the full traceback to whoever triggered the error, so one unhandled exception publishes the database password to a stranger, and Werkzeug\'s debugger additionally offers a remote shell.',
  fix: 'Read it from the environment with a safe default: DEBUG = os.environ.get("DEBUG") == "1".',
  run(ctx) {
    return scan(ctx, (t, p) => {
      // A literal True assigned in a config module, not a variable and not a
      // read from the environment, which is the correct pattern.
      const m = t.match(/^\s*(DEBUG|FLASK_DEBUG|DEBUG_MODE)\s*[:=]\s*(True|true|1)\s*$/m);
      if (m) return { evidence: m[0].trim() + ' in ' + p.split('/').pop() };
      const run = t.match(/\.run\([^)]*debug\s*=\s*True/);
      if (run) return { evidence: 'app.run(debug=True)' };
      const dj = t.match(/^\s*DEBUG\s*=\s*(True|1)\b/m);
      if (dj) return { evidence: dj[0].trim() };
      return null;
    });
  }
});

register({
  id: 'cors-allows-any-origin',
  title: 'Replace the wildcard CORS origin with an explicit allow list',
  category: 'runtime',
  severity: 'high',
  confidence: 0.65,
  why: 'Any page on the internet can call the API with the browser\'s cookies attached, so a logged-in visitor to an unrelated site performs authenticated requests without knowing, and the wildcard combined with credentials is the exact configuration browsers refuse for that reason.',
  fix: 'List the origins the API actually serves, and never pair a wildcard with credentials.',
  run(ctx) {
    return scan(ctx, t => {
      const creds = /allow_credentials\s*=\s*True|credentials\s*:\s*true|supports_credentials\s*=\s*True|Allow-Credentials["'\s:]+true/i.test(t);
      const pats = [
        /CORS_ALLOW_ALL_ORIGINS\s*=\s*True/,
        /CORS_ORIGIN_ALLOW_ALL\s*=\s*True/,
        /allow_origins\s*=\s*\[\s*["']\*["']\s*\]/,
        /origin\s*:\s*["']\*["']/,
        /cors\(\s*\)/,                                    // express cors() with no options is wildcard
        /Access-Control-Allow-Origin["'\s:,]+["']\*["']/i
      ];
      for (const re of pats) {
        const m = t.match(re);
        if (m) return { evidence: m[0].trim().slice(0, 80) + (creds ? ' together with credentials enabled' : '') };
      }
      return null;
    });
  }
});

register({
  id: 'allowed-hosts-wildcard',
  title: 'Name the hosts this application answers for',
  category: 'runtime',
  severity: 'medium',
  confidence: 0.5,
  why: 'A wildcard host makes the application answer to any Host header, which is what turns a password-reset mail into a link pointing at an attacker\'s domain, since the reset URL is built from the header.',
  fix: 'Set ALLOWED_HOSTS to the real domains, from the environment in deployment.',
  run(ctx) {
    return scan(ctx, t => {
      const m = t.match(/ALLOWED_HOSTS\s*=\s*\[\s*["']\*["']\s*\]/);
      return m ? { evidence: m[0].trim() } : null;
    });
  }
});

/* ---- trust ---------------------------------------------------------------- */

register({
  id: 'tls-verification-disabled',
  title: 'Re-enable certificate verification',
  category: 'runtime',
  severity: 'high',
  confidence: 0.75,
  why: 'With verification off the connection is encrypted to whoever answered, which is no protection at all: anyone positioned between the two hosts can present their own certificate, read the traffic and alter it, and the request will still succeed.',
  fix: 'Remove the flag, and if the peer uses a private CA point the client at that CA bundle instead.',
  run(ctx) {
    return scan(ctx, t => {
      const pats = [
        /verify\s*=\s*False/,
        /rejectUnauthorized\s*:\s*false/,
        /NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*["']?0/,
        /ssl\._create_unverified_context\s*\(/,
        /CURLOPT_SSL_VERIFYPEER["'\s,=>]+(false|0)/i,
        /check_hostname\s*=\s*False/
      ];
      for (const re of pats) {
        const m = t.match(re);
        if (m) return { evidence: m[0].trim() };
      }
      return null;
    });
  }
});

register({
  id: 'hardcoded-secret-key-fallback',
  title: 'Remove the hardcoded fallback for the signing key',
  category: 'runtime',
  severity: 'high',
  confidence: 0.6,
  why: 'A default that applies when the variable is unset is the value that ships the day someone forgets to set it, and because it is in the repository anyone can forge a session cookie or a token signed with it.',
  fix: 'Fail to start when the key is absent rather than substituting a literal.',
  run(ctx) {
    return scan(ctx, t => {
      // A fallback only matters when the name denotes a signing secret and the
      // default is a literal long enough to be the real key rather than "".
      const re = /(SECRET_KEY|JWT_SECRET|SESSION_SECRET|SIGNING_KEY|TOKEN_SECRET)\w*["'\]]?\s*[:=]\s*(?:os\.environ\.get|os\.getenv|process\.env\.\w+\s*\|\||config\.get)\s*\(?[^,)]*,\s*["']([^"']{8,})["']/gi;
      let m;
      while ((m = re.exec(t))) {
        const fallback = m[2];
        if (/^(change|your|set|placeholder|todo|xxx|none|null|insert|replace)/i.test(fallback)) continue;
        return { evidence: m[1] + ' falls back to a ' + fallback.length + '-character literal' };
      }
      const bare = t.match(/^\s*(SECRET_KEY|JWT_SECRET|SESSION_SECRET)\s*=\s*["']([^"']{16,})["']/m);
      if (bare && !/change|your|placeholder|example|insert|replace|dev|test/i.test(bare[2])) {
        return { evidence: bare[1] + ' assigned a ' + bare[2].length + '-character literal' };
      }
      return null;
    });
  }
});

/* ---- untrusted input ------------------------------------------------------ */

register({
  id: 'unsafe-deserialization',
  title: 'Replace the unsafe deserializer with a data-only format',
  category: 'runtime',
  severity: 'high',
  confidence: 0.55,
  why: 'pickle and yaml.load reconstruct arbitrary Python objects, which means the loader executes whatever the payload asks for, so any path where that data crossed a network or a user upload is remote code execution rather than a parsing bug.',
  fix: 'Use yaml.safe_load, or JSON, and for model weights prefer a format that does not carry code.',
  run(ctx) {
    return scan(ctx, t => {
      // The arguments have to be taken by paren balance, not by a regex: the
      // common form is yaml.load(open(p).read(), Loader=SafeLoader), where the
      // first ) belongs to open() and a lazy match ends there, hiding the Loader
      // and reporting correct code as a vulnerability.
      const y = t.search(/\byaml\.load\s*\(/);
      if (y > -1) {
        const args = callArgs(t, y);
        if (!/Loader\s*=\s*(yaml\.)?(Safe|CSafe|Base|Full)Loader/.test(args)) {
          return { evidence: 'yaml.load without SafeLoader' };
        }
      }
      const pk = t.match(/\b(pickle|cPickle|dill|marshal)\.loads?\s*\(/);
      if (pk) return { evidence: pk[0].replace(/\s*\($/, '') + '()' };
      return null;
    });
  }
});

register({
  id: 'shell-command-from-interpolation',
  title: 'Pass the command as a list instead of building a shell string',
  category: 'runtime',
  severity: 'high',
  confidence: 0.6,
  why: 'With shell=True the string is parsed by a shell, so a semicolon or a backtick anywhere in an interpolated value runs a second command with the process\'s privileges, and the interpolation is what makes it reachable from input.',
  fix: 'Drop shell=True and pass an argument list, so the values can never be read as syntax.',
  run(ctx) {
    return scan(ctx, t => {
      // shell=True alone is often a fixed command and unremarkable. The finding
      // is a shell string built from a value, which is what makes it reachable.
      let m;
      const re = /(subprocess\.(?:run|call|check_output|check_call|Popen)|os\.system|os\.popen|child_process\.exec(?:Sync)?)\s*\(/g;
      while ((m = re.exec(t))) {
        const args = callArgs(t, m.index + m[0].length - 1);
        const interpolated = FSTRING.test(args) || /%\s*\(|\.format\s*\(|\+\s*\w|\$\{|`[^`]*\$\{/.test(args);
        if (!interpolated) continue;
        const shelled = /shell\s*=\s*True/.test(args) || /^(os\.system|os\.popen|child_process\.exec)/.test(m[1]);
        if (!shelled) continue;
        return { evidence: m[1] + ' with an interpolated command string' };
      }
      return null;
    });
  }
});

register({
  id: 'sql-built-by-string-interpolation',
  title: 'Use bound parameters instead of building the SQL string',
  category: 'runtime',
  severity: 'high',
  confidence: 0.6,
  why: 'A value spliced into SQL is read as syntax, so one quote in a name ends the literal and everything after it is executed as the query, which is how a search box becomes a table drop.',
  fix: 'Pass placeholders and hand the values to the driver as parameters.',
  run(ctx) {
    return scan(ctx, t => {
      let m;
      const re = /\.(execute|executemany|query|raw)\s*\(/g;
      while ((m = re.exec(t))) {
        const args = callArgs(t, m.index + m[0].length - 1);
        if (!/\b(select|insert|update|delete|drop|where|from)\b/i.test(args)) continue;
        // The driver's own %s placeholders take a second argument; that is the
        // correct pattern and must not be reported.
        const interpolated = FSTRING.test(args) || /\.format\s*\(|["']\s*\+\s*\w|\$\{/.test(args);
        if (!interpolated) continue;
        return { evidence: '.' + m[1] + '() with an interpolated query' };
      }
      return null;
    });
  }
});

register({
  id: 'eval-on-runtime-value',
  title: 'Remove eval over a runtime value',
  category: 'runtime',
  severity: 'high',
  confidence: 0.5,
  why: 'eval executes whatever the string contains, so wherever that string came from is now able to run code in the process, and the distance between the input and the eval is usually the only thing making it look safe.',
  fix: 'Parse the value into the type you expect, with json.loads or ast.literal_eval.',
  run(ctx) {
    return scan(ctx, t => {
      let m;
      const re = /(?<![.\w])(eval|exec)\s*\(/g;
      while ((m = re.exec(t))) {
        const args = callArgs(t, m.index + m[0].length - 1);
        // A literal is a code-generation trick, not an injection surface.
        if (/^\s*["'`]/.test(args) && !/\{|\+|\$\{/.test(args)) continue;
        if (!/\w/.test(args)) continue;
        return { evidence: m[1] + '() over a computed value' };
      }
      return null;
    });
  }
});

/* ---- availability -------------------------------------------------------- */

register({
  id: 'network-call-without-timeout',
  title: 'Give the outbound request a timeout',
  category: 'runtime',
  severity: 'medium',
  confidence: 0.7,
  why: 'requests has no default timeout, so a peer that accepts the connection and then says nothing holds the worker forever, and with a small worker pool a single slow dependency takes the whole service down without anything appearing to fail.',
  fix: 'Pass timeout= on every call, or use a session with one configured.',
  run(ctx) {
    return scan(ctx, t => {
      let m, n = 0;
      const re = /\brequests\.(get|post|put|patch|delete|head|request)\s*\(/g;
      while ((m = re.exec(t))) {
        const args = callArgs(t, m.index + m[0].length - 1);
        if (/timeout\s*=/.test(args)) continue;
        n++;
      }
      // urllib.request.urlopen has the same problem and the same fix.
      const urlopen = (t.match(/urlopen\s*\(/g) || []).length;
      if (!n && !urlopen) return null;
      return { evidence: (n + urlopen) + ' outbound call(s) with no timeout', n: n + urlopen };
    });
  }
});

/* ---- container runtime --------------------------------------------------- */

register({
  id: 'container-runs-as-root',
  title: 'Add a non-root USER to the image',
  category: 'runtime',
  severity: 'medium',
  confidence: 0.55,
  why: 'A process running as root in the container is root against every mounted volume, and it turns any container escape or writable-mount mistake from a contained problem into a host one.',
  fix: 'Create an unprivileged user, chown what it needs, and end the Dockerfile with USER.',
  run(ctx) {
    for (const p of ctx.find(/(^|\/)(Dockerfile|Containerfile)([.-][\w.-]+)?$/).slice(0, 1)) {
      const t = ctx.read(p);
      if (!t) continue;
      const s = stripComments(t);
      if (/^\s*USER\s+(?!root\s*$)\S+/im.test(s)) return null;
      // An image that only builds artifacts is not a runtime surface.
      if (!/^\s*(CMD|ENTRYPOINT)\b/im.test(s)) return null;
      return { where: p, evidence: 'CMD or ENTRYPOINT with no USER directive', n: 1 };
    }
    return null;
  }
});

register({
  id: 'secret-passed-as-build-arg',
  title: 'Stop passing the secret as a build argument or image env',
  category: 'runtime',
  severity: 'high',
  confidence: 0.6,
  why: 'ARG and ENV values are recorded in the image layers, so the credential is readable with docker history by anyone who can pull the image, and deleting the file in a later layer does not remove it.',
  fix: 'Mount it at build time with --mount=type=secret, or inject it at run time.',
  run(ctx) {
    const NAME = /(API[_-]?(KEY|SECRET|TOKEN)|SECRET[_-]?(KEY|ACCESS)?|PASSWORD|PASSWD|TOKEN|CREDENTIAL|PRIVATE[_-]?KEY)/i;
    for (const p of ctx.find(/(^|\/)(Dockerfile|Containerfile)([.-][\w.-]+)?$/).slice(0, 1)) {
      const t = ctx.read(p);
      if (!t) continue;
      let m;
      // Horizontal whitespace only. With \s* the value group ran past the end of
      // the line and captured the next instruction, so a bare "ARG API_TOKEN"
      // followed by RUN looked like a baked value of "RUN" - reporting the
      // documented correct way to accept a build secret as the finding.
      const re = /^[ \t]*(ARG|ENV)[ \t]+([A-Z0-9_]+)[ \t]*=?[ \t]*(\S*)/gim;
      while ((m = re.exec(stripComments(t)))) {
        const [, kind, name, value] = m;
        if (!NAME.test(name)) continue;
        if (/_(URL|URI|HOST|PORT|FILE|PATH|NAME|ID)$/i.test(name)) continue;
        // A declared-but-empty ARG is the correct way to accept one at build time.
        if (kind === 'ARG' && !value) continue;
        if (/^\$\{?\w+\}?$/.test(value)) continue;
        return { where: p, evidence: kind + ' ' + name + ' with a baked value', n: 1 };
      }
    }
    return null;
  }
});

register({
  id: 'compose-privileged-or-host-network',
  title: 'Drop privileged mode and host networking',
  category: 'runtime',
  severity: 'high',
  confidence: 0.7,
  why: 'privileged hands the container every capability including direct device access, which makes escaping to the host a documented one-liner, and host networking removes the network boundary so every port the container opens is open on the host.',
  fix: 'Grant the specific capability the workload needs with cap_add, and publish ports explicitly.',
  run(ctx) {
    return scan(ctx, (t, p) => {
      if (!/docker-compose/i.test(p)) return null;
      const priv = /^\s*privileged\s*:\s*true/im.test(t);
      const host = /^\s*network_mode\s*:\s*["']?host/im.test(t);
      const sock = /\/var\/run\/docker\.sock/.test(t);
      const hits = [priv && 'privileged: true', host && 'network_mode: host', sock && 'the docker socket mounted']
        .filter(Boolean);
      return hits.length ? { evidence: hits.join(', '), n: hits.length } : null;
    });
  }
});

// Re-exported so callers need one require rather than two: build-hygiene budgets
// the selection, the measurement harness reproduces it, and neither should have
// to know the file was split.
module.exports = { configFiles, selectPaths, callArgs, configScore };
