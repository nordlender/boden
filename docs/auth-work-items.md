> **Note (2026-09-05):** ported into `rework_dynamic` from `api-test-work`.
> Item 4 (the `signIn` upsert) and the role-API decision below are no longer
> current — both got explicit sign-off during the port. See `TASKS.md`'s
> "Completed" section for what actually shipped (`signIn` upsert done;
> `ROLE_API_URL` replaced by a temporary `ADMIN_USER_IDS`/`MODERATOR_USER_IDS`
> allowlist in `src/lib/auth.ts`). The rest of this doc's narrative/rationale
> still holds.

# Auth feature — work items

Branch: `feature/auth`. Builds out real OAuth login + role-gated middleware for the
rental-shop app, per `docs/rental-shop.md` §6–§8, reconciled against what actually exists in
`src/auth.ts` / `src/db/schema.ts` today and against decisions made while scoping this
work (see "Decisions" below). This is a work-item breakdown only — no implementation
has started yet. Confirm before starting each item; some are blocked on open questions.

## Context

- `src/auth.ts` currently wires the **GitHub** OAuth provider. That's leftover
  placeholder code from the doc's example ("swap for any provider") — it is not a real
  decision. The actual identity provider is **bloc** (`rest.bloc.net`), confirmed via:
  - Authorize: `GET https://rest.bloc.net/OAuth/Authorize?client_id=...&response_type=code&redirect_uri=...`
  - Token: `POST https://rest.bloc.net/OAuth/Token` with `client_id`, `client_secret`,
    `grant_type=authorization_code`, `redirect_uri`, `code`.
  - This is a generic OAuth2 flow, not one of Auth.js's built-in named providers — needs
    a custom `OAuthConfig` (via `@auth/core/providers/oauth`), not `GitHub(...)`.
- Separately, `docs/bloc-api.md` is exploring `rest.bloc.net`'s MCP surface as the
  candidate for `ROLE_API_URL` from §7 (the "what role does this user have" lookup).
  That is a **separate, isolated work item** (own worktree/branch) and has not reported
  back yet. Since bloc is now confirmed as the OAuth *identity* provider too, that
  exploration may also turn up the userinfo/profile endpoint needed below.

## Decisions made while scoping (do not re-litigate without new info)

1. **Session access in middleware**: use `getSession(request, authConfig)` from
   `auth-astro/server` to decode the Auth.js JWT directly, rather than the literal
   `ctx.cookies.get('session')` / `sessionId` lookup sketched in `docs/rental-shop.md` §8 —
   Auth.js doesn't expose a bare session-id cookie, only the signed JWT. Role cache (§7)
   keys off `user.id`, not a `sessionId`.
2. **Role API scope**: `getRoleFromExternalApi` gets built against the documented
   `{ "role": "..." }` contract with an adapter point for whatever shape bloc actually
   returns, behind a placeholder `ROLE_API_URL`. Wiring it to the *real* bloc role
   endpoint is explicitly deferred until `docs/bloc-api.md`'s exploration reports a
   confirmed response shape and a human gives explicit go-ahead.
3. **Login page UX**: build a small custom `src/pages/auth/login.astro` with a "Sign
   in" button rather than linking bare UI at the default `/api/auth/signin/bloc` route.
4. **Session-value carrying**: bloc profile fields needed later for order-form
   autofill (`session_variables.json`) are carried via the same Auth.js JWT that already
   holds `accessToken` (extending the existing `jwt`/`session` callback pattern, not a
   new cookie/mechanism), nested under `session.bloc` — see item 2's implementation.
   Persisting any of this onto the `orders` table is explicitly out of scope here (a
   separate work item owns that). Lifetime matches the auth session itself, no special
   expiry.

## Open questions (blocking the items marked ⚠️ below)

