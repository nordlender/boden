// Vanilla Tabler icon data for morphicons — IconNode arrays (`[tag, attrs][]`),
// the same structural format lucide's data-only package exports. morphicons
// needs this format (or a raw `d` string); it can't consume the astro-icon /
// iconify component pipeline used elsewhere in `icons.ts`.
//
// Hand-picked from @tabler/icons's tabler-nodes-outline.json (24x24 grid,
// matches morphicons' default) rather than depending on the 11MB package at
// runtime for a handful of icons. To add a pair: `npm view @tabler/icons
// dist.tarball`, download, and pull the entry for the icon name out of
// `tabler-nodes-outline.json`.
import type { IconNode } from 'morphicons';

export const dropdownChevron = {
	closed: [['path', { d: 'M6 9l6 6l6 -6' }]] satisfies IconNode,
	open: [['path', { d: 'M6 15l6 -6l6 6' }]] satisfies IconNode,
};

export const selectCheckbox = {
	unchecked: [['path', { d: 'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14' }]] satisfies IconNode,
	checked: [
		['path', { d: 'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14' }],
		['path', { d: 'M9 12l2 2l4 -4' }],
	] satisfies IconNode,
};

// The navbar's light/dark theme toggle.
export const themeToggle = {
	light: [
		['path', { d: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0' }],
		[
			'path',
			{
				d: 'M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7',
			},
		],
	] satisfies IconNode,
	dark: [
		[
			'path',
			{
				d: 'M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008',
			},
		],
	] satisfies IconNode,
};

// The item row's expand/collapse toggle: list-details when collapsed,
// circle-chevron-up once the details box is open.
export const detailsToggle = {
	closed: [
		['path', { d: 'M13 5h8m-8 4h5m-5 6h8m-8 4h5M3 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm0 10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' }],
	] satisfies IconNode,
	open: [
		['path', { d: 'm9 13l3-3l3 3' }],
		['path', { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0' }],
	] satisfies IconNode,
};
