export const prerender = false;

import type { APIRoute } from 'astro';
import { acceptOrder } from '../../../../../lib/moderatorOrders';
import { isPositiveInteger, requireModerator } from '../../../../../lib/wizard-http';

export const POST: APIRoute = async ({ params, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = Number(params.id);
	if (!isPositiveInteger(orderId)) {
		return new Response('Invalid order id', { status: 400 });
	}

	const result = await acceptOrder(orderId);
	if (!result.ok) {
		// Only reachable via a stale/tampered POST — the review page already
		// hides the Accept button once an order has been reviewed.
		return new Response('Order is not pending review', { status: 409 });
	}

	return redirect('/moderator/requests', 303);
};
