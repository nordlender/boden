export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES
// ('/api/admin/pickup-days') — defense-in-depth, keep this inline check too.

import type { APIRoute } from 'astro';
import { createRecurringRule, isValidDateString, isValidTimeString } from '../../../../../lib/pickupDays';
import { requireAdmin } from '../../../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, locals }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 });
	}

	const { weekday, startTime, endTime, startDate, endDate } = (body ?? {}) as Record<string, unknown>;

	if (
		typeof weekday !== 'number' ||
		!Number.isInteger(weekday) ||
		weekday < 0 ||
		weekday > 6 ||
		typeof startTime !== 'string' ||
		!isValidTimeString(startTime) ||
		typeof endTime !== 'string' ||
		!isValidTimeString(endTime) ||
		endTime <= startTime ||
		typeof startDate !== 'string' ||
		!isValidDateString(startDate) ||
		typeof endDate !== 'string' ||
		!isValidDateString(endDate) ||
		endDate < startDate
	) {
		return new Response(JSON.stringify({ error: 'invalid_rule' }), { status: 400 });
	}

	const rule = await createRecurringRule({
		createdByUserId: locals.user!.id,
		weekday,
		startTime,
		endTime,
		startDate,
		endDate,
	});

	return new Response(JSON.stringify({ ok: true, rule }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
