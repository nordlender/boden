import type { APIRoute } from 'astro';
import { db } from '../../../db/client';
import { reservedQuantitiesByItem } from '../../../lib/stock';
import { stubAvailabilityFromCart, isValidDateRange } from '../../../lib/reservation';

export const prerender = false;

// Recomputes per-item availability for a chosen [from, to] range.
//
// STUB: `from`/`to` are validated but not yet used to scope the query — see
// src/lib/reservation.ts's stubAvailabilityFromCart. Today this returns the
// same date-less "in stock right now" figure src/lib/cart.ts uses, just
// reshaped for the reservation page. The schema/backend follow-up worktree
// is what makes this endpoint actually date-aware (and, per TASKS.md,
// quantity-aware per range — e.g. 2x item A can be unavailable in a range
// where 1x item A would not be).
export const POST: APIRoute = async ({ request }) => {
	let body: { from?: string; to?: string; items?: { itemId: number; quantity: number }[] };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
	}

	const items = body.items ?? [];
	if (!isValidDateRange({ from: body.from, to: body.to }) || items.length === 0) {
		return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
	}

	const itemIds = items.map((entry) => entry.itemId);
	const rows = await db.query.items.findMany({
		where: (t, { inArray }) => inArray(t.id, itemIds),
		columns: { id: true, stockCount: true },
	});
	const stockById = new Map(rows.map((row) => [row.id, row.stockCount]));
	const reserved = await reservedQuantitiesByItem(itemIds);

	const availabilities = stubAvailabilityFromCart(
		items.map((entry) => ({
			itemId: entry.itemId,
			quantity: entry.quantity,
			inStock: (stockById.get(entry.itemId) ?? 0) - (reserved.get(entry.itemId) ?? 0),
		})),
	);

	return new Response(JSON.stringify({ availabilities }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
