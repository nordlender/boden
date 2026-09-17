import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getSetAvailability, resolveCartLines } from '../sets';

// isValidDateRange rejects a `from` before "today" — getSetAvailability
// doesn't call it directly, but the fixture's own reserved order below uses
// fixed 2026 dates, so pin the clock the same way reservation.test.ts does.
beforeAll(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2025-12-01T00:00:00Z'));
});
afterAll(() => {
	vi.useRealTimers();
});

// getSetAvailability/resolveCartLines join against the db (src/lib/sets.ts
// imports ../db/client) — swap it here for a seeded in-memory sqlite db,
// same pattern as reservation.test.ts/cart.test.ts/orders.test.ts.
//
// Deterministic ids: harness=1, rope=2, helmet=3, crampon=4 (the only rows
// ever inserted into `items`), kit=1 (the only row inserted into `sets`).
const HARNESS_ID = 1;
const ROPE_ID = 2;
const HELMET_ID = 3;
const CRAMPON_ID = 4;
const KIT_ID = 1;
const EMPTY_SET_ID = 2;

vi.mock('../../db/client', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('../../db/schema');

	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './src/db/migrations' });

	const [category] = await db.insert(schema.categories).values({ name: 'Climbing', slug: 'climbing' }).returning();
	const [product] = await db
		.insert(schema.products)
		.values({ slug: 'climbing-gear', title: 'Climbing Gear', categoryId: category.id, status: 'published' })
		.returning();

	// Harness: 2 in stock. Rope: 3 in stock. Helmet: 5 in stock, never
	// reserved. Crampon: 4 in stock but archived (for the
	// archived-constituent-item test).
	await db.insert(schema.items).values({ productId: product.id, slug: 'harness', name: 'Harness', stockCount: 2 });
	await db.insert(schema.items).values({ productId: product.id, slug: 'rope', name: 'Rope', stockCount: 3 });
	await db.insert(schema.items).values({ productId: product.id, slug: 'helmet', name: 'Helmet', stockCount: 5 });
	await db
		.insert(schema.items)
		.values({ productId: product.id, slug: 'crampon', name: 'Crampon', stockCount: 4, archived: true });

	const [user] = await db.insert(schema.users).values({ id: 'other-user', name: 'Other', email: 'other@example.com' }).returning();

	// An existing order holds 1x harness for 2026-01-05..2026-01-10 — leaves
	// 1 free unit of the harness's 2 in stock for that range.
	const [existingOrder] = await db
		.insert(schema.orders)
		.values({
			orderCode: 'AAAAAA',
			checkoutToken: 'TESTTOKEN1',
			userId: user.id,
			fromDate: '2026-01-05',
			toDate: '2026-01-10',
			contactName: 'Other',
			contactEmail: 'other@example.com',
		})
		.returning();
	// Raw ids used below rather than the HARNESS_ID/ROPE_ID/etc. constants
	// above: this factory is hoisted and runs before those const declarations
	// are initialized (vitest mock-factory hoisting — see
	// https://vitest.dev/api/vi.html#vi-mock). harness=1, rope=2, helmet=3.
	await db.insert(schema.orderItems).values({ orderId: existingOrder.id, itemId: 1, requestedQuantity: 1 });

	// Kit (set id 1): harness x1 + rope x1 + helmet x1.
	const [kit] = await db.insert(schema.sets).values({ slug: 'climbing-kit', title: 'Climbing Kit', status: 'published' }).returning();
	await db.insert(schema.setItems).values([
		{ setId: kit.id, itemId: 1, quantity: 1 },
		{ setId: kit.id, itemId: 2, quantity: 1 },
		{ setId: kit.id, itemId: 3, quantity: 1 },
	]);

	// An empty set (id 2, no membership rows) — for the "no members" edge case.
	await db.insert(schema.sets).values({ slug: 'empty-set', title: 'Empty Set', status: 'hidden' });

	return { db };
});

