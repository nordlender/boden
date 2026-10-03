import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { createTestDb } from '../../db/testDb';

// products.ts imports `db` from '../db/client', which unconditionally opens
// './data/rental.db'; swap in a fresh in-memory db per test (see createTestDb).
let testDb: BetterSQLite3Database<typeof schema>;

vi.mock('../../db/client', () => ({
	get db() {
		return testDb;
	},
}));

const { createProduct, updateProduct, getProductForEdit, ProductInputError } = await import('../products');

describe('products', () => {
	beforeEach(() => {
		testDb = createTestDb();
	});

	describe('createProduct', () => {
		it('creates the product with a slug derived from the title', async () => {
			const id = await createProduct({
				title: 'Edelrid Harness',
				links: [],
				attributeKeys: [],
			});

			const row = testDb.select().from(schema.products).where(eq(schema.products.id, id)).get();
			expect(row?.slug).toBe('edelrid-harness');
			expect(row?.status).toBe('hidden');
		});

		it('dedupes a title collision by appending a numeric suffix', async () => {
			await createProduct({ title: 'Edelrid Harness', links: [], attributeKeys: [] });
			const secondId = await createProduct({ title: 'Edelrid Harness', links: [], attributeKeys: [] });

			const row = testDb.select().from(schema.products).where(eq(schema.products.id, secondId)).get();
			expect(row?.slug).toBe('edelrid-harness-2');
		});

		it('creates product links and a deduped attribute-key template', async () => {
			const id = await createProduct({
				title: 'Rain Jacket',
				links: [{ label: 'Manual', url: 'https://example.com/manual' }],
				attributeKeys: ['Size', 'Color', 'Size'],
			});

			const product = await getProductForEdit(id);
			expect(product?.links).toEqual([{ id: expect.any(Number), label: 'Manual', url: 'https://example.com/manual' }]);
			expect(product?.attributeKeys.map((k) => k.name)).toEqual(['Size', 'Color']);
		});
	});

	describe('updateProduct', () => {
		it('replaces links and only adds attribute keys that are new', async () => {
			const id = await createProduct({
				title: 'Climbing Rope',
				links: [{ label: 'Old link', url: 'https://old.example.com' }],
				attributeKeys: ['Diameter'],
			});

			await updateProduct(id, {
				title: 'Climbing Rope',
				links: [{ label: 'New link', url: 'https://new.example.com' }],
				attributeKeys: ['Diameter', 'Length'],
			});

			const product = await getProductForEdit(id);
			expect(product?.links).toEqual([{ id: expect.any(Number), label: 'New link', url: 'https://new.example.com' }]);
			expect(product?.attributeKeys.map((k) => k.name)).toEqual(['Diameter', 'Length']);
		});

		it('fans a blank value out to existing items when a new attribute key is added', async () => {
			const id = await createProduct({ title: 'Harness', links: [], attributeKeys: ['Size'] });
			const [item] = testDb.insert(schema.items).values({ slug: 'harness-m', name: 'Harness M', productId: id }).returning({ id: schema.items.id }).all();

			await updateProduct(id, { title: 'Harness', links: [], attributeKeys: ['Size', 'Color'] });

			const values = testDb
				.select({ name: schema.productAttributeKeys.name, value: schema.itemAttributeValues.value })
				.from(schema.itemAttributeValues)
				.innerJoin(schema.productAttributeKeys, eq(schema.productAttributeKeys.id, schema.itemAttributeValues.attributeId))
				.where(eq(schema.itemAttributeValues.itemId, item.id))
				.all();

			expect(values).toEqual([{ name: 'Color', value: '' }]);
		});

		it('gives keys added on edit distinct sortOrders after the existing ones', async () => {
			const id = await createProduct({ title: 'Harness', links: [], attributeKeys: ['Size', 'Color'] });

			await updateProduct(id, { title: 'Harness', links: [], attributeKeys: ['Size', 'Color', 'Weight', 'Length'] });

			const keys = testDb
				.select({ name: schema.productAttributeKeys.name, sortOrder: schema.productAttributeKeys.sortOrder })
				.from(schema.productAttributeKeys)
				.where(eq(schema.productAttributeKeys.productId, id))
				.orderBy(schema.productAttributeKeys.sortOrder)
				.all();
			expect(keys).toEqual([
				{ name: 'Size', sortOrder: 0 },
				{ name: 'Color', sortOrder: 1 },
				{ name: 'Weight', sortOrder: 2 },
				{ name: 'Length', sortOrder: 3 },
			]);
		});
	});

	describe('classification validation', () => {
		function seedCategories() {
			const [protection] = testDb.insert(schema.categories).values({ name: 'Protection', slug: 'protection' }).returning({ id: schema.categories.id }).all();
			const [apparel] = testDb.insert(schema.categories).values({ name: 'Apparel', slug: 'apparel' }).returning({ id: schema.categories.id }).all();
			const [cams] = testDb
				.insert(schema.subcategories)
				.values({ categoryId: protection.id, name: 'Cams', slug: 'cams' })
				.returning({ id: schema.subcategories.id })
				.all();
			return { protection: protection.id, apparel: apparel.id, cams: cams.id };
		}

		it('rejects an unknown category', async () => {
			await expect(createProduct({ title: 'X', categoryId: 999, links: [], attributeKeys: [] })).rejects.toBeInstanceOf(ProductInputError);
		});

		it('rejects a subcategory from a different category, on create and update', async () => {
			const ids = seedCategories();
			const mismatched = { title: 'X', categoryId: ids.apparel, subcategoryId: ids.cams, links: [], attributeKeys: [] };

			await expect(createProduct(mismatched)).rejects.toBeInstanceOf(ProductInputError);

			const id = await createProduct({ title: 'X', categoryId: ids.protection, subcategoryId: ids.cams, links: [], attributeKeys: [] });
			await expect(updateProduct(id, mismatched)).rejects.toBeInstanceOf(ProductInputError);
		});

		it('rejects a subcategory with no category', async () => {
			const ids = seedCategories();
			await expect(createProduct({ title: 'X', subcategoryId: ids.cams, links: [], attributeKeys: [] })).rejects.toBeInstanceOf(ProductInputError);
		});
	});
});
