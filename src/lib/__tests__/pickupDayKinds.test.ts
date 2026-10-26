import { describe, expect, it } from 'vitest';
import { buildPickupDayKinds, pickupDayPartsFor } from '../pickupDayKinds';

describe('buildPickupDayKinds', () => {
	it('maps rows to recurring/mine/other, recurring beating mine beating other', () => {
		const kinds = buildPickupDayKinds(
			[
				{ date: '2026-11-02', kind: 'single', userId: 'other' },
				{ date: '2026-11-02', kind: 'single', userId: 'me' },
				{ date: '2026-11-03', kind: 'single', userId: 'me' },
				{ date: '2026-11-03', kind: 'recurring', userId: 'admin' },
				{ date: '2026-11-04', kind: 'single', userId: 'other' },
				{ date: '2026-11-05', kind: 'recurring', userId: 'admin' },
				{ date: '2026-11-05', kind: 'single', userId: 'me' },
			],
			'me',
		);
		expect(kinds).toEqual({ '2026-11-02': 'mine', '2026-11-03': 'recurring', '2026-11-04': 'other', '2026-11-05': 'recurring' });
	});
});

describe('pickupDayPartsFor', () => {
	// Cally hands getDayParts a UTC-midnight Date per cell.
	const parts = pickupDayPartsFor({ '2026-03-29': 'mine', '2026-10-25': 'recurring', '2026-12-31': 'other' });

	it('matches server date keys for Cally UTC-midnight dates, across both DST switches', () => {
		expect(parts(new Date(Date.UTC(2026, 2, 29)))).toBe('mine');
		expect(parts(new Date(Date.UTC(2026, 9, 25)))).toBe('recurring');
		expect(parts(new Date(Date.UTC(2026, 11, 31)))).toBe('other');
	});

	it('returns no part for days without a pickup day, including neighbours', () => {
		expect(parts(new Date(Date.UTC(2026, 2, 28)))).toBe('');
		expect(parts(new Date(Date.UTC(2026, 2, 30)))).toBe('');
	});
});
