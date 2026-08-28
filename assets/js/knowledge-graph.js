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

    // Language colours and primary-language inference live in kg-data.js, which
    // this file expects to have loaded first.
    var langColor = KGData.langColor, primaryLanguage = KGData.primaryLanguage;
    // The graph's own palette. It stayed with the controller because kg-data never
    // reads it - moving it there was an accident of where the constants sat.
    var ACCENT = '#4f7cff', ACCENT2 = '#a06bff', ACCENT3 = '#34e0c4';

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
            edgeCtl: document.getElementById('edge-ctl'),
            edgeMin: document.getElementById('edge-min'),
            edgeMinVal: document.getElementById('edge-min-val'),
            edgeCount: document.getElementById('edge-count'),
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
            // Assembled in kg-data.js: pure, and the largest thing build() was doing
            // that had nothing to do with interaction.
            var g = KGData.assembleGraph(data);
            var forks = g.forks, nodes = g.nodes, links = g.links;
            var adjacency = g.adjacency, nodeById = g.nodeById;
            var langCounts = g.langCounts, simLinks = g.simLinks;
            var simByRepo = g.simByRepo, canSemantic = g.canSemantic;
            // Still used further down to walk the language nodes.
            var langIds = g.langIds;

            el.sRepos.textContent = forks.length;
            el.sLangs.textContent = Object.keys(langIds).length;

            // Deferred until after the graph exists: building the rail synchronously
            // here competed with ForceGraph3D's WebGL setup and intermittently cost
            // the canvas entirely (3 of 4 loads instead of 4 of 4).
            // The rail lives in kg-data.js. It returns the marker rather than
            // assigning it, because it no longer shares this scope.
            function renderRail() {
                markActiveCard = KGData.renderRail(g, el, focusNode, data);
            }

            // Legend (top languages by count). Named so the grade toggle can put
            // it back when it hands the legend over and takes it away again.
            function buildLangLegend() {
                el.legend.innerHTML = '';
                Object.keys(langCounts).sort(function (a, b) { return langCounts[b] - langCounts[a]; })
                    .slice(0, 12).forEach(function (l) {
                        var row = document.createElement('div');
                        row.className = 'row';
                        row.innerHTML = '<span class="dot" style="background:' + langColor(l) + '"></span>' + l + ' (' + langCounts[l] + ')';
                        el.legend.appendChild(row);
                    });
            }
            buildLangLegend();

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
                    // gradeOn is assigned below, after the graph exists; the first
                    // paint can reach this before then.
                    var base = (gradeOn && gradeOn()) ? GraphGrade.colorOf(n) : n.color;
                    if (highlightNodes.size === 0) return base;
                    return highlightNodes.has(n.id) ? base : 'rgba(120,130,160,0.12)';
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

            GraphShell.fitToContainer(Graph, document.getElementById('graph'));


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

            // Only edges at or above the control are drawn. See kg-traverse.js.
            var edges = KGTraverse.edgeControl(el, simLinks, function (visible) {
                if (!semanticOn) return;
                activeLinks = links.concat(visible);
                rebuildAdjacency(activeLinks);
                Graph.graphData({ nodes: nodes, links: activeLinks });
                computeHighlight(focusId);
            });

            function setSemantic(on) {
                semanticOn = on;
                el.semantic.setAttribute('aria-pressed', on ? 'true' : 'false');
                el.semantic.textContent = on ? 'Force layout' : 'Semantic map';
                edges.show(on);
                activeLinks = on ? links.concat(edges.visible()) : links;
                // Adjacency drives both highlighting and neighbor-walking, so in semantic
                // mode "Next" walks semantic kin too, not just same-language siblings.
                rebuildAdjacency(activeLinks);
                applySemanticPositions(on);
                Graph.graphData({ nodes: nodes, links: activeLinks });
                if (!on && Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
                computeHighlight(focusId);
                edges.refresh();
                Graph.zoomToFit(900, 140);
            }

            if (!canSemantic) {
                el.semantic.disabled = true;
                el.semantic.title = 'Semantic layout unavailable: run scripts/update-forks.js to generate embeddings';
            } else {
                el.semantic.addEventListener('click', function () { setSemantic(!semanticOn); });
            }

            // Grade replaces the language colour rather than joining it: two
            // colour meanings on one node is no meaning at all.
            var gradeOn = GraphGrade.attach({
                button: document.getElementById('grade-toggle'), legend: el.legend,
                offLabel: 'Colour by language', restore: buildLangLegend,
                onChange: function () { Graph.nodeColor(Graph.nodeColor()); }
            });

            function flyTo(node) {
                GraphShell.flyTo(Graph, node, node.kind === 'repo' ? 120 : 220, 1400);
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

            /*
             * The neighbourhood panel. This used to read simByRepo, which the
             * page derives from forks.json, and showed one undifferentiated list
             * of similar repositories. It now reads /data/kin/<id>.json - the
             * published relation layer - so the page consumes the same files
             * llms.txt advertises rather than keeping a private second opinion,
             * and so both edge types can be shown under their provenance.
             *
             * kinToken guards against a slow fetch painting into a panel that has
             * already moved to another node.
             */
            var kinToken = 0;
            function renderKin(node) {
                if (node.kind !== 'repo') return;
                var mine = ++kinToken;
                KGTraverse.render(el.iKin, node, {
                    token: mine,
                    stale: function (t) { return t !== kinToken; },
                    nodeById: nodeById,
                    simByRepo: simByRepo,
                    // A hop to a repository the graph does not hold is possible:
                    // the relation layer is built from a later pipeline stage
                    // than forks.json. Ignoring it beats navigating to nothing.
                    onWalk: function (target) { if (target) focusNode(target); }
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
