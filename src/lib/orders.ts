import { db, type Tx } from '../db/client';
import { items, orders, orderItems } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { CartEntry } from './cart';
import type { Role } from './auth';
import { getValidSetIds, resolveEntriesToItemQuantities } from './sets';
import { isForeignKeyViolation, isUniqueConstraintViolation } from './db-errors';
import { getReservationAvailability, isValidDateRange } from './reservation';
import { MEMBER_CANCELLABLE_STATUS, MEMBER_DELETABLE_STATUS, type OrderStatus } from './orderStatus';
import { generateOrderCode } from './orderCode';

const MAX_ORDER_CODE_ATTEMPTS = 5;

// Thrown by insertOrder to abort (and roll back) the transaction when an
// item's availability was re-checked at insert time and found wanting —
// caught by createOrder and turned into an `unavailable`
// result rather than a 500.
class UnavailableItemsError extends Error {
  constructor(public itemIds: number[]) {
    super('unavailable');
  }
}

export type CreateOrderInput = {
  userId: string;
  // Role of the member creating the order, used to pick the order code's
  // reserved last character — see generateOrderCode.
  role: Role;
  note: string | null;
  cartEntries: CartEntry[];
  fromDate: string;
  toDate: string;
  // Snapshot of the checkout form's contact fields — see schema.ts's
  // orders.contactName/contactEmail/contactMobile doc comment.
  contactName: string;
  contactEmail: string;
  contactMobile: string | null;
  // Snapshot of the checkout form's readonly bloc-sourced fields — see
  // schema.ts's orders.hasUnpaidFees/userIsMember doc comment.
  hasUnpaidFees: boolean | null;
  userIsMember: boolean | null;
  // Whether the checkout submitter checked the liability disclaimer box —
  // see schema.ts's orders.disclaimerAcceptedAt doc comment. Required for
  // every submitter at the API layer, so real submissions always pass true.
  disclaimerAccepted: boolean;
};

export type CreateOrderResult =
  | { ok: true; orderId: number; orderCode: string }
  | { ok: false; error: 'empty_cart' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] }
  | { ok: false; error: 'user_not_found' };

