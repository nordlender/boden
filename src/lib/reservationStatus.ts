// Pure state for the /reservation form's availability step (no DOM, no
// fetch), so every state's text and submit gating can be unit tested.
// reservationFormState.ts feeds it the fetch result and paints the outcome.
//
// Orders are never split (#247), so the member either gets every line or
// fixes the cart/dates: any unavailable line blocks submit.

export type ReservationStatus = 'no-dates' | 'too-long' | 'loading' | 'error' | 'all-available' | 'some-unavailable' | 'none-available';

export interface ReservationStatusInput {
	hasDates: boolean;
	// Length of the selected range in days (inclusive) and the longest rental
	// allowed (src/lib/rental-policy.ts). A longer range is rejected by the
	// availability API, so it gets its own message instead of the generic
	// fetch error. Omit both to skip the check.
	rentalDays?: number;
	maxRentalDays?: number;
	// null while the check is in flight; 'error' when it failed.
	availabilities: Array<{ available: boolean }> | 'error' | null;
}

export interface ReservationStatusView {
	status: ReservationStatus;
	submitEnabled: boolean;
	// Under the submit button. Empty once submit is enabled.
	hint: string;
	// Warning box above the item rows; null hides it.
	warning: string | null;
	// Error box above the item rows; null hides it.
	error: string | null;
	loading: boolean;
}

const NO_DATES_HINT = 'Select your pick-up and return dates above to continue.';

export function deriveReservationStatus({ hasDates, availabilities, rentalDays, maxRentalDays }: ReservationStatusInput): ReservationStatusView {
	const base = { submitEnabled: false, warning: null, error: null, loading: false };
	if (!hasDates) {
		return { ...base, status: 'no-dates', hint: NO_DATES_HINT };
	}
	if (rentalDays !== undefined && maxRentalDays !== undefined && rentalDays > maxRentalDays) {
		return {
			...base,
			status: 'too-long',
			hint: 'Choose a shorter rental period to continue.',
			warning: `The maximum rental period is ${maxRentalDays} days, and you selected ${rentalDays}. Choose a shorter period.`,
		};
	}
	if (availabilities === null) {
		return { ...base, status: 'loading', hint: 'Checking availability for your dates…', loading: true };
	}
	if (availabilities === 'error') {
		return {
			...base,
			status: 'error',
			hint: "Availability couldn't be checked, so the order can't be submitted yet.",
			error: "We couldn't check availability for these dates. Check your connection, then pick your dates again.",
		};
	}
	const unavailable = availabilities.filter((a) => !a.available).length;
	if (availabilities.length > 0 && unavailable === availabilities.length) {
		return {
			...base,
			status: 'none-available',
			hint: 'None of your items are available for these dates. Choose different dates to continue.',
			warning: 'None of your items are available in this timeframe. Choose different dates.',
		};
	}
	if (unavailable > 0) {
		return {
			...base,
			status: 'some-unavailable',
			hint: 'Remove the unavailable item(s) from your cart to continue, or choose different dates.',
			warning: 'Some items are not available in this timeframe. Remove them from your cart below, or choose different dates.',
		};
	}
	return { ...base, status: 'all-available', submitEnabled: availabilities.length > 0, hint: '' };
}
