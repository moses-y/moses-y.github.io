/*
 * cb-dive.js - growing a repository's inner structure, and folding it away.
 *
 * Split out of code-brain.js when the controller passed the 500-line limit.
 * It works on the same arrays the controller draws (g.nodes, g.links), so
 * collapse filters them in place rather than reassigning: a reassignment here
 * would leave the controller drawing the old arrays.
 *
 * This is the one part of the page that still uses physics. Everything else is
 * pinned by cb-layout.js, so only the grown nodes move, held to their repo by
 * links tagged _dive.
 */
(function (global) {
    'use strict';

    function keepWhere(arr, pred) {
        var j = 0;
        for (var i = 0; i < arr.length; i++) if (pred(arr[i])) arr[j++] = arr[i];
        arr.length = j;
    }

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

    function create(ctx) {
        var g = ctx.g, el = ctx.el, toast = ctx.toast;
        var nodes = g.nodes, links = g.links, nodeById = g.nodeById, adjacency = g.adjacency;
        var idOf = ctx.idOf, linkId = ctx.linkId;

        // Re-supplying graphData restarts the simulation. Pinning everything that
        // has a position means only the new structure settles.
        function pinExisting() {
            nodes.forEach(function (n) {
                if (typeof n.x === 'number') { n.fx = n.x; n.fy = n.y; n.fz = n.z; }
            });
        }

        function diveInto(repoNode) {
            if (repoNode.dived) { ctx.flyTo(repoNode, 90); return; }
            el.diveBtn.disabled = true; el.diveBtn.textContent = 'Loading…';
            fetchStructure(repoNode)
                .then(function (s) {
                    if (s.empty || !s.nodes || !s.nodes.length) { toast('No structure available for this repo yet.'); return; }
                    var pfx = repoNode.id + '::';
                    var newNodes = [], newLinks = [];
                    var isModule = s.nodes[0].kind === 'module';
                    s.nodes.forEach(function (n) {
                        var val = n.kind === 'dir' ? 1.6 : n.kind === 'module' ? Math.max(1.5, Math.min(9, 1.5 + (n.ca + n.ce) / 4)) : 2.2;
                        var node = { id: pfx + n.id, kind: n.kind, name: n.name, full: n.full || n.name, lang: n.lang,
                            ca: n.ca, ce: n.ce, inst: n.inst, parentRepo: repoNode.id, val: val };
                        node.color = ctx.structColor(node);
                        newNodes.push(node); g.addNode(node);
                    });
                    s.links.forEach(function (l) {
                        var s2 = (l.s === '__repo__') ? repoNode.id : pfx + l.s;
                        var t2 = (l.t === '__repo__') ? repoNode.id : pfx + l.t;
                        if (!nodeById[s2] || !nodeById[t2]) return;
                        newLinks.push({ source: s2, target: t2, _dive: true }); g.addLink(s2, t2);
                    });
                    // Roots (no incoming edge from within) tether to the repo node.
                    var hasParent = {};
                    newLinks.forEach(function (l) { if (idOf(l.target) !== repoNode.id) hasParent[idOf(l.target)] = 1; });
                    newNodes.forEach(function (n) { if (!hasParent[n.id]) { newLinks.push({ source: repoNode.id, target: n.id, _dive: true }); g.addLink(repoNode.id, n.id); } });
                    // addLink stores its own plain copy of each link. Tag those
                    // copies: the drawn links and the only forces that still act
                    // key on _dive. Untagged, the grown nodes were hidden and free.
                    var grownIds = {}; newNodes.forEach(function (n) { grownIds[n.id] = 1; });
                    links.forEach(function (l) { if (grownIds[idOf(l.source)] || grownIds[idOf(l.target)]) l._dive = true; });

                    // Module graphs are coloured by detected community; file/dir
                    // trees keep their language/kind colours.
                    var nComm = isModule ? CBData.colorByCommunity(newNodes, newLinks) : 0;
                    // Spotlight the repo and what grew from it so the modules
                    // don't blend into neighbouring dots.
                    ctx.highlightNodes.clear(); ctx.highlightLinks.clear();
                    ctx.highlightNodes.add(repoNode.id);
                    newNodes.forEach(function (n) { ctx.highlightNodes.add(n.id); });
                    links.forEach(function (l) { if (l._dive && (grownIds[idOf(l.source)] || grownIds[idOf(l.target)])) ctx.highlightLinks.add(linkId(l)); });
                    pinExisting();
                    newNodes.forEach(function (n) {
                        // Start on the parent so the structure grows outward from it.
                        delete n.fx; delete n.fy; delete n.fz;
                        n.x = (repoNode.x || 0) + (Math.random() - 0.5) * 12;
                        n.y = (repoNode.y || 0) + (Math.random() - 0.5) * 12;
                        n.z = (repoNode.z || 0) + (Math.random() - 0.5) * 12;
                    });
                    ctx.redraw();
                    ctx.refresh();
                    repoNode.dived = true;
                    repoNode.communities = nComm;
                    if (s.findings) {
                        repoNode.findings = s.findings; repoNode.totals = s.totals; repoNode.scope = s.scope;
                        repoNode.hasDeep = !!(s.deep && s.nodes && s.nodes.length);
                        ctx.renderFindings(repoNode);
                    }
                    el.collapseBtn.style.display = ''; el.diveBtn.textContent = '↴ Grown';
                    var kind = isModule ? (s.shown + ' modules · ' + s.edges + ' imports · ' + nComm + ' communities') : (newNodes.length + ' files/dirs');
                    toast('Grew ' + kind + (s.truncated ? ' (partial)' : ''));
                    setTimeout(function () { ctx.flyTo(repoNode, 120); }, 400);
                })
                .catch(function (e) {
                    // Logged as well as toasted: a code fault here once presented as
                    // missing data and cost a debugging round.
                    console.error('dive failed', e);
                    toast('Structure not generated for this repo yet.');
                })
                .then(function () {
                    var f = ctx.getFocus();
                    el.diveBtn.disabled = false;
                    if (!f || !nodeById[f.id] || !f.dived) el.diveBtn.textContent = '↴ Grow structure';
                });
        }

        function collapse(repoNode) {
            if (!repoNode.dived) return;
            var drop = {};
            keepWhere(nodes, function (n) {
                if (n.parentRepo !== repoNode.id) return true;
                drop[n.id] = 1; delete nodeById[n.id]; delete adjacency[n.id]; return false;
            });
            keepWhere(links, function (l) { return !drop[idOf(l.source)] && !drop[idOf(l.target)]; });
            Object.keys(adjacency).forEach(function (k) { adjacency[k] = adjacency[k].filter(function (x) { return !drop[x]; }); });
            repoNode.dived = false;
            pinExisting();
            ctx.redraw();
            el.collapseBtn.style.display = 'none'; el.diveBtn.textContent = '↴ Grow structure';
            ctx.computeHighlight(repoNode.id);
        }

        el.diveBtn.addEventListener('click', function () { var f = ctx.getFocus(); if (f && f.kind === 'repo') diveInto(f); });
        el.collapseBtn.addEventListener('click', function () { var f = ctx.getFocus(); if (f && f.kind === 'repo') collapse(f); });

        return { diveInto: diveInto, collapse: collapse };
    }

    global.CBDive = { create: create };
})(window);
