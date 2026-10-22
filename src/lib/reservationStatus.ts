// Pure state for the /reservation form's availability step (no DOM, no
// fetch), so every state's text and submit gating can be unit tested.
// reservationFormState.ts feeds it the fetch result and paints the outcome.
//
// Orders are never split (#247), so the member either gets every line or
// fixes the cart/dates: any unavailable line blocks submit.

export type ReservationStatus = 'no-dates' | 'loading' | 'error' | 'all-available' | 'some-unavailable' | 'none-available';

export interface ReservationStatusInput {
	hasDates: boolean;
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

export function deriveReservationStatus({ hasDates, availabilities }: ReservationStatusInput): ReservationStatusView {
	const base = { submitEnabled: false, warning: null, error: null, loading: false };
	if (!hasDates) {
		return { ...base, status: 'no-dates', hint: NO_DATES_HINT };
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
