import { db } from '../db/client';
import { items, orders, orderItems } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { CartEntry } from './cart';
import { isUniqueConstraintViolation } from './db-errors';

// Excludes ambiguous characters (0/O, 1/I) — this code is read aloud by
// members to moderators and typed into the retrieve-order form.
const ORDER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ORDER_CODE_LENGTH = 6;
const MAX_ORDER_CODE_ATTEMPTS = 5;

export function generateOrderCode(): string {
  let code = '';
  for (let i = 0; i < ORDER_CODE_LENGTH; i++) {
    code += ORDER_CODE_ALPHABET[Math.floor(Math.random() * ORDER_CODE_ALPHABET.length)];
  }
  return code;
}

export type CreateOrderInput = {
  userId: string;
  note: string | null;
  cartEntries: CartEntry[];
  fromDate: string;
  toDate: string;
};

export type CreateOrderResult =
  | { ok: true; orderId: number; orderCode: string }
  | { ok: false; error: 'empty_cart' };

function insertOrder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { userId: string; note: string | null; fromDate: string; toDate: string; entries: CartEntry[] },
) {
  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
    const orderCode = generateOrderCode();
    try {
      const order = tx
        .insert(orders)
        .values({
          orderCode,
          userId: input.userId,
          note: input.note,
          fromDate: input.fromDate,
          toDate: input.toDate,
        })
        .returning({ id: orders.id, orderCode: orders.orderCode })
        .get();

      tx.insert(orderItems)
        .values(
          input.entries.map((e) => ({
            orderId: order.id,
            itemId: e.itemId,
            requestedQuantity: e.quantity,
          })),
        )
        .run();

      return order;
    } catch (err) {
      if (!isUniqueConstraintViolation(err) || attempt === MAX_ORDER_CODE_ATTEMPTS - 1) {
        throw err;
      }
    }
  }
  // Unreachable: the loop above either returns or rethrows on its last attempt.
  throw new Error('Failed to generate a unique order code');
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const itemIds = input.cartEntries.map((e) => e.itemId);
  const validItems = itemIds.length
    ? await db
        .select({ id: items.id })
        .from(items)
        .where(and(inArray(items.id, itemIds), eq(items.archived, false)))
    : [];
  const validItemIds = new Set(validItems.map((i) => i.id));

  // Drop entries pointing at items that no longer exist or were archived —
  // stock shortfall itself is resolved later by the moderator at the confirm
  // step (see orderItems.retrievedQuantity), not here.
  //
  // Deliberately not checked here: item.product.status. Unlike
  // getCartItems (src/lib/cart.ts), this doesn't drop an entry whose product
  // was unpublished after it was added to the cart — so a stale/tampered
  // cart can still produce an orderItems row for it. Accepted for now rather
  // than fixed here: the not-yet-built moderator hand-out flow is expected to
  // (a) warn when an order contains an item that's since become
  // archived/unpublished, and (b) let the moderator hand out only a subset of
  // an order's items, so they can simply decline to hand out that one instead
  // of it being a hard failure. See the moderator-workflow-deferred memory.
  const entriesToOrder = input.cartEntries.filter((e) => validItemIds.has(e.itemId));
  if (entriesToOrder.length === 0) {
    return { ok: false, error: 'empty_cart' };
  }

  const result = db.transaction((tx) =>
    insertOrder(tx, {
      userId: input.userId,
      note: input.note,
      fromDate: input.fromDate,
      toDate: input.toDate,
      entries: entriesToOrder,
    }),
  );
  return { ok: true, orderId: result.id, orderCode: result.orderCode };
}

export type CreateSplitOrdersInput = {
  userId: string;
  note: string | null;
  cartEntries: CartEntry[];
  fromDate: string;
  toDate: string;
  // itemIds the member chose to move into their own order via the
  // reservation page's split-order action — see TASKS.md's Reservation
  // section on why this isn't offered for a line requesting more than one of
  // the same item.
  splitItemIds: number[];
};

export type CreateSplitOrdersResult =
  | { ok: true; orders: { orderId: number; orderCode: string }[] }
  | { ok: false; error: 'empty_cart' };

// Same validation/entry-filtering as createOrder, but partitions the
// resulting entries into up to two orders sharing the same date range: one
// for the split-out items, one for the rest. Falls back to a single order
// when nothing (or everything) was split — e.g. splitItemIds is empty, or
// names every item still in the cart.
export async function createSplitOrders(input: CreateSplitOrdersInput): Promise<CreateSplitOrdersResult> {
  const itemIds = input.cartEntries.map((e) => e.itemId);
  const validItems = itemIds.length
    ? await db
        .select({ id: items.id })
        .from(items)
        .where(and(inArray(items.id, itemIds), eq(items.archived, false)))
    : [];
  const validItemIds = new Set(validItems.map((i) => i.id));
  const entriesToOrder = input.cartEntries.filter((e) => validItemIds.has(e.itemId));
  if (entriesToOrder.length === 0) {
    return { ok: false, error: 'empty_cart' };
  }

  const splitIds = new Set(input.splitItemIds);
  const splitGroup = entriesToOrder.filter((e) => splitIds.has(e.itemId));
  const mainGroup = entriesToOrder.filter((e) => !splitIds.has(e.itemId));
  const groups = [mainGroup, splitGroup].filter((g) => g.length > 0);

  const created = db.transaction((tx) =>
    groups.map((entries) =>
      insertOrder(tx, { userId: input.userId, note: input.note, fromDate: input.fromDate, toDate: input.toDate, entries }),
    ),
  );

  return { ok: true, orders: created.map((o) => ({ orderId: o.id, orderCode: o.orderCode })) };
}
