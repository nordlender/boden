// Central icon map for the dynamic wizard (see docs/wizard.md's
// `{placeholder}` tokens). Swap a Tabler icon name here and every component
// that renders it via <AppIcon> picks up the change — nothing else to hunt
// through.
export const icons = {
	product: 'tabler:package',
	// {category_icon} / sub-category tag — both inherited from the item's
	// product, not set per-item. Type (per-item, editable at creation) has
	// been removed in favor of this.
	subCategory: 'tabler:category',
	// {attribute_icon} — used inside the expanded details box as a small
	// section-label icon. The row's own toggle button uses the same
	// `list-details` artwork but as an animated morphicons pair (closed
	// state) — see detailsToggle in icon-nodes.ts, used by DetailsToggle.astro.
	attribute: 'tabler:list-details',
	image: 'tabler:photo',
	// `{dropdown_icon}` and `{select_icon}` are gone from here — both are
	// animated with morphicons now (see src/lib/icon-nodes.ts), which needs
	// IconNode data, not an iconify name. Dropdown.astro and SelectIcon.astro
	// render <MorphIcon> directly instead of going through <AppIcon>.
	// The table header's select-all control: opens the None/All/Invert menu.
	selectMenu: 'tabler:square-chevron-down',
	selectNone: 'tabler:circle-dashed',
	selectAll: 'tabler:circle-asterisk',
	selectInvert: 'tabler:circle-half-2',
	trash: 'tabler:trash',
	// {edit_icon} — sits next to an attribute's value in the details box;
	// clicking it reveals the inline edit form for that field.
	edit: 'tabler:pencil',
	// Not one of the doc's named placeholders — added for the main-section
	// search bar, which the doc calls for but doesn't assign an icon to.
	search: 'tabler:search',
	// {separate_order_icon} — reservation page, per-item action offered when
	// an order mixes available and unavailable items for the chosen date
	// range: lets the member split that one item out into its own order.
	splitOrder: 'tabler:arrows-split-2',
} as const;

export type IconName = keyof typeof icons;
