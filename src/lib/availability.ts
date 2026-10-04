// Single source of truth for how many of an item are available. Two views:
//
// - Scheduled availability (everything below except the last section): for
//   each day, stockCount minus every order holding a claim on that day —
//   including requested and scheduled orders whose items haven't been handed
//   out yet. This is what members see (availability calendar) and what the
//   reservation check and order insert enforce, so orders never overlap.
// - Real availability (getRealAvailability): what's physically on the shelf
//   right now — stockCount minus units handed out on active orders that
//   haven't been returned. For admins/moderators to check against the shelf.
//
// Scheduled model: an order is a time range, and every item on it is occupied for
// every day of that range (orders.fromDate..toDate, inclusive). An item's
// availability on day D is its stockCount minus everything occupied on D.
// Nothing is stored — every number (the shop's "available today", the
// availability calendar, the reservation check, the order-insert re-check)
// is derived from the orders on the fly, so it can't drift. See PR #294
// for the research behind this.
//
// Rules for what an order line occupies:
// - Only orders in RESERVING_STATUSES (requested/scheduled/active) count;
//   returned and rejected orders occupy nothing.
// - Quantity: coalesce(retrievedQuantity, requestedQuantity) — once a
//   moderator has handed out fewer than requested, only what actually left
//   the shelf is occupied.
// - Overdue: an order not yet past its toDate is assumed returned on time
//   (occupies fromDate..toDate). An active order past its toDate that hasn't
//   been returned is still physically out, so its occupied period is
//   extended one week at a time past toDate until it covers today:
//   end = toDate + 7 * ceil(daysOverdue / 7) (1–7 days overdue → toDate+7,
//   8–14 → toDate+14, …). It keeps occupying until a moderator marks it
//   returned.
//
// All queries are synchronous (`.all()`) so callers that must check
// availability atomically inside a better-sqlite3 transaction
// (src/lib/orders.ts) can pass the transaction handle as `executor`.
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { items, orderItems, orders } from '../db/schema';
import { RESERVING_STATUSES } from './orderStatus';
import { addDaysIso, daysInclusive, todayIsoInOslo } from './dates';

// Re-exported so existing server-side importers keep working; client code
// should import these from ./dates directly (this module pulls in the db).
export { addDaysIso, daysInclusive };

export type QueryExecutor = Pick<typeof db, 'select'>;

export interface AvailabilityOptions {
	excludeOrderId?: number;
	executor?: QueryExecutor;
	today?: string;
	/** Pre-fetched getStockCounts() result, to avoid looking stock up twice. */
	stock?: Map<number, number>;
}

export interface Claim {
	orderId: number;
	itemId: number;
	quantity: number;
	start: string; // YYYY-MM-DD, inclusive
	end: string; // YYYY-MM-DD, inclusive (extended weekly when overdue)
}

/**
 * Effective end of an order's occupied period. On time (or not active):
 * its toDate. Overdue: toDate pushed forward in whole weeks until it
 * reaches today — 1–7 days overdue → toDate+7, 8–14 → toDate+14, …
 */
function effectiveEnd(status: string, toDate: string, today: string): string {
	if (status !== 'active' || toDate >= today) return toDate;
	const daysOverdue = daysInclusive(toDate, today) - 1;
	return addDaysIso(toDate, 7 * Math.ceil(daysOverdue / 7));
}

/**
 * Every claim on `itemIds` that occupies at least one day of [from, to].
 * `today` decides which active orders are overdue (defaults to Oslo's today).
 */