- **bloc userinfo shape, still not fully confirmed**: exploration via the bloc MCP
  server (in the sibling `feature/bloc-role-api` worktree) confirmed the real chain is a
  single call — `GET api/account/listmypages` (wrapped by MCP tool `bloc_list_my_profiles`),
  returning `{ ListOfMyProfiles: [...], success, code, message }`, not the two-step
  `listmypersonprofiles` → `getpage` originally guessed. Full field list captured in
  `bloc_field_keys.json` / `session_variables.json`. Item 2 is now implemented in
  `src/auth.ts` against this shape (`profileTypeId === 0` filter, falling back to the
  first entry), but **the profile-selection heuristic is unconfirmed against a real
  end-user login** — the only live data seen so far (`listmypages.json`) came from an
  admin/webmaster test account with zero `profileTypeId === 0` entries, so the fallback
  path is what actually ran, untested against a real person profile. Also unconfirmed:
  the exact base path for `api/account/listmypages` beyond the method name (no query
  params tried yet). **Still blocks item 4** (the upsert needs a real, verified
  `user.email`).

## Work items, in order

1. **Env & types plumbing** — add `OAUTH_REDIRECT_URI` and `ROLE_API_URL` (placeholder
   value) to `src/env.d.ts` `ImportMetaEnv`; create a git-ignored `.env` locally with
   `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` for the bloc app registration (never commit,
   never paste real values into chat — same rule as `docs/bloc-api.md`). Not blocked.

2. **`src/auth.ts`: swap GitHub for a custom bloc `OAuthConfig`** ✅ implemented,
   ⚠️ profile-selection heuristic unconfirmed (see open question above). Replaces the
   `GitHub(...)` provider with a hand-rolled `OAuthConfig<BlocProfile>` pointing at
   bloc's authorize/token endpoints (`checks: ['state']` only — PKCE support unconfirmed);
   its `userinfo.request` calls `api/account/listmypages` and picks the `profileTypeId
   === 0` entry (falls back to the first profile). `jwt`/`session` callbacks extended
   (not replaced) to also carry the bloc profile fields under `session.bloc` — see item
   4 below for why that's nested rather than flattened (naming collision with Auth.js's
   built-in `AdapterSession.userId`). Passes `astro check` with 0 errors.

3. **`src/db/client.ts`** — create the Drizzle client singleton assumed by
   `docs/rental-shop.md` §4 but not yet present. Small, self-contained, unblocks item 4.

4. **`src/auth.ts`: add the `signIn` callback (§6 upsert)** ⚠️ blocked on item 2/3
   (needs `user.id` / `user.email` populated correctly first, which depends on the
   userinfo shape). Upserts into `users` on every sign-in per the `onConflictDoUpdate`
   pattern in §6.

5. **`src/lib/auth.ts`** — `Role` type (`'admin' | 'moderator' | 'member'`),
   `getRoleFromExternalApi(accessToken, cacheKey)` against the generic
   `{ role: "..." }` contract with a documented adapter point, 30s in-memory cache keyed
   by `user.id` (per decision 1), safe-downgrade-to-`'member'` on non-2xx/unreachable.
   Not blocked — built against placeholder `ROLE_API_URL`.

6. **`src/middleware/index.ts`** — auth + role gate per §8, adapted to use
   `getSession()` (decision 1) instead of a raw session cookie; `MEMBER_ROUTES` /
   `MOD_ROUTES` / `ADMIN_ROUTES` redirect/403 logic as drafted. Depends on item 5.

7. **`src/env.d.ts`: `App.Locals.user` typing** — add the `Locals` interface
   (`{ id, email, name, role } | null`) so route/middleware code type-checks. Small,
   pairs with item 6.

8. **Login entry point** — `src/pages/auth/login.astro` with a "Sign in" button calling
   `auth-astro`'s client `signIn('bloc')`, preserving the `?next=` redirect target set
   by middleware. Not blocked, but has no real effect until item 2 (real provider
   wired up) lands — until then it would trigger a sign-in against the still-GitHub
   config.

## Hard rules

- No real OAuth client secret or bloc access token ever pasted into chat — same
  handling as `docs/bloc-api.md`: real values live only in the git-ignored `.env`.
- Don't wire `ROLE_API_URL` to the real bloc endpoint until `docs/bloc-api.md`'s
  exploration reports back a confirmed shape and a human explicitly signs off (decision
  2). Item 5 stays against the placeholder/generic contract until then.
- No merge back into `main` until this is implemented and reviewed like a PR.

## Reference

- `docs/rental-shop.md` §6–§8, §12 (env vars)
- `src/auth.ts`, `src/db/schema.ts`, `src/env.d.ts` (current state)
- `docs/bloc-api.md` (sibling, separate work item — role-API + possibly
  userinfo-endpoint exploration)
