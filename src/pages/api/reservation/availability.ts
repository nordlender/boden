import type { APIRoute } from 'astro';
import { getReservationAvailability, isValidDateRange } from '../../../lib/reservation';

export const prerender = false;

// Per-item, date- and quantity-aware availability for a chosen [from, to]
// range — see src/lib/reservation.ts's getReservationAvailability. Requires
// auth: this queries other members' orders (indirectly, via aggregated
// quantities only — no order details are returned).
export const POST: APIRoute = async ({ request, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

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

	const availabilities = await getReservationAvailability({ from: body.from!, to: body.to! }, items);

	return new Response(JSON.stringify({ availabilities }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
