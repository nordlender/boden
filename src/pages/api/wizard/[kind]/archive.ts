// /api/wizard/items/archive and /api/wizard/sets/archive — `kind` picks the
// table (see wizardVariants.ts's variantRoute).
// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see ../items.ts.

import type { APIRoute } from 'astro';
import { archiveVariants, variantRoute } from '../../../../lib/wizardVariants';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../../lib/http';

export const POST: APIRoute = async ({ request, redirect, locals, url, params }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const route = variantRoute(params.kind);
	if (!route) return new Response('Not found', { status: 404 });

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger: Number(null)/Number('')
	// from a missing/blank id entry coerce to 0, which isn't a real id — see
	// isPositiveInteger's doc comment. Left unfiltered, a malformed
	// submission would pass as ids=[0], archiveVariants would no-op against
	// it, and the route would still redirect as if the archive succeeded.
	const ids = form.getAll(route.idsField).map(Number).filter(isPositiveInteger);

	if (ids.length === 0) {
		return new Response(`Select at least one ${route.kind}`, { status: 400 });
	}

	await archiveVariants(route.kind, ids);
	return redirect(safeRedirectTarget(form, url.origin, route.fallback));
};
