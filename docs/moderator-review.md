# Moderator order review page

Built: `/moderator/review/[code]` (`src/pages/moderator/review/[code].astro`),
fed by the `/moderator/requests` queue. Logic in `src/lib/moderatorOrders.ts`
(`acceptOrder` / `rejectOrder`); the buttons POST to
`src/pages/api/moderator/orders/[id]/accept.ts` and `.../reject.ts`.

## Purpose

A moderator-facing page to **accept or deny a requested order before
retrieval**. Distinct from the retrieve/confirm flow in `docs/rental-shop.md`
§10 (order hub → blind count → `active`), which records the quantities
actually handed out. This review step happens earlier: accept sets
`status: scheduled` and stamps `acceptedAt`; reject sets `status: rejected`
and records a required `rejectedReason`.

Design goal: very user-friendly, scannable at a glance. Good/bad values are
indicated with color, not just raw text.

## Resolved — bloc API defect (2026-09-02)

`hasUnpaidFees` and `userIsMember` used to come back `null` from every bloc
profile method. They now come from bloc's dedicated `GetMemberFeeStatus`
method, fetched live on `/reservation` — see `docs/bloc-api.md`'s "Update". A
stored `null` now means the live call failed (timeout/error), not a bloc
defect.

## Fields to display (so far)

Shown (display-only, Yes/No) on the member's checkout form
(`src/components/cart/CheckoutForm.astro`), fetched live from bloc's
`GetMemberFeeStatus` when the reservation page opens
(`src/lib/blocFeeStatus.ts`). **Decision (2026-08-26): they are snapshotted on
the order** — the value at the moment the member places the order, not
something the review page re-fetches live from bloc later. This is a different
call from the earlier "don't persist" decision on name/email/mobile — those
stay session-only, but `hasUnpaidFees`/`userIsMember` need to survive past the
member's live session so a moderator can review them afterward. The snapshot
is **not** taken from the posted form (a member could forge it): 
`/api/orders/create` re-fetches it server-side at submit time and stores it in
the `orders` columns:

- **`hasUnpaidFees`** → shown as Yes/No.
  - **Yes → red.** This is the same flag that triggers the member-facing
    warning at checkout: "Warning: you have an unpaid fee. Please check your
    payments on osiklatring.no. If you have paid the current semester fee,
    this could be an error."
- **`userIsMember`** → shown as Yes/No.
  - **Yes → green, No → red.** (Opposite polarity from `hasUnpaidFees` —
    green/red both mean "good/bad for this field," not "true/false.")

The page also shows the order contents and requested quantities, the
member's submitted contact name (from the `orders.contactName` snapshot;
`contactEmail` / `contactMobile` are stored but not shown yet), the accept/reject controls, and whether
the member accepted the liability disclaimer (`orders.disclaimerAcceptedAt`).

## Resolved questions

- **Route**: `/moderator/review/[code]`, keyed by order code. A bare
  `/moderator/review` redirects to `/moderator/requests`.
- **Persistence**: `/api/orders/create` writes `hasUnpaidFees` and
  `userIsMember` (plus the contact snapshot) onto the `orders` row — columns
  exist in `src/db/schema.ts`, per the decision above.

## Cross-references

- `docs/rental-shop.md`'s "Order lifecycle" diagram and §10 describe this
  step ahead of retrieval.
- `rejectedAt` / `rejectedReason` come from `docs/schema-legacy-fixes.md`
  item #9 (originally a TODO-only instruction, since added).
