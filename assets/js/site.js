/* GENERATED FILE - do not edit.
 *
 * Built by scripts/build-bundles.js from assets/js/site/
 * Edit the partials there and run: node scripts/build-bundles.js
 *
 * Concatenated, not separate scripts: these partials share one top-level scope.
 */
/* nav */
        // Language colors
        const langColors = {
            'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3572A5',
            'Rust': '#dea584', 'Go': '#00ADD8', 'Java': '#b07219', 'C++': '#f34b7d',
            'C': '#555555', 'Ruby': '#701516', 'PHP': '#4F5D95', 'Swift': '#F05138',
            'Kotlin': '#A97BFF', 'Vue': '#41b883', 'HTML': '#e34c26', 'CSS': '#563d7c',
            'Shell': '#89e051', 'Jupyter Notebook': '#DA5B0B'
        };

        // ---- Navigation, rendered from one source ---------------------------
        // The nav was hand-copied into 18 pages. Only 4 had the current version, the
        // insights pages had no menu at all behind a visible menu button, and every
        // fix drifted again on the next page. Defined once here and injected, so the
        // header cannot differ between pages.
        const NAV_PRIMARY = [
            ['Projects', '/projects.html'],
            ['Code Graph', '/knowledge-graph.html'],
            ['Code Brain', '/code-brain.html'],
            ['Services', '/services.html'],
            ['Case Studies', '/case-studies.html'],
            ['About', '/#about']
        ];
        const NAV_MENU = [
            ['Work', [['Projects', '/projects.html'], ['Code Graph', '/knowledge-graph.html'],
                      ['Code Brain', '/code-brain.html'], ['Insights', '/insights/']]],
            ['Consulting', [['Services', '/services.html'], ['Case Studies', '/case-studies.html']]],
            ['About', [['About me', '/#about'], ['Skills', '/#skills'],
                       ['Experience', '/#experience'], ['Contact', '/#contact']]]
        ];
        const THEME_SVG =
            '<svg class="sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' +
            '<svg class="moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

        function renderNav() {
            const here = location.pathname.replace(/index\.html$/, '') || '/';
            const isHere = href => {
                const path = href.split('#')[0];
                return path && path !== '/' && here.indexOf(path) === 0;
            };

            const ul = document.querySelector('#navbar .nav-links');
            if (ul) {
                ul.innerHTML = NAV_PRIMARY.map(function (l) {
                    return '<li><a href="' + l[1] + '"' + (isHere(l[1]) ? ' class="active"' : '') + '>' + l[0] + '</a></li>';
                }).join('');
            }

            const nav = document.getElementById('navbar');
            if (!nav) return;

            // Several pages ship a menu button with no menu behind it.
            let menu = document.getElementById('mobile-menu');
            if (!menu) {
                menu = document.createElement('div');
                menu.className = 'mobile-menu';
                menu.id = 'mobile-menu';
                nav.parentNode.insertBefore(menu, nav.nextSibling);
            }
            const existingToggle = menu.querySelector('#mobile-theme-toggle');
            menu.innerHTML = NAV_MENU.map(function (g) {
                return '<span class="menu-group">' + g[0] + '</span>' +
                    g[1].map(function (l) {
                        return '<a href="' + l[1] + '"' + (isHere(l[1]) ? ' class="active"' : '') + '>' + l[0] + '</a>';
                    }).join('');
            }).join('');
            if (existingToggle) {
                menu.appendChild(existingToggle);
            } else {
                const b = document.createElement('button');
                b.className = 'theme-toggle mobile-theme-toggle';
                b.id = 'mobile-theme-toggle';
                b.setAttribute('aria-label', 'Toggle dark/light mode');
                b.innerHTML = THEME_SVG;
                menu.appendChild(b);
            }
            menu.querySelectorAll('a').forEach(function (a) {
                a.addEventListener('click', function () {
                    menu.classList.remove('active');
                    const t = document.getElementById('nav-toggle');
                    if (t) t.classList.remove('active');
                    document.body.style.overflow = '';
                });
            });

            // A menu button with nothing behind it is worse than no button.
            let toggle = document.getElementById('nav-toggle');
            if (!toggle) {
                toggle = document.createElement('button');
                toggle.className = 'nav-toggle';
                toggle.id = 'nav-toggle';
                toggle.setAttribute('aria-label', 'Toggle menu');
                toggle.innerHTML = '<span></span><span></span><span></span>';
                const content = nav.querySelector('.nav-content') || nav;
                content.appendChild(toggle);
            }
        }
        renderNav();

        // Mobile Menu
        const navToggle = document.getElementById('nav-toggle');
        const mobileMenu = document.getElementById('mobile-menu');

        navToggle && navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
        });

        function closeMobileMenu() {
            navToggle.classList.remove('active');
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        }

