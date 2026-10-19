# Astro + SQLite rental shop — setup guide

> This is the original project spec, kept up to date with what's actually
> built (last full pass: 2026-10-19). For the authoritative schema
> rationale see [`docs/schema.md`](schema.md); for the moderator
> order-review step see [`docs/moderator-review.md`](moderator-review.md).
> Where something below is planned but not yet built, it's marked
> **(planned)**.

## Terminology

- **Product** — a category-level listing an admin creates (e.g. "Edelrid
  Harness"). Holds shared info (title, description, category/subcategory,
  external links) and the attribute-key template (e.g. Size, Color) that
  every one of its items fills in.
- **Item** — one specific permutation of a product's options (e.g. "Edelrid
  Harness, Green, M"). Items are what actually get rented — orders always
  reference items, never products directly. An item can also exist
  unassigned (no product yet) while an admin is still building it out in
  the wizard.
- **Set** — a rentable bundle of items with quantities, offered as a
  product's variant instead of a single item. Resolved into its component
  items at checkout, so orders still only reference items.
- **Unit** — one physical object behind an item. An item's stock is the
  number of its active units. Admin-only bookkeeping; rentals never see units.
  See `docs/schema.md`.

## Stack overview

| Layer | Choice | Why |
|---|---|---|
| Framework | Astro ^7 | Static-first, zero JS by default, built-in image optimisation |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Responsive utilities, mobile-first, great for image grids |
| Database | SQLite via `better-sqlite3` | Zero-config, file-based, perfect for low traffic |
| ORM | Drizzle ORM | Type-safe, lightweight, works great with SQLite |
| Auth | `auth-astro` + `@auth/core`, custom bloc OAuth provider | Login and membership status come from [bloc](https://bloc.net) (osiklatring.no's membership backend), not a separate account system — see §7 |
| Image storage | Local disk (`data/uploads/`), served at `/media/*` | Admin uploads through the wizard's image menu (see §12) |
| Deployment | Single VPS (e.g. Hetzner, DigitalOcean) with Node adapter | SQLite needs a persistent filesystem — no serverless |

---

## Domain model & rental flow

### Roles

| Role | What they can do |
|---|---|
| `member` | Browse catalogue, manage cart, choose reservation dates, place orders, view own order history |
| `moderator` | Everything a member can do + review/accept-reject, retrieve, confirm handoff, and mark returns (§10), and register their own pick-up days (`/moderator/pickup-days`) |
| `board` | Ranks between moderator and admin in `ROLE_RANK`; no route is gated on it yet — it only affects the order-code role letter (§6) |
| `admin` | Everything a moderator can do + manage products, items, sets and units (`/admin/products`, `/admin/items`, `/admin/sets`, `/admin/units`), view all orders, and set recurring pick-up days (`/admin/pickup-days`) |

Role assignment itself is **not** an in-app admin feature today: it's a
temporary comma-separated bloc-user-id allowlist in env vars
(`ADMIN_USER_IDS` / `BOARD_USER_IDS` / `MODERATOR_USER_IDS`, see §8) until bloc ships a real
role endpoint.

### Order lifecycle

```
member browses catalogue, adds items to cart
  → cart lives in a cookie only — no database row yet (§5)

member goes to /reservation, picks pick-up/return dates
  → live availability check against existing requested/scheduled/active orders
  → if any item or set is unavailable for the chosen dates, submit is blocked
    until the member picks other dates or removes those lines from the cart
  → submits → POST /api/orders/create
  → status: requested
  → order code (NNAAX format, read aloud at pick-up) generated
  → redirected to /checkout/success?order=<orderCode>

moderator opens the request queue (/moderator/requests) or enters the order
code at /moderator/retrieve, which lands on the order hub
  → Review page (/moderator/review/[code]): member bio, hasUnpaidFees /
    userIsMember flags (snapshotted on the order), requested items
  → clicks "Accept" or "Reject"
  → status: scheduled (accept — acceptedAt stamped, proceeds to retrieval below)
  → status: rejected  (reject — moved to archive, rejectedReason recorded)

moderator fetches items from storage, then on the hub clicks "Confirm"
  → blind-count page (/moderator/retrieve/[id]/count): enters actual
    quantity handed out per item
  → status: active  (rental is now live; activatedAt + confirmedByUserId stamped)

member returns items on-site
  → moderator blind-counts them at /moderator/return/[id]
  → status: returned  (returnedAt + returnedByUserId stamped, moved to archive)
```

A member can also reschedule (`PATCH /api/orders/[code]/reschedule`, blocked
once a moderator has accepted) or delete (`DELETE /api/orders/[code]`) their
own order from `/orders`.

Every step above is implemented — cart → reservation → order creation
(`src/lib/orders.ts`, `src/pages/api/orders/create.ts`) and the moderator
steps (`src/lib/moderatorOrders.ts`, §10).

---

## 1. Project scaffold (historical)

The project is already scaffolded; this records how, for reference.

```bash
npm create astro@latest rental-shop -- --template minimal --typescript strict
cd rental-shop
npm install better-sqlite3 drizzle-orm drizzle-kit
npm install -D @types/better-sqlite3
npm install tailwindcss @tailwindcss/vite
npm install auth-astro @auth/core astro-icon
```

Install the Node.js server adapter (required for SSR routes):

```bash
npx astro add node
```

---

## 2. Project structure

```
boden/
├── src/
│   ├── auth.ts                              # bloc OAuth provider config (auth-astro) — §7
│   ├── env.d.ts
│   ├── pages/
│   │   ├── index.astro                      # Catalogue — prerendered shell + deferred live grid
│   │   ├── products/[slug].astro            # Product detail: variant buttons, image, attributes, links, availability
│   │   ├── reservation/
│   │   │   ├── index.astro                  # Pick-up/return dates, availability, remove unavailable items — SSR
│   │   │   └── confirm.astro                # Read-only order overview before placing — SSR
│   │   ├── checkout/success.astro           # Order receipt after placing — SSR
│   │   ├── orders/
│   │   │   ├── index.astro                  # The member's own orders
│   │   │   └── [code].astro                 # One of the member's orders (reschedule / delete)
│   │   ├── admin/                           # Admin only
│   │   │   ├── index.astro                  # Hub with the message board
│   │   │   ├── products.astro, products/new.astro, products/[id]/edit.astro
│   │   │   ├── items.astro                  # Product/item wizard
│   │   │   ├── items/[id]/units.astro       # Physical units behind one item
│   │   │   ├── units.astro                  # Every unit of every item
│   │   │   ├── sets.astro                   # Rentable bundles of items
│   │   │   ├── orders.astro                 # All orders
│   │   │   └── pickup-days.astro            # Single + recurring pick-up days
│   │   ├── moderator/                       # Moderator and up
│   │   │   ├── index.astro                  # Hub with the message board
│   │   │   ├── requests.astro               # Orders awaiting review
│   │   │   ├── retrieve.astro               # Order-code lookup, redirects to the order hub
│   │   │   ├── retrieve/[id].astro          # Order hub: next action for the order's state
│   │   │   ├── retrieve/[id]/count.astro    # Blind count when handing out
│   │   │   ├── review/[code].astro          # Accept / reject
│   │   │   ├── return/[id].astro            # Blind count on return
│   │   │   └── pickup-days.astro            # Own single pick-up days
│   │   ├── media/[...path].ts               # Serves admin-uploaded images from data/uploads
│   │   └── auth/login.astro                 # Redirect to bloc
│   │
│   ├── pages/api/
│   │   ├── cart.ts, cart/                   # add / remove / update / update-all / clear — cookie cart
│   │   ├── orders/                          # create.ts; [code].ts (DELETE); [code]/reschedule.ts (PATCH)
│   │   ├── reservation/availability.ts      # POST — live availability preview for chosen dates
│   │   ├── moderator/                       # retrieve.ts, orders/[id]/{accept,reject,confirm,return}.ts, pickup-days/
│   │   ├── admin/                           # images.ts (upload), pickup-days/recurring/
│   │   ├── messages/                        # add / delete (moderator), pin / unpin (admin)
│   │   ├── products/                        # create / [id]/update — admin only
│   │   ├── wizard/                          # items, sets, units, attributes, set-product, images, archive — admin only
│   │   └── debug/                           # bloc API exploration endpoints, see docs/bloc-api.md
│   │
│   ├── db/
│   │   ├── client.ts                        # SQLite connection singleton
│   │   ├── schema.ts                        # Drizzle schema — §4, full rationale in docs/schema.md
│   │   └── migrations/                      # Generated by drizzle-kit
│   │
│   ├── lib/                                 # auth, cart, orders, moderatorOrders, reservation, availability,
│   │                                        # shop, products, wizard, sets, units, pickupDays, messages, uploads, http, ...
│   ├── middleware/
│   │   ├── index.ts                         # Auth + role gate — §9
│   │   └── prefixes.ts                      # Route-prefix tables, unit-testable in isolation
│   │
│   ├── components/                          # shop, cart, reservation, orders, moderator, admin, wizard, units,
│   │                                        # availability, pickup-days, messages, nav, icons, ui (Button family,
│   │                                        # Modal, Callout, popovers, ExpandBox, ...)
│   └── layouts/                             # BaseLayout, AdminLayout, ModeratorLayout, ConfirmationLayout, HtmlShell
│
├── public/
│   ├── product/                             # Manually-seeded fixture product images
│   └── uploads/                             # Manually-seeded fixture item images
├── data/
│   ├── rental.db                            # SQLite database file
│   └── uploads/                             # Admin-uploaded images (gitignored) — §12
├── drizzle.config.ts
└── astro.config.mjs
```

---

## 3. Astro config

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';
import auth from 'auth-astro';
import icon from 'astro-icon';

export default defineConfig({
  // Rendered per request by default; the shop grid shell, login and 404
  // opt into build-time rendering with `export const prerender = true`.
  output: 'server',
  redirects: { '/moderator/review': '/moderator/requests' },
  adapter: node({ mode: 'standalone' }),
  integrations: [auth({ configFile: './src/auth.ts' }), icon()],
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: true }, // dev server is tunneled through a random *.loca.lt hostname
  },
});
```

`output: 'server'` renders every route per request (SQLite is local, so a catalogue query costs well under a millisecond). Only pages with nothing per-request are prerendered: `/auth/login`, `404`, and the shell of `/`. The shop grid on `/` is a server island (`<ShopGrid server:defer>`): the prerendered page ships a build-time snapshot of the grid as fallback, and the island swaps in live data on load — instant first paint without a stale catalogue.

---

## 4. Database schema

The schema lives in `src/db/schema.ts`; [`docs/schema.md`](schema.md) embeds
a generated copy of it (kept in sync by `npm run docs:schema`) plus the
design rationale for every decision. Not duplicated here, so it can't drift.

```ts
// src/db/client.ts (abridged — also creates data/ if missing)
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('./data/rental.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: './data/rental.db' },
  migrations: { prefix: 'timestamp' }, // parallel branches don't collide on a sequence number
});
```

Run migrations:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## 5. Cart (cookie-based, no database)

The cart cookie stores only entry refs and quantities — no database row is created until checkout. An entry is either a plain item or a set. `src/lib/cart.ts` joins them against `items`/`sets`/`products` on read to build display lines (`CartLine`: product title/slug, image, attribute values, `stockCount` — the item's active units, see `docs/schema.md` — vs. `inStock`, what's available today, via `src/lib/availability.ts`). Entries pointing at an item or set that no longer exists, is archived, or whose product is unpublished are silently dropped when reading the cart for display.

```ts
// src/lib/cart.ts (core shape)
export type CartEntry = { itemId: number; quantity: number } | { setId: number; quantity: number };

