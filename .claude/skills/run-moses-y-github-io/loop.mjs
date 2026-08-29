#!/usr/bin/env node
// Capability loop for moses-y.github.io.
//
// Walks the site as a graph of surfaces, asserts what each one must still do,
// and diffs the measurements against a recorded baseline. This is the guard rail
// for redesign work: the site has a lot of capability spread across pages that is
// easy to drop silently, so every improvement round ends with this.
//
//   node .claude/skills/run-moses-y-github-io/loop.mjs            # check vs baseline
//   node .claude/skills/run-moses-y-github-io/loop.mjs --baseline # record a new baseline
//   node .claude/skills/run-moses-y-github-io/loop.mjs --pipeline # regenerate first, then check
//
// Requires the static server on :8765 (see SKILL.md). Exits non-zero on any
// failed assertion or on a metric that regressed below its baseline.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(HERE, 'driver.mjs');
const BASELINE = join(HERE, 'baseline.json');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const args = process.argv.slice(2);
const record = args.includes('--baseline');
const withPipeline = args.includes('--pipeline');

// Pick a real article that has a diagram, so the check is not hostage to one slug.
function sampleArticle(withDiagram) {
  const files = readdirSync('blog').filter(f => f.endsWith('.html') && f !== 'index.html');
  for (const f of files) {
    const html = readFileSync(join('blog', f), 'utf8');
    if (!withDiagram || html.includes('class="mermaid"')) return f;
  }
  return files[0];
}

// Opens the Code Brain reader on a known repo, then evaluates the caller's
// expression against it. Every probe re-navigates, so the open cannot be done
// once and shared: prefix it and close the paren at the end of your expression.
// Polls for the report button rather than sleeping a fixed interval: a fixed
// 1800ms wait was marginal and one probe in four would return null while the
// other three opened the reader fine in the same run.
const READER_OPEN =
  '(()=>{const s=document.getElementById("search");s.value="hummingbot";' +
  's.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));' +
  'return new Promise(r=>{let n=0;const t=setInterval(()=>{' +
  'const b=document.getElementById("report-btn");' +
  'if(b&&b.style.display!=="none"){clearInterval(t);b.click();' +
  'setTimeout(()=>r(';
// ...caller expression here, then READER_END
const READER_END =
  '),3200);return}if(++n>60){clearInterval(t);r(null)}},150)})})()';

