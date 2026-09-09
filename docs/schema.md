# Schema v3

This supersedes `schema_v2.md` and `schemav2.ts` (both deleted). Schema v2
was designed around an admin wizard that generated items as systematic
permutations of product option values (Size × Color, etc.), driven by an
Options → Attributes → Specifications → Display-options flow. That wizard no
longer exists — see `docs/wizard.md` for the wizard that replaced it,
which was already partly built (`src/components/wizard/`,
`src/pages/wizard-test.astro`) by the time this schema was designed against
it.

Terminology (product/item) is unchanged from `AGENTS.md` — a product is a
category-level listing; an item is one specific thing that gets rented.
What's new here relative to that terminology note:

- **Sub-category**: a product can additionally be classified one level below
  its category, e.g. category "Protection" → sub-category "Cams".
- Under the dynamic wizard, an admin creates items freeform first (just a
  name, an optional image, a stock count) and assigns them to a product
  afterward — or never. Everything classification/description-shaped about
  an item — category, sub-category, description, attributes — is inherited
  from whichever product it's assigned to, not set on the item itself.
  Unassigned items have none of this to show.

## Schema

```ts
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Categories (unchanged from v1/v2)
// ---------------------------------------------------------------------------

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

// ---------------------------------------------------------------------------
// Sub-categories — one level deep, scoped under a category (e.g.
// Protection -> Cams). Slug uniqueness is per-parent category, not global,
// so two different categories can each have their own "Cams" sub-category
// without colliding.
// ---------------------------------------------------------------------------

export const subcategories = sqliteTable('subcategories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  uniqueIndex('subcategories_category_slug_unique').on(table.categoryId, table.slug),
  index('subcategories_category_id_idx').on(table.categoryId),
]);

// ---------------------------------------------------------------------------
// Products — the category-level listing. Deliberately never references
// `items` (carried forward from v2's resolved design): the only
// items->product lookups this app needs are admin/moderator-side, and the
// customer-facing direction only ever needs product->items, which is
// queried directly (`where items.productId = X`) rather than through a
// column on products. A product keeps both categoryId and subcategoryId,
// so it can be classified broadly (just "Protection") or precisely
// ("Protection" -> "Cams").
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  subcategoryId: integer('subcategory_id').references(() => subcategories.id),
  // Renamed from v2's draft/published. "Hidden" is a deliberate, permanent
  // admin choice — the product stays fully visible/manageable in the
  // admin and moderator views, it just isn't shown in the web shop. Unlike
  // v2's "draft", it does not imply an incomplete or abandoned product.
  // See "Open question" below re: what this means for the old
  // draft-expiry sweep.
  status: text('status', { enum: ['hidden', 'published'] }).notNull().default('hidden'),
  thumbnailImageUrl: text('thumbnail_image_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('products_category_id_idx').on(table.categoryId),
  index('products_subcategory_id_idx').on(table.subcategoryId),
  index('products_status_idx').on(table.status),
]);

// External links per product (e.g. manufacturer page, manual PDF) — unchanged from v2.
export const productLinks = sqliteTable('product_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
}, (table) => [
  index('product_links_product_id_idx').on(table.productId),
]);

// ---------------------------------------------------------------------------
// Attribute keys — the TEMPLATE. The field names every item under this
// product will have (e.g. "Weight", "Minimum Breaking Strength", "Length").
// No values live here; each item owns its own value for each key it has
// (see itemAttributeValues below). All items under one product share the
// same set of keys, but not the same values — e.g. every "Rain Jacket" item
// has a "Weight" field, but a size S item and a size M item hold different
// numbers for it.
// ---------------------------------------------------------------------------

export const productAttributeKeys = sqliteTable('product_attribute_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  uniqueIndex('product_attribute_keys_product_name_unique').on(table.productId, table.name),
  index('product_attribute_keys_product_id_idx').on(table.productId),
]);

// ---------------------------------------------------------------------------
// Items — created freeform by an admin (name, optional image, stock),
// optionally assigned to a product afterward via "Set product". Nothing
// here is generated from option permutations anymore (v2's
// productOptionGroups/productOptionValues/itemOptionSelections and the
// bitmask permutation-uniqueness check are all dropped — see below).
// ---------------------------------------------------------------------------

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Nullable: an item can exist unassigned — the wizard's whole premise is
  // creating items before (or instead of) assigning them to a product.
  // onDelete is 'set null', not 'cascade': deleting a product must never
  // delete items. Unlike v2 (where items only existed as a product's
  // generated permutations and had no independent value), items here are
  // real inventory that may already be referenced by past orders.
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  // Internal/admin-only label (e.g. "Blue Rain Jacket, size M") — never
  // shown to end customers. The customer-facing product page reads from
  // the product (title/description) and the item's attribute values, not
  // from this field.
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  // Total owned. "In stock right now" is never stored — it's always
  // computed as stockCount minus quantities on currently active/requested
  // rentals, same derivation already established for the old `available`
  // boolean (see the original docs/schema-legacy-fixes.md decision, carried forward
  // unchanged): a stored second number can only drift out of sync.
  stockCount: integer('stock_count').notNull().default(1),
  // Soft delete: items referenced by orderItems can't be hard-deleted.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('items_product_id_idx').on(table.productId),
]);

// ---------------------------------------------------------------------------
// Attribute values — items own these directly (plain FKs; no cross-product
// enforcement trick — see "Resolved" below for why one was considered and
// dropped). unique(itemId, attributeId) guarantees one value per key per
// item, and attributeId must reference a real productAttributeKeys row, so
// an item can never accumulate more distinct values than its assigned
// product currently has keys. Rows are never shared between items — itemId
// is a plain FK, so two items under the same product each get their own
// private row for "Weight", even though the key is shared via the template.
//
// Not DB-enforced: that a row's attributeId belongs to the same product the
// item is *currently* assigned to. If an item is reassigned, its old rows
// (tied to the old product's keys) go stale unless the reassignment logic
// explicitly clears them first — see Work notes below.
// ---------------------------------------------------------------------------

export const itemAttributeValues = sqliteTable('item_attribute_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  attributeId: integer('attribute_id').notNull().references(() => productAttributeKeys.id, { onDelete: 'cascade' }),
  value: text('value').notNull().default(''),
}, (table) => [
  uniqueIndex('item_attribute_values_item_attribute_unique').on(table.itemId, table.attributeId),
  index('item_attribute_values_item_id_idx').on(table.itemId),
  index('item_attribute_values_attribute_id_idx').on(table.attributeId),
]);

// ---------------------------------------------------------------------------
// Users, orders, order items — unchanged from v1/v2. Rentals always
// reference items, never products.
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // ID from external OAuth provider
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderCode: text('order_code').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['requested', 'active', 'returned', 'rejected'],
  }).notNull().default('requested'),
  note: text('note'),
  confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
  returnedByUserId: text('returned_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  activatedAt: integer('activated_at', { mode: 'timestamp' }),
  returnedAt: integer('returned_at', { mode: 'timestamp' }),
  rejectedAt: integer('rejected_at', { mode: 'timestamp' }),
  rejectedReason: text('rejected_reason'),
}, (table) => [
  index('orders_user_id_idx').on(table.userId),
  index('orders_status_idx').on(table.status),
]);

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  requestedQuantity: integer('requested_quantity').notNull().default(1),
  retrievedQuantity: integer('retrieved_quantity'),
  reservedFrom: text('reserved_from'),
  reservedTo: text('reserved_to'),
}, (table) => [
  uniqueIndex('order_items_order_item_unique').on(table.orderId, table.itemId),
  index('order_items_order_id_idx').on(table.orderId),
]);

// relations() intentionally omitted here for brevity — see the Relations
// section below for the one/many pattern to follow per FK above.
```

