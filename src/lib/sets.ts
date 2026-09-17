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
