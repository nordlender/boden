// Sizing tokens for icon-only triggers that can't use ui/IconButton directly
// (details/summary dropdowns, checkbox-style toggles) — see docs/sizing.md
// for the full reference these are drawn from. An icon that renders as a
// real <button>/<a> should use ui/IconButton or ui/MorphButton instead,
// which already have their own scale in lib/button-styles.ts.
export type TriggerSize = 'sm' | 'md';

// Fixed square box for the trigger element itself. Icon stays roughly 50% of
// the box's height, per the icon-to-container ratio guidance in
// docs/sizing.md.
export const triggerBoxClasses: Record<TriggerSize, string> = {
	sm: 'h-8 w-8', // 32px — dense inline controls (wizard table-row toggles)
	md: 'h-9 w-9', // 36px — top-level nav triggers
};

export const triggerIconPixelSize: Record<TriggerSize, number> = {
	sm: 18,
	md: 20,
};

// The moderator homepage's 3 large action tiles (ActionButton.astro) use a
// deliberately oversized icon that isn't part of either scale above — kept
// as a named constant so it reads as an intentional choice, not a forgotten
// one-off literal.
export const actionTileIconPixelSize = 36;
