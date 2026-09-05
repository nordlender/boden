export const prerender = false;

// TODO: no auth check yet — see ../items.ts.
// schema_v3.md's "attribute editing entry points" (bulk half): applies to
// every currently-selected item at once, after confirming they share one
// product (one attribute template). key[]/value[] are parallel repeatable
// fields — the standard plain-form pattern for this, zipped below.

import type { APIRoute } from 'astro';
import { setBulkAttributeValues } from '../../../../lib/wizard';

function redirectTarget(form: FormData): string {
	const redirectTo = form.get('redirectTo');
	return typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/admin/items';
}

export const POST: APIRoute = async ({ request, redirect }) => {
	const form = await request.formData();
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter((n) => Number.isInteger(n));
	const keys = form.getAll('key').map((v) => v.toString().trim());
	const values = form.getAll('value').map((v) => v.toString());
	const pairs = keys.map((key, i) => ({ key, value: values[i] ?? '' })).filter((pair) => pair.key.length > 0);

	if (itemIds.length === 0 || pairs.length === 0) {
		return new Response('Select items and at least one attribute to set', { status: 400 });
	}

	const result = await setBulkAttributeValues(itemIds, pairs);
	if (!result.ok) {
		return new Response('Selected items must all share the same product', { status: 409 });
	}

	return redirect(redirectTarget(form));
};
