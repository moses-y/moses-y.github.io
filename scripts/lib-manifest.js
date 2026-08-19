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

/*
 * The body of a TOML array, by bracket balance rather than by finding the next
 * closing bracket. A lazy /\[([\s\S]*?)\]/ stops at the first ] it sees, and in
 * "pydantic[email]==2.6.1" that bracket belongs to the extras - so the array was
 * truncated mid-string and every dependency declared after the first one carrying
 * extras was silently dropped. Quotes are tracked so a bracket inside a version
 * string cannot close the array either.
 */
function arrayAfter(txt, opener) {
  const m = txt.match(opener);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1, quote = null;
  const start = i;
  for (; i < txt.length; i++) {
    const c = txt[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth) return txt.slice(start, i); }
  }
  return txt.slice(start, i);
}

// Pull only the dependency tables out of a pyproject, never the whole key space.
function fromPyproject(txt) {
  const out = [];
  const projDeps = arrayAfter(txt, /^[ \t]*dependencies[ \t]*=[ \t]*\[/m);
  if (projDeps) {
    // "requests>=2.31.0" - the constraint sits inside the same string as the name.
    for (const m of projDeps.matchAll(/["']\s*([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*([^"']*)["']/g)) {
      out.push({ n: m[1], s: (m[2] || '').trim() || null });
    }
  }
  for (const m of txt.matchAll(/^[ \t]*\[(?:tool\.)?(?:poetry|pdm|hatch)[^\]]*dependencies[^\]]*\][ \t]*\r?\n([\s\S]*?)(?=\n[ \t]*\[|(?![\s\S]))/gm)) {
    for (const d of m[1].matchAll(/^[ \t]*([A-Za-z0-9._-]+)[ \t]*=[ \t]*(?:"([^"]*)")?/gm)) {
      if (d[1].toLowerCase() !== 'python') out.push({ n: d[1], s: d[2] || null });
    }
  }
  for (const m of txt.matchAll(/^\s*\[project\.optional-dependencies\]([\s\S]*?)(?=^\s*\[|$)/gm)) {
    for (const d of m[1].matchAll(/["']\s*([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*([^"']*)["']/g)) {
      out.push({ n: d[1], s: (d[2] || '').trim() || null });
    }
  }
  return out;
}

// go.mod states an exact version on every require line, which makes it the
// strongest version data in the estate: not a range, the resolved module. Dropping
// it meant 1,742 Go dependencies could not be checked against an advisory
// database at all.
function fromGoMod(txt) {
  const out = [];
  for (const m of txt.matchAll(/^\s*require\s+\(([\s\S]*?)\)/gm)) {
    for (const d of m[1].matchAll(/^\s*(\S+)\s+(v\S+)/gm)) {
      if (/\/\//.test(d[0])) continue;                  // a commented-out line
      out.push({ n: d[1], s: d[2] });
    }
  }
  for (const m of txt.matchAll(/^\s*require\s+([^\s(]+)\s+(v\S+)/gm)) out.push({ n: m[1], s: m[2] });
  return out;
}

function fromCargo(txt) {
  const out = [];
  for (const m of txt.matchAll(/^[ \t]*\[(?:workspace\.)?(?:dev-|build-)?dependencies\][ \t]*\r?\n([\s\S]*?)(?=\n[ \t]*\[|(?![\s\S]))/gm)) {
    // Two forms: serde = "1.0.197", and tokio = { version = "1.36", features = [..] }.
    // Only the first was read, so every dependency written the second way lost its
    // version - which in this estate is most of them, because features are common.
    for (const d of m[1].matchAll(/^[ \t]*([A-Za-z0-9._-]+)[ \t]*=[ \t]*(?:"([^"]*)"|\{([^}]*)\})?/gm)) {
      let spec = d[2] || null;
      if (!spec && d[3]) {
        const inline = d[3].match(/version[ \t]*=[ \t]*"([^"]*)"/);
        spec = inline ? inline[1] : null;
      }
      out.push({ n: d[1], s: spec });
    }
  }
  return out;
}

function fromComposer(txt) {
  const j = JSON.parse(txt);
  const all = Object.assign({}, j.require, j['require-dev']);
  return Object.keys(all)
    // php itself and the ext-* entries are platform requirements, not packages,
    // and no advisory database has an entry for them.
    .filter(k => k !== 'php' && !/^(ext|lib)-/.test(k))
    .map(n => ({ n, s: typeof all[n] === 'string' ? all[n] : null }));
}

function fromPubspec(txt) {
  const out = [];
  // The old terminator was (?=^\S|$), and with the m flag that $ matches at the
  // end of the "dependencies:" line itself, so the lazy body matched nothing and
  // this parser returned an empty list for every pubspec ever read. pub does not
  // appear anywhere in the extracted ecosystems, which is the evidence.
  for (const m of txt.matchAll(/^(dev_)?dependencies:[ \t]*\r?\n([\s\S]*?)(?=^[A-Za-z_]|(?![\s\S]))/gm)) {
    // A dependency is either "name: ^1.2.3" or a nested block with no version on
    // the same line, and only the first form carries one.
    for (const d of m[2].matchAll(/^\s{2}([a-z0-9_]+):[ \t]*(\S+)?[ \t]*$/gm)) {
      if (d[1] === 'flutter') continue;
      out.push({ n: d[1], s: d[2] ? d[2].replace(/^["']|["']$/g, '') : null });
    }
  }
  return out;
}

function fromGemfile(txt) {
  // gem "rails", "~> 7.0.4" - the second string is the constraint when present,
  // and options like require: false are not.
  return [...txt.matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)]
    .map(m => ({ n: m[1], s: m[2] && /\d/.test(m[2]) ? m[2] : null }));
}

function fromGradle(txt) {
  return [...txt.matchAll(/(?:implementation|api|compile)\s*\(?["']([^"':]+):([^"':]+)(?::([^"']+))?/g)]
    .map(m => ({ n: m[2], s: m[3] || null }));
}

// The third element preserves case. Names were lowercased across the board, which
// is harmless for npm and PyPI - both normalise - and wrong for a Go module path:
// github.com/Masterminds/semver is a different string from its lowercase form and
// an advisory lookup on the latter simply misses. Same for a Maven artifact.
const PARSERS = [
  [/(^|\/)package\.json$/i, fromPackageJson],
  [/(^|\/)requirements[^/]*\.txt$/i, fromRequirements],
  [/(^|\/)pyproject\.toml$/i, fromPyproject],
  [/(^|\/)go\.mod$/i, fromGoMod, true],
  [/(^|\/)Cargo\.toml$/i, fromCargo],
  [/(^|\/)composer\.json$/i, fromComposer],
  [/(^|\/)pubspec\.yaml$/i, fromPubspec],
  [/(^|\/)Gemfile$/i, fromGemfile],
  [/(^|\/)build\.gradle(\.kts)?$/i, fromGradle, true]
];

// Lock files restate the same tree transitively and are often megabytes.
const SKIP = /(package-lock\.json|yarn\.lock|pnpm-lock|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)$/i;

function parseManifest(path, text) {
  if (SKIP.test(path)) return [];
  for (const [re, fn, preserveCase] of PARSERS) {
    if (re.test(path)) {
      try {
        const seen = new Set();
        const out = [];
        for (const item of fn(text)) {
          const raw = String(typeof item === 'string' ? item : item.n).trim();
          const name = preserveCase ? raw : raw.toLowerCase();
          // A module path is longer than a package name, so the length guard
          // cannot be one number for both.
          const maxLen = preserveCase ? 140 : 60;
          if (!name || name.length >= maxLen || /^[0-9.]+$/.test(name) || seen.has(name)) continue;
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