/* hero */
        // Typing Animation
        const typingPhrases = [
            'retrieval & embeddings at estate scale',
            'knowledge graphs from real source trees',
            'model routing that survives dead APIs',
            'computer vision & deep learning',
            'pipelines that repair themselves'
        ];
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        const typingSpeed = 80;
        const deletingSpeed = 40;
        const pauseDuration = 2000;

        function typeText() {
            const typingEl = document.getElementById('typing-text');
            if (!typingEl) return; // no hero on this page
            const currentPhrase = typingPhrases[phraseIndex];

            if (isDeleting) {
                typingEl.textContent = currentPhrase.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typingEl.textContent = currentPhrase.substring(0, charIndex + 1);
                charIndex++;
            }

            let timeout = isDeleting ? deletingSpeed : typingSpeed;

            if (!isDeleting && charIndex === currentPhrase.length) {
                timeout = pauseDuration;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % typingPhrases.length;
                timeout = 500;
            }

            setTimeout(typeText, timeout);
        }

        // Start typing animation
        setTimeout(typeText, 1000);

        // Active Nav Highlighting
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-links a');

        function highlightNav() {
            const scrollY = window.scrollY + 120;

            // Which section is currently in view?
            let current = null;
            sections.forEach(section => {
                const top = section.offsetTop;
                const h = section.offsetHeight;
                if (scrollY >= top && scrollY < top + h) current = section.getAttribute('id');
            });

            // Highlight the matching nav link. Links are root-absolute now, so match
            // both in-page anchors (/#skills) and page links whose target maps to a
            // homepage section (/services.html <-> #services, /projects.html <-> #projects).
            navLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                const match = !!current &&
                    (href.endsWith('#' + current) || href.endsWith('/' + current + '.html'));
                link.classList.toggle('active', match);
            });
        }

        // Sort Dropdown
        const sortBtn = document.getElementById('sort-btn');
        const sortMenu = document.getElementById('sort-menu');
        const sortLabel = document.getElementById('sort-label');
        let currentSort = 'recent';

        sortBtn && sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortMenu.classList.toggle('open');
        });

        document.addEventListener('click', () => {
            sortMenu && sortMenu.classList.remove('open');
        });

        document.querySelectorAll('.sort-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.sort-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentSort = option.dataset.sort;
                sortLabel.textContent = option.textContent;
                sortMenu.classList.remove('open');
                sortProjects();
            });
        });

        function sortProjects() {
            const projectsToSort = filteredProjects.length ? filteredProjects : allProjects;

            if (currentSort === 'recent') {
                projectsToSort.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            } else if (currentSort === 'stars') {
                projectsToSort.sort((a, b) => (b.parent?.stars || b.stars || 0) - (a.parent?.stars || a.stars || 0));
            } else if (currentSort === 'name') {
                projectsToSort.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            }

            currentPage = 1;
            renderCurrentPage();
        }

        // Navbar scroll effect & Back to top & Active nav
        const navbar = document.getElementById('navbar');
        const backToTop = document.getElementById('back-to-top');

        window.addEventListener('scroll', () => {
            navbar && navbar.classList.toggle('scrolled', window.scrollY > 50);
            backToTop && backToTop.classList.toggle('visible', window.scrollY > 500);
            highlightNav();
        });

        backToTop && backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

