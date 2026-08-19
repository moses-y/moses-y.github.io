/*
 * lib-blog-analysis.js - the measured half of a blog page.
 *
 * Everything here turns stored analysis into page content with no model
 * involved: the module and architecture diagrams, the dependency report, the
 * readiness summary, and the prose rendering of a stored article. Split out of
 * generate-blog-pages.js at the 450-line limit, and the seam is the honest one -
 * this is what the page says, the generator is where the page is assembled.
 */
'use strict';
const fs = require('fs');
const path = require('path');
// renderSummary refuses to publish a stored scratchpad, so the gate has to travel
// with it rather than stay behind in the generator.
const { looksLikeReasoning } = require('./lib-quality.js');
const { renderMarkdown, hasMarkdown, hasStrongStructure } = require('./lib-markdown.js');

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Mermaid node ids must be identifier-safe; module paths are not.
function mermaidId(s, i) {
    return 'n' + i + '_' + String(s).replace(/[^A-Za-z0-9]/g, '_').slice(-28);
}

// The summaries are stored already stripped of markdown, so "## What This Does"
// arrives as the bare line "What This Does" and used to render as a paragraph -
// every article was one undifferentiated wall of text. The heading text itself
// survived the strip, so the structure can be restored: a short single line with
// no terminating punctuation was a heading before it was flattened.
function looksLikeHeading(block) {
    if (block.indexOf('\n') !== -1) return false;
    if (block.length > 60) return false;
    if (/[.,;:!?]$/.test(block)) return false;
    return /^[A-Z0-9]/.test(block) && block.split(/\s+/).length <= 8;
}

function renderSummary(summary, post) {
    // A briefing that failed the quality gate is not published. It cannot be
    // salvaged by trimming either: these start with the prompt template echoed
    // back, so cutting to the first section heading would publish the prompt.
    // The deterministic analysis below still renders, and update-forks queues
    // the repo for regeneration.
    if (looksLikeReasoning(summary)) {
        const d = (post && post.description) || '';
        return (d ? `<p>${escapeHtml(d)}</p>` : '') +
            '<p class="post-pending">A written briefing for this repository is being regenerated. ' +
            'The analysis below is produced by static analysis and is unaffected.</p>';
    }
    // An article written since markdown stopped being stripped at storage carries
    // real section headings or fenced code, and is rendered as the document it is.
    if (hasStrongStructure(summary)) return renderMarkdown(summary);

    /*
     * Everything else is one of the articles flattened on the way in, and it is
     * not uniformly flat. Handing the whole text to renderMarkdown is wrong -
     * with no headings left it collapses into an undifferentiated run of
     * paragraphs - and so is treating every block as prose, because the old
     * stripMarkdown had no table rule, so pipe tables survived it intact and 34
     * articles still carry one.
     *
     * So each block is read on its own terms. The heading case is the one both
     * previous attempts missed: these articles write a short title, two trailing
     * spaces, a newline, then the body, which is markdown's hard line break and
     * plainly a heading to any reader. Block-level heading detection rejected it
     * for containing a newline, and renderMarkdown glued the title onto the
     * paragraph. Reading the first line separately recovers roughly eight
     * headings per article where the old path found one.
     */
    const blocks = String(summary || '').split('\n\n').map(b => b.trim()).filter(Boolean);
    return blocks.map(b => {
        // A table, list or fence inside an otherwise flat article: render it.
        if (hasMarkdown(b)) return renderMarkdown(b);

        const nl = b.indexOf('\n');
        if (nl > -1) {
            const first = b.slice(0, nl).trim();
            const rest = b.slice(nl + 1).trim();
            if (rest && looksLikeHeading(first)) {
                return `<h3 class="post-h">${escapeHtml(first)}</h3><p>${escapeHtml(rest)}</p>`;
            }
        }
        return looksLikeHeading(b)
            ? `<h3 class="post-h">${escapeHtml(b)}</h3>`
            : `<p>${escapeHtml(b)}</p>`;
    }).join('');
}

function loadDeep(id) {
    try {
        const p = path.join('structure', id + '.deep.json');
        if (!fs.existsSync(p)) return null;
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        return (j.nodes && j.nodes.length) ? j : null;
    } catch (e) { return null; }
}

