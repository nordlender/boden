// Adding to the cart is deliberately allowed for anyone (no auth check
// here) — src/middleware/index.ts gates /cart itself to signed-in members,
// and checkout (src/pages/api/orders/create.ts) re-checks auth before an
// order is actually created.

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { addToCart } from '../../../lib/cart';
import { isPositiveInteger, safeRedirectTarget, withQueryParam } from '../../../lib/http';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	// The product page's quantity is a hidden input driven by its +/- stepper
	// (VariantPicker.astro), always carrying a valid value from real use — but
	// that's client-side only, so an empty/tampered value is still handled
	// here rather than trusted.
	const rawQuantity = form.get('quantity');
	const quantity = rawQuantity === null || rawQuantity === '' ? 1 : Number(rawQuantity);

	if (!isPositiveInteger(itemId) || !isPositiveInteger(quantity)) {
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

	// cartOpen is read by CartSidebar.astro's script to auto-open the sidebar
	// after the redirect lands, then stripped from the URL — see that component.
	return redirect(withQueryParam(safeRedirectTarget(form, url.origin, '/'), 'cartOpen', '1'));
};
