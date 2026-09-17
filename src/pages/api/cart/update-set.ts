export const prerender = false;

// See ./add.ts for why no auth check happens here — cart mutation itself is
// unauthenticated, and gating lives at /cart (middleware) and checkout
// (src/pages/api/orders/create.ts).

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { updateCartSetQuantity } from '../../../lib/cart';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const quantity = Number(form.get('quantity'));

	if (!Number.isInteger(setId) || setId <= 0 || !Number.isInteger(quantity)) {
		return new Response('Invalid set or quantity', { status: 400 });
	}

	// quantity <= 0 just removes the kit line (see updateCartSetQuantity) —
	// always allowed, same as ./remove-set.ts. A positive quantity
	// re-validates the set the same way add-set.ts does.
	if (quantity > 0) {
		const set = await db.query.sets.findFirst({ where: (t, { eq }) => eq(t.id, setId) });
		if (!set || set.status !== 'published') {
			return new Response('Set not available', { status: 404 });
		}
	}

	updateCartSetQuantity(cookies, setId, quantity);
	return redirect('/cart');
};
