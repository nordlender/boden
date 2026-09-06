export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see ../items.ts.
// docs/schema.md's "attribute editing entry points" (bulk half): applies to
// every currently-selected item at once, after confirming they share one
// product (one attribute template). key[]/value[] are parallel repeatable
// fields — the standard plain-form pattern for this, zipped below.

import type { APIRoute } from 'astro';
import { setBulkAttributeValues } from '../../../../lib/wizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	// isPositiveInteger, not bare Number.isInteger: a tampered/malformed
	// itemIds entry (or Number('') from a blank one) coerces to 0, which
	// isn't a real item id and would otherwise reach setBulkAttributeValues's
	// FK-constrained inserts below.
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter(isPositiveInteger);
	const keys = form.getAll('key').map((v) => v.toString().trim());
	const values = form.getAll('value').map((v) => v.toString());
	const pairs = keys.map((key, i) => ({ key, value: values[i] ?? '' })).filter((pair) => pair.key.length > 0);

	if (itemIds.length === 0 || pairs.length === 0) {
		return new Response('Select items and at least one attribute to set', { status: 400 });
	}

	let result;
	try {
		result = await setBulkAttributeValues(itemIds, pairs);
	} catch {
		return new Response('Could not save attributes', { status: 400 });
	}
	if (!result.ok) {
		return new Response('Selected items must all share the same product', { status: 409 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