### Dropped entirely (relative to `schemav2.ts`)

- `productOptionGroups`, `productOptionValues`, `itemOptionSelections`
- `items.permutationKey`, `items.isDefault`, `items.status`
- `productOptionValues.bitPosition` and the `items_product_permutation_unique` index
- The `types` table that `docs/wizard.md`'s original handoff asked for —
  the wizard's own most recent commit removed the per-item Type concept in
  favor of product-inherited category/sub-category, so a types table is no
  longer needed at all.

None of the dropped machinery is used by anything the dynamic wizard builds.
If a customer-facing variant picker (swatches for size/color) is wanted
later, design it against whatever the storefront actually needs then —
don't resurrect this.

### Relations

- `categoriesRelations`: many `subcategories`, many `products`
- `subcategoriesRelations`: one `category`, many `products`
- `productsRelations`: one `category`, one `subcategory`, many `productLinks`,
  many `productAttributeKeys`, and — a Drizzle-only convenience relation,
  with no real FK column on `products`, same pattern as `usersRelations`'
  `many(orders)` — many `items`
- `productLinksRelations`: one `product`
- `productAttributeKeysRelations`: one `product`, many `itemAttributeValues`
- `itemsRelations`: one `product`, many `itemAttributeValues`, many `orderItems`
- `itemAttributeValuesRelations`: one `item`, one `attribute` (→ `productAttributeKeys`)
- `usersRelations`, `ordersRelations`, `orderItemsRelations`: unchanged from v2

