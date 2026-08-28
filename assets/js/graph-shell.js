/*
 * graph-shell.js - the graph mechanics both pages share.
 *
 * Code Brain and Code Graph render the same library over the same node kinds
 * with the same chrome, and were built from a common ancestor. The honest
 * finding after comparing them function by function is that most of the
 * divergence is real: their build() bodies differ by 2,500 characters because
 * one dives into files and modules and the other lays repositories out by
 * meaning, and computeHighlight differs because the two graphs mean different
 * things by "adjacent". Forcing those into one function behind a config object
 * would produce something harder to read than the two it replaced.
 *
 * What is genuinely common is the mechanical part: sizing the canvas to its
 * container, and moving the camera to a node. Both were copied verbatim, and
 * the canvas one was copied along with the bug comment explaining why it exists.
 *
 * So this file is small on purpose. It holds what both pages provably want,
 * not everything that looked similar. Compare graph-shell.css, where the same
 * comparison found 39 rules that were byte-identical.
 */
(function (global) {
    'use strict';

    /*
     * force-graph sizes itself from the window, but the canvas lives in a grid
     * cell narrower than the viewport. Left alone the canvas was 1440x757 inside
     * a 1060x701 box, so every pointer coordinate was offset: clicks selected the
     * wrong node and zoom felt wrong. Drive the size from the container instead,
     * and keep it in step as the container changes.
     */
    function fitToContainer(Graph, box) {
        if (!box) return function () {};
        function fit() {
            var r = box.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) Graph.width(r.width).height(r.height);
        }
        fit();
        if (global.ResizeObserver) new global.ResizeObserver(fit).observe(box);
        global.addEventListener('resize', fit);
        return fit;
    }

    /*
     * Fly the camera to a node along its own vector from the origin, stopping
     * `pad` short of it. The two pages differ only in how far to stop and how
     * long to take, so those are arguments rather than two copies of the maths.
     */
    function flyTo(Graph, node, pad, ms) {
        if (!node) return;
        var d = Math.hypot(node.x || 1, node.y || 1, node.z || 1) || 1;
        var r = 1 + (pad || 130) / d;
        Graph.cameraPosition(
            { x: (node.x || 0) * r, y: (node.y || 0) * r, z: (node.z || 0) * r },
            node, ms || 1300
        );
    }

    /*
     * Collapse the rail, and remember the choice.
     *
     * Both pages put the readout, the controls and the deck in one column
     * beside the graph, which is a lot of screen to hold while reading a graph
     * that wants all of it. Collapsing sets a class on the plate and the grid
     * track does the rest - the canvas needs no resize call, because
     * fitToContainer observes the stage and changing the track fires that
     * observer.
     *
     * Self-starting rather than called from the page scripts: it needs nothing
     * from them, and both were within a few lines of the file-size cap.
     */
    function initRailToggle() {
        var plate = document.querySelector('.plate');
        var btn = document.getElementById('rail-toggle');
        if (!plate || !btn) return;
        var KEY = 'graph-rail-collapsed';

        function apply(off) {
            plate.classList.toggle('rail-off', off);
            btn.setAttribute('aria-expanded', off ? 'false' : 'true');
            btn.title = off ? 'Show panel' : 'Hide panel';
            btn.setAttribute('aria-label', btn.title);
        }

        // A browser with storage disabled must still get a working button.
        var saved = false;
        try { saved = localStorage.getItem(KEY) === '1'; } catch (e) {}
        apply(saved);

        btn.addEventListener('click', function () {
            var off = !plate.classList.contains('rail-off');
            apply(off);
            try { localStorage.setItem(KEY, off ? '1' : '0'); } catch (e) {}
        });
    }

    /*
     * The plate is pinned below the fixed nav, and both pages had that offset
     * written as 56px while the nav renders at 68 - so the readout header sat
     * under the nav, clipped, on every load. Measuring it removes the guess and
     * survives the nav changing height at a breakpoint.
     */
    function syncNavHeight() {
        var nav = document.querySelector('nav.cg-nav');
        if (!nav) return;
        function set() {
            // Ceil, not round: the nav measures 68.05px, and rounding down
            // leaves the plate a sub-pixel under it.
            var h = Math.ceil(nav.getBoundingClientRect().height);
            if (h > 0) document.documentElement.style.setProperty('--nav-h', h + 'px');
        }
        set();
        if (global.ResizeObserver) new global.ResizeObserver(set).observe(nav);
        global.addEventListener('resize', set);
    }

    function boot() { syncNavHeight(); initRailToggle(); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    global.GraphShell = {
        fitToContainer: fitToContainer, flyTo: flyTo, initRailToggle: initRailToggle
    };
})(window);
