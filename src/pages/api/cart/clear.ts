// "Empty cart" in the cart sidebar (cartView.ts, fetched). Answers 204.
// See ./update-all.ts for why no auth check happens here.

import type { APIRoute } from 'astro';
import { wipeCart } from '../../../lib/cart';

export const POST: APIRoute = async ({ cookies }) => {
	wipeCart(cookies);
	return new Response(null, { status: 204 });
};
