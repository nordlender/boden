# Project tasks

Originally consolidated from `rental_shop.md`, `auth_work_items.md`,
`auth_session_handoff.md`, `auth_testing_guide.md`, `bloc_api_handoff.md`,
`moderator_order_review.md`, and `schema_fixes.md` on the `api-test-work`
branch. **Ported into `rework_dynamic` on 2026-09-05**, reconciled against
this branch's independent schema-v3/wizard work — see "Completed" for what
changed in the port. Update this file as items move between sections — don't
let it drift from the individual handoff docs, which still hold the detailed
narrative/rationale.

## To do

### Order persistence
- `hasUnpaidFees`/`userIsMember` still aren't columns on `orders` — the
  checkout form already submits them (readonly Yes/No fields) and
  `src/pages/api/orders/create.ts` already reads them from the form with a
  TODO comment, but nothing persists them yet. Add the columns and wire the
  read-through — decision recorded in `moderator_order_review.md`. Still
  blocked on bloc's `hasUnpaidFees`/`userIsMember` API defect for real data,
  but the columns/wiring themselves aren't blocked.

### Moderator pages (none exist yet)
- `/moderator/retrieve`, `/moderator/orders/[id]`, `/moderator/confirm/[id]`
  + `src/api/orders/confirm.ts` / `return.ts`, per `rental_shop.md` §9. These
  need the same inline `locals.user?.role` check as the wizard API routes
  (not covered by the middleware's route-prefix gate for the `/api/...` half,
  only for `/moderator/*` pages themselves).
- New moderator order-review page (accept/deny *before* retrieval) per
  `moderator_order_review.md` — route not named yet (`/moderator/review/[id]`
  proposed), needs the rest of its fields listed out, and needs
  `rental_shop.md`'s lifecycle diagram reconciled first (see WIP below) plus a
  §2 page-structure entry once that's settled.

### Role API (temporary allowlist in place — see Completed)
- Wiring a real `ROLE_API_URL` remains deferred until bloc ships a role
  endpoint. `src/lib/auth.ts`'s `getRole()` is written so swapping the
  allowlist body for a real external-API call later shouldn't require
  touching `validateSession()` or the middleware.
- `bloc_api_handoff.md` Phase 1 step 4 (propose one safe read-only bloc call
  beyond `whoami`/`list_api_capabilities`) still hasn't been done.

### Catalogue / nav
- `index.astro` is still the unmodified Astro starter template — no
  catalogue, item grid, or item detail page (`items/[slug].astro`) built yet.
- Cart components beyond `CheckoutForm.astro` (`CartDrawer`, `CartItem`) not
  built.
- No Nav/layout component reflecting login state anywhere.
- No logout page — `signOut()` from `auth-astro/client` isn't wired to
  anything.

### Housekeeping
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

### Deployment (not started — no rush pre-build)
- nginx config, Certbot, daily SQLite backup cron, go-live checklist in
  `rental_shop.md` §13/§15.

## WIP

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
- Full `src/db/schema.ts` per `schema_fixes.md` items 1–8, later reworked
  further under `schema_v3.md` (products/categories/subcategories/attribute
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
    existing pattern — none of them are covered by the middleware's
    route-prefix gate (that only matches page routes, not `/api/...`).
    `admin/items.astro` itself *is* covered by the gate (`/admin` prefix) —
    its stale "no auth yet" TODO was removed.
- First successful live end-to-end bloc OAuth login against the real API
  (on the `api-test-work` branch, before this port — not yet re-verified on
  this branch/worktree's own origin).
- `bloc_api_handoff.md` Phase 1 steps 1–3 (isolated worktree, `.env` token,
  `whoami`/`list_api_capabilities` exploration, findings folded into
  `auth_work_items.md`'s open-questions section) — step 4 still open, see To do.
- **`hasUnpaidFees`/`userIsMember` null-fields question — resolved as an
  external API defect (2026-09-02).** Tested against the real logged-in
  account across all four bloc methods reachable with a real OAuth access
  token: `account/listmypages`, `Account/MyAccount`, `Profile/GetPage`, and
  `account/listmypersonprofiles`. Both fields came back `null`/empty on every
  one of them — not a client-side bug, not stale caching (fresh calls each
  time), not a fixable code issue. Root cause is on bloc's side. User is
  contacting the provider to request a fix. Full detail in
  `auth_session_handoff.md` §7 and `auth_testing_guide.md`'s "Open items"
  section. **Still blocks real data on the moderator-review page** (see
  `moderator_order_review.md`) until bloc fixes it upstream — that part of
  the To do list stays blocked, just externally now rather than by an
  unresolved investigation.
