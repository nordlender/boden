// Client-side runtime for Popover.astro: the document-level listeners that
// position every [data-popover] element, plus `openPopover` for scripts that
// open one themselves.
//
// Lives in a module rather than inline in Popover.astro's <script> so load
// order is guaranteed by imports instead of by where Astro happens to emit
// each component's script. A script that opens a popover on page load
// (AssignWarning.astro) could otherwise run before Popover.astro's script —
// Astro emits a component's script where it first renders — so the opening
// popover's `beforetoggle` fired with no listener and it painted at the
// browser's default spot. Importing `openPopover` from here means this
// module (and its listeners) has always run first: ES modules evaluate
// their imports before themselves, and a module only ever evaluates once,
// however many scripts import it.
//
// One listener set covers every Popover instance, matched by id — same
// pattern as Modal.astro's document-level click delegation.
//
// A popover is promoted to the top layer (and becomes visible/UA-styled,
// with no positioning of ours applied yet) as part of showPopover()'s
// synchronous work, but the `toggle` event that lets us measure and then
// position it is dispatched as a separate, later task — so there's a real
// gap where an opening popover would otherwise paint at its unpositioned
// default spot (~top-left of the viewport) before jumping to the right
// place. `beforetoggle` (sync, fires first) hides it; `toggle` positions it
// and reveals it, so nothing paints in between.

const GAP = 8; // px between the popup and the element it's placed against
const EDGE_MARGIN = 8; // px kept clear of the viewport edge

function clamp(value: number, size: number, viewportSize: number) {
	return Math.min(Math.max(value, EDGE_MARGIN), Math.max(EDGE_MARGIN, viewportSize - size - EDGE_MARGIN));
}

function positionPopover(popover: HTMLElement) {
	const trigger = document.querySelector<HTMLElement>(`[popovertarget="${popover.id}"]`);
	if (!trigger) return;

	const placement = popover.dataset.popoverPlacement;
	const side = popover.dataset.popoverSide ?? 'top';
	const triggerRect = trigger.getBoundingClientRect();

	if (placement !== 'fill-parent') {
		// Cap size to the viewport before measuring, so a popover that's
		// too big to fit shrinks instead of just having its position
		// clamped — which would otherwise still push it past the
		// opposite edge. min() with the existing computed max-width/height
		// (e.g. Tailwind's max-w-sm) so this only ever shrinks it further,
		// never grows it past what the class already caps it to.
		const computedMaxWidth = parseFloat(getComputedStyle(popover).maxWidth) || Infinity;
		const computedMaxHeight = parseFloat(getComputedStyle(popover).maxHeight) || Infinity;
		popover.style.maxWidth = `${Math.min(computedMaxWidth, window.innerWidth - 2 * EDGE_MARGIN)}px`;
		popover.style.maxHeight = `${Math.min(computedMaxHeight, window.innerHeight - 2 * EDGE_MARGIN)}px`;
	}

	// Only valid once the popover is actually in the top layer (i.e. from
	// the `toggle` event, not `beforetoggle` — at `beforetoggle` time for
	// an opening popover it's still hidden and this rect is zero-sized).
	const popRect = popover.getBoundingClientRect();

	if (placement === 'fill-parent') {
		const container = trigger.closest<HTMLElement>('[data-popover-container]');
		if (!container) {
			console.warn(
				`Popover #${popover.id}: placement="fill-parent" but no ancestor has data-popover-container — falling back to the trigger's own width.`,
			);
		}
		const rect = container?.getBoundingClientRect() ?? triggerRect;
		const width = Math.min(rect.width, window.innerWidth - 2 * EDGE_MARGIN);
		popover.style.width = `${width}px`;
		popover.style.maxWidth = 'none';
		// Re-measure after the width change: content commonly wraps
		// differently at the container's width than at popRect's
		// (pre-resize) width, so popRect.height would be stale here.
		const height = popover.getBoundingClientRect().height;
		popover.style.left = `${clamp(rect.left, width, window.innerWidth)}px`;
		popover.style.top = `${clamp(triggerRect.top, height, window.innerHeight)}px`;
		return;
	}

	// "anchor" mode: content-sized, placed beside/over the trigger and
	// clamped so it never runs off the viewport edge.
	let top = triggerRect.top;
	let left = triggerRect.left;

	if (side === 'top') {
		top = triggerRect.top - popRect.height - GAP;
		left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
	} else if (side === 'bottom') {
		top = triggerRect.bottom + GAP;
		left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
	} else if (side === 'left') {
		top = triggerRect.top + triggerRect.height / 2 - popRect.height / 2;
		left = triggerRect.left - popRect.width - GAP;
	} else if (side === 'right') {
		top = triggerRect.top + triggerRect.height / 2 - popRect.height / 2;
		left = triggerRect.right + GAP;
	}

	popover.style.left = `${clamp(left, popRect.width, window.innerWidth)}px`;
	popover.style.top = `${clamp(top, popRect.height, window.innerHeight)}px`;
}

// Neither event bubbles, so both need the capture phase to reach a
// document-level listener at all.
document.addEventListener(
	'beforetoggle',
	(event) => {
		const popover = event.target;
		if (!(popover instanceof HTMLElement) || !popover.hasAttribute('data-popover')) return;
		if (!(event instanceof ToggleEvent) || event.newState !== 'open') return;
		popover.style.visibility = 'hidden';
	},
	true,
);

// `toggle` fires after an opening popover has already been added to the
// top layer, so its bounding rect reflects its real size rather than
// reading as zero (unlike at `beforetoggle` time).
document.addEventListener(
	'toggle',
	(event) => {
		const popover = event.target;
		if (!(popover instanceof HTMLElement) || !popover.hasAttribute('data-popover')) return;
		if (!(event instanceof ToggleEvent) || event.newState !== 'open') return;
		positionPopover(popover);
		popover.style.visibility = '';
	},
	true,
);

// The trigger's position can change between open and a subsequent
// reposition need (e.g. the buttons row reflowing) — re-measure on
// resize while a popover is open rather than only once at open time.
window.addEventListener('resize', () => {
	document.querySelectorAll<HTMLElement>('[data-popover]:popover-open').forEach(positionPopover);
});

/**
 * Opens a Popover.astro popover from script. Use this instead of a bare
 * `el.showPopover()` whenever a script opens a popover without a user click
 * on its `popovertarget` trigger (on page load, after a redirect, ...):
 * importing it is what guarantees the positioning listeners above are
 * registered before the popover opens (see the file comment).
 */
export function openPopover(popover: HTMLElement): void {
	popover.showPopover();
}
