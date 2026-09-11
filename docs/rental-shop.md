# Astro + SQLite rental shop — setup guide

> This is the original project spec, kept up to date with what's actually
> built (last full pass: 2026-09-11). For the authoritative schema
> rationale see [`docs/schema.md`](schema.md); for the planned
> moderator-review page see [`docs/moderator-review.md`](moderator-review.md).
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

## Stack overview

| Layer | Choice | Why |
|---|---|---|
| Framework | Astro ^7 | Static-first, zero JS by default, built-in image optimisation |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Responsive utilities, mobile-first, great for image grids |
| Database | SQLite via `better-sqlite3` | Zero-config, file-based, perfect for low traffic |
| ORM | Drizzle ORM | Type-safe, lightweight, works great with SQLite |
| Auth | `auth-astro` + `@auth/core`, custom bloc OAuth provider | Login and membership status come from [bloc](https://bloc.net) (osiklatring.no's membership backend), not a separate account system — see §7 |
| Image storage | Referenced by URL only — no upload endpoint yet | Admin pastes an image URL in the wizard; `/public/uploads` currently holds manually-seeded fixture images, not app uploads (see §12) |
| Deployment | Single VPS (e.g. Hetzner, DigitalOcean) with Node adapter | SQLite needs a persistent filesystem — no serverless |

---

## Domain model & rental flow

### Roles

| Role | What they can do |
|---|---|
| `member` | Browse catalogue, manage cart, choose reservation dates, place orders, view own order history |
| `moderator` | Everything a member can do + review/accept-reject, retrieve, confirm handoff, and mark returns **(planned — no moderator pages exist yet, see §10)** |
| `admin` | Everything a moderator can do + manage products/items via the wizard (`/admin/items`), set pickup-day availability (`/admin/pickup-days`) |

Role assignment itself is **not** an in-app admin feature today: it's a
temporary comma-separated bloc-user-id allowlist in env vars
(`ADMIN_USER_IDS` / `MODERATOR_USER_IDS`, see §8) until bloc ships a real
role endpoint.

### Order lifecycle

```
member browses catalogue, adds items to cart
  → cart lives in a cookie only — no database row yet (§5)

member goes to /reservation, picks pick-up/return dates
  → live availability check against existing requested/active orders
  → may split off a mixed-availability item into its own order
  → submits → POST /api/orders/create
  → status: requested
  → order code (6 chars, read aloud at pick-up) + checkout token
    (groups every order from one checkout, split or not) generated
  → redirected to /checkout/success?receipt=<checkoutToken>

moderator reviews order on Review Order page (before retrieval) (planned)
  → sees member bio, hasUnpaidFees / userIsMember flags, requested items
  → clicks "Accept" or "Reject"
  → status: requested (accept — unchanged, proceeds to retrieval below)
  → status: rejected  (reject — moved to archive, rejectedReason recorded)

moderator enters order number into Retrieve Order form (planned)
  → sees Moderator Order Summary (items, quantities, user bio)
  → clicks "Go to confirm"

moderator fetches items from storage (planned)
  → Confirm Order page: enters actual quantity retrieved per item
  → clicks "Confirm"
  → status: active  (rental is now live)

member returns items on-site
  → moderator marks order as returned (planned)
  → status: returned  (moved to archive)
```

Cart → reservation → order-creation is implemented today
(`src/lib/orders.ts`, `src/pages/api/orders/create.ts`). The review,
retrieve, and confirm steps are design-only — see §10.

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
│   │   ├── index.astro                      # Catalogue — static, home page
│   │   ├── products/
│   │   │   └── [slug].astro                 # Product detail: variant select, image, attributes, links — static
│   │   ├── cart.astro                       # Cart review — SSR
│   │   ├── reservation.astro                # Pick-up/return dates, availability, split-order — SSR
│   │   ├── checkout/
│   │   │   └── success.astro                # Order receipt(s) after placing — SSR
│   │   ├── admin/
│   │   │   ├── items.astro                  # Product/item wizard — SSR, admin only
│   │   │   └── pickup-days.astro            # Set which pick-up dates have moderator coverage — SSR, admin only
│   │   ├── moderator/                       # (planned — see §10; no pages exist yet)
│   │   └── auth/
│   │       └── login.astro                  # Redirect to bloc
│   │
│   ├── pages/api/
│   │   ├── cart/
│   │   │   ├── add.ts                       # POST — add item to cookie cart
│   │   │   ├── remove.ts                    # POST — remove item
│   │   │   └── update.ts                    # POST — set a line's quantity
│   │   ├── orders/
│   │   │   └── create.ts                    # POST — member places order(s), see §6
│   │   ├── reservation/
│   │   │   └── availability.ts              # POST — live availability preview for chosen dates
│   │   ├── pickup-days/
│   │   │   ├── add.ts                       # POST — admin only
│   │   │   └── remove.ts                    # POST — admin only
│   │   ├── wizard/                          # archive / attributes / attributes/bulk / items / set-product — admin only
│   │   └── debug/                           # bloc API exploration endpoints, see docs/bloc-api.md
│   │
│   ├── db/
│   │   ├── client.ts                        # SQLite connection singleton
│   │   ├── schema.ts                        # Drizzle schema — §4, full rationale in docs/schema.md
│   │   └── migrations/                      # Generated by drizzle-kit
│   │
│   ├── lib/
│   │   ├── auth.ts                          # Role gate: getRole/validateSession — §8
│   │   ├── cart.ts                          # Cart read/write (cookie-based) — §5
│   │   ├── orders.ts                        # createOrder / createSplitOrders — §6
│   │   ├── reservation.ts                   # Date-range validation + availability queries
│   │   ├── shop.ts                          # Customer-facing catalogue/product queries
│   │   ├── stock.ts                         # reservedQuantitiesByItem — "in stock now" derivation
│   │   ├── pickupDays.ts, wizard.ts, wizard-http.ts, upsertUser.ts, icons.ts, ...
│   │
│   ├── middleware/
│   │   ├── index.ts                         # Auth + role gate — §9
│   │   └── prefixes.ts                      # Route-prefix tables, unit-testable in isolation
│   │
│   ├── components/
│   │   ├── shop/                            # ItemCard, ItemGrid, ImagePlaceholder
│   │   ├── cart/                            # CartSidebar, CheckoutForm
│   │   ├── reservation/                     # ReservationForm, ReservationCalendar, ReservationItemRow
│   │   ├── orders/                          # UserOrderSummary
│   │   ├── nav/                             # Logo, NavLinks, CartButton, UserMenu, ThemeToggle
│   │   ├── wizard/                          # Admin product/item wizard, see docs/wizard.md
│   │   ├── icons/                           # AppIcon
│   │   └── ui/                              # Callout, CalloutPopover
│   │
│   └── layouts/
│       └── BaseLayout.astro                 # HTML shell, Navbar, Tailwind, slot
│
├── public/
│   ├── uploads/                             # Manually-seeded fixture item images (no upload endpoint — §12)
│   └── product/                             # Manually-seeded fixture product images
├── data/
│   └── rental.db                            # SQLite database file
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
  // Static by default (catalogue + product pages are pre-rendered at build time).
  // Every other route opts into per-request rendering with `export const prerender = false`.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [auth({ configFile: './src/auth.ts' }), icon()],
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: true }, // dev server is tunneled through a random *.loca.lt hostname
  },
});
```

`output: 'static'` is the key setting: `/` and `/products/[slug]` are pre-rendered at build time, served from disk with no database round-trip per visitor. Every other route is marked `export const prerender = false` and rendered on the server per-request.

---

## 4. Database schema

Full rationale for every design decision lives in
[`docs/schema.md`](schema.md); this is a condensed, current mirror of
`src/db/schema.ts`.

```ts
// src/db/schema.ts (condensed — see docs/schema.md for the full rationale)
import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const subcategories = sqliteTable('subcategories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),        // unique per-category, not global
  sortOrder: integer('sort_order').notNull().default(0),
});

