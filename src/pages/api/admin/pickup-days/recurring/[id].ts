export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — defense-in-depth.

import type { APIRoute } from 'astro';
import { deleteRecurringRule } from '../../../../../lib/pickupDays';
import { json, jsonError, parseIdParam, requireAdmin } from '../../../../../lib/http';

export const DELETE: APIRoute = async ({ params, locals }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const id = parseIdParam(params.id);
	if (id === null) return jsonError('invalid_id', 400);

	// Cascades to every generated pickup_days row (see schema.ts) — no
	// separate cleanup needed here.
	const deleted = await deleteRecurringRule(id);
	if (!deleted) {
		return jsonError('not_found', 404);
	}

	return json({ ok: true });
};
