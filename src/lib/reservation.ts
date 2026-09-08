import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { items, orderItems, orders } from '../db/schema';
import { isoDateFromUtcMidnight, todayIsoInClubTimezone } from './dates';

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
	// direct POST bypassing it. "Today" is the club's calendar day
	// (src/lib/dates.ts), so the cut-off doesn't move with the server
	// process's timezone.
	const todayIso = todayIsoInClubTimezone();
	if (range.from < todayIso) return false;
	return range.from <= range.to;
}

// For each requested item, finds the peak quantity of that item already
// reserved (by other requested/active orders) at any single point in time
// within [from, to], via a sweep line over the overlapping orders' date
// ranges. Two requests for the same item at different quantities can come
// back with different `available` verdicts for the same range — the whole
// point of tracking peak concurrent demand rather than just "is there any
// order at all in this range".
// `executor` defaults to the top-level `db` (used by the live-preview API
// route), but callers that must check availability atomically alongside an
// insert (src/lib/orders.ts) pass the transaction handle instead. Both
// support the same synchronous `.all()` call — the better-sqlite3 driver
// executes queries synchronously regardless of `await`, and a transaction's
// callback here must stay synchronous (see insertOrder's comment).
type QueryExecutor = Pick<typeof db, 'select'>;

export function getReservationAvailability(
	range: ReservationDateRange,
	requestedItems: { itemId: number; quantity: number }[],
	excludeOrderId?: number,
	executor: QueryExecutor = db,
): ReservationAvailability[] {
	if (requestedItems.length === 0) return [];
	const itemIds = requestedItems.map((entry) => entry.itemId);

	const itemRows = executor
		.select({ id: items.id, stockCount: items.stockCount })
		.from(items)
		.where(inArray(items.id, itemIds))
		.all();
	const stockById = new Map(itemRows.map((row) => [row.id, row.stockCount]));

	// Overlap test on two inclusive ranges [a.from, a.to] and [b.from, b.to]:
	// a.from <= b.to AND a.to >= b.from.
	const overlapping = executor
		.select({
			itemId: orderItems.itemId,
			quantity: orderItems.requestedQuantity,
			fromDate: orders.fromDate,
			toDate: orders.toDate,
			orderId: orders.id,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(
			and(
				inArray(orderItems.itemId, itemIds),
				inArray(orders.status, ['requested', 'active']),
				lte(orders.fromDate, range.to),
				gte(orders.toDate, range.from),
			),
		)
		.all();

	const intervalsByItem = new Map<number, { start: string; end: string; quantity: number }[]>();
	for (const row of overlapping) {
		if (excludeOrderId !== undefined && row.orderId === excludeOrderId) continue;
		const list = intervalsByItem.get(row.itemId) ?? [];
		// Clamp to the requested range — only the overlap matters for the sweep.
		list.push({
			start: row.fromDate > range.from ? row.fromDate : range.from,
			end: row.toDate < range.to ? row.toDate : range.to,
			quantity: row.quantity,
		});
		intervalsByItem.set(row.itemId, list);
	}

	return requestedItems.map(({ itemId, quantity }) => {
		const stockCount = stockById.get(itemId) ?? 0;
		const peakReserved = peakConcurrentQuantity(intervalsByItem.get(itemId) ?? []);
		return {
			itemId,
			requestedQuantity: quantity,
			peakReserved,
			stockCount,
			available: stockCount - peakReserved >= quantity,
		};
	});
}

// Sweep-line over [start, end] date intervals (inclusive), each carrying a
// quantity, and returns the highest sum of concurrently-active quantities at
// any point. A "day after end" sentinel is used for the end event so an
// interval ending on day D still counts as active on day D itself.
function peakConcurrentQuantity(intervals: { start: string; end: string; quantity: number }[]): number {
	if (intervals.length === 0) return 0;

	type Event = { date: string; delta: number };
	const events: Event[] = [];
	for (const { start, end, quantity } of intervals) {
		events.push({ date: start, delta: quantity });
		events.push({ date: dayAfter(end), delta: -quantity });
	}
	// On a tie, process decrements (an interval ending) before increments (one
	// starting) — otherwise two back-to-back, non-overlapping reservations can
	// transiently sum together depending on incidental row order, since a
	// start event and another interval's day-after-end sentinel can land on
	// the same date.
	events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.delta - b.delta));

	let running = 0;
	let peak = 0;
	for (const event of events) {
		running += event.delta;
		if (running > peak) peak = running;
	}
	return peak;
}

// Pure calendar arithmetic on a YYYY-MM-DD string: the date is pinned to UTC
// midnight and read straight back out in UTC, so the result never depends on
// the host's timezone.
function dayAfter(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return isoDateFromUtcMidnight(d);
}

// True when some (but not all) items are unavailable for their requested
// quantity in the chosen range — the trigger for the mixed-availability
// warning banner and the per-item "split into a separate order" action.
export function hasMixedAvailability(availabilities: ReservationAvailability[]): boolean {
	const someAvailable = availabilities.some((a) => a.available);
	const someUnavailable = availabilities.some((a) => !a.available);
	return someAvailable && someUnavailable;
}
