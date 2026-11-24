import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { cancelOrder, createOrder, deleteOrder, findOrderCodeForCart, getMemberOrder, getMemberOrderRows, rescheduleOrder } from '../orders';
import type { CartEntry } from '../cartEntries';

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

// Contact snapshot fields are required on createOrder
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
	disclaimerAccepted: false,
};

// createOrder join against the db (src/lib/orders.ts
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
	const { createTestDb, insertItems } = await import('../../db/testDb');
	const schema = await import('../../db/schema');

	const db = createTestDb();

	const [category] = await db.insert(schema.categories).values({ name: 'Ropes', slug: 'ropes' }).returning();
	const [product] = await db
		.insert(schema.products)
		.values({ slug: 'test-rope', title: 'Test Rope', categoryId: category.id, status: 'published' })
		.returning();
	// Item A: 1 in stock, so a single existing reservation fully books it.
	// Item B and item C: 5 in stock each, never reserved by anyone.
	await insertItems(db, { productId: product.id, slug: 'item-a', name: 'Item A', stockCount: 1 });
	await insertItems(db, { productId: product.id, slug: 'item-b', name: 'Item B', stockCount: 5 });
	await insertItems(db, { productId: product.id, slug: 'item-c', name: 'Item C', stockCount: 5 });
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
	await insertItems(db, { productId: product.id, slug: 'item-d', name: 'Item D', stockCount: 5, archived: true });
	await db.insert(schema.sets).values({ productId: product.id, slug: 'set-y', name: 'Set Y' });
	await db.insert(schema.setItems).values({ setId: 2, itemId: 4, quantity: 1 });
	await db.insert(schema.users).values({ id: 'member-1', name: 'Member', email: 'member@example.com' });
	const [otherUser] = await db.insert(schema.users).values({ id: 'other-user', name: 'Other', email: 'other@example.com' }).returning();

	// An existing order fully books item A for 2026-01-05..2026-01-10.
	const [existingOrder] = await db
		.insert(schema.orders)
		.values({ orderCode: 'AAAAAA', userId: otherUser.id, fromDate: '2026-01-05', toDate: '2026-01-10' })
		.returning();
	await db.insert(schema.orderItems).values({ orderId: existingOrder.id, itemId: 1, requestedQuantity: 1 }); // item A

	return { db };
});

