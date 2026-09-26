// Pure DOM-rendering helpers for ReservationForm.astro's client-side script.
// Every function here paints elements from arguments it's given — it never
// fetches, never reads/writes the split-order selection or submit-state
// tracking, and never queries the document outside the element(s) passed in.
// See reservationFormState.ts for the fetch/state logic that decides *what*
// to render and calls these.

export interface ItemAvailability {
	itemId: number;
	available: boolean;
	requestedQuantity: number;
}

// Renders one row's availability badge, split-order button and split tag.
// `pressed`/`splitOfferable` are already-decided by the caller — this only
// paints them.
export function renderRow(row: Element, availability: ItemAvailability, pressed: boolean, splitOfferable: boolean): void {
	const badge = row.querySelector('[data-availability-badge]');
	const splitButton = row.querySelector('[data-split-order-button]');
	const splitTag = row.querySelector('[data-split-tag]');
	if (!(badge instanceof HTMLElement)) return;

	badge.hidden = false;
	if (availability.available) {
		badge.textContent = 'Available';
		badge.className = 'rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700';
	} else {
		badge.textContent = 'Not available';
		badge.className = 'rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700';
	}

	if (splitButton instanceof HTMLButtonElement) {
		splitButton.hidden = !splitOfferable;
		splitButton.setAttribute('aria-pressed', String(pressed));
	}
	if (splitTag instanceof HTMLElement) {
		splitTag.hidden = !pressed;
	}
	if (pressed && badge) {
		// A row moved to its own order is no longer competing for stock
		// with the rest of the cart, so its own availability badge is
		// misleading until the split actually happens server-side —
		// de-emphasize rather than remove it.
		badge.classList.toggle('opacity-50', pressed);
	}
}

// Repaints just a row's split-order affordances (used by the split-button
// click handler, where availability itself hasn't changed).
export function renderSplitToggle(row: Element, pressed: boolean): void {
	const splitButton = row.querySelector('[data-split-order-button]');
	const splitTag = row.querySelector('[data-split-tag]');
	const badge = row.querySelector('[data-availability-badge]');
	if (splitButton instanceof HTMLButtonElement) splitButton.setAttribute('aria-pressed', String(pressed));
	if (splitTag instanceof HTMLElement) splitTag.hidden = !pressed;
	if (badge instanceof HTMLElement) badge.classList.toggle('opacity-50', pressed);
}

// Resets a row to its no-selection-yet appearance (used when the pick-up/
// return range is cleared).
export function hideRow(row: Element): void {
	const badge = row.querySelector('[data-availability-badge]');
	if (badge instanceof HTMLElement) badge.hidden = true;
	const splitButton = row.querySelector('[data-split-order-button]');
	if (splitButton instanceof HTMLElement) splitButton.hidden = true;
	const splitTag = row.querySelector('[data-split-tag]');
	if (splitTag instanceof HTMLElement) splitTag.hidden = true;
}

export function setSubmitEnabled(submitButton: Element | null | undefined, enabled: boolean): void {
	if (submitButton instanceof HTMLButtonElement) submitButton.disabled = !enabled;
}

export function setSubmitHint(submitHint: Element | null | undefined, text: string): void {
	if (submitHint) submitHint.textContent = text;
}