export function getCart(cookies: AstroCookies): CartEntry[] { /* JSON.parse the 'cart' cookie, [] on failure */ }
export function setCart(cookies: AstroCookies, cart: CartEntry[]) { /* httpOnly, sameSite=lax, 1 week */ }
export function addToCart(cookies, entry: CartEntry) { /* adds to existing quantity */ }
export function updateCartQuantity(cookies, ref, quantity) { /* sets outright; <= 0 removes the line */ }
export function removeFromCart(cookies, ref) { /* ... */ }
export function clearCart(cookies) { /* ... */ }
export async function getCartLines(cookies): Promise<CartLine[]> { /* joins against items/sets/products for display */ }
```

---

## 6. Reservation & checkout (implemented)

Placing an order is a four-step flow, not a single "place order" action:

1. **Cart sidebar** — review cart lines, adjust quantity (0 removes). Its primary action links to `/reservation`; there is no separate `/cart` page.
2. **`/reservation`** — pick a pick-up (`fromDate`) and return (`toDate`) date. A live `POST /api/reservation/availability` preview flags any cart line that's unavailable for the chosen range; submit stays blocked while any item is unavailable, and the member either changes dates or removes the unavailable items from the cart (`POST /api/cart/remove`) — there are no split orders; one checkout is always one order. The form also displays (read-only, from the bloc session) name/email/mobile, and the `hasUnpaidFees`/`userIsMember` flags fetched live from bloc's `GetMemberFeeStatus` (`src/lib/blocFeeStatus.ts`).
3. **`/reservation/confirm`** — the form's submit POSTs here (not to the API). Read-only overview of the order: pick-up/return dates, the pick-up window(s) for the pick-up date, the items (an `OrdersTableRow` preview), contact details and note. Carries the form values forward as hidden fields, including the liability-disclaimer checkbox (required); its "Confirm order" button posts to `/api/orders/create`. "Back" returns to `/reservation`.
4. **`POST /api/orders/create`** — re-validates the date range and re-checks availability **inside the insert transaction** (the live preview is advisory only; this is the actual enforcement point, closing the race between two members submitting overlapping requests concurrently). Expands any set lines into their component items, snapshots the contact fields, `disclaimerAcceptedAt` and (re-fetched server-side, never taken from the form) the bloc fee/membership flags onto the order, and generates an `NNAAX`-format `orderCode` (last letter always flags the creating member's role — A/B/I/M for admin/board member/instructor(moderator)/member), then redirects to `/checkout/success?order=<orderCode>`.

```ts
// src/lib/orders.ts (signatures, abridged — see CreateOrderInput for the contact/fee/disclaimer snapshot fields)
export async function createOrder(input: {
  userId: string; role: Role; note: string | null; cartEntries: CartEntry[]; fromDate: string; toDate: string;
  /* ...contactName, contactEmail, contactMobile, hasUnpaidFees, userIsMember, disclaimerAccepted */
}): Promise<
  | { ok: true; orderId: number; orderCode: string }
  | { ok: false; error: 'empty_cart' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] }
  | { ok: false; error: 'user_not_found' }
