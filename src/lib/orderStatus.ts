import { orders } from '../db/schema';

// Single home for order status constants. `orders.status` is the single
// source of truth for where an order is in its lifecycle; acceptedAt /
// rejectedAt / etc. are accountability timestamps only, never used for gating.

export type OrderStatus = (typeof orders.$inferSelect)['status'];

export const ORDER_STATUSES = ['requested', 'scheduled', 'active', 'returned', 'rejected'] as const satisfies readonly OrderStatus[];

// Statuses that still hold a claim on stock / calendar days.
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
