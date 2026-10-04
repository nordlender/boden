// Not covered by src/middleware/index.ts's route-prefix gate (that only
// matches /cart, /checkout, /orders, /moderator, /admin — not /api/...),
// same as src/pages/api/orders/create.ts and the wizard API routes. Adding
// to the cart is deliberately allowed for anyone (no auth check here) —
// src/middleware/index.ts already gates /cart itself to signed-in members,
// and checkout (src/pages/api/orders/create.ts) re-checks auth again before
// an order is actually created.

import type { APIRoute } from 'astro';
import { addToCart } from '../../../lib/cart';
import { cartEntryRef, isCartEntryAvailable, parseCartEntryKind } from '../../../lib/cart-http';
import { isSafeRedirectTarget } from '../../../lib/redirect';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	// A product's variant picker (VariantPicker.astro) submits exactly one of
	// these, toggling which hidden input is enabled as the selected variant
	// changes between an item and a set.
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');
	// The product page's quantity is a hidden input driven by its +/- stepper
	// (VariantPicker.astro), always carrying a valid value from real use — but
	// that's client-side only, so an empty/tampered value is still handled
	// here rather than trusted.
	const rawQuantity = form.get('quantity');
	const quantity = rawQuantity === null || rawQuantity === '' ? 1 : Number(rawQuantity);
	const redirectTo = form.get('redirect');

	if (!Number.isInteger(quantity) || quantity <= 0) {
		return new Response('Invalid quantity', { status: 400 });
	}

	const kind = parseCartEntryKind(rawItemId, rawSetId);
	if (!kind) {
		return new Response('Missing item or set', { status: 400 });
	}

	const id = Number(kind === 'item' ? rawItemId : rawSetId);
	if (!Number.isInteger(id) || id <= 0) {
		return new Response(kind === 'item' ? 'Invalid item' : 'Invalid set', { status: 400 });
	}

	// A shopper can only ever reach this from a rendered product page, so an
	// id that doesn't resolve to a live, published-product row means a
	// stale/tampered request, not a normal flow to redirect through.
	if (!(await isCartEntryAvailable(kind, id))) {
		return new Response(kind === 'item' ? 'Item not available' : 'Set not available', { status: 404 });
	}

	addToCart(cookies, { ...cartEntryRef(kind, id), quantity });

	const target = isSafeRedirectTarget(redirectTo) ? redirectTo : '/';
	// Read by CartSidebar.astro's script to auto-open the sidebar after the
	// redirect lands, then stripped from the URL — see that component. Parsed
	// as a URL (against a dummy base, since target is always relative) so the
	// marker lands in the query string even when target has a #fragment.
	const url = new URL(target, 'http://internal');
	url.searchParams.set('cartOpen', '1');
	return redirect(`${url.pathname}${url.search}${url.hash}`);
};
