// Client-side hover/focus wiring shared by every `.morph-action` element
// (MorphButton, TextMorphButton, MorphInlineButton): the icon morphs to its
// `hover` shape on pointer hover or keyboard focus, and back afterwards. Each
// component's <script> calls this — Astro doesn't dedupe scripts across
// different component files, so a page rendering several of them runs it more
// than once; the `data-morph-wired` guard keeps that safe.
import type { MorphIconElement } from 'morphicons/element';
import { actionIcons, type ActionIconKey } from './icon-nodes';

function setState(el: Element, state: 'default' | 'hover') {
	const key = el.getAttribute('data-morph-action') as ActionIconKey | null;
	const icons = key && actionIcons[key];
	if (!icons) return;
	const icon = el.querySelector<MorphIconElement>('.morph-action-icon');
	if (icon) icon.icon = icons[state];
}

export function wireMorphActions(): void {
	document.querySelectorAll<HTMLElement>('.morph-action:not([data-morph-wired])').forEach((el) => {
		el.dataset.morphWired = 'true';
		el.addEventListener('pointerenter', () => setState(el, 'hover'));
		el.addEventListener('pointerleave', () => setState(el, 'default'));
		el.addEventListener('focus', () => setState(el, 'hover'));
		el.addEventListener('blur', () => setState(el, 'default'));
	});
}
