# Sizing: icon and component-size tokens

A component-sizing audit (2026-09-25) found icon and control sizes across the
app were hand-typed per call site with no shared scale — the same kind of
element (e.g. an icon-only trigger button) ended up at 4 different sizes in
different files for no functional reason. This doc introduces a shared scale,
mirroring the pattern `docs/styling.md` already established for color
tokens: a small set of named steps, "rules for agents" for using them, and a
migration-status list for what hasn't moved onto them yet.

## Reference: how much bigger should an icon be than its box?

No single ratio is a hard rule, but the common convention across design
systems (Material Design 3, and the token scales used by Chakra/Ant/Radix-
style component libraries) is **an icon at roughly 50% of its container's
height**, with padding making up the rest.

Touch/click target minimums (WCAG 2.5.8 "Target Size (Minimum)", now
required at AA; Apple HIG; Material Design 3):

- **24×24px** — WCAG 2.5.8 floor.
- **44×44px** — WCAG 2.5.5 (AAA) / Apple HIG.
- **48×48px** — Material Design 3's comfortable touch target.

Treat 24px as an absolute floor, not a target — prefer 32px+ for anything
meant to be tapped, and use spacing (≥8px) between adjacent targets rather
than shrinking them to fit.

## Where the scales live

Two scales exist today, for two different kinds of element:

1. **`src/lib/button-styles.ts`** — for the `ui/` button primitives
   (`Button`, `IconButton`, `TextIconButton`, `MorphButton`,
   `TextMorphButton`), which render a real `<button>`/`<a>`. Exports
   `sizeClasses`/`iconOnlySizeClasses` (Tailwind padding classes) and
   `iconOnlyPixelSize`/`textIconPixelSize` (the icon's pixel size) per
   `ButtonSize` (`sm`/`md`/`lg`). As of the issue #198 sizing pass, icon-only
   boxes are 28px (`sm`)/36px (`md`)/44px (`lg`) with icons at roughly half
   the box (16/20/24px), and text buttons land at the same ~28/36/44px
   heights via padding + text size.
2. **`src/lib/icon-sizes.ts`** — for icon-only *triggers* that aren't a real
   `<button>`/`<a>` and so can't use the primitives above: `<details>`/
   `<summary>` dropdowns (`SelectMenu`, nav triggers) and checkbox-style
   toggles built from `<label>` (`SelectIcon`). Exports `triggerBoxClasses`
   (a fixed `h-N w-N` box) and `triggerIconPixelSize`, keyed by `TriggerSize`
   (`sm` = 32px box, `md` = 36px box). Also exports `actionTileIconPixelSize`
   — a named constant (not a scale step) for the moderator homepage's 3
   large action tiles, which are deliberately oversized and don't belong on
   either scale.

Icon *rendering* stays split across three existing systems — `AppIcon`
(astro-icon/Tabler, static icons), `MorphIcon` (morphicons, animated
hover/open-closed transitions), and a few deliberate inline `<svg>`s — that
split is intentional (see each component's own comments) and this sizing
work doesn't change it. What changes is that all three now take their pixel
size from one of the scales above instead of a hand-typed number, wherever
they're standing in for the same conceptual control.

## Rules for agents

1. An icon-only trigger that renders as `<button>`/`<a>` → use
   `ui/IconButton` or `ui/MorphButton`, not a hand-rolled `<button>` + inline
   sizing classes.
2. An icon-only trigger that has to be `<summary>`/`<label>` (details
   dropdown, checkbox toggle) → pull its box class and icon pixel size from
   `triggerBoxClasses`/`triggerIconPixelSize` in `src/lib/icon-sizes.ts`,
   don't hand-type `h-N w-N` + a numeric `size`.
3. Icon inside a button primitive → its size already comes from
   `button-styles.ts` automatically; don't override it with an inline class.
4. A genuinely one-off size (like the action tiles' 36px icon) should still
   be a named, commented constant — not a bare number — so a future reader
   can tell it's deliberate rather than copy-pasted drift.
5. Keep the ~50% icon-to-box ratio in mind when picking or adding a size
   step, and don't add a new interactive control smaller than 24px on a
   side.

## Migration status: sizes not yet on a shared scale

Converting one of these to the scales above is a good follow-up task; do it
file-by-file, not as a drive-by inside an unrelated change (same rule as the
color-token migration).

- `src/components/wizard/ItemRow.astro`, `ProductTag.astro`,
  `SubCategoryTag.astro`, `WizardHeader.astro`, `AddItemPanel.astro`,
  `ButtonStrip.astro`, `Dropdown.astro` — each pass a hand-typed numeric
  `size` (13–18px) to `AppIcon`/`MorphIcon` rather than a token.
- `src/components/orders/OrdersLayoutToggle.astro`,
  `src/components/reservation/ReservationItemRow.astro` — hand-rolled
  buttons with their own numeric icon sizes, not using `ui/IconButton`.
- `src/components/ui/Callout.astro`, `src/layouts/ConfirmationLayout.astro` —
  standalone status-icon inline `<svg>`s at a fixed 20px, independent of
  either scale. Whether these become `AppIcon` calls (and thus pick up a
  token) is tracked in the inline-SVG conversion issue, not here.
- `src/components/wizard/Thumbnail.astro`, `src/components/shop/
  ImagePlaceholder.astro` — these intentionally keep a numeric `size` prop
  (not a token) since callers need arbitrary sizes (a table cell vs. an
  expanded detail view); `Thumbnail`'s placeholder icon already derives its
  size as ~45% of the box per the ratio guidance above.
- `src/components/cart/CartActionsBar.astro` — overrides `Button`'s/
  `EmptyCartButton`'s height with an ad-hoc `class="h-10"` instead of
  relying on `sizeClasses`, since neither `md` (36px) nor `lg` (44px) lands
  on the 40px these primary cart CTAs were reviewed at (issue #199).

## Related follow-up work

- Whether the site holds up under browser/OS enlarged-text and zoom
  settings (WCAG 1.4.4) hasn't been audited — tracked in issue #195.
- Which of the app's remaining inline `<svg>`s are worth converting to
  `AppIcon`/`MorphIcon` (so they pick up a size token too) is tracked in
  issue #196.
