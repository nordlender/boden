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

const {
	isValidDateString,
	isValidTimeString,
	addAvailablePickupDate,
	removeAvailablePickupDate,
	listAvailablePickupDates,
	getUpcomingAvailablePickupDates,
	addModeratorPickupOffer,
	retractModeratorPickupOffer,
	listModeratorPickupOffers,
	listActiveUpcomingModeratorOffers,
} = await import('../pickupDays');

const { db } = await import('../../db/client');
const { users, moderatorPickupOffers } = await import('../../db/schema');

async function ensureUser(id: string) {
	await db.insert(users).values({ id, email: `${id}@example.com` }).onConflictDoNothing();
}

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

describe('isValidTimeString', () => {
	it('accepts HH:MM and rejects everything else', () => {
		expect(isValidTimeString('14:30')).toBe(true);
		expect(isValidTimeString('2:30')).toBe(false);
		expect(isValidTimeString('not-a-time')).toBe(false);
		expect(isValidTimeString('')).toBe(false);
	});
});

describe('moderator pickup offers', () => {
	beforeEach(async () => {
		for (const date of await listAvailablePickupDates()) {
			await removeAvailablePickupDate(date);
		}
		await db.delete(moderatorPickupOffers);
		await ensureUser('mod-a');
		await ensureUser('mod-b');
	});

	it('adding then listing round-trips for that moderator', async () => {
		await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-20' });
		const offers = await listModeratorPickupOffers('mod-a');
		expect(offers).toHaveLength(1);
		expect(offers[0]).toMatchObject({ moderatorUserId: 'mod-a', date: '2026-09-20', status: 'active', startTime: null, endTime: null });
	});

	it('accepts an optional time window', async () => {
		const result = await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-20', startTime: '14:00', endTime: '18:00' });
		expect(result).toEqual({ ok: true });
		const [offer] = await listModeratorPickupOffers('mod-a');
		expect(offer).toMatchObject({ startTime: '14:00', endTime: '18:00' });
	});

	it('rejects a malformed date', async () => {
		const result = await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: 'not-a-date' });
		expect(result).toEqual({ ok: false, error: 'invalid_date' });
		expect(await listModeratorPickupOffers('mod-a')).toEqual([]);
	});

	it('rejects an end time at or before the start time', async () => {
		const result = await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-20', startTime: '14:00', endTime: '14:00' });
		expect(result).toEqual({ ok: false, error: 'invalid_time_range' });
	});

	it('getUpcomingAvailablePickupDates unions the admin baseline with active moderator offers', async () => {
		await addAvailablePickupDate('2026-09-05');
		await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-12' });
		await addModeratorPickupOffer({ moderatorUserId: 'mod-b', date: '2026-09-05' }); // overlaps the baseline date
		expect(await getUpcomingAvailablePickupDates('2026-09-01')).toEqual(['2026-09-05', '2026-09-12']);
	});

	it('a retracted offer no longer counts toward availability', async () => {
		await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-12' });
		const [offer] = await listModeratorPickupOffers('mod-a');
		await retractModeratorPickupOffer(offer.id, 'mod-a');
		expect(await getUpcomingAvailablePickupDates('2026-09-01')).toEqual([]);
		const [retracted] = await listModeratorPickupOffers('mod-a');
		expect(retracted.status).toBe('retracted');
		expect(retracted.retractedAt).not.toBeNull();
	});

	it('a moderator cannot retract another moderator\'s offer', async () => {
		await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-12' });
		const [offer] = await listModeratorPickupOffers('mod-a');
		await retractModeratorPickupOffer(offer.id, 'mod-b');
		const [unchanged] = await listModeratorPickupOffers('mod-a');
		expect(unchanged.status).toBe('active');
	});

	it('listActiveUpcomingModeratorOffers excludes a given moderator and past/retracted rows', async () => {
		await addModeratorPickupOffer({ moderatorUserId: 'mod-a', date: '2026-09-12' });
		await addModeratorPickupOffer({ moderatorUserId: 'mod-b', date: '2026-09-13' });
		await addModeratorPickupOffer({ moderatorUserId: 'mod-b', date: '2026-09-01' }); // before the floor
		const [ownOffer] = await listModeratorPickupOffers('mod-a');
		await retractModeratorPickupOffer(ownOffer.id, 'mod-a');

		const others = await listActiveUpcomingModeratorOffers('2026-09-05', 'mod-a');
		expect(others).toHaveLength(1);
		expect(others[0]).toMatchObject({ moderatorUserId: 'mod-b', date: '2026-09-13' });
	});
});
