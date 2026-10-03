import { db } from '../db/client';

// The one "can this item be rented right now" rule, shared by the cart
// routes, getCartItems, createOrder and the moderator order view.
//
// An item is rentable when it is not archived AND it belongs to a published
// product. Items are what get rented, but the web shop only exposes them
// through their product, so an item with no product (unassigned) or whose
// product is hidden is not rentable. Stock is deliberately not part of this
// rule: shortfalls are resolved by the moderator at the confirm step.
//
// If items can later also be rentable through a rentable set, extend this
// function (and the query in findRentableItems) — callers should not need to
// change.
export interface RentableCandidate {
	archived: boolean;
	product: { status: string } | null;
}

export function isRentable(item: RentableCandidate | null | undefined): boolean {
	return !!item && !item.archived && item.product?.status === 'published';
}

// Looks up all given item ids in one query and returns only the rentable
// ones (with their product loaded). Ids that don't exist, are archived, or
// whose product isn't published are simply absent from the result.
export async function findRentableItems(itemIds: number[]) {
	if (itemIds.length === 0) return [];
	const rows = await db.query.items.findMany({
		where: (t, { inArray }) => inArray(t.id, itemIds),
		with: { product: true },
	});
	return rows.filter(isRentable);
}