// The category-level listing. Never references items — the customer-facing
// direction is always queried as product -> items, not a column here.
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  subcategoryId: integer('subcategory_id').references(() => subcategories.id),
  status: text('status', { enum: ['hidden', 'published'] }).notNull().default('hidden'),
  thumbnailImageUrl: text('thumbnail_image_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// External links per product (manufacturer page, manual PDF, ...)
export const productLinks = sqliteTable('product_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
});

// The attribute-key TEMPLATE (e.g. "Size", "Weight") — every item under a
// product shares these keys, but not the values (see itemAttributeValues).
export const productAttributeKeys = sqliteTable('product_attribute_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Created freeform by an admin, optionally assigned to a product afterward
// ("Set product" in the wizard). productId is nullable and onDelete:
// 'set null' — deleting a product must never delete items already
// referenced by past orders.
export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),        // internal/admin-only label — never shown to customers
  imageUrl: text('image_url'),
  stockCount: integer('stock_count').notNull().default(1),
  // "In stock right now" is never stored — always computed as stockCount
  // minus quantities on currently requested/active orders (src/lib/stock.ts).
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false), // soft delete
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// One value per (item, attributeId); attributeId must reference a real
// productAttributeKeys row, so an item can't accumulate more distinct
// values than its assigned product currently has keys.
export const itemAttributeValues = sqliteTable('item_attribute_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  attributeId: integer('attribute_id').notNull().references(() => productAttributeKeys.id, { onDelete: 'cascade' }),
  value: text('value').notNull().default(''),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),          // bloc user id
  email: text('email').notNull().unique(),
  name: text('name'),
  // Role is NOT stored here — see §8's temporary allowlist gate.
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// No `sessions` table: Auth.js manages its own signed JWT session cookie.

