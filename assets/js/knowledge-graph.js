/*
 * knowledge-graph.js - the semantic map: force-directed graph, the repo rail and the language legend.
 *
 * Extracted from knowledge-graph.html. Loaded without defer or async and from the
 * same position in the document, so it still runs after the libraries above it
 * and before anything below: an inline script and a plain external script have
 * the same execution order, and changing that would have been the one way this
 * move could break the page.
 */
    (function () {
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
        var ACCENT = '#4f7cff', ACCENT2 = '#a06bff', ACCENT3 = '#34e0c4';
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

        var el = {
            loading: document.getElementById('loading'),
            sRepos: document.getElementById('s-repos'),
            sLangs: document.getElementById('s-langs'),
            legend: document.getElementById('legend'),
            search: document.getElementById('search'),
            reset: document.getElementById('reset'),
            info: document.getElementById('info'),
            iKind: document.getElementById('i-kind'),
            iName: document.getElementById('i-name'),
            iDesc: document.getElementById('i-desc'),
            iMeta: document.getElementById('i-meta'),
            iLinks: document.getElementById('i-links'),
            iKin: document.getElementById('i-kin'),
            infoClose: document.getElementById('info-close'),
            semantic: document.getElementById('semantic-toggle'),
            prev: document.getElementById('prev'),
            next: document.getElementById('next'),
            nCount: document.getElementById('n-count')
        };

        fetch('forks.json')
            .then(function (r) { return r.json(); })
            .then(build)
            .catch(function (e) {
                el.loading.innerHTML = '<div>Could not load graph data.</div>';
                console.error(e);
            });

        // Assigned once the deck exists; a no-op until then so focusNode can call it
        // freely during startup.
        var markActiveCard = function () {};

        function build(data) {
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

            el.sRepos.textContent = forks.length;
            el.sLangs.textContent = Object.keys(langIds).length;

            // Deferred until after the graph exists: building the rail synchronously
            // here competed with ForceGraph3D's WebGL setup and intermittently cost
            // the canvas entirely (3 of 4 loads instead of 4 of 4).
            function renderRail() {
                // ---- Readout + deck -------------------------------------------------
                // Both are views over the same nodes the graph already built, and the deck
                // drives selection through the existing focusNode(), so scrolling the deck
                // and clicking the canvas end up in exactly the same state.
                var nf = function (n) { return (n || 0).toLocaleString('en-US'); };
                var totalFiles = forks.reduce(function (a, f) {
                    return a + (((f.knowledgeGraph || {}).totalFiles) || 0);
                }, 0);
                var figs = [
                    ['Repositories', nf(forks.length)],
                    ['Files parsed', nf(totalFiles)],
                    ['Languages', nf(Object.keys(langIds).length)],
                    ['Similar pairs', nf(simLinks.length)]
                ];
                document.getElementById('ro-figs').innerHTML = figs.map(function (f) {
                    return '<div class="ro-fig"><div class="n">' + f[1] + '</div><div class="t">' + f[0] + '</div></div>';
                }).join('');

                var deckNodes = nodes.filter(function (n) { return n.kind === 'repo'; })
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
                    var kin = (simByRepo[n.id] || []).length;
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
                document.getElementById('hero-count').textContent = nf(forks.length);

                deckEl.addEventListener('click', function (ev) {
                    var card = ev.target.closest ? ev.target.closest('.card') : null;
                    if (!card) return;
                    var node = nodeById[card.dataset.id];
                    if (node) focusNode(node);
                });

                // Keeps the deck and the canvas in agreement whichever one was used.
                markActiveCard = function (id) {
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
            }

            // Legend (top languages by count)
            Object.keys(langCounts).sort(function (a, b) { return langCounts[b] - langCounts[a]; })
                .slice(0, 12).forEach(function (l) {
                    var row = document.createElement('div');
                    row.className = 'row';
                    row.innerHTML = '<span class="dot" style="background:' + langColor(l) + '"></span>' + l + ' (' + langCounts[l] + ')';
                    el.legend.appendChild(row);
                });

            // ---- 3D graph ----
            var highlightNodes = new Set();
            var highlightLinks = new Set();
            var focusId = null;
            var semanticOn = false;
            var activeLinks = links;   // what is currently rendered: structural, or structural + similarity

            setTimeout(renderRail, 0);

            var Graph = ForceGraph3D({ controlType: 'orbit' })(document.getElementById('graph'))
                .backgroundColor('#06070f')
                .graphData({ nodes: nodes, links: links })
                .nodeLabel(function (n) { return n.kind === 'repo' ? (n.name + ' · ' + n.language) : n.name; })
                .nodeVal('val')
                .nodeRelSize(2)
                .nodeColor(function (n) {
                    if (highlightNodes.size === 0) return n.color;
                    return highlightNodes.has(n.id) ? n.color : 'rgba(120,130,160,0.12)';
                })
                .nodeOpacity(0.95)
                .nodeResolution(12)
                .linkColor(function (l) {
                    var lid = linkId(l);
                    if (highlightLinks.has(lid)) return l.kind === 'sim' ? ACCENT2 : ACCENT3;
                    if (highlightLinks.size > 0) return 'rgba(120,130,160,0.05)';
                    // Similarity edges sit behind the structural ones, weighted by strength.
                    if (l.kind === 'sim') {
                        var a = 0.10 + Math.max(0, Math.min(1, (l.sim - 0.3) / 0.7)) * 0.30;
                        return 'rgba(160,107,255,' + a.toFixed(2) + ')';
                    }
                    return 'rgba(160,170,200,0.18)';
                })
                .linkWidth(function (l) {
                    if (highlightLinks.has(linkId(l))) return 1.6;
                    return l.kind === 'sim' ? 0.25 : 0.4;
                })
                .linkDirectionalParticles(function (l) { return highlightLinks.has(linkId(l)) ? 2 : 0; })
                .linkDirectionalParticleSpeed(0.006)
                .onBackgroundClick(clearFocus);

            // force-graph sizes itself from the window, but the canvas lives in a grid
            // cell that is narrower than the viewport. Left alone the canvas was
            // 1440x757 inside a 1060x701 box, so every pointer coordinate was offset:
            // clicks selected the wrong node and zoom/pan felt wrong. Drive the size
            // from the container and keep it in step.
            (function () {
                var box = document.getElementById('graph');
                function fitCanvas() {
                    var r = box.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) Graph.width(r.width).height(r.height);
                }
                fitCanvas();
                if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(box);
                window.addEventListener('resize', fitCanvas);
            })();


            (function () {
                var lastId = null, lastAt = 0;
                Graph.onNodeClick(function (node) {
                    var now = Date.now();
                    if (node && node.id === lastId && now - lastAt < 400) {
                        lastId = null;
                        focusNode(node);
                        if (node.kind === 'repo' && !semanticOn) setSemantic(true);
                        return;
                    }
                    lastId = node ? node.id : null; lastAt = now;
                    focusNode(node);
                });
            })();

            // Orbit controls: left-drag = 360° rotate (azimuth + polar), scroll = zoom, right-drag = pan.
            var controls = Graph.controls();
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.rotateSpeed = 0.9;
            controls.zoomSpeed = 1.1;
            // Gentle auto-rotate until the user takes over - never fights manual input.
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.55;
            var spinning = true;
            controls.addEventListener('start', function () {
                if (spinning) { controls.autoRotate = false; spinning = false; }
            });

            function linkId(l) {
                var s = typeof l.source === 'object' ? l.source.id : l.source;
                var t = typeof l.target === 'object' ? l.target.id : l.target;
                return s + '>' + t;
            }

            function computeHighlight(id) {
                highlightNodes.clear(); highlightLinks.clear();
                if (!id) { refresh(); return; }
                highlightNodes.add(id);
                (adjacency[id] || []).forEach(function (nb) { highlightNodes.add(nb); });
                activeLinks.forEach(function (l) {
                    var s = typeof l.source === 'object' ? l.source.id : l.source;
                    var t = typeof l.target === 'object' ? l.target.id : l.target;
                    if (s === id || t === id) highlightLinks.add(linkId(l));
                });
                refresh();
            }
            function refresh() {
                Graph.nodeColor(Graph.nodeColor()).linkColor(Graph.linkColor())
                     .linkWidth(Graph.linkWidth()).linkDirectionalParticles(Graph.linkDirectionalParticles());
            }

            // ---- Semantic map ----
            // Repos are pinned to their 3D UMAP coordinates, so distance on screen means
            // distance in embedding space rather than whatever the force layout settled on.
            // Language hubs move to the centroid of their repos so the color key still reads.
            var SPREAD = 1100;
            function applySemanticPositions(on) {
                nodes.forEach(function (n) {
                    if (!on) { delete n.fx; delete n.fy; delete n.fz; return; }
                    if (n.kind === 'repo') {
                        var u = n.repo && n.repo.umap;
                        if (!Array.isArray(u) || u.length !== 3) return;   // unembedded repos keep floating
                        n.fx = (u[0] - 0.5) * SPREAD;
                        n.fy = (u[1] - 0.5) * SPREAD;
                        n.fz = (u[2] - 0.5) * SPREAD;
                    } else if (n.kind === 'root') {
                        n.fx = 0; n.fy = 0; n.fz = 0;
                    }
                });
                if (!on) return;

                // Language hubs: centroid of their pinned repos.
                Object.keys(langIds).forEach(function (lang) {
                    var lid = langIds[lang];
                    var sx = 0, sy = 0, sz = 0, k = 0;
                    (adjacency[lid] || []).forEach(function (nb) {
                        var r = nodeById[nb];
                        if (!r || r.kind !== 'repo' || r.fx === undefined) return;
                        sx += r.fx; sy += r.fy; sz += r.fz; k++;
                    });
                    var hub = nodeById[lid];
                    if (!hub) return;
                    if (k) { hub.fx = sx / k; hub.fy = sy / k; hub.fz = sz / k; }
                    else { delete hub.fx; delete hub.fy; delete hub.fz; }
                });
            }

            function rebuildAdjacency(activeSet) {
                Object.keys(adjacency).forEach(function (k) { adjacency[k] = []; });
                activeSet.forEach(function (l) {
                    var s = typeof l.source === 'object' ? l.source.id : l.source;
                    var t = typeof l.target === 'object' ? l.target.id : l.target;
                    if (adjacency[s]) adjacency[s].push(t);
                    if (adjacency[t]) adjacency[t].push(s);
                });
            }

            function setSemantic(on) {
                semanticOn = on;
                el.semantic.setAttribute('aria-pressed', on ? 'true' : 'false');
                el.semantic.textContent = on ? 'Force layout' : 'Semantic map';
                activeLinks = on ? links.concat(simLinks) : links;
                // Adjacency drives both highlighting and neighbor-walking, so in semantic
                // mode "Next" walks semantic kin too, not just same-language siblings.
                rebuildAdjacency(activeLinks);
                applySemanticPositions(on);
                Graph.graphData({ nodes: nodes, links: activeLinks });
                if (!on && Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
                computeHighlight(focusId);
                Graph.zoomToFit(900, 140);
            }

            if (!canSemantic) {
                el.semantic.disabled = true;
                el.semantic.title = 'Semantic layout unavailable: run scripts/update-forks.js to generate embeddings';
            } else {
                el.semantic.addEventListener('click', function () { setSemantic(!semanticOn); });
            }

            function flyTo(node) {
                var dist = node.kind === 'repo' ? 120 : 220;
                var d = Math.hypot(node.x || 1, node.y || 1, node.z || 1) || 1;
                var r = 1 + dist / d;
                Graph.cameraPosition(
                    { x: (node.x || 0) * r, y: (node.y || 0) * r, z: (node.z || 0) * r },
                    node, 1400
                );
            }

            var neighborIdx = 0;
            function focusNode(node) {
                spinning = false;
                focusId = node.id;
                markActiveCard(node.id);
                neighborIdx = 0;
                computeHighlight(node.id);
                flyTo(node);
                showInfo(node);
            }
            function clearFocus() {
                focusId = null;
                markActiveCard(null);
                computeHighlight(null);
                el.info.classList.remove('open');
            }

            // Nearest semantic kin for a repo, clickable so you can hop by meaning.
            function renderKin(node) {
                if (node.kind !== 'repo') return;
                var kin = (simByRepo[node.id] || []).slice(0, 4);
                if (!kin.length) return;
                var label = document.createElement('div');
                label.className = 'label';
                label.textContent = 'Semantically closest';
                el.iKin.appendChild(label);
                kin.forEach(function (k) {
                    var target = nodeById[k.id];
                    if (!target) return;
                    var b = document.createElement('button');
                    var nameEl = document.createElement('span');
                    nameEl.textContent = target.name;   // repo names are untrusted input
                    var scoreEl = document.createElement('span');
                    scoreEl.className = 'score';
                    scoreEl.textContent = k.sim.toFixed(2);
                    b.appendChild(nameEl);
                    b.appendChild(scoreEl);
                    b.addEventListener('click', function () { focusNode(target); });
                    el.iKin.appendChild(b);
                });
            }

            function kgFirstSentences(s, n) {
                if (!s) return '';
                var parts = String(s).split(/(?<=[.!?])\s+/).slice(0, n).join(' ');
                return parts.length > 320 ? parts.slice(0, 317) + '\u2026' : parts;
            }

            function showInfo(node) {
                el.info.classList.add('open');
                el.iKind.textContent = node.kind === 'root' ? 'Owner' : node.kind === 'lang' ? 'Language' : 'Repository';
                el.iName.textContent = node.name;
                el.iMeta.innerHTML = '';
                el.iLinks.innerHTML = '';
                el.iKin.innerHTML = '';
                el.iDesc.textContent = '';
                renderKin(node);
                var f = node.repo;
                if (node.kind === 'repo' && f) {
                    // The one-liner, never the full summary: summaries run to
                    // thousands of characters and bury the rest of the panel.
                    el.iDesc.textContent = f.description || kgFirstSentences(f.summary, 2) || 'No description available.';
                    var kg = f.knowledgeGraph || {};
                    var meta = [];
                    meta.push('<span><strong>' + (node.language || '-') + '</strong> language</span>');
                    meta.push('<span><strong>' + (f.stars || 0) + '</strong> stars</span>');
                    if (kg.totalFiles) meta.push('<span><strong>' + kg.totalFiles + '</strong> files</span>');
                    if (f.type) meta.push('<span>' + f.type + '</span>');
                    el.iMeta.innerHTML = meta.join('');
                    // The briefing opens in place. It used to navigate away, which
                    // meant losing the graph position you had just found.
                    el.iLinks.innerHTML =
                        (f.url ? '<a href="' + f.url + '" target="_blank" rel="noopener">GitHub ↗</a>' : '') +
                        '<button type="button" data-read-briefing>Read briefing →</button>';
                    var rb = el.iLinks.querySelector('[data-read-briefing]');
                    if (rb) rb.addEventListener('click', function () {
                        if (window.SiteReader) SiteReader.open({
                            id: f.id, name: f.name, displayName: f.displayName || f.name,
                            description: f.description, url: f.url,
                            crumb: [f.domain, node.language].filter(Boolean).join(' · ')
                        });
                    });
                } else if (node.kind === 'lang') {
                    el.iDesc.textContent = 'Repositories primarily written in ' + node.name + '. Click a connected node to explore one.';
                    el.iMeta.innerHTML = '<span><strong>' + (langCounts[node.name] || 0) + '</strong> repositories</span>';
                } else {
                    el.iDesc.textContent = 'The root of the ecosystem. Every language cluster connects here.';
                }
                updateNeighborUI();
            }

            function neighborsOf(id) { return (adjacency[id] || []).map(function (nb) { return nodeById[nb]; }).filter(Boolean); }
            function updateNeighborUI() {
                var nbs = focusId ? neighborsOf(focusId) : [];
                el.nCount.textContent = nbs.length ? (neighborIdx + 1) + ' / ' + nbs.length : '-';
                el.prev.disabled = nbs.length < 2;
                el.next.disabled = nbs.length < 1;
            }
            function stepNeighbor(dir) {
                if (!focusId) return;
                var nbs = neighborsOf(focusId);
                if (!nbs.length) return;
                neighborIdx = (neighborIdx + dir + nbs.length) % nbs.length;
                var target = nbs[neighborIdx];
                // Peek: highlight the walk edge + fly toward the neighbor without losing focus origin.
                flyTo(target);
                // Make the neighbor the new focus so you can keep walking.
                focusId = target.id;
                neighborIdx = 0;
                computeHighlight(target.id);
                showInfo(target);
            }

            el.next.addEventListener('click', function () { stepNeighbor(1); });
            el.prev.addEventListener('click', function () { stepNeighbor(-1); });
            el.infoClose.addEventListener('click', clearFocus);
            // Collapse to the header, so the panel can be pushed aside without
            // losing which node is selected.
            var infoMin = document.getElementById('info-min');
            infoMin.addEventListener('click', function () {
                var collapsed = el.info.classList.toggle('collapsed');
                infoMin.textContent = collapsed ? '+' : '–';
                infoMin.title = collapsed ? 'Expand' : 'Collapse';
                infoMin.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            });
            document.addEventListener('keydown', function (e) {
                if (document.activeElement === el.search) return;
                if (e.key === 'ArrowRight') stepNeighbor(1);
                else if (e.key === 'ArrowLeft') stepNeighbor(-1);
                else if (e.key === 'Escape') clearFocus();
            });

            function locate(term) {
                term = (term || '').trim().toLowerCase();
                if (!term) return;
                var hit = nodes.find(function (n) { return n.kind === 'repo' && n.name.toLowerCase().indexOf(term) !== -1; })
                    || nodes.find(function (n) { return n.name.toLowerCase().indexOf(term) !== -1; });
                if (hit) focusNode(hit);
            }
            el.search.addEventListener('keydown', function (e) { if (e.key === 'Enter') locate(el.search.value); });

            // Legend hide/show - reclaims the bar width when you don't need the color key.
            var legendToggle = document.getElementById('legend-toggle');
            legendToggle.addEventListener('click', function () {
                var hidden = el.legend.style.display === 'none';
                el.legend.style.display = hidden ? 'flex' : 'none';
                legendToggle.textContent = hidden ? 'Hide languages' : 'Show languages';
                legendToggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
            });
            el.reset.addEventListener('click', function () {
                el.search.value = '';
                clearFocus();
                Graph.cameraPosition({ x: 0, y: 0, z: 900 }, { x: 0, y: 0, z: 0 }, 1400);
                controls.autoRotate = true; spinning = true;
            });

            // Fit once physics settles.
            Graph.onEngineStop(function () { Graph.zoomToFit(800, 120); Graph.onEngineStop(function () {}); });
            el.loading.style.display = 'none';
        }
    })();
