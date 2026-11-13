# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Members (primary).** OSI Klatring climbing-club members, mostly students, usually on their phones. They borrow club gear (harnesses, cams, ropes, sets) ahead of a trip or session, pick a pick-up and return date, and collect the gear in person from a volunteer.
- **Moderators.** Club volunteers who review requests, fetch gear from storage, hand it out against a read-aloud order code, and blind-count it back in. They work on-site, often standing in the gear room.
- **Admins (and board).** Maintain the catalogue (products, items, sets, units), pick-up days and orders. Board currently ranks between moderator and admin but gates no route.

Member-facing surfaces: catalogue (`/`), product detail (`/products/[slug]`), cart sidebar, reservation and confirm (`/reservation`), order receipt (`/checkout/success`), own orders (`/orders`, `/orders/[code]`), sign-in, 404. Moderator and admin surfaces are internal tools.

## Product Purpose

Boden is the club's gear shed online: members see what gear exists and when it's free, request it for specific dates, and get it from a volunteer without email threads or spreadsheets. Success means a member can go from "I need a harness and a rope for Saturday" to a confirmed request in a couple of minutes on a phone, and a moderator can hand it out quickly and correctly.

## Positioning

A members-only, free lending system run by volunteers for one club, not a commercial rental store. There are no prices, no payment and no delivery: eligibility comes from bloc membership status, availability is the club's real stock (active physical units) minus overlapping orders, and handover happens in person on scheduled pick-up days.

## Operating Context

- Login and membership/fee status come from bloc (osiklatring.no's membership backend) via OAuth, not a separate account system. Unpaid fees and non-membership are snapshotted on each order for the moderator.
- Cart lives in a cookie until the member submits a reservation.
- Order lifecycle: requested → scheduled (moderator accepts) or rejected → active (blind-counted hand-out) → returned (blind-counted return). Members can reschedule before acceptance or delete their own order.
- Each order gets a short code (NNAAX format) that is read aloud at pick-up.
- Pick-up happens on pick-up days that moderators register (one-off) or admins set (recurring).

## Capabilities and Constraints

- Terminology is binding: **Product** (category-level listing), **Item** (one option permutation; what gets rented), **Set** (a rentable bundle offered as a product variant, expanded into items at checkout), **Unit** (one physical object; admin-only). Never use these interchangeably; members never see units.
- Stack: Astro 7 (hybrid static/SSR, server islands), Tailwind v4, Drizzle + SQLite, Node adapter on a single VPS. Minimal client JS.
- All colour and spacing go through the semantic token system in `src/styles/global.css` and the shared primitives (`ui/Page`, `ui/Card`, `ui/Callout`, `form-styles.ts`, `table-styles.ts`, `layout-styles.ts`); light and dark themes are both supported. See `docs/styling.md` and `docs/spacing.md`.
- Icons via astro-icon (Tabler) and morphicons; see `docs/icons.md`.
- Language: English now; Norwegian is planned (i18n later), so member-facing copy and layouts must tolerate longer Norwegian strings.
- Undecided: role assignment is a temporary env-var allowlist until bloc ships a role API.

## Brand Commitments

- Name is **Boden**, presented as OSI Klatring's gear shed: its own name, with the club as the endorsing owner (club logo as endorsement, not the main identity).
- Voice: plain, friendly club-volunteer tone. It is a lending shelf, not a store.

## Evidence on Hand

- Club logo: `public/osilogo.png` (not currently referenced in `src/`).
- Product photography: a few sample images in `public/product/` and admin uploads under `data/uploads/` (served at `/media/*`); real catalogue imagery depends on what admins upload.
- Seeded example catalogue and orders (`npm run db:seed`) for development.
- No testimonials, usage statistics or press exist; do not invent any.

## Product Principles

1. **Availability is the truth.** Show members what is actually free for their dates before they commit; never let them request something that can't be handed out.
2. **Phone-first, in-and-out.** The member flow is short and works one-handed on a phone; nothing gets in the way between "I need this" and a submitted request.
3. **Volunteers' time is precious.** Every member-facing choice should make the in-person hand-out faster: clear order codes, clear pick-up times, unambiguous item names.
4. **Club, not commerce.** No sales patterns, upsells or urgency tricks; it's shared gear among members.
5. **Words mean one thing.** Product, item, set and unit keep their exact meanings everywhere.