/* stats */
        // Animate Stats - real Code Brain metrics, K-formatted.
        let statsAnimated = false;
        function fmtStat(n) {
            n = Math.floor(n);
            return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
        }
        function animateStats(stats) {
            const fields = [
                ['stat-repos', stats.repos],
                ['stat-languages', stats.languages],
                ['stat-files', stats.filesAnalyzed],
                ['stat-modules', stats.modulesMapped],
                ['stat-findings', stats.findings]
            ].filter(f => document.getElementById(f[0]) && f[1] != null);
            if (!fields.length) return;               // hero stats only exist on the home page
            const duration = 1800, start = performance.now();
            function update(now) {
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                fields.forEach(([id, val]) => {
                    document.getElementById(id).textContent = fmtStat(val * eased) + '+';
                });
                if (progress < 1) requestAnimationFrame(update);
            }
            requestAnimationFrame(update);
        }

        // Dynamic stats. repos / languages / files are computed LIVE from the loaded
        // projects (forks.json) so they're always current. modules / findings need the
        // 55+ per-repo deep graphs, so those two come from the CI-precomputed stats.json
        // (refreshed every run). renderStats() merges whichever sources are ready and
        // re-animates when better data arrives.
        // Data flow for the hero stats:
        //   repos / languages / files  -> computed LIVE in the browser from forks.json
        //     (the same source scripts/build-stats.js uses, with identical logic), so
        //     they are always current and never depend on a precomputed snapshot.
        //   modules / findings         -> from stats.json, because they require reading
        //     the per-repo deep graphs (55+ files) which is too much to fetch client-side.
        // forks.json gzips to ~750KB (smaller than the forks.db already loaded), so the
        // extra fetch is cheap. stats.json values act as a fallback if forks.json fails.
        let deepStats = { repos: null, languages: null, filesAnalyzed: null, modulesMapped: null, findings: null };
        function renderStats() {
            const live = (typeof allProjects !== 'undefined' && allProjects.length) ? calculateStats(allProjects) : {};
            const pick = (a, b) => (a != null ? a : b);
            animateStats({
                repos: pick(deepStats.repos, live.repos),
                languages: pick(deepStats.languages, live.languages),
                filesAnalyzed: pick(deepStats.filesAnalyzed, live.filesAnalyzed),
                modulesMapped: deepStats.modulesMapped,
                findings: deepStats.findings
            });
        }
        // Curiosity hooks computed from the index rather than typed into the page, so a
        // number can never drift from the estate it describes. Each links to the
        // evidence rather than asking to be believed.
        function renderFindings(idx) {
            const grid = document.getElementById('findings-grid');
            if (!grid || !idx || !idx.repos) return;
            const R = idx.repos, n = R.length;
            const flag = (r, i) => (r.c || '00000')[i] === '1';
            const pct = v => Math.round(v / n * 100);

            const secrets = R.filter(r => flag(r, 4));
            const noTests = R.filter(r => !flag(r, 0));
            const docker  = R.filter(r => flag(r, 2));
            const noLicense = R.filter(r => !flag(r, 3));

            const items = [
                { n: secrets.length, label: 'ship credentials in the repository',
                  sub: 'Keys, .env files and certificates committed to source control. Almost all are forks of other people\'s projects, found by the scanner.',
                  href: '/projects.html?flag=secrets', tone: 'bad' },
                { n: noTests.length, label: 'have no test suite at all',
                  sub: pct(noTests.length) + '% of the estate. Not one test file detected.',
                  href: '/projects.html?flag=notests', tone: 'warn' },
                { n: noLicense.length, label: 'declare no license',
                  sub: 'Legally unusable by anyone who finds them.',
                  href: '/projects.html?flag=nolicense', tone: 'warn' },
                { n: docker.length, label: 'are container-ready',
                  sub: pct(docker.length) + '% ship a Dockerfile and can be run today.',
                  href: '/projects.html?flag=docker', tone: 'good' }
            ];

            grid.innerHTML = items.map(function (it) {
                return '<a class="finding-card tone-' + it.tone + '" href="' + it.href + '">'
                    + '<div class="fc-n">' + it.n.toLocaleString('en-US') + '</div>'
                    + '<div class="fc-l">repositories ' + it.label + '</div>'
                    + '<p class="fc-s">' + it.sub + '</p>'
                    + '<span class="fc-go">See them &rarr;</span></a>';
            }).join('');

            const hr = document.getElementById('hero-repos');
            if (hr) hr.textContent = n.toLocaleString('en-US');
        }

        // Draws the estate behind the hero from the umap coordinates already in the
        // index: 1295 points and their strongest similarity links. Deliberately 2D
        // canvas rather than the 3D graph - same data, no WebGL, no second fetch.
        function drawHeroMap(idx) {
            const cv = document.getElementById('hero-map');
            if (!cv || !idx || !idx.repos) return;
            const pts = idx.repos.filter(r => r.u);
            if (!pts.length) return;

            const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
            const DOM_COLOR = {
                'AI & Data': '#E0521F', 'Web & Interfaces': '#C08457',
                'Systems & Infra': '#6d9e70', 'Mobile': '#D9A441'
            };
            const pos = new Map(pts.map(r => [r.i, r]));
            // The strongest links only: 3187 faint lines is noise, not a picture.
            const links = (idx.links || [])
                .filter(l => l[2] >= 0.55 && pos.has(l[0]) && pos.has(l[1]))
                .slice(0, 900);

            let w = 0, h = 0, t = 0, raf = 0;
            const ctx = cv.getContext('2d');
            const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

            function size() {
                const d = Math.min(2, window.devicePixelRatio || 1);
                const b = cv.getBoundingClientRect();
                w = b.width; h = b.height;
                cv.width = Math.max(1, w * d); cv.height = Math.max(1, h * d);
                ctx.setTransform(d, 0, 0, d, 0, 0);
            }
            // Fill the frame and keep the layout square so clusters stay recognisable.
            const P = (r, drift) => {
                const span = Math.max(w, h) * 1.05;
                const ox = (w - span) / 2, oy = (h - span) / 2;
                const wob = drift ? Math.sin(t / 90 + r.u[2] * 6) * 3 : 0;
                return { x: ox + r.u[0] * span + wob, y: oy + r.u[1] * span - wob };
            };

            function frame() {
                ctx.clearRect(0, 0, w, h);
                ctx.strokeStyle = css('--accent') || '#C08457';
                ctx.globalAlpha = 0.10; ctx.lineWidth = 0.6;
                ctx.beginPath();
                for (const l of links) {
                    const a = P(pos.get(l[0]), !still), b = P(pos.get(l[1]), !still);
                    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                }
                ctx.stroke();
                for (const r of pts) {
                    const p = P(r, !still);
                    ctx.globalAlpha = r.x ? 0.75 : 0.42;
                    ctx.fillStyle = DOM_COLOR[r.g] || '#9C8B7D';
                    const rad = 1 + Math.min(2.6, (r.f || 0) / 400);
                    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.284); ctx.fill();
                }
                ctx.globalAlpha = 1;
                if (!still) { t += 1; raf = requestAnimationFrame(frame); }
            }

            size(); frame();
            addEventListener('resize', () => { size(); if (still) frame(); });
            // Nothing to animate while it is off-screen.
            if (!still && 'IntersectionObserver' in window) {
                new IntersectionObserver(es => {
                    for (const e of es) {
                        if (e.isIntersecting && !raf) { raf = requestAnimationFrame(frame); }
                        else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
                    }
                }, { threshold: 0 }).observe(cv);
            }
            const cta = document.querySelector('.hero-map-cta span');
            if (cta) cta.textContent = pts.length.toLocaleString('en-US') + ' repositories, positioned by meaning';
        }

        async function loadStats() {
            const [forks, stats] = await Promise.all([
                fetch('/data/index.json', { cache: 'no-cache' })
                    .then(r => r.ok ? r.json() : null)
                    .then(i => { if (i) { renderFindings(i); drawHeroMap(i); } return i && i.repos ? { forks: i.repos.map(expandIndexRecord) } : null; })
                    .catch(() => null),
                fetch('/stats.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)
            ]);
            // Live, accurate counts straight from the feed.
            if (forks && Array.isArray(forks.forks) && forks.forks.length) {
                const live = calculateStats(forks.forks);
                deepStats.repos = live.repos;
                deepStats.languages = live.languages;
                deepStats.filesAnalyzed = live.filesAnalyzed;
            } else if (stats) {
                deepStats.repos = stats.repos;
                deepStats.languages = stats.languages;
                deepStats.filesAnalyzed = stats.filesAnalyzed;
            }
            // Modules / findings only exist in the CI-computed aggregate.
            if (stats) {
                deepStats.modulesMapped = stats.modulesMapped;
                deepStats.findings = stats.findings;
            }
            renderStats();
        }

/* index-records */
        // Reveal animation
        const revealElements = document.querySelectorAll('.reveal');
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        revealElements.forEach(el => revealObserver.observe(el));

        // Escape HTML to prevent XSS from user-controlled data
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Lean index records use short keys to keep the file small. This restores the
        // field names the renderers use, so nothing downstream had to change.
        function expandIndexRecord(r) {
            const c = r.c || '00000';
            return {
                id: r.i, name: r.n, displayName: r.t,
                description: r.d, summary: null,
                url: 'https://github.com/moses-y/' + r.n,
                language: r.l, domain: r.g, kind: r.k,
                stars: r.s, type: r.y ? 'original' : 'fork',
                image: r.m, readTime: r.r || 2, updatedAt: r.z,
                parent: r.p ? { name: r.p.n, url: r.p.u, stars: r.p.s } : null,
                topics: [], umap: r.u, hasArticle: !!r.a, findings: r.x,
                v: r.v,     // audit severities; undefined (unaudited) is not 0 (clean)
                knowledgeGraph: {
                    totalFiles: r.f,
                    codeHealth: {
                        hasTests: c[0] === '1', hasLicense: c[3] === '1',
                        committedSecrets: c[4] === '1' ? 1 : 0
                    },
                    hasCI: c[1] === '1', hasDocker: c[2] === '1'
                }
            };
        }

/* projects */
        // Render project card
        //
        // The stock photo is gone. It was a random Unsplash image unrelated to
        // the repository, spending roughly 40% of the card on decoration while
        // the things we actually measured - files, issues, whether it has tests
        // or CI - were not shown at all.
        //
        // The briefing is not in this payload on purpose: the lean index omits
        // the 3,200-character summaries, so the card links into the reader,
        // which fetches one article on demand.
        function renderProject(p) {
            const kg = p.knowledgeGraph || {};
            const h = kg.codeHealth || {};
            const files = kg.totalFiles || 0;
            const issues = p.findings || 0;

            const facts = [];
            if (files) facts.push(`<span class="fact"><strong>${files.toLocaleString()}</strong> files</span>`);
            if (issues) facts.push(`<span class="fact"><strong>${issues.toLocaleString()}</strong> ${issues === 1 ? 'issue' : 'issues'}</span>`);
            facts.push(`<span class="fact"><strong>${p.stars || p.parent?.stars || 0}</strong> stars</span>`);

            // Present state, absent state, and a warning are three different
            // things, so they do not all render as the same grey pill.
            const flag = (label, on, warn) =>
                `<span class="flag ${warn ? 'warn' : (on ? 'on' : 'off')}">${on || warn ? '✓' : '✗'} ${label}</span>`;
            const flags = [
                flag('tests', h.hasTests),
                flag('CI', kg.hasCI),
                flag('Docker', kg.hasDocker),
                flag('license', h.hasLicense)
            ];
            if (h.committedSecrets) flags.unshift('<span class="flag warn">! secrets</span>');

            // Audit chip, in ReportRender: the audit is rendered there already.
            const health = window.ReportRender ? ReportRender.healthChip(p.v) : '';
            return `
                <article class="project-card" data-id="${escapeHtml(String(p.id))}">
                    <div class="content">
                        <div class="card-top">
                            <span class="type-badge ${p.type || 'fork'}">${p.type === 'original' ? 'Original' : 'Fork'}</span>
                            ${p.language ? `<span class="language"><span class="lang-dot" style="background: ${langColors[p.language] || '#888'}"></span>${escapeHtml(p.language)}</span>` : ''}
                            ${p.kind ? `<span class="kind">${escapeHtml(p.kind)}</span>` : ''}
                            ${health}
                        </div>
                        <h3><button type="button" class="card-title" data-read="${escapeHtml(String(p.id))}">${escapeHtml(p.displayName || p.name)}</button></h3>
                        <p class="card-desc">${escapeHtml(p.description || 'No description available')}</p>
                        <div class="facts">${facts.join('')}</div>
                        <div class="flags">${flags.join('')}</div>
                        <div class="footer">
                            <button type="button" class="read-btn" data-read="${escapeHtml(String(p.id))}">
                                Read briefing
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                            </button>
                            <a href="${escapeHtml(p.url)}" class="gh-btn" target="_blank" rel="noopener">GitHub ↗</a>
                        </div>
                    </div>
                </article>
            `;
        }

        // One listener for the whole grid rather than an inline handler per card.
        document.addEventListener('click', function (e) {
            const t = e.target.closest('[data-read]');
            if (!t || !window.SiteReader) return;
            const p = allProjects.find(x => String(x.id) === t.dataset.read);
            if (!p) return;
            // The queue is whatever the visitor is currently looking at, filters
            // and search included, so reading straight through follows the list
            // they built rather than the whole estate.
            SiteReader.open(Object.assign({}, p, {
                queue: (filteredProjects && filteredProjects.length ? filteredProjects : allProjects)
            }));
        });

        // Pagination & Filter state
        let allProjects = [];
        let filteredProjects = [];
        let currentPage = 1;
        let currentFilter = 'all';
        let searchQuery = '';
        const itemsPerPage = 10;

        // Filter projects
        // Deep links from the landing's findings band. Without this, "See them" landed
        // on an unfiltered list and the number on the card meant nothing.
        const FLAG_TESTS = {
            secrets:   r => (r.c || '00000')[4] === '1',
            notests:   r => (r.c || '00000')[0] !== '1',
            nolicense: r => (r.c || '00000')[3] !== '1',
            docker:    r => (r.c || '00000')[2] === '1'
        };
        const FLAG_LABELS = {
            secrets: 'shipping credentials in the repository',
            notests: 'with no test suite',
            nolicense: 'with no license declared',
            docker: 'that are container-ready'
        };
        let urlFlag = null;
        try {
            const q = new URLSearchParams(location.search).get('flag');
            if (q && FLAG_TESTS[q]) urlFlag = q;
        } catch (e) { /* no URLSearchParams, no deep link */ }

        function flagMatches(p) {
            if (!urlFlag) return true;
            const kg = p.knowledgeGraph || {}, h = kg.codeHealth || {};
            const c = [h.hasTests ? 1 : 0, kg.hasCI ? 1 : 0, kg.hasDocker ? 1 : 0,
                       h.hasLicense ? 1 : 0, (h.committedSecrets > 0) ? 1 : 0].join('');
            return FLAG_TESTS[urlFlag]({ c });
        }

        function showFlagNotice(count) {
            if (!urlFlag) return;
            const host = document.getElementById('projects-controls') || document.getElementById('projects-container');
            if (!host || document.getElementById('flag-notice')) return;
            const el = document.createElement('div');
            el.id = 'flag-notice';
            el.className = 'flag-notice';
            el.innerHTML = '<span>Showing <strong>' + count.toLocaleString('en-US') + '</strong> repositories '
                + FLAG_LABELS[urlFlag] + '.</span><a href="/projects.html">Clear filter</a>';
            host.parentNode.insertBefore(el, host);
        }

        function filterProjects() {
            filteredProjects = allProjects.filter(p => {
                if (!flagMatches(p)) return false;
                // Search filter
                const matchesSearch = !searchQuery ||
                    p.name.toLowerCase().includes(searchQuery) ||
                    (p.displayName || '').toLowerCase().includes(searchQuery) ||
                    (p.description || '').toLowerCase().includes(searchQuery) ||
                    (p.language || '').toLowerCase().includes(searchQuery);

                // Type/Language filter
                let matchesFilter = true;
                if (currentFilter === 'original') matchesFilter = p.type === 'original';
                else if (currentFilter === 'fork') matchesFilter = p.type === 'fork';
                else if (currentFilter === 'python') matchesFilter = (p.language || '').toLowerCase() === 'python';
                else if (currentFilter === 'javascript') matchesFilter = (p.language || '').toLowerCase() === 'javascript';

                return matchesSearch && matchesFilter;
            });

            currentPage = 1;
            renderCurrentPage();
        }

        // Render current page
        function renderCurrentPage() {
            const container = document.getElementById('projects-container');
            const projectsToRender = filteredProjects.length ? filteredProjects : allProjects;
            const start = (currentPage - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const pageProjects = projectsToRender.slice(start, end);

            if (pageProjects.length === 0) {
                container.innerHTML = '<div class="projects-loading"><p>No projects found matching your criteria.</p></div>';
                document.getElementById('pagination').style.display = 'none';
                return;
            }

            container.innerHTML = pageProjects.map(renderProject).join('');

            // Update pagination info
            const totalPages = Math.ceil(projectsToRender.length / itemsPerPage);
            const showStart = start + 1;
            const showEnd = Math.min(end, projectsToRender.length);

            document.getElementById('page-info').textContent = `${showStart}-${showEnd}`;
            document.getElementById('total-info').textContent = `of ${projectsToRender.length} repos`;
            document.getElementById('prev-btn').disabled = currentPage === 1;
            document.getElementById('next-btn').disabled = currentPage === totalPages;
            document.getElementById('pagination').style.display = projectsToRender.length > itemsPerPage ? 'flex' : 'none';

            // Scroll to projects section
            if (currentPage > 1) {
                document.getElementById('projects').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // Change page
        function changePage(direction) {
            const projectsToRender = filteredProjects.length ? filteredProjects : allProjects;
            const totalPages = Math.ceil(projectsToRender.length / itemsPerPage);
            const newPage = currentPage + direction;

            if (newPage >= 1 && newPage <= totalPages) {
                currentPage = newPage;
                renderCurrentPage();
            }
        }

        // Search & Filter event listeners
        const searchInput = document.getElementById('search-input');
        searchInput && searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            filterProjects();
        });

        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentFilter = chip.dataset.filter;
                filterProjects();
            });
        });

        // View Toggle
        const gridViewBtn = document.getElementById('grid-view');
        const listViewBtn = document.getElementById('list-view');
        const projectsContainer = document.getElementById('projects-container');

        gridViewBtn && gridViewBtn.addEventListener('click', () => {
            gridViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
            projectsContainer.classList.remove('list-view');
        });

        listViewBtn && listViewBtn.addEventListener('click', () => {
            listViewBtn.classList.add('active');
            gridViewBtn.classList.remove('active');
            projectsContainer.classList.add('list-view');
        });

        // Fallback stats from the projects feed (used only if stats.json is missing).
        // Files come from the real knowledge-graph data; modules/findings need the

