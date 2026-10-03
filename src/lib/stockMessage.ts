// The product page's availability line under the variant picker. Shared by
// VariantPicker's server render and its client script (no server-only
// imports), so both say the same thing.
//
// Something booked today can still be added to the cart and reserved for a
// later date — the reservation calendar only offers days it's free (see
// src/pages/reservation.astro) — so "none available today" is a warning,
// not an error. Only a variant with no stock at all can't be reserved.
export function stockMessage(availableToday: number, total: number): { text: string; className: string } {
	if (total <= 0) return { text: 'Not available', className: 'text-error-text' };
	if (availableToday > 0) return { text: `${availableToday} available today`, className: 'text-success-text' };
	return { text: 'Booked today — add it to your cart and pick dates when it’s free', className: 'text-warning-text' };
}
