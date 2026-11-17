#!/usr/bin/env bash
# One-shot dev environment bootstrap for a fresh worktree: copies .env from
# the main checkout (worktrees don't inherit untracked files), runs pending
# Drizzle migrations, then seeds the example catalog (including the units
# behind every item, since an item's stock is its number of active units)
# and example orders, pick-up days and messages. Only runs with DEV_MODE=true
# (in .env or exported), the same flag that enables dev mode in the app.
#
# Usage: npm run dev-setup
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

# awk reads to the end rather than `exit`ing on the first match: exiting
# early closes the pipe while git is still writing, git dies of SIGPIPE, and
# pipefail aborts the whole script (exit 141) whenever there are enough
# worktrees for the output not to fit in one write.
main_root="$(git worktree list --porcelain | awk '/^worktree / && !found {print $2; found = 1}')"

if [[ -z "$main_root" ]]; then
  echo "Could not determine the main checkout path via 'git worktree list'." >&2
  exit 1
fi

if [[ "$main_root" == "$root_dir" ]]; then
  echo "Already in the main checkout — skipping .env copy."
elif [[ ! -f "$main_root/.env" ]]; then
  echo "No .env found at $main_root — nothing to copy. Set one up there first." >&2
  exit 1
else
  cp "$main_root/.env" "$root_dir/.env"
  echo "Copied .env from $main_root"
fi

# Example data is for dev mode only (src/lib/devMode.ts) — refuse to seed a
# db that a non-dev-mode build would serve. Same precedence as Astro's env
# loading: an exported DEV_MODE wins over .env.
dev_mode="${DEV_MODE-}"
if [[ -z "$dev_mode" && -f "$root_dir/.env" ]]; then
  dev_mode="$(grep -E '^[[:space:]]*DEV_MODE=' "$root_dir/.env" | tail -n 1 | cut -d= -f2- | tr -d "\"'[:space:]" || true)"
fi
if [[ "$dev_mode" != "true" ]]; then
  echo "dev-setup only runs in dev mode. Set DEV_MODE=true in .env (see README's \"Dev mode\") and re-run." >&2
  exit 1
fi

echo "Running pending migrations..."
mkdir -p "$root_dir/data"
# Moves aside a db from before the last migration squash, which migrate
# can't upgrade in place (see the script's header).
node scripts/check-db-baseline.mjs
npx drizzle-kit migrate

echo "Seeding example catalog (items and their units)..."
node scripts/seed-example-catalog.mjs

echo "Seeding example orders, pick-up days and messages..."
node scripts/seed-example-orders.mjs

echo "dev-setup complete."
