import { and, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { users } from '../db/schema';
import type * as schema from '../db/schema';

export type UsersDb = BetterSQLite3Database<typeof schema>;

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
// Reconciliation choice: on an email collision, the *stale* row (the one
// under the other id) has its email renamed out of the way — never its
// `id` — and the signing-in user's own id-keyed row then takes the email.
// `id` is deliberately left alone on the stale row: `orders` (and other
// tables) reference `users.id` with no ON UPDATE CASCADE, so repointing a
// row's id when it might already have order history throws a foreign-key
// violation instead of fixing anything (confirmed: this was tried first and
// broke exactly that way). Renaming the stale row's email can't violate any
// constraint (the new value is derived from that row's own id, which is
// already guaranteed unique) and keeps that row's id — and thus its order
// history — completely intact; it just stops being reachable by email,
// which is fine since bloc no longer reports that email for it anyway.
export async function upsertSignedInUser(db: UsersDb, user: SignInUser): Promise<void> {
  const name = user.name ?? null;

  async function upsertById() {
    await db
      .insert(users)
      .values({ id: user.id, email: user.email, name })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: user.email, name },
      })
      .run();
  }

  try {
    await upsertById();
    return;
  } catch (err) {
    if (!isUniqueEmailConflict(err)) throw err;
  }

  // Some other row (a different id) currently owns this email — vacate it
  // by renaming that row's email to a value derived from its own id, which
  // can't collide with anything (ids are unique), then retry the id-based
  // upsert above, which will now succeed since the email is free.
  await db
    .update(users)
    .set({ email: sql`'vacated+' || ${users.id} || '@invalid.local'` })
    .where(and(eq(users.email, user.email), ne(users.id, user.id)))
    .run();

  await upsertById();
}

function isUniqueEmailConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('UNIQUE constraint failed') && message.includes('users.email');
}