// One order = one rental request, potentially covering multiple items.
// A checkout that got split across dates/availability produces multiple
// order rows sharing one checkoutToken.
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderCode: text('order_code').notNull().unique(),      // 6-char code, read aloud at pick-up
  checkoutToken: text('checkout_token').notNull(),        // groups every order from one checkout submission
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status', { enum: ['requested', 'active', 'returned', 'rejected'] }).notNull().default('requested'),
  fromDate: text('from_date').notNull(),                  // YYYY-MM-DD, pick-up day
  toDate: text('to_date').notNull(),                      // YYYY-MM-DD, return day
  note: text('note'),
  confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
  returnedByUserId: text('returned_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  activatedAt: integer('activated_at', { mode: 'timestamp' }),
  returnedAt: integer('returned_at', { mode: 'timestamp' }),
  rejectedAt: integer('rejected_at', { mode: 'timestamp' }),
  rejectedReason: text('rejected_reason'),
}, (table) => [
  check('order_date_range_valid', sql`${table.toDate} >= ${table.fromDate}`),
]);

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  requestedQuantity: integer('requested_quantity').notNull().default(1),
  retrievedQuantity: integer('retrieved_quantity'),        // set by moderator at confirm step
}, (table) => [
  check('requested_quantity_positive', sql`${table.requestedQuantity} > 0`),
]);

// Which pick-up dates (orders.fromDate) have a moderator confirmed
// available. Existence of a row is the only signal — no row just means
// nobody's confirmed a moderator for that date yet.
export const pickupAvailableDays = sqliteTable('pickup_available_days', {
  date: text('date').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// relations() are defined for every table above — see src/db/schema.ts for
// the full set (categories<->subcategories<->products<->items<->
// itemAttributeValues, users<->orders<->orderItems).
```

```ts
// src/db/client.ts
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
});
```

Run migrations:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## 5. Cart (cookie-based, no database)

The cart cookie stores only `{ itemId, quantity }[]` — no database row is created until checkout. `src/lib/cart.ts` joins that against `items`/`products` on read to build a display shape (`CartItem`: product title/slug, image, attribute values, `stockCount` vs. `inStock` — the latter accounting for other requested/active orders via `src/lib/stock.ts`). Entries pointing at an item that no longer exists, is archived, or whose product is unpublished are silently dropped when reading the cart for display.

```ts
// src/lib/cart.ts (core shape)
export type CartEntry = { itemId: number; quantity: number };

