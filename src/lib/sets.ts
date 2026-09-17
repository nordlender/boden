// Bundled sets (GitHub issue #61) — a set is a curated bundle of concrete
// items (src/db/schema.ts's `sets`/`setItems`), rentable as one package
// while each item keeps its own independent stock/availability tracking.
//
// Deliberately NOT duplicated here: any sweep-line/date-range math. A set
// has no stock of its own — "is this set available" is defined purely in
// terms of src/lib/reservation.ts's existing per-item
// getReservationAvailability, composed over the set's membership. This
// guarantees an item that's both individually rentable and part of a kit
// always draws from the same physical stock pool (see getSetAvailability).
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { items, setItems, sets } from '../db/schema';
import { getReservationAvailability, type ReservationAvailability, type ReservationDateRange } from './reservation';
import type { CartEntry, CartSetEntry } from './cart';

export interface SetMembershipItem {
	itemId: number;
	// How many of this item one kit needs (e.g. 2 crampons per kit).
	quantity: number;
	archived: boolean;
}

// Loads what one kit of `setId` expands to — pure membership data, no
// availability math. Shared by getSetAvailability and resolveCartLines so
// both agree on what "1 kit of set X" means.
export async function getSetMembership(setId: number): Promise<SetMembershipItem[]> {
	const rows = await db
		.select({ itemId: setItems.itemId, quantity: setItems.quantity, archived: items.archived })
		.from(setItems)
		.innerJoin(items, eq(setItems.itemId, items.id))
		.where(eq(setItems.setId, setId));
	return rows;
}

export interface SetAvailability {
	setId: number;
	requestedQuantity: number;
	// Per constituent item, at the quantity this request would need (already
	// multiplied by the set's own per-kit quantity) — lets a caller show
	// exactly which item is the binding constraint.
	perItemAvailability: ReservationAvailability[];
	available: boolean;
	// How many whole kits could be reserved for this range right now,
	// independent of `requestedQuantity` — the binding constraint is
	// whichever constituent item runs out first.
	maxAvailableQuantity: number;
}

// Composes on top of the unmodified getReservationAvailability: expands the
// set into {itemId, quantity: perKitQty * requestedQuantity} pairs and asks
// the existing per-item sweep-line about those, exactly as if the shopper
// had added each constituent item to their cart directly. No new stock
// pool, no new date-range logic.
//
// Graceful degradation (see GitHub issue #61 design discussion): a kit is
// atomic, not per-item — if any constituent item is archived, or any
// constituent item can't clear the requested quantity, the WHOLE set is
// reported unavailable rather than "2 of 3 items in your kit." We never
// hand out a partial kit.
export async function getSetAvailability(
	range: ReservationDateRange,
	setId: number,
	requestedQuantity: number,
	excludeOrderId?: number,
): Promise<SetAvailability> {
	const membership = await getSetMembership(setId);
	if (membership.length === 0) {
		return { setId, requestedQuantity, perItemAvailability: [], available: false, maxAvailableQuantity: 0 };
	}

	const hasArchivedItem = membership.some((m) => m.archived);

	const perItemAvailability = getReservationAvailability(
		range,
		membership.map((m) => ({ itemId: m.itemId, quantity: m.quantity * requestedQuantity })),
		excludeOrderId,
	);

	// stockCount/peakReserved come back independent of the quantity we asked
	// for, so dividing them back out per set-item (rather than re-querying)
	// gives "how many whole kits" each item alone could support right now —
	// the set's real ceiling is the minimum across all of them.
	const maxAvailableQuantity = hasArchivedItem
		? 0
		: Math.max(
				0,
				Math.min(
					...membership.map((m) => {
						const a = perItemAvailability.find((x) => x.itemId === m.itemId);
						if (!a) return 0;
						return Math.floor((a.stockCount - a.peakReserved) / m.quantity);
					}),
				),
			);

	const available = !hasArchivedItem && perItemAvailability.every((a) => a.available);

	return { setId, requestedQuantity, perItemAvailability, available, maxAvailableQuantity };
}

export interface MergedCartLine {
	itemId: number;
	quantity: number;
	// Tagged only when this item's *entire* merged quantity came from
	// exactly one set (no standalone contribution, no second set that also
	// includes it) — display-only provenance for orderItems.setId, same
	// "leave it null rather than guess" rule documented on that column.
	// Inventory correctness never depends on this field.
	setId: number | null;
}

