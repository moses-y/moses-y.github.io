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
                '<button type="button" class="rd-back" id="rd-close">&larr; Back</button>' +
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
                '</article></div>';
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
            closeBtn: existing.querySelector('#rd-close')
        };

        el.closeBtn.addEventListener('click', close);
        window.addEventListener('popstate', hide);
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || el.root.hidden) return;
            // Stop the host page also acting on Escape behind a dialog it
            // cannot see: Code Brain resets the whole graph on Escape.
            e.stopPropagation();
            close();
        }, true);
        return el;
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

    function open(repo) {
        if (!repo) return;
        build();
        hooks = { onClose: repo.onClose };
        returnFocus = document.activeElement;

        var id = repo.id;
        var name = repo.displayName || repo.name || 'Repository';
        var slug = repo.name;

        el.root.hidden = false;
        el.scroll.scrollTop = 0;
        el.scroll.focus();
        // The list behind a full-screen reader must not scroll under it.
        document.documentElement.style.overflow = 'hidden';

        el.crumb.textContent = repo.crumb || '';
        el.eyebrow.innerHTML = 'Briefing <span class="live">&middot; live</span>';
        el.title.textContent = name;
        el.lede.textContent = repo.description || firstSentences(repo.summary, 2);
        el.brief.innerHTML = '<p class="loading">Loading the briefing&hellip;</p>';
        el.body.innerHTML = '';
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
                    el.brief.innerHTML = post.innerHTML;
                });
        } else {
            el.brief.innerHTML = '';
        }

        // The report is optional: most repos have no deep analysis yet.
        if (id != null && global.ReportRender) {
            fetch('structure/' + id + '.deep.json')
                .then(function (r) { return r.ok ? r.json() : null; })
                .catch(function () { return null; })
                .then(function (d) {
                    if (el.root.hidden || !d) return;
                    el.body.innerHTML = '<hr class="rule">' +
                        global.ReportRender.body(d, repo, { heading: false });
                    global.ReportRender.bindMore(el.body);
                });
        }
    }

    global.SiteReader = { open: open, close: close, isOpen: function () { return !!el && !el.root.hidden; } };
})(window);
