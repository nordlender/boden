export const prerender = false;

// Also gated by src/middleware/index.ts's MOD_ROUTE_PREFIXES ('/api/moderator'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).

import type { APIRoute } from 'astro';
import { getOrderDetailByCode } from '../../../lib/moderatorOrders';
import { requireModerator } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const code = form.get('code')?.toString().trim().toUpperCase();

	const order = code ? await getOrderDetailByCode(code) : null;
	if (!order) {
		return redirect('/moderator/retrieve?error=not_found', 303);
	}

	return redirect(`/moderator/orders/${order.id}`, 303);
};
