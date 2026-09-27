export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES ('/api/wizard'),
// but that's defense-in-depth — keep this inline check too (see items.ts).

import type { APIRoute } from 'astro';
import { createSet } from '../../../lib/setWizard';
import { requireAdmin, safeRedirectTarget } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const name = form.get('name')?.toString().trim();
	const imageUrl = form.get('imageUrl')?.toString().trim() || null;

	if (!name) {
		return new Response('Set name is required', { status: 400 });
	}

	await createSet({ name, imageUrl });
	return redirect(safeRedirectTarget(form, url.origin, '/admin/sets'));
};
