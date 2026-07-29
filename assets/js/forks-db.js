/**
 * ForksDB - sql.js wrapper for querying the forks SQLite database.
 * Loads forks.db via fetch, provides typed query methods.
 */
const ForksDB = (() => {
    let db = null;
    let ready = null;

    const SQL_CDN = 'https://sql.js.org/dist';

    async function init() {
        if (db) return db;
        if (ready) return ready;

        ready = (async () => {
            const SQL = await initSqlJs({
                locateFile: file => `${SQL_CDN}/${file}`
            });

            const response = await fetch('forks.db');
            if (!response.ok) throw new Error(`Failed to load forks.db: ${response.status}`);

            const buffer = await response.arrayBuffer();
            db = new SQL.Database(new Uint8Array(buffer));
            return db;
        })();

        return ready;
    }

    function queryAll(sql, params = []) {
        if (!db) throw new Error('Database not initialized. Call ForksDB.init() first.');
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }

    function queryOne(sql, params = []) {
        const rows = queryAll(sql, params);
        return rows[0] || null;
    }

    // --- Public query methods ---

    function getMeta() {
        const rows = queryAll('SELECT key, value FROM meta');
        const meta = {};
        for (const row of rows) meta[row.key] = row.value;
        return meta;
    }

    function getRepos({ page = 1, limit = 10, language = null, type = null, search = null, sort = 'updated_at', order = 'DESC' } = {}) {
        const validSorts = ['updated_at', 'stars', 'name', 'parent_stars'];
        const validOrders = ['ASC', 'DESC'];
        const sortCol = validSorts.includes(sort) ? sort : 'updated_at';
        const sortOrder = validOrders.includes(order) ? order : 'DESC';

        const conditions = [];
        const params = [];

        if (language) {
            conditions.push('r.language = ?');
            params.push(language);
        }
        if (type) {
            conditions.push('r.type = ?');
            params.push(type);
        }
        if (search) {
            conditions.push('r.id IN (SELECT docid FROM repos_fts WHERE repos_fts MATCH ?)');
            params.push(search + '*');
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const offset = (page - 1) * limit;

        const countRow = queryOne(`SELECT COUNT(*) as total FROM repos r ${where}`, params);
        const total = countRow ? countRow.total : 0;

        const repos = queryAll(`
            SELECT r.*, GROUP_CONCAT(t.topic) as topics_csv
            FROM repos r
            LEFT JOIN topics t ON t.repo_id = r.id
            ${where}
            GROUP BY r.id
            ORDER BY r.${sortCol} ${sortOrder}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // Parse topics back to arrays
        for (const repo of repos) {
            repo.topics = repo.topics_csv ? repo.topics_csv.split(',') : [];
            delete repo.topics_csv;
            if (repo.parent_name) {
                repo.parent = { name: repo.parent_name, url: repo.parent_url, stars: repo.parent_stars };
            }
            delete repo.parent_name;
            delete repo.parent_url;
            delete repo.parent_stars;
        }

        return { repos, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    function getRepo(id) {
        const repo = queryOne('SELECT * FROM repos WHERE id = ?', [id]);
        if (!repo) return null;

        repo.topics = queryAll('SELECT topic FROM topics WHERE repo_id = ?', [id]).map(r => r.topic);

        const kg = queryOne('SELECT * FROM knowledge_graphs WHERE repo_id = ?', [id]);
        if (kg) {
            kg.frameworks = JSON.parse(kg.frameworks || '[]');
            kg.languages = JSON.parse(kg.languages || '{}');
            kg.directories = JSON.parse(kg.directories || '{}');
            kg.entry_points = JSON.parse(kg.entry_points || '[]');
            kg.config_files = JSON.parse(kg.config_files || '[]');
            repo.knowledgeGraph = kg;
        }

        if (repo.parent_name) {
            repo.parent = { name: repo.parent_name, url: repo.parent_url, stars: repo.parent_stars };
        }

        return repo;
    }

    function getLanguages() {
        return queryAll(`
            SELECT language, COUNT(*) as count
            FROM repos
            WHERE language IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
        `);
    }

    function getStats() {
        return queryOne(`
            SELECT
                COUNT(*) as total_repos,
                COUNT(DISTINCT language) as languages,
                SUM(stars) as total_stars,
                SUM(CASE WHEN type = 'original' THEN 1 ELSE 0 END) as originals,
                SUM(CASE WHEN type = 'fork' THEN 1 ELSE 0 END) as forks
            FROM repos
        `);
    }

    function getTopics(limit = 20) {
        return queryAll(`
            SELECT topic, COUNT(*) as count
            FROM topics
            GROUP BY topic
            ORDER BY count DESC
            LIMIT ?
        `, [limit]);
    }

    function search(query, limit = 20) {
        if (!query || query.trim().length === 0) return [];
        return queryAll(`
            SELECT r.id, r.name, r.display_name, r.description, r.language, r.stars, r.type
            FROM repos_fts fts
            JOIN repos r ON r.id = fts.docid
            WHERE repos_fts MATCH ?
            LIMIT ?
        `, [query + '*', limit]);
    }

    function getAllKnowledgeGraphs() {
        const repos = queryAll(`
            SELECT r.id, r.name, r.display_name, r.description, r.summary, r.url,
                   r.language, r.stars, r.type, r.parent_name, r.parent_url, r.parent_stars,
                   kg.total_files, kg.has_docker, kg.has_ci, kg.ci_platform,
                   kg.package_manager, kg.frameworks, kg.languages, kg.directories,
                   kg.entry_points, kg.config_files, kg.test_file_count, kg.doc_count
            FROM repos r
            INNER JOIN knowledge_graphs kg ON kg.repo_id = r.id
        `);

        for (const r of repos) {
            r.frameworks = JSON.parse(r.frameworks || '[]');
            r.languages = JSON.parse(r.languages || '{}');
            r.directories = JSON.parse(r.directories || '{}');
            r.entry_points = JSON.parse(r.entry_points || '[]');
            r.config_files = JSON.parse(r.config_files || '[]');
            if (r.parent_name) {
                r.parent = { name: r.parent_name, url: r.parent_url, stars: r.parent_stars };
            }
        }

        return repos;
    }

    return {
        init,
        getMeta,
        getRepos,
        getRepo,
        getLanguages,
        getStats,
        getTopics,
        search,
        getAllKnowledgeGraphs,
        // Escape utility for rendering
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };
})();
