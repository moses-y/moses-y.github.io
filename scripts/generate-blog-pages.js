const fs = require('fs');
const path = require('path');
const { looksLikeReasoning } = require('./lib-quality.js');

// Directory for blog posts
const BLOG_DIR = 'blog';

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
    const blocks = String(summary || '').split('\n\n').map(b => b.trim()).filter(Boolean);
    return blocks.map(b => looksLikeHeading(b)
        ? `<h3 class="post-h">${escapeHtml(b)}</h3>`
        : `<p>${escapeHtml(b)}</p>`).join('');
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

// Blog post HTML template
function generateBlogPostHTML(post) {
    const formattedDate = post.updatedAt || post.forkedAt || 'Unknown date';
    const parentInfo = post.parent
        ? `<p class="post-parent">Forked from <a href="${escapeHtml(post.parent.url)}" target="_blank" rel="noopener">${escapeHtml(post.parent.name)}</a></p>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(post.displayName)} - Moses Yebei</title>
    <meta name="description" content="${escapeHtml((post.description || '').slice(0, 160))}">

    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(post.displayName)} - Moses Yebei">
    <meta property="og:description" content="${escapeHtml((post.description || '').slice(0, 160))}">
    <meta property="og:image" content="${escapeHtml(post.image)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://moses-y.github.io/blog/${post.name}.html">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(post.displayName)}">
    <meta name="twitter:description" content="${escapeHtml((post.description || '').slice(0, 160))}">
    <meta name="twitter:image" content="${escapeHtml(post.image)}">

    <link rel="canonical" href="https://moses-y.github.io/blog/${post.name}.html">

    <!-- Mermaid.js for diagrams -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

    <style>
        :root {
            --bg-primary: #030303;
            --bg-secondary: #0a0a0a;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-tertiary: #64748b;
            --border: rgba(255, 255, 255, 0.08);
            --accent: #6366f1;
            --gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
        }

        [data-theme="light"] {
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --text-primary: #0f172a;
            --text-secondary: #64748b;
            --text-tertiary: #94a3b8;
            --border: rgba(0, 0, 0, 0.08);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.7;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 24px;
        }

        /* Header */
        header {
            padding: 20px 0;
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            background: var(--bg-primary);
            z-index: 100;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .back-link {
            color: var(--text-secondary);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.875rem;
            transition: color 0.2s;
        }

        .back-link:hover {
            color: var(--accent);
        }

        .theme-toggle {
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s;
        }

        .theme-toggle:hover {
            color: var(--text-primary);
            border-color: var(--accent);
        }

        .theme-toggle .sun { display: none; }
        .theme-toggle .moon { display: block; }
        [data-theme="light"] .theme-toggle .sun { display: block; }
        [data-theme="light"] .theme-toggle .moon { display: none; }

        /* Article */
        article {
            padding: 60px 0;
        }

        .post-header {
            margin-bottom: 48px;
        }

        /* Read-aloud controls - hidden until JS confirms speechSynthesis exists. */
        .listen-bar { display: flex; align-items: center; gap: 10px; margin: 22px 0 4px; }
        .listen-btn, .listen-stop {
            display: inline-flex; align-items: center; gap: 8px;
            background: var(--bg-card, rgba(255,255,255,0.05));
            border: 1px solid var(--border, rgba(255,255,255,0.12));
            color: var(--text-primary, #fff); font-family: inherit; font-size: 0.85rem;
            padding: 8px 16px; border-radius: 999px; cursor: pointer; transition: .2s;
        }
        .listen-btn:hover, .listen-stop:hover { border-color: var(--accent, #4f7cff); color: var(--accent, #4f7cff); }
        .listen-stop { padding: 8px 12px; }
        .listen-icon { font-size: 0.7rem; }
        .listen-progress { font-size: 0.75rem; color: var(--text-secondary, #9aa4bf); font-variant-numeric: tabular-nums; }
        .post-content p.speaking { background: color-mix(in srgb, var(--accent, #4f7cff) 12%, transparent); border-radius: 4px; }

        /* Automated-analysis section: rendered from knowledgeGraph + structure/<id>.deep.json */
        .analysis { margin: 56px 0 0; padding-top: 32px; border-top: 1px solid var(--border); }
        .analysis-h { font-size: 1.4rem; margin-bottom: 20px; }
        .analysis-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
        .an-card, .an-block { border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; background: var(--bg-secondary); }
        .an-block { margin-top: 16px; }
        .an-lab { display: block; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-tertiary); }
        .an-score { font-size: 1.8rem; font-weight: 600; margin: 6px 0 10px; }
        .an-score span { font-size: 0.95rem; font-weight: 400; color: var(--text-secondary); }
        .an-checks, .an-bars, .an-findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .an-checks li { font-size: 0.87rem; display: flex; gap: 8px; align-items: center; }
        .an-checks li.ok span { color: #3fa46a; }
        .an-checks li.no span { color: #d1616a; }
        .an-bars li { display: grid; grid-template-columns: 96px 1fr 34px; gap: 8px; align-items: center; font-size: 0.82rem; }
        .an-bars i { display: block; height: 6px; border-radius: 3px; background: var(--accent); opacity: 0.75; }
        .an-bars b { font-weight: 500; color: var(--text-secondary); text-align: right; font-variant-numeric: tabular-nums; }
        .an-fw { margin: 12px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
        .an-fw span { font-size: 0.72rem; border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px; color: var(--text-secondary); }
        .an-note { font-size: 0.84rem; color: var(--text-secondary); margin: 6px 0 12px; }
        .an-findings li { display: flex; gap: 9px; align-items: flex-start; font-size: 0.87rem; padding: 5px 0; border-bottom: 1px solid var(--border); }
        .an-findings li:last-child { border-bottom: 0; }
        .an-findings code { font-size: 0.78rem; color: var(--text-tertiary); }
        .an-sev { flex: none; font-size: 0.62rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; color: #fff; margin-top: 2px; }
        .an-sev.sev-high { background: #a3323a; }
        .an-sev.sev-medium { background: #8a6520; }
        .an-sev.sev-low { background: #4a6b52; }
        .an-deps { width: 100%; margin-top: 8px; }
        .an-deps th { text-align: left; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase;
            color: var(--text-tertiary); font-weight: 500; padding: 4px 6px; border-bottom: 1px solid var(--border); }
        .an-deps td { font-size: 0.82rem; }
        .an-deps .beh { color: #d1616a; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .an-links { display: flex; flex-wrap: wrap; gap: 18px; margin: 18px 0 0; font-size: 0.88rem; }
        .an-links a { color: var(--accent); text-decoration: none; }
        .an-links a:hover { text-decoration: underline; }

        .post-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 16px;
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        .post-meta span {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .post-language {
            background: var(--accent);
            color: white;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
        }

        .post-type {
            background: rgba(99, 102, 241, 0.1);
            color: var(--accent);
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: capitalize;
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            line-height: 1.2;
            margin-bottom: 16px;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .post-description {
            font-size: 1.25rem;
            color: var(--text-secondary);
            margin-bottom: 16px;
        }

        .post-parent {
            font-size: 0.875rem;
            color: var(--text-tertiary);
        }

        .post-parent a {
            color: var(--accent);
            text-decoration: none;
        }

        .post-parent a:hover {
            text-decoration: underline;
        }

        .post-image {
            width: 100%;
            border-radius: 16px;
            margin-bottom: 48px;
            aspect-ratio: 16/9;
            object-fit: cover;
        }

        .post-content {
            font-size: 1.125rem;
        }

        .post-content p {
            margin-bottom: 24px;
        }

        .post-content .post-h {
            font-family: var(--font-display, Georgia, serif);
            font-size: 1.3rem;
            font-weight: 600;
            color: var(--text-primary, #F3EBE2);
            margin: 40px 0 14px;
            text-wrap: balance;
        }
        .post-content .post-h:first-child { margin-top: 0; }

        .post-content .post-pending {
            font-size: 0.92rem;
            color: var(--text-tertiary, #6B5D51);
            border-left: 2px solid var(--border, rgba(255,240,228,0.14));
            padding-left: 14px;
        }

        .post-topics {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 48px;
            padding-top: 24px;
            border-top: 1px solid var(--border);
        }

        .topic-tag {
            background: rgba(99, 102, 241, 0.1);
            color: var(--accent);
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 0.875rem;
        }

        /* Actions */
        .post-actions {
            display: flex;
            gap: 16px;
            margin-top: 48px;
        }

        .post-actions a {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.2s;
        }

        .primary-btn {
            background: var(--gradient);
            color: white;
        }

        .primary-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
        }

        .secondary-btn {
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .secondary-btn:hover {
            border-color: var(--accent);
        }

        /* Footer */
        footer {
            padding: 40px 0;
            border-top: 1px solid var(--border);
            text-align: center;
            color: var(--text-tertiary);
            font-size: 0.875rem;
        }

        footer a {
            color: var(--accent);
            text-decoration: none;
        }

        /* Mermaid diagram styling */
        .mermaid {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin: 24px 0;
            overflow-x: auto;
        }

        .mermaid svg {
            max-width: 100%;
            height: auto;
        }

        /* Code blocks styling (GitNexus-inspired) */
        .post-content pre {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            overflow-x: auto;
            margin: 24px 0;
            font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
            font-size: 0.875rem;
            line-height: 1.6;
        }

        .post-content code {
            background: rgba(99, 102, 241, 0.1);
            color: #e6b450;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
            font-size: 0.875em;
        }

        .post-content pre code {
            background: none;
            color: inherit;
            padding: 0;
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--text-tertiary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent);
        }

        @media (max-width: 768px) {
            h1 { font-size: 1.75rem; }
            .post-description { font-size: 1rem; }
            .post-content { font-size: 1rem; }
            .post-actions { flex-direction: column; }
            .post-actions a { justify-content: center; }
        }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="../index.html" class="back-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Portfolio
                </a>
                <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
                    <svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                    <svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <main>
        <article class="container">
            <div class="post-header">
                <div class="post-meta">
                    <span>${formattedDate}</span>
                    <span>${post.readTime || 3} min read</span>
                    ${post.language ? `<span class="post-language">${post.language}</span>` : ''}
                    <span class="post-type">${post.type || 'fork'}</span>
                </div>
                <h1>${escapeHtml(post.displayName)}</h1>
                <p class="post-description">${escapeHtml(post.description || '')}</p>
                ${parentInfo}
            </div>

            <img class="post-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.displayName)}" loading="lazy">

            <div class="listen-bar" id="listen-bar" hidden>
                <button class="listen-btn" id="listen-btn" aria-label="Listen to this briefing">
                    <span class="listen-icon" aria-hidden="true">&#9654;</span>
                    <span id="listen-label">Listen</span>
                </button>
                <button class="listen-stop" id="listen-stop" hidden aria-label="Stop">&#9632;</button>
                <span class="listen-progress" id="listen-progress" aria-live="polite"></span>
            </div>

            <div class="post-content" id="post-content">
                ${renderSummary(post.summary, post)}
            </div>

            ${renderAnalysis(post)}

            ${post.topics && post.topics.length > 0 ? `
            <div class="post-topics">
                ${post.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
            ` : ''}

            <div class="post-actions">
                <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener" class="primary-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                    </svg>
                    View on GitHub
                </a>
                <a href="../index.html#projects" class="secondary-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    All Projects
                </a>
            </div>
        </article>
    </main>

    <footer>
        <div class="container">
            <p>&copy; ${new Date().getFullYear()} Moses Yebei. Built with automation and coffee.</p>
            <p style="margin-top: 8px;"><a href="../index.html">moses-y.github.io</a></p>
        </div>
    </footer>

    <script>
        // Read aloud via the browser's own voices. No API, no key, no audio files -
        // which matters because pre-rendering audio for every repo would blow past
        // the GitHub Pages size limit.
        (function () {
            // Feature-detect both halves: some embedded browsers expose speechSynthesis
            // without a usable SpeechSynthesisUtterance constructor.
            if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
            var bar = document.getElementById('listen-bar');
            var btn = document.getElementById('listen-btn');
            var stopBtn = document.getElementById('listen-stop');
            var label = document.getElementById('listen-label');
            var icon = btn.querySelector('.listen-icon');
            var progress = document.getElementById('listen-progress');
            var paras = [].slice.call(document.querySelectorAll('#post-content p'))
                .filter(function (p) { return p.textContent.trim().length; });
            if (!paras.length) return;
            bar.hidden = false;

            var idx = 0, playing = false;

            // One utterance per paragraph rather than one for the whole article:
            // long utterances get silently truncated in some engines, and this also
            // gives a natural progress readout and highlight.
            function speak(i) {
                if (i >= paras.length) { reset(); return; }
                idx = i;
                paras.forEach(function (p) { p.classList.remove('speaking'); });
                paras[i].classList.add('speaking');
                progress.textContent = (i + 1) + ' / ' + paras.length;
                var u = new SpeechSynthesisUtterance(paras[i].textContent);
                u.rate = 1.0;
                u.onend = function () { if (playing) speak(i + 1); };
                u.onerror = function () { reset(); };
                window.speechSynthesis.speak(u);
            }

            function reset() {
                playing = false;
                window.speechSynthesis.cancel();
                paras.forEach(function (p) { p.classList.remove('speaking'); });
                label.textContent = 'Listen';
                icon.innerHTML = '&#9654;';
                stopBtn.hidden = true;
                progress.textContent = '';
                idx = 0;
            }

            btn.addEventListener('click', function () {
                if (!playing) {
                    playing = true;
                    label.textContent = 'Pause';
                    icon.innerHTML = '&#10073;&#10073;';
                    stopBtn.hidden = false;
                    // Resume mid-paragraph if paused, otherwise start from where we were.
                    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
                    else speak(idx);
                } else {
                    playing = false;
                    window.speechSynthesis.pause();
                    label.textContent = 'Resume';
                    icon.innerHTML = '&#9654;';
                }
            });

            stopBtn.addEventListener('click', reset);
            // Speech keeps running after navigation otherwise.
            window.addEventListener('beforeunload', function () { window.speechSynthesis.cancel(); });
        })();

        // Theme toggle
        const toggle = document.getElementById('theme-toggle');
        const stored = localStorage.getItem('theme');
        if (stored) {
            document.documentElement.setAttribute('data-theme', stored);
        } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.setAttribute('data-theme', 'light');
        }
        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            // Re-initialize mermaid with new theme
            initMermaid();
        });

        // Initialize Mermaid
        function initMermaid() {
            // The library is a third-party CDN script. When jsDelivr is slow or blocked
            // this ran unguarded and threw "mermaid is not defined", aborting the rest
            // of the handler (and the theme toggle that calls it).
            if (typeof mermaid === 'undefined') return;
            if (!document.querySelector('.mermaid')) return;
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            mermaid.initialize({
                startOnLoad: false,
                theme: isDark ? 'dark' : 'default',
                themeVariables: isDark ? {
                    primaryColor: '#6366f1',
                    primaryTextColor: '#f8fafc',
                    primaryBorderColor: '#8b5cf6',
                    lineColor: '#64748b',
                    secondaryColor: '#1e1e2e',
                    tertiaryColor: '#0a0a0a'
                } : {
                    primaryColor: '#6366f1',
                    primaryTextColor: '#0f172a',
                    primaryBorderColor: '#8b5cf6',
                    lineColor: '#64748b'
                }
            });
            mermaid.run();
        }

        // Run on load
        document.addEventListener('DOMContentLoaded', initMermaid);
    </script>
</body>
</html>`;
}

async function main() {
    console.log('=== Blog Page Generator ===\n');

    // Check if forks.json exists
    if (!fs.existsSync('forks.json')) {
        console.error('Error: forks.json not found. Run update-forks.js first.');
        process.exit(1);
    }

    // Read forks.json
    const data = JSON.parse(fs.readFileSync('forks.json', 'utf8'));
    const allForks = data.forks || [];
    const posts = allForks.filter(f => f.summary);
    const awaiting = allForks.length - posts.length;
    if (awaiting > 0) {
        console.log(`Skipping ${awaiting} repos still awaiting article generation.`);
    }

    if (posts.length === 0) {
        console.log('No posts to generate.');
        return;
    }

    console.log(`Found ${posts.length} posts to generate.\n`);

    // Create blog directory if it doesn't exist
    if (!fs.existsSync(BLOG_DIR)) {
        fs.mkdirSync(BLOG_DIR, { recursive: true });
        console.log(`Created ${BLOG_DIR}/ directory`);
    }

    // Generate individual blog pages
    let generated = 0;
    for (const post of posts) {
        const filename = `${post.name}.html`;
        const filepath = path.join(BLOG_DIR, filename);
        const html = generateBlogPostHTML(post);

        fs.writeFileSync(filepath, html);
        console.log(`Generated: ${filepath}`);
        generated++;
    }

    // Generate blog index page
    const indexHtml = generateBlogIndexHTML(posts, data.lastUpdated);
    fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexHtml);
    console.log(`Generated: ${BLOG_DIR}/index.html`);

    console.log(`\n=== Complete ===`);
    console.log(`Generated ${generated} blog posts + index page`);
}