>;
```

`/checkout/success?order=<orderCode>`.

```ts
// src/lib/orders.ts (signatures)
export async function createOrder(input: {
  userId: string; note: string | null; cartEntries: CartEntry[]; fromDate: string; toDate: string;
}): Promise<
  | { ok: true; orderId: number; orderCode: string }
  | { ok: false; error: 'empty_cart' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] }
>;
```

`/checkout/success?order=<orderCode>` looks the order up by code, scoped to the signed-in user in the query itself (no enumerating another member's orders by guessing codes — a miss redirects to `/orders`).

---

## 7. Authentication

`auth-astro` (Auth.js) handles the OAuth flow — redirects, token exchange, callback, session cookie. The identity provider is **bloc** (`rest.bloc.net`), the climbing club's membership backend — not a generic named Auth.js provider, since bloc isn't one of Auth.js's built-ins. It's a hand-rolled `OAuthConfig`.

```ts
// src/auth.ts (shape)
import { defineConfig } from 'auth-astro';

function Bloc(config): OAuthConfig<BlocProfile> {
  return {
    id: 'bloc',
    type: 'oauth',
    authorization: { url: 'https://rest.bloc.net/OAuth/Authorize', params: { response_type: 'code', redirect_uri: config.redirectUri } },
    token: 'https://rest.bloc.net/OAuth/Token',
    checks: ['state'], // PKCE support unconfirmed on bloc's side
    userinfo: { url: '.../account/listmypages', async request({ tokens }) { /* fetch + pick profileTypeId 0 */ } },
    profile(profile) { /* maps bloc fields -> Auth.js user + custom fields (mobile, hasUnpaidFees, userIsMember, ...) */ },
  };
}

