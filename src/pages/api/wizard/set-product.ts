export const prerender = false;

// Not covered by src/middleware/index.ts's route-prefix gate — see items.ts.

import type { APIRoute } from 'astro';
import { setItemsProduct } from '../../../lib/wizard';

function redirectTarget(form: FormData): string {
	const redirectTo = form.get('redirectTo');
	return typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/admin/items';
}

export const POST: APIRoute = async ({ request, redirect, locals }) => {
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const itemIds = form
		.getAll('itemIds')
		.map((v) => Number(v))
		.filter((n) => Number.isInteger(n));
	const productId = Number(form.get('productId'));

	if (itemIds.length === 0 || !Number.isInteger(productId)) {
		return new Response('Select at least one item and a product', { status: 400 });
	}

	await setItemsProduct(itemIds, productId);
	return redirect(redirectTarget(form));
};
