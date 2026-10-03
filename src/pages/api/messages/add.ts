import type { APIRoute } from 'astro';
import { createMessage } from '../../../lib/messages';
import { requireModerator, safeRedirectTarget, withErrorParam } from '../../../lib/http';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	// Defense-in-depth: /api/messages/add is also in
	// src/middleware/prefixes.ts's MOD_ROUTE_PREFIXES, but this inline check
	// stays regardless, same pattern as the /api/wizard/* routes.
	const denied = requireModerator(locals);
	if (denied) return denied;

	const form = await request.formData();
	const content = form.get('content')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	// requireModerator above guarantees locals.user is set.
	const posted = await createMessage(content, locals.user!.name ?? locals.user!.email, locals.user!.id);
	if (!posted) return redirect(withErrorParam(redirectTo, 'empty_message'));
	return redirect(redirectTo);
};
