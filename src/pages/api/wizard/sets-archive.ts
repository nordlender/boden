export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.

import type { APIRoute } from 'astro';
import { archiveSets } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setIds = form
		.getAll('setIds')
		.map(Number)
		.filter(isPositiveInteger);

	if (setIds.length === 0) {
		return new Response('Select at least one set', { status: 400 });
	}

	await archiveSets(setIds);
	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
