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

    global.GraphShell = { fitToContainer: fitToContainer, flyTo: flyTo };
})(window);
