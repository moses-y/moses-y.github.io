#!/usr/bin/env node
/*
 * test-flow.js - the flow analysis against a hand-built repository.
 *
 * The fixture is a small program whose shape is known: a CLI entry point, two
 * layers of helpers, a database write at the bottom, an unrelated helper nothing
 * calls, and a utility module several files depend on. Every claim the analysis
 * makes about it can be checked by eye, which is the only way to know that a path
 * printed into an article means what it says.
 *
 *   node scripts/test-flow.js
 */
'use strict';
const { flowFor } = require('./lib-flow.js');
const { effectOf } = require('./lib-effects.js');

const sym = {
  lang: 'Python',
  symbols: [
    { n: 'main', k: 'function', f: 'cli.py', l: 10 },
    { n: 'parse_args', k: 'function', f: 'cli.py', l: 30 },
    { n: 'run_import', k: 'function', f: 'importer.py', l: 5 },
    { n: 'normalise', k: 'function', f: 'importer.py', l: 40 },
    { n: 'save_batch', k: 'function', f: 'store.py', l: 12 },
    { n: 'connect', k: 'function', f: 'store.py', l: 4 },
    { n: 'slugify', k: 'function', f: 'util.py', l: 3 },
    { n: 'Store', k: 'class', f: 'store.py', l: 1 },
    { n: 'orphan_helper', k: 'function', f: 'util.py', l: 20 }
  ],
  calls: [
    ['main', 'parse_args', 1],
    ['main', 'run_import', 1],
    ['run_import', 'normalise', 3],
    ['run_import', 'save_batch', 1],
    ['normalise', 'slugify', 5],
    ['save_batch', 'connect', 1],
    ['save_batch', 'slugify', 1]
  ],
  effects: {
    save_batch: { db: 'cursor.executemany' },
    connect: { db: 'psycopg2.connect' },
    run_import: { network: 'requests.get' }
  }
};

let fail = 0;
const check = (label, ok, detail) => {
  if (ok) return;
  fail++;
  console.log(`FAIL  ${label}${detail ? ' - ' + detail : ''}`);
};

const flow = flowFor(sym);
check('analysis returns something', !!flow);

// main() is the entry point: it is named main, lives in cli.py, and nothing calls it.
const names = flow.entries.map(e => e.name);
check('main is found as an entry point', names.includes('main'), 'got ' + names.join(', '));
check('main ranks first by reach', flow.entries[0].name === 'main', 'got ' + flow.entries[0].name);
check('orphan_helper is not an entry point', !names.includes('orphan_helper'),
  'a function that reaches nothing must not be presented as a way in');
check('parse_args is not an entry point', !names.includes('parse_args'),
  'it is called by main and reaches nothing');

// The path from main to the database. main -> run_import is the shortest hop to a
// recorded effect, so that is what should come back.
const p = flow.paths.find(x => x.entry === 'main');
check('a path from main exists', !!p);
if (p) {
  check('the path starts at main', p.chain[0] === 'main');
  check('the path reaches a recorded effect', Object.keys(p.examples).length > 0);
  check('the path is the shortest one', p.chain.length === 2, 'got ' + p.chain.join(' -> '));
  check('the sink carries its evidence',
    Object.values(p.examples).some(v => /requests\.get/.test(v)), JSON.stringify(p.examples));
}

// store.py is called from two other files and holds both database effects, so it
// should outrank util.py, which is called more often but does nothing.
const roleFiles = flow.roles.map(r => r.file);
check('store.py is ranked above util.py',
  roleFiles.indexOf('store.py') < roleFiles.indexOf('util.py'),
  roleFiles.join(', '));
const store = flow.roles.find(r => r.file === 'store.py');
check('store.py records a database effect', store && store.effects.db);
check('store.py records inbound calls', store && store.inbound >= 1, store && String(store.inbound));
const util = flow.roles.find(r => r.file === 'util.py');
check('util.py records inbound calls from two files', util && util.inbound >= 2,
  util && String(util.inbound));
check('util.py has no effects', util && !Object.keys(util.effects).length);

// Effect totals, which the fact block prints as a summary line.
check('two functions touch the database', flow.effectTotals.db === 2, JSON.stringify(flow.effectTotals));
check('one function touches the network', flow.effectTotals.network === 1);

// A repo with symbols but no edges must yield no paths rather than a guess.
const noEdges = flowFor({ symbols: sym.symbols, calls: [], effects: {} });
check('no call edges yields no paths', noEdges && noEdges.paths.length === 0);
check('no call edges still yields file roles', noEdges && noEdges.roles.length > 0);
check('empty input yields nothing', flowFor({ symbols: [] }) === null);

// The effect classifier underneath it, on the receivers this fixture uses.
check('cursor.executemany is a database effect', effectOf('cursor.executemany') === 'db');
check('a bare get is not an effect', effectOf('x.get') === null);

console.log(fail ? `\n  ${fail} failures` : `\n  flow analysis correct on the fixture (${flow.entries.length} entries, ${flow.paths.length} paths, ${flow.roles.length} file roles)`);
process.exit(fail ? 1 : 0);
