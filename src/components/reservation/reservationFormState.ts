// Wires the calendar's chosen [from, to] range to the per-line
// availability badges, the unavailable-lines warning with its per-line
// remove action, and the checkout form's hidden fromDate/toDate fields —
// see POST /api/reservation/availability and src/lib/orders.ts's
// createOrder.
//
// Submit is blocked until every line (item or set) in the cart is available
// for the chosen dates; the member either picks different dates or removes
// the unavailable lines from their cart (POST /api/cart/remove).
//
// This module owns fetching and state (the last fetched availability, submit
// enable/disable). Pure DOM painting lives in reservationFormRender.ts — this
// module decides *what* to render and calls those functions with the result.
import { hideRow, renderRow, setSubmitEnabled, setSubmitHint, type LineAvailability } from './reservationFormRender';
import { deriveReservationStatus, type ReservationStatusInput } from '../../lib/reservationStatus';

// A cart line's reservation-relevant shape — `key` is cart.ts's entryKey
// ('item:<id>' or 'set:<id>'), matching this line's `[data-line-key]`
// attribute (ReservationItemRow.astro) and what POST
// /api/reservation/availability expects per line.
export type ReservationCartLineRef =
	| { key: string; itemId: number; quantity: number }
	| { key: string; setId: number; quantity: number };

export function initReservationForm(initialCartLines: ReservationCartLineRef[]): void {
	// Mutable: removing an unavailable line drops it from here so later
	// availability checks only cover what's still in the cart.
	let cartLines = [...initialCartLines];
	let lastFrom: string | undefined;
	let lastTo: string | undefined;

	const warning = document.querySelector<HTMLElement>('[data-unavailable-warning]');
	const errorBox = document.querySelector<HTMLElement>('[data-availability-error]');
	const loadingIndicator = document.querySelector<HTMLElement>('[data-availability-loading]');
	const submitHint = document.querySelector('[data-submit-hint]');
	const checkoutForm = document.querySelector('.checkout-form');
	const submitButton = checkoutForm?.querySelector('button[type="submit"]');
	const fromDateInput = checkoutForm?.querySelector('[data-checkout-from-date]');
	const toDateInput = checkoutForm?.querySelector('[data-checkout-to-date]');

	// Guards against an in-flight request landing after a later one (rapid
	// date changes while typing/dragging the calendar selection).
	let requestToken = 0;

	function getRows() {
		return document.querySelectorAll('[data-reservation-row]');
	}

	// Paints every status element from one derived view. The states and their
	// text live in src/lib/reservationStatus.ts.
	function applyStatus(input: ReservationStatusInput) {
		const view = deriveReservationStatus(input);
		setSubmitEnabled(submitButton, view.submitEnabled && cartLines.length > 0);
		setSubmitHint(submitHint, view.hint);
		if (loadingIndicator) loadingIndicator.hidden = !view.loading;
		if (warning) {
			warning.hidden = view.warning === null;
			warning.textContent = view.warning ?? '';
		}
		if (errorBox) {
			errorBox.hidden = view.error === null;
			errorBox.textContent = view.error ?? '';
		}
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

	async function removeLine(row: Element) {
		const key = (row as HTMLElement).dataset.lineKey ?? '';
		const line = cartLines.find((l) => l.key === key);
		if (!line) return;
		const body = new FormData();
		if ('itemId' in line) body.set('itemId', String(line.itemId));
		else body.set('setId', String(line.setId));
		try {
			// The endpoint answers with a redirect to /reservation, which we don't
			// want to follow — only the cookie update matters here.
			const res = await fetch('/api/cart/remove', { method: 'POST', body, redirect: 'manual' });
			if (!res.ok && res.type !== 'opaqueredirect') return;
		} catch {
			return;
		}

		cartLines = cartLines.filter((l) => l.key !== key);
		row.remove();
		if (cartLines.length === 0) {
			window.location.href = '/reservation';
			return;
		}
		await refreshAvailability(lastFrom, lastTo);
	}

	document.addEventListener('reservation-range-change', (event) => {
		const { from, to } = (event as CustomEvent<{ from?: string; to?: string }>).detail;
		refreshAvailability(from, to);
	});

	getRows().forEach((row) => {
		row.querySelector('[data-remove-item-button]')?.addEventListener('click', () => removeLine(row));
	});
}
