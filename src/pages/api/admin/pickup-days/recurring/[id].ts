export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — defense-in-depth.

import type { APIRoute } from 'astro';
import { deleteRecurringRule } from '../../../../../lib/pickupDays';
import { requireAdmin, isPositiveInteger } from '../../../../../lib/wizard-http';

export const DELETE: APIRoute = async ({ params, locals }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const id = Number(params.id);
	if (!isPositiveInteger(id)) {
		return new Response(JSON.stringify({ error: 'invalid_id' }), { status: 400 });
	}

	// Cascades to every generated pickup_days row (see schema.ts) — no
	// separate cleanup needed here.
	const deleted = await deleteRecurringRule(id);
	if (!deleted) {
		return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
	}

	return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
