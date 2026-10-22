// Shared client-side flow behind an ActionPopover.astro plain-confirm
// (`data-action-popover-confirm`) that fires a fetch: hide the popover,
// disable the confirm button, send the request, then either run the
// caller's success action or show an error, and re-enable the button in
// `finally`. Used by src/components/orders/DeleteOrderButton.astro (delete
// or cancel an order) and src/components/pickup-days/PickupDayDeleteButton.astro
// (delete a pickup-days row), which differ only in endpoint, method,
// what happens on success and the error copy (#216).

export interface ActionPopoverConfirmOptions {
	endpoint: string;
	method?: 'DELETE' | 'POST';
	// Where the error message goes; shown/hidden via the `hidden` attribute.
	errorEl: HTMLElement | null;
	onSuccess: (res: Response) => void;
	// Message for a non-ok response. `body` is the parsed JSON body, or {}
	// when there isn't one.
	formatError: (body: Record<string, unknown>, res: Response) => string;
	// Message when the request itself fails (network error, etc).
	networkError?: string;
}

export function wireActionPopoverConfirm(container: HTMLElement, options: ActionPopoverConfirmOptions): void {
	const { endpoint, method = 'DELETE', errorEl, onSuccess, formatError, networkError = 'Something went wrong. Please try again.' } = options;
	const trigger = container.querySelector<HTMLButtonElement>('[data-action-popover-confirm]');
	if (!trigger) return;

	function showError(message: string) {
		if (!errorEl) return;
		errorEl.textContent = message;
		errorEl.removeAttribute('hidden');
	}

	trigger.addEventListener('click', async () => {
		const popover = trigger.closest<HTMLElement>('[popover]');
		popover?.hidePopover();
		trigger.disabled = true;
		errorEl?.setAttribute('hidden', '');

		try {
			const res = await fetch(endpoint, { method });
			if (res.ok) {
				onSuccess(res);
				return;
			}
			const body = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
			showError(formatError(body, res));
		} catch {
			showError(networkError);
		} finally {
			trigger.disabled = false;
		}
	});
}
