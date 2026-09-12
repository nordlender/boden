import { and, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { orders, users } from '../db/schema';
import type * as schema from '../db/schema';
import { isUniqueConstraintViolation } from './db-errors';

export type UsersDb = BetterSQLite3Database<typeof schema>;
type UsersTx = Parameters<Parameters<UsersDb['transaction']>[0]>[0];

export interface SignInUser {
  id: string;
  email: string;
  name?: string | null;
}

// Extracted out of src/auth.ts's signIn callback so the upsert logic (and in
// particular the email-collision fallback below) can be exercised directly
// against a real better-sqlite3 db in tests, without going through Auth.js.
//
// `users.id` (the OAuth provider's id) is the primary key, but `users.email`
// is ALSO unique (src/db/schema.ts). A plain `ON CONFLICT (id)` upsert only
// reconciles a collision on `id` — if some *other* row already owns this
// email (a stale row from a colleague's old profile, or an email address
// that got reassigned to a new bloc account with a new id), the INSERT
// still throws `UNIQUE constraint failed: users.email`, which would
// otherwise bubble up and reject the whole sign-in for no reason obvious to
// whoever hits it.
//
// Reconciliation choice: on an email collision, we first ask whether the
// stale row (the one under the other id) is plausibly *this same person*
// caught mid id-scheme migration (see isLikelyIdSchemeMigration below). If
// so, the stale row's `id` (and every FK column referencing it) is updated
// in place, in one transaction, to the new id — see migrateStaleRowInPlace.
// That keeps the row's order history reachable under the identity the user
// will keep signing in as from now on.
//
// Otherwise — the genuine edge case, two still-live bloc accounts that
// happen to report the same email — the stale row's email is renamed out of
// the way instead, never its `id`: `orders` (and other tables) reference
// `users.id` with no ON UPDATE CASCADE, so repointing a row's id when it
// might already have order history throws a foreign-key violation unless
// every referencing FK column is updated in the same transaction (which is
// exactly what migrateStaleRowInPlace does — a plain `UPDATE users SET id =
// ...` alone was tried first and broke exactly that way). Renaming the
// stale row's email can't violate any constraint (the new value is derived
// from that row's own id, which is already guaranteed unique) and keeps
// that row's id — and thus its order history — completely intact; it just
// stops being reachable by email, which is fine since bloc no longer
// reports that email for it anyway.
//
// Known, deliberate tradeoffs (rare-edge-case territory, not worth more
// machinery for): (1) `users.email`'s UNIQUE index is case-sensitive (no
// COLLATE NOCASE), so this only reconciles byte-identical email strings —
// bloc returning the same address with different casing across sign-ins
// isn't handled, matching how the column is already declared; changing
// that is a schema/migration change, not a signIn-callback fix. (2) a
// vacated row (genuine-collision path) is left behind permanently rather
// than cleaned up — the alternative (an ON UPDATE CASCADE on the FKs into
// users.id) is a schema change too, and this path is expected to be hit
// rarely enough that a stray placeholder row isn't a real cost.
//
// TODO(investigate): the genuine-collision fallback only makes sense if
// "some other id currently holds this email" always means reassignment
// (the old id is dead) once the id-scheme migration above has settled. It
// can't distinguish that from two still-live bloc accounts that simply
// share an email (e.g. a household/org address) — in that case the two ids
// perpetually vacate each other's email on alternating sign-ins. Open
// question: does bloc ever report one current email for two live ids? If
// not (or if we're willing to treat that as "same person, two bloc
// accounts" and not worry about it), consider instead just dropping the
// UNIQUE constraint on `users.email` (schema.ts) and deleting this entire
// fallback — nothing in this codebase looks up a user by email (orders/etc.
// all key on `users.id`), so the constraint isn't protecting any real
// invariant today.
//
// Legacy-id detection for the migration heuristic: pre-#59, `users.id` was
// Auth.js's own `crypto.randomUUID()`. Post-#59, it's always
// `String(<bloc's numeric userId>)` (see src/auth.ts's signIn callback).
// Those two formats never overlap, so "stale row's id looks like a UUID,
// and the incoming id is purely numeric" is a reliable, cheap signal for
// "this is the same person's pre-migration row" — and, crucially, it stops
// matching once every row has been migrated: a *future* genuine collision
// between two live, already-migrated (numeric-id) bloc accounts will not
// look like a UUID and will correctly fall through to the vacate path.
const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_RE = /^[0-9]+$/;

function isLikelyIdSchemeMigration(staleId: string, incomingId: string): boolean {
  return LEGACY_UUID_RE.test(staleId) && NUMERIC_ID_RE.test(incomingId);
}

// Repoints a stale row's `id` (and every column across the schema that
// references `users.id`) to `newId`, in place, within the given
// transaction. Uses SQLite's `defer_foreign_keys` pragma so the users-row
// update and the orders-table updates can run in any order without an
// intermediate FK violation (immediate FK checking would otherwise reject
// whichever statement runs first, since for one heartbeat either the child
// rows point at a no-longer-existing parent id, or the parent id doesn't
// yet exist for the still-old-pointing children) — checks are deferred
// until the transaction commits, by which point everything agrees.
function migrateStaleRowInPlace(tx: UsersTx, staleId: string, newId: string, email: string, name: string | null): void {
  tx.run(sql`PRAGMA defer_foreign_keys = ON`);

  tx.update(orders).set({ userId: newId }).where(eq(orders.userId, staleId)).run();
  tx.update(orders).set({ confirmedByUserId: newId }).where(eq(orders.confirmedByUserId, staleId)).run();
  tx.update(orders).set({ returnedByUserId: newId }).where(eq(orders.returnedByUserId, staleId)).run();

  tx.update(users)
    .set({ id: newId, email, name })
    .where(eq(users.id, staleId))
    .run();
}

function upsertUserRow(tx: UsersTx, user: SignInUser, name: string | null): void {
  tx.insert(users)
    .values({ id: user.id, email: user.email, name })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, name },
    })
    .run();
}

