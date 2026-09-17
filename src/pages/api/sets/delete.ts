export const prerender = false;

import type { APIRoute } from 'astro';
import { deleteSet } from '../../../lib/sets';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const id = Number(form.get('id'));
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/sets');

	if (isPositiveInteger(id)) {
		await deleteSet(id);
	}
	return redirect(redirectTo);
};
