// /api/wizard/items/set-product and /api/wizard/sets/set-product. Unlike
// archive/set-image the two kinds don't share one lib function — items fan
// out attribute values on reassignment, sets don't — so `kind` picks which.
// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see ../items.ts.

import type { APIRoute } from 'astro';
import { setItemsProduct } from '../../../../lib/wizard';
import { setSetsProduct } from '../../../../lib/setWizard';
import { ProductKindConflictError } from '../../../../lib/wizardVariants';
import { readVariantRequest } from '../../../../lib/wizardRoutes';
import { safeRedirectTarget, requirePositiveIntFields } from '../../../../lib/http';

const assign = { item: setItemsProduct, set: setSetsProduct };

export const POST: APIRoute = async (context) => {
	const req = await readVariantRequest(context);
	if (req instanceof Response) return req;
	const { route, form, ids } = req;

	// A positive integer, not just any number: 0 (a missing field, or the
	// <select>'s disabled placeholder) is no products.id and would otherwise
	// go on to violate a foreign key in the assignment below — rolling back
	// the whole transaction, silently discarding even the valid ids.
	const fields = requirePositiveIntFields(form, ['productId']);

	if (ids.length === 0 || !fields) {
		return new Response(`Select at least one ${route.kind} and a product`, { status: 400 });
	}

	const target = safeRedirectTarget(form, context.url.origin, route.fallback);

	try {
		await assign[route.kind](ids, fields.productId);
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
		const back = new URL(target, context.url.origin);
		back.searchParams.set('assignError', error.reason);
		const panel = form.get('panel');
		if (typeof panel === 'string' && panel) back.searchParams.set('assignPanel', panel);
		return context.redirect(back.pathname + back.search + back.hash);
	}

	return context.redirect(target);
};
