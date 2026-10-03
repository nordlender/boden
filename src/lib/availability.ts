// Single source of truth for "how many of an item are available on a day".
//
// Model: an order is a time range, and every item on it is occupied for
// every day of that range (orders.fromDate..toDate, inclusive). An item's
// availability on day D is its stockCount minus everything occupied on D.
// Nothing is stored — every number (the shop's "available today", the
// availability calendar, the reservation check, the order-insert re-check)
// is derived from the orders on the fly, so it can't drift. See
// docs/stock-model.md for the research behind this.
//
// Rules for what an order line occupies:
// - Only orders in RESERVING_STATUSES (requested/scheduled/active) count;
//   returned and rejected orders occupy nothing.
// - Quantity: coalesce(retrievedQuantity, requestedQuantity) — once a
//   moderator has handed out fewer than requested, only what actually left
//   the shelf is occupied.
// - Overdue: an active order past its toDate that hasn't been returned is
//   still physically out, so it occupies every day from fromDate onwards
//   until a moderator marks it returned — never assume it'll come back on
//   time.
//
// All queries are synchronous (`.all()`) so callers that must check
// availability atomically inside a better-sqlite3 transaction
// (src/lib/orders.ts) can pass the transaction handle as `executor`.
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { items, orderItems, orders } from '../db/schema';
import { RESERVING_STATUSES } from './orderStatus';
import { todayIsoInOslo } from './dates';

export type QueryExecutor = Pick<typeof db, 'select'>;

// Sentinel end date for an overdue order: sorts after every real date.
const OPEN_END = '9999-12-31';

export interface Claim {
	orderId: number;
	itemId: number;
	quantity: number;
	start: string; // YYYY-MM-DD, inclusive
	end: string; // YYYY-MM-DD, inclusive (OPEN_END for overdue)
}

/** Adds `days` calendar days to a YYYY-MM-DD date (UTC arithmetic, no timezone involved). */
export function addDaysIso(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Inclusive number of days from `from` to `to` (same day = 1). */
export function daysInclusive(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
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

	// toDate isn't filtered in SQL: an overdue active order can end before
	// `from` and still occupy it. Everything else is dropped below once its
	// effective end is known.
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
		.where(and(inArray(orderItems.itemId, itemIds), inArray(orders.status, [...RESERVING_STATUSES]), lte(orders.fromDate, to)))
		.all();

	const claims: Claim[] = [];
	for (const row of rows) {
		if (row.orderId === excludeOrderId || row.quantity <= 0) continue;
		const overdue = row.status === 'active' && row.toDate < today;
		const end = overdue ? OPEN_END : row.toDate;
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
		const last = claim.end === OPEN_END ? days - 1 : Math.min(days - 1, daysInclusive(from, claim.end) - 1);
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
 */
export function getDailyAvailability(
	itemIds: number[],
	from: string,
	days: number,
	options: { excludeOrderId?: number; executor?: QueryExecutor; today?: string } = {},
): Map<number, number[]> {
	const uniqueIds = [...new Set(itemIds)];
	const stock = getStockCounts(uniqueIds, options.executor);
	const occupied = occupiedByDay(getClaims(uniqueIds, from, addDaysIso(from, days - 1), options), from, days);
	return new Map(
		uniqueIds.map((id) => {
			const total = stock.get(id) ?? 0;
			const perDay = occupied.get(id);
			return [id, Array.from({ length: days }, (_, i) => total - (perDay?.[i] ?? 0))];
		}),
	);
}

/** Units available on every single day of [from, to] — i.e. the minimum over the range. */
export function getAvailableForRange(
	itemIds: number[],
	from: string,
	to: string,
	options: { excludeOrderId?: number; executor?: QueryExecutor; today?: string } = {},
): Map<number, number> {
	const daily = getDailyAvailability(itemIds, from, daysInclusive(from, to), options);
	return new Map([...daily].map(([id, perDay]) => [id, Math.min(...perDay)]));
}

/** Units available today, per item. */
export function getAvailableToday(itemIds: number[], executor?: QueryExecutor): Map<number, number> {
	const today = todayIsoInOslo();
	return getAvailableForRange(itemIds, today, today, { executor, today });
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