export default defineConfig({
  providers: [Bloc({ clientId: import.meta.env.BLOC_APPID, clientSecret: import.meta.env.OAUTH_CLIENT_SECRET, redirectUri: /* app base + /api/auth/callback/bloc */ })],
  callbacks: {
    async signIn({ user }) {
      if (!user.id || !user.email) return false;
      await upsertSignedInUser(db, { id: user.id, email: user.email, name: user.name }); // fails closed
      return true;
    },
    async jwt({ token, account, profile }) { /* persists access token + bloc.{mobile,hasUnpaidFees,userIsMember,...} into the JWT */ },
    async session({ session, token }) { /* exposes token.sub as session.user.id, token.bloc as session.bloc */ },
  },
});
```

No `sessions` table — Auth.js manages its own signed JWT cookie. `hasUnpaidFees`/`userIsMember` are **not** in the session: they come from bloc's dedicated `GetMemberFeeStatus` method, fetched live on every `/reservation` visit and re-fetched server-side by `/api/orders/create`, which snapshots them onto the `orders` row so a moderator can review them later (see `docs/moderator-review.md`, `docs/bloc-api.md`). `null` means the live call failed.

See `docs/auth-testing.md` for the manual test guide.

---

## 8. Role gate (temporary allowlist)

Bloc doesn't expose a role endpoint yet, so admin/board/moderator status is a **temporary hardcoded allowlist** of bloc user ids, not a live external lookup.

```ts
// src/lib/auth.ts
export type Role = 'admin' | 'board' | 'moderator' | 'member';

