import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { moderatorPickupOffers, pickupAvailableDays, users } from '../db/schema';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^\d{2}:\d{2}$/;

export function isValidDateString(value: string): boolean {
	return DATE_FORMAT.test(value);
}

// HH:MM only — good enough to catch obviously-malformed input before it
// hits the DB check constraint (moderator_pickup_offers_time_range_valid),
// which is the real source of truth for ordering. Doesn't validate hour/
// minute ranges (e.g. "99:99") since the check constraint's string
// comparison doesn't need that to order two times correctly either.
export function isValidTimeString(value: string): boolean {
	return TIME_FORMAT.test(value);
}

export type ModeratorPickupOffer = {
	id: number;
	moderatorUserId: string;
	date: string;
	startTime: string | null;
	endTime: string | null;
	status: 'active' | 'retracted';
	createdAt: Date;
	retractedAt: Date | null;
};

// Every pick-up day from `fromDate` onward with either an admin-confirmed
// baseline row (pickupAvailableDays) or at least one active moderator
// ad-hoc offer (moderatorPickupOffers) — used by the /reservation page to
// color the calendar. A date needs only one of the two sources to count;
// callers don't need to know which source it came from, so this returns a
// flat, deduped, sorted list exactly like it did before moderator offers
// existed. Day-granular only: startTime/endTime on an offer don't affect
// whether its date shows up here (see GitHub issue #56's design notes).
//
// No upper bound on either query: admins/moderators are expected to only
// ever add a modest number of upcoming dates, so there's no pagination
// concern here.
export async function getUpcomingAvailablePickupDates(fromDate: string): Promise<string[]> {
	const [baselineRows, offerRows] = await Promise.all([
		db.select({ date: pickupAvailableDays.date }).from(pickupAvailableDays).where(gte(pickupAvailableDays.date, fromDate)),
		db
			.select({ date: moderatorPickupOffers.date })
			.from(moderatorPickupOffers)
			.where(and(gte(moderatorPickupOffers.date, fromDate), eq(moderatorPickupOffers.status, 'active'))),
	]);

	const dates = new Set<string>();
	for (const row of baselineRows) dates.add(row.date);
	for (const row of offerRows) dates.add(row.date);
	return Array.from(dates).sort();
}

// All admin-baseline dates on record, past and future — the admin page
// shows the full history rather than silently hiding rows that have
// already passed. Baseline-only, deliberately: /admin/pickup-days manages
// the admin baseline, not moderator ad-hoc offers (those are managed on
// /moderator/pickup-days instead).
export async function listAvailablePickupDates(): Promise<string[]> {
	const rows = await db.select({ date: pickupAvailableDays.date }).from(pickupAvailableDays).orderBy(asc(pickupAvailableDays.date));
	return rows.map((row) => row.date);
}

export async function addAvailablePickupDate(date: string): Promise<void> {
	if (!isValidDateString(date)) return;
	await db.insert(pickupAvailableDays).values({ date }).onConflictDoNothing();
}

export async function removeAvailablePickupDate(date: string): Promise<void> {
	await db.delete(pickupAvailableDays).where(eq(pickupAvailableDays.date, date));
}

// A moderator's own ad-hoc offers, all statuses, most recent first — same
// "show full history" convention as listAvailablePickupDates, so a
// moderator can see their own past/retracted offers, not just active ones.
export async function listModeratorPickupOffers(moderatorUserId: string): Promise<ModeratorPickupOffer[]> {
	const rows = await db
		.select()
		.from(moderatorPickupOffers)
		.where(eq(moderatorPickupOffers.moderatorUserId, moderatorUserId))
		.orderBy(desc(moderatorPickupOffers.date));
	return rows as ModeratorPickupOffer[];
}

export type ModeratorPickupOfferWithModeratorName = ModeratorPickupOffer & {
	// Falls back to the offering moderator's email when they have no display
	// name set (users.name is nullable — see src/db/schema.ts), so the
	// "other moderators" list never renders a blank.
	moderatorLabel: string;
};

