// Wires the calendar's chosen [from, to] range to the per-line
// availability badges, the mixed-availability warning/split-order
// affordance, and the checkout form's hidden fromDate/toDate/splitLineKeys
// fields — see POST /api/reservation/availability and
// src/lib/orders.ts's createOrder/createSplitOrders.
//
// This module owns fetching and state (the split-order selection, the last
// fetched availability, submit enable/disable). Pure DOM painting lives in
// reservationFormRender.ts — this module decides *what* to render and calls
// those functions with the result.
import { hideRow, renderRow, renderSplitToggle, setSubmitEnabled, setSubmitHint, type LineAvailability } from './reservationFormRender';

// A cart line's reservation-relevant shape — `key` is cart.ts's entryKey
// ('item:<id>' or 'set:<id>'), matching this line's `[data-line-key]`
// attribute (ReservationItemRow.astro) and what POST
// /api/reservation/availability expects per line.
export type ReservationCartLineRef =
	| { key: string; itemId: number; quantity: number }
	| { key: string; setId: number; quantity: number };

export function initReservationForm(cartLines: ReservationCartLineRef[]): void {
	const form = document.querySelector<HTMLElement>('[data-reservation-form]');
	const warning = document.querySelector('[data-mixed-availability-warning]');
	const loadingIndicator = document.querySelector('[data-availability-loading]');
	const submitHint = document.querySelector('[data-submit-hint]');
	const rows = document.querySelectorAll('[data-reservation-row]');
	const checkoutForm = document.querySelector('.checkout-form');
	const submitButton = checkoutForm?.querySelector('button[type="submit"]');
	const fromDateInput = checkoutForm?.querySelector('[data-checkout-from-date]');
	const toDateInput = checkoutForm?.querySelector('[data-checkout-to-date]');
	const splitLineKeysInput = checkoutForm?.querySelector('[data-checkout-split-line-keys]');

	// A line's own requested quantity, by key — used to decide whether
	// splitting it off into its own order is even offerable (see
	// refreshAvailability's splitOfferable comment below).
	const quantityByKey = new Map(cartLines.map((line) => [line.key, line.quantity]));

	// Which lines (items or sets) the member has moved into their own order
	// via each row's split-order button — sent to the server as
	// splitLineKeys so createSplitOrders can partition the cart accordingly.
	const splitLineKeys = new Set<string>();
	let lastAllAvailable = false;
	let lastMixed = false;
	// Guards against an in-flight request landing after a later one (rapid
	// date changes while typing/dragging the calendar selection).
	let requestToken = 0;

	function syncSplitLineKeysInput() {
		if (splitLineKeysInput instanceof HTMLInputElement) {
			splitLineKeysInput.value = Array.from(splitLineKeys).join(',');
		}
	}

	function refreshSubmitState() {
		const enabled = lastAllAvailable || (lastMixed && splitLineKeys.size > 0);
		setSubmitEnabled(submitButton, enabled);
		if (enabled) {
			setSubmitHint(submitHint, '');
		} else if (lastMixed) {
			setSubmitHint(submitHint, 'Move the unavailable item(s) to a separate order to continue, or choose different dates.');
		} else {
			setSubmitHint(submitHint, 'Select your pick-up and return dates above to continue.');
		}
	}

	setSubmitEnabled(submitButton, false);

	async function refreshAvailability(from: string | undefined, to: string | undefined) {
		if (fromDateInput instanceof HTMLInputElement) fromDateInput.value = from ?? '';
		if (toDateInput instanceof HTMLInputElement) toDateInput.value = to ?? '';

		const token = ++requestToken;

		if (!from || !to) {
			warning?.setAttribute('hidden', '');
			loadingIndicator?.setAttribute('hidden', '');
			delete form?.dataset.mixed;
			lastAllAvailable = false;
			lastMixed = false;
			refreshSubmitState();
			rows.forEach((row) => hideRow(row));
			return;
		}

		loadingIndicator?.removeAttribute('hidden');

		let availabilities: LineAvailability[];
		try {
			const res = await fetch('/api/reservation/availability', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ from, to, lines: cartLines }),
			});
			if (token !== requestToken) return;
			if (!res.ok) {
				loadingIndicator?.setAttribute('hidden', '');
				return;
			}
			({ availabilities } = await res.json());
		} catch {
			if (token === requestToken) loadingIndicator?.setAttribute('hidden', '');
			return;
		}

		loadingIndicator?.setAttribute('hidden', '');

		const byKey = new Map(availabilities.map((a) => [a.key, a]));
		const allAvailable = availabilities.every((a) => a.available);
		const someAvailable = availabilities.some((a) => a.available);
		const mixed = someAvailable && !allAvailable;

		if (mixed && form) form.dataset.mixed = '1';
		else delete form?.dataset.mixed;

		// Lines no longer eligible to split (e.g. the range changed and
		// availability is no longer mixed) shouldn't stay silently selected.
		if (!mixed) splitLineKeys.clear();

		warning?.toggleAttribute('hidden', !mixed);
		lastAllAvailable = allAvailable;
		lastMixed = mixed;
		syncSplitLineKeysInput();
		refreshSubmitState();

		rows.forEach((row) => {
			const key = (row as HTMLElement).dataset.lineKey ?? '';
			const availability = byKey.get(key);
			if (!availability) return;

			// A row that's become available again is no longer eligible to be
			// split out — clear any stale selection now, rather than only when
			// the whole cart stops being mixed. Otherwise, once this row's own
			// button goes hidden below, there's no control left to un-press it,
			// and it would still get silently split into its own order on
			// submit even though it no longer needs to be.
			if (availability.available && splitLineKeys.has(key)) {
				splitLineKeys.delete(key);
				syncSplitLineKeysInput();
				refreshSubmitState();
			}

			const pressed = splitLineKeys.has(key);
			// Only offered on a row that's actually unavailable — splitting off
			// an already-available row wouldn't do anything to resolve the
			// mixed-availability warning, and would let the member satisfy the
			// enable-submit condition without ever touching the blocked line.
			// Also not offered when this line requests more than one of the
			// same item/set, since a partial per-unit availability shortfall
			// can't be represented by moving the whole line to a separate order.
			const splitOfferable = Boolean(form?.dataset.mixed) && !availability.available && (quantityByKey.get(key) ?? 1) <= 1;

			renderRow(row, availability, pressed, splitOfferable);
		});
	}

	document.addEventListener('reservation-range-change', (event) => {
		const { from, to } = (event as CustomEvent<{ from?: string; to?: string }>).detail;
		refreshAvailability(from, to);
	});

	rows.forEach((row) => {
		const splitButton = row.querySelector('[data-split-order-button]');
		splitButton?.addEventListener('click', () => {
			const key = (row as HTMLElement).dataset.lineKey ?? '';
			if (splitLineKeys.has(key)) splitLineKeys.delete(key);
			else splitLineKeys.add(key);
			const pressed = splitLineKeys.has(key);
			renderSplitToggle(row, pressed);
			syncSplitLineKeysInput();
			refreshSubmitState();
		});
	});
}
