export const prerender = false;

import type { APIRoute } from 'astro';
import { confirmRetrieval, getOrderDetail } from '../../../../../lib/moderatorOrders';
import { requireModerator } from '../../../../../lib/wizard-http';

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = Number(params.id);
	if (!Number.isInteger(orderId) || orderId <= 0) {
		return new Response('Invalid order id', { status: 400 });
	}

	const form = await request.formData();

	// Target quantities come from the DB, never from the submitted form —
	// the count page no longer round-trips them, and trusting a client-sent
	// target would let a POST invent its own pass/fail criteria (or skip a
	// line's qty_<id> field entirely) and confirm the order regardless of
	// what was actually counted.
	const order = await getOrderDetail(orderId);
	if (!order) {
		return new Response('Order is not acceptable for retrieval', { status: 409 });
	}

	// Whether every line's submitted count matches its target is decided
	// here, iterating the order's own full item list (not whatever ids the
	// form happened to include) — confirmRetrieval's own per-line bounds
	// check (0 <= quantity <= requestedQuantity) is defense-in-depth against
	// a stale/tampered POST, not where matching itself is normally decided.
	let allMatch = true;
	const redirectParams = new URLSearchParams();
	const retrieved: { orderItemId: number; quantity: number }[] = [];
	for (const item of order.items) {
		const target = item.requestedQuantity;
		const qtyRaw = form.get(`qty_${item.orderItemId}`);
		const qty = qtyRaw === null ? NaN : Number(qtyRaw);
		if (!Number.isFinite(qty) || qty !== target) {
			allMatch = false;
		}
		redirectParams.set(`target_${item.orderItemId}`, String(target));
		redirectParams.set(`entered_${item.orderItemId}`, String(Number.isFinite(qty) ? qty : 0));
		retrieved.push({ orderItemId: item.orderItemId, quantity: Number.isFinite(qty) ? qty : 0 });
	}

	if (!allMatch) {
		redirectParams.set('mismatch', '1');
		return redirect(`/moderator/retrieve/${orderId}/count?${redirectParams.toString()}`, 303);
	}

	const result = await confirmRetrieval(orderId, locals.user!.id, retrieved);
	if (!result.ok) {
		// Only reachable via a stale/tampered POST — the page's own match
		// check above is what normally prevents these (e.g. someone else
		// already confirmed this order in another tab).
		return new Response(result.error === 'not_acceptable' ? 'Order is not acceptable for retrieval' : 'Quantity exceeds requested', {
			status: result.error === 'not_acceptable' ? 409 : 400,
		});
	}

	return redirect(`/moderator/retrieve/${orderId}?confirmed=1`, 303);
};
