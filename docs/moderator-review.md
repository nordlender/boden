# Moderator order review page — starting notes

Not built yet. This is a lightweight starting point for whoever picks up the
moderator order-review page, to be organized/expanded later.

## Purpose

A moderator-facing page to **accept or deny a requested order before
retrieval**. Distinct from the existing retrieve/confirm flow in
`docs/rental-shop.md` §9 (`/moderator/retrieve` → `/moderator/orders/[id]` →
`/moderator/confirm/[id]`), which is about entering an order number and
recording actual quantities retrieved. Retrieval will be its own, separate
page — this review step happens earlier.

Design goal: very user-friendly, scannable at a glance. Good/bad values are
indicated with color, not just raw text.

## Known issue — bloc API defect (2026-09-02)

`hasUnpaidFees` and `userIsMember`, the two flagged fields below, currently
come back `null`/empty from **every** bloc method that exposes them
(`account/listmypages`, `Account/MyAccount`, `Profile/GetPage`,
`account/listmypersonprofiles`) — confirmed against a real logged-in account,
not a caching or client-side issue. This is an external API defect on bloc's
side; the user has contacted the provider to request a fix. Until that's
resolved, this page cannot show real values for either field — see
`docs/auth-handoff.md` §7 and `TASKS.md` for the full history. Don't
mistake `null` for "no data submitted yet" once order persistence exists —
it may just be bloc still not returning real values.

## Fields to display (so far)

Sourced from the bloc session profile (`session.bloc`, set in `src/auth.ts`),
already autofilled — immutable, Yes/No — on the member's checkout form
(`src/components/cart/CheckoutForm.astro`). **Decision (2026-08-26): these are
submitted as part of the checkout form itself** — a snapshot of the session
value at the moment the member places the order, not something the review
page re-fetches live from bloc later. This is a different call from the
earlier "don't persist" decision on name/email/mobile — those stay
session-only, but `hasUnpaidFees`/`userIsMember` need to survive past the
member's live session so a moderator can review them afterward. The form's
`hasUnpaidFees`/`userIsMember` inputs already exist with the right `name`
attributes for this (readonly, not disabled, so they submit); they still need
an actual column on `orders` once order persistence is built, since nothing
is persisted yet at all:

- **`hasUnpaidFees`** → shown as Yes/No.
  - **Yes → red.** This is the same flag that triggers the member-facing
    warning at checkout: "Warning: you have an unpaid fee. Please check your
    payments on osiklatring.no. If you have paid the current semester fee,
    this could be an error."
- **`userIsMember`** → shown as Yes/No.
  - **Yes → green, No → red.** (Opposite polarity from `hasUnpaidFees` —
    green/red both mean "good/bad for this field," not "true/false.")

More fields (order contents, requested quantities, member name/contact,
accept/deny controls themselves, etc.) still need to be listed out here.

## Open questions — not resolved, flagging for whoever builds this

1. **Route/page not named yet** — presumably something like
   `/moderator/review/[id]`, ahead of `/moderator/retrieve` in the flow, but
   not decided.
2. **Order persistence itself doesn't exist yet** — placing an order isn't
   wired up at all (see the scope note in `CheckoutForm.astro`), so there's no
   `orders`/`order_items` insert path for `hasUnpaidFees`/`userIsMember` (or
   anything else on the form) to land in yet. Whoever builds real order
   persistence needs to add columns for these two on `orders` and read them
   from the submitted form, per the decision above — not re-derive them from
   a live bloc session at review time.

## Correspondence check against docs/rental-shop.md

- Fixed (2026-09-11): `docs/rental-shop.md`'s "Order lifecycle" diagram now has
  its own earlier review step (`moderator reviews order on Review Order page
  (before retrieval)`, ending in `clicks "Accept" or "Reject"`) ahead of the
  retrieve/confirm flow, instead of conflating accept/reject with the
  *Confirm Order* step. Accept leaves `status: requested` unchanged (retrieval
  still sets `active` at Confirm); reject sets `status: rejected`.
- The schema already supports a reject outcome: `orders.status` includes
  `'rejected'`, and `rejectedAt` / `rejectedReason` columns already exist in
  `src/db/schema.ts` (added ahead of `docs/schema-legacy-fixes.md` item #9's original
  "TODO-only" instruction — already decided to leave as-is). Good news: this
  page's "deny" action has schema support today.
- `docs/rental-shop.md`'s page-structure listing (§2) doesn't have an entry for
  this review page yet — only the three existing retrieve/confirm pages are
  documented.
