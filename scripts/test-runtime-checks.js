#!/usr/bin/env node
/*
 * test-runtime-checks.js - proves each runtime rule can fire, and will not.
 *
 * The measurement harness reports how often a rule fires across the estate, and
 * for most of these rules the honest answer is zero. But zero is ambiguous: it
 * means either the estate is clean or the regex never matched anything in its
 * life. Those two readings call for opposite actions, and only fixtures can tell
 * them apart.
 *
 * So every rule carries a pair. `fires` is a snippet drawn from the pattern the
 * rule exists to catch, and the rule must report it. `quiet` is the nearest
 * correct code, usually the documented fix for the same situation, and the rule
 * must stay silent. A rule that fails the first is dead; a rule that fails the
 * second would publish a false positive on this repo's public pages, which is
 * the more expensive failure of the two.
 *
 *   node scripts/test-runtime-checks.js
 */
'use strict';
const hygiene = require('./lib-hygiene.js');
require('./checks-runtime.js');

// Each case names the file the snippet lives in, because selection is by name:
// a rule that only reads settings.py cannot be tested with a snippet in foo.py.
const CASES = [
  {
    id: 'debug-mode-enabled-in-config',
    fires: { 'settings.py': 'import os\nDEBUG = True\nALLOWED_HOSTS = ["example.com"]\n' },
    quiet: { 'settings.py': 'import os\nDEBUG = os.environ.get("DEBUG") == "1"\n' }
  },
  {
    id: 'debug-mode-enabled-in-config',
    label: 'flask app.run',
    fires: { 'app.py': 'app = Flask(__name__)\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", debug=True)\n' },
    quiet: { 'app.py': 'app = Flask(__name__)\nif __name__ == "__main__":\n    app.run(host="127.0.0.1")\n' }
  },
  {
    id: 'cors-allows-any-origin',
    fires: { 'main.py': 'app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True)\n' },
    quiet: { 'main.py': 'app.add_middleware(CORSMiddleware, allow_origins=["https://app.example.com"], allow_credentials=True)\n' }
  },
  {
    id: 'cors-allows-any-origin',
    label: 'django flag',
    fires: { 'settings.py': 'CORS_ALLOW_ALL_ORIGINS = True\n' },
    quiet: { 'settings.py': 'CORS_ALLOWED_ORIGINS = ["https://app.example.com"]\n' }
  },
  {
    id: 'allowed-hosts-wildcard',
    fires: { 'settings.py': 'ALLOWED_HOSTS = ["*"]\n' },
    quiet: { 'settings.py': 'ALLOWED_HOSTS = os.environ.get("HOSTS", "example.com").split(",")\n' }
  },
  {
    id: 'tls-verification-disabled',
    fires: { 'app.py': 'r = requests.get(url, verify=False, timeout=5)\n' },
    quiet: { 'app.py': 'r = requests.get(url, verify="/etc/ssl/certs/internal-ca.pem", timeout=5)\n' }
  },
  {
    id: 'tls-verification-disabled',
    label: 'node',
    fires: { 'server.js': 'const agent = new https.Agent({ rejectUnauthorized: false });\n' },
    quiet: { 'server.js': 'const agent = new https.Agent({ ca: fs.readFileSync("ca.pem") });\n' }
  },
  {
    id: 'hardcoded-secret-key-fallback',
    fires: { 'settings.py': 'SECRET_KEY = os.environ.get("SECRET_KEY", "8f2c1a9be47d05e6b3a7")\n' },
    quiet: { 'settings.py': 'SECRET_KEY = os.environ["SECRET_KEY"]\n' }
  },
  {
    id: 'hardcoded-secret-key-fallback',
    label: 'placeholder default stays quiet',
    fires: { 'settings.py': 'JWT_SECRET = os.getenv("JWT_SECRET", "k39Xm2Qp7Lz8Rw4Tn6Vb")\n' },
    quiet: { 'settings.py': 'JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")\n' }
  },
  {
    id: 'unsafe-deserialization',
    fires: { 'main.py': 'import yaml\ncfg = yaml.load(open(path).read())\n' },
    quiet: { 'main.py': 'import yaml\ncfg = yaml.load(open(path).read(), Loader=yaml.SafeLoader)\n' }
  },
  {
    id: 'unsafe-deserialization',
    label: 'pickle',
    fires: { 'main.py': 'import pickle\nobj = pickle.loads(payload)\n' },
    quiet: { 'main.py': 'import json\nobj = json.loads(payload)\n' }
  },
  {
    id: 'shell-command-from-interpolation',
    fires: { 'main.py': 'subprocess.run(f"git clone {repo_url}", shell=True)\n' },
    quiet: { 'main.py': 'subprocess.run(["git", "clone", repo_url])\n' }
  },
  {
    id: 'shell-command-from-interpolation',
    label: 'fixed command stays quiet',
    fires: { 'main.py': 'os.system("rm -rf " + target_dir)\n' },
    quiet: { 'main.py': 'subprocess.run("make build", shell=True)\n' }
  },
  {
    id: 'sql-built-by-string-interpolation',
    fires: { 'main.py': 'cur.execute(f"SELECT * FROM users WHERE email = \'{email}\'")\n' },
    quiet: { 'main.py': 'cur.execute("SELECT * FROM users WHERE email = %s", (email,))\n' }
  },
  {
    id: 'eval-on-runtime-value',
    fires: { 'main.py': 'result = eval(request.args.get("expr"))\n' },
    quiet: { 'main.py': 'result = ast.literal_eval(request.args.get("expr"))\n' }
  },
  {
    id: 'network-call-without-timeout',
    fires: { 'main.py': 'r = requests.get("https://api.example.com/v1/items")\n' },
    quiet: { 'main.py': 'r = requests.get("https://api.example.com/v1/items", timeout=10)\n' }
  },
  {
    id: 'container-runs-as-root',
    fires: { Dockerfile: 'FROM python:3.12-slim\nCOPY . /app\nCMD ["python", "app.py"]\n' },
    quiet: { Dockerfile: 'FROM python:3.12-slim\nCOPY . /app\nRUN useradd -m app\nUSER app\nCMD ["python", "app.py"]\n' }
  },
  {
    id: 'secret-passed-as-build-arg',
    fires: { Dockerfile: 'FROM node:20\nENV API_TOKEN=ghs_realtokenvalue123456\nCMD ["node", "."]\n' },
    quiet: { Dockerfile: 'FROM node:20\nARG API_TOKEN\nRUN --mount=type=secret,id=tok npm ci\nCMD ["node", "."]\n' }
  },
  {
    id: 'compose-privileged-or-host-network',
    fires: { 'docker-compose.yml': 'services:\n  web:\n    image: app\n    privileged: true\n' },
    quiet: { 'docker-compose.yml': 'services:\n  web:\n    image: app\n    cap_add:\n      - NET_ADMIN\n' }
  }
];

