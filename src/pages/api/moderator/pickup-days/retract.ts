import type { APIRoute } from 'astro';
import { retractModeratorPickupOffer } from '../../../../lib/pickupDays';
import { requireModerator, safeRedirectTarget } from '../../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const moderatorUserId = locals.user!.id;

	const form = await request.formData();
	const id = Number(form.get('id'));
	const redirectTo = safeRedirectTarget(form, url.origin, '/moderator/pickup-days');

	// retractModeratorPickupOffer's own WHERE clause is the real ownership
	// check (it only ever updates a row that belongs to moderatorUserId) —
	// this Number.isInteger guard is just to skip an obviously-bogus id
	// rather than issuing a pointless query.
	if (Number.isInteger(id) && id > 0) {
		await retractModeratorPickupOffer(id, moderatorUserId);
	}

	return redirect(redirectTo);
};
