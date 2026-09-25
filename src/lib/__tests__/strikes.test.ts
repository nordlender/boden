import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../../db/client', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('../../db/schema');

	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './src/db/migrations' });

	return { db };
});

const { db } = await import('../../db/client');
const { users } = await import('../../db/schema');
const { addStrike, isBarred, STRIKE_LIMIT } = await import('../strikes');

describe('addStrike', () => {
	beforeEach(async () => {
		await db.delete(users);
		await db.insert(users).values({ id: 'user-1', email: 'user1@example.com' });
	});

	it('increments strikes by one and leaves barredAt unset below the limit', async () => {
		const result = await addStrike('user-1');
		expect(result).toEqual({ strikes: 1, barred: false });

		const [row] = await db.select().from(users).where(eq(users.id, 'user-1'));
		expect(row.strikes).toBe(1);
		expect(row.barredAt).toBeNull();
	});

	it('sets barredAt the moment strikes reaches STRIKE_LIMIT', async () => {
		for (let i = 0; i < STRIKE_LIMIT - 1; i++) await addStrike('user-1');

		const result = await addStrike('user-1');
		expect(result.strikes).toBe(STRIKE_LIMIT);
		expect(result.barred).toBe(true);

		const [row] = await db.select().from(users).where(eq(users.id, 'user-1'));
		expect(row.barredAt).not.toBeNull();
		expect(isBarred(row)).toBe(true);
	});

	it('keeps counting strikes past the limit without moving barredAt', async () => {
		for (let i = 0; i < STRIKE_LIMIT; i++) await addStrike('user-1');
		const [barredRow] = await db.select().from(users).where(eq(users.id, 'user-1'));

		await addStrike('user-1');
		const [row] = await db.select().from(users).where(eq(users.id, 'user-1'));
		expect(row.strikes).toBe(STRIKE_LIMIT + 1);
		expect(row.barredAt).toEqual(barredRow.barredAt);
	});

	it('throws for an unknown user id', async () => {
		await expect(addStrike('does-not-exist')).rejects.toThrow();
	});
});

describe('isBarred', () => {
	it('is false when barredAt is null, true otherwise', () => {
		expect(isBarred({ barredAt: null })).toBe(false);
		expect(isBarred({ barredAt: new Date() })).toBe(true);
	});
});
