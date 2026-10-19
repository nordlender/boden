// /api/wizard/items/set-product and /api/wizard/sets/set-product. Unlike
// archive/set-image the two kinds don't share one lib function — items fan
// out attribute values on reassignment, sets don't — so `kind` picks which.
// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see ../items.ts.

import type { APIRoute } from 'astro';
import { setItemsProduct } from '../../../../lib/wizard';
import { setSetsProduct } from '../../../../lib/setWizard';
import { ProductKindConflictError, variantRoute } from '../../../../lib/wizardVariants';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../../lib/http';

const assign = { item: setItemsProduct, set: setSetsProduct };

export const POST: APIRoute = async ({ request, redirect, locals, url, params }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const route = variantRoute(params.kind);
	if (!route) return new Response('Not found', { status: 404 });

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger, for both ids: 0 is not a
	// valid products.id (or item/set id) — see isPositiveInteger's doc
	// comment — and would otherwise go on to violate a foreign key in the
	// assignment below (rolling back the whole transaction, silently
	// discarding even the valid ids in the request).
	const ids = form.getAll(route.idsField).map(Number).filter(isPositiveInteger);
	const productId = Number(form.get('productId'));

	if (ids.length === 0 || !isPositiveInteger(productId)) {
		return new Response(`Select at least one ${route.kind} and a product`, { status: 400 });
	}

	const target = safeRedirectTarget(form, url.origin, route.fallback);

	try {
		await assign[route.kind](ids, productId);
	} catch (error) {
		if (!(error instanceof ProductKindConflictError)) {
			// Don't leak the raw driver message (e.g. a FOREIGN KEY constraint
			// error if productId was deleted between page render and submit).
			return new Response('Could not assign product', { status: 400 });
		}
		// Back to the page with a reason code — AssignWarning.astro turns it
		// into a warning popover on the toolbar's dropdown trigger. `panel`
		// says which of the page's two toolbars (unassigned/assigned) the
		// failed attempt came from.
		const back = new URL(target, url.origin);
		back.searchParams.set('assignError', error.reason);
		const panel = form.get('panel');
		if (typeof panel === 'string' && panel) back.searchParams.set('assignPanel', panel);
		return redirect(back.pathname + back.search + back.hash);
	}

	return redirect(target);
};
