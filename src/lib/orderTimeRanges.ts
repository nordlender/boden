import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { orderTimeRanges, type OrderTimeRangeKind } from '../db/schema';
import type { QueryExecutor } from './availability';
import { normalizeTimeRanges, type NormalizeTimeRangesResult, type TimeRange } from './timeRanges';

// A member's requested pick-up (on the order's fromDate) and return (on its
// toDate) time ranges, stored in `order_time_ranges`. Synchronous with an
// optional executor, like getReservationAvailability, so callers can run
// them inside an order's db.transaction (better-sqlite3 transactions can't
// await).

export type OrderTimeRangeWriter = Pick<typeof db, 'insert' | 'delete'>;

export interface OrderTimeRanges {
	pickup: TimeRange[];
	return: TimeRange[];
}

/**
 * Replaces the order's ranges of one kind with `ranges`, validated and merged
 * by normalizeTimeRanges. Invalid input writes nothing and returns the error
 * result; it never throws for bad input. Works for both a new order and a
 * reschedule (which must replace the old dates' ranges, #368).
 */
export function setOrderTimeRanges(
	orderId: number,
	kind: OrderTimeRangeKind,
	ranges: readonly TimeRange[],
	executor: OrderTimeRangeWriter = db,
): NormalizeTimeRangesResult {
	const result = normalizeTimeRanges(ranges);
	if (!result.ok) return result;
	executor
		.delete(orderTimeRanges)
		.where(and(eq(orderTimeRanges.orderId, orderId), eq(orderTimeRanges.kind, kind)))
		.run();
	executor
		.insert(orderTimeRanges)
		.values(result.ranges.map((range) => ({ orderId, kind, from: range.from, to: range.to })))
		.run();
	return result;
}

/** The order's ranges per kind, each sorted by start. Empty arrays if none. */
export function getOrderTimeRanges(orderId: number, executor: QueryExecutor = db): OrderTimeRanges {
	const rows = executor
		.select({ kind: orderTimeRanges.kind, from: orderTimeRanges.from, to: orderTimeRanges.to })
		.from(orderTimeRanges)
		.where(eq(orderTimeRanges.orderId, orderId))
		.orderBy(asc(orderTimeRanges.from))
		.all();
	const result: OrderTimeRanges = { pickup: [], return: [] };
	for (const row of rows) result[row.kind].push({ from: row.from, to: row.to });
	return result;
}
