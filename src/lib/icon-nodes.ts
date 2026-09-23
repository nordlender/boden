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

// The navbar's mobile menu trigger: hamburger closed, X open.
export const navMenu = {
	closed: [
		['path', { d: 'M4 6l16 0' }],
		['path', { d: 'M4 12l16 0' }],
		['path', { d: 'M4 18l16 0' }],
	] satisfies IconNode,
	open: [
		['path', { d: 'M18 6l-12 12' }],
		['path', { d: 'M6 6l12 12' }],
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

// General-purpose action icons for MorphButton/TextMorphButton
// (src/components/ui/) — `default` is the static resting shape, `hover` is
// what it morphs into on hover, focus, or click. Square frame → circle frame
// reads as "confirmed"/"settled" for accept/cancel; the others gain a small
// broken/dashed detail to read as "in motion".
export const actionIcons = {
	accept: {
		default: [
			['path', { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
			['path', { d: 'm9 12l2 2l4-4' }],
		] satisfies IconNode,
		hover: [
			['path', { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0' }],
			['path', { d: 'm9 12l2 2l4-4' }],
		] satisfies IconNode,
	},
	cancel: {
		default: [['path', { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm6 4l6 6m0-6l-6 6' }]] satisfies IconNode,
		hover: [['path', { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0m7-2l4 4m0-4l-4 4' }]] satisfies IconNode,
	},
	delete: {
		default: [
			['path', { d: 'M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3' }],
		] satisfies IconNode,
		hover: [
			['path', { d: 'M4 7h16M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3m-5 5l4 4m0-4l-4 4' }],
		] satisfies IconNode,
	},
	back: {
		default: [['path', { d: 'M5 12h14M5 12l6 6m-6-6l6-6' }]] satisfies IconNode,
		hover: [['path', { d: 'M5 12h6m3 0h1.5m3 0h.5M5 12l6 6m-6-6l6-6' }]] satisfies IconNode,
	},
	next: {
		default: [['path', { d: 'M5 12h14m-6 6l6-6m-6-6l6 6' }]] satisfies IconNode,
		hover: [['path', { d: 'M5 12h.5m3 0H10m3 0h6m-6 6l6-6m-6-6l6 6' }]] satisfies IconNode,
	},
} as const;

export type ActionIconKey = keyof typeof actionIcons;