function runOn(files, id) {
  const tree = Object.keys(files).map(p => ({ path: p, size: files[p].length }));
  const ctx = hygiene.makeContext({
    tree, readFile: p => (files[p] == null ? null : files[p]),
    isOriginal: true, repoId: 'fixture', readBudget: 99
  });
  return hygiene.audit(ctx, { repoId: 'fixture', only: [id] });
}

let pass = 0, fail = 0;
for (const c of CASES) {
  const name = c.id + (c.label ? ' (' + c.label + ')' : '');
  const fired = runOn(c.fires, c.id);
  if (fired.length) { pass++; } else {
    fail++;
    console.log(`FAIL  ${name}: should have fired on the bad fixture and did not`);
  }
  const silent = runOn(c.quiet, c.id);
  if (!silent.length) { pass++; } else {
    fail++;
    console.log(`FAIL  ${name}: fired on the correct fixture - ${silent[0].evidence}`);
  }
}

const ids = new Set(CASES.map(c => c.id));
for (const check of hygiene.CHECKS.filter(c => c.category === 'runtime')) {
  if (!ids.has(check.id)) { fail++; console.log(`FAIL  ${check.id}: no fixture, so a zero firing rate proves nothing`); }
}

console.log(`\n  ${pass} passed, ${fail} failed across ${CASES.length} fixture pairs`);
process.exit(fail ? 1 : 0);
