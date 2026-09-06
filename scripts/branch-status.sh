#!/usr/bin/env bash
# Reports the merge/worktree status of every local branch against main, so
# it's obvious what's safe to clean up (feeds prune-worktrees.sh) and what's
# still open. Uses merge-commit messages on main to recover PR numbers
# instead of `gh`, since this repo merges via "Merge pull request #N".
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

MAIN="${MAIN_BRANCH:-main}"

if ! git show-ref --verify --quiet "refs/heads/${MAIN}"; then
  echo "No local branch named '${MAIN}' (override with MAIN_BRANCH=...)." >&2
  exit 1
fi

# path per branch, from `git worktree list --porcelain`
declare -A worktree_for_branch=()
current_path=""
current_branch=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) current_path="${line#worktree }" ;;
    "branch refs/heads/"*)
      current_branch="${line#branch refs/heads/}"
      worktree_for_branch["$current_branch"]="$current_path"
      ;;
    "") current_path=""; current_branch="" ;;
  esac
done < <(git worktree list --porcelain)

# branch -> PR number, parsed off main's merge-commit subjects
declare -A pr_for_branch=()
while IFS=$'\t' read -r subject; do
  if [[ "$subject" =~ Merge\ pull\ request\ \#([0-9]+)\ from\ [^/]+/(.+)$ ]]; then
    pr_for_branch["${BASH_REMATCH[2]}"]="#${BASH_REMATCH[1]}"
  fi
done < <(git log "$MAIN" --merges --format='%s')

printf '%-42s %-9s %-6s %-10s %-12s %s\n' "BRANCH" "MERGED" "PR" "AHEAD" "LAST COMMIT" "WORKTREE"
printf '%-42s %-9s %-6s %-10s %-12s %s\n' "------" "------" "--" "-----" "-----------" "--------"

merged_with_worktree=0

while IFS= read -r branch; do
  [[ "$branch" == "$MAIN" ]] && continue

  if git merge-base --is-ancestor "$branch" "$MAIN" 2>/dev/null; then
    merged="merged"
  else
    merged="open"
  fi

  ahead=$(git rev-list --count "${MAIN}..${branch}" 2>/dev/null || echo "?")
  last_commit=$(git log -1 --format='%cr' "$branch" 2>/dev/null || echo "?")
  pr="${pr_for_branch[$branch]:--}"
  wt="${worktree_for_branch[$branch]:--}"

  printf '%-42s %-9s %-6s %-10s %-12s %s\n' "$branch" "$merged" "$pr" "+${ahead}" "$last_commit" "$wt"

  if [[ "$merged" == "merged" && "$wt" != "-" ]]; then
    merged_with_worktree=$((merged_with_worktree + 1))
  fi
done < <(git branch --format='%(refname:short)' | sort)

echo
if [[ "$merged_with_worktree" -gt 0 ]]; then
  echo "${merged_with_worktree} branch(es) are merged into ${MAIN} but still have a worktree checked out."
  echo "Run scripts/prune-worktrees.sh to clean them up."
else
  echo "No merged branches with lingering worktrees."
fi
