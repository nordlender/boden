# Project tasks

Consolidated from `rental_shop.md`, `auth_work_items.md`, `auth_session_handoff.md`,
`auth_testing_guide.md`, `bloc_api_handoff.md`, `moderator_order_review.md`, and
`schema_fixes.md`, cross-checked against the actual code on `feature/auth` as of
2026-08-27. Update this file as items move between sections — don't let it drift
from the individual handoff docs, which still hold the detailed narrative/rationale.

## To do

### Blocked on explicit human sign-off (do not start without being asked)
- Add the `signIn` upsert callback in `src/auth.ts` (`auth_work_items.md` item 4).
- Wire the real `ROLE_API_URL` to bloc's actual role endpoint.

### Order persistence
- Build `/api/orders/create.ts` + `order_items` inserts; wire up the (currently
  disabled) submit button in `CheckoutForm.astro`.
- Add `hasUnpaidFees`/`userIsMember` columns to `orders` and read them from the
  submitted checkout form (snapshot at submit time, not re-fetched later) —
  decision recorded in `moderator_order_review.md`.

### Moderator pages (none exist yet)
- `/moderator/retrieve`, `/moderator/orders/[id]`, `/moderator/confirm/[id]`
  + `src/api/orders/confirm.ts` / `return.ts`, per `rental_shop.md` §9.
- New moderator order-review page (accept/deny *before* retrieval) per
  `moderator_order_review.md` — route not named yet (`/moderator/review/[id]`
  proposed), needs the rest of its fields listed out, and needs
  `rental_shop.md`'s lifecycle diagram reconciled first (see WIP below) plus a
  §2 page-structure entry once that's settled.

### Admin pages (none exist yet)
- `items.astro`, `orders.astro`, `orders/[id].astro`, `archive.astro` +
  `src/api/items/{create,delete,count}.ts`, per `rental_shop.md` §2.

### Catalogue / cart / nav
- `UserMenu.astro` is still static (Sign in / Profile / Sign out placeholders) —
  doesn't reflect real session state yet.
- No logout page — `signOut()` from `auth-astro/client` isn't wired to anything.
- Cart components beyond `CheckoutForm.astro` (`CartDrawer`, `CartItem`) not built —
  `/cart` still has nothing showing the items just added via `/api/cart/add`.

### Housekeeping
- Delete `listmypages.json` from the main working tree (real PII, gitignored
  but present on disk) once no longer needed for reference.
- Remove the temporary `[bloc debug]` `console.log` calls in `src/auth.ts`'s
  `userinfo.request` — blocked on the null-fields question below.
- **Once the schema/catalogue work settles**, squash `src/db/migrations/*` back
  down to one clean initial migration (currently 0000–0002) and regenerate
  `data/rental.db` from that single file — explicit user request, not urgent,
  do only when asked to do a cleanup of the database, and when deploying.

### `bloc_api_handoff.md` exploration — not finished
- Step 4 of that doc's Phase 1 (propose one safe read-only bloc call beyond
  `whoami`/`list_api_capabilities`) hasn't been done yet.

### Deployment (not started — no rush pre-build)
- nginx config, Certbot, daily SQLite backup cron, go-live checklist in
  `rental_shop.md` §13/§15.

## WIP

- **`hasUnpaidFees`/`userIsMember` came back `null`** from bloc for the one
  real account tested — assumed stale on bloc's end, unresolved. Next step if
  it persists: try `api/account/listmypersonprofiles` instead of
  `listmypages`. Blocks real data on the future moderator-review page and is
  the reason the debug log above is still in place.
- **`rental_shop.md`'s order-lifecycle diagram is inconsistent** (Confirm step
  says "Accept or Reject" but the status line under it still only covers
  `active`, and it places accept/reject at the same step as retrieval rather
  than the earlier review step `moderator_order_review.md` describes).
  **User has explicitly deferred this fix — do not edit `rental_shop.md`
  without being asked.**
- Profile-selection fallback (`profileTypeId === 0 ?? profiles[0]`) still
  unconfirmed against a real multi-profile bloc account — only a single-profile
  account has been tested.