// Every createOrder call below uses the same member and contact stand-ins
// and only varies the cart and the dates.
function placeOrder(cartEntries: CartEntry[], fromDate: string, toDate: string) {
	return createOrder({ userId: 'member-1', note: null, cartEntries, fromDate, toDate, ...CONTACT, cartId: crypto.randomUUID() });
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

// What acceptOrder (src/lib/moderatorOrders.ts) actually does today: moves
// the order to 'scheduled' and stamps acceptedAt.
async function markOrderScheduled(orderId: number) {
	const { db } = await import('../../db/client');
	const schema = await import('../../db/schema');
	await db.update(schema.orders).set({ status: 'scheduled', acceptedAt: new Date() }).where(eq(schema.orders.id, orderId));
}

describe('createOrder', () => {
	it('creates an order with an NNAAX order code', async () => {
		const result = await placeOrder([{ itemId: ITEM_B_ID, quantity: 2 }], '2026-02-01', '2026-02-05');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// NNAAX format (issue #155): two digits, two free letters, a role letter.
		expect(result.orderCode).toMatch(/^\d{2}[A-Z]{2}[ABIM]$/);
	});

	it('persists disclaimer acceptance as a timestamp on the order', async () => {
		const result = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-03-01',
			toDate: '2026-03-02',
			...CONTACT,
			cartId: crypto.randomUUID(),
			disclaimerAccepted: true,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { db } = await import('../../db/client');
		const { orders } = await import('../../db/schema');
		const row = db.select().from(orders).where(eq(orders.id, result.orderId)).get();
		expect(row?.disclaimerAcceptedAt).toBeInstanceOf(Date);
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
			cartId: crypto.randomUUID(),
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

describe('createOrder from an already-ordered cart', () => {
	function placeFromCart(userId: string, cartId: string) {
		return createOrder({
			userId,
			note: null,
			cartEntries: [{ itemId: ITEM_C_ID, quantity: 1 }],
			fromDate: '2026-04-01',
			toDate: '2026-04-02',
			...CONTACT,
			cartId,
		});
	}

	it('stores the cart id on the order', async () => {
		const cartId = crypto.randomUUID();
		const result = await placeFromCart('member-1', cartId);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((await findOrderByCode(result.orderCode))?.cartId).toBe(cartId);
		expect(await findOrderCodeForCart('member-1', cartId)).toBe(result.orderCode);
	});

	it('does not create a second order for the same cart, and points at the first one', async () => {
		const cartId = crypto.randomUUID();
		const first = await placeFromCart('member-1', cartId);
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const second = await placeFromCart('member-1', cartId);
		expect(second).toEqual({ ok: false, error: 'already_ordered', orderCode: first.orderCode });
		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		expect(db.select().from(schema.orders).where(eq(schema.orders.cartId, cartId)).all()).toHaveLength(1);
	});

	it("doesn't reveal another member's order placed from the same cart id", async () => {
		const cartId = crypto.randomUUID();
		const first = await placeFromCart('other-user', cartId);
		expect(first.ok).toBe(true);
		expect(await placeFromCart('member-1', cartId)).toEqual({ ok: false, error: 'already_ordered', orderCode: null });
		expect(await findOrderCodeForCart('member-1', cartId)).toBeNull();
	});
});

describe('createOrder with mixed availability', () => {
	it('rejects the whole order, creating nothing, when one of several items is unavailable', async () => {
		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		const before = await db.select().from(schema.orders);

		// Item A is booked 01-05..01-10, item B is free for the same range.
		const result = await placeOrder(
			[
				{ itemId: ITEM_A_ID, quantity: 1 },
				{ itemId: ITEM_B_ID, quantity: 1 },
			],
			'2026-01-06',
			'2026-01-08',
		);

		expect(result).toEqual({ ok: false, error: 'unavailable', unavailableItemIds: [ITEM_A_ID] });
		const after = await db.select().from(schema.orders);
		expect(after.length).toBe(before.length);
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

	it('rejects deleting a scheduled (moderator-accepted) order — it can only be cancelled', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-05-20', '2026-05-21');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await markOrderScheduled(created.orderId);

		expect(await deleteOrder({ orderCode: created.orderCode, userId: 'member-1' })).toEqual({
			ok: false,
			error: 'not_deletable',
			status: 'scheduled',
		});
		expect(await findOrderByCode(created.orderCode)).toBeDefined();
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

describe('cancelOrder', () => {
	it('soft-cancels a scheduled order owned by the caller, keeping the row and its orderItems', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-05-25', '2026-05-26');
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		await markOrderScheduled(created.orderId);

		expect(await cancelOrder({ orderCode: created.orderCode, userId: 'member-1' })).toEqual({ ok: true });

		const after = await findOrderByCode(created.orderCode);
		expect(after?.status).toBe('cancelled');
		expect(after?.cancelledAt).toBeInstanceOf(Date);
		expect(await orderItemRows(created.orderId)).toHaveLength(1);
	});

	it('rejects cancelling an order owned by someone else, without revealing whether it exists', async () => {
		// A scheduled order — otherwise the status filter alone would reject it
		// and this wouldn't exercise the ownership check.
		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		await db
			.insert(schema.orders)
			.values({ orderCode: 'BBBBB', userId: 'other-user', fromDate: '2026-07-01', toDate: '2026-07-02', status: 'scheduled', acceptedAt: new Date() });

		expect(await cancelOrder({ orderCode: 'BBBBB', userId: 'member-1' })).toEqual({ ok: false, error: 'not_found' });
		const after = await findOrderByCode('BBBBB');
		expect(after?.status).toBe('scheduled');
		expect(after?.cancelledAt).toBeNull();
		expect(await cancelOrder({ orderCode: 'ZZZZZ', userId: 'member-1' })).toEqual({ ok: false, error: 'not_found' });
	});

	it('rejects cancelling a requested order — that one is deleted instead', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-05-27', '2026-05-28');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		expect(await cancelOrder({ orderCode: created.orderCode, userId: 'member-1' })).toEqual({
			ok: false,
			error: 'not_cancellable',
			status: 'requested',
		});
		expect((await findOrderByCode(created.orderCode))?.status).toBe('requested');
	});

	it('rejects cancelling an active order and leaves it untouched', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-05-29', '2026-05-30');
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		await markOrderActive(created.orderId);

		expect(await cancelOrder({ orderCode: created.orderCode, userId: 'member-1' })).toEqual({
			ok: false,
			error: 'not_cancellable',
			status: 'active',
		});
		const after = await findOrderByCode(created.orderCode);
		expect(after?.status).toBe('active');
		expect(after?.cancelledAt).toBeNull();
	});

	it('is not repeatable: a second cancel reports not_cancellable', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-06-20', '2026-06-21');
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		await markOrderScheduled(created.orderId);

		expect(await cancelOrder({ orderCode: created.orderCode, userId: 'member-1' })).toEqual({ ok: true });
		expect(await cancelOrder({ orderCode: created.orderCode, userId: 'member-1' })).toEqual({
			ok: false,
			error: 'not_cancellable',
			status: 'cancelled',
		});
	});

	it('frees the stock: a cancelled order stops holding availability', async () => {
		// Item A has 1 unit — a scheduled order fully books it, so a second
		// overlapping order fails until the first is cancelled.
		const first = await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-10-01', '2026-10-05');
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		await markOrderScheduled(first.orderId);

		expect(await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-10-03', '2026-10-04')).toEqual({
			ok: false,
			error: 'unavailable',
			unavailableItemIds: [ITEM_A_ID],
		});

		expect(await cancelOrder({ orderCode: first.orderCode, userId: 'member-1' })).toEqual({ ok: true });

		const second = await placeOrder([{ itemId: ITEM_A_ID, quantity: 1 }], '2026-10-03', '2026-10-04');
		expect(second.ok).toBe(true);
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

	it('rejects rescheduling an order a moderator has accepted (scheduled)', async () => {
		const created = await placeOrder([{ itemId: ITEM_B_ID, quantity: 1 }], '2026-11-15', '2026-11-16');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await markOrderScheduled(created.orderId);

		const result = await rescheduleOrder({ orderCode: created.orderCode, userId: 'member-1', fromDate: '2026-11-20', toDate: '2026-11-21' });
		expect(result).toEqual({ ok: false, error: 'not_modifiable', status: 'scheduled' });
		expect((await findOrderByCode(created.orderCode))?.fromDate).toBe('2026-11-15');
	});

	it('rejects rescheduling an order owned by someone else, without revealing whether it exists', async () => {
		const result = await rescheduleOrder({ orderCode: 'AAAAAA', userId: 'member-1', fromDate: '2026-12-01', toDate: '2026-12-02' });
		expect(result).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('getMemberOrder', () => {
	it("returns the member's own order with its items", async () => {
		const result = await placeOrder([{ itemId: ITEM_B_ID, quantity: 2 }], '2026-09-01', '2026-09-02');
		if (!result.ok) throw new Error('expected order to be created');

		const order = await getMemberOrder(result.orderCode, 'member-1');
		expect(order?.orderCode).toBe(result.orderCode);
		expect(order?.orderItems.map((oi) => [oi.item.name, oi.requestedQuantity])).toEqual([['Item B', 2]]);
	});

	it("returns undefined for another member's order, same as a nonexistent one", async () => {
		expect(await getMemberOrder('AAAAAA', 'member-1')).toBeUndefined();
		expect(await getMemberOrder('NOPE1', 'member-1')).toBeUndefined();
		expect(await getMemberOrder('', 'member-1')).toBeUndefined();
	});
});

describe('getMemberOrderRows', () => {
	it("lists only the member's own orders, without a customer name", async () => {
		const result = await createOrder({
			userId: 'member-1',
			note: null,
			cartEntries: [{ itemId: ITEM_B_ID, quantity: 1 }],
			fromDate: '2026-12-10',
			toDate: '2026-12-11',
			...CONTACT,
			cartId: crypto.randomUUID(),
			contactName: 'Checkout Name',
		});
		if (!result.ok) throw new Error('expected order to be created');

		const rows = await getMemberOrderRows('member-1');
		const row = rows.find((r) => r.orderCode === result.orderCode);
		expect(row).toMatchObject({ items: [{ itemName: 'Item B', requestedQuantity: 1 }] });
		expect(row).not.toHaveProperty('customerName');
		expect(rows.map((r) => r.orderCode)).not.toContain('AAAAAA');
	});

	it('returns an empty list for a member with no orders', async () => {
		expect(await getMemberOrderRows('')).toEqual([]);
	});
});
