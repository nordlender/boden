export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.

import type { APIRoute } from 'astro';
import { ProductHasItemsError, setSetsProduct } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger — see items.ts's
	// set-product.ts for why (0 would otherwise pass and blow up the FK).
	const setIds = form
		.getAll('setIds')
		.map(Number)
		.filter(isPositiveInteger);
	const productId = Number(form.get('productId'));

	if (setIds.length === 0 || !isPositiveInteger(productId)) {
		return new Response('Select at least one set and a product', { status: 400 });
	}

	const target = safeRedirectTarget(form, url.origin, '/admin/sets');

	try {
		await setSetsProduct(setIds, productId);
	} catch (error) {
		if (!(error instanceof ProductHasItemsError)) {
			return new Response('Could not assign product', { status: 400 });
		}
		// Back to the page with a reason code — SetToolbar.astro turns it into a
		// warning popover on the Assign button. `panel` says which of the two
		// toolbars (unassigned/assigned) the failed attempt came from.
		const back = new URL(target, url.origin);
		back.searchParams.set('assignError', 'product_has_items');
		const panel = form.get('panel');
		if (typeof panel === 'string' && panel) back.searchParams.set('assignPanel', panel);
		return redirect(back.pathname + back.search + back.hash);
	}

	return redirect(target);
};
