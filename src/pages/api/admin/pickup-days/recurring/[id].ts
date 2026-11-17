// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — defense-in-depth.

import type { APIRoute } from 'astro';
import { deleteRecurringRule } from '../../../../../lib/pickupDays';
import { json, jsonError, parseIdParam, requireAdmin } from '../../../../../lib/http';

export const DELETE: APIRoute = async ({ params, locals }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const id = parseIdParam(params.id);
	if (id === null) return jsonError('invalid_id', 400);

	// Cascades to every generated pickup_days row (see schema.ts) — no
	// separate cleanup needed here. Refused while one of those days is a
	// scheduled order's confirmed window (#369).
	const result = await deleteRecurringRule(id);
	if (!result.ok) {
		return result.error === 'assigned' ? json(result, 409) : jsonError('not_found', 404);
	}

	return json({ ok: true });
};
