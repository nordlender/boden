import { describe, it, expect } from 'vitest';
import { groupShopItemsByProduct, type ShopItem } from '../shop';

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
