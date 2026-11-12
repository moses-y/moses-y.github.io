/*
 * cb-layout.js - where every node sits, settled once and then frozen.
 *
 * The graph used to let a force simulation run live on every page load, which
 * is what made the estate burst out of the origin and drift while you tried to
 * click it. The 3D look was right; running it in front of the visitor was not.
 *
 *   treePos  the 3D domain -> language -> repo layout. The simulation runs
 *            entirely before the first frame (warmup), from d3's deterministic
 *            starting spiral, so it is the same on every visit. It is then
 *            captured and every node is pinned.
 *   semPos   the UMAP coordinates the pipeline already computes offline.
 *
 * Physics afterwards runs only for the module nodes a dive grows, and switching
 * views is a short tween between the two position sets instead of a re-run.
 */
(function (global) {
    'use strict';

    var SEM_SPREAD = 1100;

    // three r168 matches what 3d-force-graph@1.73.4 bundles; a different copy
    // draws meshes but silently drops textures, so the labels vanished. It is
    // an ES module only, hence the dynamic import. If it fails the page still
    // works and hubs fall back to plain spheres.
    var THREE = null;
    var ready = import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.min.js')
        .then(function (m) { THREE = m; })
        .catch(function (e) { console.warn('three unavailable, hubs drawn as spheres', e); });

    // UMAP positions, available before the tree has settled.
    // Also counts repos per language hub, which decides which get a label.
    function computeSemantic(nodes, nodeById) {
        nodes.forEach(function (n) {
            if (n.kind !== 'repo') return;
            var hub = nodeById['lang:' + n.domain + '|' + n.language];
            if (hub) hub.repoCount = (hub.repoCount || 0) + 1;
            var u = n.repo && n.repo.umap;
            n.semPos = (Array.isArray(u) && u.length === 3)
                ? [(u[0] - 0.5) * SEM_SPREAD, (u[1] - 0.5) * SEM_SPREAD, (u[2] - 0.5) * SEM_SPREAD]
                : null;
        });
    }

    // Freeze the settled 3D tree as each node's home position.
    function captureTree(nodes) {
        nodes.forEach(function (n) {
            if (n.parentRepo || typeof n.x !== 'number') return;
            n.treePos = [n.x, n.y, n.z];
        });
    }

    /*
     * Phase 1, before the first frame (the caller sets warmupTicks and
     * cooldownTicks(0)): the 3D layout forces. Hubs push apart hard, repos
     * gently, and short leaf links keep each language a loose cloud.
     *
     * Phase 2, when warm-up ends: freeze that layout as every node's home and
     * hand physics to grown structure only. Pinned nodes carry no charge and
     * there is no centring force; either one flung grown modules thousands of
     * units away from their repo.
     */
    function settle(Graph, nodes, nodeById, ready) {
        function kindOf(x) { var n = typeof x === 'object' ? x : nodeById[x]; return n ? n.kind : ''; }
        Graph.d3Force('link')
            .distance(function (l) {
                var a = kindOf(l.source), b = kindOf(l.target);
                return (a === 'root' || b === 'root') ? 240 : (a === 'domain' || b === 'domain') ? 110 : 46;
            })
            .strength(0.6);
        Graph.d3Force('charge')
            .strength(function (n) { return n.kind === 'root' ? -900 : n.kind === 'domain' ? -700 : n.kind === 'lang' ? -180 : -28; })
            .distanceMax(520);

        var done = false;
        Graph.onEngineStop(function () {
            if (done) return;
            done = true;
            captureTree(nodes);
            place(nodes, 'treePos');
            Graph.d3Force('link')
                .distance(function (l) { return l.kind === 'sim' ? 40 : l._dive ? 16 : 30; })
                .strength(function (l) { return l._dive ? 0.9 : 0; });
            Graph.d3Force('charge')
                .strength(function (n) { return (n.kind === 'dir' || n.kind === 'file' || n.kind === 'module') ? -22 : 0; })
                .distanceMax(160);
            Graph.d3Force('center', null);
            Graph.cooldownTicks(Infinity).cooldownTime(4000);
            ready();
        });
    }

    function posOf(n, key) { return n[key] || n.treePos; }

    // Pin immediately, without animation. Used on load and on reset.
    function place(nodes, key) {
        nodes.forEach(function (n) {
            var p = n.treePos ? posOf(n, key) : null;
            if (!p) return;
            n.x = n.fx = p[0]; n.y = n.fy = p[1]; n.z = n.fz = p[2];
            n.vx = n.vy = n.vz = 0;
        });
    }

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /*
     * Glide every pinned node to the other layout. The simulation is kept
     * ticking for the duration because that is what copies fx into the drawn
     * position; with everything pinned, each tick is just that copy.
     */
    var running = null;
    function morph(Graph, nodes, key, ms, done) {
        if (running) cancelAnimationFrame(running);
        var moving = nodes.filter(function (n) { return n.treePos; }).map(function (n) {
            var to = posOf(n, key);
            return { n: n, from: [n.fx != null ? n.fx : n.x || 0, n.fy != null ? n.fy : n.y || 0, n.fz != null ? n.fz : n.z || 0], to: to };
        });
        var start = performance.now();
        Graph.cooldownTime(ms + 400);
        if (Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
        (function step(now) {
            var k = Math.min(1, (now - start) / ms), e = ease(k);
            moving.forEach(function (m) {
                var n = m.n;
                n.fx = m.from[0] + (m.to[0] - m.from[0]) * e;
                n.fy = m.from[1] + (m.to[1] - m.from[1]) * e;
                n.fz = m.from[2] + (m.to[2] - m.from[2]) * e;
            });
            if (k < 1) running = requestAnimationFrame(step);
            else { running = null; if (done) done(); }
        })(start);
    }

    // ---- labels for domain and language hubs --------------------------------
    function label(text, color, height) {
        var c = document.createElement('canvas'), ctx = c.getContext('2d');
        var font = '600 56px Inter, system-ui, sans-serif';
        ctx.font = font;
        c.width = Math.ceil(ctx.measureText(text).width) + 24; c.height = 76;
        ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle';
        ctx.fillText(text, 12, 40);
        var tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        // sizeAttenuation off: a constant size on screen. Sized in world units,
        // labels were unreadable from afar and filled the view up close.
        var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
        spr.scale.set(height * c.width / c.height, height, 1);
        return spr;
    }

    // A floating name above each domain hub, and above languages big enough to
    // matter, so the 3D estate is readable without hovering. Added to the
    // default sphere (nodeThreeObjectExtend), not instead of it.
    function hubLabel(n, radius) {
        if (!THREE || (n.kind !== 'domain' && n.kind !== 'lang')) return null;
        if (n.kind === 'lang' && !(n.repoCount >= 40)) return null;
        // Fractions of the viewport height, since the sprite ignores distance.
        var h = n.kind === 'domain' ? 0.032 : 0.02;
        var t = label(n.name, n.color, h);
        t.position.set(0, radius + 6, 0);
        return t;
    }

    global.CBLayout = { ready: ready, computeSemantic: computeSemantic, captureTree: captureTree, settle: settle,
        place: place, morph: morph, hubLabel: hubLabel };
})(window);
