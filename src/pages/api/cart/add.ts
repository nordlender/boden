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

// A leading "//" (or "/\") is still relative enough to pass a bare
// startsWith('/') check, but browsers resolve it as protocol-relative —
// `//evil.com` becomes `https://evil.com`. Reject those too so this can't be
// used as an open redirect from this deliberately unauthenticated endpoint.
function isSafeRedirectTarget(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	const quantity = Number(form.get('quantity')) || 1;
	const redirectTo = form.get('redirect');

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

	const target = isSafeRedirectTarget(redirectTo) ? redirectTo : '/';
	// Read by CartSidebar.astro's script to auto-open the sidebar after the
	// redirect lands, then stripped from the URL — see that component.
	const separator = target.includes('?') ? '&' : '?';
	return redirect(`${target}${separator}cartOpen=1`);
};
