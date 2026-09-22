export const prerender = false;

import type { APIRoute } from 'astro';
import { rejectOrder } from '../../../../../lib/moderatorOrders';
import { requireModerator } from '../../../../../lib/wizard-http';

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = Number(params.id);
	if (!Number.isInteger(orderId) || orderId <= 0) {
		return new Response('Invalid order id', { status: 400 });
	}

	const form = await request.formData();
	const reason = String(form.get('reason') ?? '').trim();
	if (!reason) {
		// Should be rare — the page's <textarea> is `required` — but redirect
		// back with the page's own error-display convention rather than a raw
		// 400, matching the page's ?error=blank_reason handling.
		return redirect(`/moderator/review/${orderId}?error=blank_reason`, 303);
	}

	const result = await rejectOrder(orderId, reason);
	if (!result.ok) {
		if (result.error === 'blank_reason') {
			return redirect(`/moderator/review/${orderId}?error=blank_reason`, 303);
		}
		// not_pending_review — only reachable via a stale/tampered POST.
		return new Response('Order is not pending review', { status: 409 });
	}

	return redirect(`/moderator/retrieve/${orderId}`, 303);
};
