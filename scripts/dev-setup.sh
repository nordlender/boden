#!/usr/bin/env bash
# Bootstraps a fresh worktree in one step: copies .env from the main
# checkout, runs pending Drizzle migrations, and seeds the example catalog.
#
# Worktrees don't inherit untracked files, so .env and the sqlite db under
# data/ don't exist yet in a new worktree — this script exists so that
# doesn't have to be redone by hand every time.
#
# Known gaps, not yet fixed (see README):
#   - .env's REDIRECT_URL is copied verbatim from main, which may not match
#     the port this worktree's dev server runs on.
#   - Overwrites this worktree's .env unconditionally, including any
#     hand-added ADMIN_USER_IDS/MODERATOR_USER_IDS edits.
#   - Reseeding reverts manual edits made to seeded items via checkout/wizard.
#
# Usage: npm run dev-setup
set -euo pipefail

rootDir="$(git rev-parse --show-toplevel)"
cd "$rootDir"

mainCheckout="$(git worktree list --porcelain | awk '/^worktree /{ wt=$2 } /^branch refs\/heads\/main$/{ print wt; exit }')"

if [ -z "${mainCheckout:-}" ]; then
  echo "Could not find the main checkout via 'git worktree list'. Is a 'main' branch checked out anywhere?" >&2
  exit 1
fi

if [ ! -f "${mainCheckout}/.env" ]; then
  echo "No .env found in main checkout at ${mainCheckout}. Set one up there first (see .env.example)." >&2
  exit 1
fi

echo "Copying .env from ${mainCheckout}..."
cp "${mainCheckout}/.env" .env

mkdir -p data

echo "Running pending migrations..."
npx drizzle-kit migrate

echo "Seeding example catalog..."
node scripts/seed-example-catalog.mjs

echo "Done. Note: REDIRECT_URL in .env still points at main's port — see README's dev-setup caveats if bloc login fails here."
