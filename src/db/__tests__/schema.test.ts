import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../testDb';
import { products } from '../schema';

describe('products.updatedAt', () => {
	it('is refreshed by Drizzle on update', () => {
		const db = createTestDb();
		const stale = new Date('2020-01-01T00:00:00Z');
		db.insert(products).values({ slug: 'rope', title: 'Rope', createdAt: stale, updatedAt: stale }).run();

		db.update(products).set({ title: 'Dynamic rope' }).where(eq(products.slug, 'rope')).run();

		const row = db.select().from(products).where(eq(products.slug, 'rope')).get()!;
		expect(row.updatedAt.getTime()).toBeGreaterThan(stale.getTime());
		expect(row.createdAt.getTime()).toBe(stale.getTime());
	});
});
