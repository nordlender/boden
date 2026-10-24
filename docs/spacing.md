# Spacing: tokens, primitives and rules

The UI rework (2026-10) made the site roomier: more padding on buttons,
fields, cards and pages, while keeping the shop grid as tight as before.
This doc is the reference for that system, in the same style as
`docs/styling.md` (colors) and `docs/sizing.md` (icon/control sizes).

## Principles

The rework follows four ideas from the research behind it:

1. **Start roomy, then remove.** It is easier to see where space should be
   taken away than where it is missing (Refactoring UI). New UI should use
   the default (roomy) tokens; tighten only on purpose.
2. **Proximity groups things.** Space *inside* a group must be clearly
   smaller than space *between* groups (Gestalt proximity, NN/g). The token
   scale below is built so each step reads as a different level.
3. **A constrained scale.** Pick from a few named steps instead of
   hand-typing `p-3`/`p-4`/`p-5` per file (Atlassian, Polaris, GOV.UK).
4. **Density is a deliberate choice.** Dense layouts are fine where density
   is the point: the shop grid, data tables, unit notes, the file explorer
   tree. Small elements (badges, inline note rows, legend dots) may keep
   low padding.

Touch targets follow `docs/sizing.md`: 24px is the hard floor (WCAG 2.5.8),
32px+ for anything meant to be tapped, 40px for default controls.

## Spacing tokens

Defined in `src/styles/global.css` as `--ui-space-*` and aliased to
Tailwind's `--spacing-*`, so every spacing utility accepts them (`p-card`,
`gap-section`, `px-gutter`, `mb-stack`, ...). Like GOV.UK's responsive
scale, the larger steps grow on screens 640px and wider, so phones keep
their density.

| Token | Mobile → ≥640px | Use for |
|---|---|---|
| `snug` | 8px | Tightly related pieces: label ↔ field, title ↔ subtitle |
| `controls` | 12px | Between adjacent buttons/controls in a row |
| `stack` | 20px | Sibling items in a group: form fields, cards in a list, header ↔ content |
| `card` | 20px → 24px | Padding inside cards, panels, dialogs |
| `region` | 24px → 32px | Between blocks in a page's body: panels, tables, headed sections (an add panel and its table, two related tables) |
| `section` | 32px → 48px | Page header ↔ body, and other major breaks (e.g. the product page's image and details columns) |
| `gutter` | 16px → 32px | Page side padding |

**Naming a new token:** every token becomes a value for *all* spacing
utilities (`w-*`, `size-*`, `inline-*`, `block-*`, ...), so never reuse a
name that is already a utility suffix. A token named `block` silently
turned the `inline-block` class into a 24–32px-wide box. After adding a
token, search the built CSS for selectors using it.

Plain Tailwind numbers (`gap-2`, `py-3`) are still fine *inside* a
component for small, local spacing. Reach for a token whenever the space
expresses one of the relationships in the table.

## Primitives and shared class fragments

Use these instead of hand-rolling the same classes per page:

| What | Where | Notes |
|---|---|---|
| Page wrapper | `ui/Page.astro` | Gutter, top/bottom padding, `gap-section` between header and body, `gap-region` between body blocks, optional `title`/`description` header with `before-title`/`subtitle`/`actions` slots. `width`: `narrow` (forms), `medium` (reading flows), `wide` (tools/tables), `full` (shop grid). |
| Card / panel | `ui/Card.astro` | `p-card`, `gap-stack`, optional `title` + `actions` slot. `padding="none"` for edge-to-edge lists/tables. |
| Alerts | `ui/Callout.astro` | Use for every error/warning/info box. Don't hand-roll `border-error-border bg-error-subtle p-3`. |
| "Add new X" panel | `ui/AddPanel.astro` | Shared shell for add item / add set / add units: tinted box, expand trigger, your fields in the slot, Cancel + Save row. |
| Back link | `ui/BackLink.astro` | "← Back to X" in `Page`'s `before-title` slot on every detail page. |
| Headings, card shell, action rows, empty states, menus, floating panels, action tiles | `lib/layout-styles.ts` | `pageTitleClasses`, `cardTitleClasses`, `sectionTitleClasses`, `eyebrowClasses`, `cardClasses`, `cardHeaderClasses`, `cardFooterClasses`, `actionRowClasses`, `emptyStateClasses`, `emptyStateFramedClasses`, `menuPanelClasses`, `menuItemClasses`, `floatingPanelClasses`, `actionTileClasses`, `pageWidthClasses` |
| Form fields | `lib/form-styles.ts` | `formClasses`, `fieldClasses`, `labelClasses`, `compactLabelClasses`, `hintClasses`, `inlineErrorClasses`, `inputClasses` (40px), `inputSmClasses` (32px), `textareaClasses`, `readonlyInputClasses` |
| Tables | `lib/table-styles.ts` | Real `<table>`: `tableClasses`, `theadRowClasses`, `tbodyRowClasses`, `thClasses`/`tdClasses` (`roomy` / `dense`). CSS-grid tables: `gridColumnsClasses`, `gridTableFrameClasses`, `gridTableHeaderClasses`, `gridTableRowClasses`, plus `tableToolbarClasses` for the strip above one. |
| Buttons, chips, dropdown triggers | `lib/button-styles.ts` | Button heights 32/40/48px (`sm`/`md`/`lg`), `ui/Dropdown` for `<details>` dropdowns (its default trigger uses the secondary `md` button classes), `chipBaseClasses` for pill toggles/filters |
| Badges | `lib/badge-styles.ts` / `ui/Badge.astro` | Status pills |

Inputs and buttons share heights, so a field and the button next to it
always line up: `inputClasses` sits beside a `md` button,
`inputSmClasses` beside a `sm` one.

## Rules for agents

1. Wrap every page's content in `ui/Page.astro`. Don't write
   `mx-auto max-w-* p-*` by hand.
2. Use `ui/Card.astro` (or `cardClasses` + `p-card`) for surface panels,
   and `ui/Callout.astro` for alert boxes.
3. Use spacing tokens for structural spacing: `gap-section` between a
   page's header and body, `gap-region` between blocks in the body (panels,
   tables, headed sections), `gap-stack` between items of a group, `gap-snug` within one
   item, `gap-controls` between buttons, `p-card` inside panels.
