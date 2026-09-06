# Project tasks

Originally consolidated from `docs/rental-shop.md`, `docs/auth-work-items.md`,
`docs/auth-handoff.md`, `docs/auth-testing.md`, `docs/bloc-api.md`,
`docs/moderator-review.md`, and `docs/schema-legacy-fixes.md` on the `api-test-work`
branch. **Ported into `rework_dynamic` on 2026-09-05**, reconciled against
this branch's independent schema-v3/wizard work — see "Completed" for what
changed in the port. Update this file as items move between sections — don't
let it drift from the individual handoff docs, which still hold the detailed
narrative/rationale.

## To do

### Admin wizard
- Remove the "Add attribute" button and field under items/assigned items in
  the admin wizard — attribute-adding will be handled as a separate,
  dedicated flow instead.
- Admin wizard should have a navbar on top. For now it should contain:
  "Items", "Products", "Orders", "Account".
- When adding items in the admin wizard, it should be possible to set stock.
- When viewing item details in the admin wizard, it should be possible to
  edit total stock (not in-stock/available count).

### Order persistence
- `hasUnpaidFees`/`userIsMember` still aren't columns on `orders` — the
  checkout form already submits them (readonly Yes/No fields) and
  `src/pages/api/orders/create.ts` already reads them from the form with a
  TODO comment, but nothing persists them yet. Add the columns and wire the
  read-through — decision recorded in `docs/moderator-review.md`. Still
  blocked on bloc's `hasUnpaidFees`/`userIsMember` API defect for real data,
  but the columns/wiring themselves aren't blocked.

### Cart stock validation
- Cart allows adding more of an item than is actually in stock — quantity
  input/update isn't clamped against available stock.
- The "Only x left in stock" warning message doesn't reflect real stock
  levels. Both need to be fixed so cart quantity is validated correctly
  against current stock.
- Review both fixes against the forward-in-time reservation functionality
  (items can be reserved for future dates) — "stock" here likely needs to
  mean availability for the selected date range, not just a flat on-hand
  count.

### Cart UI
- "Review order" button should be greyed out (disabled) when the cart is
  empty.
- Design of the submission form (`CheckoutForm.astro`) on `/cart` needs to be
  completed — currently unfinished/unstyled.

### Order confirmation
- `checkout/success.astro` (order confirmation screen) needs to be completed
  — should include a "Return to shop" button.
- Order confirmation screen should include a "Cancel order" button that
  spawns a confirmation dialogue box before actually cancelling.

### Order numbering
- Order numbers should follow the format `AAADDD` (three letters followed by
  three digits, e.g. `ABC123`) instead of whatever's currently generated.

### Moderator pages (none exist yet)
- `/moderator/retrieve`, `/moderator/orders/[id]`, `/moderator/confirm/[id]`
  + `src/api/orders/confirm.ts` / `return.ts`, per `docs/rental-shop.md` §9. These
  need the same inline `locals.user?.role` check as the wizard API routes
  (not covered by the middleware's route-prefix gate for the `/api/...` half,
  only for `/moderator/*` pages themselves).
- New moderator order-review page (accept/deny *before* retrieval) per
  `docs/moderator-review.md` — route not named yet (`/moderator/review/[id]`
  proposed), needs the rest of its fields listed out, and needs
  `docs/rental-shop.md`'s lifecycle diagram reconciled first (see WIP below) plus a
  §2 page-structure entry once that's settled.

### Role API (temporary allowlist in place — see Completed)
- Wiring a real `ROLE_API_URL` remains deferred until bloc ships a role
  endpoint. `src/lib/auth.ts`'s `getRole()` is written so swapping the
  allowlist body for a real external-API call later shouldn't require
  touching `validateSession()` or the middleware.
- `docs/bloc-api.md` Phase 1 step 4 (propose one safe read-only bloc call
  beyond `whoami`/`list_api_capabilities`) still hasn't been done.

### General UI
- Check for and implement the Font Provider API as described in
  https://docs.astro.build/en/reference/modules/astro-assets/
- Decide on fonts — will use the Google provider.
- Build a standardized general-purpose dialogue box component — currently no
  shared component for this. Consider splitting into info/action variants.
- Build a standardized "verify/confirm" dialogue box (for actions like
  cancel order), built on top of the standardized dialogue box component
  above rather than as a one-off.

### Security and correctness
- Use import aliases as documented in the Astro imports guide:
  https://docs.astro.build/en/guides/imports/#aliases
- Investigate whether we should implement the Session Driver API as
  described in https://docs.astro.build/en/reference/session-driver-reference/

### Optimization
- Consider adding compression, e.g. `astro-compress` — to be evaluated
  against actual need.
- Check the routing of the entire repo in accordance with
  https://docs.astro.build/en/reference/routing-reference/ (could equally
  well go under Security and correctness).
- Check that our use of images and assets is in accordance with the runtime
  API: https://docs.astro.build/en/reference/modules/astro-assets/
