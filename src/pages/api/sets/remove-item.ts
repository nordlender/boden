export const prerender = false;

import type { APIRoute } from 'astro';
import { removeSetItem } from '../../../lib/sets';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const itemId = Number(form.get('itemId'));
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/sets');

	if (isPositiveInteger(setId) && isPositiveInteger(itemId)) {
		await removeSetItem({ setId, itemId });
	}
	return redirect(redirectTo);
};
