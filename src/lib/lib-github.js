/*
 * lib-github.js - the four reads this pipeline makes against the GitHub API.
 *
 * Extracted from update-forks.js at the 450-line limit. Grouped because they
 * share the same failure handling and the same reason for existing: every one of
 * them returns an empty or null result rather than throwing, so one unreachable
 * repository cannot take down a run that is processing 1,331 of them.
 */
'use strict';
const { CONFIG, GITHUB_TOKEN } = require('./lib-config.js');

async function fetchReadme(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.username}/${repo.name}/readme`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );
    if (response.ok) {
      const readme = await response.text();
      return readme.slice(0, 4000);
    }
  } catch (e) {
    console.log(`  Failed to fetch README for ${repo.name}: ${e.message}`);
  }
  return null;
}

// Fetch repo file structure
async function fetchRepoTree(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.username}/${repo.name}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );
    if (response.ok) {
      const data = await response.json();
      // Whole tree: slicing here made a 1,302-file repo count as 200. Capped at the prompt.
      return (data.tree || []).filter(f => f.type === 'blob').map(f => f.path);
    }
  } catch (e) {
    console.log(`  Failed to fetch tree for ${repo.name}: ${e.message}`);
  }
  return [];
}

function generateFallbackSummary(repo) {
  const desc = repo.description || '';
  const lang = repo.language || 'various technologies';
  const name = repo.name.replace(/-/g, ' ').replace(/_/g, ' ');

  if (desc.length > 100) {
    return `${desc}\n\nThis ${lang} project caught my attention for its practical approach to solving real developer problems. The codebase offers patterns worth studying for anyone working in this space.`;
  }

  return `${name} is a ${lang} project that demonstrates thoughtful software design. While exploring the codebase, I found patterns and implementations that could accelerate similar projects. Worth investigating if you're working with ${lang} or interested in clean, maintainable code architecture.`;
}

async function fetchRepos() {
  let allRepos = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/users/${CONFIG.username}/repos?sort=updated&per_page=100&page=${page}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

    const repos = await response.json();
    if (repos.length === 0) break;

    allRepos = allRepos.concat(repos);
    console.log(`Fetched page ${page}: ${repos.length} repos (total: ${allRepos.length})`);

    if (repos.length < 100) break;
    page++;
  }

  allRepos.forEach(r => { r._type = r.fork ? 'fork' : 'original'; });

  return allRepos
    .filter(r => !r.name.includes('.github.io') && !r.archived)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function fetchRepoDetails(repo) {
  try {
    const response = await fetch(repo.url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Pages-Blog-Generator',
        ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        ...repo,
        topics: data.topics || [],
        parent: data.parent ? {
          name: data.parent.full_name,
          url: data.parent.html_url,
          stars: data.parent.stargazers_count
        } : null
      };
    }
  } catch (e) {
    console.log(`  Failed to fetch details for ${repo.name}: ${e.message}`);
  }
  return repo;
}

module.exports = { fetchReadme, fetchRepoTree, fetchRepos, fetchRepoDetails,
  generateFallbackSummary };
