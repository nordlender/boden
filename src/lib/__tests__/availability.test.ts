import { describe, it, expect, vi } from 'vitest';
import { addDaysIso, daysInclusive, getAvailableForRange, getClaims, getDailyAvailability, occupiedByDay, setDailyAvailability } from '../availability';

// Fixture: item 1 (stock 4), item 2 (stock 2). Orders below are inserted in
// the vi.mock factory so the module under test sees the seeded db.
// "Today" is passed explicitly as TODAY to every call, so nothing here
// depends on the real clock.
const TODAY = '2026-03-10';

vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	const schema = await import('../../db/schema');
	const db = createTestDb();

	const [product] = await db.insert(schema.products).values({ slug: 'p', title: 'P', status: 'published' }).returning();
	await db.insert(schema.items).values([
		{ productId: product.id, slug: 'a', name: 'A', stockCount: 4 },
		{ productId: product.id, slug: 'b', name: 'B', stockCount: 2 },
	]);
	await db.insert(schema.users).values({ id: 'u', name: 'U', email: 'u@example.com' });

	let n = 0;
	const order = async (
		status: 'requested' | 'scheduled' | 'active' | 'returned' | 'rejected',
		fromDate: string,
		toDate: string,
		lines: { itemId: number; requested: number; retrieved?: number }[],
	) => {
		n++;
		const [row] = await db
			.insert(schema.orders)
			.values({ orderCode: `0${n}AAM`, checkoutToken: `T${n}`, userId: 'u', status, fromDate, toDate })
			.returning();
		for (const line of lines) {
			await db.insert(schema.orderItems).values({ orderId: row.id, itemId: line.itemId, requestedQuantity: line.requested, retrievedQuantity: line.retrieved ?? null });
		}
	};

	// 1: requested, 2x A over 12..14
	await order('requested', '2026-03-12', '2026-03-14', [{ itemId: 1, requested: 2 }]);
	// 2: scheduled, 1x A over 14..16 (overlaps order 1 on the 14th only)
	await order('scheduled', '2026-03-14', '2026-03-16', [{ itemId: 1, requested: 1 }]);
	// 3: active, requested 3 but only 1 handed out, 9..11 — counts as 1
	await order('active', '2026-03-09', '2026-03-11', [{ itemId: 1, requested: 3, retrieved: 1 }]);
	// 4: active and overdue (ended the 5th, never returned), 1x B — its end is
	// pushed forward a week at a time past the 5th until it covers today
	await order('active', '2026-03-01', '2026-03-05', [{ itemId: 2, requested: 1, retrieved: 1 }]);
	// 5 and 6: returned / rejected — occupy nothing
	await order('returned', '2026-03-10', '2026-03-20', [{ itemId: 1, requested: 4, retrieved: 4 }]);
	await order('rejected', '2026-03-10', '2026-03-20', [{ itemId: 2, requested: 2 }]);

	return { db };
});

describe('date helpers', () => {
	it('adds days across month ends and counts inclusively', () => {
		expect(addDaysIso('2026-02-27', 3)).toBe('2026-03-02');
		expect(daysInclusive('2026-03-10', '2026-03-10')).toBe(1);
		expect(daysInclusive('2026-02-27', '2026-03-02')).toBe(4);
	});
});

