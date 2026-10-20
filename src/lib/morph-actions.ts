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

/** Wires one `.morph-action` element (a no-op if it's already wired). */
export function wireMorphAction(el: HTMLElement): void {
	if (el.dataset.morphWired) return;
	el.dataset.morphWired = 'true';
	el.addEventListener('pointerenter', () => setState(el, 'hover'));
	el.addEventListener('pointerleave', () => setState(el, 'default'));
	el.addEventListener('focus', () => setState(el, 'hover'));
	el.addEventListener('blur', () => setState(el, 'default'));
}

/**
 * Wires every `.morph-action` under `root` (default: the whole page). Call
 * it again with the new element after adding buttons at runtime — e.g. a
 * row cloned from a <template> (OptsFields.astro) — since the page-load
 * call only sees what was in the document then.
 */
export function wireMorphActions(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>('.morph-action').forEach(wireMorphAction);
}
