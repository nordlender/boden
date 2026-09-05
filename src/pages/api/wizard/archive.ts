export const prerender = false;

// TODO: no auth check yet — see items.ts.

import type { APIRoute } from 'astro';
import { archiveItems } from '../../../lib/wizard';

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

	if (itemIds.length === 0) {
		return new Response('Select at least one item', { status: 400 });
	}

	await archiveItems(itemIds);
	return redirect(redirectTarget(form));
};