// Expands cart-level set entries into their constituent items and merges
// them with standalone cart entries by itemId (summing quantities) — the
// one place both the cart display (getCartItems) and checkout
// (src/lib/orders.ts) turn "N standalone items + M kits" into the flat
// item-level demand list that getReservationAvailability/orderItems already
// understand. Neither of those needs to change: by the time a set reaches
// them, it's indistinguishable from a shopper adding its items by hand.
export async function resolveCartLines(cartEntries: CartEntry[], cartSets: CartSetEntry[]): Promise<MergedCartLine[]> {
	const contributions = new Map<number, { quantity: number; setIds: Set<number>; hasStandalone: boolean }>();

	function addContribution(itemId: number, quantity: number, setId: number | null) {
		const existing = contributions.get(itemId) ?? { quantity: 0, setIds: new Set<number>(), hasStandalone: false };
		existing.quantity += quantity;
		if (setId !== null) existing.setIds.add(setId);
		else existing.hasStandalone = true;
		contributions.set(itemId, existing);
	}

	for (const entry of cartEntries) {
		addContribution(entry.itemId, entry.quantity, null);
	}

	if (cartSets.length > 0) {
		const setIds = cartSets.map((s) => s.setId);
		const membershipRows = await db
			.select({ setId: setItems.setId, itemId: setItems.itemId, quantity: setItems.quantity })
			.from(setItems)
			.where(inArray(setItems.setId, setIds));
		const membershipBySet = new Map<number, { itemId: number; quantity: number }[]>();
		for (const row of membershipRows) {
			const list = membershipBySet.get(row.setId) ?? [];
			list.push({ itemId: row.itemId, quantity: row.quantity });
			membershipBySet.set(row.setId, list);
		}

		for (const { setId, quantity: kitQuantity } of cartSets) {
			for (const member of membershipBySet.get(setId) ?? []) {
				addContribution(member.itemId, member.quantity * kitQuantity, setId);
			}
		}
	}

	return Array.from(contributions.entries()).map(([itemId, c]) => ({
		itemId,
		quantity: c.quantity,
		setId: !c.hasStandalone && c.setIds.size === 1 ? [...c.setIds][0] : null,
	}));
}

export interface SetSummary {
	id: number;
	slug: string;
	title: string;
	description: string | null;
	thumbnailImageUrl: string | null;
}

// Batch title/slug lookup for tagging cart/order display rows with "part of
// set X" — kept separate from resolveCartLines so callers that don't need
// display metadata (checkout) don't pay for the extra query.
export async function getSetSummaries(setIds: number[]): Promise<Map<number, SetSummary>> {
	if (setIds.length === 0) return new Map();
	const rows = await db
		.select({ id: sets.id, slug: sets.slug, title: sets.title, description: sets.description, thumbnailImageUrl: sets.thumbnailImageUrl })
		.from(sets)
		.where(and(inArray(sets.id, setIds)));
	return new Map(rows.map((row) => [row.id, row]));
}

// ---------------------------------------------------------------------------
// Minimal admin CRUD (src/pages/admin/sets.astro) — deliberately plain
// POST-form/redirect functions, same style as src/lib/pickupDays.ts, rather
// than anything wizard-shaped. Not built here: bulk actions, drag-reorder,
// image upload — this is a v1 pass at "an admin needs to be able to create
// a set at all," not a port of the item wizard's polish.
// ---------------------------------------------------------------------------

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base || 'set';
}

async function uniqueSetSlug(title: string): Promise<string> {
	const base = slugify(title);
	let candidate = base;
	let suffix = 2;
	// Small table — a loop of existence checks is fine, same as
	// wizard.ts's uniqueItemSlug (not imported from there: that file is
	// owned by an already-merged, out-of-scope PR — see src/lib/stock.ts's
	// note on the same convention).
	while (await db.query.sets.findFirst({ where: (t, { eq: eqCol }) => eqCol(t.slug, candidate) })) {
		candidate = `${base}-${suffix++}`;
	}
	return candidate;
}

export interface AdminSetListItem {
	id: number;
	slug: string;
	title: string;
	status: 'hidden' | 'published';
	itemCount: number;
	hasArchivedItem: boolean;
}

