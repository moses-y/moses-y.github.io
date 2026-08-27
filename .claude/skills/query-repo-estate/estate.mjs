#!/usr/bin/env node
/*
 * estate.mjs - query the published relation layer without cloning anything.
 *
 * Every file this reads is static and public, so there is no server, no key and
 * no install. Node >= 18 for global fetch; no dependencies.
 *
 * The single-letter record keys are decoded from /data/schema.json rather than
 * from a copy of the mapping kept here, which is deliberate: if the schema is
 * not sufficient to read the index, this breaks, and that is the correct
 * outcome. It is the only consumer that would notice.
 *
 *   node estate.mjs find <text>
 *   node estate.mjs show <id|name>
 *   node estate.mjs kin <id|name>
 *   node estate.mjs cluster <id|name>
 *   node estate.mjs report
 *
 * --local reads ./data from a checkout instead of the network.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SITE = process.env.ESTATE_SITE || 'https://moses-y.github.io';
const args = process.argv.slice(2).filter(a => a !== '--local');
const LOCAL = process.argv.includes('--local');
const cache = new Map();

async function load(file) {
  if (cache.has(file)) return cache.get(file);
  let value;
  if (LOCAL) {
    const text = await readFile(path.join(process.cwd(), 'data', file), 'utf8');
    value = file.endsWith('.md') ? text : JSON.parse(text);
  } else {
    const res = await fetch(SITE + '/data/' + file);
    if (!res.ok) throw new Error(res.status + ' ' + SITE + '/data/' + file);
    value = file.endsWith('.md') ? await res.text() : await res.json();
  }
  cache.set(file, value);
  return value;
}

/*
 * A numeric argument is a repository id and costs one small fetch. A name costs
 * the whole index, which is 774 KB. Worth keeping the two apart in your head:
 * once you have an id, every later hop is cheap.
 */
async function resolve(ref) {
  if (/^\d+$/.test(ref)) return Number(ref);
  const index = await load('index.json');
  const needle = ref.toLowerCase();
  const exact = index.repos.find(r => r.n.toLowerCase() === needle);
  if (exact) return exact.i;
  const near = index.repos.filter(r => r.n.toLowerCase().includes(needle));
  if (!near.length) throw new Error('no repository matching "' + ref + '"');
  if (near.length > 1 && near.length <= 10) {
    throw new Error('ambiguous: ' + near.map(r => r.n).join(', '));
  }
  if (near.length > 10) throw new Error(near.length + ' repositories match "' + ref + '"; be more specific');
  return near[0].i;
}

function grade(r) {
  return r.v === 0 ? 'clean' : Array.isArray(r.v) ? r.v.join('/') : 'not audited';
}

async function cmdFind(text) {
  const index = await load('index.json');
  const needle = String(text || '').toLowerCase();
  if (!needle) throw new Error('find needs something to search for');
  const hits = index.repos.filter(r =>
    r.n.toLowerCase().includes(needle) ||
    (r.t || '').toLowerCase().includes(needle) ||
    (r.d || '').toLowerCase().includes(needle));

  if (!hits.length) return console.log('nothing matches "' + text + '"');
  console.log(hits.length + ' match "' + text + '"' + (hits.length > 25 ? ', showing 25' : ''));
  for (const r of hits.slice(0, 25)) {
    console.log('  ' + String(r.i).padEnd(11) + r.n.padEnd(32) +
      (r.l || '-').padEnd(13) + (r.g || '').padEnd(24) + (r.d || '').slice(0, 60));
  }
}

