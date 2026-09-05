# Icon integration plan

Status: astro-icon (static icons) and morphicons (the wizard's two-state
"dynamic" icons) are both installed, verified, and wired into the real
wizard components. Open questions below are still worth a look, but nothing
is blocked on them.

## What's installed

- `astro-icon` (^1.2.0) — the `<Icon>` component, registered as an
  integration in `astro.config.mjs`.
- `@iconify-json/tabler` (^1.2.38) — the full Tabler icon set (6,232 icons)
  in Iconify JSON format, which is what `astro-icon` reads icon data from.
  No SVG files to manage by hand; icons are referenced by name and inlined
  at build time.

Verified with a throwaway page rendering `<Icon name="tabler:home" />` —
produces an inlined `<svg>` with the icon as a `<symbol>` + `<use>`, dev
server started clean with no integration errors.

## Centralizing icon choices

`dynamic_wizard.md` asks for `{placeholder}` tokens that resolve to icons
from one central file, so the actual icon can change later without hunting
through every component. Two pieces:

1. **`src/lib/icons.ts`** — the single source of truth. A plain object
   mapping each semantic name from the wizard doc to a Tabler icon name (or,
   for icons that change based on state, a small object of variants).
2. **`src/components/icons/AppIcon.astro`** — a thin wrapper around
   `astro-icon`'s `<Icon>`. Wizard components import `AppIcon` and pass the
   *semantic* name (`"product"`, `"select"`, ...), never a raw
   `tabler:whatever` string. This is what makes the mapping swappable in one
   place, and it's also where we'd set shared defaults (default size,
   `stroke-width`, etc.) so every icon in the wizard looks consistent.

Example shape:

```ts
// src/lib/icons.ts
export const icons = {
  product: 'tabler:package',
  attribute: 'tabler:tag',
  image: 'tabler:photo',
  dropdown: { closed: 'tabler:chevron-down', open: 'tabler:chevron-up' },
  select: {
    unchecked: 'tabler:square',
    checked: 'tabler:square-check',
  },
  selectHeader: {
    none: 'tabler:square',
    all: 'tabler:square-check',
    some: 'tabler:square-minus', // indeterminate
  },
} as const;
```

```astro
---
// src/components/icons/AppIcon.astro
import { Icon } from 'astro-icon/components';
import { icons } from '../../lib/icons';

interface Props {
  name: keyof typeof icons;
  variant?: string;
  size?: number;
  class?: string;
}
const { name, variant, size = 20, class: className } = Astro.props;
const entry = icons[name];
const iconName = typeof entry === 'string' ? entry : entry[variant as keyof typeof entry];
---
<Icon name={iconName} width={size} height={size} class={className} />
```

## Mapping for the wizard's placeholders (as implemented)

| Placeholder | Meaning | Tabler icon(s) | Notes |
|---|---|---|---|
| `{product_icon}` | marks a product reference on an item row | `tabler:package` | reads clearly as "this is the product" next to the product name |
| `{type_icon}` | an item's type (e.g. "Jacket", "Tent") | `tabler:tag` | new column + field, replacing the original Attributes dropdown in Add Item |
| `{attribute_icon}` | marks the attributes button/menu | `tabler:list-details` | was `tabler:tag`, freed up for `{type_icon}` above. `tabler:clipboard-list` and `tabler:chart-bar` noted as candidates if this needs to change again |
| `{img_icon}` | image cell / "set image" action | `tabler:photo` | |
| `{select_icon}` | per-row checkbox | `square` (unchecked) / `square-check` (checked) | two states only — the header no longer mirrors row selection state, see below. Animated with morphicons, not `<AppIcon>` — see "Morphing the dynamic icons" |
| `{select_menu_icon}` | table header's select-all control | `tabler:square-chevron-down` | fixed dropdown trigger, not a tri-state indicator — supersedes the old `{select_header_icon}` idea. Opens None/All/Invert, which moved here from the button strip |
| `{select_none_icon}` | "None" option in the select menu | `tabler:circle-dashed` | |
| `{select_all_icon}` | "All" option in the select menu | `tabler:circle-asterisk` | |
| `{select_invert_icon}` | "Invert" option in the select menu | `tabler:circle-half-2` | |
| `{dropdown_icon}` | generic dropdown trigger chevron | `chevron-down` (closed) / `chevron-up` (open) | reused by the Set dropdown and the Add Item panel's Type dropdown. Animated with morphicons, not `<AppIcon>` — see "Morphing the dynamic icons" |

All of the above exist in the installed Tabler set — checked against
`@iconify-json/tabler`'s `icons.json` directly, not just assumed from the
icon browser. `tabler:cart-bar` does not exist (likely meant `chart-bar`,
noted above as a candidate instead).

## Resolved

- `{attribute_icon}`: went with `list-details`, since `tag` was reassigned
  to the new `{type_icon}`.
