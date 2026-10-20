// Pure HH:MM time-range helpers, no db access, so they can run anywhere
// (API routes, lib code, client scripts). Used for a member's requested
// pick-up/return times (`orderTimeRanges`, see src/lib/orderTimeRanges.ts)
// and for matching them against pick-up windows (findOverlappingWindows in
// src/lib/pickupDays.ts).

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

// A member may give at most this many ranges per kind (pick-up / return),
// counted after merging.
export const MAX_TIME_RANGES_PER_KIND = 5;

/** A same-day time range, HH:MM 24h, `from` < `to` (never past midnight). */
export interface TimeRange {
	from: string;
	to: string;
}

export function isValidTimeString(value: string): boolean {
	return TIME_FORMAT.test(value);
}

/** Minutes since midnight for an HH:MM string. Assumes a valid time. */
export function timeToMinutes(value: string): number {
	const [hours, minutes] = value.split(':').map(Number);
	return hours * 60 + minutes;
}

/**
 * Minutes two ranges share. Overlap means max(start) < min(end), so ranges
 * that only touch (16:00-18:00 and 18:00-20:00) share 0 minutes.
 */
export function overlapMinutes(a: TimeRange, b: TimeRange): number {
	const start = Math.max(timeToMinutes(a.from), timeToMinutes(b.from));
	const end = Math.min(timeToMinutes(a.to), timeToMinutes(b.to));
	return Math.max(0, end - start);
}

/**
 * Sorts ranges by start and merges overlapping or touching ones
 * (12:00-14:00 + 14:00-16:00 -> 12:00-16:00). Assumes every range is valid.
 */
export function mergeTimeRanges(ranges: readonly TimeRange[]): TimeRange[] {
	const sorted = [...ranges].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
	const merged: TimeRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.from <= last.to) {
			if (range.to > last.to) last.to = range.to;
		} else {
			merged.push({ from: range.from, to: range.to });
		}
	}
	return merged;
}

export type NormalizeTimeRangesResult =
	| { ok: true; ranges: TimeRange[] }
	| { ok: false; error: 'no_ranges' }
	| { ok: false; error: 'invalid_time'; index: number }
	| { ok: false; error: 'from_not_before_to'; index: number }
	| { ok: false; error: 'too_many'; max: number };

/**
 * Validates and merges one kind's ranges as a member submitted them: every
 * time must be HH:MM (24h), each range must have from < to, there must be at
 * least one range, and at most MAX_TIME_RANGES_PER_KIND after merging
 * overlapping or touching ranges. `index` in an error points at the offending
 * input range. Returns the merged ranges sorted by start; never throws.
 */
export function normalizeTimeRanges(ranges: readonly TimeRange[]): NormalizeTimeRangesResult {
	if (ranges.length === 0) return { ok: false, error: 'no_ranges' };
	for (const [index, range] of ranges.entries()) {
		if (!isValidTimeString(range.from) || !isValidTimeString(range.to)) {
			return { ok: false, error: 'invalid_time', index };
		}
		if (range.from >= range.to) return { ok: false, error: 'from_not_before_to', index };
	}
	const merged = mergeTimeRanges(ranges);
	if (merged.length > MAX_TIME_RANGES_PER_KIND) {
		return { ok: false, error: 'too_many', max: MAX_TIME_RANGES_PER_KIND };
	}
	return { ok: true, ranges: merged };
}
