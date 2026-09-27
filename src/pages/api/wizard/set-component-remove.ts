export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.

import type { APIRoute } from 'astro';
import { removeSetComponent } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const itemId = Number(form.get('itemId'));

	if (!isPositiveInteger(setId) || !isPositiveInteger(itemId)) {
		return new Response('A set and an item are required', { status: 400 });
	}

	await removeSetComponent(setId, itemId);
	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
