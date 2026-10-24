// Shared class fragments for <table> markup. Written out in full so
// Tailwind's class scanner can see every class — same convention as
// button-styles.ts.
//
// `roomy` is the default for a page-level table (orders, pickup days);
// `dense` is for a small table nested inside something else (a set's
// component breakdown on the product page) where full padding would swamp
// its container. Each density carries its own text size, so a table never
// needs a second, competing `text-*` class on top.
//
// Plain strings, so a client-side <script> that builds a table at runtime
// (VariantPicker.astro's set breakdown) can import and reuse them too —
// server-rendered and script-rendered copies of a table then always match.

export type TableDensity = 'roomy' | 'dense';

export const tableClasses: Record<TableDensity, string> = {
	roomy: 'w-full border-collapse text-sm',
	dense: 'w-full border-collapse text-xs',
};

export const theadRowClasses: Record<TableDensity, string> = {
	roomy: 'border-b border-border text-left text-xs uppercase tracking-wide text-text-muted',
	dense: 'border-b border-border text-left text-text-muted',
};

export const tbodyRowClasses = 'border-b border-border last:border-0';

export const thClasses: Record<TableDensity, string> = {
	roomy: 'px-4 py-3 font-medium',
	dense: 'py-2 pr-4 font-medium',
};

export const tdClasses: Record<TableDensity, string> = {
	roomy: 'px-4 py-3',
	dense: 'py-2 pr-4',
};

// --- CSS-grid "tables" ---
// Lists laid out as a header row + one <div> per row on a shared grid
// template (pickup days, the units table) instead of a real <table>, so rows
// can restack on mobile. The template comes from `--grid-cols` (mobile) /
// `--grid-cols-sm` (sm+) set in an inline style by the caller. These give
// the header and rows the same padding/gap as a roomy <table> above, so the
// two kinds of table look alike.
export const gridColumnsClasses = 'grid grid-cols-(--grid-cols) sm:grid-cols-(--grid-cols-sm)';

export const gridTableFrameClasses = 'overflow-hidden rounded-xl border border-border bg-surface';

// Horizontal padding is `px-card`, the same as cardHeaderClasses and the
// toolbars above a table, so a panel's title, toolbar and columns all start
// on one left edge. Columns are 12px apart (gap-3) in both: header and rows
// are separate grids, so their column gaps must match to stay aligned.
export const gridTableHeaderClasses =
	'items-center gap-3 border-b border-border bg-bg-subtle px-card py-3 text-xs font-medium uppercase tracking-wide text-text-muted';

export const gridTableRowClasses = 'items-center gap-x-3 gap-y-2 px-card py-3 text-sm';

// Toolbar strip between a panel's title and its table (bulk actions,
// dropdowns) — see wizard/ButtonStrip.astro, wizard/sets/SetToolbar.astro.
export const tableToolbarClasses = 'flex flex-wrap items-center gap-controls border-b border-border bg-bg-subtle px-card py-3';