export function getClaims(
	itemIds: number[],
	from: string,
	to: string,
	options: { excludeOrderId?: number; executor?: QueryExecutor; today?: string } = {},
): Claim[] {
	if (itemIds.length === 0) return [];
	const { excludeOrderId, executor = db, today = todayIsoInOslo() } = options;

	// Active orders are kept regardless of toDate: an overdue one can end
	// before `from` and still occupy it under the weekly-extension rule.
	// Anything whose effective end still falls before `from` is dropped below.
	const rows = executor
		.select({
			orderId: orders.id,
			itemId: orderItems.itemId,
			quantity: sql<number>`coalesce(${orderItems.retrievedQuantity}, ${orderItems.requestedQuantity})`,
			status: orders.status,
			fromDate: orders.fromDate,
			toDate: orders.toDate,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(
			and(
				inArray(orderItems.itemId, itemIds),
				inArray(orders.status, [...RESERVING_STATUSES]),
				lte(orders.fromDate, to),
				or(gte(orders.toDate, from), eq(orders.status, 'active')),
			),
		)
		.all();

	const claims: Claim[] = [];
	for (const row of rows) {
		if (row.orderId === excludeOrderId || row.quantity <= 0) continue;
		const end = effectiveEnd(row.status, row.toDate, today);
		if (end < from) continue;
		claims.push({ orderId: row.orderId, itemId: row.itemId, quantity: row.quantity, start: row.fromDate, end });
	}
	return claims;
}

/** stockCount per item (missing ids are simply absent). */
export function getStockCounts(itemIds: number[], executor: QueryExecutor = db): Map<number, number> {
	if (itemIds.length === 0) return new Map();
	const rows = executor.select({ id: items.id, stockCount: items.stockCount }).from(items).where(inArray(items.id, itemIds)).all();
	return new Map(rows.map((row) => [row.id, row.stockCount]));
}

/**
 * Units occupied per day for each item over `days` days starting at `from`
 * (index 0 = `from`). Pure — takes claims, does no I/O.
 */
export function occupiedByDay(claims: Claim[], from: string, days: number): Map<number, number[]> {
	const result = new Map<number, number[]>();
	for (const claim of claims) {
		const first = Math.max(0, daysInclusive(from, claim.start) - 1);
		const last = Math.min(days - 1, daysInclusive(from, claim.end) - 1);
		if (last < first) continue;
		let perDay = result.get(claim.itemId);
		if (!perDay) {
			perDay = new Array<number>(days).fill(0);
			result.set(claim.itemId, perDay);
		}
		for (let i = first; i <= last; i++) perDay[i] += claim.quantity;
	}
	return result;
}

/**
 * Units available per day (stockCount − occupied; can go negative when
 * overbooked) for each item, over `days` days starting at `from`.
 * `days <= 0` yields an empty array per item.
 */
export function getDailyAvailability(
	itemIds: number[],
	from: string,
	days: number,
	options: AvailabilityOptions = {},
): Map<number, number[]> {
	const uniqueIds = [...new Set(itemIds)];
	if (days <= 0) return new Map(uniqueIds.map((id) => [id, []]));
	const stock = options.stock ?? getStockCounts(uniqueIds, options.executor);
	const occupied = occupiedByDay(getClaims(uniqueIds, from, addDaysIso(from, days - 1), options), from, days);
	return new Map(
		uniqueIds.map((id) => {
			const total = stock.get(id) ?? 0;
			const perDay = occupied.get(id);
			return [id, Array.from({ length: days }, (_, i) => total - (perDay?.[i] ?? 0))];
		}),
	);
}

/**
 * Units available on every single day of [from, to] — i.e. the minimum over
 * the range. An empty or reversed range (from > to) has no days, so nothing
 * is available: every item reads 0.
 */
export function getAvailableForRange(
	itemIds: number[],
	from: string,
	to: string,
	options: AvailabilityOptions = {},
): Map<number, number> {
	const daily = getDailyAvailability(itemIds, from, daysInclusive(from, to), options);
	return new Map([...daily].map(([id, perDay]) => [id, perDay.length === 0 ? 0 : Math.min(...perDay)]));
}

/**
 * Units occupied today, per item (items with nothing occupied are absent).
 * Drop-in for code computing `stockCount − occupied` itself, such as
 * src/lib/sets.ts's computeSetAvailability.
 */
export function getOccupiedToday(itemIds: number[], executor?: QueryExecutor): Map<number, number> {
	const today = todayIsoInOslo();
	const occupied = occupiedByDay(getClaims([...new Set(itemIds)], today, today, { executor, today }), today, 1);
	return new Map([...occupied].map(([id, perDay]) => [id, perDay[0]]));
}

/**
 * How many whole sets fit each day, given its components' per-day item
 * availability: the scarcest component (available / quantity per set)
 * decides. A set with no components fits zero.
 */
export function setDailyAvailability(
	components: { itemId: number; quantity: number }[],
	dailyByItem: Map<number, number[]>,
	days: number,
): number[] {
	if (components.length === 0) return new Array<number>(days).fill(0);
	return Array.from({ length: days }, (_, i) =>
		Math.max(0, Math.min(...components.map((c) => Math.floor((dailyByItem.get(c.itemId)?.[i] ?? 0) / c.quantity)))),
	);
}

// ---------------------------------------------------------------------------
// Real availability — what's physically on the shelf right now.
// ---------------------------------------------------------------------------

/**
 * Units physically out right now, per item (items with nothing out are
 * absent): every active order's coalesce(retrievedQuantity,
 * requestedQuantity), regardless of its dates — an active order has been
 * handed out and not yet returned, overdue or not. Requested/scheduled
 * orders haven't left the shelf, so they don't count here (they do in
 * scheduled availability).
 */
export function getHandedOut(itemIds: number[], executor: QueryExecutor = db): Map<number, number> {
	if (itemIds.length === 0) return new Map();
	const rows = executor
		.select({
			itemId: orderItems.itemId,
			out: sql<number>`sum(coalesce(${orderItems.retrievedQuantity}, ${orderItems.requestedQuantity}))`,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(inArray(orderItems.itemId, [...new Set(itemIds)]), eq(orders.status, 'active')))
		.groupBy(orderItems.itemId)
		.all();
	return new Map(rows.map((row) => [row.itemId, row.out]));
}

/** Units physically on the shelf right now (stockCount − handed out), per item. */
export function getRealAvailability(itemIds: number[], executor: QueryExecutor = db): Map<number, number> {
	const uniqueIds = [...new Set(itemIds)];
	const stock = getStockCounts(uniqueIds, executor);
	const out = getHandedOut(uniqueIds, executor);
	return new Map(uniqueIds.map((id) => [id, (stock.get(id) ?? 0) - (out.get(id) ?? 0)]));
}
