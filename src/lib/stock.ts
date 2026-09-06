import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { orderItems, orders } from '../db/schema';

// Shared by src/lib/shop.ts and src/lib/cart.ts. Deliberately a standalone
// duplicate of src/lib/wizard.ts's reservedQuantitiesByItem rather than an
// import from there — wizard.ts belongs to an already-merged, out-of-scope
// PR (see this PR's description for why it isn't touched or re-exported
// from). "In stock right now" is never stored: it's always stockCount minus
// quantities tied up in orders whose status still holds a claim on the item
// (requested/active).
//
// TODO(post-merge): once this PR has landed, revisit de-duplicating this
// against wizard.ts's copy (e.g. export one shared version) — the
// cross-feature scope concern above only applies while this PR is in
// flight, not after.
export async function reservedQuantitiesByItem(itemIds: number[]): Promise<Map<number, number>> {
	if (itemIds.length === 0) return new Map();
	const rows = await db
		.select({
			itemId: orderItems.itemId,
			reserved: sql<number>`sum(${orderItems.requestedQuantity})`.as('reserved'),
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(inArray(orderItems.itemId, itemIds), inArray(orders.status, ['requested', 'active'])))
		.groupBy(orderItems.itemId);
	return new Map(rows.map((row) => [row.itemId, row.reserved]));
}
