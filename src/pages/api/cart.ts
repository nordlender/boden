import type { APIRoute } from 'astro';
import { getCartItems } from '../../lib/cart';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
	const cartItems = await getCartItems(cookies);
	return new Response(JSON.stringify(cartItems), {
		headers: { 'Content-Type': 'application/json' },
	});
};
