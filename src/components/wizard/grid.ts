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

export type PanelVariant = keyof typeof GRID_TEMPLATE;
