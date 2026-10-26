// Bulk counterpart of ./update.ts for the cart sidebar's single "Update cart"
// button: every `quantity_<itemId>` / `quantity_set_<setId>` field is applied
// at once, and 0 removes the line. Same availability rules as update.ts,
// except a line whose quantity hasn't changed is left alone — so an item or
// set that's since been archived can't block the rest of the update.

import type { APIRoute } from 'astro';
import { entryKey, getCart, updateCartQuantity } from '../../../lib/cart';
import { cartEntryRef, isCartEntryAvailable, type CartEntryKind } from '../../../lib/cart-http';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const current = new Map(getCart(cookies).map((entry) => [entryKey(entry), entry.quantity]));
	const updates: { kind: CartEntryKind; id: number; quantity: number }[] = [];

	for (const [field, value] of form.entries()) {
		const match = /^quantity_(set_)?(\d+)$/.exec(field);
		if (!match) continue;
		const kind: CartEntryKind = match[1] ? 'set' : 'item';
		const id = Number(match[2]);
		const quantity = Number(value);
		if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(quantity)) {
			return new Response('Invalid item or quantity', { status: 400 });
		}
		if (current.get(entryKey(cartEntryRef(kind, id))) !== quantity) updates.push({ kind, id, quantity });
	}

	for (const { kind, id, quantity } of updates) {
		if (quantity > 0 && !(await isCartEntryAvailable(kind, id))) {
			return new Response(kind === 'item' ? 'Item not available' : 'Set not available', { status: 404 });
		}
	}

	for (const { kind, id, quantity } of updates) updateCartQuantity(cookies, cartEntryRef(kind, id), quantity);
	return redirect('/reservation');
};
