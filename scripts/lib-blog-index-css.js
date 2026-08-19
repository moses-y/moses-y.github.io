/*
 * lib-blog-index-css.js - the stylesheet for the blog index page.
 *
 * Split from lib-blog-css.js only because the two stylesheets together exceed the
 * 450-line limit. They are genuinely separate documents: this one styles a card
 * grid and its filters, that one styles an article.
 */
'use strict';

const INDEX_CSS = `        :root {
            --bg-primary: #030303;
            --bg-secondary: #0a0a0a;
            --bg-card: rgba(255, 255, 255, 0.02);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-tertiary: #64748b;
            --border: rgba(255, 255, 255, 0.08);
            --accent: #6366f1;
            --gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
        }

        [data-theme="light"] {
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-card: rgba(0, 0, 0, 0.02);
            --text-primary: #0f172a;
            --text-secondary: #64748b;
            --text-tertiary: #94a3b8;
            --border: rgba(0, 0, 0, 0.08);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 24px;
        }

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
            transition: color 0.2s;
        }

        .back-link:hover { color: var(--accent); }

        .theme-toggle {
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px;
            color: var(--text-secondary);
            cursor: pointer;
        }

        .theme-toggle .sun { display: none; }
        .theme-toggle .moon { display: block; }
        [data-theme="light"] .theme-toggle .sun { display: block; }
        [data-theme="light"] .theme-toggle .moon { display: none; }

        .page-header {
            padding: 60px 0;
            text-align: center;
        }

        h1 {
            font-size: 3rem;
            font-weight: 700;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 16px;
        }

        .page-header p {
            color: var(--text-secondary);
            font-size: 1.125rem;
        }

        .posts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 24px;
            padding-bottom: 80px;
        }

        .post-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            text-decoration: none;
            color: inherit;
            transition: all 0.3s;
        }

        .post-card:hover {
            transform: translateY(-4px);
            border-color: var(--accent);
        }

        .post-card img {
            width: 100%;
            aspect-ratio: 16/9;
            object-fit: cover;
        }

        .post-card-content {
            padding: 20px;
        }

        .post-card-meta {
            display: flex;
            gap: 12px;
            font-size: 0.75rem;
            color: var(--text-tertiary);
            margin-bottom: 12px;
        }

        .post-card-meta .lang {
            background: var(--accent);
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
        }

        .post-card h3 {
            font-size: 1.125rem;
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .post-card p {
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        footer {
            padding: 40px 0;
            border-top: 1px solid var(--border);
            text-align: center;
            color: var(--text-tertiary);
        }

        footer a { color: var(--accent); text-decoration: none; }

        @media (max-width: 768px) {
            h1 { font-size: 2rem; }
            .posts-grid { grid-template-columns: 1fr; }
        }`;

module.exports = { INDEX_CSS };
