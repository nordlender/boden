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
	hasUnpaidFees: null,
	userIsMember: null,
};

// createOrder/createSplitOrders join against the db (src/lib/orders.ts
// imports ../db/client) — swap it here for a seeded in-memory sqlite db,
// same pattern as src/lib/__tests__/cart.test.ts and reservation.test.ts.
// Deterministic ids: itemA=1, itemB=2, itemC=3 (the only rows ever inserted
// into `items` here, and sqlite autoincrement counters start at 1 per table
// per in-memory db instance). setX=1 (the only row ever inserted into
// `sets`), resolving to 1× item B + 1× item C.
const ITEM_A_ID = 1;
const ITEM_B_ID = 2;
const ITEM_C_ID = 3;
const SET_X_ID = 1;
const SET_Y_ID = 2; // contains only item D, which is archived

vi.mock('../../db/client', async () => {
	const schema = await import('../../db/schema');
	const { createTestDb } = await import('../../db/testDb');
	const db = createTestDb();

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
	// vi.mock factories are hoisted above top-level const declarations, so
	// these use literal ids (1/2/3) rather than the ITEM_*_ID/SET_X_ID
	// constants declared above — same reason the item inserts below do too.
	await db.insert(schema.sets).values({ productId: product.id, slug: 'set-x', name: 'Set X' });
	await db.insert(schema.setItems).values([
		{ setId: 1, itemId: 2, quantity: 1 },
		{ setId: 1, itemId: 3, quantity: 1 },
	]);
	// Item D (archived) and Set Y (containing it) — for the "a set with an
	// archived component is dropped whole, not partially resolved" case.
	await db.insert(schema.items).values({ productId: product.id, slug: 'item-d', name: 'Item D', stockCount: 5, archived: true });
	await db.insert(schema.sets).values({ productId: product.id, slug: 'set-y', name: 'Set Y' });
	await db.insert(schema.setItems).values({ setId: 2, itemId: 4, quantity: 1 });
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

// Every createOrder/createSplitOrders call below uses the same member and
// contact stand-ins and only varies the cart, the dates, and (for a split)
// which lines to split out.
function placeOrder(cartEntries: CartEntry[], fromDate: string, toDate: string) {
	return createOrder({ userId: 'member-1', note: null, cartEntries, fromDate, toDate, ...CONTACT });
}

function placeSplitOrders(cartEntries: CartEntry[], fromDate: string, toDate: string, splitLineKeys: string[]) {
	return createSplitOrders({ userId: 'member-1', note: null, cartEntries, fromDate, toDate, splitLineKeys, ...CONTACT });
}

// db/schema are imported lazily (not at the top of the file) because both sit
// behind the vi.mock above — the same two dynamic imports every test used to
// repeat inline.
async function orderItemRows(orderId: number) {
	const { db } = await import('../../db/client');
	const schema = await import('../../db/schema');
	return db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
}

async function findOrderByCode(orderCode: string) {
	const { db } = await import('../../db/client');
	return db.query.orders.findFirst({ where: (t, { eq: eqCol }) => eqCol(t.orderCode, orderCode) });
}

async function markOrderActive(orderId: number) {
	const { db } = await import('../../db/client');
	const schema = await import('../../db/schema');
	await db.update(schema.orders).set({ status: 'active' }).where(eq(schema.orders.id, orderId));
}

describe('createOrder', () => {
	it('creates an order and returns a checkout token distinct from the order code', async () => {
		const result = await placeOrder([{ itemId: ITEM_B_ID, quantity: 2 }], '2026-02-01', '2026-02-05');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// NNAAX format (issue #155): two digits, two free letters, a role letter.
		expect(result.orderCode).toMatch(/^\d{2}[A-Z]{2}[ABIM]$/);
		expect(result.checkoutToken).toHaveLength(10);
		expect(result.checkoutToken).not.toBe(result.orderCode);
	});

	it('rejects with "unavailable" instead of creating an order when an item is already fully booked', async () => {
		// Overlaps the existing order's 2026-01-05..2026-01-10 booking of item
		// A's only unit.
		const result = await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-01-06', '2026-01-08');

		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
	});

	it('fails with user_not_found (defense-in-depth) instead of throwing when userId has no matching users row', async () => {
		const result = await createOrder({
			userId: 'no-such-user',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-02-01',
			toDate: '2026-02-05',
			...CONTACT,
		});

		expect(result).toEqual({ ok: false, error: 'user_not_found' });
	});

	it('resolves a set entry into its component items at checkout', async () => {
		const result = await placeOrder([{ setId: SET_X_ID, quantity: 2 }], '2026-02-10', '2026-02-12');

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const rows = await orderItemRows(result.orderId);
		expect(rows.map((row) => [row.itemId, row.requestedQuantity]).sort()).toEqual([
			[ITEM_B_ID, 2],
			[ITEM_C_ID, 2],
		]);
	});

	it('merges a direct item entry with the same item pulled in via a set into one summed orderItems row', async () => {
		const result = await placeOrder(
			[
				{ itemId: ITEM_B_ID, quantity: 1 },
				{ setId: SET_X_ID, quantity: 1 }, // also resolves to 1× item B
			],
			'2026-02-15',
			'2026-02-16',
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const rows = await orderItemRows(result.orderId);
		expect(rows).toHaveLength(2); // one row per distinct item, not per cart entry
		expect(rows.find((row) => row.itemId === ITEM_B_ID)?.requestedQuantity).toBe(2);
		expect(rows.find((row) => row.itemId === ITEM_C_ID)?.requestedQuantity).toBe(1);
	});

	it('drops a set entry whole when one of its components is archived, rather than partially resolving it', async () => {
		const result = await placeOrder(
			[
				{ itemId: ITEM_B_ID, quantity: 1 },
				{ setId: SET_Y_ID, quantity: 1 }, // resolves only to item D, which is archived
			],
			'2026-02-20',
			'2026-02-21',
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Only item B (the direct entry) made it in — set Y contributed nothing.
		const rows = await orderItemRows(result.orderId);
		expect(rows.map((row) => row.itemId)).toEqual([ITEM_B_ID]);
	});

	it('rejects with empty_cart when the only entry is a set whose sole component is archived', async () => {
		const result = await placeOrder([{ setId: SET_Y_ID, quantity: 1 }], '2026-02-22', '2026-02-23');

		expect(result).toEqual({ ok: false, error: 'empty_cart' });
	});
});

describe('createSplitOrders', () => {
	it('gives every order from the same submission the same checkout token', async () => {
		// Both items are available for this range — split item C out into its
		// own order and confirm both resulting orders carry the same token.
		const result = await placeSplitOrders(
			[
				{ itemId: ITEM_B_ID, quantity: 1 },
				{ itemId: ITEM_C_ID, quantity: 1 },
			],
			'2026-04-01',
			'2026-04-05',
			[`item:${ITEM_C_ID}`],
		);

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
		// Item A is unavailable for this range (booked 01-05..01-10), item B is
		// free — split item A out into its own order.
		const result = await placeSplitOrders(
			[
				{ itemId: ITEM_A_ID, quantity: 1 },
				{ itemId: ITEM_B_ID, quantity: 1 },
			],
			'2026-01-06',
			'2026-01-08',
			[`item:${ITEM_A_ID}`],
		);

		// The split-out group (item A) is still unavailable on its own — the
		// whole submission is rejected rather than silently placing only the
		// available half.
		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
	});

	it('rolls back the whole submission (not just the unavailable group) on rejection', async () => {
		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		const before = await db.select().from(schema.orders);

		await placeSplitOrders(
			[
				{ itemId: ITEM_A_ID, quantity: 1 },
				{ itemId: ITEM_B_ID, quantity: 1 },
			],
			'2026-01-06',
			'2026-01-08',
			[`item:${ITEM_A_ID}`],
		);

		const after = await db.select().from(schema.orders);
		// Neither the main group (item B, available) nor the split group
		// (item A, unavailable) should have been committed.
		expect(after.length).toBe(before.length);
	});

	it('falls back to a single order (still carrying a checkout token) when nothing was split', async () => {
		const result = await placeSplitOrders([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-03-01', '2026-03-02', []);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.orders).toHaveLength(1);
		expect(result.checkoutToken).toHaveLength(10);
	});

	it('splits a set line into its own order using a set: line key', async () => {
		// Both the item and the set are available for this range — split the
		// set line out into its own order and confirm it resolves to real
		// items (item B + item C) rather than being inserted as-is.
		const result = await placeSplitOrders(
			[
				{ itemId: ITEM_C_ID, quantity: 1 },
				{ setId: SET_X_ID, quantity: 1 },
			],
			'2026-04-15',
			'2026-04-17',
			[`set:${SET_X_ID}`],
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.orders).toHaveLength(2);

		const rows = await orderItemRows(result.orders[1].orderId);
		expect(rows.map((row) => row.itemId).sort()).toEqual([ITEM_B_ID, ITEM_C_ID]);
	});
});

describe('deleteOrder', () => {
	it('deletes a requested order owned by the caller, cascading its orderItems', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-05-01', '2026-05-02');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await deleteOrder({ orderCode: created.orderCode, userId: 'member-1' });
		expect(result).toEqual({ ok: true });

		expect(await findOrderByCode(created.orderCode)).toBeUndefined();
		expect(await orderItemRows(created.orderId)).toEqual([]);
	});

	it('rejects deleting an order owned by someone else, without revealing whether it exists', async () => {
		const result = await deleteOrder({ orderCode: 'AAAAAA', userId: 'member-1' });
		expect(result).toEqual({ ok: false, error: 'not_found' });
	});

	it('rejects deleting an order that has moved past "requested"', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-05-10', '2026-05-11');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await markOrderActive(created.orderId);

		const result = await deleteOrder({ orderCode: created.orderCode, userId: 'member-1' });
		expect(result).toEqual({ ok: false, error: 'not_deletable', status: 'active' });
		expect(await findOrderByCode(created.orderCode)).toBeDefined();
	});
});

describe('rescheduleOrder', () => {
	it('reschedules a requested order to new, available dates', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-06-01', '2026-06-02');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-06-10', toDate: '2026-06-11' });
		expect(result).toEqual({ ok: true, fromDate: '2026-06-10', toDate: '2026-06-11' });

		const updated = await findOrderByCode(created.orderCode);
		expect(updated?.fromDate).toBe('2026-06-10');
		expect(updated?.toDate).toBe('2026-06-11');
	});

	it('excludes the order\'s own current reservation from the availability check', async () => {
		// Item A has only 1 unit of stock — rescheduling this order to overlap
		// its OWN existing 2026-08-01..2026-08-03 booking must not count that
		// booking against itself (getReservationAvailability's excludeOrderId).
		const created = await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-08-01', '2026-08-03');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-08-02', toDate: '2026-08-04' });
		expect(result).toEqual({ ok: true, fromDate: '2026-08-02', toDate: '2026-08-04' });
	});

	it('rejects rescheduling into a range another order already holds the item for', async () => {
		// Both bookings are for item A (1 unit of stock) on non-overlapping
		// ranges, so both succeed — then reschedule the second to overlap the
		// first, which only its own exclusion doesn't cover.
		const first = await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-09-01', '2026-09-05');
		const second = await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-09-10', '2026-09-15');
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (!first.ok || !second.ok) return;

		const result = await rescheduleOrder({ orderCode: second.orderCode, userId: 'member-1', fromDate: '2026-09-02', toDate: '2026-09-03' });
		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
	});

	it('rejects a reschedule range longer than the max rental duration', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-10-01', '2026-10-02');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-10-05', toDate: '2026-10-25' });
		expect(result).toEqual({ ok: false, error: 'invalid_dates' });
	});

	it('rejects rescheduling an order that has moved past "requested"', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-11-01', '2026-11-02');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await markOrderActive(created.orderId);

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

	it('never draws the randomly-placed digits/letters from the ambiguous 0/O or 1/I pairs', () => {
		// The fixed 5th character legitimately can be 'I' (moderator) — this
		// only checks the two random digits and two random free letters
		// (positions 0-3), same ambiguity rationale as RANDOM_CODE_ALPHABET.
		for (let i = 0; i < 50; i++) {
			const code = generateOrderCode('member');
			const randomPart = code.slice(0, 4);
			expect(randomPart).not.toMatch(/[01IO]/);
		}
	});
});
