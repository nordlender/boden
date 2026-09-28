import { describe, it, expect, vi } from 'vitest';
import {
	computeSetAvailability,
	getSetChildren,
	getSetComponentDisplay,
	getSetComponentDisplayBulk,
	getValidSetIds,
	resolveEntriesToItemQuantities,
} from '../sets';

// getSetChildren/getValidSetIds/resolveEntriesToItemQuantities/
// getSetComponentDisplayBulk all join against the db (src/lib/sets.ts
// imports ../db/client) — swap it here for a seeded in-memory sqlite db,
// same pattern as cart.test.ts/orders.test.ts. Deterministic ids:
// item1..item7 (the only rows ever inserted into `items`), set1..set4
// (`sets`) — see the comments alongside each insert below.
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

	// "Widget" product: two items (4, 5) sharing an identical attribute-key
	// signature (Size, Color) — both leave Color blank, to also exercise the
	// all-blank-column trim.
	const [widget] = await db.insert(schema.products).values({ slug: 'widget', title: 'Widget', status: 'published' }).returning();
	const [sizeKey] = await db.insert(schema.productAttributeKeys).values({ productId: widget.id, name: 'Size', sortOrder: 0 }).returning();
	const [colorKey] = await db
		.insert(schema.productAttributeKeys)
		.values({ productId: widget.id, name: 'Color', sortOrder: 1 })
		.returning();
	await db.insert(schema.items).values({ productId: widget.id, slug: 'item-4', name: 'Item 4', stockCount: 5 }); // id === 4
	await db.insert(schema.items).values({ productId: widget.id, slug: 'item-5', name: 'Item 5', stockCount: 5 }); // id === 5
	await db.insert(schema.itemAttributeValues).values([
		{ itemId: 4, attributeId: sizeKey.id, value: 'S' },
		{ itemId: 4, attributeId: colorKey.id, value: '' },
		{ itemId: 5, attributeId: sizeKey.id, value: 'M' },
		{ itemId: 5, attributeId: colorKey.id, value: '' },
	]);

	// "Gadget" product: one item (6), no siblings sharing its signature.
	const [gadget] = await db.insert(schema.products).values({ slug: 'gadget', title: 'Gadget', status: 'published' }).returning();
	const [typeKey] = await db.insert(schema.productAttributeKeys).values({ productId: gadget.id, name: 'Type', sortOrder: 0 }).returning();
	await db.insert(schema.items).values({ productId: gadget.id, slug: 'item-6', name: 'Item 6', stockCount: 5 }); // id === 6
	await db.insert(schema.itemAttributeValues).values({ itemId: 6, attributeId: typeKey.id, value: 'Standard' });

	// Unassigned item (7) — no product, so no attribute keys/values at all.
	await db.insert(schema.items).values({ slug: 'item-7', name: 'Item 7 (internal)', stockCount: 5 }); // id === 7

	await db.insert(schema.sets).values({ slug: 'set-2', name: 'Set 2' }); // id === 3
	await db.insert(schema.setItems).values([
		{ setId: 3, itemId: 4, quantity: 1 },
		{ setId: 3, itemId: 5, quantity: 2 },
	]);
	await db.insert(schema.sets).values({ slug: 'set-3', name: 'Set 3' }); // id === 4
	await db.insert(schema.setItems).values({ setId: 4, itemId: 6, quantity: 1 });
	await db.insert(schema.sets).values({ slug: 'set-4', name: 'Set 4' }); // id === 5
	await db.insert(schema.setItems).values({ setId: 5, itemId: 7, quantity: 1 });

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

describe('getSetComponentDisplayBulk', () => {
	it('groups components sharing an identical attribute-key signature into one table, dropping all-blank columns', async () => {
		const result = await getSetComponentDisplayBulk([3]);
		expect(result.get(3)).toEqual([
			{
				kind: 'table',
				// Color dropped: both rows left it blank.
				keys: ['Size'],
				rows: [
					{ productTitle: 'Widget', quantity: 1, values: ['S'] },
					{ productTitle: 'Widget', quantity: 2, values: ['M'] },
				],
			},
		]);
	});

	it('renders a lone component (no signature siblings) as a plain line with its non-blank attributes', async () => {
		const result = await getSetComponentDisplayBulk([4]);
		expect(result.get(4)).toEqual([{ kind: 'line', productTitle: 'Gadget', quantity: 1, attributes: [{ key: 'Type', value: 'Standard' }] }]);
	});

	it('falls back to the item’s own internal name only for an unassigned component with no product', async () => {
		const result = await getSetComponentDisplayBulk([5]);
		expect(result.get(5)).toEqual([{ kind: 'line', productTitle: 'Item 7 (internal)', quantity: 1, attributes: [] }]);
	});

	it('returns [] for a set with no components', async () => {
		const result = await getSetComponentDisplayBulk([2]);
		expect(result.get(2)).toEqual([]);
	});

	it('returns an empty map for an empty input', async () => {
		expect(await getSetComponentDisplayBulk([])).toEqual(new Map());
	});
});

describe('getSetComponentDisplay', () => {
	it('is the singular convenience wrapper around the bulk version', async () => {
		expect(await getSetComponentDisplay(3)).toEqual([
			{
				kind: 'table',
				keys: ['Size'],
				rows: [
					{ productTitle: 'Widget', quantity: 1, values: ['S'] },
					{ productTitle: 'Widget', quantity: 2, values: ['M'] },
				],
			},
		]);
	});
});
