#!/usr/bin/env bash
# One-shot dev environment bootstrap for a fresh worktree: copies .env from
# the main checkout (worktrees don't inherit untracked files), runs pending
# Drizzle migrations, then seeds the example catalog.
#
# Usage: npm run dev-setup
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

main_root="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"

if [ -z "$main_root" ]; then
  echo "Could not determine the main checkout path via 'git worktree list'." >&2
  exit 1
fi

if [ "$main_root" = "$root_dir" ]; then
  echo "Already in the main checkout — skipping .env copy."
elif [ ! -f "$main_root/.env" ]; then
  echo "No .env found at $main_root — nothing to copy. Set one up there first." >&2
  exit 1
else
  cp "$main_root/.env" "$root_dir/.env"
  echo "Copied .env from $main_root"
fi

echo "Running pending migrations..."
mkdir -p "$root_dir/data"
npx drizzle-kit migrate

echo "Seeding example catalog..."
node scripts/seed-example-catalog.mjs

echo "Seeding pickup-available days..."
node scripts/seed-pickup-days.mjs

echo "dev-setup complete."