// member < moderator < board < admin. Every "at least X" check goes through
// hasRole() rather than comparing roles directly.
export const ROLE_RANK: Record<Role, number> = { member: 0, moderator: 1, board: 2, admin: 3 };
export function hasRole(role: Role | undefined | null, min: Role): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[min];
}

const ADMIN_USER_IDS = parseIdAllowlist(import.meta.env.ADMIN_USER_IDS);         // comma-separated
const BOARD_USER_IDS = parseIdAllowlist(import.meta.env.BOARD_USER_IDS);
const MODERATOR_USER_IDS = parseIdAllowlist(import.meta.env.MODERATOR_USER_IDS);

// Plain synchronous lookup, no cache — add caching back once a real bloc role API exists (#22).
export function getRole(userId: string): Role {
  if (ADMIN_USER_IDS.has(userId)) return 'admin';
  if (BOARD_USER_IDS.has(userId)) return 'board';
  if (MODERATOR_USER_IDS.has(userId)) return 'moderator';
  return 'member';
}

// Decodes the Auth.js JWT cookie directly via @auth/core/jwt's getToken()
// (not auth-astro's getSession(), which serves the same shape to client JS —
// this must stay server-only) and resolves the role.
export async function validateSession(request: Request): Promise<{ id: string; email: string; name: string | null; role: Role } | null>;
```

`getRole()`'s shape (`userId in, Role out`) deliberately mirrors what a real `getRoleFromExternalApi(accessToken, cacheKey)` would look like, so swapping the body for a live bloc role lookup later shouldn't require touching `validateSession()` or the middleware.

---

## 9. Middleware (auth + role gate)

Matches against Astro's own resolved `ctx.routePattern` (e.g. `/moderator/orders/[id]`), not raw `ctx.url.pathname` — Astro's auth guide warns that pathname string-matching can be bypassed by a configured `base`, URL encoding, or duplicate slashes; `routePattern` has no such gap.

```ts
// src/middleware/prefixes.ts
// Ordered; first match wins, so more specific prefixes go before broader ones.
export const ROUTE_RULES: RouteRule[] = [
  { prefix: '/admin', minRole: 'admin' },
  { prefix: '/api/wizard', minRole: 'admin' },
  { prefix: '/api/products', minRole: 'admin' },
  { prefix: '/api/admin/pickup-days', minRole: 'admin' },
  { prefix: '/api/admin/images', minRole: 'admin' },
  { prefix: '/api/messages/pin', minRole: 'admin' },
  { prefix: '/api/messages/unpin', minRole: 'admin' },
  { prefix: '/moderator', minRole: 'moderator' },
  { prefix: '/api/moderator', minRole: 'moderator' },
  { prefix: '/api/messages/add', minRole: 'moderator' },
  { prefix: '/api/messages/delete', minRole: 'moderator' },
  { prefix: '/checkout', minRole: 'member' },
  { prefix: '/orders', minRole: 'member' },
  { prefix: '/reservation', minRole: 'member' },
  { prefix: '/api/reservation', minRole: 'member' },
  { prefix: '/api/orders', minRole: 'member' },
];

