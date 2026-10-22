import { and, asc, eq, gte, inArray, ne, or } from 'drizzle-orm';
import { db } from '../db/client';
import { addDaysIso, isIsoDate } from './dates';
import { orders, pickupDays, pickupRecurringRules } from '../db/schema';
import type { QueryExecutor } from './availability';
import { isValidTimeString, mergeTimeRanges, overlapMinutes, type TimeRange } from './timeRanges';

// Lives in timeRanges.ts (db-free) now; re-exported for existing callers.
export { isValidTimeString };

export function isValidDateString(value: string): boolean {
	return isIsoDate(value);
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

// Which of `dates` have at least one pick-up window. Synchronous with an
// optional executor so order creation and reschedule can check the return
// day (#336, see isValidDateRange) inside their transaction.
export function getPickupDatesAmong(dates: string[], executor: QueryExecutor = db): Set<string> {
	if (dates.length === 0) return new Set();
	const rows = executor.select({ date: pickupDays.date }).from(pickupDays).where(inArray(pickupDays.date, dates)).all();
	return new Set(rows.map((row) => row.date));
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

// Pick-up windows offered on one date (any kind, any moderator), earliest
// first — shown on the /reservation/confirm overview.
export async function listPickupDaysOn(date: string): Promise<PickupDayRow[]> {
	const rows = await db.select().from(pickupDays).where(eq(pickupDays.date, date)).orderBy(asc(pickupDays.startTime));
	return rows;
}

export type OverlappingWindow = PickupDayRow & {
	/** Minutes of this window covered by the given ranges, always > 0. */
	overlapMinutes: number;
};

// The pick-up windows on `date` that overlap any of `ranges` (a member's
// requested pick-up or return times, see src/lib/orderTimeRanges.ts), each
// with how many of its minutes the ranges cover, best match first (most
// minutes, then earliest start, then lowest id). Overlap means max(start) <
// min(end): a window that only touches a range (16:00-18:00 vs 18:00-20:00)
// doesn't count. Ranges are merged first, so overlapping input ranges aren't
// counted twice; invalid ranges are ignored. Synchronous with an optional
// executor so acceptOrder can re-check inside its transaction (#343).
export function findOverlappingWindows(
	date: string,
	ranges: readonly TimeRange[],
	executor: QueryExecutor = db,
): OverlappingWindow[] {
	const merged = mergeTimeRanges(ranges.filter((r) => isValidTimeString(r.from) && isValidTimeString(r.to) && r.from < r.to));
	if (merged.length === 0) return [];
	const windows = executor.select().from(pickupDays).where(eq(pickupDays.date, date)).all();
	return windows
		.map((window) => ({
			...window,
			overlapMinutes: merged.reduce((sum, range) => sum + overlapMinutes(range, { from: window.startTime, to: window.endTime }), 0),
		}))
		.filter((window) => window.overlapMinutes > 0)
		.sort((a, b) => b.overlapMinutes - a.overlapMinutes || a.startTime.localeCompare(b.startTime) || a.id - b.id);
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

export type DeletePickupDayResult =
	| { ok: true }
	| { ok: false; error: 'not_found' }
	// The window is the confirmed pick-up or return time of these scheduled
	// orders (orders.pickupDayId / returnDayId) — see assignedOrderCodes.
	| { ok: false; error: 'assigned'; orderCodes: string[] };

type DeleteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Order codes of the scheduled orders whose confirmed pick-up or return
// window is one of `dayIds`. Deleting such a window would silently drop the
// time a moderator confirmed to the member, so the deletes below refuse
// (#369; #370 will replace the block with alerting the members). Only
// 'scheduled' blocks: requested orders have no window yet, and rejected,
// returned (and, once #373 lands, cancelled) orders are done with theirs.
export function assignedOrderCodes(dayIds: number[], executor: QueryExecutor = db): string[] {
	if (dayIds.length === 0) return [];
	const rows = executor
		.select({ orderCode: orders.orderCode })
		.from(orders)
		.where(and(eq(orders.status, 'scheduled'), or(inArray(orders.pickupDayId, dayIds), inArray(orders.returnDayId, dayIds))))
		.orderBy(asc(orders.orderCode))
		.all();
	return rows.map((row) => row.orderCode);
}

// The orders.pickupDayId / returnDayId FKs have no onDelete (a raw delete of
// an assigned window fails), so once assignedOrderCodes found no blocking
// order, any remaining reference — from an order that's past needing it —
// is cleared here, in the same transaction as the delete.
function releaseNonBlockingReferences(tx: DeleteTx, dayIds: number[]): void {
	if (dayIds.length === 0) return;
	tx.update(orders).set({ pickupDayId: null }).where(and(ne(orders.status, 'scheduled'), inArray(orders.pickupDayId, dayIds))).run();
	tx.update(orders).set({ returnDayId: null }).where(and(ne(orders.status, 'scheduled'), inArray(orders.returnDayId, dayIds))).run();
}

// Deletable only by the owning moderator, on a 'single' row — both checked
// in the WHERE clause itself, not just before calling, so there's no gap
// between "checked" and "deleted" to race or bypass. 'not_found' covers
// someone else's id too, so the API route can 404 instead of silently
// no-opping. Refuses with 'assigned' while a scheduled order has the window
// as its confirmed time, checked in the same transaction as the delete.
export async function deleteSingleDay(id: number, userId: string): Promise<DeletePickupDayResult> {
	return db.transaction((tx): DeletePickupDayResult => {
		const ownRow = and(eq(pickupDays.id, id), eq(pickupDays.userId, userId), eq(pickupDays.kind, 'single'));
		const row = tx.select({ id: pickupDays.id }).from(pickupDays).where(ownRow).get();
		if (!row) return { ok: false, error: 'not_found' };
		const orderCodes = assignedOrderCodes([row.id], tx);
		if (orderCodes.length > 0) return { ok: false, error: 'assigned', orderCodes };
		releaseNonBlockingReferences(tx, [row.id]);
		tx.delete(pickupDays).where(ownRow).run();
		return { ok: true };
	});
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
// date-only columns — see addDaysIso in dates.ts) so a
// server running in a non-UTC timezone can't shift a date across midnight.
function datesForWeekday(startDate: string, endDate: string, weekday: number): string[] {
	const dates: string[] = [];
	// YYYY-MM-DD strings compare correctly as plain strings.
	let cursor = startDate;
	while (cursor <= endDate && new Date(`${cursor}T00:00:00Z`).getUTCDay() !== weekday) {
		cursor = addDaysIso(cursor, 1);
	}
	while (cursor <= endDate) {
		dates.push(cursor);
		cursor = addDaysIso(cursor, 7);
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
// Refuses with 'assigned' while any of those generated days is a scheduled
// order's confirmed window, same as deleteSingleDay.
export async function deleteRecurringRule(id: number): Promise<DeletePickupDayResult> {
	return db.transaction((tx): DeletePickupDayResult => {
		const rule = tx.select({ id: pickupRecurringRules.id }).from(pickupRecurringRules).where(eq(pickupRecurringRules.id, id)).get();
		if (!rule) return { ok: false, error: 'not_found' };
		const dayIds = tx
			.select({ id: pickupDays.id })
			.from(pickupDays)
			.where(eq(pickupDays.recurringRuleId, id))
			.all()
			.map((row) => row.id);
		const orderCodes = assignedOrderCodes(dayIds, tx);
		if (orderCodes.length > 0) return { ok: false, error: 'assigned', orderCodes };
		releaseNonBlockingReferences(tx, dayIds);
		tx.delete(pickupRecurringRules).where(eq(pickupRecurringRules.id, id)).run();
		return { ok: true };
	});
}
