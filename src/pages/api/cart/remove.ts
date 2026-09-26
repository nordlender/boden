export const prerender = false;

// See ../add.ts for why no auth check happens here.

import type { APIRoute } from 'astro';
import { removeFromCart } from '../../../lib/cart';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');

	if (rawItemId !== null) {
		const itemId = Number(rawItemId);
		if (!Number.isInteger(itemId) || itemId <= 0) {
			return new Response('Invalid item', { status: 400 });
		}
		removeFromCart(cookies, { itemId });
	} else if (rawSetId !== null) {
		const setId = Number(rawSetId);
		if (!Number.isInteger(setId) || setId <= 0) {
			return new Response('Invalid set', { status: 400 });
		}
		removeFromCart(cookies, { setId });
	} else {
		return new Response('Missing item or set', { status: 400 });
	}

	return redirect('/cart');
};
