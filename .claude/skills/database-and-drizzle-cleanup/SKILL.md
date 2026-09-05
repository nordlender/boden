---
name: database-and-drizzle-cleanup
description: Audit and fix src/db/schema.ts for the correctness gaps this project has hit before (missing relations(), missing check/unique constraints, missing FK indexes, redundant hand-maintained booleans, JS-side timestamp defaults, hard-delete on referenced rows), and — as a separate, extra-confirmed, backed-up step — squash the dev-era Drizzle migration history down to one clean, timestamp-named baseline migration and one fresh db file. Usable any time during current dev to fold accumulated migrations back into a clean baseline, not just once before a 1.0 cut — but never once a real production database exists. Use when asked to clean up, audit, review, or harden the database schema or Drizzle setup, or to update/reset the migration baseline. Always confirms with the user before changing anything, and always backs up migrations + db before the squash so it's revertible.
---

# Database and Drizzle cleanup

This skill covers two distinct things — do only what the user actually asked for:

- **Schema audit** (section 1): re-verify `src/db/schema.ts` against correctness
  standards this project has needed before. Safe to run any time, non-destructive
  until a migration is generated and approved.
- **Baseline update** (section 4): collapse all migrations accumulated so far
  into a single, timestamp-named migration that becomes the new baseline.
  Destructive to migration history and the local dev db by design, but always
  preceded by a real file backup so it's revertible. Usable any time during
  current dev — as often as useful — but never once a real production
  database exists with data that depends on the migration history.

The schema-audit checklist originates from `schema_fixes.md` (items 1–8 already
applied to `src/db/schema.ts` as of the `feature/auth` work — see `TASKS.md`).

## 0. Always confirm first — no exceptions

Before reading or changing anything, ask the user to confirm they want the
cleanup/audit run now. This applies every time the skill is invoked, including
when it was triggered automatically or via a slash command — do not treat a
prior invocation's confirmation as covering this one. Wait for an explicit yes
before touching `src/db/schema.ts` or generating a migration.

## 1. Checklist to audit `src/db/schema.ts` against

- **Relations.** Every table used with the relational query API
  (`db.query.<table>.findFirst({ with: {...} })`) has a matching
  `relations()` export covering each side actually queried (`one`/`many`).
  Adding a table or a new FK column without its relation silently breaks
  `with: {...}` queries at runtime, not at compile time.
- **Constraints.** Numeric columns that must be positive or non-negative have
  a `check()`. Columns meant to be unique per some combination (e.g. one row
  per `(orderId, itemId)`) have a `unique()` — don't rely on application code
  alone to enforce this.
- **Accountability fields.** State-changing actions performed by a
  moderator/admin (confirm, return, reject, etc.) record *who* did it via a
  nullable `text` FK to `users.id`, wired from `locals.user.id` in the API
  route — not just *that* it happened.
- **Soft delete on referenced rows.** If a row can be referenced by another
  table (e.g. `items` referenced by `orderItems`), don't hard-delete it —
  SQLite's default FK behavior is RESTRICT, and deleting breaks
  order-history/archive views. Use an `archived` boolean and filter it out of
  active queries instead.
- **No redundant hand-maintained booleans.** A flag that duplicates
  information derivable from other columns (e.g. an `available` bool instead
  of computing from `stockCount` minus active-order quantities) will drift
  out of sync. Prefer deriving it; flag any you find stored redundantly.
- **User-facing identifiers vs internal PKs.** IDs that get read aloud,
  typed, or put in a shareable URL (e.g. an order code) should be a separate
  random/opaque column, not the internal auto-increment `id`.
- **FK indexes.** SQLite does not auto-index foreign keys. Every FK column,
  and every column commonly filtered/joined on (status columns included),
  should have an explicit `index()`.
- **DB-level timestamp defaults.** Use a SQL-level default
  (`sql\`(unixepoch())\``) rather than `$defaultFn(() => new Date())`, so rows
  inserted outside the app (seed scripts, manual SQL) still get a timestamp.

## 2. Fields with unclear requirements

Don't invent fields to fill a gap you notice mid-audit. If something looks
incomplete but the requirements aren't confirmed (for example, this project's
`dueAt` on `orders` — deliberately left as a TODO per `schema_fixes.md` item
9), leave a `// TODO` comment explaining what's missing and why, and call it
out to the user instead of deciding silently.

## 3. After editing the schema

1. Run `npx drizzle-kit generate` to regenerate the migration (this project's
   `drizzle.config.ts` already sets `dialect: 'sqlite'`, `schema`, and `out` —
   don't pass `--dialect sqlite` positionally as `generate:sqlite`, that's not
   a valid command on the installed drizzle-kit v0.31).
2. Show the generated migration SQL to the user.
3. Get explicit approval before applying/running it. Never apply a migration
   without that approval, even within the same turn as an earlier confirmation.

## 4. Baseline update — squash migrations into a fresh baseline (separate, extra-confirmed step)

