import type { AstroCookies } from 'astro';
import { db } from '../db/client';
import { reservedQuantitiesByItem } from './stock';
import { sortAttributes } from './shop';
import { computeSetAvailability, getSetChildrenDetailedBulk } from './sets';

// A cart line either points at one item or at one set — see docs/schema.md
// (or src/db/schema.ts's `sets` comment) for why a set is a second, bundled
// alternative to an item rather than a variant of it. Both shapes stay flat
// (no `type` discriminant) so plain `{ itemId, quantity }` cookies written
// before sets existed keep parsing the same way — see entryKey() below for
// how the two are told apart.
export type CartEntry = { itemId: number; quantity: number } | { setId: number; quantity: number };

// What addToCart/updateCartQuantity/removeFromCart key a cart line by —
// CartEntry minus `quantity`, so callers that already have an entry can pass
// it directly (structural typing: a CartEntry satisfies this too).
type EntryRef = { itemId: number } | { setId: number };

export function entryKey(ref: EntryRef): string {
	return 'itemId' in ref ? `item:${ref.itemId}` : `set:${ref.setId}`;
}

export interface CartItemAttribute {
	key: string;
	value: string;
}

// Display shape for a cart line pointing at a plain item — the cookie only
// ever stores itemId/quantity (CartEntry); this joins that against
// items/products for whatever a UI needs to render a row (name, image,
// current stock).
export interface CartItemLine {
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

// One component of a set line, shown as an indented, smaller row under it —
// never independently addable/removable, just a read-only breakdown of what
// the set resolves into.
export interface CartSetChild {
	itemId: number;
	name: string;
	quantityPerSet: number;
}

// Display shape for a cart line pointing at a set. stockCount/inStock are
// the most sets orderable right now, capped by whichever component has the
// least room (see src/lib/sets.ts's computeSetAvailability) — a set has no
// stock of its own.
export interface CartSetLine {
	setId: number;
	productSlug: string | null;
	productTitle: string;
	imageUrl: string | null;
	quantity: number;
	stockCount: number;
	inStock: number;
	attributes: CartItemAttribute[];
	children: CartSetChild[];
}

export type CartLine = CartItemLine | CartSetLine;

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

export function addToCart(cookies: AstroCookies, entry: CartEntry) {
	const cart = getCart(cookies);
	const key = entryKey(entry);
	const existing = cart.find((e) => entryKey(e) === key);
	if (existing) {
		existing.quantity += entry.quantity;
	} else {
		cart.push(entry);
	}
	setCart(cookies, cart);
}

// Sets a line's quantity outright (unlike addToCart, which adds to whatever
// is already there) — used by the /cart review page's per-row quantity
// field. A quantity <= 0 removes the line entirely rather than storing a
// zero/negative entry.
export function updateCartQuantity(cookies: AstroCookies, ref: EntryRef, quantity: number) {
	const cart = getCart(cookies);
	const key = entryKey(ref);
	if (quantity <= 0) {
		setCart(
			cookies,
			cart.filter((e) => entryKey(e) !== key),
		);
		return;
	}

	const existing = cart.find((e) => entryKey(e) === key);
	if (existing) {
		existing.quantity = quantity;
	} else {
		cart.push({ ...ref, quantity } as CartEntry);
	}
	setCart(cookies, cart);
}

export function removeFromCart(cookies: AstroCookies, ref: EntryRef) {
	const cart = getCart(cookies);
	const key = entryKey(ref);
	setCart(
		cookies,
		cart.filter((e) => entryKey(e) !== key),
	);
}

export function clearCart(cookies: AstroCookies) {
	setCart(cookies, []);
}

async function buildItemLines(entries: { itemId: number; quantity: number }[]): Promise<CartItemLine[]> {
	if (entries.length === 0) return [];
	const itemIds = entries.map((e) => e.itemId);
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

	return entries
		.map((entry): CartItemLine | null => {
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
		.filter((line): line is CartItemLine => line !== null);
}

async function buildSetLines(entries: { setId: number; quantity: number }[]): Promise<CartSetLine[]> {
	if (entries.length === 0) return [];
	const setIds = entries.map((e) => e.setId);
	const rows = await db.query.sets.findMany({
		where: (t, { inArray }) => inArray(t.id, setIds),
		with: {
			product: true,
			attributeValues: { with: { attribute: true } },
		},
	});

	// Same visibility rule as items: dropped silently rather than erroring —
	// see the precedent this file already sets for archived/unpublished items.
	const visibleRows = rows.filter((row) => !row.archived && row.product?.status === 'published');
	const rowsById = new Map(visibleRows.map((row) => [row.id, row]));

	const childrenBySet = await getSetChildrenDetailedBulk(visibleRows.map((row) => row.id));
	const allChildItemIds = [...new Set([...childrenBySet.values()].flat().map((child) => child.itemId))];
	const reserved = await reservedQuantitiesByItem(allChildItemIds);

	return entries
		.map((entry): CartSetLine | null => {
			const row = rowsById.get(entry.setId);
			if (!row) return null;
			const children = childrenBySet.get(row.id) ?? [];
			const { stockCount, inStock } = computeSetAvailability(children, reserved);
			return {
				setId: row.id,
				productSlug: row.product?.slug ?? null,
				productTitle: row.product?.title ?? row.name,
				imageUrl: row.imageUrl ?? row.product?.thumbnailImageUrl ?? null,
				quantity: entry.quantity,
				stockCount,
				inStock,
				attributes: sortAttributes(row.attributeValues),
				children: children.map((child) => ({
					itemId: child.itemId,
					name: child.name,
					quantityPerSet: child.quantity,
				})),
			};
		})
		.filter((line): line is CartSetLine => line !== null);
}

// Joins the cookie cart against items/sets/products for display (name,
// image, current stock, and — for a set — its resolved children) — used by
// the cart sidebar's GET /api/cart endpoint and the /cart and /reservation
// pages. Entries pointing at an item/set that no longer exists, has since
// been archived, or whose product is no longer published are silently
// dropped. src/lib/orders.ts's createOrder does the same for nonexistent and
// archived entries, but — unlike here — deliberately does NOT re-check
// product status at checkout time; see the note on createOrder for why.
export async function getCartLines(cookies: AstroCookies): Promise<CartLine[]> {
	const cart = getCart(cookies);
	if (cart.length === 0) return [];

	const itemEntries = cart.filter((e): e is { itemId: number; quantity: number } => 'itemId' in e);
	const setEntries = cart.filter((e): e is { setId: number; quantity: number } => 'setId' in e);

	const [itemLines, setLines] = await Promise.all([buildItemLines(itemEntries), buildSetLines(setEntries)]);

	// Rebuild in the cart's own stored order rather than items-then-sets.
	const linesByKey = new Map<string, CartLine>();
	for (const line of itemLines) linesByKey.set(entryKey({ itemId: line.itemId }), line);
	for (const line of setLines) linesByKey.set(entryKey({ setId: line.setId }), line);

	return cart.map((entry) => linesByKey.get(entryKey(entry))).filter((line): line is CartLine => line !== undefined);
}
