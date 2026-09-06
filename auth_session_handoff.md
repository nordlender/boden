> **Note (2026-09-05):** ported into `rework_dynamic` from `api-test-work`.
> The "still intentionally not done" items below (signIn upsert,
> `ROLE_API_URL`) are now done differently — see `TASKS.md`'s "Completed".
> `REDIRECT_URL` below is `api-test-work`'s value, copied into this worktree's
> own `.env` — confirmed 2026-09-05 to already match this worktree's dev
> server address too (same container/network).

# Session handoff — feature/auth scaffolding + first live bloc login

Branch: `feature/auth`. Nothing in this session has been committed — everything
below is still sitting in the working tree. Written 2026-08-27 for a fresh
agent (or human) picking this up with no other context.

## Repo state right now

```
 M rental_shop.md      -- NOT edited by this session, see "rental_shop.md" below
 M src/auth.ts
 M src/env.d.ts
?? auth_testing_guide.md
?? moderator_order_review.md
?? src/components/
?? src/db/client.ts
?? src/lib/
?? src/middleware/
?? src/pages/auth/
?? src/pages/cart.astro
```

`.env` (gitignored, not in git status) now holds **real** bloc OAuth
credentials (`BLOC_APPID`, `OAUTH_CLIENT_SECRET`, `REDIRECT_URL`, `AUTH_SECRET`,
a placeholder `ROLE_API_URL`) — pasted directly into the file by the user, per
the project's hard rule of never putting real secrets in chat. Treat `.env` as
live/sensitive; don't print its contents, don't commit it (already gitignored).

`npx astro check` is clean (0 errors/warnings) as of the last run this session.
There is no test suite in this repo.

## What this session did

### 1. Finished the auth scaffolding that `auth_work_items.md` had left undone
Items 1, 3, 5–8 from `auth_work_items.md` were still entirely missing before
this session (only the bloc OAuth provider config in `src/auth.ts` existed).
Built:
- `src/db/client.ts` — Drizzle + better-sqlite3 singleton.
- `src/lib/auth.ts` — `Role` type, `getRoleFromExternalApi` (30s cache,
  safe-downgrade to `'member'`, still pointed at a placeholder `ROLE_API_URL`),
  `validateSession(request)`.
- `src/middleware/index.ts` — the auth + role gate.
- `src/pages/auth/login.astro` — sign-in page, preserves `?next=`.
- `App.Locals.user` / extra `ImportMetaEnv` typing in `src/env.d.ts`.

Item 4 (the `signIn` upsert callback) and wiring the real `ROLE_API_URL` are
**still intentionally not done** — both are blocked on explicit human sign-off
per `auth_work_items.md`'s hard rules. Do not add either without being asked.

### 2. Real bugs found and fixed along the way (not just missing scaffolding)
All in `src/auth.ts` / `src/middleware/index.ts`:
- `userinfo` had no `.url`, only a custom `.request` — Auth.js's `assertConfig`
  requires `.url` regardless, so *every* call to `getSession()`/`getToken()`
  threw `InvalidEndpoints` before the custom fetch logic ever ran. Fixed by
  adding `url: `${BLOC_API_BASE_URL}account/listmypages``.
- Empty-profiles case (`ListOfMyProfiles: []`) used to fall through to `{}`,
  producing a signed-in user with `id: "undefined"`. Now throws instead
  (fail-closed).
- **Access-token leak to the client**: `session.accessToken` was on the object
  `getSession()`/`useSession()` return — which is also what `/api/auth/session`
  serves to client-side JS. Removed it from `session()`; `src/lib/auth.ts`'s
  `validateSession` now uses `getToken()` from `@auth/core/jwt` (decodes the
  JWT cookie server-side only) instead of `getSession()`, specifically so it
  can still read `accessToken` without exposing it to the browser.
- `userinfo.request` didn't check `res.ok` before `res.json()` — a non-2xx
  response threw an opaque JSON-parse error instead of a clear message. Fixed
  (this fix is what surfaced the real `403` cleanly during live testing).
- **Route-gating anti-pattern**: middleware matched `ctx.url.pathname.startsWith(...)`
  against raw route prefixes — Astro's own auth guide explicitly warns this is
  bypassable (URL encoding, duplicate slashes, `base` config can make the
  pathname middleware sees diverge from what Astro actually routes to).
  Rewired to match `ctx.routePattern` instead (Astro ≥5, confirmed present in
  the installed types) — Astro's own resolved route, not attacker-influenced
  request text.
- Middleware ran `validateSession()` (reads request headers/cookies)
  unconditionally, including on prerendered pages — meaningless there (no
  real per-visitor request exists) and threw an Astro warning
  (`Astro.request.headers ... not available on prerendered pages`, actually
  observed in dev logs). Fixed with a `ctx.isPrerendered` early return.
