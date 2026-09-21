export const prerender = false;

import type { APIRoute } from 'astro';
import { confirmRetrieval } from '../../../../../lib/moderatorOrders';
import { requireModerator } from '../../../../../lib/wizard-http';

// order_items ids in a submitted target_<id>/qty_<id> field name — matches
// the ids threaded through by the checklist/count pages' hidden fields.
const FIELD_ID_RE = /^target_(\d+)$/;

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const orderId = Number(params.id);
	if (!Number.isInteger(orderId) || orderId <= 0) {
		return new Response('Invalid order id', { status: 400 });
	}

	const form = await request.formData();

	const orderItemIds: number[] = [];
	for (const key of form.keys()) {
		const match = FIELD_ID_RE.exec(key);
		if (match) orderItemIds.push(Number(match[1]));
	}

	// Whether every line's submitted count matches its target is decided
	// here, from the form's own target_*/qty_* pairs — confirmRetrieval's
	// own per-line bounds check (0 <= quantity <= requestedQuantity) is
	// defense-in-depth against a stale/tampered POST, not where matching
	// itself is normally decided.
	let allMatch = true;
	const redirectParams = new URLSearchParams();
	const retrieved: { orderItemId: number; quantity: number }[] = [];
	for (const orderItemId of orderItemIds) {
		const target = Number(form.get(`target_${orderItemId}`));
		const qty = Number(form.get(`qty_${orderItemId}`));
		if (!Number.isFinite(qty) || qty !== target) {
			allMatch = false;
		}
		redirectParams.set(`target_${orderItemId}`, String(Number.isFinite(target) ? target : 0));
		redirectParams.set(`entered_${orderItemId}`, String(Number.isFinite(qty) ? qty : 0));
		retrieved.push({ orderItemId, quantity: Number.isFinite(qty) ? qty : 0 });
	}

	if (!allMatch) {
		redirectParams.set('mismatch', '1');
		return redirect(`/moderator/confirm/${orderId}/count?${redirectParams.toString()}`, 303);
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

	return redirect(`/moderator/orders/${orderId}?confirmed=1`, 303);
};
