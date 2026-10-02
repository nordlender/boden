import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { createTestDb } from '../../db/testDb';

// A fresh in-memory db per test (via createTestDb, same as wizard.test.ts)
// rather than one shared for the whole file — the mock below hands
// setWizard.ts whichever one the current test's beforeEach assigned.
let testDb: BetterSQLite3Database<typeof schema>;

vi.mock('../../db/client', () => ({
	get db() {
		return testDb;
	},
}));

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
		testDb = createTestDb();
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
