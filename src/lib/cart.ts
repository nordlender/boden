import type { AstroCookies } from 'astro';
import { db } from '../db/client';
import { reservedQuantitiesByItem } from './stock';
import { sortAttributes } from './shop';
import { resolveCartLines } from './sets';

export type CartEntry = { itemId: number; quantity: number };

// One bundled set added to the cart, keyed by setId rather than expanded
// into its constituent items up front — the cookie stores "2x Climbing
// Kit", not 2x-multiplied rows for every item inside it. Expansion happens
// at read time (see resolveCartLines in src/lib/sets.ts), so the set's
// membership can change without leaving stale cart data. `quantity` here is
// "how many kits," not an item quantity.
export type CartSetEntry = { setId: number; quantity: number };

// The cart cookie's actual stored shape. Kept as one object (rather than
// two separate cookies) so a single read/write always sees both parts
// consistently.
export interface CartState {
	items: CartEntry[];
	sets: CartSetEntry[];
}

export interface CartItemAttribute {
	key: string;
	value: string;
}

// Display shape for a cart line item — this joins the resolved cart (see
// resolveCartLines) against items/products for whatever a UI needs to
// render a row (name, image, current stock).
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
	// Which set (if any) this row's *entire* quantity came from — null when
	// it's a standalone add, mixed with a standalone add, or split across
	// more than one set. See resolveCartLines's MergedCartLine.setId comment.
	setId: number | null;
}

// Parses the cart cookie into its full {items, sets} shape. Backward
// compatible with the pre-sets cookie format (a bare CartEntry[] array,
// from before this field existed) — treated as {items: <that array>, sets:
// []} rather than dropping the cart, so upgrading doesn't blow away
// whatever a returning visitor already had queued up.
export function getCartState(cookies: AstroCookies): CartState {
	try {
		const parsed = JSON.parse(cookies.get('cart')?.value ?? '{"items":[],"sets":[]}');
		if (Array.isArray(parsed)) {
			return { items: parsed, sets: [] };
		}
		return { items: parsed.items ?? [], sets: parsed.sets ?? [] };
	} catch {
		return { items: [], sets: [] };
	}
}

export function setCartState(cookies: AstroCookies, state: CartState) {
	cookies.set('cart', JSON.stringify(state), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7, // 1 week
	});
}

export function getCart(cookies: AstroCookies): CartEntry[] {
	return getCartState(cookies).items;
}

// Replaces the standalone-items half of the cart, preserving whatever sets
// (if any) are already queued up — same external signature as before this
// existed, so every existing caller (addToCart/updateCartQuantity/etc.
// below) needed no changes.
export function setCart(cookies: AstroCookies, cart: CartEntry[]) {
	setCartState(cookies, { ...getCartState(cookies), items: cart });
}

export function getCartSets(cookies: AstroCookies): CartSetEntry[] {
	return getCartState(cookies).sets;
}

// Replaces the sets half of the cart, preserving standalone items —
// mirrors setCart above.
export function setCartSets(cookies: AstroCookies, cartSets: CartSetEntry[]) {
	setCartState(cookies, { ...getCartState(cookies), sets: cartSets });
}

// Adds `quantity` more kits of `setId` — mirrors addToCart below, additive
// rather than an outright set. Not yet wired to any UI control (see GitHub
// issue #61's checkpoint plan); provided so the shop/cart UI phase has a
// ready-made primitive to call.
export function addSetToCart(cookies: AstroCookies, setId: number, quantity = 1) {
	const cartSets = getCartSets(cookies);
	const existing = cartSets.find((s) => s.setId === setId);
	if (existing) {
		existing.quantity += quantity;
	} else {
		cartSets.push({ setId, quantity });
	}
	setCartSets(cookies, cartSets);
}

// Sets a kit's quantity outright — mirrors updateCartQuantity below. A
// quantity <= 0 removes the set line entirely.
export function updateCartSetQuantity(cookies: AstroCookies, setId: number, quantity: number) {
	const cartSets = getCartSets(cookies);
	if (quantity <= 0) {
		setCartSets(
			cookies,
			cartSets.filter((s) => s.setId !== setId),
		);
		return;
	}

	const existing = cartSets.find((s) => s.setId === setId);
	if (existing) {
		existing.quantity = quantity;
	} else {
		cartSets.push({ setId, quantity });
	}
	setCartSets(cookies, cartSets);
}

export function removeSetFromCart(cookies: AstroCookies, setId: number) {
	const cartSets = getCartSets(cookies);
	setCartSets(
		cookies,
		cartSets.filter((s) => s.setId !== setId),
	);
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
//
// Any cart-level sets (see CartSetEntry) are expanded and merged with
// standalone entries by resolveCartLines before this ever sees them — a
// kit's constituent items are looked up/displayed exactly like any other
// cart line, just carrying a non-null `setId` when their whole quantity
// came from that one kit.
export async function getCartItems(cookies: AstroCookies): Promise<CartItem[]> {
	const { items: cartEntries, sets: cartSets } = getCartState(cookies);
	if (cartEntries.length === 0 && cartSets.length === 0) return [];

	const mergedLines = await resolveCartLines(cartEntries, cartSets);
	if (mergedLines.length === 0) return [];

	const itemIds = mergedLines.map((line) => line.itemId);
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

	return mergedLines
		.map((line): CartItem | null => {
			const row = rowsById.get(line.itemId);
			if (!row) return null;
			return {
				itemId: row.id,
				productSlug: row.product?.slug ?? null,
				productTitle: row.product?.title ?? row.name,
				imageUrl: row.imageUrl ?? row.product?.thumbnailImageUrl ?? null,
				quantity: line.quantity,
				stockCount: row.stockCount,
				inStock: row.stockCount - (reserved.get(row.id) ?? 0),
				attributes: sortAttributes(row.attributeValues),
				setId: line.setId,
			};
		})
		.filter((item): item is CartItem => item !== null);
}
