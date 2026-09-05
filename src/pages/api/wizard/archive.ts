export const prerender = false;

// Not covered by src/middleware/index.ts's route-prefix gate — see items.ts.

import type { APIRoute } from 'astro';
import { archiveItems } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter((n) => Number.isInteger(n));

	if (itemIds.length === 0) {
		return new Response('Select at least one item', { status: 400 });
	}

	await archiveItems(itemIds);
	return redirect(safeRedirectTarget(form, url.origin));
};
