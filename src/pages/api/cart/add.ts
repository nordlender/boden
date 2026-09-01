import type { APIRoute } from 'astro';
import { addToCart } from '../../../lib/cart';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	const quantity = Number(form.get('quantity')) || 1;
	const redirectTo = form.get('redirect');

	if (!Number.isInteger(itemId) || itemId <= 0 || quantity <= 0) {
		return new Response('Invalid item or quantity', { status: 400 });
	}

	addToCart(cookies, itemId, quantity);

	return redirect(typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/');
};