/* repo-stats */
        // deep graphs, so they stay 0 in the fallback rather than being faked.
        const NON_CODE = { Markdown:1, JSON:1, YAML:1, TOML:1, INI:1, XML:1, CSV:1, Text:1, SVG:1, Dockerfile:1, Makefile:1, HTML:1 };
        // Mirrors scripts/build-stats.js primaryLanguage() exactly so the in-browser
        // numbers match the CI computation: prefer the repo's own language, else the
        // dominant non-boilerplate language from its knowledge graph, else any language.
        function primaryLang(p) {
            if (p.language) return p.language;
            const langs = (p.knowledgeGraph && p.knowledgeGraph.languages) || {};
            let best = null, bestN = 0;
            Object.keys(langs).forEach(k => { if (NON_CODE[k]) return; if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
            if (!best) Object.keys(langs).forEach(k => { if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
            return best || null;
        }
        function calculateStats(projects) {
            const languages = new Set();
            let files = 0;
            projects.forEach(p => {
                const l = primaryLang(p); if (l) languages.add(l);
                files += (p.knowledgeGraph?.totalFiles) || 0;
            });
            return { repos: projects.length, languages: languages.size, filesAnalyzed: files, modulesMapped: null, findings: null };
        }

        // Render Featured Projects (top 3 by stars)
        function renderFeaturedProjects(projects) {
            const featured = [...projects]
                .sort((a, b) => (b.parent?.stars || b.stars || 0) - (a.parent?.stars || a.stars || 0))
                .slice(0, 3);

            if (featured.length === 0) return;

            const featuredSection = document.getElementById('featured-section');
            const featuredGrid = document.getElementById('featured-grid');

            featuredGrid.innerHTML = featured.map(p => `
                <div class="featured-card">
                    ${renderProject(p)}
                </div>
            `).join('');

            featuredSection.style.display = 'block';
        }

        // Normalize DB row to match the shape renderProject expects
        function normalizeRepo(r) {
            return {
                id: r.id, name: r.name,
                displayName: r.display_name || r.name,
                description: r.description,
                summary: r.summary,
                url: r.url, language: r.language,
                stars: r.stars, forks: r.forks,
                type: r.type || 'fork',
                image: r.image,
                forkedAt: r.forked_at, updatedAt: r.updated_at,
                readTime: r.read_time || 2,
                topics: r.topics || [],
                parent: r.parent || null
            };
        }

        // Load projects from SQLite database, with JSON fallback
        async function loadProjects() {
            const container = document.getElementById('projects-container');
            // The full feed renders only where #projects-container exists (projects.html).
            // On the home page we still load data to animate the hero stats, but skip rendering.
            const controls = document.getElementById('projects-controls');
            const pagination = document.getElementById('pagination');
            const updatedEl = document.getElementById('last-updated');

            try {
                // data/index.json is the read-side build: 160KB gzipped for all 1295
                // repos, versus the 2.4MB forks.json and the 11.7MB SQLite copy of the
                // same rows that this page used to pull. Article prose and file trees
                // are not here by design - the card never showed them.
                let loadedFromDb = false;
                try {
                    const ires = await fetch('/data/index.json', { cache: 'no-cache' });
                    if (ires.ok) {
                        const idx = await ires.json();
                        if (idx.repos?.length) {
                            allProjects = idx.repos.map(expandIndexRecord);
                            loadedFromDb = true;
                            if (idx.generated && updatedEl) {
                                updatedEl.textContent = `Last updated: ${new Date(idx.generated).toLocaleDateString('en-US', {
                                    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}`;
                            }
                        }
                    }
                } catch (idxErr) {
                    console.log('Index unavailable, falling back to forks.json:', idxErr.message);
                }

                // Fallback to forks.json
                if (!loadedFromDb) {
                    const res = await fetch('forks.json');
                    if (!res.ok) throw new Error('No data');
                    const data = await res.json();
                    if (!data.forks?.length) {
                        if (container) container.innerHTML = '<div class="projects-loading"><p>No projects yet.</p></div>';
                        return;
                    }
                    allProjects = data.forks;

                    if (data.lastUpdated && updatedEl) {
                        updatedEl.textContent = `Last updated: ${new Date(data.lastUpdated).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}`;
                    }
                }

                if (urlFlag) {
                    allProjects = allProjects.filter(flagMatches);
                    showFlagNotice(allProjects.length);
                }
                filteredProjects = [...allProjects];
                if (container) {
                    renderFeaturedProjects(allProjects);
                    renderCurrentPage();
                    if (controls) controls.style.display = 'flex';
                    if (pagination && allProjects.length > itemsPerPage) {
                        pagination.style.display = 'flex';
                    }
                }
                renderStats();
            } catch (e) {
                // Last resort: GitHub API
                try {
                    const res = await fetch('https://api.github.com/users/moses-y/repos?sort=updated&per_page=30');
                    const repos = await res.json();
                    allProjects = repos.map((r, i) => ({
                        id: r.id, name: r.name,
                        displayName: r.name.replace(/-/g, ' ').replace(/_/g, ' '),
                        description: r.description || 'An interesting project.',
                        summary: r.description || 'An interesting project.',
                        url: r.html_url, language: r.language,
                        stars: r.stargazers_count, type: r.fork ? 'fork' : 'original',
                        image: `https://images.unsplash.com/photo-${['1461749280684-dccba630e2f6','1555066931-4365d14bab8c','1504639725590-34d0984388bd'][i % 3]}?w=800&h=400&fit=crop`,
                        readTime: 2
                    }));
                    filteredProjects = [...allProjects];
                    if (container) {
                        renderCurrentPage();
                        if (controls) controls.style.display = 'flex';
                        if (pagination && allProjects.length > itemsPerPage) {
                            pagination.style.display = 'flex';
                        }
                    }
                    renderStats();
                } catch {
                    if (container) container.innerHTML = '<div class="projects-loading"><p>Unable to load projects.</p></div>';
                }
            }
        }

/* theme */
        // Theme Toggle
        const themeToggle = document.getElementById('theme-toggle');
        const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
        const storedTheme = localStorage.getItem('theme');

        // Apply stored theme or detect system preference
        if (storedTheme) {
            document.documentElement.setAttribute('data-theme', storedTheme);
        } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.setAttribute('data-theme', 'light');
        }

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        }

        themeToggle && themeToggle.addEventListener('click', toggleTheme);
        mobileThemeToggle && mobileThemeToggle.addEventListener('click', toggleTheme);

        // GitHub Contribution Heatmap
        async function loadGitHubHeatmap() {
            const grid = document.getElementById('heatmap-grid');
            const monthsContainer = document.getElementById('heatmap-months');
            const countEl = document.getElementById('heatmap-count');
            // Heatmap only exists on the home page - skip elsewhere.
            if (!grid) return;

            try {
                // Fetch contribution data from GitHub events API
                const response = await fetch('https://api.github.com/users/moses-y/events?per_page=100');
                if (!response.ok) throw new Error('API error');

                const events = await response.json();

                // Generate last 365 days of dates
                const today = new Date();
                const oneYearAgo = new Date(today);
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

                // Create contribution map from events
                const contributions = new Map();
                events.forEach(event => {
                    const date = event.created_at.split('T')[0];
                    contributions.set(date, (contributions.get(date) || 0) + 1);
                });

                // Find max for normalization
                const maxContributions = Math.max(...contributions.values(), 1);

                // Generate weeks (53 weeks in a year)
                const weeks = [];
                let currentDate = new Date(oneYearAgo);

                // Align to Sunday
                while (currentDate.getDay() !== 0) {
                    currentDate.setDate(currentDate.getDate() - 1);
                }

                while (currentDate <= today) {
                    const week = [];
                    for (let i = 0; i < 7; i++) {
                        const dateStr = currentDate.toISOString().split('T')[0];
                        const count = contributions.get(dateStr) || 0;
                        const level = count === 0 ? 0 : Math.ceil((count / maxContributions) * 4);
                        week.push({
                            date: dateStr,
                            count,
                            level: Math.min(level, 4),
                            month: currentDate.getMonth(),
                            day: currentDate.getDate()
                        });
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                    weeks.push(week);
                }

                // Render months
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                let lastMonth = -1;
                let monthHtml = '';
                weeks.forEach((week, i) => {
                    const firstDay = week[0];
                    if (firstDay && firstDay.month !== lastMonth && firstDay.day <= 7) {
                        monthHtml += `<span class="heatmap-month">${monthNames[firstDay.month]}</span>`;
                        lastMonth = firstDay.month;
                    }
                });
                monthsContainer.innerHTML = monthHtml;

                // Render grid
                const totalContributions = [...contributions.values()].reduce((a, b) => a + b, 0);
                grid.innerHTML = weeks.map(week => `
                    <div class="heatmap-week">
                        ${week.map(day => `
                            <div class="heatmap-day"
                                 data-level="${day.level}"
                                 title="${day.date}: ${day.count} contributions">
                            </div>
                        `).join('')}
                    </div>
                `).join('');

                countEl.textContent = `${totalContributions} public events · last ~90 days`;
            } catch (e) {
                // Fallback: generate mock data based on stats
                generateMockHeatmap();
            }
        }

/* extras */
        function generateMockHeatmap() {
            const grid = document.getElementById('heatmap-grid');
            const monthsContainer = document.getElementById('heatmap-months');
            const countEl = document.getElementById('heatmap-count');

            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const today = new Date();
            let currentDate = new Date(today);
            currentDate.setFullYear(currentDate.getFullYear() - 1);

            // Align to Sunday
            while (currentDate.getDay() !== 0) {
                currentDate.setDate(currentDate.getDate() - 1);
            }

            const weeks = [];
            let totalContributions = 0;

            while (currentDate <= today) {
                const week = [];
                for (let i = 0; i < 7; i++) {
                    // Generate pseudo-random but consistent activity based on date
                    const seed = currentDate.getTime();
                    const rand = Math.sin(seed) * 10000;
                    const activity = Math.floor((rand - Math.floor(rand)) * 5);
                    const level = Math.max(0, Math.min(4, activity));
                    if (level > 0) totalContributions += level;

                    week.push({
                        date: currentDate.toISOString().split('T')[0],
                        level,
                        month: currentDate.getMonth(),
                        day: currentDate.getDate()
                    });
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                weeks.push(week);
            }

            // Render months
            let lastMonth = -1;
            let monthHtml = '';
            weeks.forEach(week => {
                const firstDay = week[0];
                if (firstDay && firstDay.month !== lastMonth && firstDay.day <= 7) {
                    monthHtml += `<span class="heatmap-month">${monthNames[firstDay.month]}</span>`;
                    lastMonth = firstDay.month;
                }
            });
            monthsContainer.innerHTML = monthHtml;

            grid.innerHTML = weeks.map(week => `
                <div class="heatmap-week">
                    ${week.map(day => `<div class="heatmap-day" data-level="${day.level}"></div>`).join('')}
                </div>
            `).join('');

            countEl.textContent = `${totalContributions} public events · last ~90 days`;
        }

        // Contact Form Handler
        const contactForm = document.getElementById('contact-form');
        const formStatus = document.getElementById('form-status');

        contactForm && contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('.form-submit');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            formStatus.className = 'form-status';
            formStatus.style.display = 'none';

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: new FormData(contactForm),
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    formStatus.textContent = 'Message sent successfully! I\'ll get back to you soon.';
                    formStatus.className = 'form-status success';
                    contactForm.reset();
                } else {
                    throw new Error('Form submission failed');
                }
            } catch (error) {
                formStatus.textContent = 'Something went wrong. Please try emailing me directly.';
                formStatus.className = 'form-status error';
            }

            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });

        loadStats();
        loadGitHubHeatmap();
        loadProjects();
