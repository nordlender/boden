import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createOrder, createSplitOrders, deleteOrder, generateOrderCode, rescheduleOrder } from '../orders';
import type { CartEntry } from '../cart';

// rescheduleOrder calls isValidDateRange (src/lib/reservation.ts), which
// rejects a `from` before "today" — pin the clock well before every fixture
// date in this file (all in 2026), same as reservation.test.ts.
beforeAll(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2025-12-01T00:00:00Z'));
});
afterAll(() => {
	vi.useRealTimers();
});

// Contact snapshot fields are required on createOrder/createSplitOrders
// input (src/db/schema.ts's orders.contactName/contactEmail) — a fixed
// stand-in for every call below, since none of these tests are about the
// contact snapshot itself. `role` is likewise a fixed 'member' stand-in
// (see the "order code role suffix" describe block below for role-specific
// behavior).
const CONTACT = {
	contactName: 'Test Member',
	contactEmail: 'member@example.com',
	contactMobile: null,
	role: 'member' as const,
};

// createOrder/createSplitOrders join against the db (src/lib/orders.ts
// imports ../db/client) — swap it here for a seeded in-memory sqlite db,
// same pattern as src/lib/__tests__/cart.test.ts and reservation.test.ts.
// Deterministic ids: itemA=1, itemB=2, itemC=3 (the only rows ever inserted
// into `items` here, and sqlite autoincrement counters start at 1 per table
// per in-memory db instance).
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
	// Item A: 1 in stock, so a single existing reservation fully books it.
	// Item B and item C: 5 in stock each, never reserved by anyone.
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-a', name: 'Item A', stockCount: 1 });
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-b', name: 'Item B', stockCount: 5 });
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-c', name: 'Item C', stockCount: 5 });
	await db.insert(schema.users).values({ id: 'member-1', name: 'Member', email: 'member@example.com' });
	const [otherUser] = await db.insert(schema.users).values({ id: 'other-user', name: 'Other', email: 'other@example.com' }).returning();

	// An existing order fully books item A for 2026-01-05..2026-01-10.
	const [existingOrder] = await db
		.insert(schema.orders)
		.values({ orderCode: 'AAAAAA', checkoutToken: 'EXISTINGTK', userId: otherUser.id, fromDate: '2026-01-05', toDate: '2026-01-10' })
		.returning();
	await db.insert(schema.orderItems).values({ orderId: existingOrder.id, itemId: 1, requestedQuantity: 1 }); // item A

	return { db };
});

describe('createOrder', () => {
	it('creates an order and returns a checkout token distinct from the order code', async () => {
		const cartEntries: CartEntry[] = [{ itemId: ITEM_B_ID, quantity: 2 }];
		const result = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries,
			fromDate: '2026-02-01',
			toDate: '2026-02-05',
			...CONTACT,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// NNAAX format (issue #155): two digits, two free letters, a role letter.
		expect(result.orderCode).toMatch(/^\d{2}[A-Z]{2}[ABIM]$/);
		expect(result.checkoutToken).toHaveLength(10);
		expect(result.checkoutToken).not.toBe(result.orderCode);
	});

	it('rejects with "unavailable" instead of creating an order when an item is already fully booked', async () => {
		const cartEntries: CartEntry[] = [{ itemId: ITEM_A_ID, quantity: 1 }];
		const result = await createOrder({
			userId: 'member-1',
			note: null,
			// Overlaps the existing order's 2026-01-05..2026-01-10 booking of
			// item A's only unit.
			cartEntries,
			fromDate: '2026-01-06',
			toDate: '2026-01-08',
			...CONTACT,
		});

		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
	});
});

