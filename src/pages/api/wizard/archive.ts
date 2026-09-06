export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.

import type { APIRoute } from 'astro';
import { archiveItems } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger: Number(null)/Number('')
	// from a missing/blank itemIds entry coerce to 0, which isn't a real item
	// id — see isPositiveInteger's doc comment. Left unfiltered, a malformed
	// submission would pass as itemIds=[0], archiveItems would no-op against
	// it, and the route would still redirect as if the archive succeeded.
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter(isPositiveInteger);

	if (itemIds.length === 0) {
		return new Response('Select at least one item', { status: 400 });
	}

	await archiveItems(itemIds);
	return redirect(safeRedirectTarget(form, url.origin));
};
