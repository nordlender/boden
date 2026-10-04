export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.

import type { APIRoute } from 'astro';
import { setSetsImage } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setIds = form
		.getAll('setIds')
		.map(Number)
		.filter(isPositiveInteger);
	const imageUrl = String(form.get('imageUrl') ?? '').trim();

	if (setIds.length === 0 || imageUrl === '') {
		return new Response('Select at least one set and an image URL', { status: 400 });
	}

	try {
		await setSetsImage(setIds, imageUrl);
	} catch {
		return new Response('Could not set image', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
