// Shared class fragments for page structure — page widths, cards, headings
// and dropdown menus — so every page lands on the same spacing (see
// docs/spacing.md) instead of hand-picking `max-w-*`/`p-*`/`text-*` per
// file. Written out in full (not built from templates) so Tailwind's class
// scanner can see every class — same convention as button-styles.ts.
//
// Most pages shouldn't need these directly: ui/Page.astro and ui/Card.astro
// wrap them. Reach for the raw fragments when a component needs the look
// without the wrapper (e.g. a <details> dropdown panel, a heading inside a
// component that isn't a Card).

// Max content width for ui/Page.astro. narrow: single forms/confirmations;
// medium: reading-width flows (cart review, order detail); wide: admin and
// moderator tools with tables; full: the shop grid.
export type PageWidth = 'narrow' | 'medium' | 'wide' | 'full';

export const pageWidthClasses: Record<PageWidth, string> = {
	narrow: 'max-w-xl',
	medium: 'max-w-3xl',
	wide: 'max-w-5xl',
	full: 'max-w-6xl',
};

// Surface panel; ui/Card.astro adds `p-card` padding on top of this.
export const cardClasses = 'rounded-xl border border-border bg-surface';

// One h1 per page (ui/Page.astro renders it from `title`).
export const pageTitleClasses = 'text-2xl font-semibold tracking-tight text-text';

// A section/card heading under the page title.
export const sectionTitleClasses = 'text-base font-semibold text-text';

// Small all-caps label above a group (e.g. a category over a product title,
// "Today" over a list) — quieter than a section title.
export const eyebrowClasses = 'text-xs font-semibold uppercase tracking-wide text-text-muted';

// Floating panel for dropdowns/menus (<details> menus, select menus).
export const menuPanelClasses = 'rounded-xl border border-border bg-surface p-1.5 shadow-lg';

// One row in a menuPanelClasses panel — roomy enough to be an easy target.
export const menuItemClasses =
	'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-text-muted hover:bg-bg-subtle hover:text-text';

// Floating panel holding a small form or content (a <details> dropdown with
// fields, Popover.astro's default chrome) — roomier than menuPanelClasses,
// which is for a list of menu rows.
export const floatingPanelClasses = 'rounded-xl border border-border bg-surface p-5 shadow-lg';

// Title bar across the top of a padding-less card (cardClasses with a table
// or divide-y list inside, e.g. the wizard's item/set panels).
export const cardHeaderClasses = 'border-b border-border px-card py-4 text-base font-semibold text-text';
