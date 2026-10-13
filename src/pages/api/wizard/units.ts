// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.
// Every unit write from /admin/items/[id]/units, dispatched on the form's
// `action`: create (a batch of units sharing fields), update (fields +
// opts) and status (with an optional reason, posted as a unit note). Plain
// notes are messages, posted through /api/messages/add with a unitId.

import type { APIRoute } from 'astro';
import {
	createUnits,
	isUnitStatus,
	parseOptsFields,
	setUnitStatus,
	UNIT_TEXT_FIELDS,
	updateUnit,
	type UnitFields,
} from '../../../lib/units';
import { isPositiveInteger, requireAdmin, safeRedirectTarget } from '../../../lib/http';

function readFields(form: FormData): UnitFields {
	const fields: UnitFields = {};
	for (const name of UNIT_TEXT_FIELDS) {
		const value = form.get(name);
		if (typeof value === 'string') fields[name] = value;
	}
	// Opts arrive as paired optKey/optValue inputs (OptsFields.astro). The
	// hidden `opts` marker says the form had an opts section at all, so an
	// update that removes every row clears opts instead of leaving them.
	if (form.has('opts')) {
		const strings = (name: string) => form.getAll(name).map((value) => value.toString());
		fields.opts = parseOptsFields(strings('optKey'), strings('optValue'));
	}
	return fields;
}

export const POST: APIRoute = async ({ request, redirect, locals, url }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const action = form.get('action');

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
			if (!isPositiveInteger(unitId)) return new Response('Unit not found', { status: 404 });
			let found: boolean;
			if (action === 'update') {
				found = await updateUnit(unitId, readFields(form));
			} else if (action === 'status') {
				const status = form.get('status');
				if (!isUnitStatus(status)) return new Response('Unknown status', { status: 400 });
				// requireAdmin above guarantees locals.user is set.
				const author = { id: locals.user!.id, name: locals.user!.name ?? locals.user!.email };
				found = await setUnitStatus(unitId, status, author, form.get('reason')?.toString());
			} else {
				return new Response('Unknown action', { status: 400 });
			}
			if (!found) return new Response('Unit not found', { status: 404 });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not save unit';
		return new Response(message, { status: 400 });
	}

	return redirect(safeRedirectTarget(form, url.origin));
};
