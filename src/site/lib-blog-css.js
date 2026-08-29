/*
 * lib-blog-css.js - the stylesheet for a generated blog post page.
 *
 * 553 lines of static CSS were sitting inside generate-blog-pages.js, which is
 * most of why that file was 1,204 lines. It is not code: no interpolation, no
 * logic, nothing a reader of the generator needs to scroll past to understand
 * what the generator does. The index page's stylesheet is a separate file for the
 * same reason the limit exists - together they do not fit under it.
 *
 * Still emitted inline into every page, byte for byte as before, so this is a
 * move and not a change of output. Worth recording that inlining means each of
 * the 1,331 post pages carries its own copy of these 385 lines - roughly 13 MB of
 * duplicated CSS across the site, none of it cacheable between pages. Turning it
 * into a real stylesheet is a separate decision, because it changes what is
 * published rather than how it is organised.
 */
'use strict';

// Article typography, the analysis tables, the mermaid diagrams.
const POST_CSS = `        /* The palette is not declared here. It lives in assets/css/tokens.css,
           which every page links, because this file used to carry its own -
           indigo on near-black - and a link or a button therefore meant one
           colour on a briefing and a different one on every other page. */


        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.7;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 24px;
        }

        /* Header */
        header {
            padding: 20px 0;
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            background: var(--bg-primary);
            z-index: 100;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .back-link {
            color: var(--text-secondary);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.875rem;
            transition: color 0.2s;
        }

        .back-link:hover {
            color: var(--accent);
        }

        .theme-toggle {
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s;
        }

        .theme-toggle:hover {
            color: var(--text-primary);
            border-color: var(--accent);
        }

        .theme-toggle .sun { display: none; }
        .theme-toggle .moon { display: block; }
        [data-theme="light"] .theme-toggle .sun { display: block; }
        [data-theme="light"] .theme-toggle .moon { display: none; }

        /* Article */
        article {
            padding: 60px 0;
        }

        .post-header {
            margin-bottom: 48px;
        }

        /* Read-aloud controls - hidden until JS confirms speechSynthesis exists. */
        .listen-bar { display: flex; align-items: center; gap: 10px; margin: 22px 0 4px; }
        .listen-btn, .listen-stop {
            display: inline-flex; align-items: center; gap: 8px;
            background: var(--bg-card, rgba(255,255,255,0.05));
            border: 1px solid var(--border, rgba(255,255,255,0.12));
            color: var(--text-primary, #fff); font-family: inherit; font-size: 0.85rem;
            padding: 8px 16px; border-radius: 999px; cursor: pointer; transition: .2s;
        }
        .listen-btn:hover, .listen-stop:hover { border-color: var(--accent, #4f7cff); color: var(--accent, #4f7cff); }
        .listen-stop { padding: 8px 12px; }
        .listen-icon { font-size: 0.7rem; }
        .listen-progress { font-size: 0.75rem; color: var(--text-secondary, #9aa4bf); font-variant-numeric: tabular-nums; }
        .post-content p.speaking { background: color-mix(in srgb, var(--accent, #4f7cff) 12%, transparent); border-radius: 4px; }

        /* Automated-analysis section: rendered from knowledgeGraph + structure/<id>.deep.json */
        .analysis { margin: 56px 0 0; padding-top: 32px; border-top: 1px solid var(--border); }
        .analysis-h { font-size: 1.4rem; margin-bottom: 20px; }
        .analysis-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
        .an-card, .an-block { border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; background: var(--bg-secondary); }
        .an-block { margin-top: 16px; }
        .an-lab { display: block; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-tertiary); }
        .an-score { font-size: 1.8rem; font-weight: 600; margin: 6px 0 10px; }
        .an-score span { font-size: 0.95rem; font-weight: 400; color: var(--text-secondary); }
        .an-checks, .an-bars, .an-findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .an-checks li { font-size: 0.87rem; display: flex; gap: 8px; align-items: center; }
        .an-checks li.ok span { color: #3fa46a; }
        .an-checks li.no span { color: #d1616a; }
        .an-bars li { display: grid; grid-template-columns: 96px 1fr 34px; gap: 8px; align-items: center; font-size: 0.82rem; }
        .an-bars i { display: block; height: 6px; border-radius: 3px; background: var(--accent); opacity: 0.75; }
        .an-bars b { font-weight: 500; color: var(--text-secondary); text-align: right; font-variant-numeric: tabular-nums; }
        .an-fw { margin: 12px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
        .an-fw span { font-size: 0.72rem; border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px; color: var(--text-secondary); }
        .an-note { font-size: 0.84rem; color: var(--text-secondary); margin: 6px 0 12px; }
        .an-findings li { display: flex; gap: 9px; align-items: flex-start; font-size: 0.87rem; padding: 5px 0; border-bottom: 1px solid var(--border); }
        .an-findings li:last-child { border-bottom: 0; }
        .an-findings code { font-size: 0.78rem; color: var(--text-tertiary); }
        .an-sev { flex: none; font-size: 0.62rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; color: #fff; margin-top: 2px; }
        .an-sev.sev-high { background: #a3323a; }
        .an-sev.sev-medium { background: #8a6520; }
        .an-sev.sev-low { background: #4a6b52; }
        .an-deps { width: 100%; margin-top: 8px; }
        .an-deps th { text-align: left; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase;
            color: var(--text-tertiary); font-weight: 500; padding: 4px 6px; border-bottom: 1px solid var(--border); }
        .an-deps td { font-size: 0.82rem; }
        .an-deps .beh { color: #d1616a; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .an-links { display: flex; flex-wrap: wrap; gap: 18px; margin: 18px 0 0; font-size: 0.88rem; }
        .an-links a { color: var(--accent); text-decoration: none; }
        .an-links a:hover { text-decoration: underline; }

        .post-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 16px;
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        .post-meta span {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .post-language {
            background: var(--accent);
            color: white;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
        }

        .post-type {
            background: rgba(99, 102, 241, 0.1);
            color: var(--accent);
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: capitalize;
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            line-height: 1.2;
            margin-bottom: 16px;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .post-description {
            font-size: 1.25rem;
            color: var(--text-secondary);
            margin-bottom: 16px;
        }

        .post-parent {
            font-size: 0.875rem;
            color: var(--text-tertiary);
        }

        .post-parent a {
            color: var(--accent);
            text-decoration: none;
        }

        .post-parent a:hover {
            text-decoration: underline;
        }

        .post-image {
            width: 100%;
            border-radius: 16px;
            margin-bottom: 48px;
            aspect-ratio: 16/9;
            object-fit: cover;
        }

        .post-content {
            font-size: 1.125rem;
        }

        .post-content p {
            margin-bottom: 24px;
        }

        .post-content .post-h {
            font-family: var(--font-display, Georgia, serif);
            font-size: 1.3rem;
            font-weight: 600;
            color: var(--text-primary, #F3EBE2);
            margin: 40px 0 14px;
            text-wrap: balance;
        }
        .post-content .post-h:first-child { margin-top: 0; }

        .post-content .post-pending {
            font-size: 0.92rem;
            color: var(--text-tertiary, #6B5D51);
            border-left: 2px solid var(--border, rgba(255,240,228,0.14));
            padding-left: 14px;
        }

        .post-topics {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 48px;
            padding-top: 24px;
            border-top: 1px solid var(--border);
        }

        .topic-tag {
            background: rgba(99, 102, 241, 0.1);
            color: var(--accent);
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 0.875rem;
        }

        /* Actions */
        .post-actions {
            display: flex;
            gap: 16px;
            margin-top: 48px;
        }

        .post-actions a {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.2s;
        }

        .primary-btn {
            background: var(--gradient);
            color: var(--on-accent);
        }

        .primary-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
        }

        .secondary-btn {
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .secondary-btn:hover {
            border-color: var(--accent);
        }

        /* Footer */
        footer {
            padding: 40px 0;
            border-top: 1px solid var(--border);
            text-align: center;
            color: var(--text-tertiary);
            font-size: 0.875rem;
        }

        footer a {
            color: var(--accent);
            text-decoration: none;
        }

        /* Mermaid diagram styling */
        .mermaid {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin: 24px 0;
            overflow-x: auto;
        }

        .mermaid svg {
            max-width: 100%;
            height: auto;
        }

        /* Code blocks styling (GitNexus-inspired) */
        .post-content pre {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            overflow-x: auto;
            margin: 24px 0;
            font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
            font-size: 0.875rem;
            line-height: 1.6;
        }

        .post-content code {
            background: rgba(99, 102, 241, 0.1);
            color: #e6b450;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
            font-size: 0.875em;
        }

        .post-content pre code {
            background: none;
            color: inherit;
            padding: 0;
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--text-tertiary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent);
        }

        @media (max-width: 768px) {
            h1 { font-size: 1.75rem; }
            .post-description { font-size: 1rem; }
            .post-content { font-size: 1rem; }
            .post-actions { flex-direction: column; }
            .post-actions a { justify-content: center; }
        }`;

module.exports = { POST_CSS };
