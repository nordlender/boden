import { describe, it, expect, vi } from 'vitest';
import { createOrder, createSplitOrders } from '../orders';
import type { CartEntry } from '../cart';

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
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.orderCode).toHaveLength(6);
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
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.orders).toHaveLength(1);
		expect(result.checkoutToken).toHaveLength(10);
	});
});
