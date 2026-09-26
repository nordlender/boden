export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.

import type { APIRoute } from 'astro';
import { addSetComponent } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const itemId = Number(form.get('itemId'));
	const quantity = Number(form.get('quantity'));

	if (!isPositiveInteger(setId) || !isPositiveInteger(itemId) || !isPositiveInteger(quantity)) {
		return new Response('A set, an item, and a positive quantity are required', { status: 400 });
	}

	try {
		await addSetComponent(setId, itemId, quantity);
	} catch {
		return new Response('Could not add component', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
