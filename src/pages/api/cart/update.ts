export const prerender = false;

// See ../add.ts for why no auth check happens here — cart mutation itself is
// unauthenticated, and gating lives at /cart (middleware) and checkout
// (src/pages/api/orders/create.ts).

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { updateCartQuantity } from '../../../lib/cart';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');
	const quantity = Number(form.get('quantity'));

	if (!Number.isInteger(quantity)) {
		return new Response('Invalid quantity', { status: 400 });
	}

	if (rawItemId !== null) {
		const itemId = Number(rawItemId);
		if (!Number.isInteger(itemId) || itemId <= 0) {
			return new Response('Invalid item', { status: 400 });
		}
		// quantity <= 0 just removes the line (see updateCartQuantity) — always
		// allowed, same as ../remove.ts, even for an item that's since been
		// archived/unpublished. A positive quantity re-validates the item the
		// same way add.ts does, so this endpoint can't be used to slip a
		// hidden-product or archived item into the cart that add.ts would have
		// rejected (updateCartQuantity happily inserts a new line for an itemId
		// that wasn't already in the cart).
		if (quantity > 0) {
			const item = await db.query.items.findFirst({
				where: (t, { eq }) => eq(t.id, itemId),
				with: { product: true },
			});
			if (!item || item.archived || item.product?.status !== 'published') {
				return new Response('Item not available', { status: 404 });
			}
		}
		updateCartQuantity(cookies, { itemId }, quantity);
	} else if (rawSetId !== null) {
		const setId = Number(rawSetId);
		if (!Number.isInteger(setId) || setId <= 0) {
			return new Response('Invalid set', { status: 400 });
		}
		if (quantity > 0) {
			const set = await db.query.sets.findFirst({
				where: (t, { eq }) => eq(t.id, setId),
				with: { product: true },
			});
			if (!set || set.archived || set.product?.status !== 'published') {
				return new Response('Set not available', { status: 404 });
			}
		}
		updateCartQuantity(cookies, { setId }, quantity);
	} else {
		return new Response('Missing item or set', { status: 400 });
	}

	return redirect('/cart');
};
