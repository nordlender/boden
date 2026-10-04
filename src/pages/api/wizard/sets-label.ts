export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.

import type { APIRoute } from 'astro';
import { setSetLabel } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const label = String(form.get('label') ?? '');

	if (!isPositiveInteger(setId)) {
		return new Response('A valid set is required', { status: 400 });
	}

	await setSetLabel(setId, label);
	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