// A dependency diagram drawn from the module graph build-analyze already produces.
// Capped hard: these graphs reach 1459 modules and 5943 edges, and Mermaid becomes
// unreadable (and slow) long before that, so we take the most-depended-on modules.
function moduleDiagram(deep) {
    const nodes = (deep.nodes || []).filter(n => n.kind === 'module');
    if (nodes.length < 3) return '';
    const top = nodes.slice().sort((a, b) => (b.ca || 0) - (a.ca || 0)).slice(0, 10);
    const keep = new Map(top.map((n, i) => [n.full || n.id, mermaidId(n.id, i)]));
    const edges = (deep.links || [])
        .filter(l => keep.has(l.s) && keep.has(l.t) && l.s !== l.t)
        .slice(0, 18);
    if (!edges.length) return '';

    const lines = ['graph LR'];
    for (const n of top) {
        const id = keep.get(n.full || n.id);
        const label = String(n.name || n.id).slice(0, 24).replace(/"/g, "'");
        lines.push(`  ${id}["${label}"]`);
    }
    for (const e of edges) lines.push(`  ${keep.get(e.s)} --> ${keep.get(e.t)}`);
    const cyc = top.filter(n => n.cycle).map(n => keep.get(n.full || n.id));
    if (cyc.length) lines.push(`  classDef cyc stroke:#ef4444,stroke-width:2px;`,
        `  class ${cyc.join(',')} cyc;`);
    return lines.join('\n');
}

// Companion to moduleDiagram: that one shows hotspots, this one shows shape.
// Modules are grouped by their top-level directory and edges are aggregated, so a
// 1459-module repo collapses to the handful of layers a reader can actually hold.
function architectureDiagram(deep) {
    const nodes = (deep.nodes || []).filter(n => n.kind === 'module');
    if (nodes.length < 6) return '';
    const groupOf = n => {
        const parts = String(n.full || n.id).split('/');
        return parts.length > 1 ? parts[0] : '(root)';
    };
    const byId = new Map(nodes.map(n => [n.full || n.id, groupOf(n)]));
    const size = {};
    for (const g of byId.values()) size[g] = (size[g] || 0) + 1;

    // Two groups renders as "(root) 1 module -> src 49 modules", which is a picture of
    // nothing. Require a genuinely multi-area layout, and ignore areas of one module.
    const groups = Object.entries(size)
        .filter(([, n]) => n > 1)
        .sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (groups.length < 3) return '';
    const keep = new Map(groups.map(([g], i) => [g, 'g' + i]));

    const pair = {};
    for (const l of (deep.links || [])) {
        const a = byId.get(l.s), b = byId.get(l.t);
        if (!a || !b || a === b || !keep.has(a) || !keep.has(b)) continue;
        const k = a + '\u0000' + b;
        pair[k] = (pair[k] || 0) + 1;
    }
    const edges = Object.entries(pair).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (!edges.length) return '';

    const lines = ['graph TD'];
    for (const [g, n] of groups) {
        lines.push(`  ${keep.get(g)}["${String(g).slice(0, 22).replace(/"/g, "'")}<br/>${n} modules"]`);
    }
    for (const [k, n] of edges) {
        const [a, b] = k.split('\u0000');
        lines.push(`  ${keep.get(a)} -->|${n}| ${keep.get(b)}`);
    }
    return lines.join('\n');
}

// Dependency data from build-deps.js. Absent until that has run for a repo, so
// every use is guarded rather than assumed.
let DEPS = null, REGISTRY = null;
function loadDeps() {
    if (DEPS !== null) return;
    try { DEPS = JSON.parse(fs.readFileSync(path.join('data', 'deps.json'), 'utf8')); }
    catch (e) { DEPS = { repos: {} }; }
    try { REGISTRY = JSON.parse(fs.readFileSync(path.join('data', 'registry.json'), 'utf8')); }
    catch (e) { REGISTRY = {}; }
}

const majorOf = v => {
    const m = String(v || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
};

// "Stale" here means the declared major is behind the published major, which is
// the claim the data actually supports. Not a vulnerability check.
function dependencyReport(repoId) {
    loadDeps();
    const entry = DEPS.repos[repoId];
    if (!entry) return null;
    const rows = [];
    for (const [eco, pkgs] of Object.entries(entry)) {
        for (const p of pkgs) {
            const name = Array.isArray(p) ? p[0] : p;
            const spec = Array.isArray(p) ? (p[1] || null) : null;
            const reg = REGISTRY[eco + ':' + name];
            const declared = majorOf(spec);
            const latest = reg ? majorOf(reg.v) : null;
            const behind = (declared !== null && latest !== null) ? latest - declared : null;
            rows.push({ eco, name, spec, latest: reg ? reg.v : null, released: reg ? reg.t : null, behind });
        }
    }
    if (!rows.length) return null;
    const stale = rows.filter(r => r.behind !== null && r.behind > 0)
        .sort((a, b) => b.behind - a.behind);
    const resolved = rows.filter(r => r.latest).length;
    return { total: rows.length, resolved, stale, rows };
}

function readinessOf(kg) {
    const h = (kg && kg.codeHealth) || {};
    const checks = [
        ['Container image', !!(kg && kg.hasDocker)],
        ['CI pipeline', !!(kg && kg.hasCI)],
        ['Lockfile committed', !!h.hasLockfile],
        ['Test suite', h.hasTests !== false],
        ['README', !!h.hasReadme],
        ['License', !!h.hasLicense],
        ['No committed secrets', !(h.committedSecrets > 0)]
    ];
    return { checks, score: checks.filter(c => c[1]).length, of: checks.length };
}

// Everything below is already on the post object or on disk. The article previously
// rendered only `summary` and threw all of it away, which left the prose unlinked to
// the analysis that produced it.
function renderAnalysis(post) {
    const kg = post.knowledgeGraph;
    if (!kg) return '';
    const deep = loadDeep(post.id);
    const diagram = deep ? moduleDiagram(deep) : '';
    const arch = deep ? architectureDiagram(deep) : '';
    const r = readinessOf(kg);
    const findings = (kg.issues || []).slice(0, 5);
    const sevClass = s => 'sev-' + String(s || 'low').toLowerCase();

    const langs = Object.entries(kg.languages || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 6);

    return `
            <section class="analysis" aria-label="Automated analysis">
                <h2 class="analysis-h">What the analyser found</h2>

                <div class="analysis-grid">
                    <div class="an-card">
                        <span class="an-lab">Deployment readiness</span>
                        <div class="an-score">${r.score}<span>/${r.of}</span></div>
                        <ul class="an-checks">
                            ${r.checks.map(([t, ok]) =>
                                `<li class="${ok ? 'ok' : 'no'}"><span aria-hidden="true">${ok ? '&#10003;' : '&#10007;'}</span>${escapeHtml(t)}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="an-card">
                        <span class="an-lab">Composition</span>
                        <div class="an-score">${(kg.totalFiles || 0).toLocaleString('en-US')}<span> files</span></div>
                        <ul class="an-bars">
                            ${langs.map(([n, c]) => `<li><span>${escapeHtml(n)}</span><i style="width:${Math.round(c / langs[0][1] * 100)}%"></i><b>${c}</b></li>`).join('')}
                        </ul>
                        ${(kg.frameworks || []).length ? `<p class="an-fw">${kg.frameworks.map(f => `<span>${escapeHtml(f)}</span>`).join('')}</p>` : ''}
                    </div>
                </div>

                ${arch ? `
                <div class="an-block">
                    <span class="an-lab">Architecture</span>
                    <p class="an-note">Top-level areas of the codebase, sized by module count. Arrows show how many imports cross from one area into another.</p>
                    <div class="mermaid">${escapeHtml(arch)}</div>
                </div>` : ''}

                ${diagram ? `
                <div class="an-block">
                    <span class="an-lab">Module dependencies</span>
                    <p class="an-note">The ${Math.min(10, ((deep.nodes || []).filter(n => n.kind === 'module')).length)} most depended-upon modules of ${(deep.totals && deep.totals.modules || 0).toLocaleString('en-US')}, from static import analysis. Red outline marks a module in an import cycle.</p>
                    <div class="mermaid">${escapeHtml(diagram)}</div>
                </div>` : ''}

                ${(() => {
                    const dep = dependencyReport(post.id);
                    if (!dep) return '';
                    const head = dep.stale.length
                        ? `<strong>${dep.stale.length}</strong> of ${dep.total} declared dependencies are a major version behind.`
                        : `${dep.total} declared dependencies, none a major version behind.`;
                    return `
                <div class="an-block">
                    <span class="an-lab">Dependencies</span>
                    <p class="an-note">${head} Resolved ${dep.resolved} of ${dep.total} against the registry.</p>
                    ${dep.stale.length ? `<table class="tbl an-deps">
                        <tr><th>Package</th><th>Declared</th><th>Latest</th><th>Behind</th></tr>
                        ${dep.stale.slice(0, 8).map(r => `<tr><td><code>${escapeHtml(r.name)}</code></td>
                            <td>${escapeHtml(r.spec || '-')}</td><td>${escapeHtml(r.latest || '-')}</td>
                            <td class="beh">${r.behind} major</td></tr>`).join('')}
                    </table>` : ''}
                </div>`;
                })()}

                ${findings.length ? `
                <div class="an-block">
                    <span class="an-lab">Findings</span>
                    <ul class="an-findings">
                        ${findings.map(f => `<li><span class="an-sev ${sevClass(f.severity)}">${escapeHtml(f.severity || '')}</span><span>${escapeHtml(f.issue || '')}${f.where ? ` <code>${escapeHtml(f.where)}</code>` : ''}</span></li>`).join('')}
                    </ul>
                </div>` : ''}

                <p class="an-links">
                    <a href="../code-brain.html?repo=${encodeURIComponent(post.id)}">Open in Code Brain &rarr;</a>
                    <a href="../knowledge-graph.html?repo=${encodeURIComponent(post.id)}">See its neighbourhood &rarr;</a>
                </p>
            </section>`;
}


module.exports = { escapeHtml, mermaidId, looksLikeHeading, renderSummary, loadDeep,
  moduleDiagram, architectureDiagram, loadDeps, dependencyReport, readinessOf, renderAnalysis };
