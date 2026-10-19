// /api/wizard/items/set-image and /api/wizard/sets/set-image — `kind` picks
// the table (see wizardVariants.ts's variantRoute).
// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see ../items.ts.

import type { APIRoute } from 'astro';
import { setVariantsImage, variantRoute } from '../../../../lib/wizardVariants';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../../lib/http';

export const POST: APIRoute = async ({ request, redirect, locals, url, params }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const route = variantRoute(params.kind);
	if (!route) return new Response('Not found', { status: 404 });

	const form = await request.formData();
	const ids = form.getAll(route.idsField).map(Number).filter(isPositiveInteger);
	const imageUrl = String(form.get('imageUrl') ?? '').trim();

	if (ids.length === 0 || imageUrl === '') {
		return new Response(`Select at least one ${route.kind} and an image URL`, { status: 400 });
	}

	try {
		await setVariantsImage(route.kind, ids, imageUrl);
	} catch {
		return new Response('Could not set image', { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin, route.fallback));
};
