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

        // Keep the info panel docked just below the (wrapping) control bar, so a
        // multi-row dock at medium widths never overlaps it.
        // The dock is in the rail now; the panel is positioned by CSS against the stage.

        // Which repos have a full architecture report (analyzed deep graph).
        var reportSet = {};
        fetch('structure/reports.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
            .then(function (list) { (list || []).forEach(function (r) { reportSet[String(r.id)] = r; }); });

        IndexRecord.loadEstate().then(build)
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

            // Legend = domains (the primary framing)
            function buildLegend() { CBData.buildLegend(g); }
            buildLegend();
            // Grade replaces the domain colour rather than joining it. Same
            // module and same legend as Code Graph.
            var gradeOn = GraphGrade.attach({
                button: document.getElementById('grade-toggle'), legend: el.legend,
                offLabel: 'Colour by domain', restore: buildLegend,
                onChange: function () { Graph.nodeColor(Graph.nodeColor()); }
            });
            // ---- 3D graph ----
            var highlightNodes = new Set(), highlightLinks = new Set();

            var Graph = ForceGraph3D({ controlType: 'orbit' })(document.getElementById('graph'))
                .backgroundColor('#06070f')
                .graphData({ nodes: nodes, links: links })
                .nodeLabel(hoverCard)
                .nodeVal('val')
                .nodeRelSize(2)
                .nodeColor(function (n) {
                    if (highlightNodes.size && !highlightNodes.has(n.id)) return 'rgba(120,130,160,0.10)';
                    // gradeOn is assigned below, after the graph exists.
                    return (gradeOn && gradeOn()) ? GraphGrade.colorOf(n) : n.color;
                })
                .nodeVisibility(function (n) { return n._vis !== false; })
                .nodeOpacity(0.95)
                .nodeResolution(10)
                .linkVisibility(function (l) { var s = idOf(l.source), t = idOf(l.target); return nodeVis(s) && nodeVis(t); })
                .linkColor(function (l) {
                    if (!highlightLinks.size) return l._dive ? 'rgba(52,224,196,0.25)' : 'rgba(160,170,200,0.16)';
                    return highlightLinks.has(linkId(l)) ? ACCENT3 : 'rgba(120,130,160,0.05)';
                })
                .linkWidth(function (l) { return highlightLinks.has(linkId(l)) ? 1.6 : (l._dive ? 0.6 : 0.4); })
                .linkDirectionalParticles(function (l) { return highlightLinks.has(linkId(l)) ? 2 : 0; })
                .linkDirectionalParticleSpeed(0.006)
                .onNodeClick(onNodeClick)
                .onNodeRightClick(function (node) { if (node.kind === 'repo') diveInto(node); })
                .onBackgroundClick(clearFocus);

            GraphShell.fitToContainer(Graph, document.getElementById('graph'));


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
            controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
            var spinning = true;
            controls.addEventListener('start', function () { if (spinning) { controls.autoRotate = false; spinning = false; } });

            function idOf(x) { return typeof x === 'object' ? x.id : x; }
            function nodeVis(id) { var n = nodeById[id]; return !n || n._vis !== false; }
            function linkId(l) { return idOf(l.source) + '>' + idOf(l.target); }

            // ---------- Filters ----------
            function applyFilters() {
                var dom = el.fDomain.value, size = el.fSize.value;
                function sizeOk(f) {
                    if (!size) return true;
                    if (size === 's') return f <= 20; if (size === 'm') return f > 20 && f <= 100; return f > 100;
                }
                // repos first
                var anyLang = {}, anyDom = {};
                nodes.forEach(function (n) {
                    if (n.kind !== 'repo') return;
                    var ok = (!dom || n.domain === dom) && sizeOk(n.files || 0);
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

            // ---------- Highlight ----------
            function computeHighlight(id) {
                highlightNodes.clear(); highlightLinks.clear();
                if (id) {
                    highlightNodes.add(id);
                    (adjacency[id] || []).forEach(function (nb) { highlightNodes.add(nb); });
                    links.forEach(function (l) { var s = idOf(l.source), t = idOf(l.target); if (s === id || t === id) highlightLinks.add(linkId(l)); });
                }
                refresh();
            }
            function refresh() {
                Graph.nodeColor(Graph.nodeColor()).linkColor(Graph.linkColor()).linkWidth(Graph.linkWidth()).linkDirectionalParticles(Graph.linkDirectionalParticles());
            }

            function flyTo(node, pad) { GraphShell.flyTo(Graph, node, pad, 1300); }

            // ---------- Dive: grow a repo's inner structure as tendrils ----------
            var currentFocus = null;
            function onNodeClick(node) {
                spinning = false; controls.autoRotate = false;
                currentFocus = node;
                computeHighlight(node.id);
                flyTo(node, node.kind === 'repo' ? 150 : node.kind === 'domain' ? 260 : 120);
                showInfo(node);
                deckSync(node);
            }
            function clearFocus() {
                currentFocus = null; computeHighlight(null); el.info.classList.remove('open');
            }

            // Graphify-style community detection: label propagation over the module
            // subgraph groups tightly-coupled modules, then colors each community.
            var colorByCommunity = CBData.colorByCommunity;


            function fetchStructure(repoNode) {
                // Prefer the LLM-analyzed deep dependency graph; fall back to the file tree.
                var deepFile = repoNode.structFile.replace(/\.json$/, '.deep.json');
                function fileTree() { return fetch(repoNode.structFile).then(function (r2) { if (!r2.ok) throw new Error('no structure'); return r2.json(); }); }
                return fetch(deepFile).then(function (r) {
                    if (!r.ok) return fileTree();
                    return r.json().then(function (d) {
                        // Use the analyzed deep graph only if it actually has nodes; a
                        // skipped/empty stub (giant repo, no source) falls back to the file tree.
                        return (d && d.nodes && d.nodes.length) ? d : fileTree();
                    });
                });
            }

            // Re-supplying graphData reheats the whole simulation, so growing one repo
            // re-laid-out all 1296 of them and the estate appeared to explode. Pinning
            // everything that already has a position means only the new structure
            // settles; the map the user was reading stays exactly where it was.
            function pinExisting() {
                nodes.forEach(function (n) {
                    if (typeof n.x === 'number') { n.fx = n.x; n.fy = n.y; n.fz = n.z; }
                });
            }
            function unpinAll() {
                nodes.forEach(function (n) { delete n.fx; delete n.fy; delete n.fz; });
            }

            function diveInto(repoNode) {
                if (repoNode.dived) { flyTo(repoNode, 90); return; }
                el.diveBtn.disabled = true; el.diveBtn.textContent = 'Loading…';
                fetchStructure(repoNode)
                    .then(function (s) {
                        if (s.empty || !s.nodes || !s.nodes.length) { toast('No structure available for this repo yet.'); return; }
                        var pfx = repoNode.id + '::';
                        var newNodes = [], newLinks = [];
                        var isModule = s.nodes[0].kind === 'module';
                        s.nodes.forEach(function (n) {
                            var gid = pfx + n.id;
                            var val = n.kind === 'dir' ? 1.6 : n.kind === 'module' ? Math.max(1.5, Math.min(9, 1.5 + (n.ca + n.ce) / 4)) : 2.2;
                            var node = { id: gid, kind: n.kind, name: n.name, full: n.full || n.name, lang: n.lang,
                                ca: n.ca, ce: n.ce, inst: n.inst, parentRepo: repoNode.id, val: val };
                            node.color = structColor(node);
                            newNodes.push(node); addNode(node);
                        });
                        // internal edges
                        s.links.forEach(function (l) {
                            var s2 = (l.s === '__repo__') ? repoNode.id : pfx + l.s;
                            var t2 = (l.t === '__repo__') ? repoNode.id : pfx + l.t;
                            if (!nodeById[s2] || !nodeById[t2]) return;
                            newLinks.push({ source: s2, target: t2, _dive: true }); addLink(s2, t2);
                        });
                        // roots (no incoming from within) connect to the repo node -> tendrils sprout
                        var hasParent = {};
                        newLinks.forEach(function (l) { if (idOf(l.target) !== repoNode.id) hasParent[idOf(l.target)] = 1; });
                        newNodes.forEach(function (n) { if (!hasParent[n.id]) { newLinks.push({ source: repoNode.id, target: n.id, _dive: true }); adjacency[repoNode.id].push(n.id); adjacency[n.id].push(repoNode.id); } });

                        // Colour module graphs by detected community (Graphify-style);
                        // file/dir trees keep their language/kind colours.
                        var nComm = 0;
                        if (isModule) nComm = colorByCommunity(newNodes, newLinks);
                        // Clear the repo-focus dimming so the grown structure shows in full colour.
                        highlightNodes.clear(); highlightLinks.clear();
                        pinExisting();
                        newNodes.forEach(function (n) {
                            // Start the new nodes on their parent so they grow outward
                            // from it rather than flying in from the origin.
                            delete n.fx; delete n.fy; delete n.fz;
                            n.x = (repoNode.x || 0) + (Math.random() - 0.5) * 12;
                            n.y = (repoNode.y || 0) + (Math.random() - 0.5) * 12;
                            n.z = (repoNode.z || 0) + (Math.random() - 0.5) * 12;
                        });
                        Graph.graphData({ nodes: nodes, links: links });
                        refresh();
                        repoNode.dived = true;
                        repoNode.communities = nComm;
                        if (s.findings) { repoNode.findings = s.findings; repoNode.totals = s.totals; repoNode.scope = s.scope; repoNode.hasDeep = !!(s.deep && s.nodes && s.nodes.length); renderFindings(repoNode); }
                        el.collapseBtn.style.display = ''; el.diveBtn.textContent = '↴ Grown';
                        var kind = isModule ? (s.shown + ' modules · ' + s.edges + ' imports · ' + nComm + ' communities') : (newNodes.length + ' files/dirs');
                        toast('Grew ' + kind + (s.truncated ? ' (partial)' : ''));
                        setTimeout(function () { flyTo(repoNode, 120); }, 400);
                    })
                    .catch(function (e) {
                        // The toast stays user-facing, but the error reaches the
                        // console. Discarding it entirely meant a code fault in this
                        // path presented as missing data, which cost a debugging
                        // round during the split of this file.
                        console.error('dive failed', e);
                        toast('Structure not generated for this repo yet.');
                    })
                    .then(function () { el.diveBtn.disabled = false; if (!nodeById[currentFocus && currentFocus.id] || !currentFocus.dived) el.diveBtn.textContent = '↴ Grow structure'; });
            }

            function collapse(repoNode) {
                if (!repoNode.dived) return;
                var drop = {};
                nodes = nodes.filter(function (n) { if (n.parentRepo === repoNode.id) { drop[n.id] = 1; delete nodeById[n.id]; delete adjacency[n.id]; return false; } return true; });
                links = links.filter(function (l) { return !drop[idOf(l.source)] && !drop[idOf(l.target)]; });
                Object.keys(adjacency).forEach(function (k) { adjacency[k] = adjacency[k].filter(function (x) { return !drop[x]; }); });
                repoNode.dived = false;
                pinExisting();
                Graph.graphData({ nodes: nodes, links: links });
                el.collapseBtn.style.display = 'none'; el.diveBtn.textContent = '↴ Grow structure';
                computeHighlight(repoNode.id);
            }

            el.diveBtn.addEventListener('click', function () { if (currentFocus && currentFocus.kind === 'repo') diveInto(currentFocus); });
            el.collapseBtn.addEventListener('click', function () { if (currentFocus && currentFocus.kind === 'repo') collapse(currentFocus); });

            // The side panel is a summary, not the report. It used to render a
            // dozen full findings into a 330px column, which is what turned it
            // into an endless scroll; the detail lives in the reader now.

            // ---- reader ------------------------------------------------------
            // Shared with Projects via assets/js/reader.js. This page used to
            // carry its own copy, which meant the two drifted the moment the
            // reader gained backdrop-close, arrow keys and next-article.
            // The graph keeps drifting behind the column while it is open.
            var spinBeforeReader = null;

            function readerQueue() {
                // Whatever the current filters leave visible, in deck order, so
                // reading straight through follows the estate the visitor built.
                return nodes.filter(function (n) { return n.kind === 'repo' && n.repo; })
                    .map(function (n) {
                        return {
                            id: n.repo.id, name: n.repo.name,
                            displayName: n.repo.displayName || n.repo.name,
                            description: n.repo.description, url: n.repo.url,
                            crumb: [n.domain, n.language].filter(Boolean).join(' \u00b7 ')
                        };
                    });
            }

            function openReader(repo, node) {
                if (!repo || repo.id == null || !window.SiteReader) return;
                SiteReader.open({
                    id: repo.id, name: repo.name,
                    displayName: repo.displayName || repo.name,
                    description: repo.description, summary: repo.summary, url: repo.url,
                    crumb: [node && node.domain, node && node.language].filter(Boolean).join(' \u00b7 '),
                    queue: readerQueue(),
                    onOpen: function () {
                        if (spinBeforeReader === null) spinBeforeReader = controls.autoRotate;
                        controls.autoRotate = true;
                        controls.autoRotateSpeed = 0.22;
                    },
                    onClose: function () {
                        if (spinBeforeReader !== null) {
                            controls.autoRotate = spinBeforeReader;
                            controls.autoRotateSpeed = 0.5;
                            spinBeforeReader = null;
                        }
                    }
                });
            }

            function closeReader() { if (window.SiteReader) SiteReader.close(); }
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
                if (document.activeElement === el.search) return;
                // Esc closes the reader first: resetting the graph underneath a
                // dialog the reader cannot see would be a surprise.
                if (e.key === 'Escape' && readerOpen()) return;   // reader.js handles it
                if (e.key === 'Escape') { clearFocus(); doReset(); }
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
                el.legend.style.display = hidden ? 'flex' : 'none';
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
                el.search.value = ''; el.fDomain.value = ''; el.fSize.value = '';
                nodes.filter(function (n) { return n.kind === 'repo' && n.dived; }).forEach(collapse);
                // Reset is the one place the layout should be free to re-form.
                unpinAll();
                applyFilters();
                Graph.cameraPosition({ x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: 0 }, 1300);
                controls.autoRotate = true; spinning = true;
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
                firstRepo: function () {
                    var r = nodes.filter(function (n) { return n.kind === 'repo' && n.files > 40; })[0];
                    return r ? r.id : null;
                }
            };

            Graph.onEngineStop(function () { Graph.zoomToFit(800, 130); Graph.onEngineStop(function () {}); });
            el.loading.style.display = 'none';
        }
    })();
