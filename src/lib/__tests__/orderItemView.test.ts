import { describe, expect, it } from 'vitest';
import { toOrderItemView } from '../orderItemView';

const product = { slug: 'edelrid-harness', title: 'Edelrid Harness', thumbnailImageUrl: '/product.jpg' };

describe('toOrderItemView', () => {
	it('shows the product title, sorted variant values, item image and quantity', () => {
		expect(
			toOrderItemView({
				requestedQuantity: 2,
				item: {
					name: 'Harness green M (admin label)',
					imageUrl: '/item.jpg',
					product,
					attributeValues: [
						{ value: 'M', attribute: { name: 'Size', sortOrder: 1 } },
						{ value: 'Green', attribute: { name: 'Color', sortOrder: 0 } },
					],
				},
			}),
		).toEqual({
			itemName: 'Edelrid Harness',
			requestedQuantity: 2,
			itemImageUrl: '/item.jpg',
			attributes: [
				{ key: 'Color', value: 'Green' },
				{ key: 'Size', value: 'M' },
			],
			href: '/products/edelrid-harness',
		});
	});

	it("falls back to the product's thumbnail, then no image", () => {
		const view = toOrderItemView({ requestedQuantity: 1, item: { name: 'x', imageUrl: null, product, attributeValues: [] } });
		expect(view.itemImageUrl).toBe('/product.jpg');
	});

	it('falls back to the item name and no link when the item has no product', () => {
		const view = toOrderItemView({ requestedQuantity: 1, item: { name: 'Loose item', imageUrl: null, product: null, attributeValues: [] } });
		expect(view).toMatchObject({ itemName: 'Loose item', itemImageUrl: null, href: null, attributes: [] });
	});
});
