---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: ["src/pages/products/[slug].astro","src/pages/reservation/index.astro","src/pages/reservation/confirm.astro","src/pages/checkout/success.astro","src/pages/orders/index.astro","src/pages/orders/[code].astro","src/pages/auth/login.astro","src/pages/404.astro"]
---

# Member-facing shop (catalogue, product, cart, reservation, receipt, orders, sign-in, 404)

Mode: Operate. Members (mostly on phones) find club gear, pick dates, submit a request, and later check their order and pick-up time. Scope: global tokens change site-wide (admin/moderator inherit palette, type and components but keep their layouts); member layouts may be restructured, keeping every function, route and API.

Must not feel: cold & corporate, or playful/juvenile. Light and dark themes both ship; dark is the world's native.

## Direction contract

THESIS: The shed as a streaming wall: gear browsed in one row per category, the focused tile lifts and says what it is while the row dims. Refuses the uniform white product-card grid with a blue CTA.

OWN-WORLD: Deep graphite grounds (near-black, blue-grey surfaces), photos carry the colour, one mint accent for focus, selection and primary actions. Light theme is the same system on cool pale grey. Schibsted Grotesk, heavy row titles, tabular figures. Tiles are fixed-ratio photo plates with rounded corners and no borders; metadata sits under/inside the tile.

STORY: A member sees at once what the club has, by category; opens a product; picks a variant and dates; submits; then finds the order's code and pick-up time without hunting.

FIRST VIEWPORT: Slim graphite top bar (club emblem + Boden wordmark + "by OSI Klatring", cart, theme, menu). Page title "Club gear" with a one-line explainer. A category jump row of chips. Then stacked rows: row title + count + "See all" link, a snap-scrolling rail of square tiles (title, variant count, stock line under). Phone shows ~2.3 tiles per row so the rail reads as scrollable.

FORM: Challenger "streaming catalog wall" (pop-culture-shelf-streaming-title-card-wall), chosen by the user over the assigned 5th grounded candidate. seed:e3a696237d7eecd3. Signature interaction: focus/hover lift on a tile (scale + shadow, focus ring on keyboard), its row's siblings dim; tile metadata stays visible for touch; "See all" opens the category as a full wrapping grid so nothing stays buried in a rail. Motion grammar: 160–220ms ease-out scale/opacity only, off under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Norwegian copy (i18n later); layouts must tolerate longer strings.
- Stock line shows total stock, not date-specific availability (issue #64 owns the final badge).
