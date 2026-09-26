export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.

import type { APIRoute } from 'astro';
import { setSetsProduct } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger — see items.ts's
	// set-product.ts for why (0 would otherwise pass and blow up the FK).
	const setIds = form
		.getAll('setIds')
		.map((v) => Number(v))
		.filter(isPositiveInteger);
	const productId = Number(form.get('productId'));

	if (setIds.length === 0 || !isPositiveInteger(productId)) {
		return new Response('Select at least one set and a product', { status: 400 });
	}

	try {
		await setSetsProduct(setIds, productId);
	} catch {
		return new Response('Could not assign product', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