export async function upsertSignedInUser(db: UsersDb, user: SignInUser): Promise<void> {
  const name = user.name ?? null;

  try {
    await db.transaction((tx) => {
      upsertUserRow(tx, user, name);
    });
    return;
  } catch (err) {
    if (!isUniqueConstraintViolation(err, 'users.email')) throw err;
  }

  // Some other row (a different id) currently owns this email — vacate it
  // and retry the id-based upsert in one transaction. Both statements run
  // as a single atomic unit (a full rollback on any failure, nothing ever
  // left half-done by a mid-way crash), and — since better-sqlite3 runs the
  // transaction callback synchronously to completion — no other sign-in can
  // interleave between the vacate statement and the retry insert within
  // THIS transaction.
  //
  // That guarantee does NOT extend across the gap between the failed first
  // transaction above and this one: two concurrent signIns can both fail
  // their first attempt against the same stale row, then race each other
  // into this block. Confirmed empirically (two concurrent calls colliding
  // on one stale email, via Promise.all) — whichever's fallback transaction
  // commits first "wins" the email, and the other's fallback then vacates
  // the winner's freshly-claimed row instead of the original stale one,
  // silently stripping the email back off a signIn that itself reported
  // success. Not fixed here — left for the TODO above to resolve, since a
  // schema change removing the UNIQUE constraint would remove this whole
  // fallback (and the race) rather than patch it.
  await db.transaction((tx) => {
    const staleRow = tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, user.email), ne(users.id, user.id)))
      .get();

    if (staleRow && isLikelyIdSchemeMigration(staleRow.id, user.id)) {
      // Guard against a row already sitting at `user.id`: repointing the
      // stale row's id onto one that's already taken would throw
      // `UNIQUE constraint failed: users.id` uncaught (only the *first*
      // transaction's failure is caught above), breaking the "fails
      // closed" contract this callback promises. Fall through to the
      // vacate path instead — the same one already used for the genuine
      // two-live-accounts collision below — which is safe here regardless.
      const targetRowExists = tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).get();
      if (!targetRowExists) {
        migrateStaleRowInPlace(tx, staleRow.id, user.id, user.email, name);
        return;
      }
    }

    tx.update(users)
      .set({ email: sql`'vacated+' || ${users.id} || '@invalid.local'` })
      .where(and(eq(users.email, user.email), ne(users.id, user.id)))
      .run();

    upsertUserRow(tx, user, name);
  });
}
