import type { APIRoute } from 'astro';
import { getCartLineAvailability, isValidDateRange, type ReservationLine } from '../../../lib/reservation';
import { getSetChildrenBulk, getValidSetIds, type SetChild } from '../../../lib/sets';
import { isPositiveInteger, json, jsonError, readJsonObject, requireUser } from '../../../lib/http';

type LineInput = { key: string; itemId: number; quantity: number } | { key: string; setId: number; quantity: number };

function isPositiveInt(value: unknown): value is number {
	return typeof value === 'number' && isPositiveInteger(value);
}

// The body is untrusted JSON, so a `lines` entry has to be proven to be one
// of the two shapes before anything dereferences it.
function isLineInput(line: unknown): line is LineInput {
	if (typeof line !== 'object' || line === null) return false;
	const { key, quantity, itemId, setId } = line as Record<string, unknown>;
	if (typeof key !== 'string' || !isPositiveInt(quantity)) return false;
	return isPositiveInt(itemId) !== isPositiveInt(setId);
}

// An archived set, or one with an archived component, resolves to no
// requirements at all — getCartLineAvailability already reports an
// empty-requirements line as unavailable, matching what checkout would
// actually do with it (orders.ts's resolveOrderableEntries drops the same
// set for the same reason via this same getValidSetIds check), rather than
// showing "available" here off stale/incomplete data.
function resolveItemRequirements(
	line: LineInput,
	childrenBySet: Map<number, SetChild[]>,
	validSetIds: Set<number>,
): { itemId: number; quantity: number }[] {
	if ('itemId' in line) {
		return [{ itemId: line.itemId, quantity: line.quantity }];
	}
	if (!validSetIds.has(line.setId)) {
		return [];
	}
	return (childrenBySet.get(line.setId) ?? []).map((child) => ({
		itemId: child.itemId,
		quantity: child.quantity * line.quantity,
	}));
}

// Per-cart-line (item or set), date- and quantity-aware availability for a
// chosen [from, to] range — see src/lib/reservation.ts's
// getCartLineAvailability. Requires auth: this queries other members'
// orders (indirectly, via aggregated quantities only — no order details are
// returned).
export const POST: APIRoute = async ({ request, locals }) => {
	const authError = requireUser(locals);
	if (authError) return authError;

	const body = await readJsonObject(request);
	if (!body) return jsonError('invalid_json', 400);

	const { from, to, lines: rawLines } = body;
	if (typeof from !== 'string' || typeof to !== 'string' || !isValidDateRange({ from, to }) || !Array.isArray(rawLines)) {
		return jsonError('invalid_request', 400);
	}

	// Any malformed entry rejects the whole request, rather than being
	// dropped — a silently shorter result would misalign with the caller's lines.
	if (rawLines.length === 0 || !rawLines.every(isLineInput)) {
		return jsonError('invalid_request', 400);
	}
	const lineInputs: LineInput[] = rawLines;

	const setIds = lineInputs
		.filter((line): line is { key: string; setId: number; quantity: number } => 'setId' in line)
		.map((line) => line.setId);
	const [childrenBySet, validSetIds] = await Promise.all([getSetChildrenBulk(setIds), getValidSetIds(setIds)]);

	const lines: ReservationLine[] = lineInputs.map((line) => ({
		key: line.key,
		itemRequirements: resolveItemRequirements(line, childrenBySet, validSetIds),
	}));

	return json({ availabilities: getCartLineAvailability({ from, to }, lines) });
};
