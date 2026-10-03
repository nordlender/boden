// HTML read model for CartSidebar.astro's script. Some pages that render
// the sidebar are prerendered (the shop grid, 404 — see their
// `prerender = true`), so they have no per-request access to the cart cookie
// at render time; the sidebar instead fetches this endpoint client-side
// whenever it opens and swaps the response straight into the DOM.
//
// It renders CartSidebarRows (which uses the ui/ItemLine primitive) via the
// Container API rather than returning JSON for the client to build DOM nodes
// from by hand — ItemLine is an Astro component, so it only renders
// server-side.

import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getCartItems } from '../../lib/cart';
import CartSidebarRows from '../../components/cart/CartSidebarRows.astro';

export const GET: APIRoute = async ({ cookies }) => {
	const cartItems = await getCartItems(cookies);
	const container = await AstroContainer.create();
	const html = await container.renderToString(CartSidebarRows, {
		props: { items: cartItems },
	});
	return new Response(html, {
		headers: { 'Content-Type': 'text/html' },
	});
};
