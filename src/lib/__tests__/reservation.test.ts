import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { isValidDateRange, hasMixedAvailability, getReservationAvailability } from '../reservation';

// isValidDateRange rejects a `from` before "today" (src/lib/reservation.ts) —
// pin the clock well before every fixture date below (all in Jan/Feb 2026)
// so they stay valid regardless of when this suite actually runs.
beforeAll(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2025-12-01T00:00:00Z'));
});
afterAll(() => {
	vi.useRealTimers();
});

// getReservationAvailability joins against the db (src/lib/reservation.ts
// imports ../db/client) — swap it here for a seeded in-memory sqlite db, same
// pattern as src/lib/__tests__/cart.test.ts. Deterministic ids: itemA=1,
// itemB=2 (the only two rows ever inserted into `items` here, and sqlite
// autoincrement counters start at 1 per table per in-memory db instance).
const ITEM_A_ID = 1;
const ITEM_B_ID = 2;
const ITEM_C_ID = 3;

vi.mock('../../db/client', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('../../db/schema');

	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './src/db/migrations' });

	const [category] = await db.insert(schema.categories).values({ name: 'Ropes', slug: 'ropes' }).returning();
	const [product] = await db
		.insert(schema.products)
		.values({ slug: 'test-rope', title: 'Test Rope', categoryId: category.id, status: 'published' })
		.returning();
	// Item A: 2 in stock. Item B: 5 in stock, never reserved by anyone.
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-a', name: 'Item A', stockCount: 2 });
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-b', name: 'Item B', stockCount: 5 });
	// Item C: 4 in stock, 3 pulled out for service/quarantine (issue #62) —
	// never reserved by anyone, so this isolates the serviceQuantity exclusion
	// from the reserved-quantity sweep tested elsewhere in this file.
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-c', name: 'Item C', stockCount: 4, serviceQuantity: 3 });
	const [user] = await db.insert(schema.users).values({ id: 'other-user', name: 'Other', email: 'other@example.com' }).returning();

	// An existing order holds 1x item A for 2026-01-05..2026-01-10.
	const [existingOrder] = await db
		.insert(schema.orders)
		.values({ orderCode: 'AAAAAA', checkoutToken: 'TESTTOKEN1', userId: user.id, fromDate: '2026-01-05', toDate: '2026-01-10' })
		.returning();
	await db.insert(schema.orderItems).values({ orderId: existingOrder.id, itemId: 1, requestedQuantity: 1 });

	// A second, earlier order holds 1x item A for 2026-01-01..2026-01-04 —
	// immediately adjacent to (but not overlapping) the order above. Inserted
	// after it, so a query with no ORDER BY returns this row second — this is
	// what exercises the peakConcurrentQuantity same-day tie-break test below.
	const [adjacentOrder] = await db
		.insert(schema.orders)
		.values({ orderCode: 'CCCCCC', checkoutToken: 'TESTTOKEN2', userId: user.id, fromDate: '2026-01-01', toDate: '2026-01-04' })
		.returning();
	await db.insert(schema.orderItems).values({ orderId: adjacentOrder.id, itemId: 1, requestedQuantity: 1 });

	return { db };
});

describe('isValidDateRange', () => {
	it('accepts a well-formed range where from <= to', () => {
		expect(isValidDateRange({ from: '2026-01-01', to: '2026-01-05' })).toBe(true);
		expect(isValidDateRange({ from: '2026-01-01', to: '2026-01-01' })).toBe(true);
	});

	it('rejects a reversed range, missing ends, or malformed dates', () => {
		expect(isValidDateRange({ from: '2026-01-05', to: '2026-01-01' })).toBe(false);
		expect(isValidDateRange({ from: '2026-01-01' })).toBe(false);
		expect(isValidDateRange({ to: '2026-01-01' })).toBe(false);
		expect(isValidDateRange({ from: 'not-a-date', to: '2026-01-05' })).toBe(false);
	});

	it('rejects a from date before today, even if well-formed and from <= to', () => {
		// "today" is pinned to 2025-12-01 above.
		expect(isValidDateRange({ from: '2025-11-30', to: '2026-01-05' })).toBe(false);
	});

	it('accepts a from date of exactly today', () => {
		expect(isValidDateRange({ from: '2025-12-01', to: '2025-12-05' })).toBe(true);
	});
});

