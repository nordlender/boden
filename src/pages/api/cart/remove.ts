// See ../add.ts for why no auth check happens here.

import type { APIRoute } from 'astro';
import { removeFromCart } from '../../../lib/cart';
import { cartEntryRef, parseCartEntryKind } from '../../../lib/cart-http';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');

	const kind = parseCartEntryKind(rawItemId, rawSetId);
	if (!kind) {
		return new Response('Missing item or set', { status: 400 });
	}

	const id = Number(kind === 'item' ? rawItemId : rawSetId);
	if (!Number.isInteger(id) || id <= 0) {
		return new Response(kind === 'item' ? 'Invalid item' : 'Invalid set', { status: 400 });
	}

	removeFromCart(cookies, cartEntryRef(kind, id));
	return redirect('/cart');
};
