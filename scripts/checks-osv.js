/*
 * checks-osv.js - named advisories against the declared dependencies.
 *
 * The rest of the supply-chain catalogue reasons about process: is there a
 * lockfile, is there an update bot, is the base image pinned. These three rules
 * report the specific vulnerability, by CVE, in the version this repository
 * actually asks for, which is the difference between "you are behind" and "you
 * are behind on this, and here is what it lets someone do".
 *
 * Everything here reads data/osv.json, built by build-osv.js, and does no work of
 * its own. The important thing it inherits from that file is the split between a
 * pinned version and a range, because the two support different claims and the
 * weaker one is easy to overstate:
 *
 *   pinned    ==1.2.3 in a manifest is what installs. An advisory against it is a
 *             statement about this repository, and it is reported as one.
 *   ranged    ^1.2.3 resolves to the newest match, which is usually patched. The
 *             only honest claim is that nothing in the repository pins the
 *             resolution, so a fresh install may or may not be vulnerable - and
 *             that claim evaporates entirely if a lockfile is present, which is
 *             why the third rule requires there to be none.
 *
 * Reported at three severities rather than one so the ranking reflects the
 * advisory rather than the category: a critical remote-execution advisory on a
 * pinned dependency should outrank a medium one, and rank() reads severity off
 * the check, so the split has to live in the registration.
 */
'use strict';
const { register } = require('./lib-hygiene.js');

const LOCKS = /(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Pipfile\.lock|poetry\.lock|uv\.lock|pdm\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;

// One line per affected package, worst advisory first, capped so a repo with
// forty stale packages produces a readable finding rather than a wall.
function describe(records, limit) {
  const sorted = records.slice().sort((a, b) => order(a) - order(b));
  const shown = sorted.slice(0, limit || 4).map(r => {
    const v = r.vulns[0];
    const id = v.cve || v.id;
    const more = r.vulns.length > 1 ? ` +${r.vulns.length - 1} more` : '';
    return `${r.package}@${r.version} ${id} (${v.severity})${more}`;
  });
  const rest = sorted.length - shown.length;
  return shown.join('; ') + (rest > 0 ? `; and ${rest} more package(s)` : '');
}

const ORDER = ['critical', 'high', 'medium', 'low', 'unknown'];
function order(rec) {
  return ORDER.indexOf(rec.vulns[0] ? rec.vulns[0].severity : 'unknown');
}

function pinnedAt(ctx, severities) {
  if (!ctx.osv) return null;                       // lookup has not reached this repo
  const hit = (ctx.osv.pinned || []).filter(r => severities.includes(order(r) === -1 ? 'unknown' : ORDER[order(r)]));
  if (!hit.length) return null;
  const total = hit.reduce((s, r) => s + r.vulns.length, 0);
  return { where: '', evidence: describe(hit), n: total };
}

register({
  id: 'dependency-pinned-to-critical-vulnerability',
  title: 'Upgrade the pinned dependency carrying a critical advisory',
  category: 'supply-chain',
  severity: 'critical',
  confidence: 0.9,
  why: 'The manifest pins the exact version the advisory covers, so this is not a warning about drift: the vulnerable code is what installs, and a critical rating means it is reachable over the network without credentials or user interaction.',
  fix: 'Upgrade to the fixed version named in the advisory, then commit the lockfile.',
  run: ctx => pinnedAt(ctx, ['critical'])
});

register({
  id: 'dependency-pinned-to-known-vulnerability',
  title: 'Upgrade the pinned dependency carrying a published advisory',
  category: 'supply-chain',
  severity: 'high',
  confidence: 0.85,
  why: 'The pinned version is the one that installs, so a published advisory against it describes this deployment rather than a hypothetical one, and the advisory is also a public description of how to exploit it.',
  fix: 'Upgrade to the fixed version named in the advisory, then commit the lockfile.',
  run: ctx => pinnedAt(ctx, ['high', 'medium'])
});

register({
  id: 'dependency-range-permits-vulnerability',
  title: 'Pin the resolution so a vulnerable version cannot install',
  category: 'supply-chain',
  severity: 'medium',
  confidence: 0.5,
  why: 'The range includes versions with published advisories and nothing in the repository records which one was resolved, so two installs a month apart can differ in whether they are vulnerable and neither is reproducible from what is committed.',
  fix: 'Commit the lockfile, which fixes the resolution and makes this answerable.',
  run(ctx) {
    if (!ctx.osv) return null;
    const ranged = (ctx.osv.ranged || []).filter(r => ['critical', 'high'].includes(ORDER[order(r)]));
    if (!ranged.length) return null;
    // With a lockfile the resolution is recorded, so the claim this rule makes is
    // simply false: what installs is known, and build-osv only saw the range
    // because it reads manifests. Stay silent rather than guess.
    if (ctx.has(LOCKS)) return null;
    const total = ranged.reduce((s, r) => s + r.vulns.length, 0);
    return { where: '', evidence: 'no lockfile, and the declared ranges reach ' + describe(ranged, 3), n: total };
  }
});

module.exports = { describe };
