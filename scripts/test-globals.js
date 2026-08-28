#!/usr/bin/env node
/*
 * test-globals.js - the browser-side counterpart to test-imports.js.
 *
 * test-imports covers Node modules, where a missing name is a missing require.
 * The graph pages share code through window instead - CBDom, CBData, CBPanel,
 * KGData - and splitting code-brain.js into three files produced four separate
 * ReferenceErrors, each found by loading the page, reading one error, fixing it,
 * and loading again: deckSync, currentFocus, elFindings, ACCENT3.
 *
 * Every one of them was a name that had moved away from the file still using it,
 * and every one was invisible to node --check because they are runtime lookups.
 * So this reads each file, collects what it declares and what it can reach, and
 * reports any identifier used as a value that resolves nowhere.
 *
 * It is a linter, not a parser, so the known-global list is explicit and the
 * per-file allowances are written down. That is the trade: a short list to
 * maintain, against finding this class of fault by refreshing a page.
 *
 * Its blind spot is scope: it asks whether a name is declared anywhere in the
 * file, not whether it is in scope at the point of use. domainCounts was declared
 * inside one function and used inside another, which this passes and the browser
 * does not. Function-level scoping needs a real parser; until then, when moving a
 * block, bind everything it reads at the top rather than the subset a grep of the
 * first screen suggests.
 *
 *   node scripts/test-globals.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

// The files that share state through window, and what each is allowed to reach.
const GROUPS = [
  {
    name: 'code brain',
    files: ['cb-dom.js', 'cb-data.js', 'cb-panel.js', 'graph-shell.js', 'graph-grade.js', 'kg-traverse.js', 'code-brain.js'],
    provides: ['CBDom', 'CBData', 'CBPanel', 'GraphShell', 'GraphGrade', 'KGTraverse']
  },
  {
    name: 'semantic map',
    files: ['kg-data.js', 'graph-shell.js', 'graph-grade.js', 'kg-traverse.js', 'knowledge-graph.js'],
    provides: ['KGData', 'GraphShell', 'GraphGrade', 'KGTraverse']
  }
];

const BROWSER = new Set(['window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Date', 'Set', 'Map', 'WeakMap', 'Promise', 'RegExp',
  'Error', 'TypeError', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage',
  'sessionStorage', 'history', 'location', 'navigator', 'CSS', 'Intl', 'URL',
  'URLSearchParams', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'DOMParser',
  'ForceGraph3D', 'THREE', 'SpriteText', 'd3', 'mermaid', 'gsap', 'ScrollTrigger',
  'SiteReader', 'ReportRender', 'MarkdownRender', 'parseInt', 'parseFloat', 'isNaN',
  'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'Symbol',
  'Infinity', 'NaN', 'undefined', 'globalThis', 'structuredClone', 'performance',
  'AbortController', 'FormData', 'Blob', 'Image', 'Node', 'Element', 'HTMLElement']);

// Words that appear in call position without being variables: property names after
// optional chaining, labels, and the keywords a regex cannot tell from a call.
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
  'function', 'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'try', 'finally',
  'throw', 'case', 'break', 'continue', 'var', 'let', 'const', 'class', 'extends',
  'super', 'this', 'instanceof', 'yield', 'await', 'async', 'default', 'get', 'set',
  'static', 'true', 'false', 'null']);

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    // A regex literal can hold anything; drop the obvious ones. The placeholder is
    // a digit, not a word: /RE/ made the checker report RE as an unreachable name.
    .replace(/([=(,:]\s*)\/(?![*/])(?:\\.|\[[^\]]*\]|[^/\\\n])+\/[gimsuy]*/g, '$1/0/');
}

function declaredIn(src) {
  const names = new Set();
  const add = n => { if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n); };
  for (const m of src.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  /*
   * Multiple declarators, which routinely wrap:
   *     var showInfo = panel.showInfo, hoverCard = panel.hoverCard,
   *         renderFindings = panel.renderFindings;
   * Reading only to the end of the line reported renderFindings as unreachable
   * when it was declared two words later, so this reads to the semicolon.
   */
  for (const m of src.matchAll(/(?:var|let|const)\s+([^;]+);/g)) {
    for (const part of m[1].split(',')) add(part.split('=')[0].trim().replace(/[{}[\]]/g, ''));
  }
  // Destructuring, including from a module object.
  for (const m of src.matchAll(/(?:var|let|const)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) add(part.split(':').pop().trim());
  }
  // Parameters, in every shape these files use.
  for (const m of src.matchAll(/function[^(]*\(([^)]*)\)/g)) {
    for (const p of m[1].split(',')) add(p.trim().split(/[=\s]/)[0].replace(/[{}[\].]/g, ''));
  }
  for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) {
    for (const p of m[1].split(',')) add(p.trim().split(/[=\s]/)[0].replace(/[{}[\].]/g, ''));
  }
  for (const m of src.matchAll(/(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*=>/g)) add(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/for\s*\(\s*(?:var|let|const)?\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  return names;
}

let fail = 0;
for (const group of GROUPS) {
  for (const file of group.files) {
    const p = path.join('assets', 'js', file);
    if (!fs.existsSync(p)) { console.log(`FAIL  ${file} is missing`); fail++; continue; }
    const src = stripCommentsAndStrings(fs.readFileSync(p, 'utf8'));
    const declared = declaredIn(src);

    /*
     * Used as a value: called, read as an object, or indexed. Indexing was missing
     * at first, and that is exactly how domainCounts[node.name] slipped through -
     * a map read looks nothing like a call.
     */
    const used = new Set();
    for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?:\(|\[|\.[A-Za-z_$])/g)) used.add(m[1]);
    // And a bare read, which is how `model: EMBED_MODEL` escaped the Node-side
    // check. Keys before a colon are excluded: those are names, not reads.
    for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)(?![\w$])(?!\s*:)/g)) used.add(m[1]);

    for (const name of used) {
      if (KEYWORDS.has(name) || BROWSER.has(name)) continue;
      if (declared.has(name)) continue;
      if (group.provides.includes(name)) continue;
      fail++;
      console.log(`FAIL  ${file} uses ${name}, which it neither declares nor reaches`);
    }
  }
  console.log(`  ${group.name}: ${group.files.join(', ')}`);
}