- Look into better usage of prefetch — e.g. is it possible to prefetch the
  `/cart` page once the user has added items to the cart?

### Tooling
- Investigate adding the Sonda bundle analyzer — might help optimization
  through de-duplicating, code splitting, lazy loading, and removing unused
  libraries.

### Housekeeping
- Establish a naming convention for branches (e.g. `fix/`, `feat/`, and so
  on).
- Compare our site's config against the configuration reference:
  https://docs.astro.build/en/reference/configuration-reference/
- Populate `ADMIN_USER_IDS` (and `MODERATOR_USER_IDS` if needed) in `.env`
  with real bloc user id(s) — currently empty, so `/admin/items` 403s for
  everyone until at least one id is added. Log in once, read `user.id` off
  `/api/auth/session`, add it to the comma-separated list.
- `REDIRECT_URL` copied verbatim from the `api-test` worktree's `.env`
  (`http://172.17.0.2:4321/`) — confirmed 2026-09-05 to already match this
  worktree's own dev server address too (same container/network, same
  port), so no change was needed. Re-check if that ever stops being true
  (e.g. running both worktrees' dev servers at once, which would need
  different ports and thus different registered redirect URIs).
- Delete `listmypages.json` from the main working tree (real PII, gitignored
  but present on disk) once no longer needed for reference — n/a in this
  worktree unless the debug toolkit gets used here and produces one.
- Retire the `api-test` worktree/branch now that its auth+checkout work has
  been ported here.
