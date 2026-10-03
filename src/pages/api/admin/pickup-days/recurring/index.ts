export const prerender = false;

// Also gated by src/middleware/index.ts's ADMIN_ROUTE_PREFIXES
// ('/api/admin/pickup-days') — defense-in-depth, keep this inline check too.

import type { APIRoute } from 'astro';
import { createRecurringRule, isValidDateString, isValidTimeString } from '../../../../../lib/pickupDays';
import { json, jsonError, readJson, requireAdmin } from '../../../../../lib/http';

export const POST: APIRoute = async ({ request, locals }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const body = await readJson(request);
	if (!body) return jsonError('invalid_body', 400);

	const { weekday, startTime, endTime, startDate, endDate } = body;

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
		return jsonError('invalid_rule', 400);
	}

	const rule = await createRecurringRule({
		createdByUserId: locals.user!.id,
		weekday,
		startTime,
		endTime,
		startDate,
		endDate,
	});

	return json({ ok: true, rule });
};
