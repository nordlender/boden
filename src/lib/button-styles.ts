// Shared class fragments for the Button / IconButton / TextIconButton
// primitives (src/components/ui/), so the three stay visually consistent
// instead of drifting the way the ad-hoc per-feature buttons they replace
// did. See issue #157 for the audit of prior usages this was built from.

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const variantClasses: Record<ButtonVariant, string> = {
	primary:
		'bg-accent font-medium text-text-inverted hover:bg-accent-hover disabled:bg-disabled-bg disabled:text-disabled-text',
	secondary:
		'border border-border-strong text-text-muted hover:bg-bg-subtle hover:text-text disabled:text-disabled-text disabled:hover:bg-transparent',
	danger:
		'border border-error-border font-medium text-error-text hover:bg-error-subtle disabled:border-disabled-bg disabled:text-disabled-text disabled:hover:bg-transparent',
};

// Padding/text-size for the two-sided (text, or text+icon) buttons.
export const sizeClasses: Record<ButtonSize, string> = {
	sm: 'px-2 py-1 text-xs gap-1',
	md: 'px-3 py-1.5 text-sm gap-1.5',
	lg: 'px-4 py-2 text-sm gap-2',
};

// Square padding + icon pixel size for icon-only buttons.
export const iconOnlySizeClasses: Record<ButtonSize, string> = {
	sm: 'p-1',
	md: 'p-1.5',
	lg: 'p-2',
};

export const iconOnlyPixelSize: Record<ButtonSize, number> = {
	sm: 14,
	md: 18,
	lg: 22,
};

export const baseClasses =
	'inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed';
