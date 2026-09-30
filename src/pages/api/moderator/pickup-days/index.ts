export const prerender = false;

// Also gated by src/middleware/index.ts's MOD_ROUTE_PREFIXES ('/api/moderator'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).
// Reachable by admins too (requireModerator/isModerator both treat admin as
// at-least-moderator) — the admin page's calendar reuses this same endpoint
// for its own single-day submissions, see src/pages/admin/pickup-days.astro.

import type { APIRoute } from 'astro';
import { createSingleDays, isValidDateString, isValidTimeString } from '../../../../lib/pickupDays';
import { requireModerator } from '../../../../lib/wizard-http';

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

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 });
	}

	const days = body && typeof body === 'object' ? (body as { days?: unknown }).days : undefined;
	if (!Array.isArray(days) || days.length === 0 || !days.every(isValidDay)) {
		return new Response(JSON.stringify({ error: 'invalid_days' }), { status: 400 });
	}

	await createSingleDays(
		locals.user!.id,
		days.map((day) => ({ date: day.date, startTime: day.startTime, endTime: day.endTime, where: day.where.trim() })),
	);

	return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
