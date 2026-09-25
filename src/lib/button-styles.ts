// Shared class fragments for the Button / IconButton / TextIconButton /
// MorphButton / TextMorphButton primitives (src/components/ui/), so they
// stay visually consistent instead of drifting the way the ad-hoc
// per-feature buttons they replace did. See issue #157 for the audit of
// prior usages this was built from.
import type { ActionIconKey } from './icon-nodes';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-filled';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const variantClasses: Record<ButtonVariant, string> = {
	primary:
		'bg-accent font-medium text-text-inverted hover:bg-accent-hover disabled:bg-disabled-bg disabled:text-disabled-text',
	secondary:
		'border border-border-strong text-text-muted hover:bg-bg-subtle hover:text-text disabled:text-disabled-text disabled:hover:bg-transparent',
	danger:
		'border border-error-border font-medium text-error-text hover:bg-error-subtle disabled:border-disabled-bg disabled:text-disabled-text disabled:hover:bg-transparent',
	// Solid fill instead of `danger`'s outline — for actions that actually
	// commit a deletion (not just open a confirm dialog), so the weight of
	// the button matches the weight of the action.
	'danger-filled':
		'bg-error font-medium text-text-inverted hover:bg-error/90 disabled:bg-disabled-bg disabled:text-disabled-text',
};

// Padding/text-size for the two-sided (text, or text+icon) buttons. Heights
// (~28/36/44px) are chosen to line up with iconOnlySizeClasses's box sizes
// below.
export const sizeClasses: Record<ButtonSize, string> = {
	sm: 'px-2.5 py-1 text-sm gap-1.5',
	md: 'px-3.5 py-2 text-sm gap-2',
	lg: 'px-[18px] py-2.5 text-base gap-2.5',
};

// Square padding + icon pixel size for icon-only buttons. Padding keeps the
// icon at roughly half the box per docs/sizing.md's icon-to-container ratio
// guidance: sm 28px box/16px icon, md 36px box/20px icon, lg 44px box/24px
// icon.
export const iconOnlySizeClasses: Record<ButtonSize, string> = {
	sm: 'p-1.5',
	md: 'p-2',
	lg: 'p-2.5',
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
	sm: 14,
	md: 18,
	lg: 20,
};

export const baseClasses =
	'inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed';

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
};
