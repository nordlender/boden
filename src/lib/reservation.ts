import { db } from '../db/client';
import { daysInclusive, getAvailableForRange, getStockCounts, type QueryExecutor } from './availability';
import { getMaxRentalDays } from './rental-policy';
import { todayIsoInOslo } from './dates';

// Reservation page backend (docs/TASKS.md "Reservation"). Orders carry a
// date range (src/db/schema.ts's orders.fromDate/toDate, both YYYY-MM-DD,
// inclusive) — this is what makes availability actually date- and
// quantity-aware, replacing the design-scaffold's stub
// (stubAvailabilityFromCart, since removed).
export interface ReservationAvailability {
	itemId: number;
	requestedQuantity: number;
	// The most units of this item reserved by any other requested/active
	// order at any single point within [from, to] — i.e. the peak
	// concurrent demand this request would be competing with.
	peakReserved: number;
	stockCount: number;
	available: boolean;
}

export interface ReservationDateRange {
	from: string; // YYYY-MM-DD
	to: string; // YYYY-MM-DD
}

export function isValidDateRange(range: Partial<ReservationDateRange>): range is ReservationDateRange {
	if (!range.from || !range.to) return false;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return false;
	// The calendar's `min` attribute (ReservationCalendar.astro) only stops a
	// past date client-side — this is the server-side backstop against a
	// direct POST bypassing it. "Today" is always Europe/Oslo's today (the
	// shop's timezone), not the server host's or a UTC-shifted one — see
	// src/lib/dates.ts.
	const todayIso = todayIsoInOslo();
	if (range.from < todayIso) return false;
	if (range.from > range.to) return false;
	// Single gate shared by order creation, split-order creation, the
	// reservation-availability preview, and reschedule — so the max rental
	// duration cap (src/lib/rental-policy.ts) applies everywhere at once.
	return daysInclusive(range.from, range.to) <= getMaxRentalDays();
}

// For each requested item: is `quantity` free on every day of [from, to]?
// Delegates to src/lib/availability.ts (the one availability model — see
// there for what an order occupies, including the overdue rule).
// `peakReserved` is the most units occupied by other orders on any single
// day in the range. `executor` defaults to the top-level `db` (the live
// preview), but callers that must check atomically alongside an insert
// (src/lib/orders.ts) pass the transaction handle — everything stays
// synchronous for that reason (see insertOrder's comment).
export function getReservationAvailability(
	range: ReservationDateRange,
	requestedItems: { itemId: number; quantity: number }[],
	excludeOrderId?: number,
	executor: QueryExecutor = db,
): ReservationAvailability[] {
	if (requestedItems.length === 0) return [];
	const itemIds = requestedItems.map((entry) => entry.itemId);
	const stock = getStockCounts(itemIds, executor);
	const availableByItem = getAvailableForRange(itemIds, range.from, range.to, { excludeOrderId, executor });

	return requestedItems.map(({ itemId, quantity }) => {
		const stockCount = stock.get(itemId) ?? 0;
		const availableQuantity = availableByItem.get(itemId) ?? 0;
		return {
			itemId,
			requestedQuantity: quantity,
			peakReserved: stockCount - availableQuantity,
			stockCount,
			available: availableQuantity >= quantity,
		};
	});
}

// True when some (but not all) items are unavailable for their requested
// quantity in the chosen range — the trigger for the mixed-availability
// warning banner and the per-item "split into a separate order" action.
export function hasMixedAvailability(availabilities: ReservationAvailability[]): boolean {
	const someAvailable = availabilities.some((a) => a.available);
	const someUnavailable = availabilities.some((a) => !a.available);
	return someAvailable && someUnavailable;
}

// A cart line (see cart.ts's CartLine) at the granularity the reservation
// page actually renders — a plain item line's itemRequirements is just
// itself; a set line's is its components, already expanded (quantity
// multiplied by however many of the set are requested) by whoever built
// this — see sets.ts's resolveEntriesToItemQuantities/getSetChildrenBulk.
export interface ReservationLine {
	key: string; // cart.ts's entryKey — 'item:<id>' or 'set:<id>'
	itemRequirements: { itemId: number; quantity: number }[];
}

export interface ReservationLineAvailability {
	key: string;
	available: boolean;
}

// Rolls per-item availability (getReservationAvailability) up to the
// cart-line granularity the reservation page renders. A plain item line is
// available iff its own item is; a set line is available iff *every* one of
// its components is. Every line's demand for a given item is merged into
// one quantity before checking — the whole point being that a component
// shared by two different lines (the same chalk bag sold loose and inside a
// set, say) is checked once against its real combined demand, not
// independently per line against the same stock.
export function getCartLineAvailability(
	range: ReservationDateRange,
	lines: ReservationLine[],
	excludeOrderId?: number,
	executor: QueryExecutor = db,
): ReservationLineAvailability[] {
	const totals = new Map<number, number>();
	for (const line of lines) {
		for (const req of line.itemRequirements) {
			totals.set(req.itemId, (totals.get(req.itemId) ?? 0) + req.quantity);
		}
	}
	const merged = Array.from(totals, ([itemId, quantity]) => ({ itemId, quantity }));
	const availableByItem = new Map(
		getReservationAvailability(range, merged, excludeOrderId, executor).map((a) => [a.itemId, a.available]),
	);

	return lines.map((line) => ({
		key: line.key,
		available: line.itemRequirements.length > 0 && line.itemRequirements.every((req) => availableByItem.get(req.itemId) ?? false),
	}));
}