export function getCart(cookies: AstroCookies): CartEntry[] { /* JSON.parse the 'cart' cookie, [] on failure */ }
export function setCart(cookies: AstroCookies, cart: CartEntry[]) { /* httpOnly, sameSite=lax, 1 week */ }
export function addToCart(cookies, itemId, quantity = 1) { /* adds to existing quantity */ }
export function updateCartQuantity(cookies, itemId, quantity) { /* sets outright; <= 0 removes the line */ }
export function removeFromCart(cookies, itemId) { /* ... */ }
export async function getCartItems(cookies): Promise<CartItem[]> { /* joins against items/products for display */ }
```

---

## 6. Reservation & checkout (implemented)

Placing an order is a three-step flow, not a single "place order" action:

1. **`/cart`** — review cart lines, adjust quantity, remove. Links to `/reservation`.
2. **`/reservation`** — pick a pick-up (`fromDate`) and return (`toDate`) date. A live `POST /api/reservation/availability` preview flags any cart line that's unavailable for the chosen range; the member may split an unavailable item into its own order (`splitItemIds`) rather than changing dates. The form also displays (read-only, from the bloc session) name/email/mobile and the `hasUnpaidFees`/`userIsMember` flags.
3. **`POST /api/orders/create`** — re-validates the date range and re-checks availability **inside the insert transaction** (the live preview is advisory only; this is the actual enforcement point, closing the race between two members submitting overlapping requests concurrently). Generates a random 6-character `orderCode` per order and one shared `checkoutToken` per submission, then redirects to `/checkout/success?receipt=<checkoutToken>`.

```ts
// src/lib/orders.ts (signatures)
export async function createOrder(input: {
  userId: string; note: string | null; cartEntries: CartEntry[]; fromDate: string; toDate: string;
}): Promise<
  | { ok: true; orderId: number; orderCode: string; checkoutToken: string }
  | { ok: false; error: 'empty_cart' }
  | { ok: false; error: 'unavailable'; unavailableItemIds: number[] }
>;

// Splits cartEntries into up to two orders (sharing one date range and one
// checkoutToken) when the member moved some items into their own order via
// the reservation page's split action.
export async function createSplitOrders(input: CreateOrderInput & { splitItemIds: number[] }): Promise<CreateSplitOrdersResult>;
```

`/checkout/success` looks orders up by `checkoutToken` (not by order code) — every order from one submission, split or not, shares a token, so a single query returns the whole group. It refuses to render if any matched order doesn't belong to the signed-in user (no enumerating another member's orders by guessing tokens).

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

No `sessions` table — Auth.js manages its own signed JWT cookie. `session.bloc.*` (mobile, `hasUnpaidFees`, `userIsMember`) is snapshotted onto the checkout form so a moderator can review it later even after the member's live session ends (see `docs/moderator-review.md`) — as of 2026-09-02, `hasUnpaidFees`/`userIsMember` currently always come back `null` from bloc (an external API defect, see `docs/bloc-api.md`), and orders don't yet persist these fields (they're read at checkout but not written to the `orders` row — the moderator-review page doesn't exist to consume them yet).

See `docs/auth-handoff.md` / `docs/auth-testing.md` / `docs/auth-work-items.md` for the full implementation history and manual test guide.

---

## 8. Role gate (temporary allowlist)

Bloc doesn't expose a role endpoint yet, so admin/moderator status is a **temporary hardcoded allowlist** of bloc user ids, not a live external lookup.

```ts
// src/lib/auth.ts
export type Role = 'admin' | 'moderator' | 'member';

const ADMIN_USER_IDS = parseIdAllowlist(import.meta.env.ADMIN_USER_IDS);       // comma-separated
const MODERATOR_USER_IDS = parseIdAllowlist(import.meta.env.MODERATOR_USER_IDS);

