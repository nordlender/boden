import { orders } from '../db/schema';

// Single home for order status constants. `orders.status` is the single
// source of truth for where an order is in its lifecycle; acceptedAt /
// rejectedAt / etc. are accountability timestamps only, never used for gating.

export type OrderStatus = (typeof orders.$inferSelect)['status'];

export const ORDER_STATUSES = ['requested', 'scheduled', 'active', 'returned', 'rejected', 'cancelled'] as const satisfies readonly OrderStatus[];

// Statuses that still hold a claim on stock / calendar days. 'cancelled'
// (member soft-cancelled a scheduled order) is deliberately absent, so a
// cancellation frees its stock and calendar days.
export const RESERVING_STATUSES = ['requested', 'scheduled', 'active'] as const satisfies readonly OrderStatus[];

// Statuses where the pick-up is still ahead of the member — the only ones
// that show pick-up time & place. A rejected order never gets one, and an
// active/returned order has already been picked up.
export function isPickupPending(status: string): boolean {
	return status === 'requested' || status === 'scheduled';
}

export function isOrderStatus(value: unknown): value is OrderStatus {
	return (ORDER_STATUSES as readonly unknown[]).includes(value);
}

// What a member may do to get rid of their own order (#371): hard-delete it
// while it's unreviewed, soft-cancel it once a moderator has accepted it, and
// nothing from hand-out on. These constants are also the WHERE clauses of
// deleteOrder and cancelOrder in src/lib/orders.ts (the actual enforcement),
// so the UI and the API can't drift apart.
export const MEMBER_DELETABLE_STATUS = 'requested' as const satisfies OrderStatus;
export const MEMBER_CANCELLABLE_STATUS = 'scheduled' as const satisfies OrderStatus;

export type MemberOrderAction = 'delete' | 'cancel';

export function memberOrderAction(status: string): MemberOrderAction | null {
	if (status === MEMBER_DELETABLE_STATUS) return 'delete';
	if (status === MEMBER_CANCELLABLE_STATUS) return 'cancel';
	return null;
}
