export const prerender = false;

import type { APIRoute } from 'astro';
import { addSetItem } from '../../../lib/sets';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const setId = Number(form.get('setId'));
	const itemId = Number(form.get('itemId'));
	const rawQuantity = form.get('quantity');
	const quantity = rawQuantity === null || rawQuantity === '' ? 1 : Number(rawQuantity);
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/sets');

	if (!isPositiveInteger(setId) || !isPositiveInteger(itemId) || !isPositiveInteger(quantity)) {
		return redirect(`${redirectTo}?error=invalid_set_item`);
	}

	await addSetItem({ setId, itemId, quantity });
	return redirect(redirectTo);
};
