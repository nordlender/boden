export const prerender = false;

import type { APIRoute } from 'astro';
import { getOrderDetail, markReturned } from '../../../../../lib/moderatorOrders';
import { requireModerator } from '../../../../../lib/wizard-http';

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = Number(params.id);
	if (!Number.isInteger(orderId) || orderId <= 0) {
		return new Response('Invalid order id', { status: 400 });
	}

	const order = await getOrderDetail(orderId);
	if (!order) {
		return new Response('Order not found', { status: 404 });
	}

	const form = await request.formData();

	// Never trust a target from the form — there isn't one to thread through
	// anyway (unlike the confirm-retrieval flow's target_* fields, a return
	// has no prior page carrying a target forward); the real target is each
	// line's retrievedQuantity, read fresh from the order.
	let allMatch = true;
	const redirectParams = new URLSearchParams();
	for (const item of order.items) {
		const target = item.retrievedQuantity ?? 0;
		const raw = form.get(`qty_${item.orderItemId}`);
		const qty = Number(raw);
		if (!Number.isFinite(qty) || qty !== target) {
			allMatch = false;
		}
		redirectParams.set(`entered_${item.orderItemId}`, String(Number.isFinite(qty) ? qty : 0));
	}

	if (!allMatch) {
		redirectParams.set('mismatch', '1');
		return redirect(`/moderator/return/${orderId}?${redirectParams.toString()}`, 303);
	}

	const result = await markReturned(orderId, locals.user!.id);
	if (!result.ok) {
		// Only reachable via a stale/tampered POST — the return page already
		// redirects away from a non-active order.
		return new Response('Order is not active', { status: 409 });
	}

	return redirect(`/moderator/orders/${orderId}?returned=1`, 303);
};
