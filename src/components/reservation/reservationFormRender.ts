// Pure DOM-rendering helpers for ReservationForm.astro's client-side script.
// Every function here paints elements from arguments it's given — it never
// fetches, never reads/writes submit-state tracking, and never queries the
// document outside the element(s) passed in.
// See reservationFormState.ts for the fetch/state logic that decides *what*
// to render and calls these.
import { badgeBaseClasses, badgeToneClasses } from '../../lib/badge-styles';

export interface ItemAvailability {
	itemId: number;
	available: boolean;
	requestedQuantity: number;
}

// Renders one row's availability badge and remove button. The remove button
// is only offered on a row that is unavailable for the chosen dates.
export function renderRow(row: Element, availability: ItemAvailability): void {
	const badge = row.querySelector('[data-availability-badge]');
	const removeButton = row.querySelector('[data-remove-item-button]');
	if (!(badge instanceof HTMLElement)) return;

	badge.hidden = false;
	if (availability.available) {
		badge.textContent = 'Available';
		badge.className = `${badgeBaseClasses} ${badgeToneClasses.success}`;
	} else {
		badge.textContent = 'Not available';
		badge.className = `${badgeBaseClasses} ${badgeToneClasses.error}`;
	}

	if (removeButton instanceof HTMLButtonElement) removeButton.hidden = availability.available;
}

// Resets a row to its no-selection-yet appearance (used when the pick-up/
// return range is cleared).
export function hideRow(row: Element): void {
	const badge = row.querySelector('[data-availability-badge]');
	if (badge instanceof HTMLElement) badge.hidden = true;
	const removeButton = row.querySelector('[data-remove-item-button]');
	if (removeButton instanceof HTMLElement) removeButton.hidden = true;
}

export function setSubmitEnabled(submitButton: Element | null | undefined, enabled: boolean): void {
	if (submitButton instanceof HTMLButtonElement) submitButton.disabled = !enabled;
}

export function setSubmitHint(submitHint: Element | null | undefined, text: string): void {
	if (submitHint) submitHint.textContent = text;
}
