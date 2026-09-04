// Single source of truth for the item table's column widths. TableHeader,
// ButtonStrip (select-all anchor), and ItemRow all read from here so the
// select icon and every column lines up structurally, not by eyeballed CSS.
export const GRID_TEMPLATE = {
	assigned: '2.5rem 2.75rem 1fr 9rem 6rem 3rem',
	unassigned: '2.5rem 2.75rem 1fr 6rem 3rem',
} as const;

export type PanelVariant = keyof typeof GRID_TEMPLATE;
