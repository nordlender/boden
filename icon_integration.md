# Icon integration plan

Status: astro-icon installed and verified working. Icon choices below are a
first pass for review before we wire them into the dynamic wizard components.

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

## Proposed mapping for the wizard's placeholders

| Placeholder | Meaning | Tabler icon(s) | Notes |
|---|---|---|---|
| `{product_icon}` | marks a product reference on an item row | `tabler:package` | reads clearly as "this is the product" next to the product name |
| `{attribute_icon}` | marks the attributes cell/dropdown | `tabler:tag` | `tabler:list-details` was the alternative if we want it to read less like a price tag |
| `{img_icon}` | image cell / "set image" action | `tabler:photo` | |
| `{select_icon}` | per-row checkbox | `tabler:square` (unchecked) / `tabler:square-check` (checked) | swap based on row selection state |
| `{select_header_icon}` | header checkbox, must align with row checkboxes | same as above, plus `tabler:square-minus` for indeterminate (some but not all rows selected) | three states, not two — the doc's "Select: None/All/Invert" dropdown drives this |
| `{dropdown_icon}` | the "Set" dropdown button | `tabler:chevron-down` (closed) / `tabler:chevron-up` (open) | generic dropdown affordance, reused wherever a dropdown button appears |

All six names exist in the installed Tabler set — checked against
`@iconify-json/tabler`'s `icons.json` directly, not just assumed from the
icon browser.

## Open questions before implementing

- `{attribute_icon}`: tag vs. list-details — tag is more literal ("this is
  a labeled attribute"), list-details reads more like "see details." Leaning
  tag unless you'd rather it not resemble a price tag.
- Do we want a filled variant (`tabler:square-check-filled` etc.) for
  selected state instead of the outline style, for more visual contrast in
  the table? Tabler ships both outline and filled sets.
- Sizing/stroke-width defaults for `AppIcon` — Tabler's default stroke-width
  is 2 at 24×24; the item table is dense, so we may want a slightly thinner
  stroke at smaller sizes (e.g. 18–20px) to avoid the icons looking heavy.

Once these are confirmed, next step is building `AppIcon.astro` +
`src/lib/icons.ts` for real and starting the item-list table components
described in `dynamic_wizard.md`.
