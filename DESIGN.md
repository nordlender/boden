---
name: Boden
description: OSI Klatring's gear shed online, browsed as a wall of gear rows.
colors:
  graphite-ground: "#0c0f14"
  graphite-ground-subtle: "#131820"
  graphite-surface: "#161b23"
  graphite-plate: "#1d232c"
  graphite-border: "#242b35"
  graphite-border-strong: "#333c48"
  graphite-border-interactive: "#6a7584"
  frost-text: "#eef1f4"
  frost-text-muted: "#a2abb7"
  org-red: "#a20000"
  on-accent: "#ffffff"
  org-red-bright: "#bd1515"
  coral-text: "#f06a63"
  azure: "#2f6ae0"
  azure-hover: "#2558c4"
  azure-text: "#8ab6ff"
  azure-focus: "#7fb0ff"
  pale-ground: "#f2f3f5"
  pale-ground-subtle: "#e8eaee"
  pale-surface: "#ffffff"
  pale-plate: "#e3e6eb"
  pale-border: "#dcdfe5"
  pale-border-strong: "#c3c8d0"
  pale-border-interactive: "#7a8392"
  ink-text: "#0e1218"
  ink-text-muted: "#525b68"
  org-red-deep: "#850000"
  deep-azure: "#1f5fcc"
  deep-azure-hover: "#184ea8"
  deep-azure-text: "#1a55b8"
  success-dark: "#8fdc55"
  success-light: "#3b7d1c"
  info-dark: "#38c8f0"
  info-light: "#0a7896"
  warning-dark: "#ffb52e"
  warning-light: "#b26a00"
  error-dark: "#ff5f57"
  error-light: "#c4302b"
typography:
  display:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  order-code:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.12em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "-0.02em"
  row-title:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.01em"
  tile-title:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  body-lead:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  meta:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  snug: "8px"
  controls: "12px"
  stack: "20px"
  card: "20px"
  region: "24px"
  section: "32px"
  gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.org-red}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.org-red-bright}"
    textColor: "{colors.on-accent}"
  button-primary-lg:
    backgroundColor: "{colors.org-red}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "10px 24px"
    height: "48px"
  button-primary-accent-alt:
    backgroundColor: "{colors.azure}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-primary-accent-alt-hover:
    backgroundColor: "{colors.azure-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.graphite-ground-subtle}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.frost-text-muted}"
    rounded: "{rounded.lg}"
    size: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.graphite-ground-subtle}"
    textColor: "{colors.frost-text}"
  chip-category:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  chip-variant:
    backgroundColor: "transparent"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    height: "44px"
  chip-variant-selected:
    backgroundColor: "{colors.org-red}"
    textColor: "{colors.on-accent}"
  input:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.frost-text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.graphite-surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  tile-plate:
    backgroundColor: "{colors.graphite-plate}"
    rounded: "{rounded.xl}"
  badge-neutral:
    backgroundColor: "{colors.graphite-ground-subtle}"
    textColor: "{colors.frost-text-muted}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  navbar:
    backgroundColor: "{colors.graphite-ground}"
    height: "64px"
---

# Design System: Boden

Token usage rules (which semantic utility to reach for, no raw palette classes) live in [docs/styling.md](docs/styling.md); spacing tokens and the page/card primitives live in [docs/spacing.md](docs/spacing.md). This file owns the visual world those rules serve. Colour values are authored once, in `src/styles/global.css` as `light-dark()` pairs; the frontmatter lists each half under a dark-theme name (graphite, frost, coral text, azure) and a light-theme name (pale, ink, org red deep, deep azure). The org red fill and its white on-accent text are the same in both themes, so they appear once. Components in the frontmatter show the dark theme, which is the native one.

## Overview

**Creative North Star: "The Gear Wall"**

Boden is the club shed laid out as a streaming wall: one row per category, each a sideways rail of square photo plates on a deep graphite ground. The photos carry the colour; the interface stays near-black and blue-grey so harnesses, ropes and cams read as the content. OSI Klatring's org red is the club's voice: the single primary action on a screen, the current page and links. Its azure complement marks what is in play: focus and selection everywhere, and the primary action on screens where red already means delete, reject or unavailable. When a tile is focused or hovered it lifts and its row-mates step back, so the eye always knows where it is.

