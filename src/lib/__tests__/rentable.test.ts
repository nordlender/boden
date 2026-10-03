import { describe, it, expect, vi } from 'vitest';
import { isRentable, findRentableItems } from '../rentable';

// Ids by insertion order: 1 live under published product, 2 archived,
// 3 under hidden product, 4 unassigned (no product), 5 live under published.
vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	const schema = await import('../../db/schema');
	const db = createTestDb();

	const [published] = await db.insert(schema.products).values({ slug: 'pub', title: 'Pub', status: 'published' }).returning();
	const [hidden] = await db.insert(schema.products).values({ slug: 'hid', title: 'Hid', status: 'hidden' }).returning();
	await db.insert(schema.items).values({ productId: published.id, slug: 'i1', name: 'I1' });
	await db.insert(schema.items).values({ productId: published.id, slug: 'i2', name: 'I2', archived: true });
	await db.insert(schema.items).values({ productId: hidden.id, slug: 'i3', name: 'I3' });
	await db.insert(schema.items).values({ productId: null, slug: 'i4', name: 'I4' });
	await db.insert(schema.items).values({ productId: published.id, slug: 'i5', name: 'I5' });
	return { db };
});

describe('isRentable', () => {
	it('is true for a live item under a published product', () => {
		expect(isRentable({ archived: false, product: { status: 'published' } })).toBe(true);
	});

	it('is false for archived items, hidden products, unassigned items and missing items', () => {
		expect(isRentable({ archived: true, product: { status: 'published' } })).toBe(false);
		expect(isRentable({ archived: false, product: { status: 'hidden' } })).toBe(false);
		expect(isRentable({ archived: false, product: null })).toBe(false);
		expect(isRentable(null)).toBe(false);
		expect(isRentable(undefined)).toBe(false);
	});
});

describe('findRentableItems', () => {
	it('returns only rentable items, with their product', async () => {
		const found = await findRentableItems([1, 2, 3, 4, 5, 999]);
		expect(found.map((i) => i.id).sort()).toEqual([1, 5]);
		expect(found[0].product?.status).toBe('published');
	});

	it('returns an empty list for no ids', async () => {
		expect(await findRentableItems([])).toEqual([]);
	});
});
