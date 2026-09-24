import type { APIRoute } from 'astro';
import { updateMessage } from '../../../lib/messages';
import { safeRedirectTarget } from '../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const id = Number(form.get('id'));
	const content = form.get('content')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

	if (Number.isInteger(id)) {
		await updateMessage(id, content);
	}
	return redirect(redirectTo);
};
