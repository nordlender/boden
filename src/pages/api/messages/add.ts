import type { APIRoute } from 'astro';
import { createMessage } from '../../../lib/messages';
import { safeRedirectTarget } from '../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	// Defense-in-depth: /api/messages is also in src/middleware/prefixes.ts's
	// ADMIN_ROUTE_PREFIXES, but this inline check stays regardless, same
	// pattern as the /api/wizard/* and /api/pickup-days/* routes.
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const content = form.get('content')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	const posted = await createMessage(content, locals.user.name ?? locals.user.email);
	if (!posted) return redirect(`${redirectTo}?error=empty_message`);
	return redirect(redirectTo);
};
