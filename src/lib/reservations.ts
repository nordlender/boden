import { inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { orderItems } from '../db/schema';

export interface Reservation {
  count: number;
  from: Date;
  to: Date;
}

// Orders that still hold a claim on the item's stock for a given window.
// requested = pending moderator confirmation but already spoken for from a
// browsing user's perspective; active = confirmed. rejected/returned don't
// occupy anything any more.
const RESERVING_STATUSES = new Set(['requested', 'active']);

// Batch-fetches upcoming reservations for a set of items in one query — used
// by both the item detail page (one item) and the cart page (one query for
// every line, instead of N+1).
export async function getUpcomingReservations(itemIds: number[]): Promise<Map<number, Reservation[]>> {
  const byItemId = new Map<number, Reservation[]>();
  if (itemIds.length === 0) return byItemId;

  const today = new Date().toISOString().slice(0, 10);

  const rows = await db.query.orderItems.findMany({
    where: inArray(orderItems.itemId, itemIds),
    with: { order: true },
  });

  for (const row of rows) {
    if (!row.reservedFrom || !row.reservedTo) continue;
    if (row.reservedTo < today) continue;
    if (!RESERVING_STATUSES.has(row.order.status)) continue;

    const list = byItemId.get(row.itemId) ?? [];
    list.push({
      count: row.requestedQuantity,
      from: new Date(row.reservedFrom),
      to: new Date(row.reservedTo),
    });
    byItemId.set(row.itemId, list);
  }

  for (const list of byItemId.values()) {
    list.sort((a, b) => a.from.getTime() - b.from.getTime());
  }

  return byItemId;
}
