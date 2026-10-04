// Also gated by src/middleware/prefixes.ts's ROUTE_RULES ('/api/wizard'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).

import type { APIRoute } from 'astro';
import { createItem } from '../../../lib/wizard';
import { parseNamedEntityForm, requireAdmin, safeRedirectTarget } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const fields = parseNamedEntityForm(form);
	if (!fields) {
		return new Response('Item name is required', { status: 400 });
	}

	await createItem(fields);
	return redirect(safeRedirectTarget(form, url.origin));
};