Dark is the native theme. Light is the same system on cool pale grey with the same org red fill and a deeper azure, not a separate design. Type is one Nordic grotesk whose hierarchy comes from weight: heavy, tightly tracked row and page titles over plain, quiet body text, with tabular figures wherever dates, counts and order codes sit. The density is roomy by default and dense only where browsing wants it (the shop rails, small controls).

The world refuses the uniform white product-card grid with a blue call to action. It should feel like a well-kept club shelf, never cold and corporate, never playful or juvenile.

**Key Characteristics:**
- Graphite grounds in three close steps (ground, surface, plate) with hairline borders rather than shadows.
- Org red (#a20000, white text) for the primary action, the current page and links; azure for focus, selection and the accent on red-heavy screens.
- Borderless fixed-ratio photo plates on a shared plate colour, so the catalogue reads as one set.
- Schibsted Grotesk only; weight 800 for titles, tabular figures for every number that is read or compared.
- Motion is short exponential ease-out on transform and opacity, and is switched off under reduced motion.

## Colors

A cool graphite ladder carrying the club's org red as its voice and an azure complement for focus and selection, plus status hues tuned separately for each theme.

The direction contract named a mint accent; at the user's request the shipped system replaced it with OSI Klatring's org red, and the build is what this file records.

### Primary
- **Org Red** (both themes): the accent fill. The primary button, the selected variant chip, the reservation step markers and the navbar's 2px current-page bar. The fill is the exact org colour in light and dark, never retuned per theme, with **On Accent** white text on top (8.3:1).
- **Org Red Deep** (light) / **Org Red Bright** (dark): the primary button's hover fill only; darker on pale grey, brighter on graphite so the hover always reads as a change.
- **Org Red** (light) / **Coral Text** (dark): the accent as a text colour (`--ui-accent-text`): links, `See all`, the primary-outline button, the emblem's hover tint. Dark mode lifts it to a coral tint of the same red (6.4:1 on the ground) because the org red itself is only 2.3:1 on graphite. `--ui-accent-subtle` is a 16% red wash in dark (pale rose in light) for hover fills behind accent text.

### Secondary
- **Azure** (dark) / **Deep Azure** (light) (`--ui-azure*`): the complement. It is never decoration; it owns three jobs.
  - **Selection** (`--ui-selected*`, with **On Accent** white as `on-selected`): selected wizard rows, picked reservation and pick-up calendar days (Cally's theme is pointed at `selected`), native checkboxes, radios and ranges (`accent-color`), text selection (a 32% azure wash), and the availability calendar's "today" outline. `selected-border` and `selected-text` are their own steps.
  - **Focus**: **Azure Focus** (dark) / **Deep Azure** (light) is `--ui-focus-ring`, used for every focus outline, the input focus border plus its 25% ring, and the text caret.
  - **The accent inside `.accent-alt`**: the scope remaps `accent`, `accent-hover`, `accent-subtle` and `accent-text` to the azure steps for its subtree. It wraps the admin and moderator main content, the cart sidebar, `/orders/[code]` and `/reservation`, so primary buttons, outline buttons, links, admin action-tile hover borders, wizard toggles and the reservation step markers there render azure. The navbar sits outside every scope and keeps the org red.
- **Azure Hover / Deep Azure Hover**: primary hover inside `.accent-alt`. **Azure Text / Deep Azure Text**: accent text inside `.accent-alt`.

### Neutral
- **Graphite Ground / Pale Ground**: the page background and the navbar. The sticky category-chip bar uses it too, so it reads as part of the page.
- **Graphite Ground Subtle / Pale Ground Subtle**: hover fills for secondary and ghost controls, table header strips, the pick-up info block.
- **Graphite Surface / Pale Surface**: cards, panels, menus, the cart sidebar, inputs and category chips.
- **Graphite Plate / Pale Plate**: the ground behind every gear photo (shop tiles, the product image, thumbnails) and skeleton blocks. One plate colour for all imagery.
- **Graphite Border / Pale Border**: hairline dividers and card outlines.
- **Graphite Border Strong / Pale Border Strong**: chip and secondary-button outlines, slash separators in meta lines.
- **Graphite Border Interactive / Pale Border Interactive**: the only boundary of an input, checkbox or stepper; held to 3:1 non-text contrast in both themes.
- **Frost Text / Ink Text**: primary text. **Frost Text Muted / Ink Text Muted**: descriptions, counts, meta lines, table headers.

### Status
- **Success** (yellow-green), **Info** (cyan, deliberately not blue so "scheduled" never reads as azure selection), **Warning** (amber), **Error** (coral red). Each has a base, `-subtle` fill, `-border` and `-text` step. In dark mode they are vivid: the fill mixes the base into the surface at 22%, the border at 55%, and the text is a bright tint, so status badges stay saturated on graphite. Light mode keeps pale tinted fills with deep text. Used in callouts, badges, danger buttons and stock lines ("Not in stock" in error text, a success/error dot on the product page).
- **Availability ramp** (`--ui-availability-0..4`): red to green transparent tints per mode for the availability calendar; counts on top always use normal text tokens.
- **Help** (`--ui-help*`): still Tailwind violet. This is an open item: the user wants no violet and has deferred the replacement. Do not copy the violet anywhere else.

### Named Rules
**The Photos Carry the Colour Rule.** The interface stays graphite (or pale grey) with the org red and its azure complement; the gear photography is where colour lives. No decorative hues, gradients or tinted panels around tiles.

**The Red Voice, Azure Hand Rule.** Org red is the club speaking: the one primary action, the current page, links. Azure is the user's hand on the interface: focus and selection, always, so nothing focused or selected can read as an error. A screen has at most one filled accent button; everything else is secondary, ghost or text.

**The No Red Beside Red Rule.** Wherever a primary action shares the screen with a `danger` or `danger-filled` button or with red availability states, wrap that content in `.accent-alt` so the accent turns azure. Red then means only "destructive" or "unavailable" on that screen. The navbar never goes inside the scope.

## Typography

**Display Font:** Schibsted Grotesk Variable (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Schibsted Grotesk Variable
**Label/Mono Font:** none; figures use `tabular-nums` on the same family.

**Character:** A Nordic news grotesk with full æøå coverage for the planned Norwegian copy. Heavy, tightly tracked titles give the shelf its confidence; regular-weight body copy stays plain and friendly.

### Hierarchy
- **Display** (800, 1.875rem rising to 2.25rem from 40rem, -0.025em): one page title per page, including the product title.
- **Order Code** (800, same size as Display, +0.12em, tabular): the order code read aloud at pick-up; the largest thing on its card.
- **Headline** (700, 1.5rem, -0.02em): an h1 that lives inside its card (order detail).
- **Row Title** (800, 1.25rem rising to 1.5rem, -0.02em): category rows on the shop wall, followed by a muted tabular count at 0.875rem/600.
- **Title** (700, 1.125rem, -0.01em): section headings, card, dialog and sidebar titles.
- **Tile Title** (600, 0.9375rem, 1.375 line height, two-line clamp): the product name under a tile.
- **Body** (400, 0.875rem): default UI text. **Body Lead** (400, 1rem, 1.625, max 65ch): product descriptions.
- **Label** (500, 0.875rem): form labels; bold 0.875rem for small group labels inside a card, in sentence case.
- **Meta** (400, 0.8125rem, tabular): variant count and stock line under a tile.

### Named Rules
**The Weight Ladder Rule.** Hierarchy comes from weight and size in one family: 400 body, 500 labels, 600 tile titles and controls, 700 section titles, 800 page and row titles. Never introduce a second family for display.

**The Tabular Figures Rule.** Tables, `<time>` elements and anything marked `tabular` (counts, order codes, quantities, pick-up windows) set `tabular-nums` so figures line up.

## Layout

Pages sit in `ui/Page` with a responsive side gutter and the semantic rhythm described in docs/spacing.md (snug, controls, stack, card, region, section, gutter; card, region, section and gutter grow at 40rem). Page widths are narrow (36rem) for single forms and confirmations, medium (48rem) for reading flows, wide (64rem) for the product page and admin tools, and full (72rem) for the shop wall. The navbar is a 64px sticky bar on the ground colour with a hairline bottom border, its content capped at 72rem.

The shop wall stacks category rows a section apart. Each rail is a horizontally snap-scrolling grid that shows a fractional tile count so the next tile peeks: 2.35 tiles on phones, 3.35 from 40rem, 4.35 from 48rem, 5.35 from 64rem, with 12/16/20px gaps. On phones the rail bleeds under the gutter; from 48rem it bleeds to the viewport edge while its first tile stays aligned with the page content. "See all" turns the same rail into a wrapping grid of 2/3/4/5 columns. The category chip bar sticks under the navbar.

The product page is a two-column grid from 48rem: a sticky square photo plate on the left (full-bleed 4:3 on phones), the title, meta line, description, variant picker and availability on the right, with the quantity stepper and the large primary button closing the form behind a hairline.

## Elevation & Depth

Flat by default, layered by tone: ground, surface and plate are close graphite steps separated by hairline borders. Shadows appear only on things that float above the page (menus, popovers, the cart sidebar, modals) and on a tile while it is lifted. Shadow colour is always a dark tint (`--ui-shadow`: 28% graphite in light, 60% black in dark), never derived from the text colour, which would glow in dark mode.

### Shadow Vocabulary
- **Tile lift** (`box-shadow: 0 14px 28px -12px var(--ui-shadow)`): a hovered or focused shop tile, together with `scale(1.04)`.
- **Tile focus** (`box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-focus-ring), 0 14px 28px -12px var(--ui-shadow)`): keyboard focus on a tile; a transparent 2px outline backs it up in forced-colours mode.
- **Floating panel** (Tailwind `shadow-xl` tinted with `--ui-shadow`): dropdown menus, popovers, floating forms.
- **Sheet** (Tailwind `shadow-2xl` tinted with `--ui-shadow`): the cart sidebar.

### Named Rules
**The Lift Is Earned Rule.** Nothing on the page casts a shadow at rest. Depth is a response to focus, hover or floating, and it comes with motion.

## Shapes

Gently rounded throughout, on a four-step scale: 12px (`rounded-xl`) for standalone surfaces (cards, panels, popovers, callouts) and shop tile plates; 8px (`rounded-lg`) for buttons, inputs, thumbnails and boxes nested inside a surface; 6px (`rounded-md`) for menu rows and small controls; full pills for chips, badges, rail arrows, `See all` and the reservation step numbers. Photo plates are fixed-ratio (square tiles, square or 4:3 product image), clip their image and carry no border. Cards carry a 1px hairline border. Empty lists without a card show a dashed hairline frame.

## Components

### Buttons
Calm, compact and press-responsive.
- **Shape:** 8px radius; heights pinned at 32/40/48px (sm/md/lg) so filled and outlined variants and inputs line up.
- **Primary:** accent fill with white on-accent text in both themes, weight 600: org red on member screens, azure inside `.accent-alt`. `lg` is the page's main call to action (Add to cart, Submit).
- **Secondary:** transparent with a strong-border outline, weight 500; hover darkens the border to interactive and fills ground-subtle.
- **Primary outline:** accent border and accent text, accent-subtle fill on hover, for an action equal to primary that should not compete.
- **Ghost:** no border or fill until hovered; navbar icon triggers (cart, theme, menu) use it in a round box.
- **Danger / Danger filled:** error-border outline with error text, or solid error fill (inverted text) only for actions that actually delete. Screens that carry them alongside a primary button sit inside `.accent-alt`.
- **Hover / Focus / Press:** colour transitions at 150ms ease-out, `active:scale(0.97)`, a 2px azure focus-ring outline at 2px offset; transitions and press scale are off under reduced motion.

### Chips
- **Category chip:** pill, 36px tall, surface fill, strong-border outline, 600 weight, with its muted tabular count inside; hover fills ground-subtle. Lives in the sticky jump bar above the rows.
- **Variant chip:** pill, 44px tall (touch target), interactive-border outline; selected (`aria-pressed`) fills org red with white on-accent text; out-of-stock variants use the strong border, disabled text and a strike-through.
- **Filter chip** (admin): pill, 32px, 500 weight, selected colours set by the caller.

### Badges
Pill, 1px border, 0.75rem/600 text, tone fill from the status `-subtle`/`-border`/`-text` steps (neutral, success, info, warning, error). The "Set" marker on a tile is a ground-filled pill at 0.6875rem/700 in the plate's top-left corner.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** surface, with a 1px hairline border.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Internal Padding:** the `card` spacing token (20px, 24px from 40rem), `stack` gap between children.
- **Callouts:** 12px radius, tone-tinted fill and border, 20x16px padding, a 20px stroke icon in the tone's base colour.
- **Pick-up info block:** 8px radius ground-subtle panel with a bold heading and tabular windows.

### Inputs / Fields
- **Style:** surface fill, 1px interactive border (3:1 contrast), 8px radius, 40px tall (32px in dense rows), 0.875rem text, muted placeholder.
- **Focus:** border turns the azure focus-ring colour and a 2px focus-ring ring at 25% opacity appears, on every screen (never the accent).
- **Disabled / Readonly:** disabled-bg fill with disabled text.
- **Quantity stepper:** a 48px tall segmented box with 48px square minus/plus cells and a bold tabular count between strong-border dividers, sized to sit beside the large primary button.

### Navigation
- **Navbar:** sticky 64px bar on the ground colour, hairline bottom border. Left: the Boden lockup (32px club emblem, "Boden" at 1.25rem/800, -0.03em, with "by OSI Klatring" in muted 0.6875rem/500 beneath); the emblem takes the accent text colour on hover. Right: links, then round ghost icon triggers.
- **Links:** 0.875rem/500 muted text, 6px-radius hit area; the current page goes bold and full text colour (the primary cue), and from 48rem gets a 2px org red underline pill sitting on the bar's bottom edge. In dark mode that bar is only 2.3:1 against the graphite ground, so it is a secondary cue and must never be the only current-page indicator.
- **Mobile:** links and account items collapse into a floating panel behind a morphing menu icon.
- **Cart sidebar:** a right-hand sheet up to 28rem wide on the surface colour with a left hairline, sliding in over an overlay at 220ms on the expo ease-out.

### Signature: Gear Wall Rows (rail and lift)
Each category is a row: a heavy row title with its muted count, then a rail of square photo tiles with the title and a meta line (`N options · N in stock`) always visible below, so touch users never need hover. Focusing or hovering a tile scales its plate to 1.04 with the tile-lift shadow (plus the double focus ring on keyboard), and every other tile in that row fades to 45% opacity, both over 220ms on `cubic-bezier(0.16, 1, 0.3, 1)`. Hover lift only applies on devices with real hover; keyboard focus always lifts. "See all" (accent text pill, accent-subtle on hover) and 36px round prev/next arrows appear only when a rail actually overflows; arrows only for wide hover-capable screens. Reduced motion removes the scale and the fade transition.

### Order code header
"Order" in muted 600 weight beside the code at Order Code size, then a status badge; below, pick-up and return dates in bold tabular `<time>` separated by a strong-border slash.

## Do's and Don'ts

### Do:
- **Do** put every gear photo on the plate colour in a fixed-ratio, borderless, 12px-rounded plate.
- **Do** keep org red for the one primary action, the current page and links, and azure for focus and selection (The Red Voice, Azure Hand Rule).
- **Do** use `on-accent` / `on-selected` for text on accent and selected fills, not `text-inverted`.
- **Do** use the shared motion tokens (`--ease-out-expo`, `--dur-move` 220ms, `--dur-quick` 160ms) on transform and opacity only, and disable them under `prefers-reduced-motion`.
- **Do** set counts, dates, quantities and codes in tabular figures.
- **Do** keep tile metadata visible under the plate; hover adds the lift, never the information.
- **Do** author both theme values together as one `light-dark()` pair in `global.css`, and check the dark theme first: it is the native one.

### Don't:
- **Don't** build a uniform white product-card grid with a blue call to action; the catalogue is rows of photo plates on graphite.
- **Don't** put borders or shadows on tiles at rest, or shadows on cards; depth is earned by lift or by floating.
- **Don't** add a third accent hue or decorative colour; status hues are for status only, and azure is for focus, selection and `.accent-alt` only.
- **Don't** put an org red primary button on the same screen as a `danger` or `danger-filled` button outside `.accent-alt`; wrap that content in the scope instead (The No Red Beside Red Rule).
- **Don't** use the accent for focus, selection or native control colour; a red checkbox or focused field reads as an error.
- **Don't** introduce violet anywhere; the `help` token's violet is a known open item awaiting replacement, not a precedent.
- **Don't** derive shadow colour from the text colour; use `--ui-shadow`.
- **Don't** add a second typeface or set display text in a system font.
- **Don't** stack small uppercase kickers or eyebrows above headings; group labels inside cards are bold sentence case.
