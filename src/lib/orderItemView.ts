// Member-facing view of one order line: the product's title (an item's own
// `name` is an admin-only label, see src/db/schema.ts), the item's variant
// attribute values, its image and the requested quantity. Same image and
// title fallbacks as the cart (src/lib/cart.ts's buildItemLines).
import type { Attribute } from './attributes';
import { sortAttributes } from './shop';

export interface OrderItemViewSource {
	requestedQuantity: number;
	item: {
		name: string;
		imageUrl: string | null;
		product: { slug: string; title: string; thumbnailImageUrl: string | null } | null;
		attributeValues: { value: string; attribute: { name: string; sortOrder: number } }[];
	};
}

export interface OrderItemView {
	itemName: string;
	requestedQuantity: number;
	itemImageUrl: string | null;
	attributes: Attribute[];
	href: string | null;
}

export function toOrderItemView({ requestedQuantity, item }: OrderItemViewSource): OrderItemView {
	return {
		itemName: item.product?.title ?? item.name,
		requestedQuantity,
		itemImageUrl: item.imageUrl ?? item.product?.thumbnailImageUrl ?? null,
		attributes: sortAttributes(item.attributeValues),
		href: item.product ? `/products/${item.product.slug}` : null,
	};
}
