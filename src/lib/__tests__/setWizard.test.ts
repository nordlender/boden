import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema';

// Same in-memory-db-per-test approach as wizard.test.ts — see that file's
// comment for why.
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

const { setSetsProduct } = await import('../setWizard');

function seedProduct(database: BetterSQLite3Database<typeof schema>, slug: string) {
	const [product] = database.insert(schema.products).values({ slug, title: slug }).returning({ id: schema.products.id }).all();
	return product.id;
}

function seedSet(database: BetterSQLite3Database<typeof schema>, opts: { slug: string; productId?: number | null }) {
	const [set] = database
		.insert(schema.sets)
		.values({ slug: opts.slug, name: opts.slug, productId: opts.productId ?? null })
		.returning({ id: schema.sets.id })
		.all();
	return set.id;
}

describe('setWizard', () => {
	beforeEach(() => {
		testDb = freshDb();
	});

	describe('setSetsProduct', () => {
		it('assigns the set to the product when the product has no items', async () => {
			const productId = seedProduct(testDb, 'product-x');
			const setId = seedSet(testDb, { slug: 'set-1' });

			await setSetsProduct([setId], productId);

			const [row] = testDb.select({ productId: schema.sets.productId }).from(schema.sets).where(eq(schema.sets.id, setId)).all();
			expect(row.productId).toBe(productId);
		});

		it('rejects assigning a set to a product that already has a non-archived item', async () => {
			const productId = seedProduct(testDb, 'product-x');
			testDb.insert(schema.items).values({ slug: 'item-1', name: 'Item 1', productId }).run();
			const setId = seedSet(testDb, { slug: 'set-1' });

			await expect(setSetsProduct([setId], productId)).rejects.toThrow();

			const [row] = testDb.select({ productId: schema.sets.productId }).from(schema.sets).where(eq(schema.sets.id, setId)).all();
			expect(row.productId).toBeNull();
		});

		it('still allows assigning a set to a product whose only item is archived', async () => {
			const productId = seedProduct(testDb, 'product-x');
			testDb.insert(schema.items).values({ slug: 'item-1', name: 'Item 1', productId, archived: true }).run();
			const setId = seedSet(testDb, { slug: 'set-1' });

			await setSetsProduct([setId], productId);

			const [row] = testDb.select({ productId: schema.sets.productId }).from(schema.sets).where(eq(schema.sets.id, setId)).all();
			expect(row.productId).toBe(productId);
		});
	});
});
