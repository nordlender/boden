// Shared class fragments for the Button / IconButton / TextIconButton /
// MorphButton / TextMorphButton primitives (src/components/ui/), so they
// stay visually consistent instead of drifting the way the ad-hoc
// per-feature buttons they replace did. See issue #157 for the audit of
// prior usages this was built from.
import type { ActionIconKey } from './icon-nodes';

export type ButtonVariant = 'primary' | 'secondary' | 'primary-outline' | 'danger' | 'danger-filled';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const variantClasses: Record<ButtonVariant, string> = {
	primary:
		'bg-accent font-medium text-text-inverted hover:bg-accent-hover disabled:bg-disabled-bg disabled:text-disabled-text',
	secondary:
		'border border-border-strong text-text-muted hover:bg-bg-subtle hover:text-text disabled:text-disabled-text disabled:hover:bg-transparent',
	// Outline counterpart of `primary` — same accent palette, not filled. For
	// actions of equal weight to primary that shouldn't compete visually
	// with it (e.g. a secondary call-to-action next to a primary one).
	'primary-outline':
		'border border-accent font-medium text-accent-text hover:bg-accent-subtle disabled:border-disabled-bg disabled:text-disabled-text disabled:hover:bg-transparent',
	danger:
		'border border-error-border font-medium text-error-text hover:bg-error-subtle disabled:border-disabled-bg disabled:text-disabled-text disabled:hover:bg-transparent',
	// Solid fill instead of `danger`'s outline — for actions that actually
	// commit a deletion (not just open a confirm dialog), so the weight of
	// the button matches the weight of the action.
	'danger-filled':
		'bg-error font-medium text-text-inverted hover:bg-error/90 disabled:bg-disabled-bg disabled:text-disabled-text',
};

// Height/padding/text-size for the two-sided (text, or text+icon) buttons.
// Heights are pinned with min-h (32/40/48px, see docs/spacing.md) rather
// than derived from padding, so bordered variants (secondary, danger) and
// filled ones (primary) come out exactly the same height — and line up with
// iconOnlySizeClasses's boxes below and form-styles.ts's inputs. `sm` for
// dense rows/tables, `md` the default, `lg` for a page's main call to
// action. Horizontal padding is generous so labels don't feel boxed in.
export const sizeClasses: Record<ButtonSize, string> = {
	sm: 'min-h-8 px-3 py-1 text-sm gap-1.5',
	md: 'min-h-10 px-4 py-2 text-sm gap-2',
	lg: 'min-h-12 px-6 py-2.5 text-base gap-2.5',
};

// Fixed square box for icon-only buttons, icon centred by baseClasses' flex.
// Icon at roughly half the box per docs/sizing.md's icon-to-container ratio
// guidance: sm 32px box/16px icon, md 40px box/20px icon, lg 48px box/24px
// icon.
export const iconOnlySizeClasses: Record<ButtonSize, string> = {
	sm: 'size-8 shrink-0',
	md: 'size-10 shrink-0',
	lg: 'size-12 shrink-0',
};

export const iconOnlyPixelSize: Record<ButtonSize, number> = {
	sm: 16,
	md: 20,
	lg: 24,
};

// Icon pixel size for the text+icon buttons (TextIconButton, TextMorphButton)
// — smaller than iconOnlyPixelSize since these icons sit next to a label
// rather than carrying the whole button on their own.
export const textIconPixelSize: Record<ButtonSize, number> = {
	sm: 16,
	md: 18,
	lg: 20,
};

export const baseClasses =
	'inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-disabled:opacity-60';

// Default aria-label / visible text for MorphButton/TextMorphButton's
// `action` prop — overridable via `label` (MorphButton) or the default slot
// (TextMorphButton).
export const actionLabels: Record<ActionIconKey, string> = {
	accept: 'Accept',
	cancel: 'Cancel',
	reject: 'Reject',
	delete: 'Delete',
	back: 'Back',
	next: 'Next',
	view: 'View',
	save: 'Save',
	add: 'Add',
	duplicate: 'Duplicate',
	message: 'Message',
	pin: 'Pin',
	unpin: 'Pinned',
};

// Pill-shaped toggle/filter (admin orders' status filter, ProductForm's
// variant-key toggles). Selected-state colors are left to the caller, since
// they key off different attributes (aria-current vs aria-pressed).
export const chipBaseClasses = 'inline-flex min-h-8 items-center rounded-full border px-4 text-xs font-medium transition-colors';
