# Styling: semantic theme tokens

The project uses a semantic color token system (introduced in issue #67, dark
mode in issue #68) instead of raw Tailwind palette classes (`gray-500`,
`bg-white`, `border-slate-200`, ...). **Any new UI component or page must use
these tokens, not hardcoded Tailwind colors** — hardcoded colors don't react
to dark mode.

## Where it's defined

`src/styles/global.css` defines two layers:

- `--ui-*` variables hold the actual color values, and are what light/dark
  mode override (see the `:root`, the `@media (prefers-color-scheme: dark)`
  block, and the `:root[data-theme="light"|"dark"]` overrides for explicit
  user choice via the theme toggle).
- A `@theme inline` block aliases each `--ui-*` var to a `--color-*` name, so
  Tailwind generates ordinary utility classes (`bg-surface`, `text-muted`,
  `border-info`, ...) that stay in sync with the active theme automatically.
  `@theme` *without* `inline` would bake the light-mode value in at build
  time instead — don't do that.

## Token families and their Tailwind utilities

| Purpose | Tokens | Example utilities |
|---|---|---|
| Page/section background | `bg`, `bg-subtle` | `bg-bg`, `bg-bg-subtle` |
| Card/panel surface | `surface` | `bg-surface` |
| Borders | `border`, `border-strong`, `border-interactive` | `border-border`, `border-border-strong` |
| Body text | `text`, `text-muted`, `text-inverted` | `text-text`, `text-text-muted` |
| Disabled state | `disabled-bg`, `disabled-text` | `bg-disabled-bg`, `text-disabled-text` |
| Modal/overlay backdrop | `overlay` | `bg-overlay` |
| Brand/primary action | `accent`, `accent-hover`, `accent-subtle`, `accent-text`, `focus-ring` | `bg-accent`, `text-accent-text` |
| "This is selected" (wizard rows, calendar days) | `selected`, `selected-subtle`, `selected-border`, `selected-text` | `bg-selected`, `border-selected-border` |
| Success / in-stock | `success`, `success-subtle`, `success-border`, `success-text` | `bg-success-subtle`, `text-success-text` |
| Informational | `info`, `info-subtle`, `info-border`, `info-text` | `bg-info-subtle`, `text-info-text` |
| Warning | `warning`, `warning-subtle`, `warning-border`, `warning-text` | `bg-warning-subtle`, `text-warning-text` |
| Error | `error`, `error-subtle`, `error-border`, `error-text` | `bg-error-subtle`, `text-error-text` |
| Help / info dialogue | `help`, `help-subtle`, `help-border`, `help-text` | `bg-help-subtle`, `text-help-text` |

`--ui-border-interactive` is a special case: it's held to WCAG 1.4.11's 3:1
non-text contrast minimum in both themes, because it's the *only* boundary
cue on interactive controls like inputs and checkboxes. Use it there instead
of the plain `border` token.

`selected` and `accent` share the same hue today but are deliberately
separate tokens, so a future rebrand can change the brand color without
changing what "this is selected" looks like.

## Rules for agents

1. Never write raw Tailwind palette classes (`bg-slate-100`, `text-gray-500`,
   `border-red-200`, `bg-white`, literal hex/`white`/`black`, etc.) in
   component or page markup. Use the semantic `--color-*` utilities above.
2. For third-party components that expose their own CSS custom properties
   for theming (e.g. Cally's `::part()` hooks and its internal
   `--color-accent` / `--color-text-on-accent` vars, see
   `src/components/reservation/ReservationCalendar.astro`), point those vars
   at our `--ui-*`/`--color-*` tokens rather than leaving the library's
   hardcoded defaults or reassigning raw palette colors.
3. Pick the token family by *meaning*, not by what color it happens to
   render as today — e.g. an "available to pick up" tint is `success`, not
   `green`; a selected calendar day or wizard row is `selected`, not `blue`.
4. Known deferred gap: the `help` dialogue-box token is currently violet and
   is slated to change — don't treat its current hue as meaningful when
   reusing it.
5. Before adding a new semantic meaning, check this table first — most UI
   states (success/error/warning/info/selected/help/disabled) already have
   a token family.

## Migration status: components still on raw palette colors

The token system (#67/#68) was introduced after most of the app already
existed, so adoption is incremental, not yet complete. `Navbar.astro`,
`ItemCard.astro`, `AdminNavbar.astro`, `admin/items.astro`, and
`admin/pickup-days.astro` (docs#PR124) are on tokens. As of 2026-09-18 these
still use raw Tailwind `gray-*`/`green-*`/`red-*`/`amber-*`/`white` classes
and need converting — pick whichever migration work picks these up first,
and update this list:

- `src/components/reservation/ReservationCalendar.astro` — fixed on
  branch `fix/calendar-dark-mode` (PR #110, not yet merged to main); once
  merged, drop it from this list.
- `src/components/cart/CheckoutForm.astro`
- `src/components/reservation/ReservationForm.astro`
- `src/components/reservation/ReservationItemRow.astro`
- `src/pages/reservation.astro`

When converting one of these, the raw-to-token mapping is consistent
throughout the app; use it rather than guessing per file:

| Raw Tailwind class(es) | Token utility |
|---|---|
| `bg-white`, `bg-gray-50`/`slate-50` (page bg) | `bg-bg` / `bg-bg-subtle` |
| `bg-white`, `bg-gray-50` (card/panel) | `bg-surface` |
| `border-gray-200`/`slate-200` | `border-border` |
| `border-gray-300`/`slate-300` on a plain divider | `border-border-strong` |
| `border-gray-300`/`slate-300`/`gray-500` on an input/checkbox | `border-border-interactive` |
| `text-gray-900`/`slate-900` (headings, primary text) | `text-text` |
| `text-gray-500`/`slate-500`/`gray-600` (secondary/help text) | `text-text-muted` |
| `bg-gray-900`/`slate-900` + `text-white` (primary button) | `bg-accent` + `text-text-inverted` |
| `bg-green-50`/`green-100`, `text-green-700`, `ring-green-400` | `bg-success-subtle`, `text-success-text`, `ring-success-border` |
| `bg-red-50`, `border-red-200`, `text-red-700` | `bg-error-subtle`, `border-error-border`, `text-error-text` |
| `bg-amber-50`, `border-amber-200`, `text-amber-800` | `bg-warning-subtle`, `border-warning-border`, `text-warning-text` |
| `divide-gray-200`/`slate-200`/`gray-100` | `divide-border` |

Don't do a drive-by conversion of one of these files as a side effect of an
unrelated change — it inflates the diff and risks a visual regression that's
hard to spot in review. Convert a whole file in its own commit/PR, verify it
in both themes, and remove it from the list above.
