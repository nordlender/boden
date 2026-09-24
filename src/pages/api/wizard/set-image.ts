export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.

import type { APIRoute } from 'astro';
import { setItemsImage } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter(isPositiveInteger);
	const imageUrl = String(form.get('imageUrl') ?? '').trim();

	if (itemIds.length === 0 || imageUrl === '') {
		return new Response('Select at least one item and an image URL', { status: 400 });
	}

	try {
		await setItemsImage(itemIds, imageUrl);
	} catch {
		return new Response('Could not set image', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
