// Wires the calendar's chosen [from, to] range to the per-item
// availability badges, the mixed-availability warning/split-order
// affordance, and the checkout form's hidden fromDate/toDate/splitItemIds
// fields — see POST /api/reservation/availability and
// src/lib/orders.ts's createOrder/createSplitOrders.
//
// This module owns fetching and state (the split-order selection, the last
// fetched availability, submit enable/disable). Pure DOM painting lives in
// reservationFormRender.ts — this module decides *what* to render and calls
// those functions with the result.
import { hideRow, renderRow, renderSplitToggle, setSubmitEnabled, setSubmitHint, type ItemAvailability } from './reservationFormRender';

export interface ReservationCartItemRef {
	itemId: number;
	quantity: number;
}

export function initReservationForm(cartItems: ReservationCartItemRef[]): void {
	const form = document.querySelector<HTMLElement>('[data-reservation-form]');
	const warning = document.querySelector('[data-mixed-availability-warning]');
	const loadingIndicator = document.querySelector('[data-availability-loading]');
	const submitHint = document.querySelector('[data-submit-hint]');
	const rows = document.querySelectorAll('[data-reservation-row]');
	const checkoutForm = document.querySelector('.checkout-form');
	const submitButton = checkoutForm?.querySelector('button[type="submit"]');
	const fromDateInput = checkoutForm?.querySelector('[data-checkout-from-date]');
	const toDateInput = checkoutForm?.querySelector('[data-checkout-to-date]');
	const splitItemIdsInput = checkoutForm?.querySelector('[data-checkout-split-item-ids]');

	// Which items the member has moved into their own order via each row's
	// split-order button — sent to the server as splitItemIds so
	// createSplitOrders can partition the cart accordingly.
	const splitItemIds = new Set<number>();
	let lastAllAvailable = false;
	let lastMixed = false;
	// Guards against an in-flight request landing after a later one (rapid
	// date changes while typing/dragging the calendar selection).
	let requestToken = 0;

	function syncSplitItemIdsInput() {
		if (splitItemIdsInput instanceof HTMLInputElement) {
			splitItemIdsInput.value = Array.from(splitItemIds).join(',');
		}
	}

	function refreshSubmitState() {
		const enabled = lastAllAvailable || (lastMixed && splitItemIds.size > 0);
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

		let availabilities: ItemAvailability[];
		try {
			const res = await fetch('/api/reservation/availability', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ from, to, items: cartItems }),
			});
			if (token !== requestToken) return;
			if (!res.ok) {
				loadingIndicator?.setAttribute('hidden', '');
				return;
			}
			({ availabilities } = await res.json());
			if (token !== requestToken) return;
		} catch {
			if (token === requestToken) loadingIndicator?.setAttribute('hidden', '');
			return;
		}

		loadingIndicator?.setAttribute('hidden', '');

		const byItemId = new Map(availabilities.map((a) => [a.itemId, a]));
		const allAvailable = availabilities.every((a) => a.available);
		const someAvailable = availabilities.some((a) => a.available);
		const mixed = someAvailable && !allAvailable;

		if (mixed && form) form.dataset.mixed = '1';
		else delete form?.dataset.mixed;

		// Items no longer eligible to split (e.g. the range changed and
		// availability is no longer mixed) shouldn't stay silently selected.
		if (!mixed) splitItemIds.clear();

		warning?.toggleAttribute('hidden', !mixed);
		lastAllAvailable = allAvailable;
		lastMixed = mixed;
		syncSplitItemIdsInput();
		refreshSubmitState();

		rows.forEach((row) => {
			const itemId = Number((row as HTMLElement).dataset.itemId);
			const availability = byItemId.get(itemId);
			if (!availability) return;

			// A row that's become available again is no longer eligible to be
			// split out — clear any stale selection now, rather than only when
			// the whole cart stops being mixed. Otherwise, once this row's own
			// button goes hidden below, there's no control left to un-press it,
			// and it would still get silently split into its own order on
			// submit even though it no longer needs to be.
			if (availability.available && splitItemIds.has(itemId)) {
				splitItemIds.delete(itemId);
				syncSplitItemIdsInput();
				refreshSubmitState();
			}

			const pressed = splitItemIds.has(itemId);
			// Only offered on a row that's actually unavailable — splitting off
			// an already-available row wouldn't do anything to resolve the
			// mixed-availability warning, and would let the member satisfy the
			// enable-submit condition without ever touching the blocked item.
			// Also not offered when this line requests more than one of the
			// same item, since a partial per-unit availability shortfall can't
			// be represented by moving the whole line to a separate order.
			const splitOfferable = Boolean(form?.dataset.mixed) && !availability.available && availability.requestedQuantity <= 1;

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
			const itemId = Number((row as HTMLElement).dataset.itemId);
			if (splitItemIds.has(itemId)) splitItemIds.delete(itemId);
			else splitItemIds.add(itemId);
			const pressed = splitItemIds.has(itemId);
			renderSplitToggle(row, pressed);
			syncSplitItemIdsInput();
			refreshSubmitState();
		});
	});
}
