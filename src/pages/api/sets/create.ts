export const prerender = false;

// /api/sets/* mirrors /api/pickup-days/*'s plain POST-form/redirect style
// (requireAdmin + safeRedirectTarget from src/lib/wizard-http.ts — shared
// helpers despite that file's name, see its own doc comment) rather than
// the item wizard's client-driven flow.

import type { APIRoute } from 'astro';
import { createSet } from '../../../lib/sets';
import { requireAdmin, safeRedirectTarget } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const title = form.get('title')?.toString().trim() ?? '';
	const description = form.get('description')?.toString().trim() || null;
	const thumbnailImageUrl = form.get('thumbnailImageUrl')?.toString().trim() || null;
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/sets');

	if (!title) {
		return redirect(`${redirectTo}?error=missing_title`);
	}

	await createSet({ title, description, thumbnailImageUrl });
	return redirect(redirectTo);
};
