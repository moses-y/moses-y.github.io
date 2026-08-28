/*
 * index-record.js - one decoder for the lean index, shared by every page.
 *
 * data/index.json stores each repository under single-letter keys, because at
 * 1,440 records the key names themselves were a measurable share of the file.
 * Something has to turn those back into the field names the renderers read, and
 * until now only the home page could: its decoder lived inside a bundle partial
 * that the graph pages do not load.
 *
 * So both graph pages fetched forks.json instead - 7.1 MB gzipped against this
 * file's 187 KB, for data neither of them uses in full. The decoder was the only
 * thing standing between them and the lean index, which is a poor reason to move
 * seven megabytes to every visitor.
 *
 * It is a plain global rather than a module because the graph pages load their
 * scripts with ordinary tags in dependency order, and adding a build step for
 * one function would be a worse trade than the one it fixes.
 */
(function (global) {
    'use strict';

    /*
     * A note on the fields this cannot restore, since a caller that needs one
     * will otherwise find it silently absent:
     *
     *   summary  - the full article, several kilobytes per repository. It is the
     *              reason forks.json is large, and no graph page renders it; the
     *              panel uses it only as a description fallback, which currently
     *              never fires because all 1,440 repositories have a description.
     *   topics   - only ever a fallback for deriving a domain, and `g` carries
     *              the domain already, recomputed on every index build.
     *
     * Both are returned empty rather than omitted, so a caller reading them gets
     * a defined value instead of a property that does not exist.
     */
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
                // Present only for the repositories with no primary language,
                // which are the only ones whose renderers consult it.
                languages: r.L || null,
                codeHealth: {
                    hasTests: c[0] === '1', hasLicense: c[3] === '1',
                    committedSecrets: c[4] === '1' ? 1 : 0
                },
                hasCI: c[1] === '1', hasDocker: c[2] === '1'
            }
        };
    }

    /*
     * The estate, in the shape both graph pages already build against: they read
     * exactly two fields off the payload, `forks` and `similarityLinks`, so the
     * lean index only has to be dressed as those.
     *
     * forks.json is kept as the fallback rather than removed. It is the same data
     * and it is what these pages read until now, so a missing or malformed index
     * costs a slow page instead of a blank one - and the console says which path
     * was taken, because a silent 7 MB fallback is exactly the kind of
     * regression that survives for months.
     */
    function loadEstate() {
        return fetch('data/index.json', { cache: 'no-cache' })
            .then(function (r) {
                if (!r.ok) throw new Error('index.json responded ' + r.status);
                return r.json();
            })
            .then(function (idx) {
                if (!idx || !Array.isArray(idx.repos) || !idx.repos.length) {
                    throw new Error('index.json carried no repositories');
                }
                return {
                    forks: idx.repos.map(expandIndexRecord),
                    // Stored as [source, target, similarity] triples, because at
                    // 3,444 links the key names cost more than the values.
                    similarityLinks: (idx.links || []).map(function (l) {
                        return { source: l[0], target: l[1], similarity: l[2] };
                    })
                };
            })
            .catch(function (e) {
                console.warn('Lean index unavailable, falling back to forks.json:',
                    e && e.message ? e.message : e);
                return fetch('forks.json').then(function (r) {
                    if (!r.ok) throw new Error('forks.json responded ' + r.status);
                    return r.json();
                });
            });
    }

    global.IndexRecord = { expand: expandIndexRecord, loadEstate: loadEstate };
})(window);
