export const prerender = false;

// Adding to the cart is deliberately allowed for anyone (no auth check here) —
// src/middleware/index.ts already gates /cart itself to signed-in members,
// and checkout (src/pages/api/orders/create.ts) re-checks auth again before
// an order is actually created.

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { addToCart } from '../../../lib/cart';
import { safeRedirectTarget } from '../../../lib/http';

export const POST: APIRoute = async ({ request, cookies, redirect, url: requestUrl }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	// The product page's quantity is a hidden input driven by its +/- stepper
	// (VariantPicker.astro), always carrying a valid value from real use — but
	// that's client-side only, so an empty/tampered value is still handled
	// here rather than trusted.
	const rawQuantity = form.get('quantity');
	const quantity = rawQuantity === null || rawQuantity === '' ? 1 : Number(rawQuantity);

	if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
		return new Response('Invalid item or quantity', { status: 400 });
	}

	// A shopper can only ever reach this from a rendered product page, so an
	// itemId that doesn't resolve to a live, published-product item means a
	// stale/tampered request, not a normal flow to redirect through.
	const item = await db.query.items.findFirst({
		where: (t, { eq }) => eq(t.id, itemId),
		with: { product: true },
	});
	if (!item || item.archived || item.product?.status !== 'published') {
		return new Response('Item not available', { status: 404 });
	}

	addToCart(cookies, itemId, quantity);

	const target = safeRedirectTarget(form, requestUrl.origin, '/');
	// Read by CartSidebar.astro's script to auto-open the sidebar after the
	// redirect lands, then stripped from the URL — see that component. Parsed
	// as a URL (against a dummy base, since target is always relative) so the
	// marker lands in the query string even when target has a #fragment.
	const url = new URL(target, 'https://internal');
	url.searchParams.set('cartOpen', '1');
	return redirect(`${url.pathname}${url.search}${url.hash}`);
};