describe('createSplitOrders', () => {
	it('gives every order from the same submission the same checkout token', async () => {
		const cartEntries: CartEntry[] = [
			{ itemId: ITEM_B_ID, quantity: 1 },
			{ itemId: ITEM_C_ID, quantity: 1 },
		];
		// Both items are available for this range — split item C out into its
		// own order and confirm both resulting orders carry the same token.
		const result = await createSplitOrders({
			userId: 'member-1',
			note: null,
			cartEntries,
			fromDate: '2026-04-01',
			toDate: '2026-04-05',
			splitItemIds: [ITEM_C_ID],
			...CONTACT,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.orders).toHaveLength(2);
		expect(result.orders[0].orderCode).not.toBe(result.orders[1].orderCode);

		const { db } = await import('../../db/client');
		const [orderA, orderB] = await Promise.all(
			result.orders.map((o) => db.query.orders.findFirst({ where: (t, { eq }) => eq(t.id, o.orderId) })),
		);
		expect(orderA?.checkoutToken).toBe(result.checkoutToken);
		expect(orderB?.checkoutToken).toBe(result.checkoutToken);
	});

	it('rejects the whole submission when the split-out group is still unavailable', async () => {
		const cartEntries: CartEntry[] = [
			{ itemId: ITEM_A_ID, quantity: 1 },
			{ itemId: ITEM_B_ID, quantity: 1 },
		];
		// Item A is unavailable for this range (booked 01-05..01-10), item B is
		// free — split item A out into its own order.
		const result = await createSplitOrders({
			userId: 'member-1',
			note: null,
			cartEntries,
			fromDate: '2026-01-06',
			toDate: '2026-01-08',
			splitItemIds: [ITEM_A_ID],
			...CONTACT,
		});

		// The split-out group (item A) is still unavailable on its own — the
		// whole submission is rejected rather than silently placing only the
		// available half.
		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
	});

	it('rolls back the whole submission (not just the unavailable group) on rejection', async () => {
		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		const before = await db.select().from(schema.orders);

		const cartEntries: CartEntry[] = [
			{ itemId: ITEM_A_ID, quantity: 1 },
			{ itemId: ITEM_B_ID, quantity: 1 },
		];
		await createSplitOrders({
			userId: 'member-1',
			note: null,
			cartEntries,
			fromDate: '2026-01-06',
			toDate: '2026-01-08',
			splitItemIds: [ITEM_A_ID],
			...CONTACT,
		});

		const after = await db.select().from(schema.orders);
		// Neither the main group (item B, available) nor the split group
		// (item A, unavailable) should have been committed.
		expect(after.length).toBe(before.length);
	});

	it('falls back to a single order (still carrying a checkout token) when nothing was split', async () => {
		const result = await createSplitOrders({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-03-01',
			toDate: '2026-03-02',
			splitItemIds: [],
			...CONTACT,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.orders).toHaveLength(1);
		expect(result.checkoutToken).toHaveLength(10);
	});
});

describe('deleteOrder', () => {
	it('deletes a requested order owned by the caller, cascading its orderItems', async () => {
		const created = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-05-01',
			toDate: '2026-05-02',
			...CONTACT,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await deleteOrder({ orderCode: created.orderCode, userId: 'member-1' });
		expect(result).toEqual({ ok: true });

		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		expect(await db.query.orders.findFirst({ where: (t, { eq: eqCol }) => eqCol(t.orderCode, created.orderCode) })).toBeUndefined();
		expect(await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, created.orderId))).toEqual([]);
	});

	it('rejects deleting an order owned by someone else, without revealing whether it exists', async () => {
		const result = await deleteOrder({ orderCode: 'AAAAAA', userId: 'member-1' });
		expect(result).toEqual({ ok: false, error: 'not_found' });
	});

	it('rejects deleting an order that has moved past "requested"', async () => {
		const created = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-05-10',
			toDate: '2026-05-11',
			...CONTACT,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		await db.update(schema.orders).set({ status: 'active' }).where(eq(schema.orders.id, created.orderId));

		const result = await deleteOrder({ orderCode: created.orderCode, userId: 'member-1' });
		expect(result).toEqual({ ok: false, error: 'not_deletable', status: 'active' });
		expect(await db.query.orders.findFirst({ where: (t, { eq: eqCol }) => eqCol(t.orderCode, created.orderCode) })).toBeDefined();
	});
});

describe('rescheduleOrder', () => {
	it('reschedules a requested order to new, available dates', async () => {
		const created = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-06-01',
			toDate: '2026-06-02',
			...CONTACT,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-06-10', toDate: '2026-06-11' });
		expect(result).toEqual({ ok: true, fromDate: '2026-06-10', toDate: '2026-06-11' });

		const { db } = await import('../../db/client');
		const updated = await db.query.orders.findFirst({ where: (t, { eq: eqCol }) => eqCol(t.orderCode, created.orderCode) });
		expect(updated?.fromDate).toBe('2026-06-10');
		expect(updated?.toDate).toBe('2026-06-11');
	});

	it('excludes the order\'s own current reservation from the availability check', async () => {
		// Item A has only 1 unit of stock — rescheduling this order to overlap
		// its OWN existing 2026-08-01..2026-08-03 booking must not count that
		// booking against itself (getReservationAvailability's excludeOrderId).
		const created = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_A_ID, quantity: 1 }],
			fromDate: '2026-08-01',
			toDate: '2026-08-03',
			...CONTACT,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-08-02', toDate: '2026-08-04' });
		expect(result).toEqual({ ok: true, fromDate: '2026-08-02', toDate: '2026-08-04' });
	});

	it('rejects rescheduling into a range another order already holds the item for', async () => {
		// Both bookings are for item A (1 unit of stock) on non-overlapping
		// ranges, so both succeed — then reschedule the second to overlap the
		// first, which only its own exclusion doesn't cover.
		const first = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_A_ID, quantity: 1 }],
			fromDate: '2026-09-01',
			toDate: '2026-09-05',
			...CONTACT,
		});
		const second = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_A_ID, quantity: 1 }],
			fromDate: '2026-09-10',
			toDate: '2026-09-15',
			...CONTACT,
		});
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (!first.ok || !second.ok) return;

		const result = await rescheduleOrder({ orderCode: second.orderCode, userId: 'member-1', fromDate: '2026-09-02', toDate: '2026-09-03' });
		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
	});

	it('rejects a reschedule range longer than the max rental duration', async () => {
		const created = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-10-01',
			toDate: '2026-10-02',
			...CONTACT,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-10-05', toDate: '2026-10-25' });
		expect(result).toEqual({ ok: false, error: 'invalid_dates' });
	});

	it('rejects rescheduling an order that has moved past "requested"', async () => {
		const created = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-11-01',
			toDate: '2026-11-02',
			...CONTACT,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		await db.update(schema.orders).set({ status: 'active' }).where(eq(schema.orders.id, created.orderId));

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-11-10', toDate: '2026-11-11' });
		expect(result).toEqual({ ok: false, error: 'not_modifiable', status: 'active' });
	});

	it('rejects rescheduling an order owned by someone else, without revealing whether it exists', async () => {
		const result = await rescheduleOrder({ orderCode: 'AAAAAA', userId: 'member-1', fromDate: '2026-12-01', toDate: '2026-12-02' });
		expect(result).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('generateOrderCode', () => {
	it("always ends a member order with M", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('member')).toMatch(/M$/);
		}
	});

	it("always ends an admin's order code with A", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('admin')).toMatch(/A$/);
		}
	});

	it("always ends a board member's order code with B", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('board')).toMatch(/B$/);
		}
	});

	it("always ends a moderator's (instructor's) order code with I", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('moderator')).toMatch(/I$/);
		}
	});

	it('matches the NNAAX format', () => {
		expect(generateOrderCode('member')).toMatch(/^\d{2}[A-Z]{2}[ABIM]$/);
	});
});
