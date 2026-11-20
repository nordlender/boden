import { describe, it, expect } from 'vitest';
import { groupShopItemsByProduct, pickInitialVariant, type ShopItem, type ShopSet } from '../shop';

function makeItem(overrides: Partial<ShopItem>): ShopItem {
	return {
		id: 1,
		name: 'Item',
		imageUrl: null,
		inStock: 1,
		stockCount: 1,
		productId: 1,
		productSlug: 'product',
		productTitle: 'Product',
		categoryName: null,
		subcategoryName: null,
		attributes: [],
		...overrides,
	};
}

describe('groupShopItemsByProduct', () => {
	it('collapses multiple items of the same product into one row', () => {
		const items = [
			makeItem({ id: 1, productId: 10, productTitle: 'Dragon Cam' }),
			makeItem({ id: 2, productId: 10, productTitle: 'Dragon Cam' }),
			makeItem({ id: 3, productId: 10, productTitle: 'Dragon Cam' }),
		];

		const grouped = groupShopItemsByProduct(items);
		expect(grouped).toHaveLength(1);
		expect(grouped[0].productId).toBe(10);
	});

	it('preserves the order of first appearance across distinct products', () => {
		const items = [
			makeItem({ id: 1, productId: 20, productTitle: 'Rope' }),
			makeItem({ id: 2, productId: 10, productTitle: 'Cam' }),
			makeItem({ id: 3, productId: 20, productTitle: 'Rope' }),
		];

		const grouped = groupShopItemsByProduct(items);
		expect(grouped.map((g) => g.productId)).toEqual([20, 10]);
	});

	it('picks the first in-stock item as the representative', () => {
		const items = [
			makeItem({ id: 1, productId: 10, inStock: 0, imageUrl: 'out-of-stock.jpg' }),
			makeItem({ id: 2, productId: 10, inStock: 3, imageUrl: 'in-stock.jpg' }),
		];

		const grouped = groupShopItemsByProduct(items);
		expect(grouped[0].representativeItemId).toBe(2);
		expect(grouped[0].imageUrl).toBe('in-stock.jpg');
	});

	it('falls back to the first item when none are in stock', () => {
		const items = [
			makeItem({ id: 1, productId: 10, inStock: 0, imageUrl: 'first.jpg' }),
			makeItem({ id: 2, productId: 10, inStock: 0, imageUrl: 'second.jpg' }),
		];

		const grouped = groupShopItemsByProduct(items);
		expect(grouped[0].representativeItemId).toBe(1);
		expect(grouped[0].imageUrl).toBe('first.jpg');
	});

	it('sums inStock across every item in the group', () => {
		const items = [
			makeItem({ id: 1, productId: 10, inStock: 2 }),
			makeItem({ id: 2, productId: 10, inStock: 0 }),
			makeItem({ id: 3, productId: 10, inStock: 5 }),
		];

		const grouped = groupShopItemsByProduct(items);
		expect(grouped[0].inStock).toBe(7);
	});
});

describe('pickInitialVariant', () => {
	const makeSet = (id: number): ShopSet => ({ ...makeItem({ id }), label: null, componentDisplay: [] });
	const items = [makeItem({ id: 1 }), makeItem({ id: 2, imageUrl: '/two.jpg' })];
	const sets = [makeSet(7), makeSet(8)];
	const pick = (product: { items: ShopItem[]; sets: ShopSet[] }, query: string) =>
		pickInitialVariant(product, new URLSearchParams(query));

	it('defaults to the first item, else the first set, else null', () => {
		expect(pick({ items, sets: [] }, '')).toEqual({ kind: 'item', id: 1, imageUrl: null });
		expect(pick({ items: [], sets }, '')).toMatchObject({ kind: 'set', id: 7 });
		expect(pick({ items: [], sets: [] }, '?item=1')).toBeNull();
	});

	it('preselects a matching ?item= or ?set=', () => {
		expect(pick({ items, sets: [] }, '?item=2')).toEqual({ kind: 'item', id: 2, imageUrl: '/two.jpg' });
		expect(pick({ items: [], sets }, '?set=8')).toMatchObject({ kind: 'set', id: 8 });
	});

	it('falls back to the first variant for an unknown id or the other kind', () => {
		expect(pick({ items, sets: [] }, '?item=99')).toMatchObject({ kind: 'item', id: 1 });
		expect(pick({ items, sets: [] }, '?item=abc')).toMatchObject({ kind: 'item', id: 1 });
		expect(pick({ items, sets }, '?set=8')).toMatchObject({ kind: 'item', id: 1 });
		expect(pick({ items: [], sets }, '?item=8')).toMatchObject({ kind: 'set', id: 7 });
	});
});
