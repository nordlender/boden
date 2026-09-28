import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema';

// Same in-memory-db-via-mock pattern as wizard.test.ts — products.ts imports
// `db` from '../db/client', which unconditionally opens './data/rental.db'.
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

const { createProduct, updateProduct, getProductForEdit } = await import('../products');

describe('products', () => {
	beforeEach(() => {
		testDb = freshDb();
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
			expect(row?.published).toBe(false);
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
	});
});
