import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { pickupDays, pickupRecurringRules } from '../db/schema';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateString(value: string): boolean {
	return DATE_FORMAT.test(value);
}

export function isValidTimeString(value: string): boolean {
	return TIME_FORMAT.test(value);
}

// Sunday-first, matching JS Date#getDay() — pickupRecurringRules.weekday and
// PickupDaysCalendar/RecurringPickupDayForm's <select> values both key off
// this same index.
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type PickupDayKind = 'single' | 'recurring';

export interface PickupDayRow {
	id: number;
	date: string;
	startTime: string;
	endTime: string;
	where: string | null;
	userId: string;
	kind: PickupDayKind;
	recurringRuleId: number | null;
}

export interface PickupRecurringRuleRow {
	id: number;
	createdByUserId: string;
	weekday: number;
	startTime: string;
	endTime: string;
	startDate: string;
	endDate: string;
}

// Every pick-up day from `fromDate` onward, of either kind — used by the
// /reservation page to color the calendar. Same contract as the old
// pickupAvailableDays-backed version (distinct sorted dates, no time/who):
// existence of a date here is the only signal a member's calendar reads.
export async function getUpcomingAvailablePickupDates(fromDate: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ date: pickupDays.date })
		.from(pickupDays)
		.where(gte(pickupDays.date, fromDate))
		.orderBy(asc(pickupDays.date));
	return rows.map((row) => row.date);
}

// Full rows (both kinds, every submitter) for the moderator/admin pages'
// "All pickup days" table and for deriving "My"/"Other"/"Single" from —
// those are all filters over this same result set, not separate queries.
export async function listUpcomingPickupDays(fromDate: string): Promise<PickupDayRow[]> {
	return db
		.select()
		.from(pickupDays)
		.where(gte(pickupDays.date, fromDate))
		.orderBy(asc(pickupDays.date), asc(pickupDays.startTime));
}

export interface NewSingleDay {
	date: string;
	startTime: string;
	endTime: string;
	where: string | null;
}

// Inserts one row per selected day from the calendar's hidden "Selected
// days" form. Malformed dates are dropped rather than throwing — the same
// "silently ignore, don't 500 the whole submission over one bad row"
// posture the old addAvailablePickupDate had. A moderator re-selecting a
// date they already offered hits pickup_days_single_user_date_unique and is
// silently ignored too (onConflictDoNothing), rather than erroring.
export async function createSingleDays(userId: string, days: NewSingleDay[]): Promise<void> {
	const valid = days.filter((day) => isValidDateString(day.date));
	if (valid.length === 0) return;
	await db
		.insert(pickupDays)
		.values(
			valid.map((day) => ({
				date: day.date,
				startTime: day.startTime,
				endTime: day.endTime,
				where: day.where,
				userId,
				kind: 'single' as const,
			})),
		)
		.onConflictDoNothing();
}

// Deletable only by the owning moderator, on a 'single' row — both checked
// in the WHERE clause itself, not just before calling, so there's no gap
// between "checked" and "deleted" to race or bypass. Returns whether a row
// actually matched and was removed, so the API route can 404 instead of
// silently no-opping on someone else's id.
export async function deleteSingleDay(id: number, userId: string): Promise<boolean> {
	const deleted = await db
		.delete(pickupDays)
		.where(and(eq(pickupDays.id, id), eq(pickupDays.userId, userId), eq(pickupDays.kind, 'single')))
		.returning({ id: pickupDays.id });
	return deleted.length > 0;
}

export async function listRecurringRules(): Promise<PickupRecurringRuleRow[]> {
	return db.select().from(pickupRecurringRules).orderBy(asc(pickupRecurringRules.startDate));
}

export interface NewRecurringRule {
	createdByUserId: string;
	weekday: number; // 0-6, see WEEKDAY_NAMES
	startTime: string;
	endTime: string;
	startDate: string;
	endDate: string;
}

// Every date in [startDate, endDate] (inclusive both ends) that falls on
// `weekday`. Walked in UTC (matching the "YYYY-MM-DD as a bare calendar
// date, not a moment in time" treatment the rest of this app gives
// date-only columns — see ReservationCalendar.astro's addDaysIso) so a
// server running in a non-UTC timezone can't shift a date across midnight.
function datesForWeekday(startDate: string, endDate: string, weekday: number): string[] {
	const dates: string[] = [];
	const cursor = new Date(`${startDate}T00:00:00Z`);
	const end = new Date(`${endDate}T00:00:00Z`);
	while (cursor.getUTCDay() !== weekday && cursor <= end) {
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	while (cursor <= end) {
		dates.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 7);
	}
	return dates;
}

// Creates the rule row plus every individual date it covers, atomically —
// a rule with zero matching dates (a range shorter than a week that never
// touches `weekday`) still creates the rule row itself with no generated
// days, rather than being rejected outright.
export async function createRecurringRule(input: NewRecurringRule): Promise<PickupRecurringRuleRow> {
	const dates = datesForWeekday(input.startDate, input.endDate, input.weekday);
	return db.transaction((tx) => {
		const rule = tx
			.insert(pickupRecurringRules)
			.values({
				createdByUserId: input.createdByUserId,
				weekday: input.weekday,
				startTime: input.startTime,
				endTime: input.endTime,
				startDate: input.startDate,
				endDate: input.endDate,
			})
			.returning()
			.get();

		if (dates.length > 0) {
			tx.insert(pickupDays)
				.values(
					dates.map((date) => ({
						date,
						startTime: input.startTime,
						endTime: input.endTime,
						where: null,
						userId: input.createdByUserId,
						kind: 'recurring' as const,
						recurringRuleId: rule.id,
					})),
				)
				.run();
		}

		return rule;
	});
}

// Cascades to every generated pickup_days row via recurringRuleId's
// onDelete: 'cascade' (see schema.ts) — no separate cleanup needed here.
export async function deleteRecurringRule(id: number): Promise<boolean> {
	const deleted = await db.delete(pickupRecurringRules).where(eq(pickupRecurringRules.id, id)).returning({ id: pickupRecurringRules.id });
	return deleted.length > 0;
}
