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

export type TimeRangeKind = 'pickup' | 'return';

/** A member's requested ranges for one order: pick-up on fromDate, return on toDate. */
export interface OrderTimeRangeInput {
	pickup: readonly TimeRange[];
	return: readonly TimeRange[];
}

export type OrderTimeRangeError =
	| { kind: TimeRangeKind; error: 'no_ranges' }
	| { kind: TimeRangeKind; error: 'invalid_time'; index: number }
	| { kind: TimeRangeKind; error: 'from_not_before_to'; index: number }
	| { kind: TimeRangeKind; error: 'too_many'; max: number }
	// A range on today that is already over (Europe/Oslo time).
	| { kind: TimeRangeKind; error: 'already_passed'; index: number }
	// Same-day rental: no return range ends after the earliest pick-up start.
	| { kind: 'return'; error: 'return_before_pickup' };

export type ValidateOrderTimeRangesResult =
	| { ok: true; ranges: { pickup: TimeRange[]; return: TimeRange[] } }
	| { ok: false; detail: OrderTimeRangeError };

/**
 * Validates both kinds of an order's ranges (#368): each kind through
 * normalizeTimeRanges, then two date-aware rules. On today (`now`, Oslo), a
 * range that has already ended is rejected. For a same-day rental (fromDate
 * = toDate), some return range must end after the earliest pick-up range
 * starts. Pure, so the reservation form runs the same checks client-side.
 */
export function validateOrderTimeRanges(
	input: OrderTimeRangeInput,
	dates: { fromDate: string; toDate: string },
	now: { date: string; time: string },
): ValidateOrderTimeRangesResult {
	const ranges = { pickup: [] as TimeRange[], return: [] as TimeRange[] };
	for (const kind of ['pickup', 'return'] as const) {
		const result = normalizeTimeRanges(input[kind]);
		if (!result.ok) {
			const detail: OrderTimeRangeError =
				result.error === 'no_ranges'
					? { kind, error: result.error }
					: result.error === 'too_many'
						? { kind, error: result.error, max: result.max }
						: { kind, error: result.error, index: result.index };
			return { ok: false, detail };
		}
		const date = kind === 'pickup' ? dates.fromDate : dates.toDate;
		if (date === now.date) {
			const index = input[kind].findIndex((range) => range.to <= now.time);
			if (index >= 0) return { ok: false, detail: { kind, error: 'already_passed', index } };
		}
		ranges[kind] = result.ranges;
	}
	if (dates.fromDate === dates.toDate) {
		const earliestPickup = ranges.pickup[0].from;
		if (!ranges.return.some((range) => range.to > earliestPickup)) {
			return { ok: false, detail: { kind: 'return', error: 'return_before_pickup' } };
		}
	}
	return { ok: true, ranges };
}

/** A member-facing sentence for a validateOrderTimeRanges error. */
export function orderTimeRangeErrorMessage(error: OrderTimeRangeError): string {
	const which = error.kind === 'pickup' ? 'pick-up' : 'return';
	switch (error.error) {
		case 'no_ranges':
			return `Add at least one ${which} time range.`;
		case 'invalid_time':
			return `Enter both times of each ${which} range as HH:MM (24h).`;
		case 'from_not_before_to':
			return `Each ${which} range must end after it starts, on the same day.`;
		case 'too_many':
			return `Give at most ${error.max} ${which} time ranges.`;
		case 'already_passed':
			return `One of your ${which} time ranges today has already passed.`;
		case 'return_before_pickup':
			return 'For a same-day rental, a return time range must end after your pick-up time starts.';
	}
}

/**
 * Parses a ranges list as it arrives from a form field (a JSON string) or a
 * JSON body (an array): an array of { from, to } string pairs. Anything else
 * returns null; the values themselves are checked by validateOrderTimeRanges.
 */
export function parseTimeRanges(value: unknown): TimeRange[] | null {
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(parsed)) return null;
	const ranges: TimeRange[] = [];
	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) return null;
		const { from, to } = entry as Record<string, unknown>;
		if (typeof from !== 'string' || typeof to !== 'string') return null;
		ranges.push({ from, to });
	}
	return ranges;
}