// name -> { url, probes: [[label, jsExpression]] }. Numbers are compared to the
// baseline (must not decrease); strings must match exactly.
function surfaces() {
  const article = sampleArticle(true);
  return [
    ['home', '/', [
      // Counted the elements still HIDDEN, so fewer was better while the loop
      // treats a smaller number as a regression - the one probe where the rule
      // ran backwards, and it recorded a broken 9 as the baseline to beat.
      // A boolean cannot invert like that.
      ['reveal_all_shown',
        'window.scrollTo(0,document.body.scrollHeight),new Promise(r=>setTimeout(()=>r([...document.querySelectorAll(".reveal")].filter(e=>getComputedStyle(e).opacity==="0").length===0),1500))'],
      ['nav_links', 'document.querySelectorAll("#navbar a[href]").length'],
      ['hero_stats', 'document.querySelectorAll(".stats-bar .stat-number").length'],
      // The bar was trimmed and the full list moved into the menu, so the menu is
      // now where navigation coverage has to be asserted.
      ['menu_opens',
        '(()=>{document.getElementById("nav-toggle").click();return new Promise(r=>setTimeout(()=>r(getComputedStyle(document.getElementById("mobile-menu")).visibility),700))})()'],
      ['menu_links', 'document.querySelectorAll("#mobile-menu a[href]").length'],
      ['menu_groups', 'document.querySelectorAll("#mobile-menu .menu-group").length'],
      ['menu_has_contact', '!!document.querySelector(\'#mobile-menu a[href*="#contact"]\')'],
      ['about_section', 'document.querySelectorAll("#about .about-body p").length']
    ]],
    ['projects', '/projects.html', [
      ['cards', 'document.querySelectorAll(".project-card").length'],
      ['total_repos', '(()=>{const m=document.body.innerText.match(/of\\s+([\\d,]+)\\s+repos/);return m?+m[1].replace(/,/g,""):0})()'],
      ['filter_chips', 'document.querySelectorAll(".filter-chip").length'],
      // The listing must come from the lean index, never the 10MB feed or the DB.
      ['no_heavy_payload',
        'performance.getEntriesByType("resource").filter(r=>/forks\\.(json|db)|sql-wasm/.test(r.name)).length'],
      ['index_used',
        'performance.getEntriesByType("resource").filter(r=>/data\\/index\\.json/.test(r.name)).length'],
      ['search_narrows',
        '(()=>{const s=document.getElementById("search-input");s.value="agent";s.dispatchEvent(new Event("input",{bubbles:true}));return new Promise(r=>setTimeout(()=>r(document.getElementById("projects-container").children.length>0),900))})()'],
      // The cards carry measured facts now, not a stock photo. A photo coming
      // back means the old renderer is live again.
      ['card_photos', 'document.querySelectorAll(".project-card img").length'],
      ['card_read_buttons', 'document.querySelectorAll(".read-btn").length'],
      ['cards_equal_height',
        '(()=>{const h=[...document.querySelectorAll(".featured-card .project-card")].map(e=>Math.round(e.getBoundingClientRect().height));return h.length>1&&new Set(h).size===1})()'],
      // The lean index has no summaries, so opening a briefing must fetch one.
      // This is the regression that started it: cards showed the one-line
      // description and there was no way to reach the writing at all.
      ['reader_briefing_chars',
        '(()=>{document.querySelector(".read-btn").click();return new Promise(r=>setTimeout(()=>r(document.getElementById("rd-brief").innerText.length),3200))})()'],
      // Clicking the gutter closes it. It did nothing, which is the first thing
      // anyone tries on an overlay.
      ['reader_backdrop_closes',
        '(()=>{document.querySelector(".read-btn").click();return new Promise(r=>setTimeout(()=>{const sc=document.getElementById("rd-scroll");const b=sc.getBoundingClientRect();const t=document.elementFromPoint(b.left+30,b.top+250);if(t)t.click();setTimeout(()=>r(document.getElementById("reader").hidden),600)},2600))})()'],
      // The next repository is named at the end of the article, and arrow keys
      // move between them without going back to the list.
      ['reader_next_block',
        '(()=>{document.querySelector(".read-btn").click();return new Promise(r=>setTimeout(()=>r(document.querySelectorAll("#rd-next .rd-step").length),2800))})()'],
      ['reader_arrow_advances',
        '(()=>{document.querySelector(".read-btn").click();return new Promise(r=>setTimeout(()=>{const a=SiteReader.position().pos;document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));setTimeout(()=>r(SiteReader.position().pos===a+1),1800)},2600))})()'],
      // A block torn out of the reading column by site.css's bare `nav` rule.
      ['reader_next_inside_column',
        '(()=>{document.querySelector(".read-btn").click();return new Promise(r=>setTimeout(()=>{const n=document.getElementById("rd-next").getBoundingClientRect();const c=document.querySelector(".rd-col").getBoundingClientRect();r(n.left>=c.left-2&&n.right<=c.right+2)},2800))})()']
    ], '.project-card'],
    ['code-brain', '/code-brain.html', [
      ['canvas', 'new Promise(r=>setTimeout(()=>r(document.querySelectorAll("canvas").length),6000))'],
      ['repos', '+(document.getElementById("s-repos")||{}).textContent'],
      ['domains', '+(document.getElementById("s-domains")||{}).textContent'],
      ['languages', '+(document.getElementById("s-langs")||{}).textContent'],
      // Geometry, not just presence. Three regressions shipped green because the
      // loop asked "does a canvas exist" rather than "is it the right size", and
      // "is there a panel" rather than "is it on screen".
      ['canvas_matches_container',
        'new Promise(r=>setTimeout(()=>{const c=document.querySelector("#graph canvas");const g=document.getElementById("graph").getBoundingClientRect();r(!!c&&c.style.width===Math.round(g.width)+"px"&&c.style.height===Math.round(g.height)+"px")},6500))'],
      // 700ms was marginal against the panel's 350ms slide under load, and this
      // reported false on geometry that measures correct at 1600ms.
      ['panel_within_stage',
        '(()=>{const i=document.getElementById("info");i.classList.add("open");return new Promise(r=>setTimeout(()=>{const s=document.querySelector(".stage").getBoundingClientRect();const b=i.getBoundingClientRect();i.classList.remove("open");r(b.top>=s.top-2&&b.bottom<=s.bottom+2&&b.right<=s.right+2)},1600))})()'],
      ['graph_fills_stage',
        '(()=>{const g=document.getElementById("graph").getBoundingClientRect();const s=document.querySelector(".stage").getBoundingClientRect();return Math.round(g.width)>=Math.round(s.width)-2&&Math.round(g.height)>=Math.round(s.height)-2})()'],
      // Growing one repo must not re-lay-out the estate. Unpinned this drifted 435px;
      // pinned it is ~24px. The 7s wait first lets the initial layout settle, or the
      // probe measures settling rather than the grow.
      ['grow_keeps_layout',
        '(()=>{const cb=window.__codeBrain;if(!cb)return false;return new Promise(done=>{setTimeout(()=>{const b=cb.positions();const id=cb.firstRepo();if(!id){done(false);return;}cb.grow(id);setTimeout(()=>{const a=cb.positions();let m=0;for(const k of Object.keys(b)){if(!a[k]||b[k][0]==null||a[k][0]==null)continue;const d=Math.hypot(a[k][0]-b[k][0],a[k][1]-b[k][1],a[k][2]-b[k][2]);if(d>m)m=d}done(m<120)},4500)},7000)})})()'],
      ['deck_rows', 'document.querySelectorAll(".drow").length'],
      ['readout_figures', 'document.querySelectorAll(".ro-fig .n").length'],
      // The reader must open in place, render the deterministic report, lift the
      // briefing prose, and paint above the nav. It shipped once with its own back
      // button unreachable because the nav painted over it.
      // Each probe re-navigates, so every one of these opens the reader itself.
      ['reader_findings',
        READER_OPEN + 'document.querySelectorAll("#rd-body .finding").length' + READER_END],
      ['reader_above_nav',
        READER_OPEN + '(()=>{const e=document.elementFromPoint(700,20);return !!e&&!!e.closest(".reader")})()' + READER_END],
      ['reader_briefing_chars',
        READER_OPEN + 'document.getElementById("rd-brief").innerText.length' + READER_END],
      ['reader_closes',
        READER_OPEN + '(()=>{document.getElementById("rd-close").click();return new Promise(d=>setTimeout(()=>d(document.getElementById("reader").hidden),700))})()' + READER_END]
    ], '.drow'],
    ['sitemap', '/sitemap.html', [
      ['domains', 'document.querySelectorAll(".sm-domain").length'],
      ['briefing_links', 'document.querySelectorAll(".sm-briefings li a").length'],
      ['surface_links', 'document.querySelectorAll(".sm-cols li a").length'],
      ['nav_present', 'document.querySelectorAll(".sm-nav a").length']
    ], '.sm-domain'],
    ['knowledge-graph', '/knowledge-graph.html', [
      ['canvas', 'new Promise(r=>setTimeout(()=>r(document.querySelectorAll("#graph canvas").length),6000))'],
      ['repos', '+(document.getElementById("s-repos")||{}).textContent'],
      // Plate layout: the deck must stay in sync with the graph it drives.
      ['deck_cards', 'document.querySelectorAll(".card").length'],
      ['readout_figures', 'document.querySelectorAll(".ro-fig .n").length'],
      ['controls_kept', 'document.querySelectorAll("#search,#reset,#semantic-toggle,#legend-toggle,#prev,#next").length'],
      // Geometry, not just presence. Three regressions shipped green because the
      // loop asked "does a canvas exist" rather than "is it the right size", and
      // "is there a panel" rather than "is it on screen".
      ['canvas_matches_container',
        'new Promise(r=>setTimeout(()=>{const c=document.querySelector("#graph canvas");const g=document.getElementById("graph").getBoundingClientRect();r(!!c&&c.style.width===Math.round(g.width)+"px"&&c.style.height===Math.round(g.height)+"px")},6500))'],
      ['panel_within_stage',
        '(()=>{const i=document.getElementById("info");i.classList.add("open");return new Promise(r=>setTimeout(()=>{const s=document.querySelector(".stage").getBoundingClientRect();const b=i.getBoundingClientRect();i.classList.remove("open");r(b.top>=s.top-2&&b.bottom<=s.bottom+2&&b.right<=s.right+2)},1600))})()'],
      ['graph_fills_stage',
        '(()=>{const g=document.getElementById("graph").getBoundingClientRect();const s=document.querySelector(".stage").getBoundingClientRect();return Math.round(g.width)>=Math.round(s.width)-2&&Math.round(g.height)>=Math.round(s.height)-2})()'],
      ['card_drives_focus',
        '(()=>{document.querySelectorAll(".card")[2].click();return new Promise(r=>setTimeout(()=>r(document.querySelectorAll(\'.card[data-active="1"]\').length===1 && document.getElementById("info").classList.contains("open")),1500))})()']
    ], '.card'],
    ['article', '/blog/' + article, [
      // Counts prose blocks, not <p> specifically: headings are promoted out of
      // <p> now, and a tag-specific probe would read that as lost content.
      ['paragraphs', 'document.querySelectorAll("#post-content p, #post-content .post-h").length'],
      ['headings', 'document.querySelectorAll("#post-content .post-h").length'],
      ['listen_bar', 'getComputedStyle(document.getElementById("listen-bar")).display'],
      ['analysis_section', 'document.querySelectorAll(".analysis").length'],
      ['readiness_checks', 'document.querySelectorAll(".an-checks li").length'],
      ['mermaid_svg', 'new Promise(r=>setTimeout(()=>r(document.querySelectorAll(".mermaid svg").length),4000))'],
      ['graph_links', 'document.querySelectorAll(".an-links a").length'],
      // Dependency reporting is data-dependent, so assert the site-wide count from
      // the generator rather than a single article that may not have data yet.
      ['dep_blocks_sitewide',
        'fetch("/data/deps.json").then(r=>r.ok?r.json():null).then(d=>d?Object.keys(d.repos).length:0).catch(()=>0)']
    ], '.analysis']
  ];
}