describe('getDailyAvailability', () => {
	it('subtracts each order on exactly the days of its range', () => {
		const daily = getDailyAvailability([1], '2026-03-09', 9, { today: TODAY }).get(1);
		// days:      9  10  11  12  13  14  15  16  17
		// order 3:   1   1   1
		// order 1:              2   2   2
		// order 2:                      1   1   1
		expect(daily).toEqual([3, 3, 3, 2, 2, 1, 3, 3, 4]);
	});

	it('extends an overdue active order one week at a time until it covers today', () => {
		// Not yet overdue (today = the 4th, or the 5th itself): ends on the 5th as booked.
		expect(getDailyAvailability([2], '2026-03-04', 3, { today: '2026-03-04' }).get(2)).toEqual([1, 1, 2]);
		expect(getDailyAvailability([2], '2026-03-04', 3, { today: '2026-03-05' }).get(2)).toEqual([1, 1, 2]);
		// 1 day overdue (the 6th) and 5 days overdue (TODAY, the 10th): end = 5th + 7 = 12th.
		expect(getDailyAvailability([2], '2026-03-11', 3, { today: '2026-03-06' }).get(2)).toEqual([1, 1, 2]);
		expect(getDailyAvailability([2], TODAY, 4, { today: TODAY }).get(2)).toEqual([1, 1, 1, 2]);
		// Exactly 7 days overdue (the 12th): still the 12th.
		expect(getDailyAvailability([2], '2026-03-11', 3, { today: '2026-03-12' }).get(2)).toEqual([1, 1, 2]);
		// 8 days overdue (the 13th): end = 5th + 14 = 19th.
		expect(getDailyAvailability([2], '2026-03-18', 3, { today: '2026-03-13' }).get(2)).toEqual([1, 1, 2]);
		// Also seen by a window entirely after the original toDate.
		expect(getClaims([2], '2026-03-19', '2026-03-19', { today: '2026-03-13' })).toHaveLength(1);
		expect(getClaims([2], '2026-03-20', '2026-03-25', { today: '2026-03-13' })).toHaveLength(0);
	});

	it('ignores returned and rejected orders, and can exclude one order', () => {
		expect(getDailyAvailability([1], '2026-03-18', 2, { today: TODAY }).get(1)).toEqual([4, 4]);
		const withoutOrder1 = getDailyAvailability([1], '2026-03-12', 3, { today: TODAY, excludeOrderId: 1 }).get(1);
		expect(withoutOrder1).toEqual([4, 4, 3]);
	});

	it('returns zero stock for unknown items', () => {
		expect(getDailyAvailability([999], TODAY, 2, { today: TODAY }).get(999)).toEqual([0, 0]);
	});

	it('returns empty arrays for zero or negative day counts', () => {
		expect(getDailyAvailability([1, 2], TODAY, 0, { today: TODAY })).toEqual(new Map([[1, []], [2, []]]));
		expect(getDailyAvailability([1], TODAY, -3, { today: TODAY }).get(1)).toEqual([]);
	});

	it('uses a pre-fetched stock map instead of looking stock up', () => {
		expect(getDailyAvailability([1], '2026-03-18', 2, { today: TODAY, stock: new Map([[1, 10]]) }).get(1)).toEqual([10, 10]);
	});
});

describe('getAvailableForRange', () => {
	it('is the minimum over every day of the range', () => {
		const result = getAvailableForRange([1, 2], '2026-03-12', '2026-03-16', { today: TODAY });
		expect(result.get(1)).toBe(1); // the 14th
		expect(result.get(2)).toBe(1); // overdue order (extended to the 12th)
	});

	it('reports nothing available for a reversed range', () => {
		const result = getAvailableForRange([1, 999], '2026-03-16', '2026-03-12', { today: TODAY });
		expect(result.get(1)).toBe(0);
		expect(result.get(999)).toBe(0); // not Infinity, even with stock 0
	});
});

describe('getClaims', () => {
	it('uses the handed-out quantity once a moderator has recorded it', () => {
		const claim = getClaims([1], '2026-03-09', '2026-03-09', { today: TODAY }).find((c) => c.start === '2026-03-09');
		expect(claim?.quantity).toBe(1);
	});
});

describe('occupiedByDay', () => {
	it('clamps claims that start before or end after the window', () => {
		const occupied = occupiedByDay([{ orderId: 1, itemId: 1, quantity: 2, start: '2026-03-01', end: '2026-03-11' }], TODAY, 3);
		expect(occupied.get(1)).toEqual([2, 2, 0]);
	});
});

describe('setDailyAvailability', () => {
	it('is limited by the scarcest component per day', () => {
		const daily = new Map([
			[1, [4, 3, 1]],
			[2, [2, 2, 2]],
		]);
		// One set = 2x item 1 + 1x item 2.
		expect(setDailyAvailability([{ itemId: 1, quantity: 2 }, { itemId: 2, quantity: 1 }], daily, 3)).toEqual([2, 1, 0]);
		expect(setDailyAvailability([], daily, 3)).toEqual([0, 0, 0]);
	});
});