4. Form controls take their classes from `lib/form-styles.ts`. Don't
   hand-roll `rounded border border-border-interactive px-2 py-1.5`.
5. Interactive controls: `md` (40px) by default, `sm` (32px) in dense rows
   and tables, `lg` (48px) for a page's main call to action. Don't override
   button heights with ad-hoc `h-*` classes.
6. Keep the shop grid (`ItemGrid`/`ItemCard`) tight. Its density is
   deliberate.
7. When something must be denser than the defaults, keep it to small
   elements or a clearly dense context (tables, toolbars) and say why in a
   comment.

## Consistency conventions

These are the decisions that keep the same kind of thing looking the same
everywhere. Follow them before inventing a variant.

**Headings.** `pageTitleClasses` for the page's h1 (via `Page`'s `title`);
`cardTitleClasses` when the page's title lives inside its main card (order
detail, blind count); `sectionTitleClasses` for page sections and for
card/dialog/popover titles; `eyebrowClasses` only for small group labels
*inside* a card, summary or detail panel. On the product page, the small
headings above the picker, attributes and availability use `labelClasses`.
Hub pages (Admin, Moderator) also get a page title.

**Forms.**
- Labels: `fieldClasses` + `labelClasses` in member and moderator forms;
  `compactLabelClasses` in the admin forms (wizard, units, pickup days). One
  style per form.
- Field height decides the neighbouring buttons: `inputClasses` rows get
  `md` buttons, `inputSmClasses` rows (inline table edits, pickup-day rows)
  get `sm` buttons.
- Row add/remove controls: "Add …" is `TextMorphButton action="add"
  size="sm"`; removing a row is `MorphButton action="delete"
  variant="danger"` at the row's input height.
- Hints use `hintClasses`; inline errors use `inlineErrorClasses`.

**Action placement.**
- Panel, dialog and popover forms end with `actionRowClasses`:
  right-aligned, Cancel (secondary, or `type="reset"` in a panel) then the
  primary action.
- A page-level form's main submit (checkout, confirm, blind count, order
  lookup) is a `lg` primary button, left-aligned (`self-start`).
- A card's own actions sit in `cardFooterClasses` along its bottom edge.

**Lists and tables.**
- Empty lists: `emptyStateClasses` inside a card or panel,
  `emptyStateFramedClasses` when the list has no card around it.
- Inside a table panel, the card header, toolbar (`tableToolbarClasses`),
  table header and rows all use `px-card`, so they share one left edge.
- Wizard/units detail panels: `px-card py-5`, groups separated by
  `mt-stack`, an eyebrow label `snug` above its content.

**Alerts.** `ui/Callout` is a screen-reader live region by default (right
for a message reporting what just happened). Pass `live={false}` for
static content: explanatory notices, standing warnings, and anything that
contains form controls (the checkout disclaimer).

**Item rows.** In `ui/ItemLine`, put content that belongs under the whole
row (a set's component list) in the `below` slot. It indents itself to the
name, so don't hand-compute a `ml-*` from the thumbnail size. Inline
pieces in the default slot (badges) need `self-start`.

**Radius.** `rounded-xl` for standalone surfaces (cards, panels, popovers,
callouts), `rounded-lg` for a box nested inside one, `rounded-md` for
controls and icon triggers, `rounded-full` for pills.

**Small icons.** Eyebrow and inline-edit icons are 14px; dropdown chevrons
14px; expand-panel chevrons 16px.
