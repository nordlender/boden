# Scripts

Quality-of-life scripts for local dev. Run from the repo root, or via the
`npm run` aliases below.

## `dev-tunnel.sh` — `npm run dev:tunnel`

Starts the Astro dev server (if it isn't already running) and exposes it to
the internet with a public URL, using localtunnel. Useful for testing on a
phone or sharing a link with someone else.

The dev server keeps running in the background after you stop the tunnel
(Ctrl+C). Stop it separately with `npx astro dev stop`.

## `branch-status.sh` — `npm run branches`

Prints a table of every local branch: whether it's merged into `main`, its
PR number (if it was merged via a "Merge pull request #N" commit), how many
commits ahead of `main` it is, when it was last touched, and which worktree
(if any) has it checked out.

Use this to see what's safe to clean up before running `prune-worktrees.sh`,
or just to get a picture of what's in flight.

```
npm run branches
```

## `prune-worktrees.sh` — `npm run worktrees:prune`

Removes worktrees whose branch has already been merged into `main`, and
deletes the now-unneeded branch. Safe by default:

- **Dry run unless you pass `--yes`** — with no flags it only lists what it
  *would* remove.
- Never touches the main worktree or the one you're currently running from.
- Skips locked worktrees.
- Skips a worktree if it has uncommitted or untracked changes, even if its
  branch is merged — you'll see it listed under "Skipped" with the reason.

```
npm run branches            # see what's merged first (optional)
npm run worktrees:prune     # dry run — lists what would be removed
npm run worktrees:prune -- --yes   # actually remove them
```

## `dev-setup.sh` — `npm run dev-setup`

Bootstraps a fresh worktree: copies `.env` from the main checkout, runs
Drizzle migrations (creating `data/` if needed) and seeds example data via
`seed-example-catalog.mjs` then `seed-example-orders.mjs`. `check-db-baseline.mjs` runs first and moves a
local db that predates the current migration baseline aside to
`data/backups/stale-<timestamp>/` instead of letting the migration fail.
Refuses to run unless dev mode is on (`DEV_MODE=true` in `.env`, or exported).

## `sync-schema-doc.mjs` — `npm run docs:schema`

Rewrites the schema block in `docs/schema.md` so it is a verbatim copy of
`src/db/schema.ts`. Run it after any schema change. `npm run docs:schema:check`
(`--check`) exits non-zero if the block is stale; CI runs it.

## `check-doc-refs.mjs` — `npm run docs:check`

Fails if a doc links to or names a file that doesn't exist (markdown links,
backticked `src/…`/`docs/…`/`scripts/…` paths) or mentions an `npm run`
script that isn't in `package.json`. Fenced code blocks and `*` patterns are
skipped. CI runs it.

## `check-db-drift.mjs` — `npm run db:check`

Runs `drizzle-kit generate` against a scratch copy of `src/db/migrations` and
fails, printing the SQL, if `src/db/schema.ts` has changes no committed
migration contains. Nothing in the repo is modified. Not in CI yet: it
currently fails because the squashed baseline and `0016_add_attribute_key_is_variant`
disagree about `product_attribute_keys.is_variant` (see PR #362).

## `seed-example-catalog.mjs` + `seed-example-orders.mjs` — `npm run db:seed`

Seeds the example catalog (categories, products, items, units, sets), then
example users, orders, pick-up days and messages on top of it, into the local
db. Both are idempotent. CI runs it after migrating, as a smoke test that the seed still
matches the schema.
