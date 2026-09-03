import type { APIRoute } from 'astro';
import { updateCartQuantity } from '../../../lib/cart';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	const quantity = Number(form.get('quantity'));

	if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
		return new Response('Invalid item or quantity', { status: 400 });
	}

	updateCartQuantity(cookies, itemId, quantity);

	return redirect('/cart');
};
