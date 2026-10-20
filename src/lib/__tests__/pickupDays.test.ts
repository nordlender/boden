import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	return { db: createTestDb() };
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
	findOverlappingWindows,
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
			{ date: '2026-09-10', startTime: '09:00', endTime: '10:00', where: null },
		]);
		const dates = await getUpcomingAvailablePickupDates('2026-01-01');
		expect(dates).toEqual(['2026-09-10', '2026-09-20']);
	});

	it('silently drops a malformed date rather than throwing', async () => {
		await expect(createSingleDays(MODERATOR_A, [{ date: 'not-a-date', startTime: '09:00', endTime: '10:00', where: null }])).resolves.toBeUndefined();
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
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-10', startTime: '09:00', endTime: '10:00', where: null }]);
		await createSingleDays(MODERATOR_B, [{ date: '2026-09-10', startTime: '09:00', endTime: '10:00', where: null }]);
		const rows = await listUpcomingPickupDays('2026-01-01');
		expect(rows).toHaveLength(2);
	});

	it('getUpcomingAvailablePickupDates excludes dates before the given floor', async () => {
		await createSingleDays(MODERATOR_A, [
			{ date: '2026-09-01', startTime: '09:00', endTime: '10:00', where: null },
			{ date: '2026-09-15', startTime: '09:00', endTime: '10:00', where: null },
		]);
		expect(await getUpcomingAvailablePickupDates('2026-09-10')).toEqual(['2026-09-15']);
	});

	it('a moderator can only delete their own single day', async () => {
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-10', startTime: '09:00', endTime: '10:00', where: null }]);
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
		await createSingleDays(MODERATOR_A, [{ date: '2026-09-07', startTime: '09:00', endTime: '10:00', where: null }]);
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

describe('findOverlappingWindows', () => {
	const DATE = '2026-09-10';

	async function offer(windows: [string, string][], date = DATE, moderator = MODERATOR_A) {
		await createSingleDays(
			moderator,
			windows.map(([startTime, endTime]) => ({ date, startTime, endTime, where: null })),
		);
	}

	const summary = (rows: { startTime: string; endTime: string; overlapMinutes: number }[]) =>
		rows.map((r) => `${r.startTime}-${r.endTime}:${r.overlapMinutes}`);

	it('returns windows on the date that overlap a range, with the overlap in minutes', async () => {
		await offer([['18:00', '20:00']]);
		const rows = findOverlappingWindows(DATE, [{ from: '17:00', to: '19:00' }]);
		expect(summary(rows)).toEqual(['18:00-20:00:60']);
		expect(rows[0]).toMatchObject({ date: DATE, userId: MODERATOR_A, kind: 'single' });
	});

	it('ignores windows that only touch a range at either edge', async () => {
		await offer([['16:00', '18:00'], ['20:00', '22:00']]);
		expect(findOverlappingWindows(DATE, [{ from: '18:00', to: '20:00' }])).toEqual([]);
	});

	it('counts a window inside a range, and a range inside a window', async () => {
		await offer([['12:00', '13:00'], ['15:00', '21:00']]);
		const rows = findOverlappingWindows(DATE, [{ from: '11:00', to: '14:00' }, { from: '18:00', to: '19:00' }]);
		expect(summary(rows)).toEqual(['12:00-13:00:60', '15:00-21:00:60']);
	});

	it('ignores windows on other dates', async () => {
		await offer([['18:00', '20:00']], '2026-09-11');
		expect(findOverlappingWindows(DATE, [{ from: '18:00', to: '20:00' }])).toEqual([]);
	});

	it('sorts the best match (largest overlap) first', async () => {
		await offer([['10:00', '11:00'], ['14:00', '18:00'], ['19:00', '20:00']]);
		const rows = findOverlappingWindows(DATE, [{ from: '10:30', to: '20:00' }]);
		expect(summary(rows)).toEqual(['14:00-18:00:240', '19:00-20:00:60', '10:00-11:00:30']);
	});

	it('breaks ties by earliest start', async () => {
		await offer([['18:00', '19:00'], ['12:00', '13:00']]);
		const rows = findOverlappingWindows(DATE, [{ from: '08:00', to: '22:00' }]);
		expect(summary(rows)).toEqual(['12:00-13:00:60', '18:00-19:00:60']);
	});

	it('sums the overlap of several ranges with one window', async () => {
		await offer([['12:00', '20:00']]);
		const rows = findOverlappingWindows(DATE, [{ from: '12:00', to: '13:00' }, { from: '18:00', to: '19:30' }]);
		expect(summary(rows)).toEqual(['12:00-20:00:150']);
	});

	it('merges overlapping ranges first, so their shared part is not counted twice', async () => {
		await offer([['12:00', '20:00']]);
		const rows = findOverlappingWindows(DATE, [{ from: '12:00', to: '15:00' }, { from: '14:00', to: '16:00' }]);
		expect(summary(rows)).toEqual(['12:00-20:00:240']);
	});

	it('includes recurring windows and several moderators\' windows', async () => {
		await offer([['18:00', '20:00']], DATE, MODERATOR_B);
		await createRecurringRule({ createdByUserId: ADMIN, weekday: 4, startTime: '17:00', endTime: '19:00', startDate: DATE, endDate: DATE });
		const rows = findOverlappingWindows(DATE, [{ from: '18:00', to: '19:00' }]);
		expect(rows.map((r) => r.kind).sort()).toEqual(['recurring', 'single']);
	});

	it('returns nothing for no ranges or only invalid ranges', async () => {
		await offer([['18:00', '20:00']]);
		expect(findOverlappingWindows(DATE, [])).toEqual([]);
		expect(findOverlappingWindows(DATE, [{ from: '19:00', to: '18:00' }, { from: 'x', to: '19:00' }])).toEqual([]);
	});
});
