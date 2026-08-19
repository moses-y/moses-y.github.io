/*
 * reader.js - open a repository's writing in place, without leaving the page.
 *
 * Two surfaces need this and they must not drift: Code Brain, where a node is
 * brought to the front against the still-turning graph, and Projects, where the
 * lean index deliberately omits the 3,200-character summaries (1,320 of them is
 * roughly 4MB, which is what the payload work removed) so the briefing has to
 * be fetched on demand rather than shipped with the list.
 *
 * The briefing prose is lifted from the generated blog page rather than
 * re-templated here, and the architecture report is rendered by
 * report-render.js, so this file owns chrome and fetching only.
 *
 * Usage:
 *   SiteReader.open({ id, name, displayName, description, summary, url, crumb,
 *                     onOpen, onClose })
 *
 * Markup and styling live in assets/css/site.css (.reader / .rd-*).
 */
(function (global) {
    'use strict';

    var el = null;         // cached DOM refs
    var returnFocus = null;
    var hooks = {};
    var queue = [];        // the ordered list the reader was opened from
    var pos = -1;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // The stored summary is the briefing's own opening paragraphs, so it is not
    // the lede: printing it here duplicated thousands of characters.
    function firstSentences(s, n) {
        if (!s) return '';
        var parts = String(s).split(/(?<=[.!?])\s+/).slice(0, n).join(' ');
        return parts.length > 320 ? parts.slice(0, 317) + '…' : parts;
    }

    function build() {
        if (el) return el;
        var existing = document.getElementById('reader');
        if (!existing) {
            existing = document.createElement('div');
            existing.className = 'reader';
            existing.id = 'reader';
            existing.setAttribute('role', 'dialog');
            existing.setAttribute('aria-modal', 'true');
            existing.setAttribute('aria-labelledby', 'rd-title');
            existing.hidden = true;
            existing.innerHTML =
                '<div class="rd-bar">' +
                '<button type="button" class="rd-back" id="rd-close" title="Close (Esc)">&larr; Close</button>' +
                '<div class="rd-bar-mid" id="rd-crumb"></div>' +
                '<a class="rd-tab" id="rd-newtab" href="#" target="_blank" rel="noopener">Open as a page &#8599;</a>' +
                '</div>' +
                '<div class="rd-scroll" id="rd-scroll" tabindex="-1">' +
                '<article class="rd-col rpt">' +
                '<div class="eyebrow" id="rd-eyebrow"></div>' +
                '<h1 id="rd-title">Repository</h1>' +
                '<p class="lede" id="rd-lede"></p>' +
                '<div class="repolinks" id="rd-links"></div>' +
                '<hr class="rule">' +
                '<div class="rd-brief" id="rd-brief"></div>' +
                '<div id="rd-body"></div>' +
                '<div class="rd-next" id="rd-next" role="navigation" aria-label="Adjacent repositories"></div>' +
                '</article></div>' +
                // The visible equivalent of the arrow keys. Outside .rd-scroll so
                // they stay put while the column scrolls under them.
                '<button type="button" class="rd-arrow prev" id="rd-prev-arrow" data-step="-1">&#8249;</button>' +
                '<button type="button" class="rd-arrow next" id="rd-next-arrow" data-step="1">&#8250;</button>';
            document.body.appendChild(existing);
        }
        el = {
            root: existing,
            scroll: existing.querySelector('#rd-scroll'),
            crumb: existing.querySelector('#rd-crumb'),
            eyebrow: existing.querySelector('#rd-eyebrow'),
            title: existing.querySelector('#rd-title'),
            lede: existing.querySelector('#rd-lede'),
            links: existing.querySelector('#rd-links'),
            brief: existing.querySelector('#rd-brief'),
            body: existing.querySelector('#rd-body'),
            newtab: existing.querySelector('#rd-newtab'),
            nextNav: existing.querySelector('#rd-next'),
            closeBtn: existing.querySelector('#rd-close'),
            prevArrow: existing.querySelector('#rd-prev-arrow'),
            nextArrow: existing.querySelector('#rd-next-arrow')
        };

        el.closeBtn.addEventListener('click', close);
        // Same step() the keys use, so the two cannot diverge.
        [el.prevArrow, el.nextArrow].forEach(function (b) {
            b.addEventListener('click', function () { step(+b.dataset.step); });
        });
        window.addEventListener('popstate', hide);

        // Clicking the page outside the column closes it. This is what people
        // try first on an overlay, and it did nothing.
        el.scroll.addEventListener('click', function (e) {
            if (!e.target.closest('.rd-col')) close();
        });

        // Arrows move between repositories; the column is the thing in focus, so
        // this needs no modifier and no click first.
        document.addEventListener('keydown', function (e) {
            if (el.root.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        });

        // Reaching the end names the next repository but never moves to it on its
        // own: advancing is the reader's decision, made with the arrows or a card.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || el.root.hidden) return;
            // Stop the host page also acting on Escape behind a dialog it
            // cannot see: Code Brain resets the whole graph on Escape.
            e.stopPropagation();
            close();
        }, true);
        return el;
    }

    // Moving between repositories reuses the open path, so the two entry points
    // (a click on a card, an arrow key) cannot diverge.
    function step(delta) {
        if (pos < 0 || !queue.length) return;
        var next = pos + delta;
        if (next < 0 || next >= queue.length) return;
        var keepHooks = hooks;
        openAt(next, keepHooks);
    }

    function openAt(i, keepHooks) {
        var r = queue[i];
        if (!r) return;
        pos = i;
        render(Object.assign({}, r, { onClose: keepHooks && keepHooks.onClose }));
    }

    function renderNext() {
        if (!el) return;
        var prev = queue[pos - 1], nxt = queue[pos + 1];
        // A bare glyph says nothing about where it goes, so the label names the
        // destination and the key that does the same thing.
        var arrow = function (b, r, word, key) {
            var hide = pos < 0 || queue.length < 2;
            b.hidden = hide;
            b.disabled = !r;
            var label = r ? word + ': ' + (r.displayName || r.name) : 'No ' + word.toLowerCase() + ' repository';
            b.setAttribute('aria-label', label);
            b.title = label + ' (' + key + ')';
        };
        arrow(el.prevArrow, prev, 'Previous', '←');
        arrow(el.nextArrow, nxt, 'Next', '→');
        if (pos < 0 || queue.length < 2) { el.nextNav.innerHTML = ''; return; }
        var card = function (r, dir) {
            if (!r) return '';
            return '<button type="button" class="rd-step ' + dir + '" data-step="' +
                (dir === 'next' ? 1 : -1) + '">' +
                '<span class="rd-step-dir">' + (dir === 'next' ? 'Next' : 'Previous') + '</span>' +
                '<span class="rd-step-name">' + esc(r.displayName || r.name) + '</span>' +
                (r.description ? '<span class="rd-step-desc">' + esc(r.description) + '</span>' : '') +
                '</button>';
        };
        el.nextNav.innerHTML =
            '<div class="rd-step-hint">' + (pos + 1) + ' of ' + queue.length + '</div>' +
            '<div class="rd-steps">' + card(prev, 'prev') + card(nxt, 'next') + '</div>';
        el.nextNav.querySelectorAll('[data-step]').forEach(function (b) {
            b.addEventListener('click', function () { step(+b.dataset.step); });
        });
    }

    function hide() {
        if (!el || el.root.hidden) return;
        el.root.hidden = true;
        document.documentElement.style.overflow = '';
        if (hooks.onClose) { try { hooks.onClose(); } catch (e) { /* host's problem */ } }
        hooks = {};
        if (returnFocus && returnFocus.focus) returnFocus.focus();
    }

    // close is the user gesture and prefers unwinding history, which comes back
    // through popstate and lands in hide.
    function close() {
        if (!el || el.root.hidden) return;
        if (history.state && history.state.reader) { history.back(); return; }
        hide();
    }

    // open seeds the queue from the caller's list so the reader knows what comes
    // next; render draws whichever entry is current.
    function open(repo) {
        if (!repo) return;
        build();
        returnFocus = document.activeElement;
        if (Array.isArray(repo.queue) && repo.queue.length) {
            queue = repo.queue;
            pos = queue.findIndex(function (r) { return String(r.id) === String(repo.id); });
            if (pos < 0) { queue = [repo]; pos = 0; }
        } else {
            queue = [repo]; pos = 0;
        }
        render(repo);
    }

    function render(repo) {
        hooks = { onClose: repo.onClose };

        var id = repo.id;
        var name = repo.displayName || repo.name || 'Repository';
        var slug = repo.name;

        el.root.hidden = false;
        el.scroll.scrollTop = 0;
        el.scroll.focus();
        // The list behind a full-screen reader must not scroll under it.
        document.documentElement.style.overflow = 'hidden';

        // Callers pass their own records straight through, so the crumb is derived
        // here rather than assembled at every call site.
        el.crumb.textContent = repo.crumb ||
            [repo.domain, repo.language].filter(Boolean).join(' \u00b7 ');
        el.eyebrow.innerHTML = 'Briefing <span class="live">&middot; live</span>';
        el.title.textContent = name;
        el.lede.textContent = repo.description || firstSentences(repo.summary, 2);
        el.brief.innerHTML = '<p class="loading">Loading the briefing&hellip;</p>';
        el.body.innerHTML = '';
        renderNext();
        el.newtab.href = slug ? 'blog/' + encodeURIComponent(slug) + '.html' : '#';

        var links = [];
        if (repo.url) links.push('<a href="' + esc(repo.url) + '" target="_blank" rel="noopener">GitHub &#8599;</a>');
        if (id != null) links.push('<a href="report.html?repo=' + encodeURIComponent(id) + '">Architecture report &rarr;</a>');
        el.links.innerHTML = links.join('');

        try { history.pushState({ reader: id }, '', '#read-' + id); } catch (e) { /* file:// */ }
        if (repo.onOpen) { try { repo.onOpen(); } catch (e) { /* host's problem */ } }

        if (slug) {
            fetch('blog/' + encodeURIComponent(slug) + '.html')
                .then(function (r) { return r.ok ? r.text() : null; })
                .catch(function () { return null; })
                .then(function (html) {
                    if (el.root.hidden) return;
                    if (!html) { el.brief.innerHTML = '<p class="note">No briefing has been generated for this repository yet.</p>'; return; }
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var post = doc.getElementById('post-content');
                    if (!post) { el.brief.innerHTML = '<p class="note">No briefing has been generated for this repository yet.</p>'; return; }
                    post.querySelectorAll('script, style').forEach(function (n) { n.remove(); });
                    // Numbered to sit in front of the report's 01/02/03, so the
                    // briefing and the analysis read as one document.
                    el.brief.innerHTML =
                        '<div class="sec"><span class="no">00</span> Briefing</div>' + post.innerHTML;
                });
        } else {
            el.brief.innerHTML = '';
        }

        // The report is optional: most repos have no deep analysis yet. The audit
        // is separate and may exist without it, so both are fetched and either
        // one is enough to render a section.
        if (id != null && global.ReportRender) {
            Promise.all([
                fetch('structure/' + id + '.deep.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
                fetch('data/hygiene.json').then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) { return j && j.repos ? j.repos[String(id)] : null; })
                    .catch(function () { return null; })
            ]).then(function (res) {
                if (el.root.hidden || (!res[0] && !res[1])) return;
                el.body.innerHTML = '<hr class="rule">' +
                    global.ReportRender.body(res[0], repo, { heading: false, audit: res[1] });
                global.ReportRender.bindMore(el.body);
            });
        }
    }

    global.SiteReader = {
        open: open, close: close, step: step,
        isOpen: function () { return !!el && !el.root.hidden; },
        position: function () { return { pos: pos, total: queue.length }; }
    };
})(window);
