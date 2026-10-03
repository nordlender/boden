// Single source of truth for the set table's column widths — same idea as
// ../grid.ts (items), one extra column for the plain `label` text field
// (sets have no sub-category column: a set inherits its category from its
// product exactly like an item does, but with Label already added this row
// doesn't need a second inherited-field column to stay legible).
// Columns: select | image | set | label | (product) | stock | details
export const SET_GRID_TEMPLATE = {
	assigned: '2.5rem 2.75rem 1fr 5rem 9rem 6rem 3rem',
	unassigned: '2.5rem 2.75rem 1fr 5rem 6rem 3rem',
} as const;

export type SetPanelVariant = keyof typeof SET_GRID_TEMPLATE;
