import type { APIRoute } from 'astro';
import { createMessage } from '../../../lib/messages';
import { redirectWithError, requireModerator, safeRedirectTarget } from '../../../lib/http';

export const prerender = false;

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

	// requireModerator above guarantees locals.user is set.
	const posted = await createMessage(content, locals.user!.name ?? locals.user!.email, locals.user!.id);
	if (!posted) return redirect(redirectWithError(redirectTo, 'empty_message'));
	return redirect(redirectTo);
};