async function cmdShow(ref) {
  const [index, schema] = await Promise.all([load('index.json'), load('schema.json')]);
  const id = await resolve(ref);
  const r = index.repos.find(x => x.i === id);
  if (!r) throw new Error('id ' + id + ' is not in the index');

  console.log(r.n + '  (' + r.i + ')');
  console.log(SITE + '/blog/' + r.n + '.html');
  console.log();
  for (const key of Object.keys(r)) {
    const field = schema.record[key];
    // Split on a sentence end, not on any full stop: several descriptions
    // contain "e.g." and would otherwise be cut to "Repository kind, e".
    const label = field ? field.description.split(/\.\s+(?=[A-Z])/)[0] : key;
    console.log('  ' + label.slice(0, 46).padEnd(48) +
      (key === 'v' ? grade(r) : JSON.stringify(r[key])).slice(0, 70));
  }
}

/*
 * The whole point of the layer. One fetch of about 1 KB returns both kinds of
 * neighbour, and the provenance line is printed rather than summarised because
 * the two lists do not deserve equal trust: stack edges name the packages they
 * were drawn from and can be checked, semantic edges are a number out of an
 * embedding and cannot.
 */
async function cmdKin(ref) {
  const id = await resolve(ref);
  const k = await load('kin/' + id + '.json');

  console.log(k.name + '  (' + id + ')  ' + (k.domain || '') +
    (k.letter ? '  grade ' + k.letter + ' ' + k.score : '  not audited'));
  if (k.cluster) console.log('cluster ' + k.cluster);
  console.log();

  const stack = k.stack || [];
  console.log('EXTRACTED - shares declared dependencies  (' + stack.length + ')');
  if (!stack.length) console.log('  none: no manifest this pipeline reads, or nothing distinctive shared');
  for (const n of stack.slice(0, 10)) {
    console.log('  ' + String(n.weight).padEnd(7) + String(n.id).padEnd(11) +
      (n.name || '').padEnd(30) + (n.shared || []).slice(0, 4).join(' '));
  }

  const sem = k.semantic || [];
  console.log();
  console.log('INFERRED - similar embedding, no evidence beyond the score  (' + sem.length + ')');
  for (const n of sem.slice(0, 10)) {
    console.log('  ' + String(n.similarity).padEnd(7) +
      String(n.id).padEnd(11) + (n.name || '').padEnd(30) + (n.domain || ''));
  }

  // A pair carrying both edges is the strongest thing this layer can say: a
  // guess that something measured happens to agree with.
  const both = sem.filter(s => stack.some(t => t.id === s.id));
  if (both.length) {
    console.log();
    console.log('CORROBORATED - on both lists: ' +
      both.map(b => b.name || b.id).join(', '));
  }
}

async function cmdCluster(ref) {
  const id = await resolve(ref);
  const file = await load('clusters.json');
  const c = file.clusters.find(g => g.members.some(m => m.id === id));
  if (!c) {
    return console.log(id + ' is in no cluster: nothing else in the estate is ' +
      'within ' + file.threshold + ' of it.');
  }

  console.log(c.id + ' - ' + c.size + ' repositories' + (c.crossDomain ? ', crosses a domain' : ''));
  console.log(file.method || 'clustered from semantic edges');
  console.log('INFERRED. Closely related, not duplicates.');
  console.log();
  for (const m of c.members) {
    console.log('  ' + (m.id === c.keeper.id ? '* ' : '  ') + String(m.id).padEnd(11) +
      m.name.padEnd(30) + (m.letter ? (m.letter + ' ' + m.score).padEnd(9) : 'ungraded '.padEnd(9)) +
      (m.domain || ''));
  }
  console.log();
  console.log('* keeper: highest grade, ties broken on stars then size.');
}

async function cmdReport() {
  console.log(await load('clusters.md'));
}

const COMMANDS = {
  find: cmdFind, show: cmdShow, kin: cmdKin, cluster: cmdCluster, report: cmdReport
};

const run = COMMANDS[args[0]];
if (!run) {
  console.error('usage: estate.mjs find|show|kin|cluster|report [argument] [--local]');
  process.exit(2);
}
try {
  await run(args.slice(1).join(' '));
} catch (err) {
  console.error('estate: ' + err.message);
  process.exit(1);
}
