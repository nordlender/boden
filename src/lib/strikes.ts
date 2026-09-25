import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

// A user is "out" once they reach this many strikes (GitHub issue #133).
export const STRIKE_LIMIT = 3;

export function isBarred(user: { barredAt: Date | null }): boolean {
	return user.barredAt !== null;
}

// Increments a user's strike count by one and, the moment it first reaches
// STRIKE_LIMIT, sets barredAt. Callers decide *when* a strike is warranted
// (late return, no-show, etc.) — that policy isn't implemented yet, this is
// just the counting/flagging mechanism itself.
//
// Done as a single atomic UPDATE (increment + conditional barredAt in SQL,
// not a read-modify-write in JS) so two concurrent strikes on the same user
// can't race and lose an increment or skip setting barredAt.
export async function addStrike(userId: string): Promise<{ strikes: number; barred: boolean }> {
	const [updated] = await db
		.update(users)
		.set({
			strikes: sql`${users.strikes} + 1`,
			barredAt: sql`CASE
				WHEN ${users.barredAt} IS NOT NULL THEN ${users.barredAt}
				WHEN ${users.strikes} + 1 >= ${STRIKE_LIMIT} THEN (unixepoch())
				ELSE NULL
			END`,
		})
		.where(eq(users.id, userId))
		.returning({ strikes: users.strikes, barredAt: users.barredAt });

	if (!updated) throw new Error(`addStrike: no user with id ${userId}`);

	return { strikes: updated.strikes, barred: updated.barredAt !== null };
}
