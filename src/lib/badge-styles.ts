// Shared class fragments for the Badge primitive (src/components/ui/Badge.astro)
// — replaces the rounded-full-pill markup that used to be hand-rolled
// independently in OrderStatusBadge, StatusChip, and the reservation/order
// item rows' availability badges.
export type BadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'error';

export const badgeBaseClasses = 'rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

// Written out in full (not built from a template) so Tailwind's class
// scanner can see every class — same convention as button-styles.ts.
export const badgeToneClasses: Record<BadgeTone, string> = {
	neutral: 'bg-bg-subtle border-border text-text-muted',
	success: 'bg-success-subtle border-success-border text-success-text',
	info: 'bg-info-subtle border-info-border text-info-text',
	warning: 'bg-warning-subtle border-warning-border text-warning-text',
	error: 'bg-error-subtle border-error-border text-error-text',
};
