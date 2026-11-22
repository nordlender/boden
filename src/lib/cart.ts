import type { AstroCookies } from 'astro';
import { db } from '../db/client';
import { sortAttributes } from './shop';
import { getSetChildrenDetailedBulk } from './sets';
import { entryKey, isCartId, toCartEntries, type CartEntry, type CartSnapshot, type EntryRef } from './cartEntries';

// The cart lives only in the `cart` cookie, as JSON `{ id, entries }` — no
// database row exists until checkout (docs/rental-shop.md §5).
//
// `id` is a random cart id. Every cart page submits it with the lines it
// showed (CartSnapshot), the next step rejects a snapshot that no longer
// matches the cookie, and an order stores the id it was placed from
// (orders.cartId, unique) — so the same cart can't be ordered twice.
//
// `id` is null until the cart is first written, and again once an order has
// been submitted from it (wipeCart). The next write that changes the lines
// gives it a fresh id (saveCart), so an ordered id is never reused.
export interface Cart {
	id: string | null;
	entries: CartEntry[];
}

const COOKIE = 'cart';

export function newCartId(): string {
	return crypto.randomUUID();
}

// Strict: exactly `{ id, entries }` with a well-formed (or null) id and
// entries that pass toCartEntries. The cookie is client-controlled, so anything else
// (bad JSON, the old bare-array format, unknown fields, bad ids/quantities,
// duplicate lines) rejects the whole cookie (null) rather than salvaging part
// of it.
export function parseCartCookie(raw: string): Cart | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	if (Object.keys(parsed).length !== 2 || !Object.hasOwn(parsed, 'id') || !Object.hasOwn(parsed, 'entries')) return null;
	const { id, entries } = parsed as { id: unknown; entries: unknown };
	if (id !== null && !isCartId(id)) return null;
	const validEntries = toCartEntries(entries);
	return validEntries === null ? null : { id, entries: validEntries };
}

// A missing or rejected cookie reads as an empty cart without an id; the
// next write overwrites a rejected cookie with a valid one.
export function getCart(cookies: AstroCookies): Cart {
	const raw = cookies.get(COOKIE)?.value;
	const cart = raw ? parseCartCookie(raw) : null;
	return cart ?? { id: null, entries: [] };
}

export function setCart(cookies: AstroCookies, cart: Cart) {
	cookies.set(COOKIE, JSON.stringify(cart), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: import.meta.env.PROD,
		maxAge: 60 * 60 * 24 * 7, // 1 week
	});
}

// Writes a changed cart, giving it a fresh id if it has none (new, or wiped
// after an order).
function saveCart(cookies: AstroCookies, cart: Cart) {
	setCart(cookies, { ...cart, id: cart.id ?? newCartId() });
}

// Empties the cart and drops its id. Done after every submitted order
// (/api/orders/create) and by "Empty cart".
export function wipeCart(cookies: AstroCookies) {
	setCart(cookies, { id: null, entries: [] });
}

export function addToCart(cookies: AstroCookies, entry: CartEntry) {
	const cart = getCart(cookies);
	const key = entryKey(entry);
	const existing = cart.entries.find((e) => entryKey(e) === key);
	if (existing) {
		existing.quantity += entry.quantity;
	} else {
		cart.entries.push(entry);
	}
	saveCart(cookies, cart);
}

// Sets each line's quantity outright (unlike addToCart, which adds to what
// is already there). A quantity <= 0 removes the line. One cookie write for
// all updates, so a cart page's "Update cart" applies every changed field
// at once.
export function setCartQuantities(cookies: AstroCookies, updates: { ref: EntryRef; quantity: number }[]) {
	const cart = getCart(cookies);
	for (const { ref, quantity } of updates) {
		const key = entryKey(ref);
		const existing = cart.entries.find((e) => entryKey(e) === key);
		if (quantity <= 0) {
			cart.entries = cart.entries.filter((e) => entryKey(e) !== key);
		} else if (existing) {
			existing.quantity = quantity;
		} else {
			cart.entries.push({ ...ref, quantity } as CartEntry);
		}
	}
	saveCart(cookies, cart);
}

export interface CartItemAttribute {
	key: string;
	value: string;
}

// Display shape for a cart line pointing at a plain item: the cookie entry
// joined against items/products for whatever a row needs to render.
export interface CartItemLine {
	itemId: number;
	productSlug: string | null;
	productTitle: string;
	imageUrl: string | null;
	quantity: number;
	attributes: CartItemAttribute[];
}

// One component of a set line, shown as an indented, smaller row under it —
// never independently addable/removable, just a read-only breakdown of what
// the set resolves into. `productTitle` is the component's own product's
// title, never its items.name — that field is internal/admin-only
// everywhere else in this codebase, and a set's children are shown to
// customers (see sets.ts's SetChildDetail).
export interface CartSetChild {
	itemId: number;
	productTitle: string;
	quantityPerSet: number;
}

