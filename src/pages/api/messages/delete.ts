import type { APIRoute } from 'astro';
import { deleteMessage } from '../../../lib/messages';
import { safeRedirectTarget } from '../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const idRaw = form.get('id');
	// A missing/non-string field must fail this check rather than coerce to
	// 0 (Number(null) === 0), which would otherwise pass Number.isInteger
	// and silently act on message id 0.
	const id = typeof idRaw === 'string' ? Number(idRaw) : NaN;
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	if (Number.isInteger(id)) {
		await deleteMessage(id);
	}
	return redirect(redirectTo);
};
