/*
 * cb-layout.js - where every node sits, computed rather than simulated.
 *
 * The graph used to let a force simulation find positions on every page load.
 * That is what made the estate burst out of the origin, drift while you tried
 * to click it, and pack each big language into one overlapping ball: physics
 * only approximates a tree. Both views are now exact and deterministic:
 *
 *   treePos  circle packing (d3.pack) of domain -> language -> repo. Domains
 *            and languages are drawn as rings, repos as dots inside them.
 *   semPos   the UMAP coordinates the pipeline already computes offline.
 *
 * Every repo, domain and language node is pinned (fx/fy/fz) to one of these.
 * Physics now runs only for the module nodes a dive grows, and switching views
 * is a short tween between the two position sets instead of a re-simulation.
 */
(function (global) {
    'use strict';

    var PACK_SIZE = 1400, SEM_SPREAD = 1100;

    // three r168 matches what 3d-force-graph@1.73.4 bundles; a different copy
    // renders rings but silently drops textures, so the labels vanished. It is
    // an ES module only, hence the dynamic import. If it fails the page still
    // works and hubs fall back to plain spheres.
    var THREE = null;
    var ready = import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.min.js')
        .then(function (m) { THREE = m; })
        .catch(function (e) { console.warn('three unavailable, hubs drawn as spheres', e); });

    function byCountThenName(a, b) {
        return (b.value - a.value) || String(a.data.name).localeCompare(String(b.data.name));
    }

    function compute(nodes) {
        var d3 = global.d3;
        var domains = nodes.filter(function (n) { return n.kind === 'domain'; });
        var langs = nodes.filter(function (n) { return n.kind === 'lang'; });
        var repos = nodes.filter(function (n) { return n.kind === 'repo'; });

        var tree = {
            name: '', children: domains.map(function (d) {
                return {
                    name: d.name, node: d, children: langs.filter(function (l) { return l.domain === d.name; })
                        .map(function (l) {
                            return {
                                name: l.name, node: l, children: repos.filter(function (r) {
                                    return r.domain === d.name && r.language === l.name;
                                }).map(function (r) { return { name: r.name, node: r }; })
                            };
                        })
                };
            })
        };
        var h = d3.hierarchy(tree).sum(function (d) { return d.children ? 0 : 1; }).sort(byCountThenName);
        d3.pack().size([PACK_SIZE, PACK_SIZE])
            .padding(function (d) { return d.depth === 0 ? 28 : d.depth === 1 ? 12 : 2.5; })(h);
        h.each(function (d) {
            var n = d.data.node;
            if (!n) return;
            n.treePos = [d.x - PACK_SIZE / 2, PACK_SIZE / 2 - d.y, 0];
            n.packR = d.r;
        });

        repos.forEach(function (n) {
            var u = n.repo && n.repo.umap;
            n.semPos = (Array.isArray(u) && u.length === 3)
                ? [(u[0] - 0.5) * SEM_SPREAD, (u[1] - 0.5) * SEM_SPREAD, (u[2] - 0.5) * SEM_SPREAD]
                : null;
        });
    }

    function posOf(n, key) { return n[key] || n.treePos; }

    // Pin immediately, without animation. Used on load and on reset.
    function place(nodes, key) {
        nodes.forEach(function (n) {
            var p = n.kind === 'root' ? [0, 0, 0] : (n.treePos ? posOf(n, key) : null);
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

    // ---- rings and labels for domain and language nodes --------------------
    function label(text, color, height) {
        var c = document.createElement('canvas'), ctx = c.getContext('2d');
        var font = '600 56px Inter, system-ui, sans-serif';
        ctx.font = font;
        c.width = Math.ceil(ctx.measureText(text).width) + 24; c.height = 76;
        ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle';
        ctx.fillText(text, 12, 40);
        var tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        spr.scale.set(height * c.width / c.height, height, 1);
        return spr;
    }

    function hubObject(n) {
        if (!THREE || !n.packR || (n.kind !== 'domain' && n.kind !== 'lang')) return null;
        var isDomain = n.kind === 'domain';
        var g = new THREE.Group();
        var w = isDomain ? 2.2 : 1.1;
        var ring = new THREE.Mesh(
            new THREE.RingGeometry(Math.max(0, n.packR - w), n.packR, isDomain ? 128 : 64),
            new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: isDomain ? 0.6 : 0.35,
                side: THREE.DoubleSide, depthWrite: false }));
        g.add(ring);
        var fill = new THREE.Mesh(
            new THREE.CircleGeometry(n.packR, isDomain ? 128 : 64),
            new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: isDomain ? 0.035 : 0.03,
                side: THREE.DoubleSide, depthWrite: false }));
        fill.position.z = -0.5;
        g.add(fill);
        // Domains always carry their name; languages only when their circle is
        // big enough to read, so 46 labels never pile up.
        if (isDomain || n.packR > 55) {
            var h = isDomain ? 30 : 13;
            var t = label(n.name, n.color, h);
            t.position.set(0, n.packR + h * 0.7, 0);
            g.add(t);
        }
        return g;
    }

    global.CBLayout = { ready: ready, compute: compute, place: place, morph: morph, hubObject: hubObject };
})(window);
