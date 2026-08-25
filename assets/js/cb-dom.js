/*
 * cb-dom.js - the Code Brain's shared vocabulary: its element map, its palettes
 * and the two text helpers everything uses.
 *
 * Split out of code-brain.js, where build() was one 712-line closure. Partials
 * could not help, unlike site.js: the file's only statement-level boundaries fall
 * before build() starts, because build() is a single construct. So the split is a
 * real one, in three pieces, and this is the piece all of them need.
 *
 * el is here rather than in the controller because all three files read the same
 * DOM, and two copies of a lookup table is how they drift.
 */
(function (global) {
    'use strict';

    var LANG_COLORS = {
        'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3776ab',
        'Rust': '#dea584', 'Go': '#00add8', 'Java': '#b07219', 'C++': '#f34b7d',
        'C': '#a8b9cc', 'C#': '#178600', 'Ruby': '#701516', 'PHP': '#4f5d95',
        'Shell': '#89e051', 'HTML': '#e34c26', 'CSS': '#563d7c', 'Jupyter Notebook': '#da5b0b',
        'Swift': '#f05138', 'Kotlin': '#a97bff', 'Dart': '#00b4ab', 'Vue': '#41b883',
        'Solidity': '#aa6746', 'Lua': '#000080', 'Zig': '#ec915c', 'Elixir': '#6e4a7e',
        'Svelte': '#ff3e00', 'Astro': '#ff5d01', 'SQL': '#e38c00', 'Markdown': '#6a737d',
        'JSON': '#8a93ad', 'YAML': '#cb171e', 'TOML': '#9c4221'
    };
    var ACCENT = '#4f7cff', ACCENT3 = '#34e0c4';
    function langColor(l) { return LANG_COLORS[l] || '#8a93ad'; }

    // Domains - the "capability" framing: what the code does, not just its language.
    /*
     * Colours for the domains the build assigns. The names are the build's, not
     * a second set of this file's own: the graph used to derive its own domain
     * from its own language map, which is how the same repository could be
     * "Web & UI" here and "Web & Interfaces" on the index page, and how 198
     * repositories sat in a bucket that held 98 on the other side.
     *
     * Both older sets are kept below so a stale forks.json still colours rather
     * than falling through to grey.
     */
    var DOMAIN_COLORS = {
        'AI & Data': '#a06bff', 'Web & Interfaces': '#4f7cff', 'Systems & Infra': '#f34b7d',
        'Mobile': '#34e0c4', 'Knowledge & Content': '#d9a441',
        'Agent Skills & Plugins': '#e0521f',
        'AI / ML & Data': '#a06bff', 'Web & UI': '#4f7cff', 'Systems': '#f34b7d',
        'Backend & Services': '#00add8', 'DevOps & Tooling': '#89e051',
        'Docs & Knowledge': '#d9a441', 'Other': '#8a93ad'
    };
    var LANG_DOMAIN = {
        'Python': 'AI / ML & Data', 'Jupyter Notebook': 'AI / ML & Data', 'R': 'AI / ML & Data',
        'JavaScript': 'Web & UI', 'TypeScript': 'Web & UI', 'HTML': 'Web & UI', 'CSS': 'Web & UI',
        'Vue': 'Web & UI', 'Svelte': 'Web & UI', 'Astro': 'Web & UI',
        'Rust': 'Systems', 'C': 'Systems', 'C++': 'Systems', 'Zig': 'Systems', 'Go': 'Systems',
        'Swift': 'Mobile', 'Kotlin': 'Mobile', 'Dart': 'Mobile',
        'Java': 'Backend & Services', 'C#': 'Backend & Services', 'Ruby': 'Backend & Services',
        'PHP': 'Backend & Services', 'Elixir': 'Backend & Services', 'SQL': 'Backend & Services',
        'Shell': 'DevOps & Tooling', 'Lua': 'DevOps & Tooling', 'Dockerfile': 'DevOps & Tooling',
        'Makefile': 'DevOps & Tooling',
        // 198 repositories sat in "Other" and 196 of them were a language this
        // map did not list. TSX and JSX alone were 86 of them, which is React
        // filed as unclassifiable.
        'TSX': 'Web & UI', 'JSX': 'Web & UI', 'SCSS': 'Web & UI', 'Less': 'Web & UI',
        'C/C++ Header': 'Systems', 'Objective-C': 'Mobile',
        'Terraform': 'DevOps & Tooling', 'HCL': 'DevOps & Tooling', 'YAML': 'DevOps & Tooling',
        'Nix': 'DevOps & Tooling', 'Perl': 'DevOps & Tooling',
        'Scala': 'Backend & Services', 'Haskell': 'Backend & Services',
        'Julia': 'AI / ML & Data', 'Solidity': 'Systems',
        // Prose-only repositories - skills packs, awesome lists, question sets.
        // primaryLanguage only returns these when there is no code at all, so
        // reaching here means the repository really is a document collection.
        'Markdown': 'Docs & Knowledge', 'reStructuredText': 'Docs & Knowledge',
        'JSON': 'Docs & Knowledge', 'Text': 'Docs & Knowledge', 'CSV': 'Docs & Knowledge'
    };
    var AI_TOPICS = /(^|[-_ ])(ai|ml|llm|nlp|rag|agent|agents|genai|machine-learning|deep-learning|transformer|embedding|chatbot|vision)([-_ ]|$)/i;
    /*
     * The domain the build already assigned, when there is one.
     *
     * enrichFork runs over every repository on every pass, so forks.json carries
     * a current domain, and deriving a second opinion here only produced two
     * answers to one question - including two different sets of names for the
     * same six groups. The language map below is now the fallback for a
     * repository the build has not enriched yet, and nothing else.
     */
    function domainOf(lang, topics, fork) {
        if (fork && fork.domain) return fork.domain;
        if (topics && topics.some(function (t) { return AI_TOPICS.test(t); })) return 'AI / ML & Data';
        return LANG_DOMAIN[lang] || 'Other';
    }
    function domainColor(d) { return DOMAIN_COLORS[d] || '#8a93ad'; }

    var NON_CODE = { 'Markdown': 1, 'JSON': 1, 'YAML': 1, 'TOML': 1, 'INI': 1, 'XML': 1,
        'CSV': 1, 'Text': 1, 'SVG': 1, 'Dockerfile': 1, 'Makefile': 1, 'HTML': 1 };
    function primaryLanguage(f) {
        if (f.language) return f.language;
        var langs = (f.knowledgeGraph && f.knowledgeGraph.languages) || {};
        var best = null, bestN = 0;
        Object.keys(langs).forEach(function (k) { if (NON_CODE[k]) return; if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
        if (!best) Object.keys(langs).forEach(function (k) { if (langs[k] > bestN) { bestN = langs[k]; best = k; } });
        return best || 'Other';
    }

    var el = {
        loading: document.getElementById('loading'),
        sRepos: document.getElementById('s-repos'),
        sFiles: document.getElementById('s-files'),
        sLangs: document.getElementById('s-langs'),
        sDomains: document.getElementById('s-domains'),
        legend: document.getElementById('legend'),
        search: document.getElementById('search'),
        fDomain: document.getElementById('f-domain'),
        fSize: document.getElementById('f-size'),
        reset: document.getElementById('reset'),
        info: document.getElementById('info'),
        iKind: document.getElementById('i-kind'),
        iName: document.getElementById('i-name'),
        iDesc: document.getElementById('i-desc'),
        iMeta: document.getElementById('i-meta'),
        iLinks: document.getElementById('i-links'),
        iDive: document.getElementById('i-dive'),
        iDiveLabel: document.getElementById('i-dive-label'),
        diveBtn: document.getElementById('dive-btn'),
        reportBtn: document.getElementById('report-btn'),
        collapseBtn: document.getElementById('collapse-btn'),
        infoClose: document.getElementById('info-close'),
        toast: document.getElementById('toast')
    };

    function toast(msg) {
        el.toast.textContent = msg; el.toast.classList.add('show');
        clearTimeout(el.toast._t); el.toast._t = setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
    }

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // A link endpoint is either an id or the node itself, depending on whether the
    // force layout has resolved it yet.
    function idOf(x) { return typeof x === 'object' ? x.id : x; }

    /*
     * The opening sentences of a briefing, for the info panel's one-line summary.
     * The panel called firstSentences() and nothing ever defined it: the only
     * definition on the site is inside reader.js's closure, which is not shared. So
     * any repository without a GitHub description threw a ReferenceError here
     * rather than falling back to its briefing. Found by the reachability check,
     * not by the split.
     */
    function firstSentences(s, n) {
        var text = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
        if (!text) return '';
        var parts = text.split(/(?<=[.!?])\s+/).slice(0, n || 2);
        return parts.join(' ').trim();
    }

    /*
     * The colour of a node inside a dived repository: a directory, or a module
     * shaded by its instability. It sits with the other palettes rather than in
     * the dive code, because it is a colour table and nothing else.
     */
    function structColor(n) {
        if (n.kind === 'dir') return 'rgba(150,160,190,0.55)';
        if (n.kind === 'module') {
            // instability: green (stable core) -> red (unstable leaf)
            var i = n.inst == null ? 0.5 : n.inst;
            var r = Math.round(80 + i * 175), g = Math.round(200 - i * 130), b = Math.round(150 - i * 60);
            return 'rgb(' + r + ',' + g + ',' + b + ')';
        }
        return n.lang ? langColor(n.lang) : '#7f8aa8';
    }

    global.CBDom = {
        el: el, toast: toast, esc: esc,
        langColor: langColor, domainColor: domainColor,
        ACCENT: ACCENT, ACCENT3: ACCENT3,
        idOf: idOf, firstSentences: firstSentences, structColor: structColor,
        domainOf: domainOf, primaryLanguage: primaryLanguage
    };
})(window);
