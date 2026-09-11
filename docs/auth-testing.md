# Manually testing the bloc login flow — guide

How to run a real end-to-end login against bloc and verify it's working.
Living runbook — keep this in sync as the auth flow changes, don't let it
drift into a dated narrative (see `docs/bloc-api.md` for defect history
instead).

## Prerequisites

- `.env` has real `BLOC_APPID` / `OAUTH_CLIENT_SECRET` (pasted directly into
  the file, never into chat), a matching `AUTH_SECRET`, and `REDIRECT_URL`
  set to whatever origin bloc actually redirects back to.
- **`REDIRECT_URL` must exactly match the redirect URI registered with bloc
  for this app/client** (`{REDIRECT_URL}api/auth/callback/bloc`) — a mismatch
  fails before you even see a login screen.

## Starting the server

```
npx astro dev --host 0.0.0.0 --background
```

By default Astro's dev server only binds to loopback. If bloc's redirect
target is anything other than `localhost`/`127.0.0.1` (e.g. a docker-internal
address), the server needs `--host 0.0.0.0` to actually be reachable there.

> **Note:** `AGENTS.md`'s current dev-server instructions (`astro dev
> --background`) don't include `--host 0.0.0.0` or a fixed port list — earlier
> versions of this project's agent instructions did. If you need the bloc
> callback to reach this server, pass `--host 0.0.0.0` explicitly as above
> regardless of what `AGENTS.md` currently says; this looks like it may have
> been dropped unintentionally and is worth confirming separately.

Check it's up: `npx astro dev status`. Stop with `npx astro dev stop`.

## Monitoring the flow live

Logs go to `.astro/dev.log`. For a live, low-noise stream while testing:

```
tail -n0 -F .astro/dev.log | grep -iE "error|warn|callback|signin|session|bloc|token|listmypages|forbidden|redirect"
```

This catches the request lifecycle (`POST /api/auth/signin/bloc`,
`/api/auth/callback/bloc`, `/api/auth/session`) and any `[auth][error]` lines
cleanly. **Caveat:** the grep filter only passes lines that match a keyword,
so multi-line JSON output (e.g. a `console.log` of a full profile object) gets
clipped — only the odd line containing "bloc" survives. For anything printing
a multi-line payload, read the raw log directly instead:
`tail -n 150 .astro/dev.log`.

## What to actually click through

1. Visit `/auth/login` — optionally `/auth/login?next=/cart` to also check the
   redirect-target is preserved through login.
2. Click "Sign in with bloc" and complete the real login/consent on bloc's
   side.
3. You should land back on the app — `/` if no `next` was set, otherwise
   wherever `next` pointed.
4. Visit `/api/auth/session` and check the JSON. This is safe to read/share —
   it does not carry the raw bloc access token (kept server-only, decoded via
   `@auth/core/jwt`'s `getToken()` in `src/lib/auth.ts`); it only exposes
   `user.{id,name,email}` and `bloc.{mobile,hasUnpaidFees,userIsMember,...}`.
5. To check the route gate itself: while logged out, visit a protected route
   (`/cart`, `/reservation`, `/admin/items` — `/moderator/*` don't have pages
   built yet, see `docs/rental-shop.md` §10, so they 404 regardless of login
   state) and confirm the redirect to `/auth/login?next=...`; log in and
   confirm it lands you back there. To check role gating specifically, test
   `/admin/items` with a non-admin account (should 403) and an account in
   `ADMIN_USER_IDS` (should load).

## Live-testing bloc REST endpoints directly

`/api/debug/myaccount` and `/api/debug/listmypersonprofiles` are permanent
tools, not leftover scratch code: visit either in a logged-in browser tab to
see bloc's raw response for your own account, using your real session's
access token. See `src/lib/blocDebug.ts` for the shared helper and the hard
rule on what's safe to wrap this way (only your-own-account endpoints).

## Getting a genuinely clean session for retesting

Sessions are a JWT cookie. The `jwt()` callback in `src/auth.ts` only
refreshes `token.bloc` when Auth.js passes in a fresh `profile` — which only
happens on an actual new sign-in, not on ordinary requests. So:

- Editing your data on bloc's side will **not** show up in `/api/auth/session`
  until you go through a fresh login.
- A fresh login still needs a clean cookie jar — clear the `authjs.*` cookies
  for the app's origin (session-token, csrf-token, callback-url, state) via
  DevTools, or just use a private/incognito window, then log in again.
- There's no logout page built yet, so manual cookie-clearing / incognito is
  the only way to end a session right now.

## Known, still-open items

- **First-ever login attempt failed with a `403` on `account/listmypages`**;
  every attempt since (across multiple sessions) has succeeded, with no code
  change in between. Cause never diagnosed — if it recurs, worth capturing the
  full response body, not just the status code.
- **The profile-selection fallback** (`profileTypeId === 0 ?? profiles[0]`,
  in `src/auth.ts`'s `Bloc().userinfo.request`) has only ever been exercised
  against single-profile accounts, which always land on the `profileTypeId
  === 0` entry directly. The ambiguous-fallback path (`?? profiles[0]`) is
  still unverified against a real multi-profile bloc account.
- **Token endpoint client-auth method and the auto-added `scope=openid
  profile email`** are both unconfirmed as *correct* for bloc — they haven't
  caused an observed failure, but nobody's checked bloc's own docs to confirm
  they're right rather than just working.
- **`hasUnpaidFees`/`userIsMember` come back `null` from bloc** for every
  account tested so far — confirmed an external API defect on bloc's side
  (not a caching or client bug), reported to bloc by the user. See
  `docs/bloc-api.md`'s "Addendum" for the investigation and
  `docs/moderator-review.md`'s "Known issue" for what this blocks. Don't
  mistake a `null` you see here for a local bug — check whether bloc has
  shipped a fix before assuming otherwise.
