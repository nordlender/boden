// /api/wizard/items/set-image and /api/wizard/sets/set-image — `kind` picks
// the table (see lib/wizardRoutes.ts).
// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see ../items.ts.

import type { APIRoute } from 'astro';
import { updateVariants } from '../../../../lib/wizardVariants';
import { readVariantRequest } from '../../../../lib/wizardRoutes';
import { safeRedirectTarget } from '../../../../lib/http';

export const POST: APIRoute = async (context) => {
	const req = await readVariantRequest(context);
	if (req instanceof Response) return req;
	const { route, form, ids } = req;

	const imageUrl = String(form.get('imageUrl') ?? '').trim();

	if (ids.length === 0 || imageUrl === '') {
		return new Response(`Select at least one ${route.kind} and an image URL`, { status: 400 });
	}

	try {
		await updateVariants(route.kind, ids, { imageUrl });
	} catch {
		return new Response('Could not set image', { status: 400 });
	}

	return context.redirect(safeRedirectTarget(form, context.url.origin, route.fallback));
};
