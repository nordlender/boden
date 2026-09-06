export const prerender = false;

// Not covered by src/middleware/index.ts's route-prefix gate (that only
// matches /admin, /cart, /checkout, /orders — not /api/...), same as
// src/pages/api/orders/create.ts — so the admin check happens here instead.

import type { APIRoute } from 'astro';
import { createItem } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const name = form.get('name')?.toString().trim();
	const imageUrl = form.get('imageUrl')?.toString().trim() || null;

	if (!name) {
		return new Response('Item name is required', { status: 400 });
	}

	await createItem({ name, imageUrl });
	return redirect(safeRedirectTarget(form, url.origin));
};
