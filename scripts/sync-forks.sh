#!/usr/bin/env bash
#
# sync-forks.sh — Non-destructively sync all of your forks with their upstreams.
#
# Uses GitHub's "Sync fork" API (merge-upstream): a fast-forward-only pull from
# the upstream default branch into your fork's default branch.
#
# Safety guarantees:
#   * Never deletes a repo, branch, or commit.
#   * Only fast-forwards — if your fork has diverged, GitHub returns 409 and does
#     NOTHING (we just report and move on).
#   * If the upstream was deleted or made private, the API errors and we SKIP —
#     your fork stays exactly as it is.
#
# Requirements:
#   * gh CLI, authenticated (`gh auth status`) with a token that can read your
#     repos and write contents to your forks (classic PAT with `repo` scope, or
#     the default local `gh` login).
#
# Usage:
#   scripts/sync-forks.sh            # sync every fork
#   DRY_RUN=1 scripts/sync-forks.sh  # list what would be synced, change nothing
#
set -uo pipefail

DRY_RUN="${DRY_RUN:-0}"

echo "Collecting your forks..."
forks=$(gh api --paginate '/user/repos?per_page=100&affiliation=owner' \
  --jq '.[] | select(.fork==true and .archived==false) | .full_name')

if [ -z "$forks" ]; then
  echo "No (non-archived) forks found."
  exit 0
fi

total=0; synced=0; uptodate=0; skipped=0

while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  total=$((total+1))

  # Default branch of the fork (also our liveness check for the fork itself).
  branch=$(gh api "/repos/$repo" --jq '.default_branch' 2>/dev/null)
  if [ -z "$branch" ]; then
    echo "SKIP  $repo — cannot read repo (deleted/renamed/no access)"
    skipped=$((skipped+1)); continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY   $repo ($branch) — would sync from upstream"
    continue
  fi

  # Non-destructive fast-forward from upstream's matching branch.
  resp=$(gh api -X POST "/repos/$repo/merge-upstream" -f branch="$branch" 2>&1)
  if [ $? -eq 0 ]; then
    mtype=$(echo "$resp" | jq -r '.merge_type // "none"' 2>/dev/null)
    case "$mtype" in
      fast-forward) echo "OK    $repo ($branch) — fast-forwarded from upstream"; synced=$((synced+1));;
      none)         echo "OK    $repo ($branch) — already up to date"; uptodate=$((uptodate+1));;
      *)            echo "OK    $repo ($branch) — $mtype"; synced=$((synced+1));;
    esac
  else
    # Common non-fatal cases: upstream deleted/private, diverged (409), or a fork
    # of your own repo with nothing upstream. All non-destructive — we skip.
    reason=$(echo "$resp" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-120)
    echo "SKIP  $repo ($branch) — $reason"
    skipped=$((skipped+1))
  fi
done <<< "$forks"

echo "----------------------------------------"
echo "Forks: $total | Fast-forwarded: $synced | Already current: $uptodate | Skipped: $skipped"
