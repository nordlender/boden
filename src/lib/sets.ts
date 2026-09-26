// Set composition — the schema-level primitives for src/db/schema.ts's
// sets/setItems tables. A set never appears in an order (orderItems always
// references items — see schema.ts), so every consumer here (cart.ts's set
// cart lines, orders.ts's order creation, reservation.ts's cart-line
// availability, shop.ts's catalogue) needs the same thing: a set's
// composition, expanded/merged down to real item quantities.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { sets } from '../db/schema';

export interface SetChild {
	itemId: number;
	quantity: number;
}

export interface SetChildDetail extends SetChild {
	name: string;
	imageUrl: string | null;
	archived: boolean;
	stockCount: number;
}

export async function getSetChildrenBulk(setIds: number[]): Promise<Map<number, SetChild[]>> {
	if (setIds.length === 0) return new Map();
	const rows = await db.query.setItems.findMany({
		where: (t, { inArray: inArrayCol }) => inArrayCol(t.setId, setIds),
	});

	const bySet = new Map<number, SetChild[]>();
	for (const row of rows) {
		const list = bySet.get(row.setId) ?? [];
		list.push({ itemId: row.itemId, quantity: row.quantity });
		bySet.set(row.setId, list);
	}
	return bySet;
}

export async function getSetChildren(setId: number): Promise<SetChild[]> {
	return (await getSetChildrenBulk([setId])).get(setId) ?? [];
}

// Same as getSetChildrenBulk, joined against the component items — used
// wherever a set needs to be *displayed* (cart/reservation rows' indented
// children, the shop catalogue), not just resolved to quantities.
export async function getSetChildrenDetailedBulk(setIds: number[]): Promise<Map<number, SetChildDetail[]>> {
	if (setIds.length === 0) return new Map();
	const rows = await db.query.setItems.findMany({
		where: (t, { inArray: inArrayCol }) => inArrayCol(t.setId, setIds),
		with: { item: true },
	});

	const bySet = new Map<number, SetChildDetail[]>();
	for (const row of rows) {
		const list = bySet.get(row.setId) ?? [];
		list.push({
			itemId: row.itemId,
			quantity: row.quantity,
			name: row.item.name,
			imageUrl: row.item.imageUrl,
			archived: row.item.archived,
			stockCount: row.item.stockCount,
		});
		bySet.set(row.setId, list);
	}
	return bySet;
}

// Only ever true|false checked against: a soft-deleted set behaves like an
// archived item everywhere (cart.ts, orders.ts) — dropped silently rather
// than erroring, same precedent as items.archived.
export async function getValidSetIds(setIds: number[]): Promise<Set<number>> {
	if (setIds.length === 0) return new Set();
	const rows = await db
		.select({ id: sets.id })
		.from(sets)
		.where(and(inArray(sets.id, setIds), eq(sets.archived, false)));
	return new Set(rows.map((row) => row.id));
}

export type ResolvableEntry = { itemId: number; quantity: number } | { setId: number; quantity: number };

// Shared by src/lib/cart.ts (computing a cart's total demand per item, e.g.
// for the reservation-availability check) and src/lib/orders.ts (what
// actually gets inserted as orderItems at checkout — see schema.ts's note
// that orders/rentals always reference items, never sets). Expands every
// set entry into its components (quantity multiplied by how many sets were
// requested) and merges everything down to one summed quantity per itemId —
// merging, not just concatenating, is what makes a component shared by two
// different cart lines (e.g. the same chalk bag sold loose *and* inside a
// set) correctly counted once against real stock, rather than checked twice
// against the same stock independently.
export async function resolveEntriesToItemQuantities(
	entries: ResolvableEntry[],
): Promise<{ itemId: number; quantity: number }[]> {
	const setIds = entries.filter((entry): entry is { setId: number; quantity: number } => 'setId' in entry).map((entry) => entry.setId);
	const childrenBySet = await getSetChildrenBulk(setIds);

	const totals = new Map<number, number>();
	for (const entry of entries) {
		if ('itemId' in entry) {
			totals.set(entry.itemId, (totals.get(entry.itemId) ?? 0) + entry.quantity);
		} else {
			for (const child of childrenBySet.get(entry.setId) ?? []) {
				totals.set(child.itemId, (totals.get(child.itemId) ?? 0) + child.quantity * entry.quantity);
			}
		}
	}
	return Array.from(totals, ([itemId, quantity]) => ({ itemId, quantity }));
}

// Max number of the set orderable right now: the smallest ratio of any
// component's current stock to how many of it the set needs — one
// insufficient component caps the whole set, same idea as items'
// stockCount/inStock split but computed on the fly rather than stored (a set
// has no stock of its own).
export function computeSetAvailability(
	children: { itemId: number; quantity: number; stockCount: number }[],
	reservedByItem: Map<number, number>,
): { stockCount: number; inStock: number } {
	if (children.length === 0) return { stockCount: 0, inStock: 0 };

	let stockCount = Infinity;
	let inStock = Infinity;
	for (const child of children) {
		const reserved = reservedByItem.get(child.itemId) ?? 0;
		stockCount = Math.min(stockCount, Math.floor(child.stockCount / child.quantity));
		inStock = Math.min(inStock, Math.floor((child.stockCount - reserved) / child.quantity));
	}
	return { stockCount, inStock: Math.max(inStock, 0) };
}
