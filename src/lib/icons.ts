// Central icon map for the dynamic wizard (see dynamic_wizard.md's
// `{placeholder}` tokens). Swap a Tabler icon name here and every component
// that renders it via <AppIcon> picks up the change — nothing else to hunt
// through.
export const icons = {
	product: 'tabler:package',
	attribute: 'tabler:tag',
	image: 'tabler:photo',
	dropdown: {
		closed: 'tabler:chevron-down',
		open: 'tabler:chevron-up',
	},
	// Used by <SelectIcon> for both the header select-all control and every
	// row checkbox — one icon set for both keeps them visually identical.
	select: {
		unchecked: 'tabler:square',
		checked: 'tabler:square-check',
		indeterminate: 'tabler:square-minus',
	},
	trash: 'tabler:trash',
	// Not one of the doc's named placeholders — added for the main-section
	// search bar, which the doc calls for but doesn't assign an icon to.
	search: 'tabler:search',
} as const;

export type IconName = keyof typeof icons;
