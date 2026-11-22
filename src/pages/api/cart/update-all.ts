// "Update cart" on any editable cart page (cartView.ts, fetched): every
// `quantity_<itemId>` / `quantity_set_<setId>` field (CartLineRow.astro) is
// applied at once, and 0 removes the line. A line whose quantity hasn't
// changed is left alone, so an item or set that's since been archived
// can't block the rest of the update. Answers 204, or 400/404 with nothing
// changed.
//
// No auth check: the cart is anyone's own cookie; ordering
// (/api/orders/create) is what requires a signed-in member.

import type { APIRoute } from 'astro';
import { getCart, setCartQuantities } from '../../../lib/cart';
import { entryKey } from '../../../lib/cartEntries';
import { cartEntryRef, isCartEntryAvailable, type CartEntryKind } from '../../../lib/cart-http';

export const POST: APIRoute = async ({ request, cookies }) => {
	const form = await request.formData();
	const current = new Map(getCart(cookies).entries.map((entry) => [entryKey(entry), entry.quantity]));
	const updates: { kind: CartEntryKind; id: number; quantity: number }[] = [];

	for (const [field, value] of form.entries()) {
		const match = /^quantity_(set_)?(\d+)$/.exec(field);
		if (!match) continue;
		const kind: CartEntryKind = match[1] ? 'set' : 'item';
		const id = Number(match[2]);
		const quantity = Number(value);
		if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(quantity)) {
			return new Response('Invalid item or quantity', { status: 400 });
		}
		if (current.get(entryKey(cartEntryRef(kind, id))) !== quantity) updates.push({ kind, id, quantity });
	}

	for (const { kind, id, quantity } of updates) {
		if (quantity > 0 && !(await isCartEntryAvailable(kind, id))) {
			return new Response(kind === 'item' ? 'Item not available' : 'Set not available', { status: 404 });
		}
	}

	setCartQuantities(
		cookies,
		updates.map(({ kind, id, quantity }) => ({ ref: cartEntryRef(kind, id), quantity })),
	);
	return new Response(null, { status: 204 });
};
