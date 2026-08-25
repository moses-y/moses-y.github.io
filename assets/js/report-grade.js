/*
 * report-grade.js - the graded scorecard at the top of the architecture report.
 *
 * Split out of report-render.js rather than added to it: the report renderer was
 * already near the size limit, and the grade is a self-contained band with its
 * own data source (data/grades.json, written by scripts/build-grade.js).
 *
 * The section leads with the letter because that is what a reader takes away,
 * then immediately shows the arithmetic underneath it - every axis with its
 * score, its weight, the evidence line the scorer produced, and the findings
 * that cost it points. A grade nobody can audit is just an opinion with a font.
 *
 * Exposes window.ReportGrade.section(grade) -> HTML string, '' when the
 * repository has not been graded.
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // The bar colour tracks the score, not the axis, so the eye finds the two
    // rows worth acting on before reading a single label.
    function band(score) {
        return score >= 80 ? 'good' : score >= 60 ? 'ok' : score >= 40 ? 'warn' : 'bad';
    }

    function row(c) {
        var pct = Math.max(1, Math.min(100, c.score));
        var charged = (c.charged || []).slice(0, 3).map(function (h) {
            return '<li>' + esc(h.title) + ' <span class="cost">&minus;' + h.cost + '</span></li>';
        }).join('');
        var rest = (c.charged || []).length - 3;

        return '<div class="grow' + (c.partial ? ' partial' : '') + '">' +
            '<div class="glabel">' + esc(c.label) +
                (c.partial ? '<span class="pflag" title="Scored without a module-level pass">partial</span>' : '') +
            '</div>' +
            '<div class="gtrack"><span class="gfill ' + band(c.score) + '" style="width:' + pct + '%"></span></div>' +
            '<div class="gscore ' + band(c.score) + '">' + c.score + '</div>' +
            '<div class="gweight">' + c.weight + '% of grade</div>' +
            '<div class="gwhy">' + esc(c.evidence) +
                (charged ? '<ul class="gcharged">' + charged +
                    (rest > 0 ? '<li class="gmore">and ' + rest + ' more</li>' : '') + '</ul>' : '') +
            '</div>' +
            '</div>';
    }

    function section(g) {
        if (!g || typeof g.score !== 'number') return '';

        var h = '<div class="sec"><span class="no">00</span> Grade ' +
            '<span class="qual">deterministic rubric, weighted by repository profile</span></div>';

        h += '<div class="gcard ' + band(g.score) + '">' +
            '<div class="gletter">' + esc(g.letter) + '</div>' +
            '<div class="gmeta">' + g.score + ' / 100 &middot; graded as <b>' + esc(g.profile) + '</b></div>' +
            '</div>';

        // The distance to the next letter is the only actionable sentence on the
        // card, so it leads the prose rather than sitting in a tooltip.
        if (g.next) {
            h += '<p class="gnext"><b>' + g.next.points + ' point' +
                (g.next.points === 1 ? '' : 's') + '</b> from a <b>' + esc(g.next.letter) + '</b>.</p>';
        }

        h += '<p class="note">This is the standard rubric, run unmodified, against the ' +
            'audit and the module-level analysis already published below. Every score here ' +
            'comes from a check that ran, and each one is reproducible from the same inputs. ' +
            'No language model is involved.</p>';

        if (g.partial) {
            h += '<p class="note warnnote">Axes marked <i>partial</i> were scored without a ' +
                'module-level pass, which is pending rather than clean. The grade will move once ' +
                'that analysis lands.</p>';
        }

        h += '<div class="grows">' + (g.categories || []).map(row).join('') + '</div>';
        return h;
    }

    global.ReportGrade = { section: section };
})(window);