/*
 * The other way these two pages rot. Their stylesheets were copies of each
 * other that drifted, and 39 rules were still byte-identical in both - which is
 * how a control written against .cg-btn landed in the file its page does not
 * load and silently did nothing. Those rules now live in graph-shell.css. This
 * fails if a page stylesheet reintroduces one verbatim, which is the exact
 * shape the duplication took the first time.
 */
{
  const cssRules = file => {
    const s = fs.readFileSync(path.join('assets', 'css', file), 'utf8');
    const out = new Map();
    let i = 0, depth = 0, start = 0, sel = null;
    while (i < s.length) {
      if (s[i] === '{') { if (!depth) sel = s.slice(start, i); depth++; }
      else if (s[i] === '}') {
        depth--;
        if (!depth) {
          const body = s.slice(start + sel.length, i + 1);
          out.set(sel.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
            body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim());
          start = i + 1;
        }
      }
      i++;
    }
    return out;
  };

  const shell = cssRules('graph-shell.css');
  for (const page of ['code-brain.css', 'knowledge-graph.css']) {
    const own = cssRules(page);
    for (const [sel, body] of own) {
      if (shell.has(sel) && shell.get(sel) === body) {
        fail++;
        console.log(`FAIL  ${page} repeats ${sel} verbatim from graph-shell.css`);
      }
    }
  }
  for (const page of ['code-brain.html', 'knowledge-graph.html']) {
    const html = fs.readFileSync(page, 'utf8');
    if (html.indexOf('assets/css/graph-shell.css') === -1) {
      fail++;
      console.log(`FAIL  ${page} does not load graph-shell.css`);
    }
    // Both pages offer the same second question of the same picture. One
    // without the control is a page where the grade is invisible again.
    for (const need of ['assets/js/graph-grade.js', 'id="grade-toggle"']) {
      if (html.indexOf(need) === -1) {
        fail++;
        console.log(`FAIL  ${page} is missing ${need}`);
      }
    }
  }
  console.log(`  shared chrome: graph-shell.css holds ${shell.size} rules, neither page repeats one`);
}

/*
 * The home page states figures about the estate and about the pipeline itself,
 * and the failure this guards against has already happened once: the hero
 * asserted 1,331 repositories for long enough that the real number passed it by
 * more than a hundred, with the same confidence as a measured one.
 *
 * So every such figure is a span filled from stats.json, and the two ways that
 * arrangement can rot are a span nothing writes and a writer for a span that no
 * longer exists. Both are checked, in both directions.
 */
{
  const html = fs.readFileSync('index.html', 'utf8');
  const js = fs.readFileSync(path.join('assets', 'js', 'site.js'), 'utf8');

  // Spans only. The hero also has a #hero-map canvas, which is a drawing
  // surface rather than a figure and is filled by drawHeroMap.
  const spans = [...html.matchAll(/<span id="((?:hero|pl)-[a-z]+)"/g)].map(m => m[1]);
  const written = new Set([...js.matchAll(/setNum\('((?:hero|pl)-[a-z]+)'/g)].map(m => m[1]));
  // pl-stages is filled from the length of the stage list rather than from
  // stats.json, because the number it states is the list.
  written.add('pl-stages');

  for (const id of spans) {
    if (!written.has(id)) {
      fail++;
      console.log(`FAIL  index.html has #${id} but nothing in site.js writes it`);
    }
  }
  for (const id of written) {
    if (id !== 'pl-stages' && spans.indexOf(id) === -1) {
      fail++;
      console.log(`FAIL  site.js writes #${id}, which index.html no longer has`);
    }
  }

  // The figures themselves have to be present and countable, or the page falls
  // back to whatever was typed into the markup without saying so.
  const stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
  const p = stats.pipeline || {};
  for (const key of ['scripts', 'suites', 'assertions', 'checks', 'axes']) {
    if (!(p[key] > 0)) {
      fail++;
      console.log(`FAIL  stats.json pipeline.${key} is missing or zero`);
    }
  }
  // The split the headline depends on. If these stop adding up, "codebases I
  // did not write" is counting repositories that were written here.
  if (stats.original + stats.forked !== stats.repos) {
    fail++;
    console.log(`FAIL  original + forked (${stats.original} + ${stats.forked}) != repos (${stats.repos})`);
  }
  console.log(`  home page figures: ${spans.length} spans, all written; ` +
    `${stats.forked} of ${stats.repos} forked, pipeline ${p.scripts} scripts / ${p.assertions} assertions`);
}

console.log(fail ? `\n  ${fail} unreachable name(s)` : '\n  every name in the graph pages resolves');
process.exit(fail ? 1 : 0);