// Display shape for a cart line pointing at a set. There's no `attributes`
// here — a set has no attribute template of its own (see schema.ts's
// `sets.label` comment); `label` is the admin's own short, manually-typed
// text distinguishing this set from its siblings (e.g. "S"/"M"/"L").
export interface CartSetLine {
	setId: number;
	productSlug: string | null;
	productTitle: string;
	imageUrl: string | null;
	quantity: number;
	label: string | null;
	children: CartSetChild[];
}

export type CartLine = CartItemLine | CartSetLine;

export function lineToEntry(line: CartLine): CartEntry {
	return 'setId' in line ? { setId: line.setId, quantity: line.quantity } : { itemId: line.itemId, quantity: line.quantity };
}

export function lineKey(line: CartLine): string {
	return entryKey(lineToEntry(line));
}

async function buildItemLines(entries: { itemId: number; quantity: number }[]): Promise<CartItemLine[]> {
	if (entries.length === 0) return [];
	const rows = await db.query.items.findMany({
		where: (t, { inArray }) => inArray(t.id, entries.map((e) => e.itemId)),
		with: {
			product: true,
			attributeValues: { with: { attribute: true } },
		},
	});
	const rowsById = new Map(rows.filter((row) => !row.archived && row.product?.status === 'published').map((row) => [row.id, row]));

	return entries.flatMap((entry): CartItemLine[] => {
		const row = rowsById.get(entry.itemId);
		if (!row) return [];
		return [
			{
				itemId: row.id,
				productSlug: row.product?.slug ?? null,
				productTitle: row.product?.title ?? row.name,
				imageUrl: row.imageUrl ?? row.product?.thumbnailImageUrl ?? null,
				quantity: entry.quantity,
				attributes: sortAttributes(row.attributeValues),
			},
		];
	});
}

async function buildSetLines(entries: { setId: number; quantity: number }[]): Promise<CartSetLine[]> {
	if (entries.length === 0) return [];
	const rows = await db.query.sets.findMany({
		where: (t, { inArray }) => inArray(t.id, entries.map((e) => e.setId)),
		with: { product: true },
	});
	const visibleRows = rows.filter((row) => !row.archived && row.product?.status === 'published');
	const childrenBySet = await getSetChildrenDetailedBulk(visibleRows.map((row) => row.id));
	// Same rule as sets.ts's getValidSetIds, which checkout applies: a set
	// with no components, or with an archived one, can't be ordered, so it
	// isn't shown either.
	const rowsById = new Map(
		visibleRows
			.filter((row) => {
				const children = childrenBySet.get(row.id) ?? [];
				return children.length > 0 && children.every((child) => !child.archived);
			})
			.map((row) => [row.id, row]),
	);

	return entries.flatMap((entry): CartSetLine[] => {
		const row = rowsById.get(entry.setId);
		if (!row) return [];
		return [
			{
				setId: row.id,
				productSlug: row.product?.slug ?? null,
				productTitle: row.product?.title ?? row.name,
				imageUrl: row.imageUrl ?? row.product?.thumbnailImageUrl ?? null,
				quantity: entry.quantity,
				label: row.label,
				children: (childrenBySet.get(row.id) ?? []).map((child) => ({
					itemId: child.itemId,
					productTitle: child.productTitle,
					quantityPerSet: child.quantity,
				})),
			},
		];
	});
}

// Joins cart entries against items/sets/products for display, in the
// cart's own order. Entries pointing at an item/set that no longer exists,
// is archived, belongs to an unpublished product, or (sets) can't be ordered
// are silently dropped. src/lib/orders.ts's createOrder drops nonexistent
// and archived entries too, but deliberately does NOT re-check product
// status; see the note on its resolveOrderableEntries.
export async function getCartLines(entries: CartEntry[]): Promise<CartLine[]> {
	if (entries.length === 0) return [];
	const itemEntries = entries.filter((e): e is { itemId: number; quantity: number } => 'itemId' in e);
	const setEntries = entries.filter((e): e is { setId: number; quantity: number } => 'setId' in e);
	const [itemLines, setLines] = await Promise.all([buildItemLines(itemEntries), buildSetLines(setEntries)]);

	const linesByKey = new Map<string, CartLine>([...itemLines, ...setLines].map((line) => [lineKey(line), line]));
	return entries.map((entry) => linesByKey.get(entryKey(entry))).filter((line): line is CartLine => line !== undefined);
}

// The cart as a cart page shows it: its lines, plus the snapshot (id and
// the shown lines as entries) the page submits so the next step can tell
// whether the cart changed in the meantime. Built from the shown lines, not
// the raw cookie, so a line getCartLines hides is never submitted unseen.
export interface ShownCart extends CartSnapshot {
	lines: CartLine[];
}

export async function loadCart(cookies: AstroCookies): Promise<ShownCart> {
	const cart = getCart(cookies);
	const lines = await getCartLines(cart.entries);
	return { cartId: cart.id, entries: lines.map(lineToEntry), lines };
}
