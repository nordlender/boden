import type { APIRoute } from 'astro';
import { updateMessage } from '../../../lib/messages';
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
	const id = typeof idRaw === 'string' ? Number(idRaw) : Number.NaN;
	const content = form.get('content')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	if (!Number.isInteger(id)) return redirect(redirectTo);

	const updated = await updateMessage(id, content);
	if (!updated) return redirect(`${redirectTo}?error=empty_message`);
	return redirect(redirectTo);
};
