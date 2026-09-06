import type { APIRoute } from 'astro';
import { removeAvailablePickupDate } from '../../../lib/pickupDays';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}

	const form = await request.formData();
	const date = form.get('date')?.toString() ?? '';
	const redirectTo = form.get('redirectTo')?.toString() || '/admin/pickup-days';

	if (date) {
		await removeAvailablePickupDate(date);
	}
	return redirect(redirectTo);
};
