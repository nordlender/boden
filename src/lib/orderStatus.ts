import { orders } from '../db/schema';

// Single home for order status constants. `orders.status` is the single
// source of truth for where an order is in its lifecycle; acceptedAt /
// rejectedAt / etc. are accountability timestamps, with one exception: orders
// accepted before 'scheduled' existed are still 'requested' with acceptedAt
// set, so the member-facing rules (memberOrderAction, rescheduleOrder) treat
// requested + acceptedAt as accepted.

export type OrderStatus = (typeof orders.$inferSelect)['status'];

export const ORDER_STATUSES = ['requested', 'scheduled', 'active', 'returned', 'rejected', 'cancelled'] as const satisfies readonly OrderStatus[];

// Statuses that still hold a claim on stock / calendar days. 'cancelled'
// (member soft-cancelled a scheduled order) is deliberately absent, so a
// cancellation frees its stock and calendar days.
export const RESERVING_STATUSES = ['requested', 'scheduled', 'active'] as const satisfies readonly OrderStatus[];

export function isOrderStatus(value: unknown): value is OrderStatus {
	return (ORDER_STATUSES as readonly unknown[]).includes(value);
}

// What a member may do to get rid of their own order (#371): hard-delete it
// while it's unreviewed, soft-cancel it once a moderator has accepted it, and
// nothing from hand-out on. Mirrors the WHERE clauses of deleteOrder and
// cancelOrder in src/lib/orders.ts, which are the actual enforcement.
export type MemberOrderAction = 'delete' | 'cancel';

export function memberOrderAction(order: { status: string; acceptedAt?: Date | null }): MemberOrderAction | null {
	if (order.status === 'requested') return order.acceptedAt ? 'cancel' : 'delete';
	if (order.status === 'scheduled') return 'cancel';
	return null;
}