function generateBlogIndexHTML(posts, lastUpdated) {
    const postCards = posts.map(post => `
        <a href="${escapeHtml(post.name)}.html" class="post-card">
            <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.displayName)}" loading="lazy">
            <div class="post-card-content">
                <div class="post-card-meta">
                    <span>${escapeHtml(post.updatedAt || '')}</span>
                    ${post.language ? `<span class="lang">${escapeHtml(post.language)}</span>` : ''}
                </div>
                <h3>${escapeHtml(post.displayName)}</h3>
                <p>${escapeHtml((post.description || '').slice(0, 120))}${(post.description || '').length > 120 ? '...' : ''}</p>
            </div>
        </a>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog - Moses Yebei</title>
    <meta name="description" content="Technical articles and project deep-dives by Moses Yebei">

    <style>
        :root {
            --bg-primary: #030303;
            --bg-secondary: #0a0a0a;
            --bg-card: rgba(255, 255, 255, 0.02);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-tertiary: #64748b;
            --border: rgba(255, 255, 255, 0.08);
            --accent: #6366f1;
            --gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
        }

        [data-theme="light"] {
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-card: rgba(0, 0, 0, 0.02);
            --text-primary: #0f172a;
            --text-secondary: #64748b;
            --text-tertiary: #94a3b8;
            --border: rgba(0, 0, 0, 0.08);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 24px;
        }

        header {
            padding: 20px 0;
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            background: var(--bg-primary);
            z-index: 100;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .back-link {
            color: var(--text-secondary);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: color 0.2s;
        }

        .back-link:hover { color: var(--accent); }

        .theme-toggle {
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px;
            color: var(--text-secondary);
            cursor: pointer;
        }

        .theme-toggle .sun { display: none; }
        .theme-toggle .moon { display: block; }
        [data-theme="light"] .theme-toggle .sun { display: block; }
        [data-theme="light"] .theme-toggle .moon { display: none; }

        .page-header {
            padding: 60px 0;
            text-align: center;
        }

        h1 {
            font-size: 3rem;
            font-weight: 700;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 16px;
        }

        .page-header p {
            color: var(--text-secondary);
            font-size: 1.125rem;
        }

        .posts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 24px;
            padding-bottom: 80px;
        }

        .post-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            text-decoration: none;
            color: inherit;
            transition: all 0.3s;
        }

        .post-card:hover {
            transform: translateY(-4px);
            border-color: var(--accent);
        }

        .post-card img {
            width: 100%;
            aspect-ratio: 16/9;
            object-fit: cover;
        }

        .post-card-content {
            padding: 20px;
        }

        .post-card-meta {
            display: flex;
            gap: 12px;
            font-size: 0.75rem;
            color: var(--text-tertiary);
            margin-bottom: 12px;
        }

        .post-card-meta .lang {
            background: var(--accent);
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
        }

        .post-card h3 {
            font-size: 1.125rem;
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .post-card p {
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        footer {
            padding: 40px 0;
            border-top: 1px solid var(--border);
            text-align: center;
            color: var(--text-tertiary);
        }

        footer a { color: var(--accent); text-decoration: none; }

        @media (max-width: 768px) {
            h1 { font-size: 2rem; }
            .posts-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="../index.html" class="back-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Portfolio
                </a>
                <button class="theme-toggle" id="theme-toggle">
                    <svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                    <svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <main class="container">
        <div class="page-header">
            <h1>Blog</h1>
            <p>Technical deep-dives and project explorations</p>
            <p style="font-size: 0.875rem; margin-top: 8px; color: var(--text-tertiary);">Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'Unknown'}</p>
        </div>

        <div class="posts-grid">
            ${postCards}
        </div>
    </main>

    <footer>
        <div class="container">
            <p>&copy; ${new Date().getFullYear()} Moses Yebei</p>
            <p style="margin-top: 8px;"><a href="../index.html">moses-y.github.io</a></p>
        </div>
    </footer>

    <script>
        const toggle = document.getElementById('theme-toggle');
        const stored = localStorage.getItem('theme');
        if (stored) document.documentElement.setAttribute('data-theme', stored);
        else if (window.matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.setAttribute('data-theme', 'light');
        toggle.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    </script>
</body>
</html>`;
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