function insertOrder(
  tx: Tx,
  input: {
    userId: string;
    role: Role;
    note: string | null;
    fromDate: string;
    toDate: string;
    // Always already resolved down to real items (see
    // resolveEntriesToItemQuantities) — a set never reaches this far; orders
    // always reference items, never sets (see schema.ts's `sets` comment).
    entries: { itemId: number; quantity: number }[];
    contactName: string;
    contactEmail: string;
    contactMobile: string | null;
    hasUnpaidFees: boolean | null;
    userIsMember: boolean | null;
    disclaimerAccepted: boolean;
  },
) {
  // Re-check availability inside the same transaction as the insert below —
  // the live preview at POST /api/reservation/availability is advisory only
  // (the member can change dates/cart between checking and submitting, or
  // simply skip straight to submitting), so this is the actual enforcement
  // point. Doing it here rather than before the transaction closes the race
  // between two members submitting overlapping requests concurrently: the
  // check and the insert commit atomically together.
  const availabilities = getReservationAvailability({ from: input.fromDate, to: input.toDate }, input.entries, undefined, tx);
  const unavailableItemIds = availabilities.filter((a) => !a.available).map((a) => a.itemId);
  if (unavailableItemIds.length > 0) {
    throw new UnavailableItemsError(unavailableItemIds);
  }

  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
    const orderCode = generateOrderCode(input.role);
    try {
      const order = tx
        .insert(orders)
        .values({
          orderCode,
          userId: input.userId,
          note: input.note,
          fromDate: input.fromDate,
          toDate: input.toDate,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactMobile: input.contactMobile,
          hasUnpaidFees: input.hasUnpaidFees,
          userIsMember: input.userIsMember,
          disclaimerAcceptedAt: input.disclaimerAccepted ? new Date() : null,
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

// Used by createOrder: drops cart entries pointing at items/sets that no
// longer exist or were archived — stock shortfall itself is resolved later by
// the moderator at the confirm step (see
// orderItems.retrievedQuantity), not here.
//
// Deliberately not checked here: item/set product.status. Unlike
// getCartLines (src/lib/cart.ts), this doesn't drop an entry whose product
// was unpublished after it was added to the cart — so a stale/tampered cart
// can still produce an orderItems row for it. Accepted for now rather than
// fixed here: the not-yet-built moderator hand-out flow is expected to (a)
// warn when an order contains an item that's since become
// archived/unpublished, and (b) let the moderator hand out only a subset of
// an order's items, so they can simply decline to hand out that one instead
// of it being a hard failure. See the moderator-workflow-deferred memory.
async function resolveOrderableEntries(cartEntries: CartEntry[]): Promise<CartEntry[]> {
  const itemIds = cartEntries.filter((e): e is { itemId: number; quantity: number } => 'itemId' in e).map((e) => e.itemId);
  const setIds = cartEntries.filter((e): e is { setId: number; quantity: number } => 'setId' in e).map((e) => e.setId);

  const validItems = itemIds.length
    ? await db
        .select({ id: items.id })
        .from(items)
        .where(and(inArray(items.id, itemIds), eq(items.archived, false)))
    : [];
  const validItemIds = new Set(validItems.map((i) => i.id));
  const validSetIds = await getValidSetIds(setIds);

  return cartEntries.filter((e) => ('itemId' in e ? validItemIds.has(e.itemId) : validSetIds.has(e.setId)));
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const entriesToOrder = await resolveOrderableEntries(input.cartEntries);
  if (entriesToOrder.length === 0) {
    return { ok: false, error: 'empty_cart' };
  }
  // Expand any set entries into their component items and merge everything
  // down to one summed quantity per itemId — see sets.ts's
  // resolveEntriesToItemQuantities. orderItems always references items,
  // never sets (schema.ts's `sets` comment) — this is the one place that
  // resolution happens for a real checkout.
  const resolvedEntries = await resolveEntriesToItemQuantities(entriesToOrder);
  if (resolvedEntries.length === 0) {
    return { ok: false, error: 'empty_cart' };
  }

  try {
    const result = db.transaction((tx) =>
      insertOrder(tx, {
        userId: input.userId,
        role: input.role,
        note: input.note,
        fromDate: input.fromDate,
        toDate: input.toDate,
        entries: resolvedEntries,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactMobile: input.contactMobile,
        hasUnpaidFees: input.hasUnpaidFees,
        userIsMember: input.userIsMember,
        disclaimerAccepted: input.disclaimerAccepted,
      }),
    );
    return { ok: true, orderId: result.id, orderCode: result.orderCode };
  } catch (err) {
    if (err instanceof UnavailableItemsError) {
      return { ok: false, error: 'unavailable', unavailableItemIds: err.itemIds };
    }
    // orders.userId is a FK sourced from the checkout route's ambient
    // session id (locals.user!.id) rather than a freshly-looked-up row —
    // same defensive-only case as moderatorOrders.ts's confirmRetrieval.
    if (isForeignKeyViolation(err)) {
      return { ok: false, error: 'user_not_found' };
    }
    throw err;
  }
}

// Follow-up read for deleteOrder/cancelOrder when their guarded write matched
// nothing — disambiguates not-found/not-owned (null → 404) from
// exists-but-wrong-status (the current status → 409).
async function findOwnedOrderStatus(input: { orderCode: string; userId: string }) {
  const existing = await db.query.orders.findFirst({
    where: (t, { eq: eqCol }) => eqCol(t.orderCode, input.orderCode),
    columns: { userId: true, status: true },
  });
  return existing?.userId === input.userId ? existing.status : null;
}

// Row shape rendered by OrdersTable.astro — shared by the member, admin and
// moderator order lists.
export interface OrderRow {
  orderCode: string;
  status: OrderStatus;
  fromDate: string;
  toDate: string;
  // Left out on the member's own list (/orders), where it would only repeat
  // their own name — OrdersTable then drops the customer column.
  customerName?: string;
  items: { itemName: string; requestedQuantity: number }[];
}

type OrderRowSource = Pick<OrderRow, 'orderCode' | 'status' | 'fromDate' | 'toDate'> & {
  contactName: string;
  user?: { name: string | null } | null;
  orderItems: { requestedQuantity: number; item: { name: string } }[];
};

// `withCustomer: false` leaves customerName out — for the member's own list,
// where it would only repeat their own name.
export function toOrderRow(order: OrderRowSource, { withCustomer = true }: { withCustomer?: boolean } = {}): OrderRow {
  return {
    orderCode: order.orderCode,
    status: order.status,
    fromDate: order.fromDate,
    toDate: order.toDate,
    // users.name is nullable (set from the external OAuth provider) — fall
    // back to the checkout-time contact name snapshot.
    ...(withCustomer && { customerName: order.user?.name || order.contactName }),
    items: order.orderItems.map((oi) => ({
      itemName: oi.item.name,
      requestedQuantity: oi.requestedQuantity,
    })),
  };
}

export async function getMemberOrderRows(userId: string): Promise<OrderRow[]> {
  const memberOrders = await db.query.orders.findMany({
    where: (t, { eq: eqCol }) => eqCol(t.userId, userId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    with: { orderItems: { with: { item: true } } },
  });
  return memberOrders.map((order) => toOrderRow(order, { withCustomer: false }));
}

export interface PendingRequestRow extends OrderRow {
	id: number;
}

// Every member's orders, most recent first, optionally filtered by status —
// the admin's all-orders list.
export async function getAllOrderRows(status: OrderStatus | null = null): Promise<OrderRow[]> {
	const allOrders = await db.query.orders.findMany({
		where: status ? (t, { eq: eqCol }) => eqCol(t.status, status) : undefined,
		orderBy: (t, { desc }) => [desc(t.createdAt)],
		with: { user: true, orderItems: { with: { item: true } } },
	});
	return allOrders.map((order) => toOrderRow(order));
}

// Shared by src/pages/moderator/requests.astro (the full queue) and
// src/pages/moderator/index.astro (the hub's upcoming-requests preview) —
// same pending-review query and OrdersTable-row shape, so both stay in
// sync rather than drifting from two copies of this query.
export async function getPendingRequestRows(): Promise<PendingRequestRow[]> {
	const pendingOrders = await db.query.orders.findMany({
		where: (t, { eq: eqCol }) => eqCol(t.status, 'requested'),
		// Earliest submitted first (first come, first served); id breaks
		// ties since createdAt only has one-second resolution.
		orderBy: (t, { asc: ascCol }) => [ascCol(t.createdAt), ascCol(t.id)],
		with: { user: true, orderItems: { with: { item: true } } },
	});

	return pendingOrders.map((order) => ({ id: order.id, ...toOrderRow(order) }));
}

// Ownership is part of the WHERE clause, so another member's order code
// resolves to undefined exactly like a nonexistent one — callers can't leak it.
export async function getMemberOrder(orderCode: string, userId: string) {
  if (!orderCode || !userId) return undefined;
  return db.query.orders.findFirst({
    where: (t, { eq: eqCol }) => and(eqCol(t.orderCode, orderCode), eqCol(t.userId, userId)),
    // product + attributeValues feed toOrderItemView (src/lib/orderItemView.ts).
    with: {
      orderItems: {
        with: { item: { with: { product: true, attributeValues: { with: { attribute: true } } } } },
      },
    },
  });
}

export type DeleteOrderInput = { orderCode: string; userId: string };

export type DeleteOrderResult =
  | { ok: true }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'not_deletable'; status: string };

// Hard delete — only ever offered to a member while their order is still
// 'requested' (not yet reviewed; memberOrderAction in orderStatus.ts). Once a
// moderator accepts it, acceptOrder (src/lib/moderatorOrders.ts) moves it to
// 'scheduled', and from then on the member can only soft-cancel it (see
// cancelOrder below), never delete it.
// Ownership and status are filtered directly in the DELETE's WHERE clause
// rather than checked beforehand, so there's no gap for a moderator action
// to land between an ownership/status check and the delete itself.
// orderItems rows cascade automatically (onDelete: 'cascade' on the FK).
export async function deleteOrder(input: DeleteOrderInput): Promise<DeleteOrderResult> {
  const result = db
    .delete(orders)
    .where(and(eq(orders.orderCode, input.orderCode), eq(orders.userId, input.userId), eq(orders.status, MEMBER_DELETABLE_STATUS)))
    .run();

  if (result.changes > 0) {
    return { ok: true };
  }

  const status = await findOwnedOrderStatus(input);
  if (status === null) {
    return { ok: false, error: 'not_found' };
  }
  return { ok: false, error: 'not_deletable', status };
}

export type CancelOrderInput = { orderCode: string; userId: string };

export type CancelOrderResult =
  | { ok: true }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'not_cancellable'; status: string };

// Soft cancel — only ever offered to a member while their order is
// 'scheduled' (accepted by a moderator, not yet handed out). The row is kept
// with status 'cancelled' rather than deleted because a moderator has already
// committed a pick-up window for it: a moderator who looks the order up by
// code on /moderator/retrieve sees that the member cancelled it (#371).
// 'cancelled' isn't in RESERVING_STATUSES, so its stock and calendar days are
// freed. Ownership and status = 'scheduled' are filtered in the UPDATE's
// WHERE clause — same pattern as deleteOrder — so this can't race a
// moderator's hand-out (confirmRetrieval moves 'scheduled' to 'active').
export async function cancelOrder(input: CancelOrderInput): Promise<CancelOrderResult> {
  const result = db
    .update(orders)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(and(eq(orders.orderCode, input.orderCode), eq(orders.userId, input.userId), eq(orders.status, MEMBER_CANCELLABLE_STATUS)))
    .run();

  if (result.changes > 0) {
    return { ok: true };
  }

  const status = await findOwnedOrderStatus(input);
  if (status === null) {
    return { ok: false, error: 'not_found' };
  }
  return { ok: false, error: 'not_cancellable', status };
}

export type RescheduleOrderInput = { orderCode: string; userId: string; fromDate: string; toDate: string };

export type RescheduleOrderResult =
  | { ok: true; fromDate: string; toDate: string }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'not_modifiable'; status: string }
  | { ok: false; error: 'invalid_dates' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] };

// Thrown inside the transaction below when the order's status changed to
// something other than 'requested' between the pre-check and the write
// (e.g. a moderator action landing mid-request) — caught outside and turned
// into a 'not_modifiable' result rather than a 500.
class OrderNotModifiableError extends Error {
  constructor(public status: string) {
    super('not_modifiable');
  }
}

// Thrown inside the transaction below when the order was deleted (see
// deleteOrder) between the pre-check and the write — distinct from
// OrderNotModifiableError so this doesn't get reported back as a stale
// 'requested' status for an order that no longer exists.
class OrderGoneError extends Error {
  constructor() {
    super('not_found');
  }
}

// Only ever offered to a member while their order is still 'requested' (not
// yet accepted — acceptOrder moves it to 'scheduled'), since rescheduling an
// accepted order would silently carry the acceptance over to dates the
// moderator never reviewed (#242). Reuses getReservationAvailability's
// `excludeOrderId` param so the order's own current reservation doesn't
// count against itself when checking the new date range.
export async function rescheduleOrder(input: RescheduleOrderInput): Promise<RescheduleOrderResult> {
  if (!isValidDateRange({ from: input.fromDate, to: input.toDate })) {
    return { ok: false, error: 'invalid_dates' };
  }

  const order = await db.query.orders.findFirst({
    where: (t, { eq: eqCol }) => eqCol(t.orderCode, input.orderCode),
    with: { orderItems: true },
  });
  if (!order || order.userId !== input.userId) {
    return { ok: false, error: 'not_found' };
  }
  if (order.status !== 'requested') {
    return { ok: false, error: 'not_modifiable', status: order.status };
  }

  try {
    // Re-check status and availability inside the same transaction as the
    // update, same pattern as insertOrder — the caller-facing check above is
    // advisory only; this is the actual enforcement point against a
    // concurrent moderator action or a competing reservation.
    db.transaction((tx) => {
      const current = tx.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).get();
      if (!current) {
        throw new OrderGoneError();
      }
      if (current.status !== 'requested') {
        throw new OrderNotModifiableError(current.status);
      }

      const availabilities = getReservationAvailability(
        { from: input.fromDate, to: input.toDate },
        order.orderItems.map((oi) => ({ itemId: oi.itemId, quantity: oi.requestedQuantity })),
        order.id,
        tx,
      );
      const unavailableItemIds = availabilities.filter((a) => !a.available).map((a) => a.itemId);
      if (unavailableItemIds.length > 0) {
        throw new UnavailableItemsError(unavailableItemIds);
      }

      tx.update(orders).set({ fromDate: input.fromDate, toDate: input.toDate }).where(eq(orders.id, order.id)).run();
    });
  } catch (err) {
    if (err instanceof UnavailableItemsError) {
      return { ok: false, error: 'unavailable', unavailableItemIds: err.itemIds };
    }
    if (err instanceof OrderNotModifiableError) {
      return { ok: false, error: 'not_modifiable', status: err.status };
    }
    if (err instanceof OrderGoneError) {
      return { ok: false, error: 'not_found' };
    }
    throw err;
  }

  return { ok: true, fromDate: input.fromDate, toDate: input.toDate };
}
