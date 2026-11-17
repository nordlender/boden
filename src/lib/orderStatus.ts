import { orders } from '../db/schema';

// Single home for order status constants. `orders.status` is the single
// source of truth for where an order is in its lifecycle; acceptedAt /
// rejectedAt / etc. are accountability timestamps only, never used for gating.

export type OrderStatus = (typeof orders.$inferSelect)['status'];

export const ORDER_STATUSES = ['requested', 'scheduled', 'active', 'returned', 'rejected', 'no_show'] as const satisfies readonly OrderStatus[];

// Human-readable status, for badges and filters.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	requested: 'Requested',
	scheduled: 'Scheduled',
	active: 'Active',
	returned: 'Returned',
	rejected: 'Rejected',
	no_show: 'No show',
};

// Statuses that still hold a claim on stock / calendar days.
export const RESERVING_STATUSES = ['requested', 'scheduled', 'active'] as const satisfies readonly OrderStatus[];

// Statuses that still need their confirmed window (orders.pickupDayId /
// returnDayId, #343), so deleting that window is refused (#369 — see
// src/lib/pickupDays.ts). A scheduled order needs both; an active one has
// been picked up, so only its return window is still ahead. Requested
// orders have no window yet; returned, rejected and no-show orders are done.
export const PICKUP_WINDOW_HOLDING_STATUSES = ['scheduled'] as const satisfies readonly OrderStatus[];
export const RETURN_WINDOW_HOLDING_STATUSES = ['scheduled', 'active'] as const satisfies readonly OrderStatus[];

// Statuses where the pick-up is still ahead of the member — the only ones
// that show pick-up time & place. A rejected order never gets one, and an
// active/returned order has already been picked up.
export function isPickupPending(status: string): boolean {
	return status === 'requested' || status === 'scheduled';
}

export function isOrderStatus(value: unknown): value is OrderStatus {
	return (ORDER_STATUSES as readonly unknown[]).includes(value);
}