describe('hasMixedAvailability', () => {
	it('is true only when some but not all items are available', () => {
		expect(hasMixedAvailability([{ available: true } as never, { available: false } as never])).toBe(true);
		expect(hasMixedAvailability([{ available: true } as never, { available: true } as never])).toBe(false);
		expect(hasMixedAvailability([{ available: false } as never, { available: false } as never])).toBe(false);
	});
});

describe('getReservationAvailability', () => {
	it('reports unavailable when the requested quantity exceeds stock minus the overlapping reservation', async () => {
		// Item A has 2 in stock, 1 already reserved 01-05..01-10 — requesting
		// 2x during an overlapping range only leaves 1 free.
		const [availability] = getReservationAvailability({ from: '2026-01-06', to: '2026-01-08' }, [
			{ itemId: ITEM_A_ID, quantity: 2 },
		]);
		expect(availability.available).toBe(false);
		expect(availability.peakReserved).toBe(1);
	});

	it('reports available for the same item/range at a lower requested quantity', async () => {
		const [availability] = getReservationAvailability({ from: '2026-01-06', to: '2026-01-08' }, [
			{ itemId: ITEM_A_ID, quantity: 1 },
		]);
		expect(availability.available).toBe(true);
	});

	it('reports available when the requested range does not overlap the existing reservation', async () => {
		const [availability] = getReservationAvailability({ from: '2026-02-01', to: '2026-02-05' }, [
			{ itemId: ITEM_A_ID, quantity: 2 },
		]);
		expect(availability.available).toBe(true);
		expect(availability.peakReserved).toBe(0);
	});

	it('is unaffected by another item entirely', async () => {
		const [availability] = getReservationAvailability({ from: '2026-01-06', to: '2026-01-08' }, [
			{ itemId: ITEM_B_ID, quantity: 5 },
		]);
		expect(availability.available).toBe(true);
		expect(availability.peakReserved).toBe(0);
	});

	it('does not sum two back-to-back, non-overlapping reservations of the same item at their shared boundary day', () => {
		// Item A carries two existing 1x reservations that never overlap:
		// 01-01..01-04 and 01-05..01-10 (see the mock db setup above). A query
		// spanning both must report peak demand of 1, not 2 — summing them
		// would previously depend on incidental row order at the 01-05 tie
		// between one interval's start and the other's day-after-end sentinel.
		const [availability] = getReservationAvailability({ from: '2026-01-01', to: '2026-01-10' }, [
			{ itemId: ITEM_A_ID, quantity: 1 },
		]);
		expect(availability.peakReserved).toBe(1);
		expect(availability.available).toBe(true);
	});

	// Issue #62: quantity an admin has flagged in-service/quarantine must be
	// excluded from availability the same way a reserved quantity is, even
	// with zero competing orders.
	it('excludes serviceQuantity from availability even with no overlapping orders', () => {
		// Item C: 4 in stock, 3 in service -> only 1 truly free.
		const [availableAtOne] = getReservationAvailability({ from: '2026-02-01', to: '2026-02-05' }, [
			{ itemId: ITEM_C_ID, quantity: 1 },
		]);
		expect(availableAtOne.available).toBe(true);
		expect(availableAtOne.stockCount).toBe(1);

		const [unavailableAtTwo] = getReservationAvailability({ from: '2026-02-01', to: '2026-02-05' }, [
			{ itemId: ITEM_C_ID, quantity: 2 },
		]);
		expect(unavailableAtTwo.available).toBe(false);
	});
});
