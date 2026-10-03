import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { orderItems, orders } from '../db/schema';
import { RESERVING_STATUSES, type OrderStatus } from './orderStatus';

// Shared by src/lib/shop.ts, src/lib/cart.ts, and src/lib/wizard.ts. "In
// stock right now" is never stored: it's always stockCount minus quantities
// tied up in orders whose status still holds a claim on the item
// (requested/scheduled/active). Pass `statuses` to narrow which orders count
// (e.g. wizard.ts's "Reserved" column: only not-yet-handed-out orders).
export async function reservedQuantitiesByItem(
	itemIds: number[],
	statuses: readonly OrderStatus[] = RESERVING_STATUSES,
): Promise<Map<number, number>> {
	if (itemIds.length === 0) return new Map();
	const rows = await db
		.select({
			itemId: orderItems.itemId,
			reserved: sql<number>`sum(${orderItems.requestedQuantity})`.as('reserved'),
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(inArray(orderItems.itemId, itemIds), inArray(orders.status, statuses)))
		.groupBy(orderItems.itemId);
	return new Map(rows.map((row) => [row.itemId, row.reserved]));
}

// Quantities physically out of the building right now: lines on 'active'
// orders (a moderator confirmed retrieval). Uses retrievedQuantity, since a
// moderator may hand out fewer than requested; falls back to
// requestedQuantity for rows that predate retrievedQuantity being set.
// Future requested/scheduled orders are deliberately excluded — this backs
// the admin's "current stock" view, not date-range availability (that's
// src/lib/reservation.ts).
export async function checkedOutQuantitiesByItem(itemIds: number[]): Promise<Map<number, number>> {
	if (itemIds.length === 0) return new Map();
	const rows = await db
		.select({
			itemId: orderItems.itemId,
			checkedOut: sql<number>`sum(coalesce(${orderItems.retrievedQuantity}, ${orderItems.requestedQuantity}))`.as('checked_out'),
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(inArray(orderItems.itemId, itemIds), eq(orders.status, 'active')))
		.groupBy(orderItems.itemId);
	return new Map(rows.map((row) => [row.itemId, row.checkedOut]));
}
