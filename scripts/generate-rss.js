const fs = require('fs');

const SITE_URL = 'https://moses-y.github.io';
const SITE_TITLE = 'Moses Yebei - Blog';
const SITE_DESCRIPTION = 'Technical articles and project deep-dives by Moses Yebei';

function escapeXml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function parseDate(dateStr) {
    if (!dateStr) return new Date();
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
}

function generateRSSFeed(posts, lastUpdated) {
    const items = posts.map(post => {
        const pubDate = parseDate(post.updatedAt || post.forkedAt).toUTCString();
        const description = post.summary
            ? post.summary.slice(0, 500) + (post.summary.length > 500 ? '...' : '')
            : post.description || '';

        return `    <item>
      <title>${escapeXml(post.displayName)}</title>
      <link>${SITE_URL}/blog/${post.name}.html</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.name}.html</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      ${post.language ? `<category>${escapeXml(post.language)}</category>` : ''}
      ${(post.topics || []).map(t => `<category>${escapeXml(t)}</category>`).join('\n      ')}
    </item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(lastUpdated || Date.now()).toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/favicon.ico</url>
      <title>${escapeXml(SITE_TITLE)}</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;
}

function generateAtomFeed(posts, lastUpdated) {
    const entries = posts.map(post => {
        const updated = parseDate(post.updatedAt || post.forkedAt).toISOString();
        const summary = post.summary
            ? post.summary.slice(0, 500) + (post.summary.length > 500 ? '...' : '')
            : post.description || '';

        return `  <entry>
    <title>${escapeXml(post.displayName)}</title>
    <link href="${SITE_URL}/blog/${post.name}.html"/>
    <id>${SITE_URL}/blog/${post.name}.html</id>
    <updated>${updated}</updated>
    <summary>${escapeXml(summary)}</summary>
    <author>
      <name>Moses Yebei</name>
    </author>
    ${(post.topics || []).map(t => `<category term="${escapeXml(t)}"/>`).join('\n    ')}
  </entry>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(SITE_TITLE)}</title>
  <link href="${SITE_URL}"/>
  <link href="${SITE_URL}/atom.xml" rel="self"/>
  <id>${SITE_URL}/</id>
  <updated>${new Date(lastUpdated || Date.now()).toISOString()}</updated>
  <author>
    <name>Moses Yebei</name>
  </author>
  <subtitle>${escapeXml(SITE_DESCRIPTION)}</subtitle>
${entries}
</feed>`;
}

async function main() {
    console.log('=== RSS/Atom Feed Generator ===\n');

    if (!fs.existsSync('forks.json')) {
        console.error('Error: forks.json not found. Run update-forks.js first.');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync('forks.json', 'utf8'));
    const allForks = data.forks || [];
    const posts = allForks.filter(f => f.summary);
    const awaiting = allForks.length - posts.length;
    if (awaiting > 0) {
        console.log(`Excluding ${awaiting} repos with no article yet (no page exists to link to).`);
    }

    if (posts.length === 0) {
        console.log('No posts to include in feed.');
        return;
    }

    // Sort by date (most recent first)
    posts.sort((a, b) => {
        const dateA = parseDate(a.updatedAt || a.forkedAt);
        const dateB = parseDate(b.updatedAt || b.forkedAt);
        return dateB - dateA;
    });

    // Take only the 20 most recent for feed
    const recentPosts = posts.slice(0, 20);

    console.log(`Generating feeds for ${recentPosts.length} posts...\n`);

    // Generate RSS 2.0 feed
    const rssFeed = generateRSSFeed(recentPosts, data.lastUpdated);
    fs.writeFileSync('feed.xml', rssFeed);
    console.log('Generated: feed.xml (RSS 2.0)');

    // Generate Atom feed
    const atomFeed = generateAtomFeed(recentPosts, data.lastUpdated);
    fs.writeFileSync('atom.xml', atomFeed);
    console.log('Generated: atom.xml (Atom 1.0)');

    console.log('\n=== Complete ===');
    console.log('Add these to your HTML head:');
    console.log('<link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml">');
    console.log('<link rel="alternate" type="application/atom+xml" title="Atom Feed" href="/atom.xml">');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