// /admin/sets listing — every set regardless of status, with enough to
// flag the "needs attention" case documented in the design doc: a set with
// an archived constituent item reports 0 available kits everywhere else in
// the app, so the admin needs a way to notice and fix it here.
export async function listSetsForAdmin(): Promise<AdminSetListItem[]> {
	const rows = await db.query.sets.findMany({
		orderBy: (t, { asc }) => asc(t.id),
		with: { setItems: { with: { item: { columns: { archived: true } } } } },
	});
	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		title: row.title,
		status: row.status,
		itemCount: row.setItems.length,
		hasArchivedItem: row.setItems.some((si) => si.item.archived),
	}));
}

export interface AdminSetDetail {
	id: number;
	slug: string;
	title: string;
	description: string | null;
	thumbnailImageUrl: string | null;
	status: 'hidden' | 'published';
	items: { setItemId: number; itemId: number; itemName: string; productTitle: string | null; quantity: number; archived: boolean }[];
}

// /admin/sets management panel for one set — its own fields plus its
// current membership, for editing/removing rows.
export async function getSetForAdmin(id: number): Promise<AdminSetDetail | null> {
	const set = await db.query.sets.findFirst({
		where: (t, { eq: eqCol }) => eqCol(t.id, id),
		with: { setItems: { with: { item: { with: { product: true } } } } },
	});
	if (!set) return null;

	return {
		id: set.id,
		slug: set.slug,
		title: set.title,
		description: set.description,
		thumbnailImageUrl: set.thumbnailImageUrl,
		status: set.status,
		items: set.setItems.map((si) => ({
			setItemId: si.id,
			itemId: si.item.id,
			itemName: si.item.name,
			productTitle: si.item.product?.title ?? null,
			quantity: si.quantity,
			archived: si.item.archived,
		})),
	};
}

export interface AdminItemOption {
	id: number;
	name: string;
	productTitle: string | null;
}

// Every non-archived item, for the "add item to set" dropdown — deliberately
// simple (no search/pagination): mirrors the scale assumption already made
// throughout this admin surface (e.g. pickupDays.ts's "admins only add a
// modest number" note).
export async function listItemOptionsForAdmin(): Promise<AdminItemOption[]> {
	const rows = await db.query.items.findMany({
		where: (t, { eq: eqCol }) => eqCol(t.archived, false),
		orderBy: (t, { asc }) => asc(t.name),
		with: { product: { columns: { title: true } } },
	});
	return rows.map((row) => ({ id: row.id, name: row.name, productTitle: row.product?.title ?? null }));
}

export async function createSet(input: { title: string; description: string | null; thumbnailImageUrl: string | null }): Promise<number> {
	const slug = await uniqueSetSlug(input.title);
	const [row] = await db
		.insert(sets)
		.values({ slug, title: input.title, description: input.description, thumbnailImageUrl: input.thumbnailImageUrl })
		.returning({ id: sets.id });
	return row.id;
}

export async function updateSet(input: {
	id: number;
	title: string;
	description: string | null;
	thumbnailImageUrl: string | null;
	status: 'hidden' | 'published';
}): Promise<void> {
	await db
		.update(sets)
		.set({
			title: input.title,
			description: input.description,
			thumbnailImageUrl: input.thumbnailImageUrl,
			status: input.status,
			updatedAt: new Date(),
		})
		.where(eq(sets.id, input.id));
}

// Hard delete — a set is never referenced by orderItems the way an item is
// (orderItems.setId is a nullable, onDelete: 'set null' display tag, not
// the source of truth for what was rented), so deleting one can never
// orphan or corrupt order history; it only drops the "part of set X" badge
// on any past orderItems rows. See docs design note on this.
export async function deleteSet(id: number): Promise<void> {
	await db.delete(sets).where(eq(sets.id, id));
}

// Adds an item to a set, or updates its quantity if it's already a member
// (upsert on the (setId, itemId) unique index) — avoids a separate
// "already in this set" error path for what's really just an edit.
export async function addSetItem(input: { setId: number; itemId: number; quantity: number }): Promise<void> {
	await db
		.insert(setItems)
		.values({ setId: input.setId, itemId: input.itemId, quantity: input.quantity })
		.onConflictDoUpdate({
			target: [setItems.setId, setItems.itemId],
			set: { quantity: input.quantity },
		});
}

export async function removeSetItem(input: { setId: number; itemId: number }): Promise<void> {
	await db.delete(setItems).where(and(eq(setItems.setId, input.setId), eq(setItems.itemId, input.itemId)));
}