- The header select control does not mirror row selection state anymore
  (no indeterminate icon) — it's a fixed dropdown trigger, so
  `select.indeterminate` was dropped from `icons.ts` as dead code.

## Morphing the dynamic icons

`dynamic_wizard.md`'s semantic info section explicitly flags three
placeholders as "dynamic icon" — `{select_header_icon}`, `{select_icon}`,
`{dropdown_icon}`. Those are two-state icons (checkbox on/off, chevron
open/closed) that were originally just hard-swapped via `<AppIcon>`'s
`variant` prop with no transition. [morphicons](https://www.morphicons.com)
([GitHub](https://github.com/guillermolg00/morphicons)) replaces the hard
swap with an actual morph animation between the two icon shapes.

- **`morphicons`** (^1.7.1) — zero-runtime-dependency stroke-icon morphing
  library. Ships a `<morph-icon>` custom element plus framework bindings;
  we use the Astro binding (`morphicons/astro`), which is source-only (an
  `.astro` file, no client framework runtime) and server-renders the exact
  static SVG so there's no flash before hydration.
- **`src/lib/icon-nodes.ts`** — a second, small icon-data file alongside
  `icons.ts`. morphicons doesn't consume iconify names or components; it
  needs `IconNode` data (`[tag, attrs][]`, the same structural format
  Lucide's vanilla data package uses). Tabler's own `@tabler/icons` npm
  package ships this exact format in `tabler-nodes-outline.json`, so rather
  than pull in that 11MB package as a runtime dependency for four icons, we
  hand-picked the entries we need (chevron-down/up, square/square-check)
  out of it once and committed them as plain constants. The file's header
  comment explains how to pull more icons the same way if we add more morph
  pairs later.

Wired into the two components that actually flagged "dynamic":

- **`Dropdown.astro`** — the trigger chevron is now `<MorphIcon>`. A single
  delegated `document.addEventListener('toggle', ..., true)` (capture phase,
  since `toggle` doesn't bubble) watches every `<details>` this component
  renders and morphs its chevron between `dropdownChevron.closed`/`.open` on
  open/close. One script, works for every Dropdown instance on the page
  (the Set button, the Add Item panel's Type field), because Astro only
  emits a component's inline `<script>` once per page regardless of how
  many times the component is used.
- **`SelectIcon.astro`** — the per-row checkbox is now `<MorphIcon>` and
  actually clickable: a delegated click listener flips `aria-pressed` and
  morphs between `selectCheckbox.unchecked`/`.checked`. This is the first
  real (if still local-only) interactivity in the wizard — no state escapes
  the button yet, so "N selected" counts in the button strip and bulk
  actions (Assign/Unassign/Delete) still need real wiring later.
- `icons.ts` dropped its `dropdown` and `select` entries — those two
  components were their only consumers, so the iconify-string versions are
  dead now that both render through morphicons instead of `<AppIcon>`.

`SelectMenu.astro`'s header trigger (`{select_menu_icon}`) was deliberately
left alone: per "Resolved" above it's a fixed dropdown trigger, not a
two-state icon, so there's nothing to morph.

Verified by SSR-rendering `wizard-test.astro` and confirming: (a) `astro
check` reports no new type errors, (b) every `<morph-icon>` element is
present (19 across the mock data — one per row's checkbox, plus the Add
Item panel's Type dropdown chevrons), and (c) rows with `selected: true` in
the mock data render the checked-icon path, unselected rows render the
unchecked path. Actually clicking/toggling in a browser wasn't checked here
— that's a visual, in-browser thing for you to confirm.

## Open questions

- Do we want a filled variant (`tabler:square-check-filled` etc.) for
  selected state instead of the outline style, for more visual contrast in
  the table? Tabler ships both outline and filled sets. (If we go filled,
  the morph pair in `icon-nodes.ts` needs updating too — filled icons are
  currently unverified for morph quality since morphicons expects
  stroke-based, `fill="none"` shapes.)
- Sizing/stroke-width defaults for `AppIcon` — Tabler's default stroke-width
  is 2 at 24×24; the item table is dense, so we may want a slightly thinner
  stroke at smaller sizes (e.g. 18–20px) to avoid the icons looking heavy.
  Worth matching on `<MorphIcon>` too for visual consistency between the two
  icon pipelines.
- The dev server logs a harmless warning on every start: `Failed to load
  icons from "src/icons": ENOENT`. astro-icon also looks for a local
  `src/icons/` directory of custom SVGs alongside the iconify sets; we don't
  have one. Not related to this work, easy to silence later (empty dir, or
  an explicit `iconDir` config) if the log noise bothers you.

`AppIcon.astro`, `src/lib/icons.ts`, `src/lib/icon-nodes.ts`, and the
item-table/wizard components described in `dynamic_wizard.md` are built —
see `src/components/wizard/` and `src/pages/wizard-test.astro`.
