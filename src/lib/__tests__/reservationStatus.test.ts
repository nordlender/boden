import { describe, expect, it } from 'vitest';
import { deriveReservationStatus } from '../reservationStatus';

const yes = { available: true };
const no = { available: false };

describe('deriveReservationStatus', () => {
	it('asks for dates when none are selected', () => {
		const view = deriveReservationStatus({ hasDates: false, availabilities: null });
		expect(view).toMatchObject({ status: 'no-dates', submitEnabled: false, warning: null, error: null, loading: false });
		expect(view.hint).toMatch(/Select your pick-up and return dates/);
	});

	it('warns about a range over the max rental period without blocking submit (#391)', () => {
		const view = deriveReservationStatus({ hasDates: true, availabilities: [yes], rentalDays: 20, maxRentalDays: 14 });
		expect(view).toMatchObject({ status: 'all-available', submitEnabled: true, warning: null, error: null });
		expect(view.overMaxWarning).toMatch(/maximum rental period is 14 days.*selected 20.*unlikely to be accepted.*note/);
		// Still shown while availability is loading or the items are unavailable.
		expect(deriveReservationStatus({ hasDates: true, availabilities: null, rentalDays: 20, maxRentalDays: 14 }).overMaxWarning).not.toBeNull();
		expect(deriveReservationStatus({ hasDates: true, availabilities: [no], rentalDays: 20, maxRentalDays: 14 }).overMaxWarning).not.toBeNull();
		// Exactly the max is fine.
		expect(deriveReservationStatus({ hasDates: true, availabilities: [yes], rentalDays: 14, maxRentalDays: 14 }).overMaxWarning).toBeNull();
	});

	it('keeps submit disabled while the check is in flight', () => {
		expect(deriveReservationStatus({ hasDates: true, availabilities: null })).toMatchObject({ status: 'loading', submitEnabled: false, loading: true });
	});

	it('shows an error and keeps submit disabled when the fetch fails', () => {
		const view = deriveReservationStatus({ hasDates: true, availabilities: 'error' });
		expect(view).toMatchObject({ status: 'error', submitEnabled: false, warning: null, loading: false });
		expect(view.error).toMatch(/couldn't check availability/);
		expect(view.hint).not.toMatch(/Select your pick-up/);
	});

	it('has an explicit none-available state when dates are picked but nothing is free', () => {
		const view = deriveReservationStatus({ hasDates: true, availabilities: [no, no] });
		expect(view).toMatchObject({ status: 'none-available', submitEnabled: false, error: null });
		expect(view.warning).toMatch(/None of your items/);
		expect(view.hint).toMatch(/Choose different dates/);
		expect(view.hint).not.toMatch(/Select your pick-up/);
	});

	it('blocks submit when only some lines are available (orders are never split)', () => {
		const view = deriveReservationStatus({ hasDates: true, availabilities: [yes, no] });
		expect(view).toMatchObject({ status: 'some-unavailable', submitEnabled: false });
		expect(view.warning).toMatch(/Some items/);
	});

	it('enables submit when every line is available', () => {
		expect(deriveReservationStatus({ hasDates: true, availabilities: [yes, yes] })).toEqual({
			status: 'all-available',
			submitEnabled: true,
			hint: '',
			warning: null,
			error: null,
			loading: false,
			overMaxWarning: null,
		});
	});
});
