// Also gated by src/middleware/index.ts's MOD_ROUTE_PREFIXES ('/api/moderator'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).

import type { APIRoute } from 'astro';
import { getOrderIdByCode } from '../../../lib/moderatorOrders';
import { requireModerator, withErrorParam } from '../../../lib/http';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	// The input allows an optional leading "#" (e.g. "#AB12CD") as a nod to
	// how order codes are displayed elsewhere — strip it (and any other stray
	// "#") before normalizing, so "#AB12CD" and "AB12CD" both resolve.
	const code = form
		.get('code')
		?.toString()
		.replace(/#/g, '')
		.trim()
		.toUpperCase();

	const orderId = code ? await getOrderIdByCode(code) : null;
	if (!orderId) {
		return redirect(withErrorParam('/moderator/retrieve', 'not_found'), 303);
	}

	return redirect(`/moderator/retrieve/${orderId}`, 303);
};
