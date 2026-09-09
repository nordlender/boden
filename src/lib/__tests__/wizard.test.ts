import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { eq, inArray } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema';

// wizard.ts imports `db` from '../db/client', which unconditionally opens
// './data/rental.db'. For tests we swap in a fresh in-memory sqlite database
// (schema applied via the real migrations, same as production) so each test
// runs against real drizzle/better-sqlite3 behavior without touching disk.
let testDb: BetterSQLite3Database<typeof schema>;

vi.mock('../../db/client', () => ({
	get db() {
		return testDb;
	},
}));

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

function freshDb(): BetterSQLite3Database<typeof schema> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const database = drizzle(sqlite, { schema });
	migrate(database, { migrationsFolder });
	return database;
}

// Import after the mock is set up so wizard.ts's `import { db }` resolves to
// the mocked module.
const { setItemsProduct, setBulkAttributeValues } = await import('../wizard');

function seedProduct(database: BetterSQLite3Database<typeof schema>, opts: { slug: string; title: string; keys?: string[] }) {
	const [product] = database
		.insert(schema.products)
		.values({ slug: opts.slug, title: opts.title })
		.returning({ id: schema.products.id })
		.all();
	const keyIds: number[] = [];
	for (const name of opts.keys ?? []) {
		const [key] = database
			.insert(schema.productAttributeKeys)
			.values({ productId: product.id, name })
			.returning({ id: schema.productAttributeKeys.id })
			.all();
		keyIds.push(key.id);
	}
	return { id: product.id, keyIds };
}

function seedItem(database: BetterSQLite3Database<typeof schema>, opts: { slug: string; name: string; productId?: number | null }) {
	const [item] = database
		.insert(schema.items)
		.values({ slug: opts.slug, name: opts.name, productId: opts.productId ?? null })
		.returning({ id: schema.items.id })
		.all();
	return item.id;
}

function attributeValues(database: BetterSQLite3Database<typeof schema>, itemId: number) {
	return database
		.select({ name: schema.productAttributeKeys.name, value: schema.itemAttributeValues.value })
		.from(schema.itemAttributeValues)
		.innerJoin(schema.productAttributeKeys, eq(schema.productAttributeKeys.id, schema.itemAttributeValues.attributeId))
		.where(eq(schema.itemAttributeValues.itemId, itemId))
		.all();
}

