import type { APIRoute } from 'astro';
import { unpinMessage } from '../../../lib/messages';
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
	const idRaw = form.get('id');
	const id = typeof idRaw === 'string' ? Number(idRaw) : Number.NaN;
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	if (Number.isInteger(id)) {
		await unpinMessage(id);
	}
	return redirect(redirectTo);
};
