import { describe, it, expect } from 'vitest';
import { hasValidReturnDay, isSecondClickAllowed } from '../returnDays';

const PICKUP_DAYS = new Set(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);

describe('hasValidReturnDay', () => {
	it('finds a pick-up day after the pick-up day within the max rental length', () => {
		expect(hasValidReturnDay('2026-09-08', PICKUP_DAYS, 14)).toBe(true);
	});

	it('counts the pick-up day itself when it is a pick-up day (same-day return)', () => {
		expect(hasValidReturnDay('2026-09-07', PICKUP_DAYS, 1)).toBe(true);
	});

	it('is false when no pick-up day falls within the max rental length', () => {
		expect(hasValidReturnDay('2026-09-08', PICKUP_DAYS, 6)).toBe(false);
	});

	it('ignores pick-up days before the pick-up day', () => {
		expect(hasValidReturnDay('2026-09-29', PICKUP_DAYS)).toBe(false);
	});

	it('is unbounded without a max', () => {
		expect(hasValidReturnDay('2026-09-22', PICKUP_DAYS)).toBe(true);
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
