// Client-side behaviour of one OptsFields.astro block (a unit's editable
// extra fields): "Add field" clones the <template> row, a row's delete button
// removes it, and resetting the surrounding form (e.g. "Cancel" in the Add
// units panel) puts the rows back exactly as the server rendered them —
// dropping rows added since and restoring rows removed since. A plain form
// reset only resets the values of inputs that still exist, so without this
// added rows would linger, blank.
import { wireMorphActions } from './morph-actions';

export function initOptsFields(root: HTMLElement): void {
	const list = root.querySelector<HTMLElement>('[data-opts-list]');
	const template = root.querySelector<HTMLTemplateElement>('[data-opts-template]');
	if (!list || !template) return;
	const initialRows = list.cloneNode(true) as HTMLElement;

	root.addEventListener('click', (event) => {
		const target = event.target as Element;
		const remove = target.closest('[data-opts-remove]');
		if (remove) {
			remove.closest('[data-opts-row]')?.remove();
			return;
		}
		if (!target.closest('[data-opts-add]')) return;
		list.append(template.content.cloneNode(true));
		const row = list.lastElementChild as HTMLElement | null;
		// The page-load wiring never saw this cloned row's delete button.
		if (row) wireMorphActions(row);
		row?.querySelector('input')?.focus();
	});

	// `reset` fires before the browser resets the controls, so the restored
	// rows' inputs are then reset to their server-rendered values too.
	root.closest('form')?.addEventListener('reset', () => {
		const restored = initialRows.cloneNode(true) as HTMLElement;
		// Cloned buttons carry the wired marker but not its listeners.
		restored.querySelectorAll<HTMLElement>('[data-morph-wired]').forEach((el) => delete el.dataset.morphWired);
		list.replaceChildren(...restored.childNodes);
		wireMorphActions(list);
	});
}