This is what "updating the database baseline" means during current dev:
instead of letting the migration trail grow indefinitely as the schema
iterates, collapse everything into one migration generated straight from the
current `src/db/schema.ts`, timestamp-named (see step 4 below) so the
filename records when it was cut. This is safe to do repeatedly, any time
it's useful — it is **not** a one-time, pre-1.0-only operation. What makes it
safe is the absence of real data anywhere that depends on the existing
migration history; the moment that stops being true (a real production
database exists), this must never run again — drop-and-recreate would either
fail against tables that already exist or destroy real rows. From that point
on, schema changes are ordinary additive migrations against the last
baseline, not squashes.

This is destructive to migration history and to the local dev db file, so it
needs its own explicit confirmation beyond the general one in section 0 —
don't fold the two together. Before touching anything, confirm with the user:

- that a real production database with real data doesn't already exist (if
  it does, refuse — see above), and
- that nothing else depends on the current migration history or the current
  local db file surviving (no shared/staging data, no other branch or
  worktree relying on the existing `src/db/migrations/` contents).

Then, once confirmed:

1. Show the user exactly what will be removed before removing it:
   - every file under `src/db/migrations/` (currently `0000_skinny_phalanx.sql`
     plus `meta/0000_snapshot.json` and `meta/_journal.json` — re-list at run
     time, since more may have accumulated since this was written), and
   - the local dev db file at the path in `drizzle.config.ts`'s
     `dbCredentials.url` (currently `./data/rental.db`; this path is
     gitignored, so it's local-only and never in git history — git cannot
     restore it, which is exactly why step 2 makes a real file backup).
2. **Stop the dev server first** (`astro dev stop`, per this project's
   convention) so nothing holds the db open mid-write, then back everything up
   into a single timestamped, untracked directory before deleting anything:
   ```
   ts=$(date +%Y%m%d%H%M%S)
   backup="data/backups/pre-squash-$ts"
   mkdir -p "$backup/migrations"
   cp -r src/db/migrations/. "$backup/migrations/"
   cp data/rental.db "$backup/" 2>/dev/null
   cp data/rental.db-wal "$backup/" 2>/dev/null
   cp data/rental.db-shm "$backup/" 2>/dev/null
   ```
   Copy the db file and its `-wal`/`-shm` sidecars together as a matched set —
   copying just the main file while a `-wal` exists can produce a db missing
   recently-committed rows. `data/` is already gitignored in its entirety, so
   `data/backups/` needs no extra `.gitignore` entry and won't get committed
   by accident. Tell the user the backup path once it's made, before
   proceeding.
3. Delete the original `src/db/migrations/` contents and the original
   `data/rental.db` (+ `-wal`/`-shm` if present) — the backup copy is untouched.
4. Run `npx drizzle-kit generate --prefix timestamp` to produce a fresh single
   migration directly from the current schema. This prepends the actual
   date/time instead of the usual sequential index (`0000_...`) — e.g.
   `20260902165138_<random-name>.sql`, verified against this project's
   installed drizzle-kit v0.31 — though it keeps a random word-pair suffix,
   it doesn't replace that. This is the new baseline, and its filename records
   when it was cut.
5. Apply it with `npx drizzle-kit migrate` (reads `drizzle.config.ts`
   directly, no flags needed) to recreate the local dev db, and confirm the
   app still boots and reads/writes against it correctly.
6. Commit the new single migration and its regenerated `meta/` journal. Leave
   the backup under `data/backups/` in place for now — it's local-only and
   costs nothing to keep; mention to the user that it's safe to delete once
   they're confident the squash is good.

### Optional: preserve catalog items across a reset

This baseline update wipes the local db, so any catalog test data (items,
categories, attributes, links) built up by hand is lost unless preserved
separately — the squash itself only carries forward *schema*, not rows. This
is a decoupled utility, not run automatically as part of steps 1-6 above;
mention it to the user as an option rather than assuming they want it.

Before step 2 (backing up/deleting), optionally export the current catalog:
```
node scripts/db-item-fixtures.mjs export --all
```
(or `--slugs foo,bar` for specific items, or run with no flags for an
interactive picker). This writes one JSON file per item to
`data/fixtures/items/` — already inside gitignored `data/`, never committed.

After step 5 (the fresh db is up), optionally reload some or all of it:
```
node scripts/db-item-fixtures.mjs import --all
```
Import is idempotent per item slug, so it's safe to run against an empty
post-squash db or one that already has some of these items.

### Reverting if the squash was erroneous

1. Stop the dev server (`astro dev stop`) if it's running.
2. Delete whatever `drizzle-kit generate --prefix timestamp` produced under
   `src/db/migrations/`, and delete `data/rental.db` (+ `-wal`/`-shm`).
3. Restore from the backup made in step 2 above:
   ```
   cp -r data/backups/pre-squash-<ts>/migrations/. src/db/migrations/
   cp data/backups/pre-squash-<ts>/rental.db data/ 2>/dev/null
   cp data/backups/pre-squash-<ts>/rental.db-wal data/ 2>/dev/null
   cp data/backups/pre-squash-<ts>/rental.db-shm data/ 2>/dev/null
   ```
4. If the squash was already committed, also revert that commit (or
   `git checkout <commit before the squash> -- src/db/migrations`) so the
   tracked migration files match the restored ones — the file restore alone
   only fixes the local working tree, not git history.
5. Restart the dev server and confirm the app reads/writes correctly against
   the restored db before continuing.
