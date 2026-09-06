#!/usr/bin/env bash
# Removes worktrees whose branch is fully merged into main, then deletes the
# now-unneeded local branch. Dry-run by default — pass --yes to actually act.
#
# Safety: never touches the main worktree, the worktree you're currently
# running from, locked worktrees, detached-HEAD worktrees, or any worktree
# with uncommitted/untracked changes (those are reported, not skipped
# silently).
set -euo pipefail

TOPLEVEL="$(git rev-parse --show-toplevel)"
cd "$TOPLEVEL"

MAIN="${MAIN_BRANCH:-main}"
DO_IT=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) DO_IT=true ;;
    --help|-h)
      echo "Usage: $0 [--yes]"
      echo "  (no args)  dry run — list what would be removed"
      echo "  --yes/-y   actually remove worktrees and delete merged branches"
      exit 0
      ;;
  esac
done

if ! git show-ref --verify --quiet "refs/heads/${MAIN}"; then
  echo "No local branch named '${MAIN}' (override with MAIN_BRANCH=...)." >&2
  exit 1
fi

MAIN_WORKTREE="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
CURRENT_WORKTREE="$(git rev-parse --show-toplevel)"

to_remove=()   # "path|branch"
skipped=()     # "path|reason"

path="" branch="" locked=false detached=false
flush() {
  [[ -z "$path" ]] && return
  if [[ "$path" == "$MAIN_WORKTREE" ]]; then
    : # never touch the main worktree
  elif [[ "$path" == "$CURRENT_WORKTREE" ]]; then
    skipped+=("$path|currently in use (this worktree)")
  elif $locked; then
    skipped+=("$path|locked")
  elif $detached; then
    skipped+=("$path|detached HEAD, no branch to check")
  elif [[ -z "$branch" ]]; then
    skipped+=("$path|no branch recorded")
  elif ! git merge-base --is-ancestor "$branch" "$MAIN" 2>/dev/null; then
    skipped+=("$path|branch '$branch' not merged into $MAIN")
  elif [[ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]]; then
    skipped+=("$path|branch '$branch' merged, but worktree has uncommitted/untracked changes")
  else
    to_remove+=("$path|$branch")
  fi
  path="" branch="" locked=false detached=false
}

while IFS= read -r line; do
  case "$line" in
    "worktree "*) flush; path="${line#worktree }" ;;
    "branch refs/heads/"*) branch="${line#branch refs/heads/}" ;;
    "locked"*) locked=true ;;
    "detached") detached=true ;;
    "") flush ;;
  esac
done < <(git worktree list --porcelain)
flush

if [[ ${#skipped[@]} -gt 0 ]]; then
  echo "Skipped:"
  for entry in "${skipped[@]}"; do
    IFS='|' read -r p reason <<< "$entry"
    echo "  - $p ($reason)"
  done
  echo
fi

if [[ ${#to_remove[@]} -eq 0 ]]; then
  echo "Nothing to prune — no clean, merged worktrees found."
  exit 0
fi

echo "$([[ "$DO_IT" == true ]] && echo "Removing" || echo "Would remove") ${#to_remove[@]} worktree(s):"
for entry in "${to_remove[@]}"; do
  IFS='|' read -r p b <<< "$entry"
  echo "  - $p [$b]"
done

if [[ "$DO_IT" != true ]]; then
  echo
  echo "Dry run only — re-run with --yes to actually remove these and delete their branches."
  exit 0
fi

echo
for entry in "${to_remove[@]}"; do
  IFS='|' read -r p b <<< "$entry"
  echo "Removing worktree $p ..."
  git worktree remove "$p"
  echo "Deleting branch $b ..."
  git branch -d "$b"
done

echo
echo "Done. Pruning worktree admin metadata..."
git worktree prune
