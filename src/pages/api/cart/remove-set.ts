export const prerender = false;

// See ./add.ts for why no auth check happens here.

import type { APIRoute } from 'astro';
import { removeSetFromCart } from '../../../lib/cart';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const setId = Number(form.get('setId'));

	if (!Number.isInteger(setId) || setId <= 0) {
		return new Response('Invalid set', { status: 400 });
	}

	removeSetFromCart(cookies, setId);
	return redirect('/cart');
};
