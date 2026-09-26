export const prerender = false;

// JSON read model for CartSidebar.astro's script. The catalogue/product
// pages that render the sidebar are prerendered (static output — see
// astro.config.mjs), so they have no per-request access to the cart cookie
// at render time; the sidebar instead fetches this endpoint client-side
// whenever it opens.

import type { APIRoute } from 'astro';
import { getCartLines } from '../../lib/cart';

export const GET: APIRoute = async ({ cookies }) => {
	const cartLines = await getCartLines(cookies);
	return new Response(JSON.stringify(cartLines), {
		headers: { 'Content-Type': 'application/json' },
	});
};
