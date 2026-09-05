// Central icon map for the dynamic wizard (see dynamic_wizard.md's
// `{placeholder}` tokens). Swap a Tabler icon name here and every component
// that renders it via <AppIcon> picks up the change — nothing else to hunt
// through.
export const icons = {
	product: 'tabler:package',
	// {type_icon} — an item's type (e.g. "Jacket", "Tent").
	type: 'tabler:tag',
	// {attribute_icon} — was tabler:tag; freed up for `type` above.
	// Candidates noted for later: tabler:clipboard-list, tabler:chart-bar.
	attribute: 'tabler:list-details',
	image: 'tabler:photo',
	dropdown: {
		closed: 'tabler:chevron-down',
		open: 'tabler:chevron-up',
	},
	// Row-level checkbox only now — the header's select control is a fixed
	// dropdown trigger (see selectMenu below), not a tri-state indicator.
	select: {
		unchecked: 'tabler:square',
		checked: 'tabler:square-check',
	},
	// The table header's select-all control: opens the None/All/Invert menu.
	selectMenu: 'tabler:square-chevron-down',
	selectNone: 'tabler:circle-dashed',
	selectAll: 'tabler:circle-asterisk',
	selectInvert: 'tabler:circle-half-2',
	plus: 'tabler:plus',
	trash: 'tabler:trash',
	// Not one of the doc's named placeholders — added for the main-section
	// search bar, which the doc calls for but doesn't assign an icon to.
	search: 'tabler:search',
} as const;

export type IconName = keyof typeof icons;
