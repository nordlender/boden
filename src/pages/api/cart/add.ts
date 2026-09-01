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

	const target = typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/';
	// Read by CartSidebar.astro's script to auto-open the sidebar after the
	// redirect lands, then stripped from the URL — see that component.
	const separator = target.includes('?') ? '&' : '?';
	return redirect(`${target}${separator}cartOpen=1`);
};
