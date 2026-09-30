import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import {
	acceptOrder,
	confirmRetrieval,
	getFollowingRentalWorries,
	getOrderDetail,
	getOrderIdByCode,
	markReturned,
	rejectOrder,
} from '../moderatorOrders';

// Deterministic ids from the seed below (sqlite autoincrement starts at 1
// per table per in-memory db instance, same convention as orders.test.ts):
const ITEM_AVAILABLE_ID = 1;
const ITEM_ARCHIVED_ID = 2;
const ITEM_HIDDEN_PRODUCT_ID = 3;
const ITEM_DOUBLE_BOOK_ID = 4;
const ITEM_FOLLOWING_ID = 5;

vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	const schema = await import('../../db/schema');

	const db = createTestDb();

	const [category] = await db.insert(schema.categories).values({ name: 'Test', slug: 'test' }).returning();
	const [productPublished] = await db
		.insert(schema.products)
		.values({ slug: 'published-product', title: 'Published Product', categoryId: category.id, status: 'published' })
		.returning();
	const [productHidden] = await db
		.insert(schema.products)
		.values({ slug: 'hidden-product', title: 'Hidden Product', categoryId: category.id, status: 'hidden' })
		.returning();

	await db.insert(schema.items).values({ productId: productPublished.id, slug: 'available', name: 'Available Item', stockCount: 5, archived: false });
	await db.insert(schema.items).values({ productId: productPublished.id, slug: 'archived', name: 'Archived Item', stockCount: 5, archived: true });
	await db.insert(schema.items).values({ productId: productHidden.id, slug: 'hidden-product-item', name: 'Hidden Product Item', stockCount: 5, archived: false });
	await db.insert(schema.items).values({ productId: productPublished.id, slug: 'double-book', name: 'Double Book Item', stockCount: 1, archived: false });
	await db.insert(schema.items).values({ productId: productPublished.id, slug: 'following', name: 'Following Item', stockCount: 1, archived: false });

	await db.insert(schema.users).values({ id: 'member-1', name: 'Member', email: 'member@example.com' });
	await db.insert(schema.users).values({ id: 'moderator-1', name: 'Moderator', email: 'moderator@example.com' });

	// Fully books ITEM_DOUBLE_BOOK_ID's only unit for 2026-03-01..2026-03-05,
	// so any order under test sharing that item/range comes back doubleBooked.
	const [competingOrder] = await db
		.insert(schema.orders)
		.values({ orderCode: 'COMPETE', checkoutToken: 'COMPETETK', userId: 'member-1', fromDate: '2026-03-01', toDate: '2026-03-05' })
		.returning();
	// itemId 4 = the "Double Book Item" inserted above (see the module-level
	// ITEM_DOUBLE_BOOK_ID comment) — hardcoded rather than referencing that
	// const directly: vi.mock's factory is hoisted above this file's own
	// top-level const declarations, so it can't see them at call time.
	await db.insert(schema.orderItems).values({ orderId: competingOrder.id, itemId: 4, requestedQuantity: 1 });

	return { db };
});

const CONTACT = { contactName: 'Test Member', contactEmail: 'member@example.com', contactMobile: null };

// Inserts a fresh order + single-line orderItems row for one test's own
// scenario, so mutating tests (accept/reject/confirm/return) never step on
// each other or on the shared fixtures above.
async function seedOrder(opts: {
	itemId: number;
	requestedQuantity?: number;
	fromDate?: string;
	toDate?: string;
	status?: 'requested' | 'active' | 'returned' | 'rejected';
	acceptedAt?: Date | null;
	rejectedAt?: Date | null;
}) {
	const { db } = await import('../../db/client');
	const schema = await import('../../db/schema');
	const orderCode = Math.random().toString(36).slice(2, 8).toUpperCase();
	const [order] = await db
		.insert(schema.orders)
		.values({
			orderCode,
			checkoutToken: `${orderCode}TK`,
			userId: 'member-1',
			fromDate: opts.fromDate ?? '2026-04-01',
			toDate: opts.toDate ?? '2026-04-05',
			status: opts.status ?? 'requested',
			acceptedAt: opts.acceptedAt ?? null,
			rejectedAt: opts.rejectedAt ?? null,
			...CONTACT,
		})
		.returning();
	const [orderItem] = await db
		.insert(schema.orderItems)
		.values({ orderId: order.id, itemId: opts.itemId, requestedQuantity: opts.requestedQuantity ?? 1 })
		.returning();
	return { orderId: order.id, orderItemId: orderItem.id, orderCode: order.orderCode };
}

describe('getOrderDetail — availability flags', () => {
	it('flags an archived item as archived', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_ARCHIVED_ID });
		const detail = await getOrderDetail(orderId);
		expect(detail?.items[0].archived).toBe(true);
		expect(detail?.items[0].doubleBooked).toBe(false);
	});

	it('flags an item whose assigned product is not published as archived', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_HIDDEN_PRODUCT_ID });
		const detail = await getOrderDetail(orderId);
		expect(detail?.items[0].archived).toBe(true);
	});

	it('flags an item fully booked by another order over the same range as doubleBooked', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_DOUBLE_BOOK_ID, fromDate: '2026-03-02', toDate: '2026-03-04' });
		const detail = await getOrderDetail(orderId);
		expect(detail?.items[0].doubleBooked).toBe(true);
		expect(detail?.items[0].archived).toBe(false);
	});

	it('flags neither for an available, published, non-competing item', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		const detail = await getOrderDetail(orderId);
		expect(detail?.items[0].archived).toBe(false);
		expect(detail?.items[0].doubleBooked).toBe(false);
	});
});