export async function getRole(userId: string): Promise<Role> {
  // 30s in-memory cache (size-capped, simple LRU via Map re-insertion), then:
  return ADMIN_USER_IDS.has(userId) ? 'admin' : MODERATOR_USER_IDS.has(userId) ? 'moderator' : 'member';
}

// Decodes the Auth.js JWT cookie directly via @auth/core/jwt's getToken()
// (not auth-astro's getSession(), which serves the same shape to client JS —
// this must stay server-only) and resolves the role.
export async function validateSession(request: Request): Promise<{ id: string; email: string; name: string | null; role: Role } | null>;
```

`getRole()`'s shape (`userId in, Role out, cached`) deliberately mirrors what a real `getRoleFromExternalApi(accessToken, cacheKey)` would look like, so swapping the body for a live bloc role lookup later shouldn't require touching `validateSession()` or the middleware.

---

## 9. Middleware (auth + role gate)

Matches against Astro's own resolved `ctx.routePattern` (e.g. `/moderator/orders/[id]`), not raw `ctx.url.pathname` — Astro's auth guide warns that pathname string-matching can be bypassed by a configured `base`, URL encoding, or duplicate slashes; `routePattern` has no such gap.

```ts
// src/middleware/prefixes.ts
export const MEMBER_ROUTE_PREFIXES = ['/cart', '/checkout', '/orders', '/reservation', '/api/reservation', '/api/orders'];
export const MOD_ROUTE_PREFIXES = ['/moderator'];
export const ADMIN_ROUTE_PREFIXES = ['/admin', '/api/wizard', '/api/pickup-days'];

