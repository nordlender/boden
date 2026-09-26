import type { APIRoute } from 'astro';
import { getCartLineAvailability, isValidDateRange, type ReservationLine } from '../../../lib/reservation';
import { getSetChildrenBulk } from '../../../lib/sets';

export const prerender = false;

type LineInput = { key: string; itemId: number; quantity: number } | { key: string; setId: number; quantity: number };

// Per-cart-line (item or set), date- and quantity-aware availability for a
// chosen [from, to] range — see src/lib/reservation.ts's
// getCartLineAvailability. Requires auth: this queries other members'
// orders (indirectly, via aggregated quantities only — no order details are
// returned).
export const POST: APIRoute = async ({ request, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	let body: { from?: string; to?: string; lines?: LineInput[] };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
	}

	const lineInputs = body.lines ?? [];
	if (!isValidDateRange({ from: body.from, to: body.to }) || lineInputs.length === 0) {
		return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
	}

	const setIds = lineInputs
		.filter((line): line is { key: string; setId: number; quantity: number } => 'setId' in line)
		.map((line) => line.setId);
	const childrenBySet = await getSetChildrenBulk(setIds);

	const lines: ReservationLine[] = lineInputs.map((line) => ({
		key: line.key,
		itemRequirements:
			'itemId' in line
				? [{ itemId: line.itemId, quantity: line.quantity }]
				: (childrenBySet.get(line.setId) ?? []).map((child) => ({
						itemId: child.itemId,
						quantity: child.quantity * line.quantity,
					})),
	}));

	const availabilities = getCartLineAvailability({ from: body.from!, to: body.to! }, lines);

	return new Response(JSON.stringify({ availabilities }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