describe('getOrderIdByCode', () => {
	it('returns the order id for an existing code', async () => {
		const { orderId, orderCode } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		expect(await getOrderIdByCode(orderCode)).toBe(orderId);
	});

	it('returns null for a code that does not exist', async () => {
		expect(await getOrderIdByCode('NOSUCH')).toBeNull();
	});
});

describe('acceptOrder', () => {
	it('accepts a pending order, setting acceptedAt', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		const result = await acceptOrder(orderId);
		expect(result).toEqual({ ok: true });
		const detail = await getOrderDetail(orderId);
		expect(detail?.acceptedAt).toBeInstanceOf(Date);
	});

	it('fails with not_pending_review for an order that is already accepted', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, acceptedAt: new Date() });
		expect(await acceptOrder(orderId)).toEqual({ ok: false, error: 'not_pending_review' });
	});

	it('fails with not_pending_review for an order that is already rejected', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, status: 'rejected', rejectedAt: new Date() });
		expect(await acceptOrder(orderId)).toEqual({ ok: false, error: 'not_pending_review' });
	});
});

describe('rejectOrder', () => {
	it('fails with blank_reason for an empty reason', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		expect(await rejectOrder(orderId, '   ')).toEqual({ ok: false, error: 'blank_reason' });
	});

	it('rejects a pending order with a reason', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		expect(await rejectOrder(orderId, 'Out of season')).toEqual({ ok: true });
		const detail = await getOrderDetail(orderId);
		expect(detail?.status).toBe('rejected');
		expect(detail?.rejectedReason).toBe('Out of season');
	});

	it('fails with not_pending_review when already reviewed', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, acceptedAt: new Date() });
		expect(await rejectOrder(orderId, 'too late')).toEqual({ ok: false, error: 'not_pending_review' });
	});
});

describe('confirmRetrieval', () => {
	it('activates the order once every line matches its target', async () => {
		const { orderId, orderItemId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, requestedQuantity: 3, acceptedAt: new Date() });
		const result = await confirmRetrieval(orderId, 'moderator-1', [{ orderItemId, quantity: 3 }]);
		expect(result).toEqual({ ok: true });
		const detail = await getOrderDetail(orderId);
		expect(detail?.status).toBe('active');
		expect(detail?.items[0].retrievedQuantity).toBe(3);
	});

	it('supports a reduced quantity for a flagged/adjusted line (per-item hand-out)', async () => {
		const { orderId, orderItemId } = await seedOrder({ itemId: ITEM_ARCHIVED_ID, requestedQuantity: 2, acceptedAt: new Date() });
		const result = await confirmRetrieval(orderId, 'moderator-1', [{ orderItemId, quantity: 0 }]);
		expect(result).toEqual({ ok: true });
	});

	it('fails with not_acceptable when the order has not been accepted yet', async () => {
		const { orderId, orderItemId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		expect(await confirmRetrieval(orderId, 'moderator-1', [{ orderItemId, quantity: 1 }])).toEqual({ ok: false, error: 'not_acceptable' });
	});

	it('fails with quantity_exceeds_requested (defense-in-depth) when a submitted quantity exceeds requestedQuantity', async () => {
		const { orderId, orderItemId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, requestedQuantity: 1, acceptedAt: new Date() });
		expect(await confirmRetrieval(orderId, 'moderator-1', [{ orderItemId, quantity: 2 }])).toEqual({
			ok: false,
			error: 'quantity_exceeds_requested',
		});
	});

	it('fails with moderator_not_found (defense-in-depth) instead of throwing when moderatorUserId has no matching users row', async () => {
		const { orderId, orderItemId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, requestedQuantity: 1, acceptedAt: new Date() });
		expect(await confirmRetrieval(orderId, 'no-such-user', [{ orderItemId, quantity: 1 }])).toEqual({
			ok: false,
			error: 'moderator_not_found',
		});
	});
});

describe('markReturned', () => {
	it('marks an active order as returned', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, status: 'active', acceptedAt: new Date() });
		expect(await markReturned(orderId, 'moderator-1')).toEqual({ ok: true });
		const detail = await getOrderDetail(orderId);
		expect(detail?.status).toBe('returned');
		expect(detail?.returnedByUserId).toBe('moderator-1');
	});

	it('fails with not_active for a requested order', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID });
		expect(await markReturned(orderId, 'moderator-1')).toEqual({ ok: false, error: 'not_active' });
	});

	it('fails with moderator_not_found (defense-in-depth) instead of throwing when moderatorUserId has no matching users row', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, status: 'active', acceptedAt: new Date() });
		expect(await markReturned(orderId, 'no-such-user')).toEqual({ ok: false, error: 'moderator_not_found' });
	});
});

describe('getFollowingRentalWorries', () => {
	it('warns when a later order needs this order\'s item back on time', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_FOLLOWING_ID, fromDate: '2026-05-01', toDate: '2026-05-05' });

		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		const [followingOrder] = await db
			.insert(schema.orders)
			.values({ orderCode: 'FOLLOW1', checkoutToken: 'FOLLOW1TK', userId: 'member-1', fromDate: '2026-05-05', toDate: '2026-05-10' })
			.returning();
		await db.insert(schema.orderItems).values({ orderId: followingOrder.id, itemId: ITEM_FOLLOWING_ID, requestedQuantity: 1 });

		const warnings = await getFollowingRentalWorries(orderId);
		expect(warnings).toEqual([
			expect.objectContaining({ itemId: ITEM_FOLLOWING_ID, followingOrderCode: 'FOLLOW1', followingFromDate: '2026-05-05' }),
		]);
	});

	it('returns no warnings when no later order is affected', async () => {
		const { orderId } = await seedOrder({ itemId: ITEM_AVAILABLE_ID, fromDate: '2026-06-01', toDate: '2026-06-05' });
		expect(await getFollowingRentalWorries(orderId)).toEqual([]);
	});
});
