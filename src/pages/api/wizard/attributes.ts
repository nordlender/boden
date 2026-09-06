export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.
// Single-item attribute edit — docs/schema.md's "attribute editing entry
// points" (single-item half), submitted from the small per-attribute form
// revealed by the {edit_icon} in the details box. Bulk editing is
// attributes/bulk.ts.

import type { APIRoute } from 'astro';
import { setItemAttributeValue } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	const key = form.get('key')?.toString().trim();
	const value = form.get('value')?.toString() ?? '';

	if (!isPositiveInteger(itemId) || !key) {
		return new Response('Item and attribute key are required', { status: 400 });
	}

	try {
		await setItemAttributeValue(itemId, key, value);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not save attribute';
		return new Response(message, { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
