const fs = require('fs');
const path = require('path');
const { looksLikeReasoning } = require('./lib-quality.js');

// Directory for blog posts
const BLOG_DIR = 'blog';

const { escapeHtml, renderSummary, renderAnalysis } = require('./lib-blog-analysis.js');
const { renderAudit } = require('./lib-blog-audit.js');
const { POST_CSS } = require('./lib-blog-css.js');
const { ARTICLE_CSS } = require('./lib-blog-css-article.js');
const { INDEX_CSS } = require('./lib-blog-index-css.js');
function generateBlogPostHTML(post) {
    const formattedDate = post.updatedAt || post.forkedAt || 'Unknown date';
    const parentInfo = post.parent
        ? `<p class="post-parent">Forked from <a href="${escapeHtml(post.parent.url)}" target="_blank" rel="noopener">${escapeHtml(post.parent.name)}</a></p>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(post.displayName)} - Moses Yebei</title>
    <meta name="description" content="${escapeHtml((post.description || '').slice(0, 160))}">

    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(post.displayName)} - Moses Yebei">
    <meta property="og:description" content="${escapeHtml((post.description || '').slice(0, 160))}">
    <meta property="og:image" content="${escapeHtml(post.image)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://moses-y.github.io/blog/${post.name}.html">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(post.displayName)}">
    <meta name="twitter:description" content="${escapeHtml((post.description || '').slice(0, 160))}">
    <meta name="twitter:image" content="${escapeHtml(post.image)}">

    <link rel="canonical" href="https://moses-y.github.io/blog/${post.name}.html">

    <!-- Mermaid.js for diagrams -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

    <link rel="stylesheet" href="/assets/css/blog-post.css">
    <!-- The audit findings reuse the report's markup rather than a second copy of
         it. Every rule in report.css is namespaced under .rpt, so it styles that
         section and cannot reach the article. -->
    <link rel="stylesheet" href="/assets/css/report.css">
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="../index.html" class="back-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Portfolio
                </a>
                <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
                    <svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                    <svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <main>
        <article class="container">
            <div class="post-header">
                <div class="post-meta">
                    <span>${formattedDate}</span>
                    <span>${post.readTime || 3} min read</span>
                    ${post.language ? `<span class="post-language">${post.language}</span>` : ''}
                    <span class="post-type">${post.type || 'fork'}</span>
                </div>
                <h1>${escapeHtml(post.displayName)}</h1>
                <p class="post-description">${escapeHtml(post.description || '')}</p>
                ${parentInfo}
            </div>


            <div class="listen-bar" id="listen-bar" hidden>
                <button class="listen-btn" id="listen-btn" aria-label="Listen to this briefing">
                    <span class="listen-icon" aria-hidden="true">&#9654;</span>
                    <span id="listen-label">Listen</span>
                </button>
                <button class="listen-stop" id="listen-stop" hidden aria-label="Stop">&#9632;</button>
                <span class="listen-progress" id="listen-progress" aria-live="polite"></span>
            </div>

            <div class="post-content" id="post-content">
                ${renderSummary(post.summary, post)}
            </div>

            ${renderAnalysis(post)}

            ${renderAudit(post)}

            ${post.topics && post.topics.length > 0 ? `
            <div class="post-topics">
                ${post.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
            ` : ''}

            <div class="post-actions">
                <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener" class="primary-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                    </svg>
                    View on GitHub
                </a>
                <a href="../index.html#projects" class="secondary-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    All Projects
                </a>
            </div>
        </article>
    </main>

    <footer>
        <div class="container">
            <p>&copy; ${new Date().getFullYear()} Moses Yebei. Built with automation and coffee.</p>
            <p style="margin-top: 8px;"><a href="../index.html">moses-y.github.io</a></p>
        </div>
    </footer>

    <script>
        // Read aloud via the browser's own voices. No API, no key, no audio files -
        // which matters because pre-rendering audio for every repo would blow past
        // the GitHub Pages size limit.
        (function () {
            // Feature-detect both halves: some embedded browsers expose speechSynthesis
            // without a usable SpeechSynthesisUtterance constructor.
            if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
            var bar = document.getElementById('listen-bar');
            var btn = document.getElementById('listen-btn');
            var stopBtn = document.getElementById('listen-stop');
            var label = document.getElementById('listen-label');
            var icon = btn.querySelector('.listen-icon');
            var progress = document.getElementById('listen-progress');
            var paras = [].slice.call(document.querySelectorAll('#post-content p'))
                .filter(function (p) { return p.textContent.trim().length; });
            if (!paras.length) return;
            bar.hidden = false;

            var idx = 0, playing = false;

            // One utterance per paragraph rather than one for the whole article:
            // long utterances get silently truncated in some engines, and this also
            // gives a natural progress readout and highlight.
            function speak(i) {
                if (i >= paras.length) { reset(); return; }
                idx = i;
                paras.forEach(function (p) { p.classList.remove('speaking'); });
                paras[i].classList.add('speaking');
                progress.textContent = (i + 1) + ' / ' + paras.length;
                var u = new SpeechSynthesisUtterance(paras[i].textContent);
                u.rate = 1.0;
                u.onend = function () { if (playing) speak(i + 1); };
                u.onerror = function () { reset(); };
                window.speechSynthesis.speak(u);
            }

            function reset() {
                playing = false;
                window.speechSynthesis.cancel();
                paras.forEach(function (p) { p.classList.remove('speaking'); });
                label.textContent = 'Listen';
                icon.innerHTML = '&#9654;';
                stopBtn.hidden = true;
                progress.textContent = '';
                idx = 0;
            }

            btn.addEventListener('click', function () {
                if (!playing) {
                    playing = true;
                    label.textContent = 'Pause';
                    icon.innerHTML = '&#10073;&#10073;';
                    stopBtn.hidden = false;
                    // Resume mid-paragraph if paused, otherwise start from where we were.
                    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
                    else speak(idx);
                } else {
                    playing = false;
                    window.speechSynthesis.pause();
                    label.textContent = 'Resume';
                    icon.innerHTML = '&#9654;';
                }
            });

            stopBtn.addEventListener('click', reset);
            // Speech keeps running after navigation otherwise.
            window.addEventListener('beforeunload', function () { window.speechSynthesis.cancel(); });
        })();

        // Theme toggle
        const toggle = document.getElementById('theme-toggle');
        const stored = localStorage.getItem('theme');
        if (stored) {
            document.documentElement.setAttribute('data-theme', stored);
        } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.setAttribute('data-theme', 'light');
        }
        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            // Re-initialize mermaid with new theme
            initMermaid();
        });

        // Initialize Mermaid
        function initMermaid() {
            // The library is a third-party CDN script. When jsDelivr is slow or blocked
            // this ran unguarded and threw "mermaid is not defined", aborting the rest
            // of the handler (and the theme toggle that calls it).
            if (typeof mermaid === 'undefined') return;
            if (!document.querySelector('.mermaid')) return;
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            mermaid.initialize({
                startOnLoad: false,
                theme: isDark ? 'dark' : 'default',
                themeVariables: isDark ? {
                    primaryColor: '#6366f1',
                    primaryTextColor: '#f8fafc',
                    primaryBorderColor: '#8b5cf6',
                    lineColor: '#64748b',
                    secondaryColor: '#1e1e2e',
                    tertiaryColor: '#0a0a0a'
                } : {
                    primaryColor: '#6366f1',
                    primaryTextColor: '#0f172a',
                    primaryBorderColor: '#8b5cf6',
                    lineColor: '#64748b'
                }
            });
            mermaid.run();
        }

        // Run on load
        document.addEventListener('DOMContentLoaded', initMermaid);
    </script>
</body>
</html>`;
}

async function main() {
    console.log('=== Blog Page Generator ===\n');

    // Check if forks.json exists
    if (!fs.existsSync('forks.json')) {
        console.error('Error: forks.json not found. Run update-forks.js first.');
        process.exit(1);
    }

    // Read forks.json
    const data = JSON.parse(fs.readFileSync('forks.json', 'utf8'));
    const allForks = data.forks || [];
    const posts = allForks.filter(f => f.summary);
    const awaiting = allForks.length - posts.length;
    if (awaiting > 0) {
        console.log(`Skipping ${awaiting} repos still awaiting article generation.`);
    }

    if (posts.length === 0) {
        console.log('No posts to generate.');
        return;
    }

    console.log(`Found ${posts.length} posts to generate.\n`);

    // Create blog directory if it doesn't exist
    // The stylesheet is written, not inlined. Every page links it, so it has to be
    // emitted by the same run that emits the pages or all 1,331 of them lose their
    // styling at once.
    const cssDir = path.join('assets', 'css');
    fs.mkdirSync(cssDir, { recursive: true });
    // The page styles, then the document styles. Order matters: the article rules
    // are meant to win where they overlap with the page's generic prose rules.
    fs.writeFileSync(path.join(cssDir, 'blog-post.css'),
      POST_CSS.trim() + '\n' + ARTICLE_CSS.trim() + '\n');
    console.log('Wrote assets/css/blog-post.css');

    if (!fs.existsSync(BLOG_DIR)) {
        fs.mkdirSync(BLOG_DIR, { recursive: true });
        console.log(`Created ${BLOG_DIR}/ directory`);
    }

    // Generate individual blog pages
    let generated = 0;
    for (const post of posts) {
        const filename = `${post.name}.html`;
        const filepath = path.join(BLOG_DIR, filename);
        const html = generateBlogPostHTML(post);

        fs.writeFileSync(filepath, html);
        console.log(`Generated: ${filepath}`);
        generated++;
    }

    // Generate blog index page
    const indexHtml = generateBlogIndexHTML(posts, data.lastUpdated);
    fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexHtml);
    console.log(`Generated: ${BLOG_DIR}/index.html`);

    console.log(`\n=== Complete ===`);
    console.log(`Generated ${generated} blog posts + index page`);
}

