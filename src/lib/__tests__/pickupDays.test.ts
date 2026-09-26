import { describe, it, expect, vi, beforeEach } from 'vitest';

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
const {
	isValidDateString,
	isValidTimeString,
	getUpcomingAvailablePickupDates,
	listUpcomingPickupDays,
	createSingleDays,
	deleteSingleDay,
	listRecurringRules,
	createRecurringRule,
	deleteRecurringRule,
} = await import('../pickupDays');

const MODERATOR_A = 'moderator-a';
const MODERATOR_B = 'moderator-b';
const ADMIN = 'admin-a';

beforeEach(async () => {
	await db.delete((await import('../../db/schema')).pickupDays);
	await db.delete((await import('../../db/schema')).pickupRecurringRules);
	for (const id of [MODERATOR_A, MODERATOR_B, ADMIN]) {
		await db
			.insert(users)
			.values({ id, email: `${id}@example.com`, name: id })
			.onConflictDoNothing();
	}
});

describe('isValidDateString', () => {
	it('accepts YYYY-MM-DD and rejects everything else', () => {
		expect(isValidDateString('2026-09-06')).toBe(true);
		expect(isValidDateString('not-a-date')).toBe(false);
		expect(isValidDateString('2026-9-6')).toBe(false);
		expect(isValidDateString('')).toBe(false);
	});
});

describe('isValidTimeString', () => {
	it('accepts HH:MM 24h and rejects everything else', () => {
		expect(isValidTimeString('18:00')).toBe(true);
		expect(isValidTimeString('00:00')).toBe(true);
		expect(isValidTimeString('23:59')).toBe(true);
		expect(isValidTimeString('24:00')).toBe(false);
		expect(isValidTimeString('9:00')).toBe(false);
		expect(isValidTimeString('')).toBe(false);
	});
});

describe('single pickup days', () => {
	it('creating then listing round-trips, sorted ascending by date', async () => {
		await createSingleDays(MODERATOR_A, [
			{ date: '2026-09-20', startTime: '10:00', endTime: '12:00', where: 'At Vulkan' },
			{ date: '2026-09-10', startTime: null, endTime: null, where: null },
		]);
		const dates = await getUpcomingAvailablePickupDates('2026-01-01');
		expect(dates).toEqual(['2026-09-10', '2026-09-20']);
	});

	it('silently drops a malformed date rather than throwing', async () => {
		await expect(createSingleDays(MODERATOR_A, [{ date: 'not-a-date', startTime: null, endTime: null, where: null }])).resolves.toBeUndefined();
		expect(await getUpcomingAvailablePickupDates('2026-01-01')).toEqual([]);
	});

	it('re-submitting the exact same date and time for the same moderator does not duplicate', async () => {
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-10', startTime: '10:00', endTime: '12:00', where: 'At Vulkan' }]);
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-10', startTime: '10:00', endTime: '12:00', where: 'At Vulkan' }]);
		const rows = await listUpcomingPickupDays('2026-01-01');
		expect(rows).toHaveLength(1);
	});

	it('a moderator can offer more than one time window on the same date', async () => {
		await createSingleDays(MODERATOR_A, [
			{ date: '2026-09-10', startTime: '12:00', endTime: '14:00', where: 'At Vulkan' },
			{ date: '2026-09-10', startTime: '18:00', endTime: '20:00', where: 'At Vulkan' },
		]);
		const rows = await listUpcomingPickupDays('2026-01-01');
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.date === '2026-09-10')).toBe(true);
		expect(rows.map((r) => r.startTime)).toEqual(['12:00', '18:00']);
	});

	it('two different moderators can each offer the same date', async () => {
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-10', startTime: null, endTime: null, where: null }]);
		await createSingleDays(MODERATOR_B, [{ date: '2026-09-10', startTime: null, endTime: null, where: null }]);
		const rows = await listUpcomingPickupDays('2026-01-01');
		expect(rows).toHaveLength(2);
	});

	it('getUpcomingAvailablePickupDates excludes dates before the given floor', async () => {
		await createSingleDays(MODERATOR_A, [
			{ date: '2026-09-01', startTime: null, endTime: null, where: null },
			{ date: '2026-09-15', startTime: null, endTime: null, where: null },
		]);
		expect(await getUpcomingAvailablePickupDates('2026-09-10')).toEqual(['2026-09-15']);
	});

	it('a moderator can only delete their own single day', async () => {
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-10', startTime: null, endTime: null, where: null }]);
		const [row] = await listUpcomingPickupDays('2026-01-01');

		expect(await deleteSingleDay(row.id, MODERATOR_B)).toBe(false);
		expect(await listUpcomingPickupDays('2026-01-01')).toHaveLength(1);

		expect(await deleteSingleDay(row.id, MODERATOR_A)).toBe(true);
		expect(await listUpcomingPickupDays('2026-01-01')).toHaveLength(0);
	});
});

describe('recurring pickup days', () => {
	it('generates one pickup_days row per matching weekday in range, kind "recurring"', async () => {
		// 2026-09-07 is a Monday; the range covers exactly 3 Mondays (7, 14, 21).
		await createRecurringRule({
			createdByUserId: ADMIN,
			weekday: 1,
			startTime: '18:00',
			endTime: '20:00',
			startDate: '2026-09-07',
			endDate: '2026-09-25',
		});
		const rows = await listUpcomingPickupDays('2026-01-01');
		expect(rows.map((r) => r.date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
		expect(rows.every((r) => r.kind === 'recurring')).toBe(true);
		expect(rows.every((r) => r.startTime === '18:00' && r.endTime === '20:00')).toBe(true);
	});

	it('a range with no matching weekday still creates the rule with zero generated days', async () => {
		const rule = await createRecurringRule({
			createdByUserId: ADMIN,
			weekday: 1, // Monday
			startTime: '18:00',
			endTime: '20:00',
			startDate: '2026-09-08', // Tuesday
			endDate: '2026-09-12', // Saturday, no Monday in between
		});
		expect(rule.id).toBeGreaterThan(0);
		expect(await listUpcomingPickupDays('2026-01-01')).toHaveLength(0);
		expect(await listRecurringRules()).toHaveLength(1);
	});

	it('deleting a rule cascades to its generated days', async () => {
		const rule = await createRecurringRule({
			createdByUserId: ADMIN,
			weekday: 1,
			startTime: '18:00',
			endTime: '20:00',
			startDate: '2026-09-07',
			endDate: '2026-09-21',
		});
		expect(await listUpcomingPickupDays('2026-01-01')).not.toHaveLength(0);

		expect(await deleteRecurringRule(rule.id)).toBe(true);
		expect(await listUpcomingPickupDays('2026-01-01')).toHaveLength(0);
		expect(await listRecurringRules()).toHaveLength(0);
	});

	it('deleting an unknown rule id returns false', async () => {
		expect(await deleteRecurringRule(999999)).toBe(false);
	});
});

describe('single and recurring days union for the reservation calendar', () => {
	it('getUpcomingAvailablePickupDates includes both kinds, deduplicated', async () => {
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-07', startTime: null, endTime: null, where: null }]);
		await createRecurringRule({
			createdByUserId: ADMIN,
			weekday: 1,
			startTime: '18:00',
			endTime: '20:00',
			startDate: '2026-09-07',
			endDate: '2026-09-07',
		});
		expect(await getUpcomingAvailablePickupDates('2026-01-01')).toEqual(['2026-09-07']);
	});
});
