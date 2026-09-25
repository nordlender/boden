import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	return { db: createTestDb() };
});

const {
	isValidDateString,
	addAvailablePickupDate,
	removeAvailablePickupDate,
	listAvailablePickupDates,
	getUpcomingAvailablePickupDates,
} = await import('../pickupDays');

describe('isValidDateString', () => {
	it('accepts YYYY-MM-DD and rejects everything else', () => {
		expect(isValidDateString('2026-09-06')).toBe(true);
		expect(isValidDateString('not-a-date')).toBe(false);
		expect(isValidDateString('2026-9-6')).toBe(false);
		expect(isValidDateString('')).toBe(false);
	});
});

describe('pickup available days', () => {
	beforeEach(async () => {
		for (const date of await listAvailablePickupDates()) {
			await removeAvailablePickupDate(date);
		}
	});

	it('adding then listing round-trips, sorted ascending', async () => {
		await addAvailablePickupDate('2026-09-20');
		await addAvailablePickupDate('2026-09-10');
		expect(await listAvailablePickupDates()).toEqual(['2026-09-10', '2026-09-20']);
	});

	it('silently ignores a malformed date rather than throwing', async () => {
		await expect(addAvailablePickupDate('not-a-date')).resolves.toBeUndefined();
		expect(await listAvailablePickupDates()).toEqual([]);
	});

	it('adding the same date twice does not throw or duplicate', async () => {
		await addAvailablePickupDate('2026-09-10');
		await addAvailablePickupDate('2026-09-10');
		expect(await listAvailablePickupDates()).toEqual(['2026-09-10']);
	});

	it('getUpcomingAvailablePickupDates excludes dates before the given floor', async () => {
		await addAvailablePickupDate('2026-09-01');
		await addAvailablePickupDate('2026-09-15');
		expect(await getUpcomingAvailablePickupDates('2026-09-10')).toEqual(['2026-09-15']);
	});

	it('removing a date drops it from the list', async () => {
		await addAvailablePickupDate('2026-09-10');
		await removeAvailablePickupDate('2026-09-10');
		expect(await listAvailablePickupDates()).toEqual([]);
	});
});
