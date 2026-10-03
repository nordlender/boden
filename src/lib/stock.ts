import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { orderItems, orders } from '../db/schema';
import { RESERVING_STATUSES } from './orderStatus';

// Date-blind total of every open order's quantity, regardless of its dates.
// Only the admin tables (src/lib/wizard.ts, src/lib/setWizard.ts) still use
// this; customer-facing availability is date-aware and lives in
// src/lib/availability.ts.
export async function reservedQuantitiesByItem(itemIds: number[]): Promise<Map<number, number>> {
	if (itemIds.length === 0) return new Map();
	const rows = await db
		.select({
			itemId: orderItems.itemId,
			reserved: sql<number>`sum(${orderItems.requestedQuantity})`.as('reserved'),
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(inArray(orderItems.itemId, itemIds), inArray(orders.status, RESERVING_STATUSES)))
		.groupBy(orderItems.itemId);
	return new Map(rows.map((row) => [row.itemId, row.reserved]));
}
