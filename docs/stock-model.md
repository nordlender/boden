# Stock model: research & recommendation

Status: proposal (2026-10-03). Question asked: *is there a more intuitive way
of keeping stock than "stockCount minus every open order" — e.g. a time
series?* This doc surveys how comparable rental / lending platforms handle it,
lists what's wrong with ours today, and recommends a direction.

Related: #245 (shop stock ignores dates), #276 (physical units), #62 (service /
quarantine), #79 (per-item hand-out), PR #292 (admin current stock), PR #293
(admin Reserved column).

## 1. What we do today

- `items.stockCount` — total owned. Nothing else stored.
- `src/lib/stock.ts` `reservedQuantitiesByItem` — `Σ requestedQuantity` over
  every `requested`/`scheduled`/`active` order, **ignoring dates**. Used by the
  shop, cart and (before #292) the admin table as `inStock = stockCount − that`.
- `src/lib/reservation.ts` `getReservationAvailability` — the correct one:
  overlapping-range query + sweep-line `peakConcurrentQuantity` over the
  requested window. Used by `/reservation` and `createOrder`.

So we already have two different answers to "how many are available", and only
one of them is date-aware.

### Concrete problems found

1. **Date-blind shop stock** (#245). A booking next month shows "out of stock"
   today; two non-overlapping bookings can drive `inStock` negative.
2. **Short hand-outs keep blocking** (#245). Both functions sum
   `requestedQuantity` even after a moderator recorded a smaller
   `retrievedQuantity` on an `active` order.
3. **Overdue rentals stop blocking** (new). `getReservationAvailability` only
   considers orders whose `[fromDate, toDate]` overlaps the requested range. An
   `active` order whose `toDate` has passed but which hasn't been returned
   is physically still out, yet a new booking starting tomorrow sees those
   units as free. Shelf.nu treats an overdue booking as *never-ending* for
   exactly this reason.
4. **One number for three questions.** "How many are on the shelf now?",
   "how many are promised?" and "can I book N for these dates?" are different
   questions; a single `inStock` can't answer all of them.

## 2. How comparable platforms do it

| Platform | Stored | Derived | Notes |
|---|---|---|---|
| **Shelf.nu** (open source, asset mgmt + bookings) | total qty, custody rows, booking rows, check-out/return ledger, `minQuantity` | **Free now** = total − custody − in kits − checked out; **Reserved** = units on upcoming RESERVED bookings; **Stock status** badge (`Short by N` / `None free` / `Running low` / `Enough`) | "Short" uses *peak concurrent* future demand, not a sum. Future reservations are **not** subtracted from Free now. Overdue = never-ending. Partial returns go back on the shelf immediately. [PR #3041](https://github.com/Shelf-nu/shelf.nu/pull/3041), [PR #3103](https://github.com/Shelf-nu/shelf.nu/pull/3103) |
| **Booqable** (commercial rental SaaS) | orders with status (`reserved`, `started`, `stopped`), stock items | per-period `available` / `plannable` from an Availabilities endpoint; inventory breakdown includes `started` (out now) | Availability is always asked *for a period*, never as a single global number. [API docs](https://developers.booqable.com/), [order workflow](https://help.booqable.com/en/articles/3845244-the-booqable-order-workflow) |
| **Odoo Rental** | rental orders + stock moves (pickup = delivery, return = receipt) | availability computed live from confirmed orders and stock moves; lot-tracked = quantity check per period, serial-tracked = per unit | Order states *Reserved → Picked up → Returned* mirror our *scheduled → active → returned*. [Odoo 19 docs](https://www.odoo.com/documentation/19.0/applications/sales/rental/configure_products/products.html) |
| **Current RMS** | orders / reserved quotes with dates | per-period availability; **shortage** flags on any order whose period exceeds stock | Shortages surfaced on a dashboard and per-order, not as a stock number. [Help: shortages](https://help.current-rms.com/en/articles/660532-view-and-deal-with-shortages) |
| **Lend Engine** (library of things) | each item copy has a *location* (on shelf, on loan, reserved location, repair) | "3 of 4 available" = copies in available locations | Closer to a per-unit model (#276). [Feature tour](http://www.lend-engine.com/tour) |
| Generic e-commerce / inventory issues | on-hand counter + **stock movement ledger** (adjusted, reserved, released, committed) | available = on-hand − active reservations | Ledger written in the same transaction as the counter; gives an audit trail. [ondokuzz/ecomm #44](https://github.com/ondokuzz/ecomm/issues/44), [#30](https://github.com/ondokuzz/ecomm/issues/30) |

### Common pattern

Nobody stores "available" as a number. Everyone stores **events/intervals**
(bookings with a date range, check-out and return records) and derives:

- **On shelf now:** total − physically out (checked out / in custody / in
  service).
- **Reserved / promised:** future bookings not yet handed out.
- **Available for [from, to]:** total − *peak concurrent* demand inside the
  window (sweep-line, which is what our `reservation.ts` already does).
- **Shortage:** any future moment where peak demand > total.

## 3. Options considered

### A. Keep the interval model, unify and fix it (recommended now)

Orders already *are* the time series: each order line is an interval
`[fromDate, toDate] × quantity`. Make one availability primitive and derive
every number from it:

- One SQL expression for a line's claim:
  `coalesce(retrievedQuantity, requestedQuantity)`.
- One effective interval per line: `active` orders past `toDate` extend to
  `max(toDate, today)` (overdue = still out); `returned`/`rejected` don't count.
- Three named views, each with one function in `src/lib/stock.ts`:
  - `onShelfNow(item)` = stockCount − Σ active claims (PR #292).
  - `reserved(item)` = Σ requested + scheduled claims (PR #293).
  - `availableFor(item, range)` = stockCount − peak concurrent claims in range
    (today's `getReservationAvailability`, extended with the overdue rule).
- Shop/cart stop using the date-blind number: show *on shelf now* or "available
  for <selected dates>" (#245's decision).
- Optional: a shortage badge on admin items (`Short by N` when peak future
  demand > stockCount), like Shelf.nu.

Cost: small, no schema change. Fixes all four problems in §1.

### B. Stock movement ledger (do alongside #276 / #62)

An append-only `stock_movements` table (`itemId`/`unitId`, `delta`, `kind`:
acquired, retired, damaged, service-out, service-in, adjustment; `actorId`,
`createdAt`, note). `stockCount` becomes `Σ delta` (or a cached counter
updated in the same transaction).

Wins: audit trail of *why* stock changed, which #276 (recalls, damage notes)
and #62 (quarantine) need anyway. Doesn't replace A — rentals still live as
order intervals; the ledger only covers changes to *what we own*.

With #276's per-unit table, the ledger largely becomes unit status history,
so build it as part of that work rather than separately.

### C. Materialised daily availability table (time series per day)

A table `item_availability(itemId, date, booked)` updated on every order
change, read directly by the calendar.

Rejected for now: it duplicates data the orders already hold, needs careful
invalidation on accept/reject/hand-out/return/date edits (the drift problem
`schema.ts` already warns about), and our volumes (a club's gear room, SQLite)
make the on-the-fly sweep trivially fast. Revisit only if a calendar heatmap
over months becomes slow.

### D. Database-enforced range constraints

Postgres `tstzrange` + exclusion constraints prevent overlapping bookings
per *unit*, but don't handle quantities > 1 and aren't available in SQLite.
Not applicable.

## 4. Recommendation

1. Ship PR #292 (admin on-shelf-now) and PR #293 (Reserved column) — these
   already follow the Shelf.nu split.
2. Do **Option A** as the fix for #245 plus the overdue bug: one
   claim expression, one effective-interval rule, three named functions in
   `stock.ts`, shop shows on-shelf-now or date-specific availability.
3. Add a **shortage badge** to admin items (peak future demand vs stock).
4. Fold **Option B** (movement ledger / unit status history) into #276.
5. Don't build a materialised time series (C).

## 5. Open questions for the team

- Shop: show "on shelf now", or hide the number and only show availability
  once dates are picked (Booqable style)?
- Should `requested` (not yet accepted) orders block availability, or only
  `scheduled`? Today they block; Current RMS blocks for reserved quotes too.
- Overdue: block indefinitely (Shelf.nu) or assume return within N days?
