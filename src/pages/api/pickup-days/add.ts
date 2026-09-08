import type { APIRoute } from 'astro';
import { addAvailablePickupDate, isValidDateString } from '../../../lib/pickupDays';
import { safeRedirectTarget } from '../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	// Not covered by src/middleware/index.ts's route-prefix gate for the
	// /api/... half (only /admin gates the page) — inline check, same
	// pattern as the /api/wizard/* routes.
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const date = form.get('date')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/admin/pickup-days');

	if (!isValidDateString(date)) {
		return redirect(`${redirectTo}?error=invalid_date`);
	}

	await addAvailablePickupDate(date);
	return redirect(redirectTo);
};