describe('wizard', () => {
	beforeEach(() => {
		testDb = freshDb();
	});

	describe('setItemsProduct', () => {
		it('does NOT wipe an item\'s attribute values when re-assigned to its current product', async () => {
			const productX = seedProduct(testDb, { slug: 'product-x', title: 'Product X', keys: ['Weight', 'Length'] });
			const itemId = seedItem(testDb, { slug: 'item-1', name: 'Item 1', productId: productX.id });
			// seed didn't actually create the item_attribute_values rows (that's
			// wizard.ts's job normally) — insert them directly to simulate an item
			// that already has real, entered values for product X's template.
			for (const keyId of productX.keyIds) {
				testDb
					.insert(schema.itemAttributeValues)
					.values({ itemId, attributeId: keyId, value: `entered-${keyId}` })
					.onConflictDoUpdate({
						target: [schema.itemAttributeValues.itemId, schema.itemAttributeValues.attributeId],
						set: { value: `entered-${keyId}` },
					})
					.run();
			}

			const before = attributeValues(testDb, itemId).sort((a, b) => a.name.localeCompare(b.name));
			expect(before).toHaveLength(2);
			expect(before.every((v) => v.value.startsWith('entered-'))).toBe(true);

			await setItemsProduct([itemId], productX.id);

			const after = attributeValues(testDb, itemId).sort((a, b) => a.name.localeCompare(b.name));
			expect(after).toEqual(before);

			const [row] = testDb.select({ productId: schema.items.productId }).from(schema.items).where(eq(schema.items.id, itemId)).all();
			expect(row.productId).toBe(productX.id);
		});

		it('wipes and re-blanks attribute values when reassigning from product X to product Y', async () => {
			const productX = seedProduct(testDb, { slug: 'product-x', title: 'Product X', keys: ['Weight'] });
			const productY = seedProduct(testDb, { slug: 'product-y', title: 'Product Y', keys: ['Color', 'Size'] });
			const itemId = seedItem(testDb, { slug: 'item-1', name: 'Item 1', productId: productX.id });
			for (const keyId of productX.keyIds) {
				testDb.insert(schema.itemAttributeValues).values({ itemId, attributeId: keyId, value: 'old-weight' }).run();
			}

			await setItemsProduct([itemId], productY.id);

			const [row] = testDb.select({ productId: schema.items.productId }).from(schema.items).where(eq(schema.items.id, itemId)).all();
			expect(row.productId).toBe(productY.id);

			const values = attributeValues(testDb, itemId).sort((a, b) => a.name.localeCompare(b.name));
			expect(values).toEqual([
				{ name: 'Color', value: '' },
				{ name: 'Size', value: '' },
			]);
		});

		it('in one call mixing an already-on-target item with a reassigning item, only wipes the reassigning one', async () => {
			const productX = seedProduct(testDb, { slug: 'product-x', title: 'Product X', keys: ['Weight'] });
			const productY = seedProduct(testDb, { slug: 'product-y', title: 'Product Y', keys: ['Color'] });
			// `staying` is already on productY (the target of this call); `moving`
			// is on productX and is actually being reassigned to productY.
			const staying = seedItem(testDb, { slug: 'staying', name: 'Staying', productId: productY.id });
			const moving = seedItem(testDb, { slug: 'moving', name: 'Moving', productId: productX.id });
			for (const keyId of productY.keyIds) {
				testDb.insert(schema.itemAttributeValues).values({ itemId: staying, attributeId: keyId, value: 'kept' }).run();
			}
			for (const keyId of productX.keyIds) {
				testDb.insert(schema.itemAttributeValues).values({ itemId: moving, attributeId: keyId, value: 'old-weight' }).run();
			}

			await setItemsProduct([staying, moving], productY.id);

			const stayingValues = attributeValues(testDb, staying);
			expect(stayingValues).toEqual([{ name: 'Color', value: 'kept' }]);

			const movingValues = attributeValues(testDb, moving);
			expect(movingValues).toEqual([{ name: 'Color', value: '' }]);

			const rows = testDb
				.select({ id: schema.items.id, productId: schema.items.productId })
				.from(schema.items)
				.where(inArray(schema.items.id, [staying, moving]))
				.all();
			expect(rows.every((r) => r.productId === productY.id)).toBe(true);
		});
	});

	describe('setBulkAttributeValues', () => {
		it('applies every key/value pair to every selected item (batched insert produces correct final values)', async () => {
			const product = seedProduct(testDb, { slug: 'product-a', title: 'Product A', keys: ['Weight'] });
			const item1 = seedItem(testDb, { slug: 'item-1', name: 'Item 1', productId: product.id });
			const item2 = seedItem(testDb, { slug: 'item-2', name: 'Item 2', productId: product.id });
			const item3 = seedItem(testDb, { slug: 'item-3', name: 'Item 3', productId: product.id });

			const result = await setBulkAttributeValues([item1, item2, item3], [
				{ key: 'Weight', value: '250g' },
				{ key: 'Color', value: 'Red' },
			]);

			expect(result).toEqual({ ok: true });

			for (const itemId of [item1, item2, item3]) {
				const values = attributeValues(testDb, itemId).sort((a, b) => a.name.localeCompare(b.name));
				expect(values).toEqual([
					{ name: 'Color', value: 'Red' },
					{ name: 'Weight', value: '250g' },
				]);
			}

			// Applying again with a different value should update in place
			// (onConflictDoUpdate), not duplicate rows.
			await setBulkAttributeValues([item1], [{ key: 'Weight', value: '300g' }]);
			const item1Values = attributeValues(testDb, item1).sort((a, b) => a.name.localeCompare(b.name));
			expect(item1Values).toEqual([
				{ name: 'Color', value: 'Red' },
				{ name: 'Weight', value: '300g' },
			]);
		});

		it('returns no_shared_product when items span more than one product', async () => {
			const productX = seedProduct(testDb, { slug: 'product-x', title: 'Product X' });
			const productY = seedProduct(testDb, { slug: 'product-y', title: 'Product Y' });
			const item1 = seedItem(testDb, { slug: 'item-1', name: 'Item 1', productId: productX.id });
			const item2 = seedItem(testDb, { slug: 'item-2', name: 'Item 2', productId: productY.id });

			const result = await setBulkAttributeValues([item1, item2], [{ key: 'Weight', value: '1kg' }]);
			expect(result).toEqual({ ok: false, error: 'no_shared_product' });
		});
	});
});
