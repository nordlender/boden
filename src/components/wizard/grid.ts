// Single source of truth for the item table's column widths. TableHeader and
// ItemRow both read from here so the select control and every column lines
// up structurally, not by eyeballed CSS.
// Columns: select | image | item | (sub-category) | (product) | stock | details
// Sub-category and product are both inherited from the item's product, so
// neither column exists for unassigned items — not just left blank.
export const GRID_TEMPLATE = {
	assigned: '2.5rem 2.75rem 1fr 8rem 9rem 6rem 3rem',
	unassigned: '2.5rem 2.75rem 1fr 6rem 3rem',
} as const;

// Below the `sm` breakpoint the sub-category and product columns are hidden
// (ItemRow shows the product under the item name instead), so every variant
// shares the unassigned layout and fits a phone screen.
const MOBILE_GRID_TEMPLATE = GRID_TEMPLATE.unassigned;

export type PanelVariant = keyof typeof GRID_TEMPLATE;

// An inline style can't be responsive, so the two templates are passed as
// CSS variables and picked by GRID_COLUMNS_CLASS.
export function gridColumnsStyle(variant: PanelVariant): string {
	return `--grid-cols: ${MOBILE_GRID_TEMPLATE}; --grid-cols-sm: ${GRID_TEMPLATE[variant]}`;
}

export const GRID_COLUMNS_CLASS = 'grid-cols-(--grid-cols) sm:grid-cols-(--grid-cols-sm)';

// For cells that only exist in the sm+ layout.
export const DESKTOP_ONLY_CLASS = 'hidden sm:block';
