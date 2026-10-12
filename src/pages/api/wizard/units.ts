// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.
// Every unit write from /admin/items/[id]/units, dispatched on the form's
// `action`: create (a batch of units sharing fields), update (fields +
// opts), status (with an optional reason, logged as a note) and note
// (append to the lifetime log).

import type { APIRoute } from 'astro';
import {
	addUnitNote,
	createUnits,
	getUnit,
	isUnitStatus,
	parseOptsText,
	setUnitStatus,
	updateUnit,
	type UnitFields,
} from '../../../lib/units';
import { isPositiveInteger, requireAdmin, safeRedirectTarget } from '../../../lib/http';

const FIELD_NAMES = ['brand', 'model', 'marking', 'serialNumber', 'manufacturedAt', 'purchasedAt'] as const;

function readFields(form: FormData): UnitFields {
	const fields: UnitFields = {};
	for (const name of FIELD_NAMES) {
		const value = form.get(name);
		if (typeof value === 'string') fields[name] = value;
	}
	const opts = form.get('opts');
	if (typeof opts === 'string') fields.opts = parseOptsText(opts);
	return fields;
}

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const action = form.get('action');
	const authorId = locals.user?.id ?? null;
	const text = form.get('text')?.toString() ?? '';
	const date = form.get('date')?.toString() || undefined;

	try {
		if (action === 'create') {
			const itemId = Number(form.get('itemId'));
			const count = Number(form.get('count') || 1);
			if (!isPositiveInteger(itemId) || !isPositiveInteger(count) || count > 100) {
				return new Response('Item and a unit count between 1 and 100 are required', { status: 400 });
			}
			await createUnits(itemId, count, readFields(form));
		} else {
			const unitId = Number(form.get('unitId'));
			if (!isPositiveInteger(unitId) || !(await getUnit(unitId))) {
				return new Response('Unit not found', { status: 404 });
			}
			if (action === 'update') {
				await updateUnit(unitId, readFields(form));
			} else if (action === 'status') {
				const status = form.get('status');
				if (!isUnitStatus(status)) return new Response('Unknown status', { status: 400 });
				await setUnitStatus(unitId, status, { text, date, authorId });
			} else if (action === 'note') {
				await addUnitNote(unitId, { text, date, authorId });
			} else {
				return new Response('Unknown action', { status: 400 });
			}
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not save unit';
		return new Response(message, { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
