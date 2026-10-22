import type { APIRoute } from 'astro';
import { acceptOrder, getOrderCodeById } from '../../../../../lib/moderatorOrders';
import { parseIdParam, requireModerator } from '../../../../../lib/http';

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = parseIdParam(params.id);
	if (orderId === null) {
		return new Response('Invalid order id', { status: 400 });
	}

	// The confirmed pick-up and return windows (#343), chosen on the review
	// page. acceptOrder checks them against the order inside its transaction.
	const form = await request.formData();
	const dayId = (name: string) => parseIdParam(form.get(name)?.toString());
	const result = await acceptOrder(orderId, { pickupDayId: dayId('pickupDayId'), returnDayId: dayId('returnDayId') });
	if (!result.ok) {
		if (result.error === 'not_pending_review') {
			// Only reachable via a stale/tampered POST — the review page already
			// hides the Accept button once an order has been reviewed.
			return new Response('Order is not pending review', { status: 409 });
		}
		// The review page disables Accept in these cases too, so this means
		// something changed in between (a window deleted, the date passed).
		const orderCode = await getOrderCodeById(orderId);
		const error = result.error === 'invalid_window' ? `invalid_${result.kind}_window` : result.error;
		return redirect(orderCode ? `/moderator/review/${orderCode}?error=${error}` : '/moderator/requests', 303);
	}

	return redirect('/moderator/requests', 303);
};
