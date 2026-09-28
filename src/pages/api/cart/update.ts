export const prerender = false;

// See ../add.ts for why no auth check happens here — cart mutation itself is
// unauthenticated, and gating lives at /cart (middleware) and checkout
// (src/pages/api/orders/create.ts).

import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { updateCartQuantity } from '../../../lib/cart';

// True when the given item/set is still a valid line to add stock for —
// quantity <= 0 just removes the line (see updateCartQuantity) and skips
// this check entirely, same as ../remove.ts, even for an item/set that's
// since been archived/unpublished. A positive quantity re-validates it the
// same way add.ts does, so this endpoint can't be used to slip a
// hidden-product or archived entry into the cart that add.ts would have
// rejected (updateCartQuantity happily inserts a new line for an id that
// wasn't already in the cart).
async function isAvailable(kind: 'item' | 'set', id: number): Promise<boolean> {
	if (kind === 'item') {
		const item = await db.query.items.findFirst({ where: (t, { eq }) => eq(t.id, id), with: { product: true } });
		return Boolean(item) && !item!.archived && item!.product?.status === 'published';
	}
	const set = await db.query.sets.findFirst({ where: (t, { eq }) => eq(t.id, id), with: { product: true } });
	return Boolean(set) && !set!.archived && set!.product?.status === 'published';
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const rawItemId = form.get('itemId');
	const rawSetId = form.get('setId');
	const quantity = Number(form.get('quantity'));

	if (!Number.isInteger(quantity)) {
		return new Response('Invalid quantity', { status: 400 });
	}

	const kind: 'item' | 'set' | null = rawItemId !== null ? 'item' : rawSetId !== null ? 'set' : null;
	if (kind === null) {
		return new Response('Missing item or set', { status: 400 });
	}

	const id = Number(kind === 'item' ? rawItemId : rawSetId);
	if (!Number.isInteger(id) || id <= 0) {
		return new Response(kind === 'item' ? 'Invalid item' : 'Invalid set', { status: 400 });
	}

	if (quantity > 0 && !(await isAvailable(kind, id))) {
		return new Response(kind === 'item' ? 'Item not available' : 'Set not available', { status: 404 });
	}

	updateCartQuantity(cookies, kind === 'item' ? { itemId: id } : { setId: id }, quantity);
	return redirect('/cart');
};
