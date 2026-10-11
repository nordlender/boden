import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { CALENDAR_DAYS, getProductVariantCalendars } from '../availabilityCalendar';

// Pin "today" (Oslo) so the fixture's dates are relative to it.
beforeAll(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
});
afterAll(() => {
	vi.useRealTimers();
});

// Product 1 has two items (A: stock 3, B: stock 2) and one set (2x A + 1x B).
vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	const schema = await import('../../db/schema');
	const db = createTestDb();

	const [product] = await db.insert(schema.products).values({ slug: 'p', title: 'P', status: 'published' }).returning();
	await db.insert(schema.items).values([
		{ productId: product.id, slug: 'a', name: 'A', stockCount: 3 },
		{ productId: product.id, slug: 'b', name: 'B', stockCount: 2 },
		{ productId: product.id, slug: 'gone', name: 'Archived', stockCount: 9, archived: true },
	]);
	const [set] = await db.insert(schema.sets).values({ productId: product.id, slug: 's', name: 'S' }).returning();
	await db.insert(schema.setItems).values([
		{ setId: set.id, itemId: 1, quantity: 2 },
		{ setId: set.id, itemId: 2, quantity: 1 },
	]);
	await db.insert(schema.users).values({ id: 'u', name: 'U', email: 'u@example.com' });
	// 2x A booked for tomorrow and the day after.
	const [order] = await db
		.insert(schema.orders)
		.values({ orderCode: '01AAM', checkoutToken: 'T1', userId: 'u', status: 'scheduled', fromDate: '2026-03-11', toDate: '2026-03-12' })
		.returning();
	await db.insert(schema.orderItems).values({ orderId: order.id, itemId: 1, requestedQuantity: 2 });
	return { db };
});

describe('getProductVariantCalendars', () => {
	it('returns four weeks per non-archived variant, starting today', async () => {
		const { start, calendars } = await getProductVariantCalendars(1);
		expect(start).toBe('2026-03-10');
		expect(calendars.map((c) => c.key)).toEqual(['item-1', 'item-2', 'set-1']);
		expect(calendars.every((c) => c.daily.length === CALENDAR_DAYS)).toBe(true);

		const [a, b, set] = calendars;
		expect(a.total).toBe(3);
		expect(a.daily.slice(0, 4)).toEqual([3, 1, 1, 3]);
		expect(b.daily.slice(0, 4)).toEqual([2, 2, 2, 2]);
		// A set needs 2x A: one fits normally, none while A is booked.
		expect(set.total).toBe(1);
		expect(set.daily.slice(0, 4)).toEqual([1, 0, 0, 1]);
	});
});
