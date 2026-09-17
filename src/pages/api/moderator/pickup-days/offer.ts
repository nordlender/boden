import type { APIRoute } from 'astro';
import { addModeratorPickupOffer } from '../../../../lib/pickupDays';
import { requireModerator, safeRedirectTarget } from '../../../../lib/wizard-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
	// Not covered by src/middleware/index.ts's route-prefix gate for the
	// /api/... half beyond the generic role check — inline check, same
	// pattern as /api/pickup-days/add.ts and the /api/wizard/* routes.
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	// requireModerator already rejected a missing/member user above, so
	// locals.user is guaranteed here.
	const moderatorUserId = locals.user!.id;

	const form = await request.formData();
	const date = form.get('date')?.toString() ?? '';
	const startTime = form.get('startTime')?.toString() ?? '';
	const endTime = form.get('endTime')?.toString() ?? '';
	const redirectTo = safeRedirectTarget(form, url.origin, '/moderator/pickup-days');

	const result = await addModeratorPickupOffer({ moderatorUserId, date, startTime, endTime });
	if (!result.ok) {
		return redirect(`${redirectTo}?error=${result.error}`);
	}

	return redirect(redirectTo);
};
