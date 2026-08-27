/*
 * kg-traverse.js - walking the published relation layer from inside the graph.
 *
 * The page already let you hop to a semantically similar repository. What it
 * could not tell you was why, or how much that hop was worth trusting, and
 * those are the same question: a semantic edge is a cosine distance between two
 * embeddings and carries no evidence at all, while a stack edge names the
 * packages both repositories declare and can be checked. Drawing them the same
 * way was the problem.
 *
 * So each hop is rendered under its provenance, and a neighbour that appears on
 * both lists is called out, because an inferred edge corroborated by an
 * extracted one is the strongest thing this data holds.
 *
 * The source is /data/kin/<id>.json, about 1 KB per repository - the same files
 * llms.txt advertises. That is deliberate: the page is a consumer of the
 * published layer rather than a second implementation of it, so if the files
 * are wrong, the page is visibly wrong too.
 */
(function () {
    'use strict';

    var CLUSTER_AT = 0.68;   // the threshold the relation layer treats as kin
    var MAX_ROWS = 6;
    var cache = {};

    /*
     * One fetch per repository, cached for the session including the misses.
     * A miss is normal rather than exceptional: the graph is built from
     * forks.json and the relation layer from a later pipeline stage, so a
     * freshly added repository has a node before it has a neighbourhood.
     */
    function fetchKin(repoId) {
        if (Object.prototype.hasOwnProperty.call(cache, repoId)) {
            return Promise.resolve(cache[repoId]);
        }
        return fetch('data/kin/' + encodeURIComponent(repoId) + '.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (kin) { cache[repoId] = kin; return kin; });
    }

    function tag(text, cls) {
        var s = document.createElement('span');
        s.className = 'prov ' + cls;
        s.textContent = text;
        return s;
    }

    function heading(container, text, provenance, cls, count) {
        var d = document.createElement('div');
        d.className = 'label';
        d.appendChild(document.createTextNode(text + ' '));
        d.appendChild(tag(provenance, cls));
        if (count != null) {
            var c = document.createElement('span');
            c.className = 'score';
            c.textContent = count;
            d.appendChild(c);
        }
        container.appendChild(d);
    }

    /*
     * A row is a button because it is a hop. The evidence line under a stack
     * edge is the packages that carried the most weight; a semantic edge has no
     * equivalent and gets nothing rather than a filler line, so the asymmetry
     * between the two stays visible instead of being smoothed over.
     */
    function row(container, opts) {
        var b = document.createElement('button');
        b.className = 'hop';

        var top = document.createElement('span');
        top.className = 'hop-top';
        var name = document.createElement('span');
        name.textContent = opts.name;          // repository names are untrusted input
        top.appendChild(name);
        if (opts.corroborated) {
            top.appendChild(tag('both', 'both'));
        }
        var score = document.createElement('span');
        score.className = 'score';
        score.textContent = opts.score;
        top.appendChild(score);
        b.appendChild(top);

        if (opts.evidence && opts.evidence.length) {
            var ev = document.createElement('span');
            ev.className = 'hop-ev';
            ev.textContent = opts.evidence.join('  ');
            b.appendChild(ev);
        }

        b.title = opts.title || '';
        b.addEventListener('click', opts.onClick);
        container.appendChild(b);
        return b;
    }

    /*
     * Falls back to the graph's own similarity index when there is no published
     * neighbourhood. The fallback is labelled the same way rather than left
     * untagged: an unlabelled list next to a labelled one reads as measured.
     */
    function renderFallback(container, node, ctx) {
        // simByRepo is Code Graph's own similarity index and is the only part of
        // ctx a caller may not have: Code Brain draws no similarity edges and
        // passes none. Reading it unguarded made a module written to be reusable
        // throw for its second caller.
        var kin = ((ctx.simByRepo || {})[node.id] || []).slice(0, 4);
        // An empty panel would read as "nothing is like this". The truth is
        // "the relation layer has not been built for this one yet", and the two
        // are different answers.
        if (!kin.length) {
            var msg = document.createElement('div');
            msg.className = 'hop-ev';
            msg.textContent = 'No published neighbourhood yet. Added since the last relation build.';
            container.appendChild(msg);
            return false;
        }
        heading(container, 'Semantically closest', 'inferred', 'inf', kin.length);
        kin.forEach(function (k) {
            var target = ctx.nodeById[k.id];
            if (!target) return;
            row(container, {
                name: target.name,
                score: k.sim.toFixed(2),
                title: 'Cosine similarity between embeddings. No evidence beyond this number.',
                onClick: function () { ctx.onWalk(target); }
            });
        });
        return true;
    }

    function renderKin(container, kin, node, ctx) {
        var stack = kin.stack || [];
        var semantic = kin.semantic || [];
        var stackIds = {};
        stack.forEach(function (s) { stackIds[s.id] = true; });
        var semIds = {};
        semantic.forEach(function (s) { semIds[s.id] = true; });

        if (kin.cluster) {
            var c = document.createElement('div');
            c.className = 'label';
            c.appendChild(document.createTextNode('Cluster ' + kin.cluster + ' '));
            c.appendChild(tag('inferred', 'inf'));
            container.appendChild(c);
        }

        // Extracted first. It is the shorter list and the more trustworthy one,
        // and putting the guess above the measurement would be the wrong order
        // to read them in.
        if (stack.length) {
            heading(container, 'Shares declared dependencies', 'extracted', 'ext', stack.length);
            stack.slice(0, MAX_ROWS).forEach(function (s) {
                row(container, {
                    name: s.name || String(s.id),
                    score: Number(s.weight).toFixed(2),
                    evidence: (s.shared || []).slice(0, 3),
                    corroborated: !!semIds[s.id],
                    title: 'IDF-weighted overlap of packages both repositories declare. Named, so you can check it.',
                    onClick: function () { ctx.onWalk(ctx.nodeById['repo:' + s.id], s.id); }
                });
            });
        }

        if (semantic.length) {
            heading(container, 'Similar in meaning', 'inferred', 'inf', semantic.length);
            semantic.slice(0, MAX_ROWS).forEach(function (s) {
                row(container, {
                    name: s.name || String(s.id),
                    score: Number(s.similarity).toFixed(2),
                    corroborated: !!stackIds[s.id],
                    title: 'Cosine similarity between neural embeddings. Carries no evidence beyond this number.',
                    onClick: function () { ctx.onWalk(ctx.nodeById['repo:' + s.id], s.id); }
                });
            });
        }

        if (!stack.length && !semantic.length) {
            var none = document.createElement('div');
            none.className = 'hop-ev';
            none.textContent = 'Nothing in the estate is close enough to link to.';
            container.appendChild(none);
        }
    }

    /*
     * Renders into the panel and resolves when done. The token is how a slow
     * fetch is prevented from painting into a panel that has since moved on to
     * another node - without it, clicking through the graph faster than the
     * network paints the wrong neighbourhood under the right title.
     */
    function render(container, node, ctx) {
        if (!node || node.kind !== 'repo') return Promise.resolve();
        var repoId = String(node.id).replace(/^repo:/, '');
        var token = ctx.token;

        return fetchKin(repoId).then(function (kin) {
            if (ctx.stale && ctx.stale(token)) return;
            container.innerHTML = '';
            if (kin) renderKin(container, kin, node, ctx);
            else renderFallback(container, node, ctx);
        });
    }

    /*
     * The edge-strength control. It lives here rather than in the graph
     * controller because the threshold is a relation-layer concept, not a
     * rendering one: the default is the value data/clusters.json groups at, so
     * what the page draws and what the layer clusters on are the same graph.
     * Anything else and the picture quietly argues with the data.
     */
    function edgeControl(el, simLinks, onChange) {
        var min = CLUSTER_AT;

        function visible() {
            return simLinks.filter(function (l) { return l.sim >= min; });
        }
        function refresh() {
            if (!el.edgeCount) return;
            el.edgeCount.textContent = visible().length + ' of ' + simLinks.length + ' edges drawn';
        }

        if (el.edgeMin) {
            el.edgeMin.addEventListener('input', function () {
                min = parseFloat(el.edgeMin.value);
                if (el.edgeMinVal) el.edgeMinVal.textContent = min.toFixed(2);
                refresh();
                onChange(visible());
            });
        }
        refresh();

        return {
            visible: visible,
            refresh: refresh,
            // Hidden outside semantic mode, where there are no similarity edges
            // for it to act on and it would only invite a drag that does nothing.
            show: function (on) { if (el.edgeCtl) el.edgeCtl.hidden = !on; }
        };
    }

    window.KGTraverse = {
        render: render,
        fetchKin: fetchKin,
        edgeControl: edgeControl,
        CLUSTER_AT: CLUSTER_AT
    };
})();
