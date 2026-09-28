export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES — see items.ts.
// Sets or clears an item's service/quarantine quantity (issue #62) — the
// per-item form in ItemRow.astro's details box. Admin-only, manual, not
// timed: setting it back to 0 is how it's cleared.

import type { APIRoute } from 'astro';
import { setItemServiceQuantity } from '../../../lib/wizard';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const itemId = Number(form.get('itemId'));
	// Number(null)/Number('') coerce to 0, which Number.isInteger alone would
	// accept as a valid (if odd) "clear to zero" — parse quantity separately
	// so a missing field is rejected as a bad request instead.
	const rawQuantity = form.get('quantity');
	const quantity = Number(rawQuantity);

	if (!isPositiveInteger(itemId) || typeof rawQuantity !== 'string' || rawQuantity.trim() === '' || !Number.isFinite(quantity)) {
		return new Response('Item and service quantity are required', { status: 400 });
	}

	const result = await setItemServiceQuantity(itemId, quantity);
	if (!result.ok) {
		const message = result.error === 'not_found' ? 'Item not found' : 'Service quantity must be between 0 and the item\'s total stock';
		return new Response(message, { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
