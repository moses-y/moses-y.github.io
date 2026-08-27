/*
 * cb-panel.js - the hover card, the info panel and its findings list.
 *
 * Split out of code-brain.js. This group turned out to be the cleanest cut in the
 * file: measured against the closure it lived in, it touched only el, esc, one
 * callback into the reader, and its own findings renderer - no graph state, no
 * mutation, nothing to thread through. Pure presentation.
 *
 * A factory rather than loose functions, so it closes over el and the reader
 * callback once and every call site reads exactly as it did before: showInfo(node)
 * stays showInfo(node).
 */
(function (global) {
    'use strict';

    /*
     * g is the assembled graph. The panel reads domainCounts out of it to say how
     * many repositories a domain holds - the one piece of graph data this file
     * needs, and the one my first dependency scan of the block missed, because
     * that scan looked for a hand-written list of names.
     */
    function create(dom, hooks, g) {
        var el = dom.el, esc = dom.esc;
        var openReader = hooks.openReader;
        /*
         * Walking to a neighbour can land on a repository the current filters
         * have hidden, and that is the interesting case rather than the edge
         * case: a third of the clusters cross a domain boundary, so a hop out of
         * the filtered domain is exactly what the block exists to offer.
         * Clicking a named repository is an explicit request to go there, so the
         * filters give way rather than the click doing nothing.
         */
        function onWalk(target) {
            if (!target || !hooks.onNodeClick) return;
            if (target._vis === false && hooks.applyFilters) {
                el.fDomain.value = '';
                el.fSize.value = '';
                hooks.applyFilters();
            }
            hooks.onNodeClick(target);
        }
        var firstSentences = dom.firstSentences;
        var domainCounts = g.domainCounts;
        // The same object the controller fills from structure/reports.json, not a
        // snapshot: that fetch lands after the panel is built.
        var reportSet = hooks.reportSet;
        // The findings list's own element. It stayed behind in the controller when
        // renderFindings moved, which is a reference the controller no longer needs
        // and this file could not reach.
        var elFindings = document.getElementById('i-findings');

        function renderFindings(node) {
            elFindings.innerHTML = '';
            if (!node.findings || !node.findings.length) return;
            var sv = (node.totals && node.totals.severity) || { high: 0, medium: 0, low: 0 };
            var html = '<div class="sev-summary">';
            if (sv.high) html += '<span class="pill h">' + sv.high + ' high</span>';
            if (sv.medium) html += '<span class="pill m">' + sv.medium + ' medium</span>';
            if (sv.low) html += '<span class="pill l">' + sv.low + ' low</span>';
            html += '</div>';
            var sevClass = { high: 'h', medium: 'm', low: 'l' };
            node.findings.slice(0, 3).forEach(function (f) {
                var c = sevClass[f.severity] || 'l';
                html += '<div class="item"><div class="ttl"><span class="dot ' + c + '"></span>' + esc(f.title) + '</div>' +
                    (f.file ? '<div class="loc">' + esc(String(f.file).split('/').slice(-2).join('/')) + '</div>' : '') + '</div>';
            });
            if (node.findings.length > 3) {
                html += '<div class="scope">' + (node.findings.length - 3) + ' more in the full report</div>';
            }
            elFindings.innerHTML = html;
        }

        function hoverCard(n) {
            var kindLabel = { root: 'Owner', domain: 'Domain', lang: 'Language', repo: 'Repository', dir: 'Folder', file: 'File', module: 'Module' }[n.kind] || 'Node';
            var rows = '';
            if (n.kind === 'repo') {
                var sub = [n.domain, n.language].filter(Boolean).join(' · ');
                if (sub) rows += '<div class="hc-sub">' + esc(sub) + '</div>';
                var meta = [];
                if (n.files) meta.push('<span>' + n.files + ' files</span>');
                if (n.repo && n.repo.stars) meta.push('<span>★ ' + n.repo.stars + '</span>');
                if (meta.length) rows += '<div class="hc-meta">' + meta.join('') + '</div>';
                var rep = (n.repo && n.repo.id != null) ? reportSet[String(n.repo.id)] : null;
                if (rep) {
                    var pills = '';
                    if (rep.high) pills += '<span class="hc-p h">' + rep.high + ' high</span>';
                    if (rep.medium) pills += '<span class="hc-p m">' + rep.medium + ' med</span>';
                    if (rep.low) pills += '<span class="hc-p l">' + rep.low + ' low</span>';
                    rows += '<div class="hc-pills">' + (pills || '<span class="hc-p l">clean</span>') + '</div>';
                    rows += '<div class="hc-cta">Click to open · full report available</div>';
                } else {
                    rows += '<div class="hc-cta">Click to grow structure</div>';
                }
            } else if (n.kind === 'module') {
                rows += '<div class="hc-sub">' + esc(n.full || '') + '</div>';
                rows += '<div class="hc-meta"><span>Ca ' + n.ca + '</span><span>Ce ' + n.ce + '</span><span>inst ' + n.inst + '</span>' + (n.cycle ? '<span style="color:#ff9d95">in cycle</span>' : '') + '</div>';
            } else if (n.kind === 'dir') {
                rows += '<div class="hc-sub">folder</div>';
            } else if (n.kind === 'file') {
                if (n.lang) rows += '<div class="hc-sub">' + esc(n.lang) + '</div>';
            } else if (n.kind === 'domain') {
                rows += '<div class="hc-sub">' + (domainCounts[n.name] || 0) + ' repositories</div>';
            }
            return '<div class="hovercard"><div class="hc-kind">' + kindLabel + '</div>' +
                '<div class="hc-name">' + esc(n.name) + '</div>' + rows + '</div>';
        }

        /*
         * The neighbourhood block, rendered by the same module Code Graph uses
         * and from the same published files. Code Brain owns depth - what is
         * inside one repository - and had no way to say what is beside it; this
         * is the one relation the hierarchy cannot express.
         *
         * No simByRepo is passed because this page draws no similarity edges. It
         * does not need one: the kin files are fetched by id, and the module
         * treats a missing local index as "nothing to fall back to".
         */
        var kinToken = 0;
        function renderKin(node) {
            if (!el.iKin || !global.KGTraverse) return;
            el.iKin.innerHTML = '';
            if (node.kind !== 'repo') return;
            var mine = ++kinToken;
            global.KGTraverse.render(el.iKin, node, {
                token: mine,
                stale: function (t) { return t !== kinToken; },
                nodeById: g.nodeById,
                onWalk: onWalk
            });
        }

        function showInfo(node) {
            el.info.classList.add('open');
            el.iMeta.innerHTML = ''; el.iLinks.innerHTML = ''; el.iDesc.textContent = '';
            renderKin(node);
            el.iDive.style.display = 'none'; el.collapseBtn.style.display = 'none';
            el.reportBtn.style.display = 'none';
            elFindings.innerHTML = '';
            var kindLabel = { root: 'Owner', domain: 'Domain', lang: 'Language', repo: 'Repository', dir: 'Folder', file: 'File', module: 'Module' }[node.kind] || 'Node';
            el.iKind.textContent = kindLabel;
            el.iName.textContent = node.name;

            if (node.kind === 'repo') {
                var f = node.repo || {};
                // The one-liner, never the full summary: the summary runs to
                // thousands of characters and pushed every control in this
                // panel below the fold.
                el.iDesc.textContent = f.description || firstSentences(f.summary, 2) || 'No description available.';
                var meta = ['<span><strong>' + node.domain + '</strong></span>', '<span><strong>' + node.language + '</strong></span>'];
                if (f.stars) meta.push('<span><strong>' + f.stars + '</strong> stars</span>');
                if (node.files) meta.push('<span><strong>' + node.files + '</strong> files</span>');
                el.iMeta.innerHTML = meta.join('');
                var lnk = '';
                if (f.url) lnk += '<a href="' + f.url + '" target="_blank" rel="noopener">GitHub ↗</a>';
                if (f.name) lnk += '<button type="button" data-read-briefing>Briefing →</button>';
                el.iLinks.innerHTML = lnk;
                var rb = el.iLinks.querySelector('[data-read-briefing]');
                if (rb) rb.addEventListener('click', function () { openReader(f, node); });
                // Reading is the primary action, so it leads the row.
                if (f.id != null && reportSet[String(f.id)]) {
                    el.reportBtn.style.display = '';
                    el.reportBtn.onclick = function () { openReader(f, node); };
                }
                el.iDive.style.display = '';
                el.iDiveLabel.textContent = 'Grow this repo\'s file & folder structure';
                el.diveBtn.textContent = node.dived ? '↴ Grown' : '↴ Grow structure';
                el.collapseBtn.style.display = node.dived ? '' : 'none';
                if (node.dived && node.findings) renderFindings(node);
            } else if (node.kind === 'domain') {
                el.iDesc.textContent = 'Repositories in the ' + node.name + ' domain. Grouped by what the code does - click through to a language, then a repo.';
                el.iMeta.innerHTML = '<span><strong>' + (domainCounts[node.name] || 0) + '</strong> repositories</span>';
            } else if (node.kind === 'lang') {
                el.iDesc.textContent = node.name + ' repositories within ' + node.domain + '.';
            } else if (node.kind === 'module') {
                el.iDesc.textContent = (node.lang || 'Code') + ' module. Fan-in (Ca) = who imports it; fan-out (Ce) = what it imports. High Ca + high instability = a change-risk hotspot.';
                el.iMeta.innerHTML = '<span><strong>' + node.ca + '</strong> imported by</span><span><strong>' + node.ce + '</strong> imports</span><span>instability <strong>' + node.inst + '</strong></span>' +
                    (node.community != null ? '<span>community <strong>' + (node.community + 1) + '</strong></span>' : '') +
                    (node.cycle ? '<span style="color:#ff9d95">in cycle</span>' : '');
            } else if (node.kind === 'file') {
                el.iDesc.textContent = node.lang ? (node.lang + ' source file.') : 'Project file.';
            } else if (node.kind === 'dir') {
                el.iDesc.textContent = 'Folder within the repository.';
            } else {
                el.iDesc.textContent = 'The root of the ecosystem - every domain connects here.';
            }
        }

        return { showInfo: showInfo, hoverCard: hoverCard, renderFindings: renderFindings };
    }

    global.CBPanel = { create: create };
})(window);
