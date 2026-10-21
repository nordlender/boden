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

// The site container: one max width and side gutter shared by the navbar
// and every page (ui/Page.astro), so a page's title always lines up under
// the logo and the page never changes width as you move between pages.
export const containerClasses = 'mx-auto w-full max-w-6xl px-gutter';

// How wide a page's content column may get *inside* the container. It is
// always left-aligned under the title (never re-centred), so a narrower
// page still starts on the same edge. full (default): every list, table,
// hub and tool page; medium: long multi-section forms and pickup days (reservation,
// confirm, product create/edit); narrow: one focused form or result (order
// lookup, order detail, blind count, checkout success, 404).
export type PageWidth = 'narrow' | 'medium' | 'full';

export const pageWidthClasses: Record<PageWidth, string> = {
	narrow: 'max-w-xl',
	medium: 'max-w-3xl',
	full: '',
};

// Corner radius scale: `rounded-xl` for standalone surfaces (cards, panels,
// popovers, callouts), `rounded-lg` for a box nested inside one (ImageMenu's
// file list, a segmented toggle group), `rounded-md` for controls (buttons,
// inputs, menu rows, icon triggers), `rounded-full` for pills and badges.

// Surface panel; ui/Card.astro adds `p-card` padding on top of this.
export const cardClasses = 'rounded-xl border border-border bg-surface';

// Heading hierarchy, largest first:
// One h1 per page (ui/Page.astro renders it from `title`).
export const pageTitleClasses = 'text-2xl font-semibold tracking-tight text-text';

// The h1 of a page whose title lives inside its main card instead of a
// ui/Page header (order detail, blind count) — one step below a page title,
// since the card already frames it.
export const cardTitleClasses = 'text-xl font-semibold tracking-tight text-text';

// A section heading under the page title, and a card/dialog/popover title.
export const sectionTitleClasses = 'text-base font-semibold text-text';

// Small all-caps label for a group *inside* a card or summary (an order's
// "Items", a product's category over its title) — quieter than a section
// title. Page-level sections use sectionTitleClasses, not this.
export const eyebrowClasses = 'text-xs font-semibold uppercase tracking-wide text-text-muted';

// Row of buttons closing a form, dialog or popover — always right-aligned,
// Cancel first, then the primary action. Spacing above it comes from the
// parent's gap, not from padding here.
export const actionRowClasses = 'flex flex-wrap justify-end gap-controls';

// Action row along the bottom of a ui/Card, separated by a divider (order
// detail cards). Left-aligned, unlike actionRowClasses: these are the card's
// main actions, not a form's submit/cancel.
export const cardFooterClasses = 'flex flex-wrap gap-controls border-t border-border pt-card';

// Empty state for a list or table *inside* a card/panel.
export const emptyStateClasses = 'px-card py-12 text-center text-sm text-text-muted';

// Empty state for a list that has no card around it (an empty orders list,
// no pickup days yet) — the dashed frame marks where the list would be.
export const emptyStateFramedClasses = 'rounded-xl border border-dashed border-border px-card py-12 text-center text-sm text-text-muted';

// Large icon + title + description link tiles on the admin/moderator hubs
// (admin/ActionButton.astro, moderator/ActionButton.astro).
export const actionTileClasses =
	'flex flex-1 flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-8 text-center transition-colors hover:border-accent hover:bg-bg-subtle sm:items-start sm:text-left';

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
