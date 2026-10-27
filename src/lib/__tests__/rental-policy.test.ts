import { describe, expect, it } from 'vitest';
import { getMaxRentalDays, isOverMaxRental } from '../rental-policy';

describe('isOverMaxRental', () => {
	it('flags only ranges longer than the max (inclusive days)', () => {
		expect(getMaxRentalDays()).toBe(14);
		expect(isOverMaxRental('2026-01-01', '2026-01-14')).toBe(false);
		expect(isOverMaxRental('2026-01-01', '2026-01-15')).toBe(true);
	});
});
