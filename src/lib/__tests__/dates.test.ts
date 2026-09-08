import { describe, it, expect, afterEach, vi } from 'vitest';

import { CLUB_TIMEZONE, isoDateFromUtcMidnight, toIsoDateInClubTimezone, todayIsoInClubTimezone } from '../dates';

describe('CLUB_TIMEZONE', () => {
	it('is the club’s timezone, not the host’s', () => {
		expect(CLUB_TIMEZONE).toBe('Europe/Oslo');
	});
});

describe('toIsoDateInClubTimezone', () => {
	it('formats as zero-padded YYYY-MM-DD', () => {
		// Single-digit month and day, to catch an unpadded formatter.
		expect(toIsoDateInClubTimezone(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
	});

	it('uses Oslo’s calendar day, not UTC’s, in winter (UTC+1)', () => {
		// 23:30 UTC on Jan 5 is already 00:30 on Jan 6 in Oslo.
		expect(toIsoDateInClubTimezone(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-06');
		// ...and the other way: 23:30 Oslo time on Jan 5 is still Jan 5 there
		// even though UTC has not yet rolled over either.
		expect(toIsoDateInClubTimezone(new Date('2026-01-05T22:30:00Z'))).toBe('2026-01-05');
		// Just before Oslo midnight, UTC is still on the previous day's
		// evening — the day must follow Oslo, not UTC.
		expect(toIsoDateInClubTimezone(new Date('2026-01-05T00:30:00Z'))).toBe('2026-01-05');
		// 00:30 Oslo on Jan 5 == 23:30 UTC on Jan 4: UTC says the 4th, Oslo
		// says the 5th.
		expect(toIsoDateInClubTimezone(new Date('2026-01-04T23:30:00Z'))).toBe('2026-01-05');
	});

	it('uses Oslo’s calendar day, not UTC’s, in summer DST (UTC+2)', () => {
		// 22:30 UTC on Jul 5 is 00:30 on Jul 6 in Oslo (CEST, UTC+2).
		expect(toIsoDateInClubTimezone(new Date('2026-07-05T22:30:00Z'))).toBe('2026-07-06');
		expect(toIsoDateInClubTimezone(new Date('2026-07-05T21:30:00Z'))).toBe('2026-07-05');
		// Confirms the offset really is +2 and not a hardcoded +1: at 23:30
		// UTC on Jan 5 (winter) and 22:30 UTC on Jul 5 (summer) the club day
		// has just rolled over in both cases.
		expect(toIsoDateInClubTimezone(new Date('2026-07-04T22:30:00Z'))).toBe('2026-07-05');
	});

	it('rolls the month and year over on Oslo’s clock', () => {
		// 23:30 UTC on Dec 31 is already New Year's Day in Oslo.
		expect(toIsoDateInClubTimezone(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
		// 23:30 UTC on the last day of February in a non-leap year.
		expect(toIsoDateInClubTimezone(new Date('2026-02-28T23:30:00Z'))).toBe('2026-03-01');
	});

	it('is independent of the host timezone', () => {
		const instant = new Date('2026-01-05T23:30:00Z');
		const originalTz = process.env.TZ;
		try {
			for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
				process.env.TZ = tz;
				expect(toIsoDateInClubTimezone(instant)).toBe('2026-01-06');
			}
		} finally {
			if (originalTz === undefined) delete process.env.TZ;
			else process.env.TZ = originalTz;
		}
	});
});

describe('isoDateFromUtcMidnight', () => {
	// This is the shape cally hands <calendar-range>'s getDayParts: a plain
	// calendar date encoded as Date.UTC(y, m - 1, d).
	const plainDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

	it('round-trips a plain calendar date', () => {
		expect(isoDateFromUtcMidnight(plainDate(2026, 9, 10))).toBe('2026-09-10');
		expect(isoDateFromUtcMidnight(plainDate(2026, 1, 1))).toBe('2026-01-01');
		expect(isoDateFromUtcMidnight(plainDate(2026, 12, 31))).toBe('2026-12-31');
	});

	it('zero-pads single-digit months and days', () => {
		expect(isoDateFromUtcMidnight(plainDate(2026, 3, 5))).toBe('2026-03-05');
	});

	it('is independent of the host timezone', () => {
		const originalTz = process.env.TZ;
		try {
			for (const tz of ['UTC', 'Europe/Oslo', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
				process.env.TZ = tz;
				expect(isoDateFromUtcMidnight(plainDate(2026, 9, 10))).toBe('2026-09-10');
			}
		} finally {
			if (originalTz === undefined) delete process.env.TZ;
			else process.env.TZ = originalTz;
		}
	});
});

describe('todayIsoInClubTimezone', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns the club’s current calendar day, not UTC’s', () => {
		vi.useFakeTimers();
		// 23:30 UTC — already tomorrow in Oslo.
		vi.setSystemTime(new Date('2026-01-05T23:30:00Z'));
		expect(todayIsoInClubTimezone()).toBe('2026-01-06');
		expect(new Date().toISOString().slice(0, 10)).toBe('2026-01-05');
	});

	it('returns a YYYY-MM-DD string for the real current time', () => {
		expect(todayIsoInClubTimezone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
