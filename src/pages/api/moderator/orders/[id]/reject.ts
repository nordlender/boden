export const prerender = false;

import type { APIRoute } from 'astro';
import { getOrderCodeById, rejectOrder } from '../../../../../lib/moderatorOrders';
import { isPositiveInteger, requireModerator } from '../../../../../lib/wizard-http';

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = Number(params.id);
	if (!isPositiveInteger(orderId)) {
		return new Response('Invalid order id', { status: 400 });
	}

	const form = await request.formData();
	const reasonField = form.get('reason');
	const reason = typeof reasonField === 'string' ? reasonField.trim() : '';
	if (!reason) {
		// Should be rare — the page's <textarea> is `required` — but redirect
		// back with the page's own error-display convention rather than a raw
		// 400, matching the page's ?error=blank_reason handling. The review
		// page is keyed by order code, not id, so look the code up first.
		const orderCode = await getOrderCodeById(orderId);
		return redirect(orderCode ? `/moderator/review/${orderCode}?error=blank_reason` : '/moderator/requests', 303);
	}

	const result = await rejectOrder(orderId, reason);
	if (!result.ok) {
		// not_pending_review — only reachable via a stale/tampered POST. The
		// reason is already validated non-blank above, so rejectOrder's own
		// blank_reason result can't occur here.
		return new Response('Order is not pending review', { status: 409 });
	}

	return redirect('/moderator/requests', 303);
};
