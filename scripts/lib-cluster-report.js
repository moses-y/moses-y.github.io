#!/usr/bin/env node
/*
 * lib-cluster-report.js - the clusters, in prose.
 *
 * data/clusters.json is 36 KB of nested objects describing 59 groups of
 * repositories that resemble each other. It is legible to an agent and
 * illegible to a person, which is the wrong way round for a file whose only
 * real use is deciding what to consolidate - a decision a person makes.
 *
 * So this renders the same numbers as sentences. No new input, no new
 * computation, nothing inferred here that is not already inferred in the
 * source: the clusters come from semantic edges, which come from an embedding,
 * so every grouping below is INFERRED and the report has to keep saying so.
 * The one thing it must never say is "these are duplicates". The grouping is a
 * partition of an embedding graph by link density, which is a claim about how
 * repositories describe themselves, and the difference matters when the
 * suggested action is to archive something.
 */
'use strict';

const GRADE_UNKNOWN = 'not audited';

function pct(n, of) {
  return of ? Math.round((n / of) * 100) + '%' : '0%';
}

function dominant(domains) {
  const rows = Object.keys(domains).map(d => [d, domains[d]]).sort((a, b) => b[1] - a[1]);
  return rows.length ? rows[0] : [null, 0];
}

// "14 Web & Interfaces, 3 Agent Skills & Plugins, 2 AI & Data"
function domainPhrase(domains) {
  return Object.keys(domains)
    .map(d => [d, domains[d]])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(pair => pair[1] + ' ' + pair[0])
    .join(', ');
}

function keeperPhrase(c) {
  const k = c.keeper;
  if (!k) return 'no keeper could be chosen';
  return '**' + k.name + '** (' + (k.letter ? k.letter + ', ' + k.score : GRADE_UNKNOWN) + ')';
}

/*
 * The sentence a reader actually wants: what this group is, which one survives
 * a consolidation, and how much of the group is unknown enough that the choice
 * is not yet safe to act on.
 */
function paragraph(c) {
  const top = dominant(c.domains);
  const lines = ['### ' + c.id + ' - ' + c.size + ' repositories', ''];

  lines.push(c.crossDomain
    ? 'Crosses a domain boundary: ' + domainPhrase(c.domains) + '. That is the ' +
      'interesting case - the same shape of problem solved in two different ' +
      'parts of the estate.'
    : 'All ' + top[1] + ' in ' + top[0] + '.');
  lines.push('');

  const graded = c.size - c.ungraded;
  if (!graded) {
    lines.push('Nothing in this group has been audited, so the keeper was chosen ' +
      'on size alone and should not be trusted. Grade it before acting on it.');
  } else {
    lines.push('Keeper: ' + keeperPhrase(c) + '. ' +
      (c.meanScore == null ? '' : 'Mean grade across the ' + graded +
        ' audited members is ' + c.meanScore + '. ') +
      (c.ungraded
        ? c.ungraded + ' of ' + c.size + ' (' + pct(c.ungraded, c.size) +
          ') have not been audited, so a better keeper may be hiding among them.'
        : 'Every member is audited, so the choice of keeper rests on evidence.'));
  }
  lines.push('');

  const rows = c.members.slice()
    .sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score));
  lines.push('| repository | domain | language | grade | files |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const m of rows) {
    lines.push('| ' + (m.id === (c.keeper || {}).id ? '**' + m.name + '**' : m.name) +
      ' | ' + (m.domain || '') +
      ' | ' + (m.language || '') +
      ' | ' + (m.letter ? m.letter + ' ' + m.score : GRADE_UNKNOWN) +
      ' | ' + (m.files == null ? '' : m.files) + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

function summary(clusters, threshold, method) {
  const covered = clusters.reduce((s, c) => s + c.size, 0);
  const cross = clusters.filter(c => c.crossDomain);
  const ungraded = clusters.reduce((s, c) => s + c.ungraded, 0);
  const blind = clusters.filter(c => c.ungraded === c.size);
  const largest = clusters.slice().sort((a, b) => b.size - a.size)[0].size;

  return [
    '# Clusters, in prose',
    '',
    '> ' + clusters.length + ' groups covering ' + covered + ' repositories. Every ' +
      'pair scoring at least ' + threshold + ' semantic similarity is an edge, and ' +
      (method || 'modularity clustering') + ' partitions that graph into groups ' +
      'that are linked more densely inside than out.',
    '>',
    '> **These groupings are INFERRED.** They come from cosine distance between ' +
      'neural embeddings, not from anything measured in a tree. Density is a ' +
      'stronger claim than the connected components this used previously - a ' +
      'bridge repository no longer welds two unrelated neighbourhoods together - ' +
      'but a group of ' + largest + ' still means ' + largest + ' closely related ' +
      'projects, not ' + largest + ' copies of one. Read a large group as a thread ' +
      'to pull, never as a list of duplicates to delete.',
    '',
    '## What the numbers say',
    '',
    '- ' + cross.length + ' of the ' + clusters.length + ' groups cross a domain ' +
      'boundary. Those are the ones worth reading first: two repositories the ' +
      'classifier put in different parts of the estate that the embedding still ' +
      'pulled together.',
    // The good case is a real outcome, not an edge case to leave reading like a
    // template with the numbers knocked out.
    (ungraded
      ? '- ' + ungraded + ' of the ' + covered + ' clustered repositories (' +
        pct(ungraded, covered) + ') have never been audited. Every keeper chosen ' +
        'over one of them is a provisional choice.'
      : '- All ' + covered + ' clustered repositories have been audited, so every ' +
        'keeper below was chosen against a grade rather than against a gap.'),
    (blind.length
      ? '- ' + blind.length + ' groups have no audited member at all. For those the ' +
        'keeper is a placeholder, and the report says so in place.'
      : '- No group is entirely unaudited, so there is no group whose keeper is a ' +
        'guess about a guess.'),
    '',
    '## How to use this',
    '',
    'Each group names a keeper: the highest-graded member, breaking ties on stars ' +
      'and then on size. The rest are candidates for review, not for deletion - the ' +
      'grouping is a guess and the grade behind the keeper may be missing. The ' +
      'machine-readable form is /data/clusters.json. A single repository neighbourhood, ' +
      'including the EXTRACTED shared-dependency edges this report does not cover, ' +
      'is at /data/kin/<id>.json.',
    '',
    '## Groups that cross a domain',
    ''
  ].join('\n');
}

/*
 * Order is the argument. Cross-domain groups first because they carry the most
 * information per line, then everything else by size, because after the
 * interesting ones the only question left is how much work a group represents.
 */
function render(clustersFile) {
  const clusters = (clustersFile || {}).clusters || [];
  if (!clusters.length) return '# Clusters, in prose\n\nNo clusters at this threshold.\n';

  const bySize = (a, b) => b.size - a.size || String(a.id).localeCompare(String(b.id));
  const cross = clusters.filter(c => c.crossDomain).sort(bySize);
  const rest = clusters.filter(c => !c.crossDomain).sort(bySize);

  const out = [summary(clusters, clustersFile.threshold, clustersFile.method)];
  for (const c of cross) out.push(paragraph(c));
  out.push('## Groups inside a single domain\n');
  for (const c of rest) out.push(paragraph(c));
  out.push('---\n');
  out.push('Generated from data/clusters.json' +
    (clustersFile.generated ? ' built ' + String(clustersFile.generated).slice(0, 10) : '') +
    '. Regenerate with `node scripts/build-relations.js`.\n');
  return out.join('\n');
}

module.exports = { render, paragraph, summary, domainPhrase };
