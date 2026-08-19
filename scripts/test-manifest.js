#!/usr/bin/env node
/*
 * test-manifest.js - every manifest parser, against a real-shaped fixture.
 *
 * Five of the nine parsers returned bare package names with the version thrown
 * away, which meant 1,742 Go dependencies, plus the Ruby, PHP, Dart and Java
 * ones, could not be checked against an advisory database at all: with no version
 * there is no question to ask. Nothing failed, so nothing showed it.
 *
 * Each fixture is written the way the format is actually written, comments and
 * options and all, and asserts both the name and the extracted constraint.
 *
 *   node scripts/test-manifest.js
 */
'use strict';
const { parseManifest } = require('./lib-manifest.js');

const CASES = [
  {
    file: 'package.json',
    text: '{"dependencies":{"react":"^18.2.0","left-pad":"1.3.0"},"devDependencies":{"vitest":"~1.2.0"}}',
    want: { react: '^18.2.0', 'left-pad': '1.3.0', vitest: '~1.2.0' }
  },
  {
    file: 'requirements.txt',
    text: '# comment\nrequests==2.31.0\nflask[async]>=2.0\n-e .\ngit+https://x/y\nnumpy\n',
    want: { requests: '==2.31.0', flask: '>=2.0', numpy: null }
  },
  {
    file: 'pyproject.toml',
    text: '[project]\nname = "x"\ndependencies = [\n  "httpx>=0.27.0",\n  "pydantic[email]==2.6.1",\n]\n',
    want: { httpx: '>=0.27.0', pydantic: '==2.6.1' }
  },
  {
    file: 'go.mod',
    text: 'module example.com/x\n\ngo 1.22\n\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgithub.com/Masterminds/semver/v3 v3.2.1\n)\n\nrequire golang.org/x/net v0.21.0\n',
    want: {
      'github.com/lib/pq': 'v1.10.9',
      // Case must survive: the lowercase form is a different module path and an
      // advisory lookup on it misses.
      'github.com/Masterminds/semver/v3': 'v3.2.1',
      'golang.org/x/net': 'v0.21.0'
    }
  },
  {
    file: 'Cargo.toml',
    text: '[dependencies]\nserde = "1.0.197"\ntokio = { version = "1.36", features = ["full"] }\n',
    want: { serde: '1.0.197', tokio: '1.36' }
  },
  {
    file: 'composer.json',
    text: '{"require":{"php":">=8.1","ext-curl":"*","monolog/monolog":"^3.5"},"require-dev":{"phpunit/phpunit":"^10.5"}}',
    want: { 'monolog/monolog': '^3.5', 'phpunit/phpunit': '^10.5' },
    absent: ['php', 'ext-curl']
  },
  {
    file: 'pubspec.yaml',
    text: 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n  http: ^1.2.0\n  provider: ^6.1.1\n',
    want: { http: '^1.2.0', provider: '^6.1.1' },
    absent: ['flutter']
  },
  {
    file: 'Gemfile',
    text: "source 'https://rubygems.org'\ngem 'rails', '~> 7.1.3'\ngem 'puma'\ngem 'dotenv', require: false\n",
    want: { rails: '~> 7.1.3', puma: null, dotenv: null }
  },
  {
    file: 'build.gradle',
    text: 'dependencies {\n  implementation "com.squareup.okhttp3:okhttp:4.12.0"\n  api("org.slf4j:slf4j-api:2.0.12")\n}\n',
    want: { okhttp: '4.12.0', 'slf4j-api': '2.0.12' }
  }
];

let fail = 0;
for (const c of CASES) {
  const got = parseManifest(c.file, c.text);
  const byName = new Map(got.map(p => [p.n, p.s]));
  for (const [name, spec] of Object.entries(c.want)) {
    if (!byName.has(name)) {
      fail++;
      console.log(`FAIL  ${c.file}: missing ${name}. got [${[...byName.keys()].join(', ')}]`);
      continue;
    }
    const actual = byName.get(name);
    if (actual !== spec) {
      fail++;
      console.log(`FAIL  ${c.file}: ${name} spec is ${JSON.stringify(actual)}, expected ${JSON.stringify(spec)}`);
    }
  }
  for (const name of c.absent || []) {
    if (byName.has(name)) {
      fail++;
      console.log(`FAIL  ${c.file}: ${name} should not be reported as a package`);
    }
  }
  const versioned = got.filter(p => p.s).length;
  console.log(`  ${c.file.padEnd(18)} ${got.length} package(s), ${versioned} with a version`);
}

console.log(fail ? `\n  ${fail} failures` : '\n  every parser returns names and versions');
process.exit(fail ? 1 : 0);
