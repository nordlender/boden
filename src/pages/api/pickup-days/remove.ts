import type { APIRoute } from 'astro';
import { removeAvailablePickupDate } from '../../../lib/pickupDays';
import { safeRedirectTarget } from '../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const date = form.get('date')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/pickup-days');

	if (date) {
		await removeAvailablePickupDate(date);
	}
	return redirect(redirectTo);
};
