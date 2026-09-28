export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES ('/api/products'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).

import type { APIRoute } from 'astro';
import { updateProduct, getProductForEdit } from '../../../../lib/products';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../../lib/wizard-http';
import { parseProductForm } from '../../../../lib/productForm';

export const POST: APIRoute = async ({ request, redirect, locals, url, params }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const id = Number(params.id);
	if (!isPositiveInteger(id)) {
		return new Response('Invalid product id', { status: 400 });
	}

	const existing = await getProductForEdit(id);
	if (!existing) {
		return new Response('Product not found', { status: 404 });
	}

	const form = await request.formData();
	const parsed = parseProductForm(form);
	if (!parsed.ok) {
		return new Response(parsed.error, { status: 400 });
	}

	await updateProduct(id, parsed.input);
	return redirect(safeRedirectTarget(form, url.origin, `/admin/products/${id}/edit`));
};
