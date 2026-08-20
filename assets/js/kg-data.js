/*
 * kg-data.js - the semantic map's data layer and its side rail.
 *
 * Split out of knowledge-graph.js, where build() was a single 518-line closure.
 * Concatenating partials could not help there, unlike site.js: the file's only
 * statement-level boundaries fall before build() begins, because build() is one
 * construct. So the split had to be a real one, and these are the two pieces that
 * can stand on their own.
 *
 * assembleGraph is pure - a fork list in, nodes and links and adjacency out - so
 * it needs no part of the closure at all.
 *
 * renderRail needed eight closed-over values and two callbacks, which is why it
 * now takes the assembled graph, the element map and an onSelect. It also used to
 * assign markActiveCard in the enclosing scope; it returns it instead, and that
 * return is the only contract that changed in the move.
 *
 * Loaded before knowledge-graph.js and published on window, matching how
 * ReportRender and SiteReader are already shared.
 */
(function (global) {
    'use strict';

        // Language → color palette (stable, distinct hues on dark bg).
        var LANG_COLORS = {
            'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3776ab',
            'Rust': '#dea584', 'Go': '#00add8', 'Java': '#b07219', 'C++': '#f34b7d',
            'C': '#a8b9cc', 'C#': '#178600', 'Ruby': '#701516', 'PHP': '#4f5d95',
            'Shell': '#89e051', 'HTML': '#e34c26', 'CSS': '#563d7c', 'Jupyter Notebook': '#da5b0b',
            'Swift': '#f05138', 'Kotlin': '#a97bff', 'Dart': '#00b4ab', 'Vue': '#41b883',
            'Solidity': '#aa6746', 'Lua': '#000080', 'Zig': '#ec915c', 'Elixir': '#6e4a7e'
        };
        function langColor(l) { return LANG_COLORS[l] || '#8a93ad'; }

        // Non-code file categories to ignore when inferring a repo's primary language.
        var NON_CODE = { 'Markdown': 1, 'JSON': 1, 'YAML': 1, 'TOML': 1, 'INI': 1, 'XML': 1,
            'CSV': 1, 'Text': 1, 'SVG': 1, 'Dockerfile': 1, 'Makefile': 1, 'HTML': 1 };
        function primaryLanguage(f) {
            if (f.language) return f.language;
            var langs = (f.knowledgeGraph && f.knowledgeGraph.languages) || {};
            var best = null, bestN = 0;
            Object.keys(langs).forEach(function (k) {
                if (NON_CODE[k]) return;
                if (langs[k] > bestN) { bestN = langs[k]; best = k; }
            });
            // Fall back to any file type (incl. HTML/docs) if nothing else, else 'Other'.
            if (!best) {
                Object.keys(langs).forEach(function (k) { if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
            }
            return best || 'Other';
        }

    function assembleGraph(data) {
            var forks = data.forks || [];
            var nodes = [], links = [];
            var adjacency = {}; // id -> [neighborIds]
            var nodeById = {};

            function addNode(n) { nodes.push(n); nodeById[n.id] = n; adjacency[n.id] = []; }
            function addLink(a, b) { links.push({ source: a, target: b }); adjacency[a].push(b); adjacency[b].push(a); }

            addNode({ id: '__root__', kind: 'root', name: 'Moses Yebei', val: 46, color: '#ffffff' });

            var langIds = {};
            var langCounts = {};
            forks.forEach(function (f) {
                var lang = primaryLanguage(f);
                langCounts[lang] = (langCounts[lang] || 0) + 1;
                if (!langIds[lang]) {
                    var lid = 'lang:' + lang;
                    langIds[lang] = lid;
                    addNode({ id: lid, kind: 'lang', name: lang, val: 16, color: langColor(lang) });
                    addLink('__root__', lid);
                }
                var rid = 'repo:' + f.id;
                var kg = f.knowledgeGraph || {};
                addNode({
                    id: rid, kind: 'repo', name: f.displayName || f.name, language: lang,
                    color: langColor(lang),
                    val: Math.max(3, Math.min(20, 3 + (f.stars || 0) / 4 + (kg.totalFiles || 0) / 120)),
                    repo: f
                });
                addLink(langIds[lang], rid);
            });

            // ---- Semantic layer (optional, present once the embedding pipeline has run) ----
            // simLinks are kept out of `links` so the force layout stays the default view;
            // toggling semantic mode swaps them in and pins repos to their UMAP coordinates.
            var simLinks = [];
            (data.similarityLinks || []).forEach(function (sl) {
                var a = 'repo:' + sl.source, b = 'repo:' + sl.target;
                if (!nodeById[a] || !nodeById[b]) return;
                simLinks.push({ source: a, target: b, sim: sl.similarity, kind: 'sim' });
            });
            // repo id -> nearest semantic kin, strongest first (both directions of each edge).
            var simByRepo = {};
            simLinks.forEach(function (l) {
                (simByRepo[l.source] = simByRepo[l.source] || []).push({ id: l.target, sim: l.sim });
                (simByRepo[l.target] = simByRepo[l.target] || []).push({ id: l.source, sim: l.sim });
            });
            Object.keys(simByRepo).forEach(function (k) {
                simByRepo[k].sort(function (a, b) { return b.sim - a.sim; });
            });

            var hasUmap = forks.some(function (f) { return Array.isArray(f.umap) && f.umap.length === 3; });
            var canSemantic = hasUmap && simLinks.length > 0;
            if (simLinks.length) {
                document.getElementById('s-sim-wrap').style.display = '';
                document.getElementById('s-sim').textContent = simLinks.length;
            }

            return {
                forks: forks, nodes: nodes, links: links, adjacency: adjacency,
                nodeById: nodeById, langIds: langIds, langCounts: langCounts,
                simLinks: simLinks, simByRepo: simByRepo, canSemantic: canSemantic
            };
        }

        function renderRail(g, el, onSelect, data) {
            // ---- Readout + deck -------------------------------------------------
            // Both are views over the same g.nodes the graph already built, and the deck
            // drives selection through the existing focusNode(), so scrolling the deck
            // and clicking the canvas end up in exactly the same state.
            var nf = function (n) { return (n || 0).toLocaleString('en-US'); };
            var totalFiles = g.forks.reduce(function (a, f) {
                return a + (((f.knowledgeGraph || {}).totalFiles) || 0);
            }, 0);
            var figs = [
                ['Repositories', nf(g.forks.length)],
                ['Files parsed', nf(totalFiles)],
                ['Languages', nf(Object.keys(g.langIds).length)],
                ['Similar pairs', nf(g.simLinks.length)]
            ];
            document.getElementById('ro-figs').innerHTML = figs.map(function (f) {
                return '<div class="ro-fig"><div class="n">' + f[1] + '</div><div class="t">' + f[0] + '</div></div>';
            }).join('');

            var deckNodes = g.nodes.filter(function (n) { return n.kind === 'repo'; })
                .sort(function (a, b) {
                    var sa = (a.repo && a.repo.stars) || 0, sb = (b.repo && b.repo.stars) || 0;
                    return sb - sa;
                });
            var deckEl = document.getElementById('deck');
            function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }

            // Rendered in windows rather than all at once. 1295 cards beside a live
            // WebGL scene is a lot of DOM for a rail nobody scrolls to the end of, and
            // it was enough to crash the renderer intermittently under software GL.
            var DECK_PAGE = 120, deckShown = 0;
            function cardHTML(n, i) {
                var f = n.repo || {}, kg = f.knowledgeGraph || {};
                var kin = (g.simByRepo[n.id] || []).length;
                return '<article class="card" data-id="' + esc(n.id) + '" data-active="0">'
                    + '<div class="top"><span class="idx">' + String(i + 1).padStart(3, '0') + '</span>'
                    + '<h3>' + esc(n.name) + '</h3>'
                    + '<span class="lang" style="color:' + esc(n.color) + ';border-color:' + esc(n.color) + '">'
                    + esc(n.language) + '</span></div>'
                    + '<p>' + esc(f.description || 'No description available') + '</p>'
                    + '<div class="facts"><span>' + nf(kg.totalFiles || 0) + ' files</span>'
                    + (f.stars ? '<span>' + nf(f.stars) + ' stars</span>' : '')
                    + (kin ? '<span>' + kin + ' similar</span>' : '')
                    + ((kg.issues || []).length ? '<span>' + kg.issues.length + ' findings</span>' : '')
                    + '</div></article>';
            }

            function renderDeckPage() {
                if (deckShown >= deckNodes.length) return;
                var upto = Math.min(deckShown + DECK_PAGE, deckNodes.length);
                var html = '';
                for (var i = deckShown; i < upto; i++) html += cardHTML(deckNodes[i], i);
                deckEl.insertAdjacentHTML('beforeend', html);
                deckShown = upto;
                document.getElementById('deck-count').textContent =
                    deckShown + ' of ' + deckNodes.length + ' repos';
            }
            renderDeckPage();
            deckEl.addEventListener('scroll', function () {
                if (deckEl.scrollTop + deckEl.clientHeight > deckEl.scrollHeight - 400) renderDeckPage();
            });

            // A card can be selected from the canvas before its page exists; pull in
            // pages until it does, so the deck never silently fails to reflect focus.
            function ensureCard(id) {
                var guard = 0;
                while (!deckEl.querySelector('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]')
                       && deckShown < deckNodes.length && guard++ < 40) {
                    renderDeckPage();
                }
            }
            document.getElementById('hero-count').textContent = nf(g.forks.length);

            deckEl.addEventListener('click', function (ev) {
                var card = ev.target.closest ? ev.target.closest('.card') : null;
                if (!card) return;
                var node = g.nodeById[card.dataset.id];
                if (node) onSelect(node);
            });

            // Keeps the deck and the canvas in agreement whichever one was used.
            var markActiveCard = function (id) {
                if (id) ensureCard(id);
                var cards = deckEl.querySelectorAll('.card');
                for (var i = 0; i < cards.length; i++) {
                    var on = cards[i].dataset.id === id;
                    cards[i].dataset.active = on ? '1' : '0';
                    if (on) cards[i].scrollIntoView({ block: 'nearest' });
                }
            };
            if (data.progress && data.progress.pending) {
                document.getElementById('s-pending-wrap').style.display = '';
                document.getElementById('s-pending').textContent = data.progress.pending;
            }
        return markActiveCard;
    }

    global.KGData = {
        assembleGraph: assembleGraph,
        renderRail: renderRail,
        langColor: langColor,
        primaryLanguage: primaryLanguage
    };
})(window);
