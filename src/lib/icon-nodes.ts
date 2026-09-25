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
	// tabler's "sun-moon" — shown on hover/focus as a hint of what the click will do.
	hover: [
		['path', { d: 'M9.173 14.83a4 4 0 1 1 5.657-5.657' }],
		[
			'path',
			{
				d: 'm11.294 12.707l.174.247a7.5 7.5 0 0 0 8.845 2.492A9 9 0 0 1 5.642 18.36M3 12h1m8-9v1M5.6 5.6l.7.7M3 21L21 3',
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
// what it morphs into on hover, focus, or click. Accept/Cancel morph a
// boxed shape into its bare mark (checkbox → check, boxed X → X); the
// others gain a small broken/dashed detail to read as "in motion".
const acceptIcon = {
	default: [
		['path', { d: 'm9 11l3 3l8-8' }],
		['path', { d: 'M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9' }],
	] satisfies IconNode,
	hover: [['path', { d: 'm5 12l5 5L20 7' }]] satisfies IconNode,
};

// Boxed-X mark shared by cancel and reject — a reject is a cancel of the
// request, so it reuses cancel's icon pair rather than defining its own.
const cancelIcon = {
	default: [['path', { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm6 4l6 6m0-6l-6 6' }]] satisfies IconNode,
	hover: [['path', { d: 'M18 6L6 18M6 6l12 12' }]] satisfies IconNode,
};

const deleteIcon = {
	default: [
		['path', { d: 'M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3' }],
	] satisfies IconNode,
	hover: [
		['path', { d: 'm3 3l18 18M4 7h3m4 0h9m-10 4v6m4-3v3M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l.077-.923m.307-3.704L19 7M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3' }],
	] satisfies IconNode,
};

const backIcon = {
	default: [['path', { d: 'M5 12h14M5 12l6 6m-6-6l6-6' }]] satisfies IconNode,
	hover: [['path', { d: 'M5 12h6m3 0h1.5m3 0h.5M5 12l6 6m-6-6l6-6' }]] satisfies IconNode,
};

const nextIcon = {
	default: [['path', { d: 'M5 12h14m-6 6l6-6m-6-6l6 6' }]] satisfies IconNode,
	hover: [['path', { d: 'M5 12h.5m3 0H10m3 0h6m-6 6l6-6m-6-6l6 6' }]] satisfies IconNode,
};

const viewIcon = {
	default: [
		['path', { d: 'M10 12a2 2 0 1 0 4 0a2 2 0 0 0-4 0' }],
		['path', { d: 'M21 12q-3.6 6-9 6t-9-6q3.6-6 9-6t9 6' }],
	] satisfies IconNode,
	hover: [['path', { d: 'M21 9q-3.6 4-9 4T3 9m0 6l2.5-3.8M21 14.976L18.508 11.2M9 17l.5-4m5.5 4l-.5-4' }]] satisfies IconNode,
};

export const actionIcons = {
	accept: acceptIcon,
	cancel: cancelIcon,
	reject: cancelIcon,
	delete: deleteIcon,
	back: backIcon,
	next: nextIcon,
	view: viewIcon,
} as const;

export type ActionIconKey = keyof typeof actionIcons;

// The three large tiles on the moderator index page (ActionButton.astro) —
// pulled from @iconify-json/tabler's icons.json (already a project
// dependency for astro-icon) rather than tabler-nodes-outline.json above,
// since that's what's actually installed here; same 24x24 outline style
// either way. "hover" is also used for keyboard focus and touch-tap, not
// literally only mouse hover.
export const moderatorActionIcons = {
	retrieve: {
		// package-export
		default: [
			['path', { d: 'm12 21l-8-4.5v-9L12 3l8 4.5V12m-8 0l8-4.5M12 12v9m0-9L4 7.5M15 18h7m-3-3l3 3l-3 3' }],
		] satisfies IconNode,
		// truck-loading
		hover: [
			['path', { d: 'M2 3h1a2 2 0 0 1 2 2v10a2 2 0 0 0 2 2h15' }],
			['path', { d: 'M9 9a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3zM7 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0m9 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0' }],
		] satisfies IconNode,
	},
	return: {
		// package-import
		default: [
			['path', { d: 'm12 21l-8-4.5v-9L12 3l8 4.5V12m-8 0l8-4.5M12 12v9m0-9L4 7.5M22 18h-7m3-3l-3 3l3 3' }],
		] satisfies IconNode,
		// building-warehouse
		hover: [
			['path', { d: 'M3 21V8l9-4l9 4v13' }],
			['path', { d: 'M13 13h4v8H7v-6h6' }],
			['path', { d: 'M13 21v-9a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3' }],
		] satisfies IconNode,
	},
	pickupDays: {
		// calendar-plus
		default: [
			['path', { d: 'M12.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5m-4-9v4M8 3v4m-4 4h16m-4 8h6m-3-3v6' }],
		] satisfies IconNode,
		// robot-face — placeholder personality icon for the still-unbuilt
		// pickup-days feature; calendar-smile (also tabler) might read
		// better here once the real page exists, worth revisiting then.
		hover: [
			['path', { d: 'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2' }],
			['path', { d: 'M9 16q1.5 1 3 1c1.5 0 2-.333 3-1M9 7L8 3m7 4l1-4m-7 9v-1m6 1v-1' }],
		] satisfies IconNode,
	},
} satisfies Record<string, { default: IconNode; hover: IconNode }>;
