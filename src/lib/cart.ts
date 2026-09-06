import type { AstroCookies } from 'astro';
import { db } from '../db/client';
import { reservedQuantitiesByItem } from './stock';
import { sortAttributes } from './shop';

export type CartEntry = { itemId: number; quantity: number };

export interface CartItemAttribute {
	key: string;
	value: string;
}

// Display shape for a cart line item — the cookie only ever stores
// itemId/quantity (CartEntry); this joins that against items/products for
// whatever a UI needs to render a row (name, image, current stock).
export interface CartItem {
	itemId: number;
	productSlug: string | null;
	productTitle: string;
	imageUrl: string | null;
	quantity: number;
	stockCount: number;
	// stockCount minus what's currently tied up in other requested/active
	// orders — see src/lib/stock.ts. Lets the cart/UI flag a line item whose
	// quantity now exceeds what's actually available.
	inStock: number;
	attributes: CartItemAttribute[];
}

export function getCart(cookies: AstroCookies): CartEntry[] {
	try {
		return JSON.parse(cookies.get('cart')?.value ?? '[]');
	} catch {
		return [];
	}
}

export function setCart(cookies: AstroCookies, cart: CartEntry[]) {
	cookies.set('cart', JSON.stringify(cart), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7, // 1 week
	});
}

export function addToCart(cookies: AstroCookies, itemId: number, quantity = 1) {
	const cart = getCart(cookies);
	const existing = cart.find((e) => e.itemId === itemId);
	if (existing) {
		existing.quantity += quantity;
	} else {
		cart.push({ itemId, quantity });
	}
	setCart(cookies, cart);
}

// Sets a line item's quantity outright (unlike addToCart, which adds to
// whatever's already there) — used by the /cart review page's per-row
// quantity field. A quantity <= 0 removes the line entirely rather than
// storing a zero/negative entry.
export function updateCartQuantity(cookies: AstroCookies, itemId: number, quantity: number) {
	const cart = getCart(cookies);
	if (quantity <= 0) {
		setCart(
			cookies,
			cart.filter((e) => e.itemId !== itemId),
		);
		return;
	}

	const existing = cart.find((e) => e.itemId === itemId);
	if (existing) {
		existing.quantity = quantity;
	} else {
		cart.push({ itemId, quantity });
	}
	setCart(cookies, cart);
}

export function removeFromCart(cookies: AstroCookies, itemId: number) {
	const cart = getCart(cookies);
	setCart(
		cookies,
		cart.filter((e) => e.itemId !== itemId),
	);
}

// Joins the cookie cart against items/products for display (name, image,
// current stock) — used by the cart sidebar's GET /api/cart endpoint and the
// /cart review page. Entries pointing at an item that no longer exists, has
// since been archived, or whose product is no longer published are silently
// dropped. src/lib/orders.ts's createOrder does the same for nonexistent and
// archived entries, but — unlike here — deliberately does NOT re-check
// product status at checkout time; see the note on createOrder for why.
export async function getCartItems(cookies: AstroCookies): Promise<CartItem[]> {
	const cart = getCart(cookies);
	if (cart.length === 0) return [];

	const itemIds = cart.map((e) => e.itemId);
	const rows = await db.query.items.findMany({
		where: (t, { inArray }) => inArray(t.id, itemIds),
		with: {
			product: true,
			attributeValues: { with: { attribute: true } },
		},
	});

	const visibleRows = rows.filter((row) => !row.archived && row.product?.status === 'published');
	const rowsById = new Map(visibleRows.map((row) => [row.id, row]));
	const reserved = await reservedQuantitiesByItem(visibleRows.map((row) => row.id));

	return cart
		.map((entry): CartItem | null => {
			const row = rowsById.get(entry.itemId);
			if (!row) return null;
			return {
				itemId: row.id,
				productSlug: row.product?.slug ?? null,
				productTitle: row.product?.title ?? row.name,
				imageUrl: row.imageUrl ?? row.product?.thumbnailImageUrl ?? null,
				quantity: entry.quantity,
				stockCount: row.stockCount,
				inStock: row.stockCount - (reserved.get(row.id) ?? 0),
				attributes: sortAttributes(row.attributeValues),
			};
		})
		.filter((item): item is CartItem => item !== null);
}