export function matchesPrefix(routePattern: string, prefix: string) {
  return routePattern === prefix || routePattern.startsWith(`${prefix}/`);
}
// Minimum role needed for a route, or null if it's public.
export function requiredRole(routePattern: string): Role | null {
  return ROUTE_RULES.find((r) => matchesPrefix(routePattern, r.prefix))?.minRole ?? null;
}
export function isApiRoute(routePattern: string) { return routePattern.startsWith('/api/'); }
```

```ts
// src/middleware/index.ts
export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered) { ctx.locals.user = null; return next(); } // no real Request on a prerendered page

  const user = await validateSession(ctx.request);
  ctx.locals.user = user;
  const { routePattern } = ctx;
  const minRole = requiredRole(routePattern);

  if (minRole && !user) {
    // API callers get a plain 401 (redirecting into OAuth login would send Auth.js's
    // callback back to a POST-only route with a GET, which 404s); page routes get redirected.
    if (isApiRoute(routePattern)) return new Response('Unauthorized', { status: 401 });
    return ctx.redirect(`/auth/login?next=${encodeURIComponent(ctx.url.pathname)}`);
  }
  if (minRole && !hasRole(user?.role, minRole)) return new Response('Forbidden', { status: 403 });
  return next();
});
```

Most `/api/*` rules (`/api/wizard`, `/api/products`, `/api/admin/*`, `/api/moderator`, `/api/messages/*`, `/api/reservation`, `/api/orders`) are backed by an inline role/auth check in the endpoint itself (`requireAdmin`/`requireModerator`, both built on `hasRole`) — this middleware gate is defense-in-depth for those routes, not their only protection.

```ts
// src/env.d.ts
declare namespace App {
  interface Locals {
    user: { id: string; email: string; name: string | null; role: Role } | null;
  }
}
```

---

## 10. Moderator flow — page by page (built)

Business logic lives in `src/lib/moderatorOrders.ts`; the POST routes under `src/pages/api/moderator/` are thin wrappers gated by `requireModerator`. See `docs/moderator-review.md` for the review step's data rules.

### Request queue (`/moderator/requests`)

Every order still `requested`, earliest submitted first. `/moderator/review` with no code redirects here.

### Retrieve order (`/moderator/retrieve`)

The moderator types in an order code (an optional leading `#` is stripped). The form POSTs to `src/pages/api/moderator/retrieve.ts`, which looks up `orders.orderCode` and redirects to the order hub (or back to the form with `?error=not_found`). This is the entry point for both review and retrieval.

### Order hub (`/moderator/retrieve/[id]`)

Shows the full order — member details, fee/membership flags, requested items with quantities, availability warnings — and offers the next action for the order's state: review (`requested`), confirm (`scheduled`, with a warning if a late return would break the following rental), or return (`active`).

### Review (`/moderator/review/[code]`)

Accept or reject a `requested` order **before** retrieval. `POST /api/moderator/orders/[id]/accept` sets `status: scheduled` and stamps `acceptedAt`; `.../reject` sets `status: rejected` and records a required `rejectedReason`.

### Confirm retrieval (`/moderator/retrieve/[id]/count`)

A **blind count**: one numeric input per line, never pre-filled with the target. A count that doesn't match the target (the requested quantity, or a reduced target the moderator set for an unavailable line) bounces back with a "Retrieve N more" / "Put back N" correction. When every line matches, `.../confirm` writes `orderItems.retrievedQuantity`, sets `status: active` and stamps `activatedAt` and `confirmedByUserId`.

### Return (`/moderator/return/[id]`)

A single blind-count page for an `active` order, with each line's `retrievedQuantity` as the target. `.../return` sets `status: returned` and stamps `returnedAt` and `returnedByUserId`.

### Pick-up days (`/moderator/pickup-days`)

A moderator registers their own single pick-up days (date, time window, optional meeting point). Admins additionally create recurring rules at `/admin/pickup-days`. See `docs/schema.md` (`pickupDays`).

---

## 11. Product detail page

```astro
---
// src/pages/products/[slug].astro
// Route is "/products/[slug]", not "/items/[slug]": a slug-routable,
// customer-facing page is a product (title/description/attribute
// template), with items as its unlabeled variants underneath.
import { getShopProductBySlug } from '../../lib/shop';

const product = await getShopProductBySlug(Astro.params.slug!);
if (!product) return new Response(null, { status: 404 }); // serves 404.astro
---
<!-- variant buttons (one per item, labelled by the admin-flagged variant
     attribute key(s); dimmed when inStock <= 0),
     image + ImagePlaceholder fallback, attribute list, quantity input
     capped at inStock, "Add to cart" POSTing to /api/cart/add.
     A client-side <script> keeps image/stock/attributes/quantity-cap in
     sync on variant change (including a ?item=<id> preselect from an
     ItemCard link). -->
```

---

## 12. Item images

Admins upload images through the wizard's image menu (`ImageMenu.astro`), which POSTs a multipart `file` to `POST /api/admin/images` (`src/lib/uploads.ts`: size-capped, saved to `data/uploads/` under a generated filename). Uploads are served at `/media/*` by `src/pages/media/[...path].ts` — from `data/`, not `public/`, so they work without a rebuild. A pasted external image URL also still works. `/public/uploads` and `/public/product` hold manually-seeded fixture images checked into the repo, not anything the app wrote.

---

## 13. Environment variables

```bash
# .env — see .env.example
BLOC_APPID=                 # bloc OAuth app client id
OAUTH_CLIENT_SECRET=        # bloc OAuth app client secret
REDIRECT_URL=http://localhost:4321/   # app's own base URL; joined with the fixed bloc callback path
AUTH_SECRET=                 # auth-astro session encryption key — openssl rand -base64 32
ADMIN_USER_IDS=              # comma-separated bloc user ids — temporary role allowlist, see §8
BOARD_USER_IDS=              # comma-separated bloc user ids
MODERATOR_USER_IDS=          # comma-separated bloc user ids
```

---

## 14. Deployment (single VPS)

SQLite requires a persistent filesystem — deploy to a plain VPS, not a serverless platform.

```bash
npm run build

npm install -g pm2
pm2 start dist/server/entry.mjs --name rental-shop
pm2 save
```

```nginx
# /etc/nginx/sites-available/rental-shop
server {
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:4321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
certbot --nginx -d yourdomain.com
```

Daily database backup:

```bash
# crontab -e
0 3 * * * sqlite3 /path/to/data/rental.db ".backup /backups/rental-$(date +\%F).db"
```

Admin-uploaded images live in `data/uploads/` (§12). Back that directory up alongside the database, e.g. `rsync -a /path/to/data/uploads/ /backups/uploads/`.

---

## 15. Auth provider notes

Unlike a generic named Auth.js provider, bloc isn't swappable by changing an import — it's a hand-rolled `OAuthConfig` (§7) built against bloc's specific endpoints and response shape (`account/listmypages`, `profileTypeId` person-profile selection, etc.). Moving to a different identity provider means writing a new config in that shape, not a one-line change in `src/auth.ts`.

---

## 16. Checklist before go-live

- [ ] Set `BLOC_APPID`, `OAUTH_CLIENT_SECRET`, `REDIRECT_URL`, `AUTH_SECRET` in production env
- [ ] Register the production callback URL (`<REDIRECT_URL>api/auth/callback/bloc`) with bloc
- [ ] Set `ADMIN_USER_IDS` / `BOARD_USER_IDS` / `MODERATOR_USER_IDS` for the real production bloc user ids
- [ ] Ensure `data/` is writable by the Node process
- [ ] Set up daily SQLite backups
- [ ] Enable HTTPS via Certbot
- [ ] Test on mobile at 375px: catalogue grid, product detail, cart, reservation form, checkout form
