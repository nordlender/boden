export const prerender = false;

import type { APIRoute } from 'astro';
import { updateSet } from '../../../lib/sets';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const id = Number(form.get('id'));
	const title = form.get('title')?.toString().trim() ?? '';
	const description = form.get('description')?.toString().trim() || null;
	const thumbnailImageUrl = form.get('thumbnailImageUrl')?.toString().trim() || null;
	const status = form.get('status')?.toString() === 'published' ? 'published' : 'hidden';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/sets');

	if (!isPositiveInteger(id) || !title) {
		return redirect(`${redirectTo}?error=invalid_update`);
	}

	await updateSet({ id, title, description, thumbnailImageUrl, status });
	return redirect(redirectTo);
};
