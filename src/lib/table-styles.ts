// Shared class fragments for <table> markup. Written out in full so
// Tailwind's class scanner can see every class — same convention as
// button-styles.ts.
//
// `roomy` is the default for a page-level table (orders, pickup days);
// `dense` is for a small table nested inside something else (a set's
// component breakdown on the product page) where full padding would swamp
// its container.

export type TableDensity = 'roomy' | 'dense';

export const tableClasses = 'w-full border-collapse text-sm';

export const theadRowClasses = 'border-b border-border text-left text-xs uppercase tracking-wide text-text-muted';

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

export const gridTableHeaderClasses =
	'items-center gap-4 border-b border-border bg-bg-subtle px-4 py-3 text-xs font-medium uppercase tracking-wide text-text-muted';

export const gridTableRowClasses = 'items-center gap-x-4 gap-y-2 px-4 py-3 text-sm';
