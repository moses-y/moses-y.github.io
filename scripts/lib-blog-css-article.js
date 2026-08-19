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
        .post-content h3 { counter-increment: section; counter-reset: subsection; }
        .post-content h4 { counter-increment: subsection; }
        .post-content h3::before,
        .post-content h4::before {
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
            font-weight: 500;
            margin-right: 0.5em;
        }
        .post-content h3::before { content: counter(section) "."; }
        .post-content h4::before { content: counter(section) "." counter(subsection); }

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

        /* ---- prose -------------------------------------------------------- */
        .post-content p { margin: 0 0 1.15em; }
        /* Identifiers are the nouns of this writing, and there are a great many of
           them: a paragraph naming six functions carried six coloured pills, which
           speckled the page and made the prose harder to read rather than easier.
           Monospace and a slight warmth is enough to mark a name as a name. */
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
