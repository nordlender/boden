// Wires the calendar's chosen [from, to] range to the per-item
// availability badges, the unavailable-items warning with its per-item
// remove action, and the checkout form's hidden fromDate/toDate fields —
// see POST /api/reservation/availability and src/lib/orders.ts's
// createOrder.
//
// Submit is blocked until every item in the cart is available for the
// chosen dates; the member either picks different dates or removes the
// unavailable items from their cart (POST /api/cart/remove).
//
// This module owns fetching and state (the last fetched availability, submit
// enable/disable). Pure DOM painting lives in reservationFormRender.ts — this
// module decides *what* to render and calls those functions with the result.
import { hideRow, renderRow, setSubmitEnabled, setSubmitHint, type ItemAvailability } from './reservationFormRender';

export interface ReservationCartItemRef {
	itemId: number;
	quantity: number;
}

export function initReservationForm(initialCartItems: ReservationCartItemRef[]): void {
	// Mutable: removing an unavailable item drops it from here so later
	// availability checks only cover what's still in the cart.
	let cartItems = [...initialCartItems];
	let lastFrom: string | undefined;
	let lastTo: string | undefined;

	const warning = document.querySelector('[data-unavailable-warning]');
	const loadingIndicator = document.querySelector('[data-availability-loading]');
	const submitHint = document.querySelector('[data-submit-hint]');
	const checkoutForm = document.querySelector('.checkout-form');
	const submitButton = checkoutForm?.querySelector('button[type="submit"]');
	const fromDateInput = checkoutForm?.querySelector('[data-checkout-from-date]');
	const toDateInput = checkoutForm?.querySelector('[data-checkout-to-date]');

	let lastAllAvailable = false;
	let lastSomeUnavailable = false;
	// Guards against an in-flight request landing after a later one (rapid
	// date changes while typing/dragging the calendar selection).
	let requestToken = 0;

	function getRows() {
		return document.querySelectorAll('[data-reservation-row]');
	}

	function refreshSubmitState() {
		const enabled = lastAllAvailable && cartItems.length > 0;
		setSubmitEnabled(submitButton, enabled);
		if (enabled) {
			setSubmitHint(submitHint, '');
		} else if (lastSomeUnavailable) {
			setSubmitHint(submitHint, 'Remove the unavailable item(s) from your cart to continue, or choose different dates.');
		} else {
			setSubmitHint(submitHint, 'Select your pick-up and return dates above to continue.');
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
			warning?.setAttribute('hidden', '');
			loadingIndicator?.setAttribute('hidden', '');
			lastAllAvailable = false;
			lastSomeUnavailable = false;
			refreshSubmitState();
			getRows().forEach((row) => hideRow(row));
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
		const someUnavailable = availabilities.some((a) => !a.available);

		warning?.toggleAttribute('hidden', !someUnavailable);
		lastAllAvailable = availabilities.every((a) => a.available);
		lastSomeUnavailable = someUnavailable;
		refreshSubmitState();

		getRows().forEach((row) => {
			const availability = byItemId.get(Number((row as HTMLElement).dataset.itemId));
			if (availability) renderRow(row, availability);
		});
	}

	async function removeItem(row: Element) {
		const itemId = Number((row as HTMLElement).dataset.itemId);
		const body = new FormData();
		body.set('itemId', String(itemId));
		try {
			// The endpoint answers with a redirect to /cart, which we don't
			// want to follow — only the cookie update matters here.
			const res = await fetch('/api/cart/remove', { method: 'POST', body, redirect: 'manual' });
			if (!res.ok && res.type !== 'opaqueredirect') return;
		} catch {
			return;
		}

		cartItems = cartItems.filter((item) => item.itemId !== itemId);
		row.remove();
		if (cartItems.length === 0) {
			window.location.href = '/cart';
			return;
		}
		await refreshAvailability(lastFrom, lastTo);
	}

	document.addEventListener('reservation-range-change', (event) => {
		const { from, to } = (event as CustomEvent<{ from?: string; to?: string }>).detail;
		refreshAvailability(from, to);
	});

	getRows().forEach((row) => {
		row.querySelector('[data-remove-item-button]')?.addEventListener('click', () => removeItem(row));
	});
}
