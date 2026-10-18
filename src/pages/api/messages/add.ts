import type { APIRoute } from 'astro';
import { createMessage } from '../../../lib/messages';
import { getUnit } from '../../../lib/units';
import { isPositiveInteger, redirectWithError, requireModerator, safeRedirectTarget } from '../../../lib/http';

// Posts a hub-board message, or — when the form has a `unitId` — a note on
// that unit (see the `messages` table comment in src/db/schema.ts). Same
// rules for both: any moderator may post.
export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	// Defense-in-depth: /api/messages/add is also in
	// src/middleware/prefixes.ts's ROUTE_RULES, but this inline check
	// stays regardless, same pattern as the /api/wizard/* and
	// /api/pickup-days/* routes.
	const denied = requireModerator(locals);
	if (denied) return denied;

	const form = await request.formData();
	const content = form.get('content')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	let unitId: number | null = null;
	if (form.has('unitId')) {
		unitId = Number(form.get('unitId'));
		if (!isPositiveInteger(unitId) || !(await getUnit(unitId))) return new Response('Unit not found', { status: 404 });
	}

	// requireModerator above guarantees locals.user is set.
	const posted = await createMessage(content, locals.user!.name ?? locals.user!.email, locals.user!.id, unitId);
	if (!posted) return redirect(redirectWithError(redirectTo, 'empty_message'));
	return redirect(redirectTo);
};
