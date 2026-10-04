export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.

import type { APIRoute } from 'astro';
import { addSetComponent } from '../../../lib/setWizard';
import { requireAdmin, requirePositiveIntFields, safeRedirectTarget } from '../../../lib/http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const fields = requirePositiveIntFields(form, ['setId', 'itemId', 'quantity'] as const);
	if (!fields) {
		return new Response('A set, an item, and a positive quantity are required', { status: 400 });
	}

	try {
		await addSetComponent(fields.setId, fields.itemId, fields.quantity);
	} catch {
		return new Response('Could not add component', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