export function matchesPrefix(routePattern: string, prefixes: string[]) {
  return prefixes.some((p) => routePattern === p || routePattern.startsWith(`${p}/`));
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
  const allProtected = [...MEMBER_ROUTE_PREFIXES, ...MOD_ROUTE_PREFIXES, ...ADMIN_ROUTE_PREFIXES];

  if (matchesPrefix(routePattern, allProtected) && !user) {
    // API callers get a plain 401 (redirecting into OAuth login would send Auth.js's
    // callback back to a POST-only route with a GET, which 404s); page routes get redirected.
    if (isApiRoute(routePattern)) return new Response('Unauthorized', { status: 401 });
    return ctx.redirect(`/auth/login?next=${encodeURIComponent(ctx.url.pathname)}`);
  }
  if (matchesPrefix(routePattern, MOD_ROUTE_PREFIXES) && user?.role === 'member') return new Response('Forbidden', { status: 403 });
  if (matchesPrefix(routePattern, ADMIN_ROUTE_PREFIXES) && user?.role !== 'admin') return new Response('Forbidden', { status: 403 });
  return next();
});
```

`/api/wizard/*`, `/api/pickup-days/*`, `/api/reservation`, and `/api/orders` are each listed here **and** re-implement their own inline role/auth check — this middleware gate is defense-in-depth for those routes, not their only protection.

```ts
// src/env.d.ts
declare namespace App {
  interface Locals {
    user: { id: string; email: string; name: string | null; role: Role } | null;
  }
}
```

---

## 10. Moderator flow — page by page (planned, not yet built)

No `src/pages/moderator/*` routes exist yet. This documents the intended design — see `docs/moderator-review.md` for the review step's open questions (exact route not named yet, order persistence for `hasUnpaidFees`/`userIsMember` not wired).

### Step 0 — Review order (`/moderator/review/[id]`, route not finalized)

Accept or reject a requested order **before** retrieval — see the lifecycle diagram above and `docs/moderator-review.md`. Accept leaves `status: requested` unchanged; reject sets `status: rejected` and records `rejectedReason`.

### Step 1 — Retrieve order (`/moderator/retrieve`)

The moderator types in an order code. On submit the form POSTs to itself, looks up the order, and redirects to the order summary.

```astro
---
// src/pages/moderator/retrieve.astro (planned)
export const prerender = false;
// ... looks up orders.orderCode, redirects to /moderator/orders/[id]
---
```

### Step 2 — Order summary (`/moderator/orders/[id]`)

Shows the full order: member details, requested items with quantities. Button links to confirm page.

### Step 3 — Confirm retrieval (`/moderator/confirm/[id]`)

Moderator enters the actual quantity retrieved per line item (may be less than requested if stock ran short), then confirms. The API route sets `status: 'active'` and stamps `activatedAt`.

```ts
// src/pages/api/orders/confirm.ts (planned)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role === 'member') return new Response('Forbidden', { status: 403 });
  // update each order_items.retrievedQuantity, then orders.status = 'active', activatedAt = now
};
```

```ts
// src/pages/api/orders/return.ts (planned)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role === 'member') return new Response('Forbidden', { status: 403 });
  // orders.status = 'returned', returnedAt = now
};
```

---

## 11. Product detail page (static)

```astro
---
// src/pages/products/[slug].astro
// Route is "/products/[slug]", not "/items/[slug]": a slug-routable,
// customer-facing page is a product (title/description/attribute
// template), with items as its unlabeled variants underneath.
import { getPublishedProductSlugs, getShopProductBySlug } from '../../lib/shop';

export async function getStaticPaths() {
  const slugs = await getPublishedProductSlugs();
  return slugs.map((slug) => ({ params: { slug } }));
}

const product = await getShopProductBySlug(Astro.params.slug!);
if (!product) return Astro.redirect('/404');
---
<!-- variant <select> (one option per item, disabled when inStock <= 0),
     image + ImagePlaceholder fallback, attribute list, quantity input
     capped at inStock, "Add to cart" POSTing to /api/cart/add.
     A client-side <script> keeps image/stock/attributes/quantity-cap in
     sync on variant change (including a ?item=<id> preselect from an
     ItemCard link) — this page is prerendered, so there's no per-request
     server render to do it there. -->
```

---

## 12. Item images

There is currently **no upload endpoint**. The wizard's "Add item" panel takes a plain `imageUrl` text field (and products have a `thumbnailImageUrl` the same way) — an admin pastes a URL rather than uploading a file. `/public/uploads` and `/public/product` hold manually-seeded fixture images checked into the repo, not anything the app wrote. A real upload flow (`saveUploadedImage`-style, writing into `/public/uploads` with a generated filename) is a known gap, not yet built.

---

## 13. Environment variables

```bash
# .env — see .env.example
BLOC_APPID=                 # bloc OAuth app client id
OAUTH_CLIENT_SECRET=        # bloc OAuth app client secret
REDIRECT_URL=http://localhost:4321/   # app's own base URL; joined with the fixed bloc callback path
AUTH_SECRET=                 # auth-astro session encryption key — openssl rand -base64 32
ADMIN_USER_IDS=              # comma-separated bloc user ids — temporary role allowlist, see §8
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

---

## 15. Auth provider notes

Unlike a generic named Auth.js provider, bloc isn't swappable by changing an import — it's a hand-rolled `OAuthConfig` (§7) built against bloc's specific endpoints and response shape (`account/listmypages`, `profileTypeId` person-profile selection, etc.). Moving to a different identity provider means writing a new config in that shape, not a one-line change in `src/auth.ts`.

---

## 16. Checklist before go-live

- [ ] Set `BLOC_APPID`, `OAUTH_CLIENT_SECRET`, `REDIRECT_URL`, `AUTH_SECRET` in production env
- [ ] Register the production callback URL (`<REDIRECT_URL>api/auth/callback/bloc`) with bloc
- [ ] Set `ADMIN_USER_IDS` / `MODERATOR_USER_IDS` for the real production bloc user ids
- [ ] Ensure `data/` is writable by the Node process
- [ ] Set up daily SQLite backups
- [ ] Enable HTTPS via Certbot
- [ ] Build the moderator review/retrieve/confirm/return pages (§10) before relying on the full order lifecycle in production — today only cart → reservation → order creation is implemented
- [ ] Test on mobile at 375px: catalogue grid, product detail, cart, reservation form, checkout form
