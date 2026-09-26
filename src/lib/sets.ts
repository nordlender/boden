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
	// Customer-facing — the component's own product title, never its
	// items.name (that field is internal/admin-only everywhere else in this
	// codebase, see schema.ts's comment on it, and a set's children are
	// shown to customers). Falls back to the item's internal name only in
	// the degenerate case of an unassigned component item, same fallback
	// cart.ts already uses for a plain item line's own productTitle.
	productTitle: string;
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
		with: { item: { with: { product: true } } },
	});

	const bySet = new Map<number, SetChildDetail[]>();
	for (const row of rows) {
		const list = bySet.get(row.setId) ?? [];
		list.push({
			itemId: row.itemId,
			quantity: row.quantity,
			productTitle: row.item.product?.title ?? row.item.name,
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

// ---------------------------------------------------------------------------
// Set contents display — a set has no attribute template of its own (see
// schema.ts's `sets.label` comment): what it "includes" is derived
// automatically from its components' own, already-existing attribute
// values, never entered separately by an admin. Components that share the
// exact same attribute-key signature (same product template) are rendered
// as one table with a shared header, e.g. a rack of cams at different
// sizes; anything else — a component with no siblings sharing its
// signature, or none with attributes at all — is just a line.
// ---------------------------------------------------------------------------

export interface SetComponentTableRow {
	productTitle: string;
	quantity: number;
	// Aligned to the table's own `keys` — null where this row's own item has
	// no value for that key (shouldn't normally happen once a column has
	// been kept at all, see buildComponentDisplay's blank-column trim, but
	// kept nullable rather than assumed non-empty).
	values: (string | null)[];
}

export interface SetComponentTable {
	kind: 'table';
	keys: string[];
	rows: SetComponentTableRow[];
}

export interface SetComponentLine {
	kind: 'line';
	productTitle: string;
	quantity: number;
	attributes: { key: string; value: string }[];
}

export type SetComponentDisplay = SetComponentTable | SetComponentLine;

interface ComponentRow {
	quantity: number;
	item: {
		name: string;
		product: { title: string; attributeKeys: { name: string }[] } | null;
		attributeValues: { value: string; attribute: { name: string } }[];
	};
}

interface ComponentInfo {
	productTitle: string;
	quantity: number;
	keys: string[]; // this component's own product's attribute-key names, in template order
	valueByKey: Map<string, string>;
}

// Groups a set's components by whether they share the exact same
// attribute-key signature (same set of key names, in the same order — keys
// come from a per-product template, so this really means "do these
// components' products define an identical attribute schema"). A group of
// 2+ components sharing a non-empty signature becomes one table, since the
// same columns then mean the same thing across every row; a lone component,
// or one whose product has no attribute keys at all, is just a line.
function buildComponentDisplay(rows: ComponentRow[]): SetComponentDisplay[] {
	const components: ComponentInfo[] = rows.map((row) => ({
		productTitle: row.item.product?.title ?? row.item.name,
		quantity: row.quantity,
		keys: row.item.product?.attributeKeys.map((key) => key.name) ?? [],
		valueByKey: new Map(row.item.attributeValues.map((value) => [value.attribute.name, value.value])),
	}));

	const groups = new Map<string, ComponentInfo[]>();
	for (const component of components) {
		// \0 can't appear in a real attribute-key name, so joining on it is a
		// safe way to turn an ordered key list into one comparable string.
		const signature = component.keys.join('\u0000');
		const group = groups.get(signature) ?? [];
		group.push(component);
		groups.set(signature, group);
	}

	const display: SetComponentDisplay[] = [];
	for (const [signature, group] of groups) {
		const keys = signature ? signature.split('\u0000') : [];
		// Drop a column entirely if every row in the group left it blank — a
		// stub itemAttributeValues row (schema.ts's Work notes on fanning out
		// new template fields to existing items) shouldn't show up as an
		// empty column. Reused as-is for the single-component line case
		// below: there, this is just "that component's own non-blank
		// attributes".
		const usedKeys = keys.filter((key) => group.some((component) => (component.valueByKey.get(key) ?? '') !== ''));

		if (group.length > 1 && usedKeys.length > 0) {
			display.push({
				kind: 'table',
				keys: usedKeys,
				rows: group.map((component) => ({
					productTitle: component.productTitle,
					quantity: component.quantity,
					values: usedKeys.map((key) => component.valueByKey.get(key) ?? null),
				})),
			});
		} else {
			for (const component of group) {
				display.push({
					kind: 'line',
					productTitle: component.productTitle,
					quantity: component.quantity,
					attributes: usedKeys
						.map((key) => ({ key, value: component.valueByKey.get(key) ?? '' }))
						.filter((attribute) => attribute.value !== ''),
				});
			}
		}
	}
	return display;
}

export async function getSetComponentDisplayBulk(setIds: number[]): Promise<Map<number, SetComponentDisplay[]>> {
	if (setIds.length === 0) return new Map();
	const rows = await db.query.setItems.findMany({
		where: (t, { inArray: inArrayCol }) => inArrayCol(t.setId, setIds),
		with: {
			item: {
				with: {
					product: { with: { attributeKeys: { orderBy: (t, { asc }) => asc(t.sortOrder) } } },
					attributeValues: { with: { attribute: true } },
				},
			},
		},
	});

	const rowsBySet = new Map<number, ComponentRow[]>();
	for (const row of rows) {
		const list = rowsBySet.get(row.setId) ?? [];
		list.push(row);
		rowsBySet.set(row.setId, list);
	}

	const result = new Map<number, SetComponentDisplay[]>();
	for (const setId of setIds) {
		result.set(setId, buildComponentDisplay(rowsBySet.get(setId) ?? []));
	}
	return result;
}

export async function getSetComponentDisplay(setId: number): Promise<SetComponentDisplay[]> {
	return (await getSetComponentDisplayBulk([setId])).get(setId) ?? [];
}
