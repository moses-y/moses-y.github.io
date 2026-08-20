/*
 * cb-data.js - the graph the Code Brain draws, its side rail and its legend.
 *
 * assembleGraph is pure: forks in, nodes and links and adjacency out.
 *
 * renderDeck and buildLegend were inline in build() and closed over the assembled
 * graph plus one callback each. They take those explicitly now, which is the only
 * contract that changed. colorByCommunity already took its inputs as arguments and
 * moved untouched.
 */
(function (global) {
    'use strict';
    var el = null, esc = null, langColor = null, domainColor = null;
    var domainOf = null, primaryLanguage = null, idOf = null;

    // Bound once at startup so the moved code reads exactly as it did inside the
    // closure, rather than threading four helpers through every call.
    function useDom(dom) {
        el = dom.el; esc = dom.esc;
        langColor = dom.langColor; domainColor = dom.domainColor;
        domainOf = dom.domainOf; primaryLanguage = dom.primaryLanguage;
        idOf = dom.idOf;
    }

    function assembleGraph(data) {
        var forks = (data.forks || []).slice();

        var nodes = [], links = [];
        var adjacency = {}, nodeById = {};
        function addNode(n) { if (nodeById[n.id]) return; nodes.push(n); nodeById[n.id] = n; adjacency[n.id] = []; }
        function addLink(a, b) { links.push({ source: a, target: b }); (adjacency[a] = adjacency[a] || []).push(b); (adjacency[b] = adjacency[b] || []).push(a); }

        addNode({ id: '__root__', kind: 'root', name: 'Moses Yebei', val: 50, color: '#ffffff' });

        var domainIds = {}, langIds = {}, langCounts = {}, domainCounts = {}, totalFiles = 0;
        forks.forEach(function (f) {
            var lang = primaryLanguage(f);
            var domain = domainOf(lang, f.topics);
            var files = (f.knowledgeGraph && f.knowledgeGraph.totalFiles) || 0;
            totalFiles += files;
            langCounts[lang] = (langCounts[lang] || 0) + 1;
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;

            if (!domainIds[domain]) {
                var did = 'domain:' + domain;
                domainIds[domain] = did;
                addNode({ id: did, kind: 'domain', name: domain, val: 26, color: domainColor(domain) });
                addLink('__root__', did);
            }
            var lkey = domain + '|' + lang;
            if (!langIds[lkey]) {
                var lid = 'lang:' + lkey;
                langIds[lkey] = lid;
                addNode({ id: lid, kind: 'lang', name: lang, domain: domain, val: 13, color: langColor(lang) });
                addLink(domainIds[domain], lid);
            }
            var rid = 'repo:' + f.id;
            addNode({
                id: rid, kind: 'repo', name: f.displayName || f.name, language: lang, domain: domain,
                color: langColor(lang),
                files: files,
                val: Math.max(3, Math.min(18, 3 + (f.stars || 0) / 4 + files / 120)),
                repo: f, structFile: 'structure/' + f.id + '.json',
                dived: false
            });
            addLink(langIds[lkey], rid);
        });

        return {
            forks: forks, nodes: nodes, links: links, adjacency: adjacency,
            nodeById: nodeById, domainIds: domainIds, langIds: langIds,
            langCounts: langCounts, domainCounts: domainCounts, totalFiles: totalFiles,
            // The dive grows this same graph, so it needs the same two mutators.
            // They close over nodes, nodeById and adjacency, so handing them back
            // keeps the behaviour identical to one shared closure.
            addNode: addNode, addLink: addLink
        };
    }

    /*
     * Returns deckSync, which the canvas calls to keep the rail in step with the
     * selection. It used to assign an outer binding; a returned function is the
     * only way to keep that link once the code lives in another file.
     */
    function renderDeck(g, onNodeClick, getFocus, openReader) {
        /*
         * Everything the deck reads out of the assembled graph, named locally so the
         * moved code below is character-for-character what it was inside the
         * closure. Bound in full rather than the three a grep of the first screen
         * suggested: the drill-down reads domainCounts a hundred lines further
         * down, and a partial binding just moves the ReferenceError deeper into
         * the interaction where it is harder to find.
         */
        var forks = g.forks, nodes = g.nodes, links = g.links;
        var adjacency = g.adjacency, nodeById = g.nodeById;
        var domainIds = g.domainIds, langIds = g.langIds;
        var langCounts = g.langCounts, domainCounts = g.domainCounts;
        var totalFiles = g.totalFiles;

        // ---- Drill deck -------------------------------------------------
        // The rail follows the graph's own hierarchy (domain -> language ->
        // repo) rather than listing 1296 repos flat, which would fight the
        // structure the graph is showing. Selecting a row drives the graph
        // through the same onNodeClick the canvas uses.
        var deckSync = function () {};
        (function buildDeck() {
            var deckEl = document.getElementById('deck');
            var crumbEl = document.getElementById('deck-crumb');
            var countEl = document.getElementById('deck-count');
            if (!deckEl) return;
            var level = { kind: 'root' };

            function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }
            function nf(n) { return (n || 0).toLocaleString('en-US'); }

            function rowsFor(lv) {
                if (lv.kind === 'root') {
                    return nodes.filter(function (n) { return n.kind === 'domain'; })
                        .map(function (n) {
                            var kids = nodes.filter(function (r) { return r.kind === 'repo' && r.domain === n.name; });
                            return { node: n, name: n.name, count: kids.length + ' repos', color: n.color };
                        }).sort(function (a, b) { return parseInt(b.count) - parseInt(a.count); });
                }
                if (lv.kind === 'domain') {
                    return nodes.filter(function (n) { return n.kind === 'lang' && n.domain === lv.node.name; })
                        .map(function (n) {
                            var kids = nodes.filter(function (r) {
                                return r.kind === 'repo' && r.domain === lv.node.name && r.language === n.name;
                            });
                            return { node: n, name: n.name, count: kids.length + ' repos', color: n.color };
                        }).sort(function (a, b) { return parseInt(b.count) - parseInt(a.count); });
                }
                if (lv.kind === 'lang') {
                    return nodes.filter(function (n) {
                        return n.kind === 'repo' && n.domain === lv.node.domain && n.language === lv.node.name;
                    }).map(function (n) {
                        return { node: n, name: n.name, count: nf(n.files) + ' files', color: n.color };
                    }).sort(function (a, b) { return (b.node.files || 0) - (a.node.files || 0); });
                }
                return [];
            }

            function render() {
                var html = '';
                if (level.kind !== 'root') {
                    html += '<button class="dback" data-back="1">&larr; ' +
                        (level.kind === 'domain' ? 'All domains' : esc(level.node.domain)) + '</button>';
                }
                // A repo is a leaf: show what it is and where to read more.
                if (level.kind === 'repo') {
                    var f = level.node.repo || {}, kg = f.knowledgeGraph || {};
                    html += '<div class="dmeta">' + esc(f.description || 'No description available') +
                        '<div style="margin-top:10px;display:flex;gap:14px;flex-wrap:wrap">' +
                        '<a href="report.html?repo=' + encodeURIComponent(f.id) + '" data-read="1">Read the report &rarr;</a>' +
                        '<a href="blog/' + encodeURIComponent(f.name) + '.html">Briefing &rarr;</a>' +
                        '</div></div>';
                    crumbEl.textContent = level.node.name;
                    countEl.textContent = nf(kg.totalFiles || level.node.files) + ' files';
                    deckEl.innerHTML = html;
                    wire();
                    return;
                }
                var rows = rowsFor(level);
                html += rows.map(function (r) {
                    // The selection is the controller's live state, so it is read
                    // through a getter rather than captured: a value copied at
                    // render time would mark whatever was selected back then.
                    var currentFocus = getFocus();
                    var active = currentFocus && currentFocus.id === r.node.id;
                    return '<button class="drow" data-id="' + esc(r.node.id) + '" data-active="' + (active ? 1 : 0) + '">' +
                        '<span class="dot" style="background:' + esc(r.color) + '"></span>' +
                        '<span class="nm">' + esc(r.name) + '</span>' +
                        '<span class="ct">' + esc(r.count) + '</span></button>';
                }).join('');
                crumbEl.textContent = level.kind === 'root' ? 'All domains' :
                    (level.kind === 'domain' ? level.node.name : level.node.domain + ' / ' + level.node.name);
                countEl.textContent = rows.length + (level.kind === 'lang' ? ' repos' : ' items');
                deckEl.innerHTML = html;
                wire();
            }

            function wire() {
                var back = deckEl.querySelector('[data-back]');
                if (back) back.addEventListener('click', function () {
                    level = level.kind === 'domain' ? { kind: 'root' }
                        : level.kind === 'lang' ? { kind: 'domain', node: nodeById['domain:' + level.node.domain] || { name: level.node.domain } }
                        : { kind: 'root' };
                    if (level.kind === 'domain' && !level.node.name) level = { kind: 'root' };
                    render();
                });
                // The href stays real so the link is still shareable and
                // middle-clickable; the handler keeps a plain click in-page.
                var read = deckEl.querySelector('[data-read]');
                if (read) read.addEventListener('click', function (e) {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    openReader((level.node && level.node.repo) || {}, level.node);
                });
                deckEl.querySelectorAll('.drow').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var n = nodeById[btn.dataset.id];
                        if (!n) return;
                        onNodeClick(n);
                        level = { kind: n.kind, node: n };
                        render();
                    });
                });
            }

            // Selecting on the canvas moves the deck to the same place.
            deckSync = function (node) {
                if (!node) { level = { kind: 'root' }; render(); return; }
                level = { kind: node.kind, node: node };
                render();
            };
            render();
        })();
    
        return deckSync;
    }

    /*
     * The readout figures and the domain filter's options: the same data-to-DOM
     * work as the legend, so it sits beside it rather than in the controller.
     */
    function fillReadout(g) {
        el.sRepos.textContent = g.forks.length;
        el.sFiles.textContent = g.totalFiles.toLocaleString();
        el.sLangs.textContent = Object.keys(g.langCounts).length;
        el.sDomains.textContent = Object.keys(g.domainCounts).length;

        var counts = g.domainCounts;
        Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (d) {
            var o = document.createElement('option');
            o.value = d; o.textContent = d + ' (' + counts[d] + ')';
            el.fDomain.appendChild(o);
        });
    }

    function buildLegend(g) {
        var domainCounts = g.domainCounts;
        el.legend.innerHTML = '';
        Object.keys(domainCounts).sort(function (a, b) { return domainCounts[b] - domainCounts[a]; }).forEach(function (d) {
            var row = document.createElement('div'); row.className = 'row';
            row.innerHTML = '<span class="dot" style="background:' + domainColor(d) + '"></span>' + d + ' (' + domainCounts[d] + ')';
            el.legend.appendChild(row);
        });
    }

    var COMMUNITY_PALETTE = ['#4f7cff', '#a06bff', '#34e0c4', '#f0b355', '#ff7d73', '#41b883',
        '#63b3ff', '#f178c6', '#89e051', '#e38c00', '#00b4ab', '#c9a7ff'];
    function colorByCommunity(subNodes, allLinks) {
        var ids = {}; subNodes.forEach(function (n) { ids[n.id] = true; });
        var adj = {}; subNodes.forEach(function (n) { adj[n.id] = []; });
        allLinks.forEach(function (l) {
            var s = idOf(l.source), t = idOf(l.target);
            if (ids[s] && ids[t]) { adj[s].push(t); adj[t].push(s); }
        });
        var label = {}; subNodes.forEach(function (n) { label[n.id] = n.id; });
        // Deterministic label propagation (few passes converge on ~300 nodes).
        for (var pass = 0; pass < 6; pass++) {
            var changed = false;
            subNodes.forEach(function (n) {
                var nb = adj[n.id]; if (!nb.length) return;
                var count = {};
                nb.forEach(function (m) { count[label[m]] = (count[label[m]] || 0) + 1; });
                var best = label[n.id], bestN = -1;
                Object.keys(count).forEach(function (lb) { if (count[lb] > bestN || (count[lb] === bestN && lb < best)) { bestN = count[lb]; best = lb; } });
                if (best !== label[n.id]) { label[n.id] = best; changed = true; }
            });
            if (!changed) break;
        }
        var order = {}, next = 0;
        subNodes.forEach(function (n) {
            var lb = label[n.id];
            if (order[lb] === undefined) order[lb] = next++;
            n.community = order[lb];
            n.color = COMMUNITY_PALETTE[n.community % COMMUNITY_PALETTE.length];
        });
        return next;
    }

    global.CBData = {
        useDom: useDom,
        assembleGraph: assembleGraph,
        fillReadout: fillReadout,
        renderDeck: renderDeck,
        buildLegend: buildLegend,
        colorByCommunity: colorByCommunity
    };
})(window);
