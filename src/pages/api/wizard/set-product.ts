export const prerender = false;

// Not covered by src/middleware/index.ts's route-prefix gate — see items.ts.

import type { APIRoute } from 'astro';
import { setItemsProduct } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger, for both ids: 0 is not a
	// valid products.id or items.id — see isPositiveInteger's doc comment —
	// and would otherwise go on to violate a foreign key in setItemsProduct
	// below (which would roll back the whole transaction, silently discarding
	// even the valid items in the request).
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter(isPositiveInteger);
	const productId = Number(form.get('productId'));

	if (itemIds.length === 0 || !isPositiveInteger(productId)) {
		return new Response('Select at least one item and a product', { status: 400 });
	}

	try {
		await setItemsProduct(itemIds, productId);
	} catch {
		// Don't leak the raw driver message (e.g. a FOREIGN KEY constraint
		// error if productId was deleted between page render and submit).
		return new Response('Could not assign product', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
