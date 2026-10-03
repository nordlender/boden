import type { APIRoute } from 'astro';
import { getReservationAvailability, isValidDateRange } from '../../../lib/reservation';
import { isPositiveInteger, json, jsonError, readJsonObject, requireUser } from '../../../lib/http';

interface ItemInput {
	itemId: number;
	quantity: number;
}

function isItemInput(value: unknown): value is ItemInput {
	if (!value || typeof value !== 'object') return false;
	const { itemId, quantity } = value as Record<string, unknown>;
	return typeof itemId === 'number' && isPositiveInteger(itemId) && typeof quantity === 'number' && isPositiveInteger(quantity);
}

// Per-item, date- and quantity-aware availability for a chosen [from, to]
// range — see src/lib/reservation.ts's getReservationAvailability. Requires
// auth: this queries other members' orders (indirectly, via aggregated
// quantities only — no order details are returned).
export const POST: APIRoute = async ({ request, locals }) => {
	const authError = requireUser(locals);
	if (authError) return authError;

	const body = await readJsonObject(request);
	if (!body) return jsonError('invalid_json', 400);

	const { from, to, items } = body;
	if (
		typeof from !== 'string' ||
		typeof to !== 'string' ||
		!isValidDateRange({ from, to }) ||
		!Array.isArray(items) ||
		items.length === 0 ||
		!items.every(isItemInput)
	) {
		return jsonError('invalid_request', 400);
	}

	return json({ availabilities: getReservationAvailability({ from, to }, items) });
};
