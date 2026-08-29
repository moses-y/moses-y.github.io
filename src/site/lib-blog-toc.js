/*
 * lib-blog-toc.js - anchors for every section, and a contents strip.
 *
 * The point of this is citation more than navigation. These articles are meant to
 * be a reference for someone reading a codebase, and a reference you cannot link
 * into is half useful: without ids there is no way to send a colleague the wiring
 * section of a particular repository's briefing.
 *
 * The contents itself is deliberately a strip rather than a stacked list. Measured
 * across the estate, the median article is 3,503 characters with six sections, and
 * 99% have three or more. A bulleted table of contents for six sections of six
 * hundred words is a screenful of links restating what one scroll already shows.
 * One line of them gives the same orientation and the same citability at a
 * fraction of the space.
 *
 * Numbering is applied by the stylesheet, and only inside a container this file
 * marks, because a number is only meaningful when there are several: an article
 * where one line happened to look like a heading would otherwise print a lone
 * "1." and imply a structure it does not have. Twelve articles in the estate are
 * in that position.
 */
'use strict';

// Below this, a contents strip is noise rather than orientation.
const MIN_SECTIONS = 4;
// Below this, numbering implies more structure than was found.
const MIN_TO_NUMBER = 3;

function slug(text, taken) {
  const base = String(text).toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'section';
  // A repeated heading is common enough - two sections can both be called
  // "Limitations" - and duplicate ids would make the second uncitable.
  let id = base, n = 2;
  while (taken.has(id)) { id = base + '-' + n; n++; }
  taken.add(id);
  return id;
}

function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, '').trim();
}

/*
 * Takes the rendered article HTML and returns it with ids on every section
 * heading, plus the contents strip to place above it.
 *
 * Headings are matched on the rendered output rather than on the markdown source,
 * so this works the same for an article stored with its structure and for one
 * whose headings were recovered from the flattened text.
 */
function annotate(html) {
  if (!html) return { html: '', toc: '', sections: 0 };
  const taken = new Set();
  const entries = [];

  const out = String(html).replace(/<(h3|h4)([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, attrs, inner) => {
    if (/\bid=/.test(attrs)) return m;                 // already anchored
    const text = stripTags(inner);
    if (!text) return m;
    const id = slug(text, taken);
    entries.push({ tag, id, text });
    return '<' + tag + attrs + ' id="' + id + '">' + inner + '</' + tag + '>';
  });

  const sections = entries.filter(e => e.tag === 'h3').length;

  let toc = '';
  if (sections >= MIN_SECTIONS) {
    // Only top-level sections. Including subsections doubles the length of the
    // strip and it stops being scannable, which was the whole reason for a strip.
    const links = entries.filter(e => e.tag === 'h3')
      .map(e => '<a href="#' + e.id + '">' + e.text + '</a>')
      .join('');
    toc = '<nav class="post-toc" aria-label="Sections">' +
      '<span class="post-toc-lab">Sections</span>' + links + '</nav>';
  }

  return { html: out, toc, sections, numbered: sections >= MIN_TO_NUMBER };
}

module.exports = { annotate, MIN_SECTIONS, MIN_TO_NUMBER };