function probe(url, expr, waitSel) {
  // Without the wait, probes race the 10MB forks.json fetch: cards read 0 and any
  // expression that assumes rendered content throws.
  const cmds = waitSel ? ['wait:' + waitSel + ':40000', 'eval:' + expr] : ['eval:' + expr];
  try {
    const out = execFileSync('node', [DRIVER, BASE + url, ...cmds],
      { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    const line = out.split('\n').find(l => l.startsWith('eval'));
    if (!line) return { err: 'no result' };
    return { val: JSON.parse(line.slice(6).trim()) };
  } catch (e) {
    const so = (e.stdout || '').toString();
    const line = so.split('\n').find(l => l.startsWith('eval'));
    // driver exits 1 on page errors; the eval result is still usable.
    if (line) { try { return { val: JSON.parse(line.slice(6).trim()), warn: 'page error' }; } catch {} }
    return { err: (e.stderr || e.message || '').toString().split('\n')[0].slice(0, 120) };
  }
}

if (withPipeline) {
  console.log('# pipeline');
  for (const s of ['src/site/generate-blog-pages.js', 'src/site/generate-rss.js',
                   'src/stages/build-stats.js', 'src/stages/build-index.js']) {
    const t0 = Date.now();
    try {
      execFileSync('node', [s], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000 });
      console.log(`  ok   ${s.split('/').pop().padEnd(26)} ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`  FAIL ${s}: ${(e.stderr || '').toString().split('\n')[0]}`);
      process.exitCode = 1;
    }
  }
}

const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
if (!prev && !record) console.log('(no baseline yet - run with --baseline to record one)\n');

const now = {};
let fails = 0, regressions = 0;

for (const [name, url, probes, waitSel] of surfaces()) {
  console.log(`# ${name}  ${url}`);
  now[name] = {};
  for (const [label, expr] of probes) {
    const { val, err, warn } = probe(url, expr, waitSel);
    if (err) { console.log(`  FAIL ${label}: ${err}`); fails++; continue; }
    now[name][label] = val;
    const was = prev?.[name]?.[label];
    let note = '';
    if (was !== undefined) {
      if (typeof val === 'number' && typeof was === 'number') {
        if (val < was) { note = `  REGRESSION was ${was}`; regressions++; }
        else if (val > was) note = `  (up from ${was})`;
      } else if (val !== was) { note = `  REGRESSION was ${JSON.stringify(was)}`; regressions++; }
    }
    console.log(`  ${note.includes('REGRESSION') ? 'REGR' : 'ok  '} ${label.padEnd(28)} ${JSON.stringify(val)}${note}${warn ? '  [' + warn + ']' : ''}`);
  }
}

if (record) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
  console.log(`\nbaseline written -> ${BASELINE}`);
} else {
  console.log(`\n${fails} failed probe(s), ${regressions} regression(s)`);
}
process.exit(record ? 0 : (fails || regressions ? 1 : 0));
