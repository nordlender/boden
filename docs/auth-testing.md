# Manually testing the bloc login flow — guide

How to run a real end-to-end login against bloc during dev, and what to check.
Written up after the first live test on 2026-08-26/27.

## Prerequisites

- `.env` has real `BLOC_APPID` / `OAUTH_CLIENT_SECRET` (pasted directly into the
  file, never into chat), a matching `AUTH_SECRET`, and `REDIRECT_URL` set to
  whatever origin bloc actually redirects back to.
- **`REDIRECT_URL` must exactly match the redirect URI registered with bloc
  for this app/client** (`{REDIRECT_URL}api/auth/callback/bloc`) — a mismatch
  fails before you even see a login screen.

## Starting the server

```
npx astro dev --host --background
```

`--host` matters here, beyond what `AGENTS.md`'s plain `astro dev --background`
covers: by default Astro's dev server only binds to loopback, which was not
reachable at this project's `REDIRECT_URL` (a docker-internal address like
`172.17.0.2`) — only `localhost`/`127.0.0.1` worked without it. If bloc needs
to redirect a real browser back to this app, the server needs to be reachable
on that address, not just loopback.

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
   it no longer carries the raw bloc access token (fixed after a code review
   flagged it leaking to client-visible session data); it only exposes
   `user.{id,name,email}` and `bloc.{mobile,hasUnpaidFees,userIsMember,...}`.
5. To check the route gate itself: while logged out, visit a protected route
   that actually exists (`/cart` — `/admin` and `/moderator` don't have pages
   built yet, so they 404 regardless of login state and aren't a useful test
   yet) and confirm the redirect to `/auth/login?next=...`; log in and confirm
   it lands you back there.

## Live-testing bloc REST endpoints directly

`/api/debug/myaccount` and `/api/debug/listmypersonprofiles` are permanent
tools, not leftover scratch code: visit either in a logged-in browser tab to
see bloc's raw response for your own account, using your real session's
access token. See `src/lib/blocDebug.ts` for the shared helper and the hard
rule on what's safe to wrap this way (only your-own-account endpoints — see
that file's comment for why `Profile/GetPage` was rejected/deleted).

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

## Open items from the first live test — not yet resolved

- **First attempt failed with a `403` on `account/listmypages`; every
  attempt since has succeeded**, with no code change in between. Cause not
  diagnosed — watch for recurrence.
- **`hasUnpaidFees` and `userIsMember` came back `null`** in the raw
  `listmypages` response for the one real account tested, even after the
  member reported making changes on bloc's side. **Resolved 2026-09-02: this
  is an external API defect**, not stale data or a client bug — confirmed
  `null`/empty across all four bloc methods reachable with a real access
  token (`account/listmypages`, `Account/MyAccount`, `Profile/GetPage`,
  `account/listmypersonprofiles`). Reported to bloc by the user; see
  `docs/auth-handoff.md` §7 for the full writeup.
- The profile-selection fallback (`profileTypeId === 0 ?? profiles[0]`) is
  now confirmed fine for this account specifically — it only ever returned
  one profile, already `profileTypeId: 0`, so the ambiguous-fallback path
  still hasn't actually been exercised against a multi-profile account.
- Token endpoint client-auth method and the auto-added `scope=openid profile
  email` are both still unconfirmed as *correct* for bloc — they haven't
  caused an observed failure, but nobody's checked bloc's docs to confirm
  they're right rather than just working.
- ~~There is a temporary debug log in `src/auth.ts`'s `userinfo.request`~~ —
  removed now that the `hasUnpaidFees`/`userIsMember` question above is
  resolved. Use `/api/debug/myaccount` / `/api/debug/listmypersonprofiles`
  (see above) instead for live-inspecting raw bloc responses going forward.
