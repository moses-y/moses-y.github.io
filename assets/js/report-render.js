/*
 * report-render.js - one renderer for the architecture report.
 *
 * The report is read in two places now: the standalone report.html page and
 * the reader overlay inside the Code Brain graph. Rendering it twice would
 * guarantee the two drift, so both call in here and differ only in chrome.
 *
 * Exposes window.ReportRender:
 *   .body(deep, meta)     the report sections as an HTML string
 *   .index(reports)       the all-reports grid
 *   .bindMore(root)       wires the "show remaining findings" toggle
 *   .esc(s)
 */
(function (global) {
    'use strict';

    // Findings run to the hundreds on large repos. Showing every one by
    // default is what made the panel an endless scroll; the rest stay one
    // click away rather than being dropped.
    var VISIBLE_FINDINGS = 12;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function cap(s) { return String(s || '').replace(/_/g, ' '); }
    function num(v) { return (Number(v) || 0).toLocaleString(); }

    function tile(v, l, alert) {
        return '<div class="tile' + (alert ? ' alert' : '') + '">' +
            '<div class="v">' + num(v) + '</div><div class="l">' + esc(l) + '</div></div>';
    }

    function bar(label, n, max, cls) {
        var pct = Math.round((n / max) * 100);
        return '<div class="bar"><span class="name">' + esc(label) + '</span>' +
            '<span class="track"><span class="fill ' + cls + '" style="width:' + pct + '%"></span></span>' +
            '<span class="n">' + n + '</span></div>';
    }

    function finding(x) {
        var sev = x.severity || 'low';
        return '<div class="finding ' + esc(sev) + '"><div class="head">' +
            '<span class="ttl">' + esc(x.title) + '</span>' +
            '<span class="chip">' + esc(cap(x.category)) + '</span>' +
            (x.rank != null ? '<span class="rankchip">rank ' + x.rank + '</span>' : '') +
            '</div>' +
            (x.file ? '<div class="loc">' + esc(x.file) + '</div>' : '') +
            (x.evidence ? '<div class="ev">' + esc(x.evidence) + '</div>' : '') +
            (x.recommendation ? '<div class="rec"><b>Fix:</b> ' + esc(x.recommendation) + '</div>' : '') +
            '</div>';
    }

    function summarise(d, name) {
        var t = d.totals || {};
        var sev = t.severity || {};
        var parts = [name + ' resolves to ' + (t.modules || 0) + ' internal modules across ' +
            (t.edges != null ? t.edges : 0) + ' import edges'];
        if (t.cycles) parts.push(t.cycles + ' of them sit inside circular dependencies');
        var pri = (sev.high || 0) ? (sev.high + ' high-severity')
            : ((sev.medium || 0) ? (sev.medium + ' medium-severity') : 'no high-severity');
        parts.push(pri + ' findings surfaced from a deterministic pass');
        return parts.join('; ') + '.';
    }

    // opts.heading  include the h1 + lede masthead (the overlay draws its own)
    // opts.repoLink an href for "explore in the graph", omitted inside the graph
    // The code-health audit, rendered straight from data/hygiene.json. It is
    // deterministic and already ranked, so it is published as-is rather than
    // paraphrased by a model, and it appears the moment a repo is audited.
    function auditSection(h) {
        if (!h || !h.findings || !h.findings.length) return '';
        var sev = (h.totals && h.totals.severity) || {};
        var out = '<div class="sec"><span class="no">04</span> What would stop me shipping this ' +
            '<span class="qual">ranked severity &times; confidence &times; production reach</span></div>';
        out += '<div class="bars">';
        ['critical', 'high', 'medium', 'low'].forEach(function (k) {
            if (!sev[k]) return;
            var max = Math.max(1, sev.critical || 0, sev.high || 0, sev.medium || 0, sev.low || 0);
            out += bar(k, sev[k], max, k === 'critical' ? 'high' : k);
        });
        out += '</div>';
        out += h.findings.map(function (f) {
            var cls = f.severity === 'critical' ? 'high' : f.severity;
            return '<div class="finding ' + esc(cls) + '"><div class="head">' +
                '<span class="ttl">' + esc(f.title) + '</span>' +
                '<span class="chip">' + esc(f.severity) + '</span>' +
                (f.n > 1 ? '<span class="rankchip">' + f.n + ' occurrences</span>' : '') +
                '</div>' +
                (f.where ? '<div class="loc">' + esc(f.where) + '</div>' : '') +
                (f.evidence ? '<div class="ev">' + esc(f.evidence) + '</div>' : '') +
                (f.why ? '<div class="ev">' + esc(f.why) + '</div>' : '') +
                (f.fix ? '<div class="rec"><b>Fix:</b> ' + esc(f.fix) + '</div>' : '') +
                '</div>';
        }).join('');
        if (h.truncated) {
            out += '<p class="note">The file listing for this repository was truncated, so the absence of a finding is not proof of its absence.</p>';
        }
        out += '<p class="method">Checked deterministically against the repository tree and a bounded set of its files: ' +
            'committed credentials, unpinned actions and base images, missing lockfiles and update bots, ' +
            'workflows that never run the tests or that discard failures, licensing, and notebook reproducibility. ' +
            'No language model is involved in this section.</p>';
        return out;
    }

    function body(d, meta, opts) {
        opts = opts || {};
        var name = (d && d.name) || meta.displayName || meta.name || '';
        var h = '';

        if (!d || !d.deep || !d.nodes || !d.nodes.length) {
            if (opts.heading) h += '<h1>' + esc(name) + '</h1>';
            h += '<p class="lede">' + esc(meta.description || '') + '</p>';
            // The audit does not depend on the deep analysis, so it still renders.
            if (opts.audit) h += auditSection(opts.audit);
            h += '<hr class="rule"><p class="note">No module-level analysis is available for this repository yet. ' +
                'It is either awaiting the next analysis pass or was skipped as too large for a module-level dive.' +
                (meta.url ? ' View it <a href="' + esc(meta.url) + '" target="_blank" rel="noopener">on GitHub &#8599;</a>.' : '') +
                '</p>';
            return h;
        }

        var t = d.totals || {};
        var sev = t.severity || { high: 0, medium: 0, low: 0 };
        var cats = t.categories || {};
        var scope = d.scope || {};
        var maxSev = Math.max(1, sev.high, sev.medium, sev.low);
        var catMax = Math.max.apply(null, [1].concat(Object.keys(cats).map(function (k) { return cats[k]; })));

        if (opts.heading) {
            h += '<h1>' + esc(name) + '</h1>';
            h += '<p class="lede">' + esc(summarise(d, name)) + '</p>';
            var links = [];
            if (meta.url) links.push('<a href="' + esc(meta.url) + '" target="_blank" rel="noopener">GitHub &#8599;</a>');
            if (opts.repoLink) links.push('<a href="' + esc(opts.repoLink) + '">Explore in the graph &rarr;</a>');
            if (links.length) h += '<div class="repolinks">' + links.join('') + '</div>';
            h += '<hr class="rule">';
        }

        h += '<div class="sec"><span class="no">01</span> Overview</div>';
        h += '<div class="tiles">' +
            tile(t.modules || d.nodes.length, 'modules') +
            tile(t.edges != null ? t.edges : (d.links || []).length, 'import edges') +
            tile(t.cycles || 0, 'in cycles', (t.cycles || 0) > 0) +
            tile(t.findings || (d.findings || []).length, 'findings') +
            '</div>';

        h += '<div class="bars">';
        ['high', 'medium', 'low'].forEach(function (s) { h += bar(s, sev[s] || 0, maxSev, s); });
        h += '</div>';

        if (Object.keys(cats).length) {
            h += '<div class="sec" style="margin-top:26px"><span class="no">&middot;</span> By category</div><div class="bars">';
            Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).forEach(function (k) {
                h += bar(cap(k), cats[k], catMax, 'cat');
            });
            h += '</div>';
        }

        var hubs = d.nodes.slice().filter(function (n) { return n.kind === 'module'; })
            .sort(function (a, b) { return (b.ca + b.ce) - (a.ca + a.ce); }).slice(0, 14);
        if (hubs.length) {
            h += '<div class="sec"><span class="no">02</span> Structure &amp; coupling</div>';
            h += '<p class="note">Modules many others depend on should stay stable. High fan-in with high instability means a change here ripples widest.</p>';
            h += '<div class="tablewrap"><table class="coupling"><thead><tr><th>Module</th>' +
                '<th style="text-align:right">Ca (in)</th><th style="text-align:right">Ce (out)</th>' +
                '<th style="text-align:right">Instability</th><th></th></tr></thead><tbody>';
            hubs.forEach(function (n) {
                h += '<tr><td class="mod">' + esc(n.full || n.name) + '</td>' +
                    '<td class="num">' + (n.ca || 0) + '</td><td class="num">' + (n.ce || 0) + '</td>' +
                    '<td class="num">' + (n.inst != null ? n.inst : '-') + '</td>' +
                    '<td>' + (n.cycle ? '<span class="cyc">in cycle</span>' : '') + '</td></tr>';
            });
            h += '</tbody></table></div>';
        }

        var f = (d.findings || []).slice();
        h += '<div class="sec"><span class="no">03</span> Findings ' +
            '<span class="qual">ranked severity &times; leverage &times; removability</span></div>';
        if (!f.length) {
            h += '<p class="note">No issues surfaced by the deterministic checks. Clean on the measured axes: coupling, cycles, size, nesting, error and resource handling, duplication.</p>';
        } else {
            var shown = 0, hidden = '';
            ['high', 'medium', 'low'].forEach(function (s) {
                var group = f.filter(function (x) { return x.severity === s; });
                if (!group.length) return;
                var head = '<div class="group-h">' + s + ' &middot; ' + group.length + '</div>';
                var open = [], rest = [];
                group.forEach(function (x) {
                    if (shown < VISIBLE_FINDINGS) { open.push(finding(x)); shown++; }
                    else rest.push(finding(x));
                });
                if (open.length) h += head + open.join('');
                if (rest.length) hidden += (open.length ? '' : head) + rest.join('');
            });
            if (hidden) {
                var n = f.length - shown;
                h += '<div class="more-findings" hidden data-more>' + hidden + '</div>' +
                    '<button type="button" class="more-btn" data-more-btn>Show ' + n + ' more finding' + (n === 1 ? '' : 's') + '</button>';
            }
        }

        if (opts.audit) h += auditSection(opts.audit);

        h += '<hr class="rule">';
        h += '<div class="sec"><span class="no">&middot;</span> Method &amp; scope</div>';
        h += '<p class="method">Deterministic static analysis, no LLM. The import graph is resolved from source ' +
            '(Python, JS and TS) with Tarjan cycle detection; findings come from measured facts only: module coupling, ' +
            'cycle membership, file size, nesting depth, branch density, broad error handling, unmanaged resources, ' +
            'cross-file duplication. Categories: clarity, efficiency, cognitive load, resilience, soundness, resource safety. ' +
            'Scope: analyzed ' + (scope.analyzed || scope.files || '?') + ' of ' +
            (scope.discovered || scope.analyzed || '?') + ' code files' +
            (scope.languages ? ' &middot; ' + Object.keys(scope.languages).join(', ') : '') + '.</p>';

        return h;
    }

    function bindMore(root) {
        var btn = root.querySelector('[data-more-btn]');
        var box = root.querySelector('[data-more]');
        if (!btn || !box) return;
        btn.addEventListener('click', function () {
            box.hidden = false;
            btn.remove();
        });
    }

    function index(reports) {
        if (!reports || !reports.length) {
            return '<h1>Architecture Reports</h1><p class="note">No reports have been generated yet. ' +
                'Explore the <a href="code-brain.html">Code Brain graph</a>.</p>';
        }
        var totF = reports.reduce(function (s, r) { return s + (r.findings || 0); }, 0);
        var totM = reports.reduce(function (s, r) { return s + (r.modules || 0); }, 0);
        var cards = reports.map(function (r) {
            var pills = '';
            if (r.high) pills += '<span class="rp high">' + r.high + ' high</span>';
            if (r.medium) pills += '<span class="rp medium">' + r.medium + ' med</span>';
            if (r.low) pills += '<span class="rp low">' + r.low + ' low</span>';
            return '<a class="rcard" href="report.html?repo=' + encodeURIComponent(r.id) + '">' +
                '<div class="rname">' + esc(r.name) + '</div>' +
                '<div class="rmeta">' + (r.modules || 0) + ' modules &middot; ' + (r.cycles || 0) + ' in cycles</div>' +
                '<div class="rpills">' + (pills || '<span class="rp low">clean</span>') + '</div></a>';
        }).join('');
        return '<h1>Architecture Reports</h1>' +
            '<p class="lede">Deterministic static analysis across ' + reports.length + ' analyzed repositories: ' +
            totM.toLocaleString() + ' modules mapped, ' + totF.toLocaleString() + ' findings surfaced. Ranked by findings.</p>' +
            '<hr class="rule"><div class="rgrid">' + cards + '</div>';
    }

    global.ReportRender = { body: body, index: index, bindMore: bindMore, esc: esc, summarise: summarise };
})(window);