- `session.user` never got an `id` — added via `session.user.id = token.sub`
  (module-augmented the `Session` type to add `id: string` to `user`).
- `profile()`'s extra bloc-specific fields (`mobile`, `hasUnpaidFees`, etc.)
  were briefly deleted as dead code (the `jwt()` callback actually reads them
  from its own raw `profile` argument, not from `profile()`'s output) — **this
  was reverted at the user's explicit request**: they're intentionally kept,
  now marked `// TODO: implement later — not yet consumed anywhere`, since
  they're meant for a future database-backed user/adapter path. Don't remove
  them again without asking.

### 3. Env vars restructured per explicit instructions
`OAUTH_CLIENT_ID` → `BLOC_APPID`; `OAUTH_REDIRECT_URI` → `REDIRECT_URL`, which
is now just the app's own base origin (e.g. `http://172.17.0.2:4321/`) — a
`BLOC_CALLBACK_PATH = 'api/auth/callback/bloc'` constant in `src/auth.ts` is
joined onto it via `new URL(...)` to build the actual `redirect_uri` sent to
bloc, so the base can change per environment without touching the path. Also
added `BLOC_API_BASE_URL = 'https://rest.bloc.net/api/'`, with the
`account/listmypages` endpoint built from it instead of being a literal string
in two places.

### 4. Checkout autofill (no schema/persistence changes — explicit user decision)
`src/lib/cart.ts` (cookie cart helpers), `src/components/cart/CheckoutForm.astro`,
`src/pages/cart.astro`. Autofills `name`/`email`/`mobile` from the session, plus
`hasUnpaidFees`/`userIsMember` as **readonly** (not `disabled` — so they'll
still submit once persistence exists) Yes/No fields. Shows a red warning box
when `hasUnpaidFees` is true. The submit button is inert (`disabled`) — actual
order persistence (`/api/orders/create.ts`, `order_items` rows) is explicitly
out of scope, was never asked for.

**Two different decisions on what gets persisted, don't conflate them:**
- `name`/`email`/`mobile` → session-only, never persisted anywhere. Explicit
  user call.
- `hasUnpaidFees`/`userIsMember` → **should** be persisted as part of the
  order once persistence exists — a snapshot at submission time (that's why
  they're already in the form with `name` attributes), not re-derived live
  later. See "Decision (2026-08-26)" in `moderator_order_review.md`.

### 5. `moderator_order_review.md` created
Lightweight starting notes for a not-yet-built moderator page: accept/deny a
requested order *before* retrieval (a separate, earlier step than the existing
retrieve/confirm flow in `rental_shop.md` §9). Documents the two fields and
their color rules (`hasUnpaidFees`: Yes→red; `userIsMember`: Yes→green,
No→red), the persistence decision above, and flags that `rental_shop.md`'s
lifecycle diagram doesn't line up with this yet (see below).

### 6. Housekeeping
Removed the redundant, empty `.claude/worktrees/bloc-role-api` worktree and
its branch (zero unique commits, safe). The other one,
`.claude/worktrees/feature+bloc-role-api`, still exists and still holds real
exploration output (`bloc_field_keys.json`, `session_variables.json`) —
**leave that one alone**, it's referenced from `auth_work_items.md`.

Still flagged, not actioned: `listmypages.json` (real member contact info, per
its own git-ignore comment) sits in this main working tree, not just the
isolated exploration worktree — correctly gitignored, but worth deleting once
nobody needs to reference it anymore.

### 7. First live bloc OAuth login test
Real credentials now in `.env` (see above). Findings:
- The dev server needed `astro dev --host --background`, not just
  `--background` (per `AGENTS.md`) — default Astro dev only binds loopback,
  which wasn't reachable at this project's `REDIRECT_URL`
  (`http://172.17.0.2:4321/`, a docker-internal address).
- First login attempt failed: `CallbackRouteError` from a `403` on
  `account/listmypages` (our own new `res.ok` check caught this cleanly).
  Every attempt since has succeeded, no code change in between — **cause not
  diagnosed**, just noted as something to watch for.
- The real profile came back with exactly **one** entry in
  `ListOfMyProfiles`, already `profileTypeId: 0` — so the ambiguous-fallback
  path (`?? profiles[0]`) still hasn't actually been exercised against a
  multi-profile account. Nothing to fix, just still unverified.
- **`hasUnpaidFees` and `userIsMember` came back `null`** in the raw response,
  even after the user reported changing their fee status on bloc's side, and
  even after a from-scratch incognito retest (which rules out any client-side
  caching on our end — every login makes a fresh live call to bloc).
  **Resolved as of 2026-09-02: this is an external API defect, not something
  fixable on our end.** A follow-up session tested all four bloc methods
  reachable with a real OAuth access token — `account/listmypages`,
  `Account/MyAccount`, `Profile/GetPage`, and `account/listmypersonprofiles`
  (the sibling method flagged below) — against the same real logged-in
  account. Both fields came back `null`/empty on every single one. The user
  is contacting bloc to request a fix; until that lands, the moderator-review
  page (`moderator_order_review.md`) has no real data source for these two
  fields. See `TASKS.md`'s "Completed" section for the consolidated note.
- A **temporary debug log is still present** in `src/auth.ts`'s
  `userinfo.request` (search for `[bloc debug]`) — dumps the raw
  `ListOfMyProfiles` array and the selected profile to `.astro/dev.log` only.
  Remove it once the `hasUnpaidFees`/`userIsMember` question above is settled.
- `auth_testing_guide.md` was written capturing all of the above as a runnable
  procedure — start here before re-testing.

### 8. `rental_shop.md` — not edited by this session, but worth knowing about
`git diff rental_shop.md` currently shows one uncommitted line changed (not by
this session): the moderator's Confirm Order step now reads
`clicks "Accept" or "Reject"` instead of `clicks "Confirm"` — but the status
line right below it is unchanged (`status: active` for both outcomes, which
can't be right for a rejection), and it still places accept/reject at the same
step as entering retrieved quantities, not as the earlier, separate review
step described in `moderator_order_review.md`. **The user has explicitly
asked to defer fixing this — do not edit `rental_shop.md` unless asked.** This
is saved in cross-session memory (`rental_shop_md_needs_edit.md` in the memory
store) so it isn't forgotten.

## What remains — in rough priority order

1. ~~Resolve the `hasUnpaidFees`/`userIsMember` null question.~~ **Resolved
   2026-09-02 — confirmed external API defect, see §7 above.** Still blocks
   the moderator-review-page fields from showing real data, but now blocked
   on bloc fixing it upstream (user has contacted the provider), not on
   further investigation here.
2. **Remove the temporary debug log** in `src/auth.ts` — no longer blocked
   now that #1 is settled, safe to remove whenever convenient.
3. **`rental_shop.md`'s lifecycle diagram needs reconciling** — deferred by
   the user, needs to be explicitly asked for, not assumed.
4. **Still blocked, needs explicit human sign-off**: the `signIn` upsert
   callback (item 4) and wiring the real `ROLE_API_URL`. Don't build either
   without being asked — this is a hard rule from `auth_work_items.md`, not
   just caution.
5. **Nothing beyond auth is built**: no order persistence
   (`/api/orders/create.ts`, `order_items` inserts), no moderator
   retrieve/confirm/review pages, no admin pages, no logout page
   (`signOut()` from `auth-astro/client` isn't wired to anything), no
   Nav/layout component reflecting login state at all.
6. **Delete `listmypages.json`** from the main working tree once it's no
   longer needed for reference (real PII, currently gitignored but present on
   disk).
7. **Unconfirmed but not (yet) causing failures**: bloc's token-endpoint
   client-auth method (body vs. Basic auth) and the auto-added
   `scope=openid profile email` — both flagged early on as guesses, neither
   has broken anything, but nobody's actually confirmed they're *correct*
   against bloc's docs rather than just working by luck.

## Hard rules to preserve (don't relitigate)

- Never put real bloc secrets/tokens in chat — `.env` only, already gitignored.
- Don't wire `ROLE_API_URL` to the real endpoint or add the `signIn` upsert
  without explicit human go-ahead.
- Don't edit `rental_shop.md` without being asked.
- `name`/`email`/`mobile` stay session-only, no schema changes — but
  `hasUnpaidFees`/`userIsMember` are meant to persist once order persistence
  exists (see §4 above) — these are different decisions, don't conflate.
- `orders.rejectedAt`/`rejectedReason` in `src/db/schema.ts` were implemented
  ahead of `schema_fixes.md` item #9's original "TODO-only" instruction —
  deliberately left as-is, not a bug.
- `profile()`'s extra bloc fields in `src/auth.ts` are deliberately unused
  dead-looking code pending future work — don't delete them as cleanup.

## Key files

- Auth: `src/auth.ts`, `src/lib/auth.ts`, `src/middleware/index.ts`,
  `src/pages/auth/login.astro`, `src/env.d.ts`.
- Checkout: `src/lib/cart.ts`, `src/components/cart/CheckoutForm.astro`,
  `src/pages/cart.astro`.
- Docs: `auth_work_items.md` (original work breakdown, still the source of
  truth for what's blocked/why), `moderator_order_review.md` (future
  review-page notes), `auth_testing_guide.md` (how to re-test bloc login),
  `bloc_api_handoff.md` (the separate role-API exploration, still open),
  `schema_fixes.md` (schema history/context), `rental_shop.md` (original
  spec — has the pending inconsistency noted above).
