// Return-day rule for the reservation calendar (#336): returns only happen on
// pick-up days, within the max rental length. Pure (no db), so the calendar's
// client script can use it; the server enforces the same rule through
// isValidDateRange (src/lib/reservation.ts).
import { addDaysIso, daysInclusive } from './dates';

/**
 * Pick-up days a member could return on after picking up on `from`: every
 * date in `pickupDates` from `from` (a same-day return) to the last day the
 * max rental length allows, sorted.
 */
export function validReturnDays(from: string, pickupDates: ReadonlySet<string>, maxRangeDays?: number): string[] {
	const last = maxRangeDays ? addDaysIso(from, maxRangeDays - 1) : undefined;
	return [...pickupDates].filter((date) => date >= from && (!last || date <= last)).sort();
}

/**
 * Whether `date` can be the second click of a range whose first click was
 * `tentative`. Cally orders the two clicks, so a later date becomes the
 * return day (it must be a pick-up day), while an earlier one becomes the
 * pick-up day and makes `tentative` the return day (so `tentative` must be
 * a pick-up day). Either way the range must fit in `maxRangeDays`.
 */
export function isSecondClickAllowed(date: string, tentative: string, pickupDates: ReadonlySet<string>, maxRangeDays?: number): boolean {
	const [from, to] = date < tentative ? [date, tentative] : [tentative, date];
	if (maxRangeDays && daysInclusive(from, to) > maxRangeDays) return false;
	return pickupDates.has(to);
}
