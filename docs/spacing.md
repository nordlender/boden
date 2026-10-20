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
   is the point: the shop grid, data tables, unit notes. Small elements
   (badges, inline note rows, legend dots) may keep low padding.

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
| `section` | 32px → 48px | Between distinct sections of a page |
| `gutter` | 16px → 32px | Page side padding |

Plain Tailwind numbers (`gap-2`, `py-3`) are still fine *inside* a
component for small, local spacing. Reach for a token whenever the space
expresses one of the relationships in the table.

## Primitives and shared class fragments

Use these instead of hand-rolling the same classes per page:

| What | Where | Notes |
|---|---|---|
| Page wrapper | `ui/Page.astro` | Gutter, top/bottom padding, `gap-section` between children, optional `title`/`description` header with `before-title`/`subtitle`/`actions` slots. `width`: `narrow` (forms), `medium` (reading flows), `wide` (tools/tables), `full` (shop grid). |
| Card / panel | `ui/Card.astro` | `p-card`, `gap-stack`, optional `title` + `actions` slot. `padding="none"` for edge-to-edge lists/tables. |
| Alerts | `ui/Callout.astro` | Use for every error/warning/info box. Don't hand-roll `border-error-border bg-error-subtle p-3`. |
| Page/section/eyebrow headings, card shell, menus, floating panels | `lib/layout-styles.ts` | `pageTitleClasses`, `sectionTitleClasses`, `eyebrowClasses`, `cardClasses`, `cardHeaderClasses`, `menuPanelClasses`, `menuItemClasses`, `floatingPanelClasses`, `pageWidthClasses` |
| Form fields | `lib/form-styles.ts` | `formClasses`, `fieldClasses`, `labelClasses`, `compactLabelClasses`, `hintClasses`, `inputClasses` (40px), `inputSmClasses` (32px), `textareaClasses`, `readonlyInputClasses` |
| Tables | `lib/table-styles.ts` | Real `<table>`: `tableClasses`, `theadRowClasses`, `tbodyRowClasses`, `thClasses`/`tdClasses` (`roomy` / `dense`). CSS-grid tables: `gridColumnsClasses`, `gridTableFrameClasses`, `gridTableHeaderClasses`, `gridTableRowClasses`. |
| Buttons, chips, dropdown triggers | `lib/button-styles.ts` | Button heights 32/40/48px (`sm`/`md`/`lg`), `summaryButtonClasses` for `<details>` triggers, `chipBaseClasses` for pill toggles/filters |
| Badges | `lib/badge-styles.ts` / `ui/Badge.astro` | Status pills |

Inputs and buttons share heights, so a field and the button next to it
always line up: `inputClasses` sits beside a `md` button,
`inputSmClasses` beside a `sm` one.

## Rules for agents

1. Wrap every page's content in `ui/Page.astro`. Don't write
   `mx-auto max-w-* p-*` by hand.
2. Use `ui/Card.astro` (or `cardClasses` + `p-card`) for surface panels,
   and `ui/Callout.astro` for alert boxes.
3. Use spacing tokens for structural spacing: `gap-section` between page
   sections, `gap-stack` between items of a group, `gap-snug` within one
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
