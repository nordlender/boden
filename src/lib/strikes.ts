import { eq } from 'drizzle-orm';
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
export async function addStrike(userId: string): Promise<{ strikes: number; barred: boolean }> {
	const [before] = await db.select({ strikes: users.strikes, barredAt: users.barredAt }).from(users).where(eq(users.id, userId));
	if (!before) throw new Error(`addStrike: no user with id ${userId}`);

	const strikes = before.strikes + 1;
	const barredAt = before.barredAt ?? (strikes >= STRIKE_LIMIT ? new Date() : null);

	await db.update(users).set({ strikes, barredAt }).where(eq(users.id, userId));

	return { strikes, barred: barredAt !== null };
}
