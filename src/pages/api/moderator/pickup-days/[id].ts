export const prerender = false;

// Also gated by src/middleware/index.ts's MOD_ROUTE_PREFIXES — see index.ts's
// sibling route for why this inline check stays anyway.

import type { APIRoute } from 'astro';
import { deleteSingleDay } from '../../../../lib/pickupDays';
import { requireModerator, isPositiveInteger } from '../../../../lib/wizard-http';

export const DELETE: APIRoute = async ({ params, locals }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const id = Number(params.id);
	if (!isPositiveInteger(id)) {
		return new Response(JSON.stringify({ error: 'invalid_id' }), { status: 400 });
	}

	// Ownership (and kind: 'single') is enforced inside deleteSingleDay's own
	// WHERE clause, not just checked here — a moderator can never delete
	// another moderator's offer or a recurring-generated day by id, even if
	// they know/guess it.
	const deleted = await deleteSingleDay(id, locals.user!.id);
	if (!deleted) {
		return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
	}

	return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
