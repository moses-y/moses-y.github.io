/*
 * lib-blog-audit.js - the code health audit, on the article page.
 *
 * The audit is 59 deterministic checks and it was reaching report.html and the
 * in-page reader but never blog/*.html - lib-blog-analysis had no reference to
 * hygiene.json at all. Those article pages are what a search engine lands a
 * technical reader on, so the section answering "what would stop me shipping
 * this" was missing from the one place most people would read.
 *
 * Two decisions worth stating, because both are about not saying more than the
 * data supports:
 *
 * A repo with no entry in hygiene.json renders nothing. Not an empty section, not
 * a clean bill of health. 1,250 of 1,331 repositories are unaudited as this is
 * written, and "we found nothing" and "we have not looked" are different claims -
 * only one of them is ours to make. A repo that was audited and came back clean
 * says so explicitly, because that one is earned.
 *
 * The markup deliberately reuses the class names report-render.js already emits,
 * and the page links report.css rather than restyling them. Every rule in that
 * file is namespaced under .rpt, so it cannot bleed into the article, and the
 * finding that appears in the report, in the reader and now on the article page is
 * the same markup with the same styling instead of three drifting copies.
 *
 * It renders outside #post-content on purpose. The reader lifts #post-content into
 * its own panel and separately renders the audit itself from hygiene.json, so an
 * audit placed inside the article body would appear twice there.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const MAX_FINDINGS = 12;

let HYGIENE = null;

function hygieneFor(id) {
  if (HYGIENE === null) {
    try { HYGIENE = JSON.parse(fs.readFileSync(path.join('data', 'hygiene.json'), 'utf8')).repos || {}; }
    catch (e) { HYGIENE = {}; }
  }
  return HYGIENE[String(id)] || null;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The severity bar, in the shape report.css already styles: a track, a fill whose
// width is relative to the largest count, and the number.
function bar(kind, n, max) {
  const pct = Math.max(4, Math.round(100 * n / Math.max(1, max)));
  // report.css has no .fill.critical: critical borrows high's colour there, and
  // matching that keeps the two renderers from disagreeing over one class name.
  const fill = kind === 'critical' ? 'high' : kind;
  return '<div class="bar"><span class="name">' + esc(kind) + '</span>' +
    '<span class="track"><span class="fill ' + fill + '" style="width:' + pct + '%"></span></span>' +
    '<span class="n">' + n + '</span></div>';
}

function finding(f) {
  const cls = f.severity === 'critical' ? 'high' : (f.severity || 'low');
  return '<div class="finding ' + esc(cls) + '">' +
    '<div class="head">' +
      '<span class="ttl">' + esc(f.title) + '</span>' +
      '<span class="chip">' + esc(f.severity) + '</span>' +
      (f.n > 1 ? '<span class="rankchip">' + esc(f.n) + ' occurrences</span>' : '') +
    '</div>' +
    (f.where ? '<div class="loc">' + esc(f.where) + '</div>' : '') +
    (f.evidence ? '<div class="ev">' + esc(f.evidence) + '</div>' : '') +
    (f.why ? '<div class="ev">' + esc(f.why) + '</div>' : '') +
    (f.fix ? '<div class="rec"><b>Fix:</b> ' + esc(f.fix) + '</div>' : '') +
    '</div>';
}

function renderAudit(post) {
  const h = hygieneFor(post && post.id);
  if (!h) return '';                                   // not audited: say nothing

  const findings = Array.isArray(h.findings) ? h.findings : [];
  const sev = (h.totals && h.totals.severity) || {};
  const audited = h.audited ? String(h.audited).slice(0, 10) : null;

  // Audited and clean is a result, and a different one from unaudited.
  if (!findings.length) {
    return '<section class="analysis rpt" aria-label="Code health audit">' +
      '<h2 class="an-h">What would stop me shipping this</h2>' +
      '<p class="an-note">Checked against ' + (h.files ? esc(h.files) + ' files' : 'the repository') +
      (audited ? ' on ' + esc(audited) : '') + '. Nothing was found. ' +
      'No language model is involved in this section.</p>' +
      '</section>';
  }

  const shown = findings.slice(0, MAX_FINDINGS);
  const max = Math.max(1, ...SEVERITY_ORDER.map(k => sev[k] || 0));
  const bars = SEVERITY_ORDER.filter(k => sev[k]).map(k => bar(k, sev[k], max)).join('');

  let out = '<section class="analysis rpt" aria-label="Code health audit">' +
    '<h2 class="an-h">What would stop me shipping this</h2>' +
    '<p class="an-note">Ranked by severity &times; confidence &times; production reach. ' +
    'Reach is the honest discriminator across a collection that is mostly other ' +
    'people\'s code: the same finding matters more in something that ships.</p>';
  if (bars) out += '<div class="bars">' + bars + '</div>';
  out += shown.map(finding).join('');

  if (findings.length > shown.length) {
    out += '<p class="an-note">' + (findings.length - shown.length) +
      ' further finding(s) are listed in the full report.</p>';
  }
  if (h.truncated) {
    out += '<p class="an-note">The file listing for this repository was truncated, ' +
      'so the absence of a finding is not proof of its absence.</p>';
  }
  out += '<p class="an-note">Checked deterministically against the repository tree ' +
    'and a bounded set of its files: committed credentials, unpinned actions and ' +
    'base images, missing lockfiles and update bots, workflows that discard ' +
    'failures, published advisories against the declared dependencies, runtime ' +
    'configuration, licensing and notebook reproducibility. ' +
    'No language model is involved in this section.</p>';
  out += '</section>';
  return out;
}

module.exports = { renderAudit, hygieneFor };
