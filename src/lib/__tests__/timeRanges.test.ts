import { describe, it, expect } from 'vitest';
import { MAX_TIME_RANGES_PER_KIND, mergeTimeRanges, normalizeTimeRanges, overlapMinutes, timeToMinutes } from '../timeRanges';

describe('timeToMinutes', () => {
	it('converts HH:MM to minutes since midnight', () => {
		expect(timeToMinutes('00:00')).toBe(0);
		expect(timeToMinutes('09:30')).toBe(570);
		expect(timeToMinutes('23:59')).toBe(1439);
	});
});

describe('overlapMinutes', () => {
	it('is the shared length of two overlapping ranges', () => {
		expect(overlapMinutes({ from: '16:00', to: '19:00' }, { from: '18:00', to: '20:00' })).toBe(60);
		expect(overlapMinutes({ from: '12:00', to: '20:00' }, { from: '18:00', to: '19:30' })).toBe(90);
	});

	it('is 0 for touching or disjoint ranges', () => {
		expect(overlapMinutes({ from: '16:00', to: '18:00' }, { from: '18:00', to: '20:00' })).toBe(0);
		expect(overlapMinutes({ from: '08:00', to: '09:00' }, { from: '18:00', to: '20:00' })).toBe(0);
	});
});

describe('mergeTimeRanges', () => {
	it('sorts by start and merges overlapping and touching ranges', () => {
		expect(
			mergeTimeRanges([
				{ from: '18:00', to: '20:00' },
				{ from: '12:00', to: '14:00' },
				{ from: '14:00', to: '15:00' },
				{ from: '19:00', to: '21:00' },
				{ from: '08:00', to: '09:00' },
			]),
		).toEqual([
			{ from: '08:00', to: '09:00' },
			{ from: '12:00', to: '15:00' },
			{ from: '18:00', to: '21:00' },
		]);
	});

	it('swallows a range contained in another', () => {
		expect(mergeTimeRanges([{ from: '10:00', to: '20:00' }, { from: '12:00', to: '13:00' }])).toEqual([{ from: '10:00', to: '20:00' }]);
	});

	it('does not mutate its input', () => {
		const input = [{ from: '12:00', to: '14:00' }, { from: '13:00', to: '16:00' }];
		mergeTimeRanges(input);
		expect(input).toEqual([{ from: '12:00', to: '14:00' }, { from: '13:00', to: '16:00' }]);
	});
});

describe('normalizeTimeRanges', () => {
	it('returns the merged, sorted ranges', () => {
		expect(normalizeTimeRanges([{ from: '16:00', to: '18:00' }, { from: '12:00', to: '13:00' }, { from: '17:00', to: '19:00' }])).toEqual({
			ok: true,
			ranges: [
				{ from: '12:00', to: '13:00' },
				{ from: '16:00', to: '19:00' },
			],
		});
	});

	it('requires at least one range', () => {
		expect(normalizeTimeRanges([])).toEqual({ ok: false, error: 'no_ranges' });
	});

	it('rejects a time that is not HH:MM 24h, pointing at the range', () => {
		expect(normalizeTimeRanges([{ from: '12:00', to: '13:00' }, { from: '9:00', to: '10:00' }])).toEqual({ ok: false, error: 'invalid_time', index: 1 });
		expect(normalizeTimeRanges([{ from: '23:00', to: '24:00' }])).toEqual({ ok: false, error: 'invalid_time', index: 0 });
		expect(normalizeTimeRanges([{ from: '', to: '10:00' }])).toEqual({ ok: false, error: 'invalid_time', index: 0 });
	});

	it('rejects a range whose from is not before its to', () => {
		expect(normalizeTimeRanges([{ from: '14:00', to: '14:00' }])).toEqual({ ok: false, error: 'from_not_before_to', index: 0 });
		expect(normalizeTimeRanges([{ from: '12:00', to: '13:00' }, { from: '22:00', to: '02:00' }])).toEqual({ ok: false, error: 'from_not_before_to', index: 1 });
	});

	it(`allows ${MAX_TIME_RANGES_PER_KIND} ranges and rejects more`, () => {
		const hours = ['08', '10', '12', '14', '16', '18'];
		const ranges = hours.map((h) => ({ from: `${h}:00`, to: `${h}:30` }));
		expect(normalizeTimeRanges(ranges.slice(0, MAX_TIME_RANGES_PER_KIND)).ok).toBe(true);
		expect(normalizeTimeRanges(ranges)).toEqual({ ok: false, error: 'too_many', max: MAX_TIME_RANGES_PER_KIND });
	});

	it('counts the cap after merging', () => {
		const ranges = ['08', '10', '12', '14', '16'].map((h) => ({ from: `${h}:00`, to: `${h}:30` }));
		ranges.push({ from: '16:30', to: '17:00' }); // touches 16:00-16:30
		const result = normalizeTimeRanges(ranges);
		expect(result.ok && result.ranges).toHaveLength(5);
	});
});
