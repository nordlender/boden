// Wires the calendar's chosen [from, to] range to the per-line
// availability badges, the unavailable-lines warning, and the checkout
// form's hidden fromDate/toDate fields — see POST
// /api/reservation/availability and src/lib/orders.ts's createOrder.
//
// Submit is blocked until every line (item or set) in the cart is available
// for the chosen dates; the member either picks different dates or lowers
// the unavailable lines' quantities in the page's editable CartView
// ("Update cart", see src/components/cart/cartView.ts), which re-renders the
// lines and re-runs the check here.
//
// This module owns fetching and state (the last fetched availability, submit
// enable/disable). Pure DOM painting lives in reservationFormRender.ts — this
// module decides *what* to render and calls those functions with the result.
import { hideRow, renderRow, setSubmitEnabled, setSubmitHint, type LineAvailability } from './reservationFormRender';
import { daysInclusive } from '../../lib/dates';
import { deriveReservationStatus, type ReservationStatusInput } from '../../lib/reservationStatus';
import { entryKey, type CartEntry, type CartSnapshot } from '../../lib/cartEntries';
import { CART_VIEW_CHANGE, getCartView } from '../cart/cartView';

// A cart line's reservation-relevant shape — `key` is cartEntries.ts's
// entryKey ('item:<id>' or 'set:<id>'), matching the row's `[data-line-key]`
// attribute (CartLineRow.astro) and what POST /api/reservation/availability
// expects per line.
type ReservationCartLineRef = CartEntry & { key: string };

const toLineRefs = (entries: CartEntry[]): ReservationCartLineRef[] => entries.map((entry) => ({ ...entry, key: entryKey(entry) }));

export function initReservationForm(cartView: HTMLElement, maxRentalDays: number): void {
	// Replaced whenever the CartView re-renders (after "Update cart", or
	// when it found the cart changed elsewhere).
	let cartLines = toLineRefs(getCartView(cartView).snapshot().entries);
	let lastFrom: string | undefined;
	let lastTo: string | undefined;

	const warning = document.querySelector<HTMLElement>('[data-unavailable-warning]');
	const warningText = document.querySelector<HTMLElement>('[data-unavailable-warning-text]');
	const errorBox = document.querySelector<HTMLElement>('[data-availability-error]');
	const errorText = document.querySelector<HTMLElement>('[data-availability-error-text]');
	const loadingIndicator = document.querySelector<HTMLElement>('[data-availability-loading]');
	const submitHint = document.querySelector('[data-submit-hint]');
	const checkoutForm = document.querySelector('.checkout-form');
	const submitButton = checkoutForm?.querySelector('[data-cart-next]');
	const fromDateInput = checkoutForm?.querySelector('[data-checkout-from-date]');
	const toDateInput = checkoutForm?.querySelector('[data-checkout-to-date]');

	// Guards against an in-flight request landing after a later one (rapid
	// date changes while typing/dragging the calendar selection).
	let requestToken = 0;

	function getRows() {
		return cartView.querySelectorAll('[data-cart-row]');
	}

	// Paints every status element from one derived view. The states and their
	// text live in src/lib/reservationStatus.ts.
	function applyStatus(input: ReservationStatusInput) {
		const view = deriveReservationStatus(input);
		setSubmitEnabled(submitButton, view.submitEnabled && cartLines.length > 0);
		setSubmitHint(submitHint, view.hint);
		if (loadingIndicator) loadingIndicator.hidden = !view.loading;
		if (warning) warning.hidden = view.warning === null;
		if (warningText) warningText.textContent = view.warning ?? '';
		if (errorBox) errorBox.hidden = view.error === null;
		if (errorText) errorText.textContent = view.error ?? '';
	}

	setSubmitEnabled(submitButton, false);

	async function refreshAvailability(from: string | undefined, to: string | undefined) {
		lastFrom = from;
		lastTo = to;
		if (fromDateInput instanceof HTMLInputElement) fromDateInput.value = from ?? '';
		if (toDateInput instanceof HTMLInputElement) toDateInput.value = to ?? '';

		const token = ++requestToken;

		if (!from || !to) {
			applyStatus({ hasDates: false, availabilities: null });
			getRows().forEach((row) => hideRow(row));
			return;
		}

		// Over the max rental period the API would reject the request, so say
		// so here rather than letting it surface as a failed availability check.
		const rentalDays = daysInclusive(from, to);
		if (rentalDays > maxRentalDays) {
			applyStatus({ hasDates: true, availabilities: null, rentalDays, maxRentalDays });
			getRows().forEach((row) => hideRow(row));
			return;
		}

		// Loading: submit stays disabled until this check answers.
		applyStatus({ hasDates: true, availabilities: null });

		let availabilities: LineAvailability[];
		try {
			const res = await fetch('/api/reservation/availability', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ from, to, lines: cartLines }),
			});
			if (token !== requestToken) return;
			if (!res.ok) throw new Error(`availability check failed: ${res.status}`);
			({ availabilities } = await res.json());
			if (token !== requestToken) return;
			if (!Array.isArray(availabilities)) throw new Error('availability check returned no lines');
		} catch {
			if (token !== requestToken) return;
			applyStatus({ hasDates: true, availabilities: 'error' });
			getRows().forEach((row) => hideRow(row));
			return;
		}

		applyStatus({ hasDates: true, availabilities });

		const byKey = new Map(availabilities.map((a) => [a.key, a]));
		getRows().forEach((row) => {
			const availability = byKey.get((row as HTMLElement).dataset.lineKey ?? '');
			if (availability) renderRow(row, availability);
		});
	}

	cartView.addEventListener(CART_VIEW_CHANGE, (event) => {
		const { entries } = (event as CustomEvent<CartSnapshot>).detail;
		// An emptied cart: reload so the page shows its empty state.
		if (entries.length === 0) {
			window.location.reload();
			return;
		}
		cartLines = toLineRefs(entries);
		refreshAvailability(lastFrom, lastTo);
	});

	document.addEventListener('reservation-range-change', (event) => {
		const { from, to } = (event as CustomEvent<{ from?: string; to?: string }>).detail;
		refreshAvailability(from, to);
	});
}
