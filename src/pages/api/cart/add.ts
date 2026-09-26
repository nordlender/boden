export const prerender = false;

// Not covered by src/middleware/index.ts's route-prefix gate (that only
// matches /cart, /checkout, /orders, /moderator, /admin — not /api/...),
// same as src/pages/api/orders/create.ts and the wizard API routes. Adding
// to the cart is deliberately allowed for anyone (no auth check here) —
// src/middleware/index.ts already gates /cart itself to signed-in members,
// and checkout (src/pages/api/orders/create.ts) re-checks auth again before
// an order is actually created.

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { addToCart } from '../../../lib/cart';
import { isSafeRedirectTarget } from '../../../lib/redirect';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	// A product's variant picker submits exactly one of these — see
	// src/pages/products/[slug].astro, which names its option values
	// `item:<id>` / `set:<id>` and splits them apart before building this
	// form's hidden itemId/setId input, same as this route reads it back.
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');
	// `required` on the product page's quantity input stops a real browser
	// from ever submitting this empty — but that's client-side only, so an
	// emptied field is still treated as "missing" here, not as invalid input.
	const rawQuantity = form.get('quantity');
	const quantity = rawQuantity === null || rawQuantity === '' ? 1 : Number(rawQuantity);
	const redirectTo = form.get('redirect');

	if (!Number.isInteger(quantity) || quantity <= 0) {
		return new Response('Invalid quantity', { status: 400 });
	}

	if (rawItemId !== null) {
		const itemId = Number(rawItemId);
		if (!Number.isInteger(itemId) || itemId <= 0) {
			return new Response('Invalid item', { status: 400 });
		}
		// A shopper can only ever reach this from a rendered product page, so
		// an itemId that doesn't resolve to a live, published-product item
		// means a stale/tampered request, not a normal flow to redirect through.
		const item = await db.query.items.findFirst({
			where: (t, { eq }) => eq(t.id, itemId),
			with: { product: true },
		});
		if (!item || item.archived || item.product?.status !== 'published') {
			return new Response('Item not available', { status: 404 });
		}
		addToCart(cookies, { itemId, quantity });
	} else if (rawSetId !== null) {
		const setId = Number(rawSetId);
		if (!Number.isInteger(setId) || setId <= 0) {
			return new Response('Invalid set', { status: 400 });
		}
		const set = await db.query.sets.findFirst({
			where: (t, { eq }) => eq(t.id, setId),
			with: { product: true },
		});
		if (!set || set.archived || set.product?.status !== 'published') {
			return new Response('Set not available', { status: 404 });
		}
		addToCart(cookies, { setId, quantity });
	} else {
		return new Response('Missing item or set', { status: 400 });
	}

	const target = isSafeRedirectTarget(redirectTo) ? redirectTo : '/';
	// Read by CartSidebar.astro's script to auto-open the sidebar after the
	// redirect lands, then stripped from the URL — see that component. Parsed
	// as a URL (against a dummy base, since target is always relative) so the
	// marker lands in the query string even when target has a #fragment.
	const url = new URL(target, 'http://internal');
	url.searchParams.set('cartOpen', '1');
	return redirect(`${url.pathname}${url.search}${url.hash}`);
};