// Every other moderator's active, upcoming offer — read-only visibility
// into "who else is covering" so moderators can avoid piling onto a date
// that's already covered, without granting them any control over rows they
// don't own (see retractModeratorPickupOffer below). Joined against `users`
// purely for display (a name/email to show, not for any access check).
export async function listActiveUpcomingModeratorOffers(
	fromDate: string,
	excludingModeratorUserId?: string,
): Promise<ModeratorPickupOfferWithModeratorName[]> {
	const rows = await db
		.select({
			id: moderatorPickupOffers.id,
			moderatorUserId: moderatorPickupOffers.moderatorUserId,
			date: moderatorPickupOffers.date,
			startTime: moderatorPickupOffers.startTime,
			endTime: moderatorPickupOffers.endTime,
			status: moderatorPickupOffers.status,
			createdAt: moderatorPickupOffers.createdAt,
			retractedAt: moderatorPickupOffers.retractedAt,
			moderatorName: users.name,
			moderatorEmail: users.email,
		})
		.from(moderatorPickupOffers)
		.innerJoin(users, eq(moderatorPickupOffers.moderatorUserId, users.id))
		.where(and(gte(moderatorPickupOffers.date, fromDate), eq(moderatorPickupOffers.status, 'active')))
		.orderBy(asc(moderatorPickupOffers.date));

	return rows
		.filter((row) => row.moderatorUserId !== excludingModeratorUserId)
		.map(({ moderatorName, moderatorEmail, ...offer }) => ({
			...offer,
			moderatorLabel: moderatorName ?? moderatorEmail,
		}));
}

export type AddModeratorPickupOfferInput = {
	moderatorUserId: string;
	date: string;
	startTime?: string | null;
	endTime?: string | null;
};

export type AddModeratorPickupOfferResult = { ok: true } | { ok: false; error: 'invalid_date' | 'invalid_time' | 'invalid_time_range' };

// Validates and inserts one ad-hoc offer. Time fields are optional — a
// moderator can offer a whole day with no time window at all. Validation
// mirrors the DB check constraint (end > start when both are given) so a
// malformed submission gets a friendly error instead of a raw constraint
// failure.
export async function addModeratorPickupOffer(input: AddModeratorPickupOfferInput): Promise<AddModeratorPickupOfferResult> {
	const { moderatorUserId, date } = input;
	const startTime = input.startTime?.trim() || null;
	const endTime = input.endTime?.trim() || null;

	if (!isValidDateString(date)) return { ok: false, error: 'invalid_date' };
	if (startTime && !isValidTimeString(startTime)) return { ok: false, error: 'invalid_time' };
	if (endTime && !isValidTimeString(endTime)) return { ok: false, error: 'invalid_time' };
	if (startTime && endTime && endTime <= startTime) return { ok: false, error: 'invalid_time_range' };

	await db.insert(moderatorPickupOffers).values({ moderatorUserId, date, startTime, endTime });
	return { ok: true };
}

// Retracts one of a moderator's own offers. The ownership check is baked
// into the WHERE clause (not just checked beforehand in the caller) so a
// crafted request for someone else's offer id is a silent no-op rather than
// a mistaken retraction — this is the only path that can retract an
// ad-hoc offer at all; admins do not get an override in this PR (see GitHub
// issue #56's design notes — flagged as an open question, not built here).
// Also excludes already-retracted rows so retractedAt isn't clobbered by a
// repeat call.
export async function retractModeratorPickupOffer(id: number, actingModeratorUserId: string): Promise<void> {
	await db
		.update(moderatorPickupOffers)
		.set({ status: 'retracted', retractedAt: new Date() })
		.where(
			and(
				eq(moderatorPickupOffers.id, id),
				eq(moderatorPickupOffers.moderatorUserId, actingModeratorUserId),
				eq(moderatorPickupOffers.status, 'active'),
			),
		);
}
