#!/usr/bin/env node
/*
 * test-json.js - the stable serialiser.
 *
 * These assertions exist because the skip-if-unchanged guard is the kind of
 * optimisation that fails in exactly one direction: if it skips a write it
 * should have made, a published file silently goes stale and every claim in it
 * keeps being served as current. So the cases that matter are not "does it
 * skip" but "does it write when it must".
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeStable, sortKeys, stripTimes } = require('./lib-json.js');

let fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fail++;
  console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossa-json-'));
const f = p => path.join(dir, p);

console.log('the serialiser is stable and skips only what did not change');

// --- key ordering ---------------------------------------------------------
const a = sortKeys({ b: 1, a: { d: 4, c: 3 } });
check('keys are sorted recursively',
  JSON.stringify(a) === '{"a":{"c":3,"d":4},"b":1}', JSON.stringify(a));

// Arrays carry meaning here - ranked findings, priority-ordered paths - so
// sorting them would destroy information rather than stabilise it.
const arr = sortKeys({ xs: [3, 1, 2] });
check('array order is preserved', JSON.stringify(arr.xs) === '[3,1,2]');

check('insertion order does not change the output',
  JSON.stringify(sortKeys({ z: 1, a: 2 })) === JSON.stringify(sortKeys({ a: 2, z: 1 })));

// --- the write / skip decision -------------------------------------------
const p1 = f('one.json');
check('first write happens', writeStable(p1, { generated: 'T1', n: 1 }).written);

check('identical content is skipped',
  writeStable(p1, { generated: 'T1', n: 1 }).written === false);

check('a NEW TIMESTAMP ALONE is skipped',
  writeStable(p1, { generated: 'T2', n: 1 }).written === false);

// The one that matters most: a real change must never be skipped because a
// timestamp was masked out of the comparison.
check('a real change is written even when the timestamp is identical',
  writeStable(p1, { generated: 'T1', n: 2 }).written === true);

check('a real change is written alongside a new timestamp',
  writeStable(p1, { generated: 'T3', n: 3 }).written === true);

// Reordered keys with identical content must not count as a change, or the
// sorting would be pointless.
const p2 = f('two.json');
writeStable(p2, { a: 1, b: 2 });
check('reordered keys are not a change',
  writeStable(p2, { b: 2, a: 1 }).written === false);

// Nested timestamps must be masked too, not just top-level ones.
const p3 = f('three.json');
writeStable(p3, { meta: { generated: 'T1' }, v: 1 });
check('a nested timestamp alone is skipped',
  writeStable(p3, { meta: { generated: 'T9' }, v: 1 }).written === false);
check('a nested real change is written',
  writeStable(p3, { meta: { generated: 'T9' }, v: 2 }).written === true);

// --- correctness of what lands on disk ------------------------------------
const p4 = f('four.json');
writeStable(p4, { z: 1, a: 2, generated: 'T' });
const text = fs.readFileSync(p4, 'utf8');
check('output parses', (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })());
check('the timestamp is still written, only masked for comparison',
  JSON.parse(text).generated === 'T');
check('output ends with a newline', text.endsWith('\n'));
check('output is indented, so git can diff it by line', text.includes('\n '));

// A file that does not parse must be replaced, not skipped.
const p5 = f('five.json');
fs.writeFileSync(p5, '{ this is not json');
check('a corrupt existing file is overwritten rather than skipped',
  writeStable(p5, { ok: 1 }).written === true);

check('force overrides the skip', writeStable(p2, { b: 2, a: 1 }, { force: true }).written === true);

check('stripTimes leaves non-time keys alone',
  JSON.stringify(stripTimes({ generated: 1, kept: 2 })) === '{"kept":2}');

fs.rmSync(dir, { recursive: true, force: true });

console.log(fail ? '\n' + fail + ' failing' : '\nall passing');
process.exit(fail ? 1 : 0);
