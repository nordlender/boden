import { db } from '../db/client';
import { items, orders, orderItems } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { CartEntry } from './cart';
import { isUniqueConstraintViolation } from './db-errors';
import { getReservationAvailability } from './reservation';

// Excludes ambiguous characters (0/O, 1/I) — an order code is read aloud by
// members to moderators and typed into the retrieve-order form; a checkout
// token isn't, but shares the alphabet for consistency.
const RANDOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRandomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += RANDOM_CODE_ALPHABET[Math.floor(Math.random() * RANDOM_CODE_ALPHABET.length)];
  }
  return code;
}

const ORDER_CODE_LENGTH = 6;
const MAX_ORDER_CODE_ATTEMPTS = 5;

export function generateOrderCode(): string {
  return generateRandomCode(ORDER_CODE_LENGTH);
}

// Shared by every order created from one checkout submission (split or
// not) — see schema.ts's orders.checkoutToken doc comment. Longer than an
// order code since it isn't read aloud, and deliberately not
// collision-checked against other rows: two different checkout submissions
// colliding is astronomically unlikely at this length, and the confirmation
// page also scopes its lookup to the signed-in user, so a collision could
// only ever surface a viewer's own past orders, never another member's.
const CHECKOUT_TOKEN_LENGTH = 10;

function generateCheckoutToken(): string {
  return generateRandomCode(CHECKOUT_TOKEN_LENGTH);
}

// Thrown by insertOrder to abort (and roll back) the transaction when an
// item's availability was re-checked at insert time and found wanting —
// caught by createOrder/createSplitOrders and turned into an `unavailable`
// result rather than a 500.
class UnavailableItemsError extends Error {
  constructor(public itemIds: number[]) {
    super('unavailable');
  }
}

export type CreateOrderInput = {
  userId: string;
  note: string | null;
  cartEntries: CartEntry[];
  fromDate: string;
  toDate: string;
};

export type CreateOrderResult =
  | { ok: true; orderId: number; orderCode: string; checkoutToken: string }
  | { ok: false; error: 'empty_cart' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] };

function insertOrder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { userId: string; note: string | null; fromDate: string; toDate: string; checkoutToken: string; entries: CartEntry[] },
) {
  // Re-check availability inside the same transaction as the insert below —
  // the live preview at POST /api/reservation/availability is advisory only
  // (the member can change dates/cart between checking and submitting, or
  // simply skip straight to submitting), so this is the actual enforcement
  // point. Doing it here rather than before the transaction closes the race
  // between two members submitting overlapping requests concurrently: the
  // check and the insert commit atomically together.
  const availabilities = getReservationAvailability(
    { from: input.fromDate, to: input.toDate },
    input.entries.map((e) => ({ itemId: e.itemId, quantity: e.quantity })),
    undefined,
    tx,
  );
  const unavailableItemIds = availabilities.filter((a) => !a.available).map((a) => a.itemId);
  if (unavailableItemIds.length > 0) {
    throw new UnavailableItemsError(unavailableItemIds);
  }

  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
    const orderCode = generateOrderCode();
    try {
      const order = tx
        .insert(orders)
        .values({
          orderCode,
          checkoutToken: input.checkoutToken,
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

  const checkoutToken = generateCheckoutToken();
  try {
    const result = db.transaction((tx) =>
      insertOrder(tx, {
        userId: input.userId,
        note: input.note,
        fromDate: input.fromDate,
        toDate: input.toDate,
        checkoutToken,
        entries: entriesToOrder,
      }),
    );
    return { ok: true, orderId: result.id, orderCode: result.orderCode, checkoutToken };
  } catch (err) {
    if (err instanceof UnavailableItemsError) {
      return { ok: false, error: 'unavailable', unavailableItemIds: err.itemIds };
    }
    throw err;
  }
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
  | { ok: true; orders: { orderId: number; orderCode: string }[]; checkoutToken: string }
  | { ok: false; error: 'empty_cart' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] };

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

  const checkoutToken = generateCheckoutToken();
  try {
    // One transaction for every group: if either group's items turn out to
    // be unavailable, the whole submission rolls back rather than leaving
    // one half of a split checkout placed and the other silently dropped.
    const created = db.transaction((tx) =>
      groups.map((entries) =>
        insertOrder(tx, {
          userId: input.userId,
          note: input.note,
          fromDate: input.fromDate,
          toDate: input.toDate,
          checkoutToken,
          entries,
        }),
      ),
    );
    return { ok: true, orders: created.map((o) => ({ orderId: o.id, orderCode: o.orderCode })), checkoutToken };
  } catch (err) {
    if (err instanceof UnavailableItemsError) {
      return { ok: false, error: 'unavailable', unavailableItemIds: err.itemIds };
    }
    throw err;
  }
}
