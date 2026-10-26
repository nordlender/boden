// Client-side submit for the unit forms on /admin/items/[id]/units (add
// units, edit details, the status popover — every form posting to
// /api/wizard/units). Posts with fetch and reloads on success; on a
// validation error (e.g. a future purchase date, a duplicate extra field)
// it shows the API's message inline at the bottom of the form instead of
// navigating to a bare error page, so nothing the admin typed is lost.
import { inlineErrorClasses } from './form-styles';

const ERROR_SELECTOR = '[data-unit-form-error]';

function showError(form: HTMLFormElement, message: string | null): void {
	let el = form.querySelector<HTMLElement>(ERROR_SELECTOR);
	if (!message) {
		el?.remove();
		return;
	}
	if (!el) {
		el = document.createElement('p');
		el.dataset.unitFormError = '';
		el.setAttribute('role', 'alert');
		el.className = inlineErrorClasses;
		form.append(el);
	}
	el.textContent = message;
}

async function submit(form: HTMLFormElement): Promise<void> {
	const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
	if (button) button.disabled = true;
	showError(form, null);
	try {
		const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
		if (res.ok) {
			location.reload();
			return;
		}
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		showError(form, body?.error ?? 'Could not save — try again.');
	} catch {
		showError(form, 'Could not reach the server — try again.');
	}
	if (button) button.disabled = false;
}

export function wireUnitForms(): void {
	document.querySelectorAll<HTMLFormElement>('form[action="/api/wizard/units"]').forEach((form) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void submit(form);
		});
		// A reset (Cancel) also clears a stale error.
		form.addEventListener('reset', () => showError(form, null));
	});
}
