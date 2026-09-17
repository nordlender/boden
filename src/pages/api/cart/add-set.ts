export const prerender = false;

// See ./add.ts for why no auth check happens here.

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { addSetToCart } from '../../../lib/cart';
import { isSafeRedirectTarget } from '../../../lib/redirect';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const rawQuantity = form.get('quantity');
	const quantity = rawQuantity === null || rawQuantity === '' ? 1 : Number(rawQuantity);
	const redirectTo = form.get('redirect');

	if (!Number.isInteger(setId) || setId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
		return new Response('Invalid set or quantity', { status: 400 });
	}

	// A shopper can only ever reach this from a rendered /sets/[slug] page, so
	// a setId that doesn't resolve to a published set means a stale/tampered
	// request, not a normal flow to redirect through — same convention as
	// ./add.ts's item check.
	const set = await db.query.sets.findFirst({ where: (t, { eq }) => eq(t.id, setId) });
	if (!set || set.status !== 'published') {
		return new Response('Set not available', { status: 404 });
	}

	addSetToCart(cookies, setId, quantity);

	const target = isSafeRedirectTarget(redirectTo) ? redirectTo : '/';
	const url = new URL(target, 'http://internal');
	url.searchParams.set('cartOpen', '1');
	return redirect(`${url.pathname}${url.search}${url.hash}`);
};
