// Order lifecycle: requested -> active -> returned, or requested -> rejected.
// See docs/schema.md for the full lifecycle diagram.
export const ORDER_STATUSES = ['requested', 'active', 'returned', 'rejected'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Statuses where the order still holds stock against availability (i.e. not
// yet returned or rejected). Used by stock/reservation/wizard availability
// checks — keep this in sync if the lifecycle above changes.
export const ACTIVE_HOLD_STATUSES = ['requested', 'active'] as const satisfies readonly OrderStatus[];
