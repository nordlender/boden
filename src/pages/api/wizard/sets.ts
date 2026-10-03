export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES ('/api/wizard'),
// but that's defense-in-depth — keep this inline check too (see items.ts).

import type { APIRoute } from 'astro';
import { createSet } from '../../../lib/setWizard';
import { parseNamedEntityForm, requireAdmin, safeRedirectTarget } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const fields = parseNamedEntityForm(form);
	if (!fields) {
		return new Response('Set name is required', { status: 400 });
	}

	await createSet(fields);
	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