- bloc token-endpoint client-auth method and the auto-added
  `scope=openid profile email` are unconfirmed against bloc's actual docs —
  working so far, but nobody's verified they're correct rather than lucky.
- First live-login test hit one unexplained `403` on `account/listmypages`
  (every attempt since succeeded, no code change in between) — cause not
  diagnosed, just watch for recurrence.

## Completed

- Astro + Tailwind + Drizzle/better-sqlite3 scaffold, `output: 'hybrid'` config.
- Full `src/db/schema.ts` per `schema_fixes.md` items 1–8: relations, order-item
  validation constraints + unique `(orderId, itemId)`, moderator accountability
  fields (`confirmedByUserId`/`returnedByUserId`), soft-delete `archived` on
  `items`, random `orderCode`, dropped redundant `available` boolean, FK
  indexes, DB-level timestamp defaults. Item 9's `rejectedAt`/`rejectedReason`
  were also implemented (ahead of that item's original TODO-only instruction —
  deliberately left as-is); `dueAt` remains a TODO comment only, as instructed.
- `src/db/client.ts` — Drizzle singleton.
- bloc OAuth: custom `OAuthConfig` in `src/auth.ts` replacing the placeholder
  GitHub provider, `jwt`/`session` callbacks carrying profile fields under
  `session.bloc`, several real bugs fixed along the way (missing `userinfo.url`,
  fail-closed on empty profiles, access-token leak to the client removed,
  `res.ok` check, route-gating switched from raw pathname to `ctx.routePattern`,
  prerendered-page early return, `session.user.id`).
- `src/lib/auth.ts` (`Role` type, `getRoleFromExternalApi` with 30s cache and
  safe-downgrade, `validateSession`) and `src/middleware/index.ts` (auth + role
  gate) — both against the placeholder `ROLE_API_URL` per the hard rule above.
- `src/pages/auth/login.astro` + `App.Locals.user` typing in `src/env.d.ts`.
- Checkout autofill: `src/lib/cart.ts`, `CheckoutForm.astro`, `cart.astro` —
  `name`/`email`/`mobile` autofilled session-only (never persisted, explicit
  decision), `hasUnpaidFees`/`userIsMember` shown readonly with a warning box;
  submit button intentionally disabled pending order persistence.
- First successful live end-to-end bloc OAuth login against the real API.
- `bloc_api_handoff.md` Phase 1 steps 1–3 (isolated worktree, `.env` token,
  `whoami`/`list_api_capabilities` exploration, findings folded into
  `auth_work_items.md`'s open-questions section) — step 4 still open, see To do.
- Responsive `Navbar.astro` (`Logo`/`NavLinks`/`UserMenu` components, image logo
  support, links right-aligned next to the account button, hamburger on mobile)
  wired into a new `BaseLayout.astro` shared page shell.
- Catalogue: `ItemCard`/`ItemGrid` on `index.astro`, static `items/[slug].astro`
  detail pages, `QuantitySelector.astro` (vanilla-JS +/-, clamped to stock),
  `/api/cart/add.ts` posting into the existing `lib/cart.ts` cookie cart. Seeded
  via `src/db/seed.mjs` with placeholder climbing-gear items (no real inventory
  data yet — `admin/items.astro` from the To-do above is what would replace this).
- Slide-in `CartSidebar.astro`/`CartButton.astro` (toggle from the navbar,
  auto-opens after add-to-cart via a `?cartOpen=1` redirect flag), backed by
  a new `GET /api/cart` + `lib/cart.ts`'s `getCartItems`.
- Mutually-exclusive product options (`item_option_groups`/`item_option_values`,
  distinct from the flat `item_attributes`): `ProductOptions.astro` renders one
  native radio group per option, swaps the main photo on change, and — since
  which specs even exist can vary per item (e.g. cam size changes weight/range/
  strength/colour) — each option value can carry its own attributes as a JSON
  blob (`item_option_values.attributes`) rendered as a swapping spec table.
  Categories split into `Harness`/`Protection` (was one combined category);
  `Camping` category and its one item removed (out of scope for this shop).
