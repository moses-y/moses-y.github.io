        // Language colors
        const langColors = {
            'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3572A5',
            'Rust': '#dea584', 'Go': '#00ADD8', 'Java': '#b07219', 'C++': '#f34b7d',
            'C': '#555555', 'Ruby': '#701516', 'PHP': '#4F5D95', 'Swift': '#F05138',
            'Kotlin': '#A97BFF', 'Vue': '#41b883', 'HTML': '#e34c26', 'CSS': '#563d7c',
            'Shell': '#89e051', 'Jupyter Notebook': '#DA5B0B'
        };

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

        // Typing Animation
        const typingPhrases = [
            'AI policy & governance',
            'data governance & AI readiness',
            'forward-deployed engineering',
            'model training & fine-tuning'
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
            const scrollY = window.scrollY + 100;

            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.offsetHeight;
                const sectionId = section.getAttribute('id');

                if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${sectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
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

        // Animate Stats — real Code Brain metrics, K-formatted.
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
        let deepStats = { modulesMapped: null, findings: null };
        function renderStats() {
            const live = (typeof allProjects !== 'undefined' && allProjects.length) ? calculateStats(allProjects) : {};
            animateStats({
                repos: live.repos,
                languages: live.languages,
                filesAnalyzed: live.filesAnalyzed,
                modulesMapped: deepStats.modulesMapped,
                findings: deepStats.findings
            });
        }
        async function loadStats() {
            try {
                const r = await fetch('/stats.json', { cache: 'no-cache' });
                if (!r.ok) return;
                const s = await r.json();
                deepStats.modulesMapped = s.modulesMapped;
                deepStats.findings = s.findings;
                // Seed repos/languages/files too, so the bar fills even before projects load.
                if (typeof allProjects === 'undefined' || !allProjects.length) {
                    animateStats({ repos: s.repos, languages: s.languages, filesAnalyzed: s.filesAnalyzed, modulesMapped: s.modulesMapped, findings: s.findings });
                } else {
                    renderStats();
                }
            } catch (e) { /* live projects-derived stats still render */ }
        }

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

        // Toggle read more
        function toggleRead(btn) {
            const summary = btn.previousElementSibling;
            const isCollapsed = summary.classList.contains('collapsed');
            summary.classList.toggle('collapsed');
            btn.innerHTML = isCollapsed
                ? 'Show less <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>'
                : 'Read more <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
        }

        // Escape HTML to prevent XSS from user-controlled data
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Simple markdown parser for blog content
        function parseMarkdown(text) {
            if (!text) return '';
            return text
                .replace(/^## (.+)$/gm, '<h4 class="md-heading">$1</h4>')
                .replace(/^### (.+)$/gm, '<h5 class="md-subheading">$1</h5>')
                .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="md-code"><code>$2</code></pre>')
                .replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\n\n+/g, '</p><p class="md-para">')
                .replace(/^(.)/m, '<p class="md-para">$1')
                + '</p>';
        }

        // Render project card
        function renderProject(p) {
            const hasLongSummary = (p.summary || '').length > 300;
            return `
                <article class="project-card">
                    <div class="image-wrap">
                        <img class="image" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.displayName || p.name)}" loading="lazy"
                             onerror="this.src='https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=400&fit=crop'">
                        <div class="image-overlay"></div>
                        <span class="type-badge ${p.type || 'fork'}">${p.type === 'original' ? 'Original' : 'Fork'}</span>
                    </div>
                    <div class="content">
                        <div class="meta">
                            <span class="meta-item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                ${p.readTime || 2} min read
                            </span>
                            ${p.parent ? `<span class="meta-item">from <a href="${escapeHtml(p.parent.url)}" target="_blank" style="color: var(--accent); text-decoration: none;">${escapeHtml(p.parent.name.split('/')[0])}</a></span>` : ''}
                        </div>
                        <h3><a href="${escapeHtml(p.url)}" target="_blank">${escapeHtml(p.displayName || p.name)}</a></h3>
                        <div class="summary ${hasLongSummary ? 'collapsed' : ''}">${parseMarkdown(escapeHtml(p.summary || p.description))}</div>
                        ${hasLongSummary ? `<button class="read-toggle" onclick="toggleRead(this)">Read more <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>` : ''}
                        <div class="footer">
                            <div class="tech">
                                ${p.language ? `<span class="language"><span class="lang-dot" style="background: ${langColors[p.language] || '#888'}"></span>${escapeHtml(p.language)}</span>` : ''}
                                <span class="stars">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                    ${p.parent?.stars || p.stars || 0}
                                </span>
                            </div>
                            <a href="${escapeHtml(p.url)}" class="view-btn" target="_blank">View <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
                        </div>
                    </div>
                </article>
            `;
        }

        // Pagination & Filter state
        let allProjects = [];
        let filteredProjects = [];
        let currentPage = 1;
        let currentFilter = 'all';
        let searchQuery = '';
        const itemsPerPage = 10;

        // Filter projects
        function filterProjects() {
            filteredProjects = allProjects.filter(p => {
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

            // Initialize image loading
            initImageLoading();

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

        // Image Loading
        function initImageLoading() {
            document.querySelectorAll('.project-card .image').forEach(img => {
                if (img.complete) {
                    img.classList.add('loaded');
                } else {
                    img.addEventListener('load', () => img.classList.add('loaded'));
                }
            });
        }

        // Fallback stats from the projects feed (used only if stats.json is missing).
        // Files come from the real knowledge-graph data; modules/findings need the
        // deep graphs, so they stay 0 in the fallback rather than being faked.
        const NON_CODE = { Markdown:1, JSON:1, YAML:1, TOML:1, INI:1, XML:1, CSV:1, Text:1, SVG:1, Dockerfile:1, Makefile:1, HTML:1 };
        function primaryLang(p) {
            if (p.language) return p.language;
            const langs = (p.knowledgeGraph && p.knowledgeGraph.languages) || {};
            let best = null, bestN = 0;
            Object.keys(langs).forEach(k => { if (NON_CODE[k]) return; if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
            return best;
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
                // Try SQLite first
                let loadedFromDb = false;
                try {
                    await ForksDB.init();
                    const result = ForksDB.getRepos({ page: 1, limit: 9999, sort: 'updated_at' });
                    if (result.repos.length > 0) {
                        allProjects = result.repos.map(normalizeRepo);
                        loadedFromDb = true;

                        const meta = ForksDB.getMeta();
                        if (meta.last_updated && updatedEl) {
                            updatedEl.textContent = `Last updated: ${new Date(meta.last_updated).toLocaleDateString('en-US', {
                                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}`;
                        }
                    }
                } catch (dbErr) {
                    console.log('SQLite unavailable, falling back to JSON:', dbErr.message);
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
            // Heatmap only exists on the home page — skip elsewhere.
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
