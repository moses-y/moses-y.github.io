/*
 * graph-grade.js - grade as a visual channel on both graph pages.
 *
 * The estate grades 1,432 of 1,433 repositories across eight weighted
 * categories, and until now that number appeared only as text in a panel you
 * had to open one repository at a time. A 1,433-node graph is exactly where a
 * quality gradient reads at a glance: not "what exists" but "where the rot is".
 *
 * Two rules this file exists to enforce, both of them the same rule:
 *
 *   An unaudited repository is not a bad one. It gets a colour outside the
 *   scale entirely - a hollow grey - because any position on a green-to-red
 *   ramp is a claim about quality that nothing measured supports. There is one
 *   such repository today and there were 497 in June; the treatment has to be
 *   right either way.
 *
 *   A partial grade says so. 396 repositories were graded without module-level
 *   analysis, so some categories scored neutral rather than measured. They keep
 *   their band colour and lose saturation, which is the difference between
 *   "this is a C" and "this is a C on incomplete evidence".
 *
 * Grade replaces the node colour rather than sitting beside it, so it is a
 * toggle: language and domain are what the graphs mean by default, and this is
 * a second question asked of the same picture.
 */
(function (global) {
    'use strict';

    /*
     * Bands, not a continuous ramp. A continuous scale invites reading a
     * two-point difference as meaningful, and the grade is not that precise -
     * the letter is what the rubric actually commits to.
     */
    var BANDS = [
        { at: 80, letter: 'A / B+', color: '#3FB27F' },
        { at: 70, letter: 'B',      color: '#7FB069' },
        { at: 60, letter: 'C+ / C', color: '#D9A441' },
        { at: 50, letter: 'C-',     color: '#D97D3F' },
        { at: 0,  letter: 'D / F',  color: '#C4503A' }
    ];
    var UNGRADED = '#4A4741';        // outside the scale on purpose
    var NON_REPO = 'rgba(120,130,160,0.10)';

    var map = null;

    function load() {
        if (map) return Promise.resolve(map);
        return fetch('data/grade-map.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (j) { map = j || { repos: {} }; return map; });
    }

    function bandFor(score) {
        for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i].at) return BANDS[i];
        return BANDS[BANDS.length - 1];
    }

    function entry(repoId) {
        return map && map.repos ? map.repos[String(repoId)] : null;
    }

    /*
     * Desaturate toward the page background rather than toward grey, so a
     * partial grade reads as the same colour seen through less evidence instead
     * of as a different colour entirely.
     */
    function fade(hex, amount) {
        var n = parseInt(hex.slice(1), 16);
        var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        var m = function (c) { return Math.round(c + (0x2A - c) * amount); };
        return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
    }

    // node -> colour, or null when this node is not a repository at all.
    function colorOf(node) {
        if (!node || node.kind !== 'repo') return NON_REPO;
        var id = String(node.id).replace(/^repo:/, '');
        var e = entry(id);
        if (!e) return UNGRADED;
        var band = bandFor(e[0]);
        return e[2] ? fade(band.color, 0.45) : band.color;
    }

    function labelOf(node) {
        if (!node || node.kind !== 'repo') return '';
        var e = entry(String(node.id).replace(/^repo:/, ''));
        if (!e) return 'not audited';
        return e[1] + ' ' + e[0] + (e[2] ? ' (partial)' : '');
    }

    /*
     * The legend has to carry the two exceptions, not just the ramp, because
     * the ramp is the part a reader can already guess.
     */
    function renderLegend(host) {
        if (!host) return;
        host.innerHTML = '';
        var rows = BANDS.map(function (b) { return [b.color, b.letter]; });
        rows.push([fade(BANDS[2].color, 0.45), 'partial evidence']);
        rows.push([UNGRADED, 'not audited - not a grade']);
        rows.forEach(function (r) {
            var d = document.createElement('div');
            d.className = 'row';
            var dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = r[0];
            d.appendChild(dot);
            d.appendChild(document.createTextNode(r[1]));
            host.appendChild(d);
        });
    }

    function summary() {
        if (!map) return '';
        return map.graded + ' graded, mean ' + map.mean;
    }

    /*
     * Both pages wire the toggle the same way - load the map, flip a flag, swap
     * the legend, repaint - and differ only in what their default legend is and
     * how they ask the graph to repaint. So the wiring lives here and they pass
     * those two things in.
     *
     * The map is fetched on first press rather than at load: most visits never
     * ask this question, and 37 KB is not worth spending on the ones that do not.
     */
    function attach(opts) {
        var button = opts.button;
        if (!button) return function () { return false; };
        var on = false;

        button.addEventListener('click', function () {
            load().then(function () {
                on = !on;
                button.setAttribute('aria-pressed', on ? 'true' : 'false');
                button.textContent = on ? opts.offLabel || 'Colour by default'
                                        : opts.onLabel || 'Colour by grade';
                if (on) renderLegend(opts.legend);
                else if (opts.restore) opts.restore();
                if (opts.onChange) opts.onChange(on);
            });
        });

        return function () { return on; };
    }

    global.GraphGrade = {
        load: load, colorOf: colorOf, labelOf: labelOf,
        renderLegend: renderLegend, summary: summary, attach: attach
    };
})(window);