## Resolved

**Sub-categories** are a dedicated table (`subcategories`, FK to
`categories`), one level deep — not a self-referencing `parentId` on
`categories`. This matches this schema's existing convention of dedicated
child tables (e.g. `productOptionGroups`→`productOptionValues` in v2) rather
than a recursive structure, and the requirement as stated (Protection →
Cams) only ever needs one level. `products` keeps both `categoryId` and
`subcategoryId` rather than dropping the former in favor of deriving it
through a join, so a product can be classified at either granularity.

**Attributes are a template/value split**, not purely product-level and not
purely item-level. The set of field *names* (`productAttributeKeys`) is
defined once per product and shared by every item assigned to it; each item
stores its *own value* for each field (`itemAttributeValues`). This was
confirmed against the wizard's own mock data before this was finalized: two
items under the same "Rain Jacket" product share the keys Material/
Waterproof rating/Weight but hold different Weight values (420g vs 450g).

A composite-foreign-key mechanism was drafted at one point to make SQLite
itself enforce that an `itemAttributeValues` row's key always belongs to the
product the item is *currently* assigned to (denormalizing `productId` onto
`itemAttributeValues` and using two composite FKs, one with `ON UPDATE
CASCADE`, so reassigning an item's product without first clearing its old
attribute values would fail the transaction outright). This was considered
and dropped: items own their attribute values directly via plain FKs, and
keeping them consistent across a reassignment is the application's job (see
Work notes below), not something this schema enforces at the DB level.

**Product status** is `hidden`/`published`, not `draft`/`published`.
"Hidden" is a deliberate, permanent state (fully visible/manageable in
admin/moderator views, just excluded from the web shop) — see "Open
question" for what this means for the old draft-expiry sweep.

## Open question

The `hidden`/`published` rename removes the concept v2's "draft-expiry
sweep" Work note was built on (auto-delete a `draft` product untouched for 7
days, on the theory that it's an abandoned work-in-progress). A `hidden`
product is a deliberate, permanent admin choice, not something abandoned —
auto-deleting it after a week would delete a product the admin *intended* to
keep hidden indefinitely. Recommendation: drop that sweep entirely rather
than port it to `hidden`. Not deciding this silently — if there's still a
real "abandoned half-built product" scenario worth cleaning up under the new
wizard (e.g. a product created but never given a title), that's a different
check than "hidden," and would need its own definition.

# Work notes
Agents: only append new entries below this line. Do not edit or remove anything above it.

## Work item: "Set product" reassignment must keep attribute values consistent
Assigning or reassigning an item to a product (the wizard's "Set product"
action) should, as one transaction:
1. Delete the item's existing `itemAttributeValues` rows (they belong to the
   old product's template, if any).
2. Update `items.productId`.
3. Insert a stub row (`value: ''`) for every `productAttributeKeys` row of
   the new product, so the admin has fields ready to fill in.

Nothing in the DB forces this ordering (see "Resolved" above) — it's the
application's responsibility to keep this consistent.

## Work item: fan out new template fields to existing items
When a new `productAttributeKeys` row is added to a product that already has
assigned items, fan out a stub `itemAttributeValues` row (`value: ''`) to
every one of those existing items for the new field.

## Work item: UI cue for a product with no attribute template yet
Show a small red hint next to an item's Details-expand button when its
product currently has zero `productAttributeKeys` rows (nothing to
inherit) — this is common right after a reassignment, before the admin has
defined any fields. Prompts the admin to add attribute keys.

## Work item: attribute editing entry points
Attribute keys/values can be added or edited directly from an individual
item's Details expand box — single-item only.

Bulk editing is a separate entry point: a "Set attributes" button under the
Set dropdown, acting on all currently-selected items at once. It opens a
pop-up for entering key/value pairs, applied to every selected item on save.
Before showing that pop-up, check whether all selected items share the same
attribute template (i.e. the same product) — if they don't, show a warning
in the pop-up instead and disable every control except Cancel/Close.

## Work item: bulk "auto-generate names"
`items.name` is purely an internal admin label, never customer-facing — a
reasonable candidate for a future optional bulk action, reachable from the
Set dropdown, that generates names automatically (e.g. from product title +
attribute values) instead of always typing them by hand. Not building this
now, just recording the idea.

## Work item: item slug generation
`items.slug` must be derived from `name` at save time (slugify +
disambiguate on collision) — there's no combinatorial product+option naming
to derive it from anymore, since items are named freeform.