describe('getSetAvailability', () => {
	it('is available when every constituent item clears the requested quantity', async () => {
		// Harness has 1 free unit for this range (2 in stock, 1 booked
		// 01-05..01-10); rope/helmet are untouched. Requesting 1 kit needs 1 of
		// each, which all clear.
		const result = await getSetAvailability({ from: '2026-02-01', to: '2026-02-05' }, KIT_ID, 1);
		expect(result.available).toBe(true);
		expect(result.perItemAvailability).toHaveLength(3);
	});

	it('is unavailable when the binding constituent item cannot clear the requested quantity', async () => {
		// Same range as the harness's existing booking — only 1 of its 2 units
		// is free, so 2 kits (needing 2 harnesses) can't clear even though rope
		// and helmet have plenty of stock.
		const result = await getSetAvailability({ from: '2026-01-06', to: '2026-01-08' }, KIT_ID, 2);
		expect(result.available).toBe(false);
	});

	it('reports maxAvailableQuantity as the minimum across constituent items, independent of what was requested', async () => {
		// Range with no competing bookings at all: harness caps at 2 (its full
		// stock), rope at 3, helmet at 5 — the kit is capped by the harness.
		const result = await getSetAvailability({ from: '2026-03-01', to: '2026-03-05' }, KIT_ID, 1);
		expect(result.maxAvailableQuantity).toBe(2);
	});

	it('accounts for the harness booking when computing maxAvailableQuantity for an overlapping range', async () => {
		const result = await getSetAvailability({ from: '2026-01-06', to: '2026-01-08' }, KIT_ID, 1);
		// Harness: 2 stock - 1 booked = 1 free -> caps the kit at 1, even though
		// rope (3) and helmet (5) could support more.
		expect(result.maxAvailableQuantity).toBe(1);
	});

	it('reports a set with an archived constituent item as entirely unavailable (0 kits), not partially', async () => {
		const { db } = await import('../../db/client');
		const schema = await import('../../db/schema');
		const [archivedKit] = await db.insert(schema.sets).values({ slug: 'broken-kit', title: 'Broken Kit', status: 'published' }).returning();
		await db.insert(schema.setItems).values([
			{ setId: archivedKit.id, itemId: HELMET_ID, quantity: 1 },
			{ setId: archivedKit.id, itemId: CRAMPON_ID, quantity: 1 },
		]);

		const result = await getSetAvailability({ from: '2026-04-01', to: '2026-04-05' }, archivedKit.id, 1);
		expect(result.available).toBe(false);
		expect(result.maxAvailableQuantity).toBe(0);
	});

	it('reports a set with no membership rows as unavailable rather than throwing', async () => {
		const result = await getSetAvailability({ from: '2026-05-01', to: '2026-05-05' }, EMPTY_SET_ID, 1);
		expect(result).toEqual({ setId: EMPTY_SET_ID, requestedQuantity: 1, perItemAvailability: [], available: false, maxAvailableQuantity: 0 });
	});
});

describe('resolveCartLines', () => {
	it('passes standalone entries through untouched, tagged with setId: null', async () => {
		const result = await resolveCartLines([{ itemId: HELMET_ID, quantity: 2 }], []);
		expect(result).toEqual([{ itemId: HELMET_ID, quantity: 2, setId: null }]);
	});

	it('expands a set entry into its constituent items, tagged with the set id', async () => {
		const result = await resolveCartLines([], [{ setId: KIT_ID, quantity: 1 }]);
		expect(result).toEqual(
			expect.arrayContaining([
				{ itemId: HARNESS_ID, quantity: 1, setId: KIT_ID },
				{ itemId: ROPE_ID, quantity: 1, setId: KIT_ID },
				{ itemId: HELMET_ID, quantity: 1, setId: KIT_ID },
			]),
		);
		expect(result).toHaveLength(3);
	});

	it('multiplies each constituent item by both the kit quantity and its own per-kit quantity', async () => {
		const result = await resolveCartLines([], [{ setId: KIT_ID, quantity: 3 }]);
		const harnessLine = result.find((line) => line.itemId === HARNESS_ID);
		expect(harnessLine).toEqual({ itemId: HARNESS_ID, quantity: 3, setId: KIT_ID });
	});

	it('sums a standalone entry and a set entry that both include the same item, and leaves setId null (mixed provenance)', async () => {
		const result = await resolveCartLines([{ itemId: HARNESS_ID, quantity: 1 }], [{ setId: KIT_ID, quantity: 1 }]);
		const harnessLine = result.find((line) => line.itemId === HARNESS_ID);
		// 1 standalone + 1 from the kit = 2 total, but provenance is mixed so no
		// badge is shown for this row — see resolveCartLines's doc comment.
		expect(harnessLine).toEqual({ itemId: HARNESS_ID, quantity: 2, setId: null });
	});

	it('returns [] for an entirely empty cart', async () => {
		expect(await resolveCartLines([], [])).toEqual([]);
	});
});