- `src/lib/redirect.ts`'s `isSafeRedirectTarget` (used only by
  `cart/add.ts`) is a string-prefix denylist (`startsWith('/')` plus explicit
  `//`/`/\` rejection). `fix/wizard-api-hardening`'s `src/lib/wizard-http.ts`
  has a strictly more robust `safeRedirectTarget` that actually resolves the
  URL against the request origin and compares `.origin` — flagged
  2026-09-06 while resolving that branch's merge conflicts into
  `feat/shop-cart-integration`. That merge has since landed (PR #11) with
  both implementations still present — upgrade `cart/add.ts` to the
  origin-based check and consolidate to one shared implementation instead of
  two of differing quality.

### Deployment (not started — no rush pre-build)
- nginx config, Certbot, daily SQLite backup cron, go-live checklist in
  `docs/rental-shop.md` §13/§15.
- Consider SEO and `robots.txt` — do we actually want this site to be
  searchable? The `astro-robots-txt` integration might help.

## WIP

- **`docs/rental-shop.md`'s order-lifecycle diagram is inconsistent** (Confirm step
  says "Accept or Reject" but the status line under it still only covers
  `active`, and it places accept/reject at the same step as retrieval rather
  than the earlier review step `docs/moderator-review.md` describes).
  **User has explicitly deferred this fix — do not edit `docs/rental-shop.md`
  without being asked.**
- bloc token-endpoint client-auth method and the auto-added
  `scope=openid profile email` are unconfirmed against bloc's actual docs —
  working so far, but nobody's verified they're correct rather than lucky.
- First live-login test hit one unexplained `403` on `account/listmypages`
  (every attempt since succeeded, no code change in between) — cause not
  diagnosed, just watch for recurrence.

## Completed

- Set commit message rules, e.g. Conventional Commits.
- **Shop catalogue + cart** (`feat/shop-cart-integration`, merged PR #11):
  home page (`index.astro` + `ItemGrid`/`ItemCard`) listing items with a
  stock badge; product detail page at `/products/[slug]` (deliberately not
  `/items/[slug]` — a slug-routable page is a *product*, per the schema-v3
  terminology, with items as its unlabeled variants underneath); `/cart`
  page plus `CartSidebar` slide-in and the `cart/{add,remove,update}` API
  routes; `Navbar`/`UserMenu`/`NavLinks`/`CartButton` reflecting real login
  state; logout wired via `signOut()` in `UserMenuLinks.astro`. Covered by
  `/api/wizard`'s middleware role-gate work below and by
  `fix/wizard-api-hardening`/`fix/wizard-data-integrity` follow-ups.
- Profile-selection fallback (`profileTypeId === 0 ?? profiles[0]`)
  confirmed against a real multi-profile bloc account (2026-09-02) — see
  `src/auth.ts`'s comment at the `listmypages` request. Correctly picked the
  person profile over a company/org profile in the same account.
- Astro + Tailwind + Drizzle/better-sqlite3 scaffold, `output: 'hybrid'` config.
- Full `src/db/schema.ts` per `docs/schema-legacy-fixes.md` items 1–8, later reworked
  further under `docs/schema.md` (products/categories/subcategories/attribute
  templates) — `users`/`orders`/`orderItems` unchanged by that rework and
  identical to what the auth/checkout work below assumes.
- `src/db/client.ts` — Drizzle singleton.
- **Order persistence** (`src/lib/orders.ts` `createOrder`,
  `src/pages/api/orders/create.ts`, `checkout/success.astro`,
  `UserOrderSummary.astro`) — built independently on this branch, ahead of
  the auth work landing. Depended on `locals.user` existing, which is what
  this port provides.
- **2026-09-05: ported bloc OAuth + role-gate middleware + checkout autofill
  from the `api-test-work` branch into this branch**, reconciling with the
  order-persistence work already here:
  - bloc OAuth: custom `OAuthConfig` in `src/auth.ts` replacing the placeholder
    GitHub provider, `jwt`/`session` callbacks carrying profile fields under
    `session.bloc`, several real bugs fixed along the way (missing `userinfo.url`,
    fail-closed on empty profiles, access-token leak to the client removed,
    `res.ok` check, route-gating switched from raw pathname to `ctx.routePattern`,
    prerendered-page early return, `session.user.id`).
  - `src/lib/auth.ts` (`Role` type, `validateSession`) and
    `src/middleware/index.ts` (auth + role gate) — both now against
    `getRole()`'s temporary hardcoded allowlist (see below), not the old
    placeholder `ROLE_API_URL` fetch.
  - `src/pages/auth/login.astro` + `App.Locals.user` typing in `src/env.d.ts`.
  - Checkout autofill: `src/lib/cart.ts`, `CheckoutForm.astro`, `cart.astro` —
    `name`/`email`/`mobile` autofilled session-only (never persisted, explicit
    decision), `hasUnpaidFees`/`userIsMember` shown readonly with a warning box.
  - `src/lib/blocDebug.ts` + `/api/debug/{myaccount,listmypersonprofiles}` —
    permanent live-testing toolkit, ported as-is.
  - **`signIn` upsert callback added to `src/auth.ts`** (was blocked on human
    sign-off on the `api-test-work` branch; explicit go-ahead given during
    this port) — upserts into `users` on every sign-in, `onConflictDoUpdate`
    on `id`. This is what gives `orders.userId` a real row to reference.
  - **Role API replaced with a temporary hardcoded allowlist** (explicit
    decision during this port, since bloc still has no role endpoint):
    `src/lib/auth.ts`'s `getRole(userId)` checks `ADMIN_USER_IDS` /
    `MODERATOR_USER_IDS` (comma-separated bloc user ids from `.env`) instead
    of fetching `ROLE_API_URL`. Same call shape as a real
    `getRoleFromExternalApi` would have, so it's a small swap later, not a
    rearchitecture. **Both env vars start empty — see Housekeeping.**
  - The five wizard write routes (`src/pages/api/wizard/{items,archive,
    set-product,attributes,attributes/bulk}.ts`) each got an inline
    `locals.user?.role !== 'admin'` 403 check, matching `orders/create.ts`'s
    existing pattern. At the time, none of them were covered by the
    middleware's route-prefix gate (that only matched page routes, not
    `/api/...`) — since fixed by adding `/api/wizard` to
    `ADMIN_ROUTE_PREFIXES` (see `src/middleware/prefixes.ts`), so the inline
    checks are now defense-in-depth rather than the sole protection.
    `admin/items.astro` itself *is* covered by the gate (`/admin` prefix) —
    its stale "no auth yet" TODO was removed.
    **Correction to commit effad25's note:** it claimed Astro's `onRequest`
    middleware never runs for POST requests to endpoint routes. That's
    wrong — verified live against that same commit: an unauthenticated POST
    to `/api/wizard/items` and `/api/wizard/archive` each returned 401 from
    the middleware's own `isApiRoute` branch. The wizard/orders inline
    admin checks are defense-in-depth, not the sole protection.
- First successful live end-to-end bloc OAuth login against the real API
  (on the `api-test-work` branch, before this port — not yet re-verified on
  this branch/worktree's own origin).
- `docs/bloc-api.md` Phase 1 steps 1–3 (isolated worktree, `.env` token,
  `whoami`/`list_api_capabilities` exploration, findings folded into
  `docs/auth-work-items.md`'s open-questions section) — step 4 still open, see To do.
- **`hasUnpaidFees`/`userIsMember` null-fields question — resolved as an
  external API defect (2026-09-02).** Tested against the real logged-in
  account across all four bloc methods reachable with a real OAuth access
  token: `account/listmypages`, `Account/MyAccount`, `Profile/GetPage`, and
  `account/listmypersonprofiles`. Both fields came back `null`/empty on every
  one of them — not a client-side bug, not stale caching (fresh calls each
  time), not a fixable code issue. Root cause is on bloc's side. User is
  contacting the provider to request a fix. Full detail in
  `docs/auth-handoff.md` §7 and `docs/auth-testing.md`'s "Open items"
  section. **Still blocks real data on the moderator-review page** (see
  `docs/moderator-review.md`) until bloc fixes it upstream — that part of
  the To do list stays blocked, just externally now rather than by an
  unresolved investigation.
