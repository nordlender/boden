// The cart's plain-data shapes and their validation. No db or Astro imports,
// so the browser (src/components/cart/cartView.ts) can use the same parsing
// and comparison as the server (src/lib/cart.ts, the order routes).

// A cart line either points at one item or at one set — see docs/schema.md
// (or src/db/schema.ts's `sets` comment) for why a set is a second, bundled
// alternative to an item rather than a variant of it.
export type CartEntry = { itemId: number; quantity: number } | { setId: number; quantity: number };

// A cart line's identity: CartEntry minus `quantity`. A CartEntry satisfies
// it too (structural typing), so callers can pass either.
export type EntryRef = { itemId: number } | { setId: number };

// What a cart page shows and later submits: which cart (its id, see
// src/lib/cart.ts's Cart) and the lines on screen. The next step compares
// this with the cart as it is now, so a cart changed in another tab is
// caught instead of being ordered unseen.
export interface CartSnapshot {
	cartId: string;
	entries: CartEntry[];
}

// 'item:<id>' / 'set:<id>' — keeps an item and a set sharing a numeric id apart.
export function entryKey(ref: EntryRef): string {
	return 'itemId' in ref ? `item:${ref.itemId}` : `set:${ref.setId}`;
}

// Cart ids are crypto.randomUUID() values (src/lib/cart.ts's newCartId).
const CART_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isCartId(value: unknown): value is string {
	return typeof value === 'string' && CART_ID_PATTERN.test(value);
}

// Safe integers only: Number.isInteger(1e300) is true, but such a value
// isn't a real id/quantity and can't round-trip through SQLite exactly.
function isPositiveInt(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) > 0;
}

// Strict check of an already-parsed value: exactly an array of
// `{ itemId, quantity }` / `{ setId, quantity }` objects (positive safe
// integers, no other fields, each line at most once). Anything else rejects
// the whole value (null) rather than salvaging part of it.
export function toCartEntries(value: unknown): CartEntry[] | null {
	if (!Array.isArray(value)) return null;
	const entries: CartEntry[] = [];
	const seen = new Set<string>();
	for (const e of value) {
		if (typeof e !== 'object' || e === null || Array.isArray(e)) return null;
		// Own keys only, so nothing is picked up from the prototype chain.
		if (Object.keys(e).length !== 2 || !Object.hasOwn(e, 'quantity')) return null;
		const hasItem = Object.hasOwn(e, 'itemId');
		const hasSet = Object.hasOwn(e, 'setId');
		if (hasItem === hasSet) return null;
		const { quantity } = e as { quantity: unknown };
		const id = (e as Record<string, unknown>)[hasItem ? 'itemId' : 'setId'];
		if (!isPositiveInt(quantity) || !isPositiveInt(id)) return null;
		const entry: CartEntry = hasItem ? { itemId: id, quantity } : { setId: id, quantity };
		const key = entryKey(entry);
		if (seen.has(key)) return null;
		seen.add(key);
		entries.push(entry);
	}
	return entries;
}

// toCartEntries for a JSON string, e.g. a posted `cartEntries` form field.
export function parseCartEntries(raw: string): CartEntry[] | null {
	try {
		return toCartEntries(JSON.parse(raw));
	} catch {
		return null;
	}
}

// Same lines with the same quantities. Order doesn't matter: it's a display
// detail, not a change to what would be ordered.
export function sameEntries(a: CartEntry[], b: CartEntry[]): boolean {
	if (a.length !== b.length) return false;
	const quantities = new Map(a.map((entry) => [entryKey(entry), entry.quantity]));
	return b.every((entry) => quantities.get(entryKey(entry)) === entry.quantity);
}

// Same cart (id) with the same lines. A different id means the cart was
// ordered (ids rotate after checkout, see src/lib/cart.ts's
// finishCheckout) or replaced, even if the lines happen to match.
export function sameSnapshot(a: CartSnapshot, b: CartSnapshot): boolean {
	return a.cartId === b.cartId && sameEntries(a.entries, b.entries);
}
