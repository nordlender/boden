// See ../add.ts for why no auth check happens here — cart mutation itself is
// unauthenticated, and gating lives at /cart (middleware) and checkout
// (src/pages/api/orders/create.ts).

import type { APIRoute } from 'astro';
import { updateCartQuantity } from '../../../lib/cart';
import { cartEntryRef, isCartEntryAvailable, parseCartEntryKind } from '../../../lib/cart-http';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');
	const quantity = Number(form.get('quantity'));

	if (!Number.isInteger(quantity)) {
		return new Response('Invalid quantity', { status: 400 });
	}

	const kind = parseCartEntryKind(rawItemId, rawSetId);
	if (!kind) {
		return new Response('Missing item or set', { status: 400 });
	}

	const id = Number(kind === 'item' ? rawItemId : rawSetId);
	if (!Number.isInteger(id) || id <= 0) {
		return new Response(kind === 'item' ? 'Invalid item' : 'Invalid set', { status: 400 });
	}

	// quantity <= 0 just removes the line (see updateCartQuantity) — always
	// allowed, same as ../remove.ts, even for an item/set that's since been
	// archived/unpublished. A positive quantity re-validates it the same way
	// add.ts does, so this endpoint can't be used to slip a hidden-product or
	// archived entry into the cart that add.ts would have rejected
	// (updateCartQuantity happily inserts a new line for an id that wasn't
	// already in the cart).
	if (quantity > 0 && !(await isCartEntryAvailable(kind, id))) {
		return new Response(kind === 'item' ? 'Item not available' : 'Set not available', { status: 404 });
	}

	updateCartQuantity(cookies, cartEntryRef(kind, id), quantity);
	return redirect('/cart');
};
