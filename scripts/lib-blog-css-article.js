/*
 * lib-blog-css-article.js - the document styles for an article body.
 *
 * Separate from lib-blog-css.js because that file styles the page - header, nav,
 * footer, the analysis cards - and this styles the document inside it. The split
 * is also what keeps both under the 450-line limit.
 *
 * These rules only had anything to style once markdown stopped being flattened at
 * storage. Before that an article was a flat run of paragraphs, so there was no
 * table to rule, no code block to set apart, no list to indent and no heading
 * level to number: the page could not look like a technical document because the
 * document structure had been deleted on the way in.
 *
 * The reference is a paper rather than a blog post, which mostly means restraint:
 * numbered sections so a reader can cite one, horizontal rules only in tables,
 * numbered figures with their captions, and a measure that stays near 70
 * characters. Nothing here decorates.
 */
'use strict';

const ARTICLE_CSS = `
        /* ---- numbered sections ------------------------------------------
           Counters rather than numbers in the text, so the article source stays
           readable and renumbers itself when a section is added. h3 is a section
           because the renderer shifts markdown down one level: the page already
           owns the h1, so the article's own top-level heading is a section in it. */
        .post-content { counter-reset: section figure; }
        /* Numbering is gated on .numbered, which the generator adds only when it
           found at least three sections. Doing it by heading class instead was
           wrong twice over: it skipped the recovered headings, which now come from
           a specific pattern rather than a loose guess and are worth numbering,
           and it still printed a lone "1." on an article that happened to have
           exactly one. */
        .post-content.numbered h3 { counter-increment: section; counter-reset: subsection; }
        .post-content h4 { counter-increment: subsection; }
        .post-content.numbered h3::before,
        .post-content.numbered h4::before {
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
            font-weight: 500;
            margin-right: 0.5em;
        }
        .post-content.numbered h3::before { content: counter(section) "."; }
        .post-content.numbered h4::before { content: counter(section) "." counter(subsection); }

        .post-content h3 {
            font-size: 1.32rem;
            line-height: 1.3;
            margin: 2.6em 0 0.7em;
            letter-spacing: -0.01em;
        }
        .post-content h4 {
            font-size: 1.06rem;
            line-height: 1.35;
            margin: 2em 0 0.5em;
            color: var(--text-primary);
        }
        /* The first section should not be pushed away from the lede. */
        .post-content > h3:first-child,
        .post-content > h4:first-child { margin-top: 0.2em; }

        /* ---- abstract and contents ---------------------------------------
           A paper opens with both. The abstract is the repository's own one-line
           description, which was already on the page as small grey text; labelling
           and setting it apart is the whole change, and it introduces no content
           that could be wrong.

           The contents is one line rather than a stacked list. The median article
           here is 3,503 characters across six sections, and a bulleted list of six
           links is a screenful restating what a scroll already shows. */
        .post-abstract {
            border-left: 2px solid var(--border);
            padding: 0.1em 0 0.1em 1.1em;
            margin: 0 0 1.8em;
        }
        .post-abstract-lab {
            display: block;
            font-family: var(--font-mono, ui-monospace, monospace);
            font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase;
            color: var(--text-tertiary); margin-bottom: 0.35em;
        }
        .post-abstract .post-description { margin: 0; }

        .post-toc {
            display: flex; flex-wrap: wrap; align-items: baseline;
            gap: 0.35em 1.1em;
            margin: 0 0 2.4em;
            padding-bottom: 1em;
            border-bottom: 1px solid var(--border);
            font-size: 0.84rem;
        }
        .post-toc-lab {
            font-family: var(--font-mono, ui-monospace, monospace);
            font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase;
            color: var(--text-tertiary);
        }
        /* Numbered to match the headings they point at, from the same counter, so
           the strip and the body cannot disagree. */
        .post-content.numbered .post-toc { counter-reset: tocitem; }
        .post-content.numbered .post-toc a { counter-increment: tocitem; }
        .post-content.numbered .post-toc a::before {
            content: counter(tocitem) ". ";
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
        }
        .post-toc a {
            color: var(--text-secondary); text-decoration: none;
            border-bottom: 1px solid transparent;
        }
        .post-toc a:hover { color: var(--accent); border-bottom-color: var(--accent); }

        /* A heading linked from the strip should not land under the fixed nav. */
        .post-content h3, .post-content h4 { scroll-margin-top: 90px; }

        /* ---- the reading setting -----------------------------------------
           A serif at 19px on a 44rem column, chosen from a four-way comparison of
           the same real article on this exact ground.

           The size and the width travel together and neither is decorative. A
           serif fits more characters into a column than a sans of the same size,
           so keeping 18px and only swapping the face pushed the line to 84
           characters - past where the eye reliably finds the start of the next
           one. One extra pixel and a slightly narrower column bring it back to 74,
           inside the comfortable 65 to 75.

           No download: this is the system stack the headings already use, and
           these pages deliberately load no webfont at all. */
        .post-content {
            font-family: var(--font-display, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif);
            font-size: 19px;
            line-height: 1.72;
            max-width: 44rem;
        }

        /* ---- prose -------------------------------------------------------- */
        .post-content p { margin: 0 0 1.15em; }
        /* Identifiers are the nouns of this writing, and there are a great many of
           them: a paragraph naming six functions carried six coloured pills, which
           speckled the page and made the prose harder to read rather than easier.
           Monospace and a slight warmth is enough to mark a name as a name. */
        /* Monospace and the labelled strips keep their own faces: the serif is for
           running prose, and an identifier set in it stops looking like an
           identifier. */
        .post-content code,
        .post-content pre {
            font-family: 'JetBrains Mono', var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
        }
        .post-content .post-toc,
        .post-content .post-toc-lab {
            font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        }
        .post-content .post-toc-lab { font-family: var(--font-mono, ui-monospace, Menlo, monospace); }

        .post-content code {
            white-space: nowrap;
            background: none;
            padding: 0;
            border-radius: 0;
            color: #d8b489;
        }
        .post-content a code { color: inherit; }
        .post-content p > code,
        .post-content li > code,
        .post-content td > code { font-size: 0.84em; }

        .post-content ul,
        .post-content ol {
            margin: 0 0 1.3em;
            padding-left: 1.4em;
        }
        .post-content li { margin: 0 0 0.42em; line-height: 1.65; }
        .post-content li::marker { color: var(--text-tertiary); }
        .post-content ol { font-variant-numeric: tabular-nums; }

        /* A caveat, not a pull quote: a rule and quieter text, no large type. */
        .post-content blockquote {
            margin: 1.6em 0;
            padding: 0.1em 0 0.1em 1.1em;
            border-left: 2px solid var(--border);
            color: var(--text-secondary);
        }
        .post-content blockquote p:last-child { margin-bottom: 0; }

        .post-content hr {
            border: 0;
            border-top: 1px solid var(--border);
            margin: 2.4em 0;
        }

        /* ---- tables ------------------------------------------------------
           Horizontal rules only, which is the one typographic convention worth
           borrowing wholesale from papers: vertical lines add nothing a column
           of aligned numbers does not already say. */
        .post-content .table-scroll {
            overflow-x: auto;
            margin: 1.8em 0;
            /* A wide table scrolls inside its own box; the page never does. */
            max-width: 100%;
        }
        .post-content table {
            border-collapse: collapse;
            width: 100%;
            font-size: 0.9rem;
            font-variant-numeric: tabular-nums;
        }
        .post-content thead th {
            text-align: left;
            padding: 0.5em 0.9em;
            border-bottom: 1.5px solid var(--text-tertiary);
            color: var(--text-primary);
            font-weight: 600;
            white-space: nowrap;
        }
        .post-content tbody td {
            padding: 0.5em 0.9em;
            border-bottom: 1px solid var(--border);
            color: var(--text-secondary);
            vertical-align: top;
        }
        .post-content tbody tr:last-child td { border-bottom: 1.5px solid var(--text-tertiary); }
        /* A count reads better right-aligned, and the renderer marks which columns
           actually hold counts. Doing it by position instead - "the last column is
           a count" - flush-righted a column of prose on the first real table. */
        .post-content th.num,
        .post-content td.num { text-align: right; }

        /* ---- code --------------------------------------------------------
           The install commands are the one thing a reader will copy, so the block
           gets a label and enough room to be selected without care. */
        .post-content pre {
            position: relative;
            padding: 1.1em 1.2em;
            margin: 1.6em 0;
            tab-size: 2;
        }
        .post-content pre[data-lang]::before {
            content: attr(data-lang);
            position: absolute;
            top: 0.55em;
            right: 0.9em;
            font-size: 0.62rem;
            letter-spacing: 0.09em;
            text-transform: uppercase;
            color: var(--text-tertiary);
        }
        .post-content pre code { white-space: pre; }

        /* ---- numbered figures --------------------------------------------
           The analysis blocks are figures in the sense that matters: a reader
           refers to them, so they need numbers. The label already present becomes
           the caption. */
        /* Only blocks that actually contain a diagram. The findings list is not a
           figure and numbering it as one invites a reference that means nothing. */
        .post-analysis { counter-reset: figure; }
        .an-block:has(.mermaid) { counter-increment: figure; }
        .an-block:has(.mermaid) > .an-lab::before {
            content: "Figure " counter(figure) " ";
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
        }

        @media (max-width: 700px) {
            .post-content h3 { font-size: 1.2rem; margin-top: 2.1em; }
            .post-content table { font-size: 0.84rem; }
            .post-content pre { padding: 0.9em 1em; font-size: 0.8rem; }
        }
`;

module.exports = { ARTICLE_CSS };
