import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { createTestDb } from '../../db/testDb';

// Same fresh-in-memory-db-per-test setup as wizard.test.ts.
let testDb: BetterSQLite3Database<typeof schema>;

vi.mock('../../db/client', () => ({
	get db() {
		return testDb;
	},
}));

const { updateVariants } = await import('../wizardVariants');
const { variantRoute } = await import('../wizardRoutes');

function seedRows(database: BetterSQLite3Database<typeof schema>) {
	const item = database.insert(schema.items).values({ slug: 'item-1', name: 'Item 1' }).returning({ id: schema.items.id }).get();
	const set = database.insert(schema.sets).values({ slug: 'set-1', name: 'Set 1' }).returning({ id: schema.sets.id }).get();
	return { itemId: item.id, setId: set.id };
}

describe('wizardVariants', () => {
	beforeEach(() => {
		testDb = createTestDb();
	});

	describe('updateVariants', () => {
		it('archives only rows of the given kind', async () => {
			const { itemId, setId } = seedRows(testDb);

			await updateVariants('set', [setId], { archived: true });

			const [set] = testDb.select({ archived: schema.sets.archived }).from(schema.sets).where(inArray(schema.sets.id, [setId])).all();
			const [item] = testDb.select({ archived: schema.items.archived }).from(schema.items).where(inArray(schema.items.id, [itemId])).all();
			expect(set.archived).toBe(true);
			expect(item.archived).toBe(false);
		});

		it('sets the image only on rows of the given kind', async () => {
			const { itemId, setId } = seedRows(testDb);

			await updateVariants('item', [itemId], { imageUrl: '/img/a.jpg' });

			const [item] = testDb.select({ imageUrl: schema.items.imageUrl }).from(schema.items).where(inArray(schema.items.id, [itemId])).all();
			const [set] = testDb.select({ imageUrl: schema.sets.imageUrl }).from(schema.sets).where(inArray(schema.sets.id, [setId])).all();
			expect(item.imageUrl).toBe('/img/a.jpg');
			expect(set.imageUrl).toBeNull();
		});
	});

	describe('variantRoute', () => {
		it('maps the URL segment to its kind and rejects anything else', () => {
			expect(variantRoute('items')?.kind).toBe('item');
			expect(variantRoute('sets')?.kind).toBe('set');
			expect(variantRoute('constructor')).toBeNull();
			expect(variantRoute(undefined)).toBeNull();
		});
	});
});
