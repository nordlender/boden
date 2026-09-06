import { describe, it, expect, vi } from 'vitest';
import { isValidDateRange, hasMixedAvailability, getReservationAvailability } from '../reservation';

// getReservationAvailability joins against the db (src/lib/reservation.ts
// imports ../db/client) — swap it here for a seeded in-memory sqlite db, same
// pattern as src/lib/__tests__/cart.test.ts. Deterministic ids: itemA=1,
// itemB=2 (the only two rows ever inserted into `items` here, and sqlite
// autoincrement counters start at 1 per table per in-memory db instance).
const ITEM_A_ID = 1;
const ITEM_B_ID = 2;

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
	const [user] = await db.insert(schema.users).values({ id: 'other-user', name: 'Other', email: 'other@example.com' }).returning();

	// An existing order holds 1x item A for 2026-01-05..2026-01-10.
	const [existingOrder] = await db
		.insert(schema.orders)
		.values({ orderCode: 'AAAAAA', userId: user.id, fromDate: '2026-01-05', toDate: '2026-01-10' })
		.returning();
	await db.insert(schema.orderItems).values({ orderId: existingOrder.id, itemId: 1, requestedQuantity: 1 });

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
		const [availability] = await getReservationAvailability({ from: '2026-01-06', to: '2026-01-08' }, [
			{ itemId: ITEM_A_ID, quantity: 2 },
		]);
		expect(availability.available).toBe(false);
		expect(availability.peakReserved).toBe(1);
	});

	it('reports available for the same item/range at a lower requested quantity', async () => {
		const [availability] = await getReservationAvailability({ from: '2026-01-06', to: '2026-01-08' }, [
			{ itemId: ITEM_A_ID, quantity: 1 },
		]);
		expect(availability.available).toBe(true);
	});

	it('reports available when the requested range does not overlap the existing reservation', async () => {
		const [availability] = await getReservationAvailability({ from: '2026-02-01', to: '2026-02-05' }, [
			{ itemId: ITEM_A_ID, quantity: 2 },
		]);
		expect(availability.available).toBe(true);
		expect(availability.peakReserved).toBe(0);
	});

	it('is unaffected by another item entirely', async () => {
		const [availability] = await getReservationAvailability({ from: '2026-01-06', to: '2026-01-08' }, [
			{ itemId: ITEM_B_ID, quantity: 5 },
		]);
		expect(availability.available).toBe(true);
		expect(availability.peakReserved).toBe(0);
	});
});
