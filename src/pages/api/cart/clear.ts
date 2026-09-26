export const prerender = false;

// See ../add.ts for why no auth check happens here.

import type { APIRoute } from 'astro';
import { clearCart } from '../../../lib/cart';

export const POST: APIRoute = async ({ cookies, redirect }) => {
	clearCart(cookies);
	return redirect('/cart');
};
