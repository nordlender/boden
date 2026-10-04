export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see index.ts's
// sibling route for why this inline check stays anyway.

import type { APIRoute } from 'astro';
import { deleteSingleDay } from '../../../../lib/pickupDays';
import { json, jsonError, parseIdParam, requireModerator } from '../../../../lib/http';

export const DELETE: APIRoute = async ({ params, locals }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const id = parseIdParam(params.id);
	if (id === null) return jsonError('invalid_id', 400);

	// Ownership (and kind: 'single') is enforced inside deleteSingleDay's own
	// WHERE clause, not just checked here — a moderator can never delete
	// another moderator's offer or a recurring-generated day by id, even if
	// they know/guess it.
	const deleted = await deleteSingleDay(id, locals.user!.id);
	if (!deleted) {
		return jsonError('not_found', 404);
	}

	return json({ ok: true });
};
