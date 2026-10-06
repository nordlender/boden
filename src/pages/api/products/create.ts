export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES ('/api/products'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).

import type { APIRoute } from 'astro';
import { createProduct } from '../../../lib/products';
import { requireAdmin, safeRedirectTarget } from '../../../lib/http';
import { parseProductForm } from '../../../lib/productForm';
import { saveOr400 } from '../../../lib/productHttp';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const parsed = parseProductForm(form);
	if (!parsed.ok) {
		return new Response(parsed.error, { status: 400 });
	}

	const id = await saveOr400(() => createProduct(parsed.input));
	if (id instanceof Response) return id;
	return redirect(safeRedirectTarget(form, url.origin, `/admin/products/${id}/edit`));
};
