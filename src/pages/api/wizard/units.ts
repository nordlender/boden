// Also gated by src/middleware/prefixes.ts's ROUTE_RULES — see items.ts.
// Every unit write from /admin/items/[id]/units, dispatched on the form's
// `action`: create (a batch of units sharing fields), update (fields +
// opts) and status (with an optional reason, posted as a unit note). Plain
// notes are messages, posted through /api/messages/add with a unitId.
//
// The units page submits these forms with fetch (src/lib/unit-forms.ts,
// `Accept: application/json`): success is `{ ok: true }` and a failure is
// `{ error: <message for the admin> }` with a 4xx status, so the page can
// show the message inline without losing what was typed. A plain form post
// (no JS) still gets the redirect, or the message as a text response.

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
import { isPositiveInteger, json, requireAdmin, safeRedirectTarget } from '../../../lib/http';
import { isForeignKeyViolation } from '../../../lib/db-errors';

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

	const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
	const fail = (message: string, status: number) => (wantsJson ? json({ error: message }, status) : new Response(message, { status }));

	const form = await request.formData();
	const action = form.get('action');

	try {
		if (action === 'create') {
			const itemId = Number(form.get('itemId'));
			const count = Number(form.get('count') || 1);
			if (!isPositiveInteger(itemId) || !isPositiveInteger(count) || count > 100) {
				return fail('Enter how many units to add (1–100).', 400);
			}
			await createUnits(itemId, count, readFields(form));
		} else {
			const unitId = Number(form.get('unitId'));
			if (!isPositiveInteger(unitId)) return fail('Unit not found.', 404);
			let found: boolean;
			if (action === 'update') {
				found = await updateUnit(unitId, readFields(form));
			} else if (action === 'status') {
				const status = form.get('status');
				if (!isUnitStatus(status)) return fail('Unknown status.', 400);
				// requireAdmin above guarantees locals.user is set.
				const author = { id: locals.user!.id, name: locals.user!.name ?? locals.user!.email };
				found = await setUnitStatus(unitId, status, author, form.get('reason')?.toString());
			} else {
				return fail('Unknown action.', 400);
			}
			if (!found) return fail('Unit not found.', 404);
		}
	} catch (err) {
		// Drizzle wraps the sqlite error; the constraint code is on its cause.
		if (isForeignKeyViolation(err) || isForeignKeyViolation((err as { cause?: unknown }).cause)) {
			return fail('Item not found.', 404);
		}
		// Validation errors from src/lib/units.ts are written for the admin.
		return fail(err instanceof Error ? err.message : 'Could not save the unit.', 400);
	}

	return wantsJson ? json({ ok: true }) : redirect(safeRedirectTarget(form, url.origin));
};
