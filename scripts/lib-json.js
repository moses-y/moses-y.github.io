/*
 * lib-json.js - one way to write a JSON artefact.
 *
 * The pipeline had two, and both were wrong at the size they were used.
 * update-forks.js was the only writer that indented, on the 46 MB file where
 * indentation costs the most. The other twelve minified to a single line, so
 * git stored a whole new 4.3 MB blob for data/hygiene.json whenever one byte
 * inside it moved.
 *
 * Worse than either: every file carried its own `generated` timestamp, so ten
 * artefacts changed every run whether or not anything in them did. A 2-hourly
 * job therefore rewrote roughly 11 MB of git objects to record that the clock
 * had advanced.
 *
 * writeStable fixes all three:
 *
 *   1. Keys are sorted recursively, so key order is a contract rather than an
 *      accident of insertion. Nothing depended on insertion order; it was
 *      simply stable by luck, which is not the same as stable.
 *   2. Output is indented, so git stores line-level deltas instead of a new
 *      blob. This costs disk and gzips away to nothing, and it is what makes a
 *      diff reviewable at all.
 *   3. The file is compared against what is already on disk WITH THE TIMESTAMP
 *      MASKED, and the write is skipped entirely when nothing else changed.
 *      That is the half that matters: it turns "this ran" into "this changed".
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Fields that mean "when this ran" rather than "what this found". Masked for
// the comparison, then written as normal if anything else actually moved.
const TIME_KEYS = ['generated', 'lastUpdated', 'builtAt', 'asOf'];

/*
 * Sorts object keys recursively. Arrays keep their order - it is frequently
 * meaningful here (ranked findings, priority-ordered paths, cluster members)
 * and sorting them would destroy information rather than stabilise it.
 */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

function stripTimes(value) {
  if (Array.isArray(value)) return value.map(stripTimes);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const k of Object.keys(value)) {
      if (TIME_KEYS.includes(k)) continue;
      out[k] = stripTimes(value[k]);
    }
    return out;
  }
  return value;
}

/*
 * Returns { written, reason }. Callers that report counts want to say "skipped,
 * unchanged" rather than "wrote", because those are different facts about a run
 * and collapsing them is how a pipeline looks busy while doing nothing.
 *
 * `indent` defaults to 1 rather than 2: at these file sizes the second space
 * buys nothing a reader notices and costs megabytes across the data layer.
 * Pass 2 for small files meant to be read directly, like schema.json.
 */
function writeStable(file, data, opts) {
  const o = opts || {};
  const indent = o.indent == null ? 1 : o.indent;
  const sorted = o.sortKeys === false ? data : sortKeys(data);
  const text = JSON.stringify(sorted, null, indent) + '\n';

  if (!o.force && fs.existsSync(file)) {
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { prev = null; }
    if (prev !== null) {
      const a = JSON.stringify(stripTimes(sorted));
      const b = JSON.stringify(stripTimes(o.sortKeys === false ? prev : sortKeys(prev)));
      if (a === b) return { written: false, reason: 'unchanged' };
    }
  }

  const dir = path.dirname(file);
  if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text);
  return { written: true, reason: 'changed', bytes: Buffer.byteLength(text) };
}

/*
 * For the per-repository shards, where the question is asked thousands of times
 * per run and the answer is usually "no". Same semantics, reported in bulk.
 */
function writeStableMany(entries, opts) {
  let written = 0, skipped = 0;
  for (const [file, data] of entries) {
    if (writeStable(file, data, opts).written) written++; else skipped++;
  }
  return { written, skipped };
}

module.exports = { writeStable, writeStableMany, sortKeys, stripTimes, TIME_KEYS };
