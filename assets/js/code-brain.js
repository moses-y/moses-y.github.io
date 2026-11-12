/*
 * code-brain.js - the code brain: the module graph, its side panels and the findings deck.
 *
 * Extracted from code-brain.html. Loaded without defer or async and from the
 * same position in the document, so it still runs after the libraries above it
 * and before anything below: an inline script and a plain external script have
 * the same execution order, and changing that would have been the one way this
 * move could break the page.
 */
    (function () {
        'use strict';

    var langColor = CBDom.langColor, domainColor = CBDom.domainColor,
        domainOf = CBDom.domainOf, primaryLanguage = CBDom.primaryLanguage;
    // One definition of the highlight colour, in cb-dom.
    var ACCENT = CBDom.ACCENT, ACCENT3 = CBDom.ACCENT3, structColor = CBDom.structColor;
    // Element map, palettes and text helpers: cb-dom.js.
    var el = CBDom.el, toast = CBDom.toast;
    CBData.useDom(CBDom);

        // Which repos have a full architecture report (analyzed deep graph).
        var reportSet = {};
        fetch('structure/reports.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
            .then(function (list) { (list || []).forEach(function (r) { reportSet[String(r.id)] = r; }); });

        // The ring renderer's three module loads alongside the data, not after it.
        Promise.all([IndexRecord.loadEstate(), CBLayout.ready]).then(function (r) { return build(r[0]); })
            .catch(function (e) {
                // On the page, not only the console: a build error used to read as
                // "could not load graph data", pointing at the network and hiding
                // a code fault. That cost two debugging rounds during this split.
                el.loading.innerHTML = '<div>Could not load graph data.</div>' +
                    '<div class="err">' + CBDom.esc(e && e.message ? e.message : String(e)) + '</div>';
                console.error(e);
            });

        var deckSync = function () {};

        function build(data) {
            // Assembled in cb-data.js: pure, and the bulk of what build() did.
            var g = CBData.assembleGraph(data);
            var forks = g.forks, nodes = g.nodes, links = g.links,
                adjacency = g.adjacency, nodeById = g.nodeById,
                addNode = g.addNode, addLink = g.addLink,
                domainIds = g.domainIds, langIds = g.langIds,
                langCounts = g.langCounts, domainCounts = g.domainCounts,
                totalFiles = g.totalFiles;
            // The rail lives in cb-data.js, driving the same onNodeClick as the canvas.
            deckSync = CBData.renderDeck(g, function (n) { onNodeClick(n); },
                function () { return currentFocus; },
                function (repo, node) { openReader(repo, node); });

            (function renderReadout() {
                var host = document.getElementById('ro-figs');
                if (!host) return;
                var nf = function (n) { return (n || 0).toLocaleString('en-US'); };
                [['Repositories', forks.length],
                 ['Files parsed', totalFiles],
                 ['Languages', Object.keys(langIds).length],
                 ['Domains', Object.keys(domainIds).length]
                ].forEach(function (f) {
                    var d = document.createElement('div');
                    d.className = 'ro-fig';
                    d.innerHTML = '<div class="n">' + nf(f[1]) + '</div><div class="t">' + f[0] + '</div>';
                    host.appendChild(d);
                });
            })();

            CBData.fillReadout(g);   // readout figures and the domain filter

            // One colour meaning at a time, chosen from the Colour dropdown. Repos
            // used to be painted by language under a key that listed domains.
            var colourMode = 'domain';
            function buildLegend() {
                if (colourMode === 'grade') { el.legend.classList.remove('many'); GraphGrade.renderLegend(el.legend); }
                else CBData.buildLegend(g, colourMode);
            }
            function baseColour(n) {
                if (colourMode === 'grade') return GraphGrade.colorOf(n);
                if (n.kind === 'repo') return colourMode === 'language' ? langColor(n.language) : domainColor(n.domain);
                return n.color;
            }
            buildLegend();
            el.fColour.addEventListener('change', function () {
                var mode = el.fColour.value;
                (mode === 'grade' ? GraphGrade.load() : Promise.resolve()).then(function () {
                    colourMode = mode;
                    buildLegend();
                    Graph.nodeColor(Graph.nodeColor());
                });
            });
            // ---- 3D graph ----
            var highlightNodes = new Set(), highlightLinks = new Set();

            // Positions are computed, not simulated: see cb-layout.js. Pinned
            // before the first frame, so nothing bursts out of the origin.
            var semanticOn = false;
            CBLayout.compute(nodes);
            CBLayout.place(nodes, 'treePos');

            var Graph = ForceGraph3D({ controlType: 'orbit' })(document.getElementById('graph'))
                .backgroundColor('#06070f')
                .graphData({ nodes: nodes, links: links })
                .nodeLabel(hoverCard)
                .nodeVal(function (n) {
                    // A repo's dot fills most of its packed circle. Sphere radius
                    // is cbrt(val) * relSize, so invert that.
                    if (n.kind === 'repo' && n.packR) return Math.pow(0.8 * n.packR / 1.6, 3);
                    return n.val;
                })
                .nodeRelSize(1.6)
                // Domains and languages draw as labelled rings around their repos.
                .nodeThreeObject(function (n) { return CBLayout.hubObject(n); })
                .showNavInfo(false)
                .warmupTicks(0)
                .cooldownTime(4000)
                .d3VelocityDecay(0.38)
                .nodeColor(function (n) {
                    if (highlightNodes.size && !highlightNodes.has(n.id)) return 'rgba(120,130,160,0.10)';
                    return baseColour(n);
                })
                .nodeVisibility(nodeShown)
                .nodeOpacity(0.95)
                .nodeResolution(10)
                // Containment is drawn by the rings, so the tree's own links stay
                // hidden; only similarity edges and grown structure are drawn.
                .linkVisibility(function (l) {
                    if (!l.kind && !l._dive) return false;
                    return nodeShown(nodeById[idOf(l.source)]) && nodeShown(nodeById[idOf(l.target)]);
                })
                .linkColor(function (l) {
                    if (highlightLinks.has(linkId(l))) return l.kind === 'sim' ? '#a06bff' : ACCENT3;
                    if (highlightLinks.size) return 'rgba(120,130,160,0.05)';
                    if (l.kind === 'sim') {
                        var a = 0.10 + Math.max(0, Math.min(1, (l.sim - 0.3) / 0.7)) * 0.30;
                        return 'rgba(160,107,255,' + a.toFixed(2) + ')';
                    }
                    return l._dive ? 'rgba(52,224,196,0.25)' : 'rgba(160,170,200,0.16)';
                })
                .linkWidth(function (l) { return highlightLinks.has(linkId(l)) ? 1.6 : (l._dive ? 0.6 : l.kind === 'sim' ? 0.25 : 0.4); })
                .linkDirectionalParticles(function (l) { return highlightLinks.has(linkId(l)) ? 2 : 0; })
                .linkDirectionalParticleSpeed(0.006)
                .onNodeClick(onNodeClick)
                .onNodeRightClick(function (node) { if (node.kind === 'repo') diveInto(node); })
                .onBackgroundClick(clearFocus);

            GraphShell.fitToContainer(Graph, document.getElementById('graph'));

            // Physics only acts on the structure a dive grows: everything else is
            // pinned by cb-layout. Pinned nodes carry no charge, because a flat
            // sheet of 1,700 charged repos pushes free nodes far off the plane.
            Graph.d3Force('link')
                .distance(function (l) { return l.kind === 'sim' ? 40 : l._dive ? 16 : 30; })
                .strength(function (l) { return l._dive ? 0.9 : 0; });
            Graph.d3Force('charge')
                .strength(function (n) { return (n.kind === 'dir' || n.kind === 'file' || n.kind === 'module') ? -22 : 0; })
                .distanceMax(160);
            // The default centring force re-centres the mean of all nodes every
            // tick. Pinned nodes snap back to fx; free ones keep the shift, so a
            // grown structure drifted steadily away from its repo. Layout is
            // computed now, so there is nothing for it to centre.
            Graph.d3Force('center', null);

            // The hint has done its job once someone drags, scrolls or clicks.
            var hintEl = document.querySelector('.hint');
            ['pointerdown', 'wheel'].forEach(function (ev) {
                document.getElementById('graph').addEventListener(ev, function () {
                    if (hintEl) hintEl.classList.add('used');
                }, { once: true, passive: true });
            });


            // Double-click expands. force-graph has no dblclick hook, so pair the
            // clicks by time; the same gesture works on both graph pages now.
            (function () {
                var lastId = null, lastAt = 0;
                Graph.onNodeClick(function (node) {
                    var now = Date.now();
                    if (node && node.id === lastId && now - lastAt < 400) {
                        lastId = null;
                        if (node.kind === 'repo') { onNodeClick(node); diveInto(node); return; }
                    }
                    lastId = node ? node.id : null; lastAt = now;
                    onNodeClick(node);
                });
            })();

            var controls = Graph.controls();
            controls.enableRotate = controls.enableZoom = controls.enablePan = true;
            controls.rotateSpeed = 0.9; controls.zoomSpeed = 1.1;
            // No idle spin: the tree view is a flat pack that would turn edge-on.
            controls.autoRotate = false; controls.autoRotateSpeed = 0.3;
            var spinning = true;
            controls.addEventListener('start', function () { if (spinning) { controls.autoRotate = false; spinning = false; } });

            function idOf(x) { return typeof x === 'object' ? x.id : x; }
            // Fit the camera to the repositories, not to hubs pushed out to the edges.
            function isRepoShown(n) { return n.kind === 'repo' && n._vis !== false; }
            function nodeVis(id) { var n = nodeById[id]; return !n || nodeShown(n); }
            // The owner node is implied by the outer layout and never drawn. On
            // the meaning map, rings make no sense and unembedded repos have no
            // position, so those are hidden too.
            function nodeShown(n) {
                if (!n) return true;
                if (n._vis === false || n.kind === 'root') return false;
                if (semanticOn && (n.kind === 'domain' || n.kind === 'lang')) return false;
                if (semanticOn && n.kind === 'repo' && !n.semPos) return false;
                return true;
            }
            function linkId(l) { return idOf(l.source) + '>' + idOf(l.target); }

            // ---------- Filters ----------
            function applyFilters() {
                var dom = el.fDomain.value, size = el.fSize.value, lang = el.fLang.value;
                function sizeOk(f) {
                    if (!size) return true;
                    if (size === 's') return f <= 20; if (size === 'm') return f > 20 && f <= 100; return f > 100;
                }
                // repos first
                var anyLang = {}, anyDom = {};
                nodes.forEach(function (n) {
                    if (n.kind !== 'repo') return;
                    var ok = (!dom || n.domain === dom) && (!lang || n.language === lang) && sizeOk(n.files || 0);
                    n._vis = ok;
                    if (ok) { anyLang['lang:' + n.domain + '|' + n.language] = 1; anyDom['domain:' + n.domain] = 1; }
                });
                nodes.forEach(function (n) {
                    if (n.kind === 'lang') n._vis = !!anyLang[n.id];
                    else if (n.kind === 'domain') n._vis = !!anyDom[n.id];
                    else if (n.kind === 'root') n._vis = true;
                    else if (n.kind === 'dir' || n.kind === 'file' || n.kind === 'module') {
                        var pr = nodeById[n.parentRepo]; n._vis = pr ? pr._vis !== false : true;
                    }
                });
                Graph.nodeVisibility(Graph.nodeVisibility()).linkVisibility(Graph.linkVisibility());
            }
            el.fDomain.addEventListener('change', applyFilters);
            el.fSize.addEventListener('change', applyFilters);
            el.fLang.addEventListener('change', applyFilters);

            // ---------- Highlight ----------
            function computeHighlight(id) {
                highlightNodes.clear(); highlightLinks.clear();
                if (id) {
                    highlightNodes.add(id);
                    drawnLinks().forEach(function (l) {
                        var s = idOf(l.source), t = idOf(l.target);
                        if (s === id || t === id) { highlightLinks.add(linkId(l)); highlightNodes.add(s === id ? t : s); }
                    });
                }
                refresh();
            }
            function refresh() {
                Graph.nodeColor(Graph.nodeColor()).linkColor(Graph.linkColor()).linkWidth(Graph.linkWidth()).linkDirectionalParticles(Graph.linkDirectionalParticles());
            }

            // The tree view is a flat pack in the z = 0 plane. The shared flyTo
            // places the camera on the ray from the origin through the node,
            // which for a node in that plane means looking at it edge-on. Look
            // straight down at it instead; the meaning map is 3D and keeps the ray.
            function flyTo(node, pad) {
                if (semanticOn || !node) return GraphShell.flyTo(Graph, node, pad, 1300);
                Graph.cameraPosition({ x: node.x || 0, y: node.y || 0, z: (node.z || 0) + (pad || 150) }, node, 1300);
            }

            // ---------- View: tree or semantic map ----------
            // Two computed position sets; switching glides every dot from one to
            // the other, so you can watch a repo leave its language for its
            // neighbourhood in meaning.
            var simLinks = g.simLinks;
            function layoutKey() { return semanticOn ? 'semPos' : 'treePos'; }
            function drawnLinks() { return semanticOn ? links.concat(edges.visible()) : links; }
            function redraw() { Graph.graphData({ nodes: nodes, links: drawnLinks() }); }
            var edges = KGTraverse.edgeControl(el, simLinks, function () {
                if (!semanticOn) return;
                redraw();
                computeHighlight(currentFocus && currentFocus.id);
            });
            function fitAll(ms) { Graph.zoomToFit(ms || 900, 20, isRepoShown); }
            function setView(view, instant) {
                var on = view === 'semantic' && g.canSemantic;
                el.fView.value = on ? 'semantic' : 'tree';
                if (on === semanticOn && !instant) return;
                // Rings fade out before the glide to the meaning map and back in
                // after the glide home, so they never hang around empty.
                if (on) { semanticOn = true; Graph.nodeVisibility(nodeShown); }
                edges.show(on);
                semanticOn = on;
                redraw();
                if (instant) {
                    CBLayout.place(nodes, layoutKey());
                    Graph.nodeVisibility(nodeShown);
                    setTimeout(function () { fitAll(0); }, 50);
                } else {
                    CBLayout.morph(Graph, nodes, layoutKey(), 1100, function () {
                        Graph.nodeVisibility(nodeShown);
                        if (!currentFocus) fitAll(800);
                    });
                }
                computeHighlight(currentFocus && currentFocus.id);
                edges.refresh();
            }
            if (!g.canSemantic) {
                el.fView.querySelector('option[value="semantic"]').disabled = true;
                el.fView.title = 'Semantic map unavailable until embeddings are generated';
            }
            el.fView.addEventListener('change', function () { setView(el.fView.value); });

            // ---------- Walk neighbours (Prev / Next, arrow keys) ----------
            var neighborIdx = 0;
            function neighborsOf(id) {
                var out = [], seen = {};
                drawnLinks().forEach(function (l) {
                    var s = idOf(l.source), t = idOf(l.target), o = s === id ? t : t === id ? s : null;
                    if (o && !seen[o] && nodeById[o] && nodeVis(o) && nodeById[o].kind !== 'root') { seen[o] = 1; out.push(nodeById[o]); }
                });
                // Walk what the panel lists: the closest repos by meaning, whatever
                // the edge slider is set to, then the tree neighbours.
                var sims = {};
                (g.simByRepo[id] || []).slice(0, 8).forEach(function (x) {
                    sims[x.id] = x.sim;
                    if (!seen[x.id] && nodeById[x.id] && nodeVis(x.id)) { seen[x.id] = 1; out.push(nodeById[x.id]); }
                });
                return out.sort(function (a, b) { return (sims[b.id] || 0) - (sims[a.id] || 0); });
            }
            function updateNeighborUI() {
                var nbs = currentFocus ? neighborsOf(currentFocus.id) : [];
                el.nCount.textContent = nbs.length ? (neighborIdx + 1) + ' / ' + nbs.length : '–';
                el.prev.disabled = nbs.length < 2;
                el.next.disabled = nbs.length < 1;
            }
            function stepNeighbor(dir) {
                if (!currentFocus) return;
                var nbs = neighborsOf(currentFocus.id);
                if (!nbs.length) return;
                neighborIdx = (neighborIdx + dir + nbs.length) % nbs.length;
                var keep = neighborIdx;
                onNodeClick(nbs[keep]);
            }
            el.next.addEventListener('click', function () { stepNeighbor(1); });
            el.prev.addEventListener('click', function () { stepNeighbor(-1); });

            // ---------- Dive: grow a repo's inner structure as tendrils ----------
            var currentFocus = null;
            function onNodeClick(node) {
                spinning = false; controls.autoRotate = false;
                currentFocus = node;
                neighborIdx = 0;
                computeHighlight(node.id);
                var pad = node.kind === 'repo' ? 150 : node.kind === 'domain' ? 260 : 120;
                // A ring is framed whole, however large its circle is.
                if (node.packR && node.kind !== 'repo') pad = Math.max(pad, node.packR * 2.6);
                flyTo(node, pad);
                showInfo(node);
                updateNeighborUI();
                deckSync(node);
            }
            function clearFocus() {
                currentFocus = null; computeHighlight(null); el.info.classList.remove('open');
            }

            // Growing a repo's modules lives in cb-dive.js; it mutates the same
            // node and link arrays drawn here.
            var dive = CBDive.create({
                g: g, el: el, toast: toast, structColor: structColor, idOf: idOf, linkId: linkId,
                highlightNodes: highlightNodes, highlightLinks: highlightLinks,
                redraw: redraw, refresh: refresh, computeHighlight: computeHighlight, flyTo: flyTo,
                getFocus: function () { return currentFocus; },
                renderFindings: function (n) { renderFindings(n); }
            });
            var diveInto = dive.diveInto, collapse = dive.collapse;

            // ---- reader: shared with Projects via assets/js/reader.js ----------
            function openReader(repo, node) {
                if (!repo || repo.id == null || !window.SiteReader) return;
                SiteReader.open({
                    id: repo.id, name: repo.name,
                    displayName: repo.displayName || repo.name,
                    description: repo.description, summary: repo.summary, url: repo.url,
                    crumb: [node && node.domain, node && node.language].filter(Boolean).join(' \u00b7 '),
                    // Whatever the filters leave, so reading straight through
                    // follows the estate the visitor built.
                    queue: nodes.filter(function (n) { return n.kind === 'repo' && n.repo && n._vis !== false; })
                        .map(function (n) {
                            return { id: n.repo.id, name: n.repo.name, displayName: n.repo.displayName || n.repo.name,
                                description: n.repo.description, url: n.repo.url,
                                crumb: [n.domain, n.language].filter(Boolean).join(' \u00b7 ') };
                        })
                });
            }
            function readerOpen() { return !!window.SiteReader && SiteReader.isOpen(); }

            // A factory over el and the reader hook, so call sites are unchanged.
            var panel = CBPanel.create(CBDom, { openReader: openReader,
                reportSet: reportSet, onNodeClick: onNodeClick, applyFilters: applyFilters }, g);
            var showInfo = panel.showInfo, hoverCard = panel.hoverCard,
                renderFindings = panel.renderFindings;

            el.infoClose.addEventListener('click', clearFocus);
            var infoMin = document.getElementById('info-min');
            infoMin.addEventListener('click', function () {
                var collapsed = el.info.classList.toggle('collapsed');
                infoMin.textContent = collapsed ? '+' : '–';
                infoMin.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            });
            document.addEventListener('keydown', function (e) {
                var ae = document.activeElement;
                if (ae === el.search || (ae && (ae.tagName === 'SELECT' || ae.type === 'range'))) return;
                // Esc closes the reader first: resetting the graph underneath a
                // dialog the reader cannot see would be a surprise.
                if (e.key === 'Escape' && readerOpen()) return;   // reader.js handles it
                if (e.key === 'Escape') { clearFocus(); doReset(); }
                else if (e.key === 'ArrowRight') stepNeighbor(1);
                else if (e.key === 'ArrowLeft') stepNeighbor(-1);
            });

            function locate(term) {
                term = (term || '').trim().toLowerCase(); if (!term) return;
                var hit = nodes.find(function (n) { return n.kind === 'repo' && n.name.toLowerCase().indexOf(term) !== -1; });
                if (hit) onNodeClick(hit); else toast('No repo matches “' + term + '”.');
            }
            el.search.addEventListener('keydown', function (e) { if (e.key === 'Enter') locate(el.search.value); });

            var legendToggle = document.getElementById('legend-toggle');
            legendToggle.addEventListener('click', function () {
                var hidden = el.legend.style.display === 'none';
                el.legend.style.display = hidden ? '' : 'none';
                legendToggle.textContent = hidden ? 'Hide key' : 'Show key';
                legendToggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
            });

            // Collapse the whole control dock to a single title line and back.
            var dockEl = document.querySelector('.dock');
            var dockToggle = document.getElementById('dock-toggle');
            dockToggle.addEventListener('click', function () {
                var collapsed = dockEl.classList.toggle('collapsed');
                dockToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                dockToggle.title = collapsed ? 'Expand controls' : 'Collapse controls';
            });

            function doReset() {
                el.search.value = ''; el.fDomain.value = ''; el.fSize.value = ''; el.fLang.value = '';
                nodes.filter(function (n) { return n.kind === 'repo' && n.dived; }).forEach(collapse);
                // Back to the computed layout: nothing to re-simulate.
                CBLayout.place(nodes, layoutKey());
                redraw();
                applyFilters();
                Graph.cameraPosition({ x: 0, y: 0, z: 1600 }, { x: 0, y: 0, z: 0 }, 900);
                setTimeout(function () { fitAll(700); }, 950);
            }
            el.reset.addEventListener('click', doReset);

            // Read-only handle for the run-skill's regression loop, which asserts that
            // growing a repo does not re-lay-out the estate. Exposes no setters.
            window.__codeBrain = {
                positions: function () {
                    var out = {};
                    nodes.forEach(function (n) {
                        if (n.kind === 'repo' || n.kind === 'lang' || n.kind === 'domain') out[n.id] = [n.x, n.y, n.z];
                    });
                    return out;
                },
                grow: function (id) { var n = nodeById[id]; if (n && n.kind === 'repo') { onNodeClick(n); diveInto(n); return n.id; } return null; },
                // Where a grown structure sits relative to its repo, for the loop's
                // check that dives stay attached instead of flying off the plane.
                grown: function (id) {
                    var r = nodeById[id]; if (!r) return null;
                    var kids = nodes.filter(function (n) { return n.parentRepo === id; });
                    var far = 0;
                    kids.forEach(function (n) { far = Math.max(far, Math.hypot((n.x || 0) - r.x, (n.y || 0) - r.y, (n.z || 0) - r.z)); });
                    return { count: kids.length, repo: [r.x, r.y, r.z].map(Math.round), farthest: Math.round(far) };
                },
                firstRepo: function () {
                    var r = nodes.filter(function (n) { return n.kind === 'repo' && n.files > 40; })[0];
                    return r ? r.id : null;
                }
            };

            // Deep links. Old Code Graph URLs redirect here with ?view=semantic,
            // and blog posts link ?repo=<id> to open a repository directly.
            var qs = new URLSearchParams(location.search);
            var wantRepo = qs.get('repo');
            if (qs.get('view') === 'semantic') setView('semantic', true);
            if (wantRepo) {
                var hit = nodeById['repo:' + wantRepo] || nodes.find(function (n) {
                    return n.kind === 'repo' && n.name.toLowerCase() === wantRepo.toLowerCase();
                });
                if (hit) setTimeout(function () { onNodeClick(hit); }, 1500);
            }

            // Fit early (warm-up has already placed most nodes) and again once
            // the layout settles, with a tight margin so the estate fills the canvas.
            if (!wantRepo) setTimeout(function () { if (!currentFocus) fitAll(0); }, 60);
            updateNeighborUI();
            el.loading.style.display = 'none';
        }
    })();