function generateBlogIndexHTML(posts, lastUpdated) {
    const postCards = posts.map(post => `
        <a href="${escapeHtml(post.name)}.html" class="post-card">
            <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.displayName)}" loading="lazy">
            <div class="post-card-content">
                <div class="post-card-meta">
                    <span>${escapeHtml(post.updatedAt || '')}</span>
                    ${post.language ? `<span class="lang">${escapeHtml(post.language)}</span>` : ''}
                </div>
                <h3>${escapeHtml(post.displayName)}</h3>
                <p>${escapeHtml((post.description || '').slice(0, 120))}${(post.description || '').length > 120 ? '...' : ''}</p>
            </div>
        </a>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog - Moses Yebei</title>
    <meta name="description" content="Technical articles and project deep-dives by Moses Yebei">

    <style>
${INDEX_CSS}
    </style>
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="../index.html" class="back-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Portfolio
                </a>
                <button class="theme-toggle" id="theme-toggle">
                    <svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                    <svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <main class="container">
        <div class="page-header">
            <h1>Blog</h1>
            <p>Technical deep-dives and project explorations</p>
            <p style="font-size: 0.875rem; margin-top: 8px; color: var(--text-tertiary);">Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'Unknown'}</p>
        </div>

        <div class="posts-grid">
            ${postCards}
        </div>
    </main>

    <footer>
        <div class="container">
            <p>&copy; ${new Date().getFullYear()} Moses Yebei</p>
            <p style="margin-top: 8px;"><a href="../index.html">moses-y.github.io</a></p>
        </div>
    </footer>

    <script>
        const toggle = document.getElementById('theme-toggle');
        const stored = localStorage.getItem('theme');
        if (stored) document.documentElement.setAttribute('data-theme', stored);
        else if (window.matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.setAttribute('data-theme', 'light');
        toggle.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    </script>
</body>
</html>`;
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
