const fs = require('fs');
const initSqlJs = require('sql.js');

async function main() {
    console.log('=== SQLite Database Builder ===\n');

    if (!fs.existsSync('forks.json')) {
        console.error('Error: forks.json not found. Run update-forks.js first.');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync('forks.json', 'utf8'));
    const forks = data.forks || [];

    if (forks.length === 0) {
        console.log('No forks to process.');
        return;
    }

    const SQL = await initSqlJs();
    const db = new SQL.Database();

    // Create tables
    db.run(`
        CREATE TABLE meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);

    db.run(`
        CREATE TABLE repos (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            display_name TEXT,
            description TEXT,
            summary TEXT,
            url TEXT,
            language TEXT,
            stars INTEGER DEFAULT 0,
            forks INTEGER DEFAULT 0,
            type TEXT DEFAULT 'fork',
            image TEXT,
            forked_at TEXT,
            updated_at TEXT,
            read_time INTEGER DEFAULT 2,
            parent_name TEXT,
            parent_url TEXT,
            parent_stars INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE topics (
            repo_id INTEGER NOT NULL,
            topic TEXT NOT NULL,
            PRIMARY KEY (repo_id, topic),
            FOREIGN KEY (repo_id) REFERENCES repos(id)
        )
    `);

    db.run(`
        CREATE TABLE knowledge_graphs (
            repo_id INTEGER PRIMARY KEY,
            total_files INTEGER DEFAULT 0,
            has_docker INTEGER DEFAULT 0,
            has_ci INTEGER DEFAULT 0,
            ci_platform TEXT,
            package_manager TEXT,
            frameworks TEXT,
            languages TEXT,
            directories TEXT,
            entry_points TEXT,
            config_files TEXT,
            test_file_count INTEGER DEFAULT 0,
            doc_count INTEGER DEFAULT 0,
            FOREIGN KEY (repo_id) REFERENCES repos(id)
        )
    `);

    // Create indexes for common queries
    db.run('CREATE INDEX idx_repos_language ON repos(language)');
    db.run('CREATE INDEX idx_repos_type ON repos(type)');
    db.run('CREATE INDEX idx_repos_stars ON repos(stars DESC)');
    db.run('CREATE INDEX idx_repos_updated ON repos(updated_at DESC)');
    db.run('CREATE INDEX idx_topics_topic ON topics(topic)');

    // Full-text search on name, description, summary
    db.run(`
        CREATE VIRTUAL TABLE repos_fts USING fts4(
            name, display_name, description, summary,
            content='repos'
        )
    `);

    // Insert meta
    const metaStmt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    metaStmt.run(['last_updated', data.lastUpdated || new Date().toISOString()]);
    metaStmt.run(['generated_with', data.generatedWith || 'unknown']);
    metaStmt.run(['total_repos', String(forks.length)]);
    if (data.progress) {
        metaStmt.run(['ai_generated', String(data.progress.aiGenerated || 0)]);
        metaStmt.run(['pending', String(data.progress.pending || 0)]);
    }
    metaStmt.free();

    // Insert repos
    const repoStmt = db.prepare(`
        INSERT INTO repos (id, name, display_name, description, summary, url, language,
            stars, forks, type, image, forked_at, updated_at, read_time,
            parent_name, parent_url, parent_stars)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const topicStmt = db.prepare('INSERT OR IGNORE INTO topics (repo_id, topic) VALUES (?, ?)');

    const kgStmt = db.prepare(`
        INSERT INTO knowledge_graphs (repo_id, total_files, has_docker, has_ci,
            ci_platform, package_manager, frameworks, languages, directories,
            entry_points, config_files, test_file_count, doc_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const ftsStmt = db.prepare(`
        INSERT INTO repos_fts (docid, name, display_name, description, summary)
        VALUES (?, ?, ?, ?, ?)
    `);

    let repoCount = 0;
    let kgCount = 0;
    let topicCount = 0;

    for (const fork of forks) {
        repoStmt.run([
            fork.id, fork.name, fork.displayName, fork.description,
            fork.summary, fork.url, fork.language,
            fork.stars || 0, fork.forks || 0, fork.type || 'fork',
            fork.image, fork.forkedAt, fork.updatedAt, fork.readTime || 2,
            fork.parent?.name || null, fork.parent?.url || null, fork.parent?.stars || 0
        ]);
        repoCount++;

        // FTS index
        ftsStmt.run([
            fork.id, fork.name, fork.displayName,
            fork.description, fork.summary
        ]);

        // Topics
        for (const topic of (fork.topics || [])) {
            topicStmt.run([fork.id, topic]);
            topicCount++;
        }

        // Knowledge graph
        const kg = fork.knowledgeGraph;
        if (kg) {
            kgStmt.run([
                fork.id, kg.totalFiles || 0,
                kg.hasDocker ? 1 : 0, kg.hasCI ? 1 : 0,
                kg.ciPlatform || null, kg.packageManager || null,
                JSON.stringify(kg.frameworks || []),
                JSON.stringify(kg.languages || {}),
                JSON.stringify(kg.directories || {}),
                JSON.stringify(kg.entryPoints || []),
                JSON.stringify(kg.configFiles || []),
                (kg.testFiles || []).length,
                (kg.docs || []).length
            ]);
            kgCount++;
        }
    }

    repoStmt.free();
    topicStmt.free();
    kgStmt.free();
    ftsStmt.free();

    // Export database
    const dbBuffer = db.export();
    const outputPath = 'forks.db';
    fs.writeFileSync(outputPath, Buffer.from(dbBuffer));
    db.close();

    const dbSizeKB = (dbBuffer.length / 1024).toFixed(1);
    const jsonSizeKB = (fs.statSync('forks.json').size / 1024).toFixed(1);

    console.log(`Inserted ${repoCount} repos, ${topicCount} topics, ${kgCount} knowledge graphs`);
    console.log(`Database: ${outputPath} (${dbSizeKB} KB)`);
    console.log(`JSON source: forks.json (${jsonSizeKB} KB)`);
    console.log('\n=== Complete ===');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
