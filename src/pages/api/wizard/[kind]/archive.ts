// /api/wizard/items/archive and /api/wizard/sets/archive — `kind` picks the
// table (see lib/wizardRoutes.ts).
// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see ../items.ts.

import type { APIRoute } from 'astro';
import { updateVariants } from '../../../../lib/wizardVariants';
import { readVariantRequest } from '../../../../lib/wizardRoutes';
import { safeRedirectTarget } from '../../../../lib/http';

export const POST: APIRoute = async (context) => {
	const req = await readVariantRequest(context);
	if (req instanceof Response) return req;
	const { route, form, ids } = req;

	// Without this, a malformed submission (no valid ids) would no-op and
	// still redirect as if the archive succeeded.
	if (ids.length === 0) {
		return new Response(`Select at least one ${route.kind}`, { status: 400 });
	}

	await updateVariants(route.kind, ids, { archived: true });
	return context.redirect(safeRedirectTarget(form, context.url.origin, route.fallback));
};
