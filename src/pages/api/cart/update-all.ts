export const prerender = false;

// Bulk counterpart of ./update.ts for the cart sidebar's single "Update cart"
// button: every `quantity_<itemId>` field is applied at once, and 0 removes
// the line. Same availability rules as update.ts, except a line whose
// quantity hasn't changed is left alone — so an item that's since been
// archived can't block the rest of the update.

import type { APIRoute } from 'astro';
import { getCart, updateCartQuantity } from '../../../lib/cart';
import { findRentableItems } from '../../../lib/rentable';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const current = new Map(getCart(cookies).map((e) => [e.itemId, e.quantity]));
	const updates: { itemId: number; quantity: number }[] = [];

	for (const [key, value] of form.entries()) {
		const match = /^quantity_(\d+)$/.exec(key);
		if (!match) continue;
		const itemId = Number(match[1]);
		const quantity = Number(value);
		if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(quantity)) {
			return new Response('Invalid item or quantity', { status: 400 });
		}
		if (current.get(itemId) !== quantity) updates.push({ itemId, quantity });
	}

	const idsToCheck = updates.filter((u) => u.quantity > 0).map((u) => u.itemId);
	const rentableIds = new Set((await findRentableItems(idsToCheck)).map((i) => i.id));
	if (idsToCheck.some((id) => !rentableIds.has(id))) {
		return new Response('Item not available', { status: 404 });
	}

	for (const { itemId, quantity } of updates) updateCartQuantity(cookies, itemId, quantity);
	return redirect('/cart');
};
