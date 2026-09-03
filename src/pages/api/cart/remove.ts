import type { APIRoute } from 'astro';
import { removeFromCart } from '../../../lib/cart';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));

	if (!Number.isInteger(itemId) || itemId <= 0) {
		return new Response('Invalid item', { status: 400 });
	}

	removeFromCart(cookies, itemId);

	return redirect('/cart');
};
