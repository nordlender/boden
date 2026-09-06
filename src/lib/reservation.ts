// Reservation page scaffolding (docs/TASKS.md "Reservation" item). Design-only
// for now: orders don't carry date ranges yet (see src/db/schema.ts's orders
// table — no fromDate/toDate columns), so there's no real per-range
// availability to query. The schema/backend/middleware work that makes this
// function honest lives in a follow-up worktree branched off this one.
//
// Shape is deliberately settled now so ReservationForm.astro and its client
// script don't need to change when the real implementation lands: one row
// per cart item, told apart by requested quantity vs. how much of that
// quantity is actually free across the whole [from, to] range — not just
// whether the item has *any* free stock. Two items requesting the same item
// but different quantities can come back with different `available` values
// for the same range.
export interface ReservationAvailability {
	itemId: number;
	requestedQuantity: number;
	// How many units of this item are free for every day in [from, to].
	// TODO(schema-backend branch): computed for real once orders carry date
	// ranges — currently just mirrors today's date-less stock.ts figure.
	availableQuantity: number;
	available: boolean;
}

export interface ReservationDateRange {
	from: string; // YYYY-MM-DD
	to: string; // YYYY-MM-DD
}

export function isValidDateRange(range: Partial<ReservationDateRange>): range is ReservationDateRange {
	if (!range.from || !range.to) return false;
	return range.from <= range.to;
}

// STUB: always reports the cart's current (date-less) in-stock figure as the
// per-range availability, so every item looks equally available regardless
// of the chosen dates. Replace with a real date-aware query once orders have
// fromDate/toDate — see TASKS.md "Reservation".
export function stubAvailabilityFromCart(
	items: { itemId: number; quantity: number; inStock: number }[],
): ReservationAvailability[] {
	return items.map((item) => ({
		itemId: item.itemId,
		requestedQuantity: item.quantity,
		availableQuantity: Math.max(item.inStock, 0),
		available: item.inStock >= item.quantity,
	}));
}

// True when some (but not all) items are unavailable for the requested
// quantity in the chosen range — the trigger for the mixed-availability
// warning banner and the per-item "split into a separate order" action.
export function hasMixedAvailability(availabilities: ReservationAvailability[]): boolean {
	const someAvailable = availabilities.some((a) => a.available);
	const someUnavailable = availabilities.some((a) => !a.available);
	return someAvailable && someUnavailable;
}
