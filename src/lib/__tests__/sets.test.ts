import { describe, it, expect, vi } from 'vitest';
import { computeSetAvailability, getSetChildren, getValidSetIds, resolveEntriesToItemQuantities } from '../sets';

// getSetChildren/getValidSetIds/resolveEntriesToItemQuantities join against
// the db (src/lib/sets.ts imports ../db/client) — swap it here for a seeded
// in-memory sqlite db, same pattern as cart.test.ts/orders.test.ts.
// Deterministic ids: item1/item2/item3 (the only rows ever inserted into
// `items`), set1 (only row ever inserted into `sets`, archived-set2).
vi.mock('../../db/client', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('../../db/schema');

	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './src/db/migrations' });

	await db.insert(schema.items).values({ slug: 'item-1', name: 'Item 1', stockCount: 5 });
	await db.insert(schema.items).values({ slug: 'item-2', name: 'Item 2', stockCount: 2 });
	await db.insert(schema.items).values({ slug: 'item-3', name: 'Item 3', stockCount: 5 });

	await db.insert(schema.sets).values({ slug: 'set-1', name: 'Set 1' }); // id === 1
	await db.insert(schema.setItems).values([
		{ setId: 1, itemId: 1, quantity: 1 },
		{ setId: 1, itemId: 2, quantity: 2 },
	]);
	await db.insert(schema.sets).values({ slug: 'archived-set', name: 'Archived Set', archived: true }); // id === 2

	return { db };
});

describe('computeSetAvailability', () => {
	it('returns 0/0 for a set with no children', () => {
		expect(computeSetAvailability([], new Map())).toEqual({ stockCount: 0, inStock: 0 });
	});

	it('caps stockCount/inStock by whichever component has the least room', () => {
		const children = [
			{ itemId: 1, quantity: 1, stockCount: 5 }, // floor(5/1) = 5
			{ itemId: 2, quantity: 2, stockCount: 2 }, // floor(2/2) = 1, the binding constraint
		];
		expect(computeSetAvailability(children, new Map())).toEqual({ stockCount: 1, inStock: 1 });
	});

	it('subtracts reservations per component before taking the minimum', () => {
		const children = [
			{ itemId: 1, quantity: 1, stockCount: 5 },
			{ itemId: 2, quantity: 1, stockCount: 5 },
		];
		const reserved = new Map([[1, 3]]); // item 1 has only 2 free, item 2 has 5 free
		expect(computeSetAvailability(children, reserved)).toEqual({ stockCount: 5, inStock: 2 });
	});

	it('never returns a negative inStock when reservations exceed stock', () => {
		const children = [{ itemId: 1, quantity: 1, stockCount: 5 }];
		const reserved = new Map([[1, 9]]);
		expect(computeSetAvailability(children, reserved)).toEqual({ stockCount: 5, inStock: 0 });
	});
});

describe('getSetChildren', () => {
	it('returns a set’s components with their per-set quantities', async () => {
		expect(await getSetChildren(1)).toEqual([
			{ itemId: 1, quantity: 1 },
			{ itemId: 2, quantity: 2 },
		]);
	});

	it('returns [] for a set with no components', async () => {
		expect(await getSetChildren(2)).toEqual([]);
	});

	it('returns [] for a set id that does not exist', async () => {
		expect(await getSetChildren(999)).toEqual([]);
	});
});

describe('getValidSetIds', () => {
	it('returns [] for an empty input', async () => {
		expect(await getValidSetIds([])).toEqual(new Set());
	});

	it('includes a non-archived set and excludes an archived one', async () => {
		expect(await getValidSetIds([1, 2, 999])).toEqual(new Set([1]));
	});
});

describe('resolveEntriesToItemQuantities', () => {
	it('passes plain item entries through unchanged', async () => {
		const result = await resolveEntriesToItemQuantities([{ itemId: 3, quantity: 4 }]);
		expect(result).toEqual([{ itemId: 3, quantity: 4 }]);
	});

	it('expands a set entry into its components, multiplying by the set quantity', async () => {
		const result = await resolveEntriesToItemQuantities([{ setId: 1, quantity: 3 }]);
		expect(result.sort((a, b) => a.itemId - b.itemId)).toEqual([
			{ itemId: 1, quantity: 3 }, // 1 per set × 3 sets
			{ itemId: 2, quantity: 6 }, // 2 per set × 3 sets
		]);
	});

	it('merges a direct item entry with the same item pulled in via a set into one summed quantity', async () => {
		const result = await resolveEntriesToItemQuantities([
			{ itemId: 1, quantity: 5 },
			{ setId: 1, quantity: 2 }, // also resolves to 2× item 1
		]);
		const item1 = result.find((r) => r.itemId === 1);
		expect(item1?.quantity).toBe(7);
	});

	it('returns [] for an empty input', async () => {
		expect(await resolveEntriesToItemQuantities([])).toEqual([]);
	});

	it('contributes nothing for a set that no longer has any components', async () => {
		const result = await resolveEntriesToItemQuantities([{ setId: 2, quantity: 5 }]);
		expect(result).toEqual([]);
	});
});
