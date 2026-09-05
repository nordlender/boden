export const prerender = false;

// TODO: no auth check yet — see items.ts.
// Single-item attribute edit — schema_v3.md's "attribute editing entry
// points" (single-item half), submitted from the small per-attribute form
// revealed by the {edit_icon} in the details box. Bulk editing is
// attributes/bulk.ts.

import type { APIRoute } from 'astro';
import { setItemAttributeValue } from '../../../lib/wizard';

function redirectTarget(form: FormData): string {
	const redirectTo = form.get('redirectTo');
	return typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/admin/items';
}

export const POST: APIRoute = async ({ request, redirect }) => {
	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	const key = form.get('key')?.toString().trim();
	const value = form.get('value')?.toString() ?? '';

	if (!Number.isInteger(itemId) || !key) {
		return new Response('Item and attribute key are required', { status: 400 });
	}

	try {
		await setItemAttributeValue(itemId, key, value);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not save attribute';
		return new Response(message, { status: 400 });
	}

	return redirect(redirectTarget(form));
};
