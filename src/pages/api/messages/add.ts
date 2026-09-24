import type { APIRoute } from 'astro';
import { createMessage } from '../../../lib/messages';
import { safeRedirectTarget } from '../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	// Not covered by src/middleware/index.ts's route-prefix gate for the
	// /api/... half (only /admin gates the page) — inline check, same
	// pattern as the /api/wizard/* and /api/pickup-days/* routes.
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const content = form.get('content')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	await createMessage(content, locals.user.name ?? locals.user.email);
	return redirect(redirectTo);
};
