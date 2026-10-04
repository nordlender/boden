export const prerender = false;

// Also gated by src/middleware/prefixes.ts's ROUTE_RULES ('/api/moderator'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).
// Reachable by admins too (requireModerator goes through hasRole, which treats
// admin as at-least-moderator) — the admin page's calendar reuses this same endpoint
// for its own single-day submissions, see src/pages/admin/pickup-days.astro.

import type { APIRoute } from 'astro';
import { createSingleDays, isValidDateString, isValidTimeString } from '../../../../lib/pickupDays';
import { json, jsonError, readJson, requireModerator } from '../../../../lib/http';

interface SelectedDayInput {
	date: string;
	startTime: string;
	endTime: string;
	where: string;
}

function isValidDay(day: unknown): day is SelectedDayInput {
	if (!day || typeof day !== 'object') return false;
	const { date, startTime, endTime, where } = day as Record<string, unknown>;
	return (
		typeof date === 'string' &&
		isValidDateString(date) &&
		typeof startTime === 'string' &&
		isValidTimeString(startTime) &&
		typeof endTime === 'string' &&
		isValidTimeString(endTime) &&
		endTime > startTime &&
		typeof where === 'string' &&
		where.trim().length > 0
	);
}

export const POST: APIRoute = async ({ request, locals }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const body = await readJson(request);
	if (!body) return jsonError('invalid_body', 400);

	const days = body.days;
	if (!Array.isArray(days) || days.length === 0 || !days.every(isValidDay)) {
		return jsonError('invalid_days', 400);
	}

	await createSingleDays(
		locals.user!.id,
		days.map((day) => ({ date: day.date, startTime: day.startTime, endTime: day.endTime, where: day.where.trim() })),
	);

	return json({ ok: true });
};
