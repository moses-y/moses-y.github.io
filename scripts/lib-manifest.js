'use strict';
// Format-aware dependency extraction. Each parser returns bare package names.
// Generic line-regex does not work: it reads TOML keys like "build-backend" as
// packages, which is how the first spike produced nonsense.

// Parsers return {n: name, s: declared spec or null}. Names alone cannot answer
// "is this stale" - that needs what the repo pinned, compared to what exists now.
function fromPackageJson(txt) {
  const j = JSON.parse(txt);
  const all = Object.assign({}, j.dependencies, j.devDependencies, j.peerDependencies);
  return Object.keys(all).map(n => ({ n, s: typeof all[n] === 'string' ? all[n] : null }));
}

function fromRequirements(txt) {
  return txt.split('\n')
    .map(l => l.split('#')[0].trim())
    .filter(l => l && !l.startsWith('-') && !l.startsWith('git+') && !l.startsWith('http'))
    .map(l => {
      const m = l.match(/^([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*(.*)$/);
      if (!m) return null;
      const spec = (m[2] || '').trim();
      return { n: m[1], s: spec || null };
    })
    .filter(Boolean);
}

// Pull only the dependency tables out of a pyproject, never the whole key space.
function fromPyproject(txt) {
  const out = [];
  const projDeps = txt.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (projDeps) {
    for (const m of projDeps[1].matchAll(/["']\s*([A-Za-z0-9._-]+)/g)) out.push(m[1]);
  }
  for (const m of txt.matchAll(/^[ \t]*\[(?:tool\.)?(?:poetry|pdm|hatch)[^\]]*dependencies[^\]]*\][ \t]*\r?\n([\s\S]*?)(?=\n[ \t]*\[|(?![\s\S]))/gm)) {
    for (const d of m[1].matchAll(/^[ \t]*([A-Za-z0-9._-]+)[ \t]*=[ \t]*(?:"([^"]*)")?/gm)) {
      if (d[1].toLowerCase() !== 'python') out.push({ n: d[1], s: d[2] || null });
    }
  }
  for (const m of txt.matchAll(/^\s*\[project\.optional-dependencies\]([\s\S]*?)(?=^\s*\[|$)/gm)) {
    for (const d of m[1].matchAll(/["']\s*([A-Za-z0-9._-]+)/g)) out.push(d[1]);
  }
  return out;
}

function fromGoMod(txt) {
  const out = [];
  for (const m of txt.matchAll(/^\s*require\s+\(([\s\S]*?)\)/gm)) {
    for (const d of m[1].matchAll(/^\s*([^\s]+)\s+v/gm)) out.push(d[1]);
  }
  for (const m of txt.matchAll(/^\s*require\s+([^\s(]+)\s+v/gm)) out.push(m[1]);
  return out;
}

function fromCargo(txt) {
  const out = [];
  for (const m of txt.matchAll(/^[ \t]*\[(?:workspace\.)?(?:dev-|build-)?dependencies\][ \t]*\r?\n([\s\S]*?)(?=\n[ \t]*\[|(?![\s\S]))/gm)) {
    for (const d of m[1].matchAll(/^[ \t]*([A-Za-z0-9._-]+)[ \t]*=[ \t]*(?:"([^"]*)")?/gm)) {
      out.push({ n: d[1], s: d[2] || null });
    }
  }
  return out;
}

function fromComposer(txt) {
  const j = JSON.parse(txt);
  return Object.keys(Object.assign({}, j.require, j['require-dev'])).filter(k => k !== 'php');
}

function fromPubspec(txt) {
  const out = [];
  for (const m of txt.matchAll(/^(dev_)?dependencies:\s*$([\s\S]*?)(?=^\S|$)/gm)) {
    for (const d of m[2].matchAll(/^\s{2}([a-z0-9_]+):/gm)) if (d[1] !== 'flutter') out.push(d[1]);
  }
  return out;
}

function fromGemfile(txt) {
  return [...txt.matchAll(/^\s*gem\s+["']([^"']+)/gm)].map(m => m[1]);
}

function fromGradle(txt) {
  return [...txt.matchAll(/(?:implementation|api|compile)\s*\(?["']([^"':]+:[^"':]+)/g)]
    .map(m => m[1].split(':').pop());
}

const PARSERS = [
  [/(^|\/)package\.json$/i, fromPackageJson],
  [/(^|\/)requirements[^/]*\.txt$/i, fromRequirements],
  [/(^|\/)pyproject\.toml$/i, fromPyproject],
  [/(^|\/)go\.mod$/i, fromGoMod],
  [/(^|\/)Cargo\.toml$/i, fromCargo],
  [/(^|\/)composer\.json$/i, fromComposer],
  [/(^|\/)pubspec\.yaml$/i, fromPubspec],
  [/(^|\/)Gemfile$/i, fromGemfile],
  [/(^|\/)build\.gradle(\.kts)?$/i, fromGradle]
];

// Lock files restate the same tree transitively and are often megabytes.
const SKIP = /(package-lock\.json|yarn\.lock|pnpm-lock|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)$/i;

function parseManifest(path, text) {
  if (SKIP.test(path)) return [];
  for (const [re, fn] of PARSERS) {
    if (re.test(path)) {
      try {
        const seen = new Set();
        const out = [];
        for (const item of fn(text)) {
          const name = String(typeof item === 'string' ? item : item.n).trim().toLowerCase();
          if (!name || name.length >= 60 || /^[0-9.]+$/.test(name) || seen.has(name)) continue;
          seen.add(name);
          out.push({ n: name, s: (typeof item === 'object' && item.s) ? String(item.s).slice(0, 40) : null });
        }
        return out;
      } catch (e) { return []; }
    }
  }
  return [];
}

const isParseable = p => !SKIP.test(p) && PARSERS.some(([re]) => re.test(p));

module.exports = { parseManifest, isParseable };
