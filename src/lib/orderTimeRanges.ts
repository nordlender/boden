import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { orderTimeRanges, type OrderTimeRangeKind } from '../db/schema';
import type { QueryExecutor } from './availability';
import { normalizeErrorDetail, normalizeTimeRanges, type NormalizeTimeRangesResult, type OrderTimeRangeError, type TimeRange } from './timeRanges';

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
 * Thrown by setOrderTimeRanges when the ranges don't normalize. Callers
 * validate first (validateOrderTimeRanges), so this only fires if the two
 * drift apart — and because it throws, the surrounding order transaction
 * rolls back instead of committing an order with no (or stale) ranges.
 */
export class InvalidTimeRangesError extends Error {
	readonly detail: OrderTimeRangeError;
	constructor(kind: OrderTimeRangeKind, result: Extract<NormalizeTimeRangesResult, { ok: false }>) {
		super(`invalid ${kind} time ranges: ${result.error}`);
		this.detail = normalizeErrorDetail(kind, result);
	}
}

/**
 * Replaces the order's ranges of one kind with `ranges`, validated and merged
 * by normalizeTimeRanges, and returns the merged ranges it stored. Works for
 * both a new order and a reschedule (which must replace the old dates'
 * ranges, #368). Invalid input writes nothing and throws
 * InvalidTimeRangesError, so run it inside the order's transaction.
 */
export function setOrderTimeRanges(
	orderId: number,
	kind: OrderTimeRangeKind,
	ranges: readonly TimeRange[],
	executor: OrderTimeRangeWriter = db,
): TimeRange[] {
	const result = normalizeTimeRanges(ranges);
	if (!result.ok) throw new InvalidTimeRangesError(kind, result);
	executor
		.delete(orderTimeRanges)
		.where(and(eq(orderTimeRanges.orderId, orderId), eq(orderTimeRanges.kind, kind)))
		.run();
	executor
		.insert(orderTimeRanges)
		.values(result.ranges.map((range) => ({ orderId, kind, from: range.from, to: range.to })))
		.run();
	return result.ranges;
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
