import { describe, it, expect } from 'vitest';
import { isSecondClickAllowed, validReturnDays } from '../returnDays';

const PICKUP_DAYS = new Set(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);

describe('validReturnDays', () => {
	it('lists pick-up days from the pick-up day to the end of the max rental length', () => {
		expect(validReturnDays('2026-09-08', PICKUP_DAYS, 14)).toEqual(['2026-09-14', '2026-09-21']);
	});

	it('includes the pick-up day itself when it is a pick-up day (same-day return)', () => {
		expect(validReturnDays('2026-09-07', PICKUP_DAYS, 7)).toEqual(['2026-09-07']);
	});

	it('is empty when no pick-up day falls within the max rental length', () => {
		expect(validReturnDays('2026-09-08', PICKUP_DAYS, 6)).toEqual([]);
	});

	it('is unbounded without a max', () => {
		expect(validReturnDays('2026-09-22', PICKUP_DAYS)).toEqual(['2026-09-28']);
	});
});

describe('isSecondClickAllowed', () => {
	it('allows a later date only if it is a pick-up day within the max', () => {
		expect(isSecondClickAllowed('2026-09-14', '2026-09-08', PICKUP_DAYS, 14)).toBe(true);
		expect(isSecondClickAllowed('2026-09-13', '2026-09-08', PICKUP_DAYS, 14)).toBe(false);
		expect(isSecondClickAllowed('2026-09-28', '2026-09-08', PICKUP_DAYS, 14)).toBe(false);
	});

	it('allows the same day only if it is a pick-up day', () => {
		expect(isSecondClickAllowed('2026-09-07', '2026-09-07', PICKUP_DAYS, 14)).toBe(true);
		expect(isSecondClickAllowed('2026-09-08', '2026-09-08', PICKUP_DAYS, 14)).toBe(false);
	});

	it('allows an earlier date only if the first click is a pick-up day (it becomes the return day)', () => {
		expect(isSecondClickAllowed('2026-09-10', '2026-09-14', PICKUP_DAYS, 14)).toBe(true);
		expect(isSecondClickAllowed('2026-09-10', '2026-09-13', PICKUP_DAYS, 14)).toBe(false);
		expect(isSecondClickAllowed('2026-08-20', '2026-09-14', PICKUP_DAYS, 14)).toBe(false);
	});
});
