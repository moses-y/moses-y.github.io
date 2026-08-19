/*
 * lib-site-chrome.js - the head, nav and footer every hand-written page shares.
 *
 * Split from build-pages.js at the 450-line limit. This is the part that is the
 * same on every page, so it is also the part where a change has to be made once
 * rather than in each template.
 *
 * SITE, CAL and YEAR are re-derived here rather than passed in: they are three
 * constants the chrome cannot render without, and threading them through every
 * call would be ceremony. YEAR is computed rather than written down because it
 * was hardcoded once and read 2025 throughout 2026.
 */
'use strict';

const SITE = 'https://moses-y.github.io';
const CAL = 'https://cal.com/moses-yebei';
const YEAR = new Date().getFullYear();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function head({ title, description, canonical, jsonld, keywords }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${SITE}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${SITE}/og-image.png">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
${jsonld ? `    <script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n    </script>\n` : ''}    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/site.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
</head>`;
}

const NAV = `    <a href="#main-content" class="skip-link">Skip to main content</a>
    <div class="gradient-bg"></div>
    <div class="grid-pattern"></div>
    <nav id="navbar">
        <div class="container nav-content">
            <a href="/" class="nav-logo">MY</a>
            <ul class="nav-links">
                <li><a href="/#skills">Skills</a></li>
                <li><a href="/#experience">Experience</a></li>
                <li><a href="/services.html">Services</a></li>
                <li><a href="/case-studies.html">Case Studies</a></li>
                <li><a href="/projects.html">Projects</a></li>
                <li><a href="/insights/">Insights</a></li>
                <li><a href="/knowledge-graph.html">Code Graph</a></li>
            </ul>
            <a href="${CAL}" target="_blank" rel="noopener" class="nav-cta">Book a call</a>
        </div>
    </nav>`;

const FOOTER = `    <footer>
        <div class="container">
            <p>&copy; ${YEAR} Moses Yebei. Based in Nairobi, Kenya. Built with <a href="https://github.com/moses-y/moses-y.github.io" target="_blank">passion</a>. <a href="/sitemap.html">Site map</a>.</p>
        </div>
    </footer>
    <button class="back-to-top" id="back-to-top" aria-label="Back to top">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
    </button>
    <script src="/assets/js/site.js"></script>
    <script src="/assets/js/animations.js" defer></script>
</body>
</html>`;

module.exports = { head, NAV, FOOTER, SITE, CAL, YEAR, esc };
