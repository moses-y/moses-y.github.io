# Git hooks

Hooks live here rather than in `.git/hooks` so they are versioned and shared.
They are not active until you point git at them, once per clone:

```bash
git config core.hooksPath .githooks
```

## pre-commit

Three gates, in order:

**Secrets.** Staged content is scanned for key-shaped strings (`nvapi-`, `sk-`,
`ghp_`, `github_pat_`, AWS access keys, PEM private keys). This repo is public
and served by GitHub Pages, so a committed key is published, not merely pushed.
Keys belong in `~/.nvidia-api-key` and the repository Actions secrets.

**Syntax.** Staged `.js` / `.mjs` / `.cjs` must pass `node --check`.

**Size.** No file over **450 lines**.

### The size baseline

A flat 450-line cap was unenforceable the day it was written: twelve files were
already over it, including every file actively being worked in. So the hook
reads `loc-baseline.txt`, which records those twelve at their length when the
rule landed. A grandfathered file may **shrink but never grow**. Everything else
is held to 450 outright.

That makes the rule enforceable immediately and convergent over time: the only
direction the baseline can move is down. When a file drops under 450, delete its
line from the baseline so it is held to the real limit from then on.

Regenerate the baseline only when deliberately re-recording it:

```bash
git ls-files -z \
  | grep -zEv '^(blog|data|structure|Resume|images|node_modules)/' \
  | grep -zE '\.(js|mjs|cjs|css|html|sh|yml|yaml)$' \
  | while IFS= read -r -d '' f; do
      n=$(wc -l < "$f"); [ "$n" -gt 450 ] && printf '%s\t%s\n' "$n" "$f"
    done | sort -rn > .githooks/loc-baseline.txt
```

Generated output (`blog/`, `data/`, `structure/`, `forks.json`, lockfiles,
minified assets) is exempt from the syntax and size gates. It is still scanned
for secrets.

### Bypassing

`git commit --no-verify` skips all three. If you use it, say why in the commit
message.
