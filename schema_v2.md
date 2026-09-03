# Schema v2
This is a user written document that explains how the new db schema should function.

First, we need to make some terminology that we will use from now on. Please make sure that CLAUDE.md and other files are edited to reflect this, such that all agents use this terminology from now on.

## Products and items
A *product* is a sort of like a category of *items*. For example, a dragon cam is a product, and the dragon cam #1 is an item.

If the Edelrid Harness comes in red, blue and green, as well as sizes S, M and L, then a green Edelrid Harness in M is one item, such that the list of all Edelrid Harnesses looks as such:
- Red S
- Red M
- Red L
- Blue S
- Blue M
- Blue L
- Green S
- Green M
- Green L

In other words, items are each individual permuatation of the different options we can choose from within one product. The logic of how all this works will come soon.

But why?

## The add product page
In the future we want to hand this platform off to less tech savvy people, so we are going to make an "add product" page. On the add product page, an admin will first be presented with a page where they add the overarching product. They can add a title, a description, a category, and finally, options. The options menu should have a + sign to add rows, where each row is numbered AND named. 
For example each row could be size, color, and so on, where the different possible values can be added to each row, such that the final user can combine sizes and colors. The top row is row 1, and the user can drag and drop the rows to reorder.

The minimum amount of options on each row is 1, and the default row will be labeled "None" in a greyed out box, to invite the admin to enter their own value.

When this is done, the admin hits a button "Attributes ->", and is taken to the next page, an "Assign attributes" page which is generated from the input of the last page. Suppose the user made a product "cardboard box" with two option rows on the last page, one for color, and one for size. It is logical that the color does not modify the weight of the box. The interface will look like this. The admin fills out a list of attributes that color modifies. In this case the only logical attribute is color, so then the admin adds "color" as an attribute.
So logically after this, the admin wants to make attributes that size modifies. Since the size of a cardboard box would change it's dimensions and it's weight, we add them as attributes.

When this is done, the admin hits a button "Specifications ->" where for each attribute the respective values are set. For example, for the attribute size, the admin will set dimensions and weight for each size. This shall be formatted as two tables where for example the header would be the attributes, "dimensions" and "weight", and the rows would be the sizes.

When this is done, the admin hits a button "Display options ->" where they can set images along the axis of one attribute, and set the default to be displayed in the web shop. For example, if a t-shirt comes in red, green, and blue, then the admin can add one image for each color. There is also a "Default" checkbox where only one of the options red, green, or blue can be checked, such that this is the default displayed for this product on the web shop, and the default option chosen on the product page.

### Draft and publish
A product is created as a draft the moment the admin starts the wizard, and is written to the database incrementally as each step (Options, Attributes, Specifications, Display options) is completed — not only once the whole wizard is finished. Concretely:

- A "Save draft" button is always visible on every step of the wizard, letting the admin stop and resume later without losing progress.
- A product, and the items generated for it, stay in `draft` status until the admin explicitly publishes from the final step. Draft products and items are never shown in the web shop.
- If one or more draft (incomplete) products exist when an admin opens the add product screen, a notice/dialog is shown at the top: "There are incomplete products, do you want to continue adding them?", letting the admin resume any of them from wherever they left off.

### Logic
For the logic, we want the products table to simply be copies of the default items set for each product. So, if the default for t-shirt is the red t-shirt, then the product "t-shirt" is simply some link to the red t-shirt, where the options to choose other colors and sizes are displayed. Note that if the user clicks the t-shirt product we want to prefetch all the items under that product such that it is snappy when the user chooses the other options on the product page.


## Schema
Thus we want the schema to include two tables: products, and items. When a user submits a rental, they are always renting items, and not products. Products are simply there to categorize items, and to make the web shop more intuitive and viewable.

Most of what the wizard collects — option rows/values, which options modify which attributes, per-value display images — gets its own table, so each wizard step maps directly onto a table. `products` and `items` sit at the center of that as described above. The one deliberate exception is spec *values* (the Specifications step's actual "Weight: 2.4kg" data): those are stored flat, directly on each generated item, rather than normalized against option values — see `items.itemAttributes` below for why.

This also carries forward the parts of the existing (v1) schema (`src/db/schema.ts` on `main`) that aren't being reworked: `categories`, `users`, and `orders`/`orderItems` (rentals), including the moderator-accountability fields, random `orderCode`, check constraints, FK indexes, and soft-delete-via-`archived` pattern already established there — see `schema_fixes.md` for the reasoning behind those. It also folds in the `reservedFrom`/`reservedTo` booking-window columns prototyped on the (unmerged) `navbar-homepage` worktree, since date-range availability is a natural next step once items exist. That same worktree prototyped `itemOptionGroups`/`itemOptionValues` to model variants directly on a single item — this rework supersedes that approach with the products/items split described above, so those two tables are dropped rather than carried forward.

```typescript
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Categories (unchanged from v1)
// ---------------------------------------------------------------------------

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

// ---------------------------------------------------------------------------
// Products — the category-level listing, built by the add product wizard.
// A product is a draft until published; draft products/items are hidden
// from the web shop. Deliberately never references `items` — the only
// items->product lookups in this app are admin/moderator-side (see Work
// notes below), so the relationship stays one-way, and the exact default
// item is found via `items.isDefault` below, not from here.
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  // Copied from the default item's option value (see productOptionValues
  // below) whenever the admin (re)sets the default, purely so the catalog
  // listing page can render a thumbnail without joining out to items. Not
  // a source of truth — items.isDefault is — just a cache for display.
  thumbnailImageUrl: text('thumbnail_image_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('products_category_id_idx').on(table.categoryId),
  index('products_status_idx').on(table.status),
]);

// External links per product (e.g. manufacturer page, manual PDF) — moved
// up from item to product level, since these describe the product as a
// whole rather than one specific color/size permutation.
export const productLinks = sqliteTable('product_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
}, (table) => [
  index('product_links_product_id_idx').on(table.productId),
]);

// ---------------------------------------------------------------------------
// Option rows/values — "Add product" page, step 1. A row ("group") is e.g.
// Size or Color; its values are e.g. S/M/L or Red/Blue/Green. Draggable
// reordering is `sortOrder`. Minimum one group with one value ("None") per
// product, enforced at the application layer.
// ---------------------------------------------------------------------------

export const productOptionGroups = sqliteTable('product_option_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g. "Size", "Color"
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('product_option_groups_product_id_idx').on(table.productId),
]);

export const productOptionValues = sqliteTable('product_option_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => productOptionGroups.id, { onDelete: 'cascade' }),
  label: text('label').notNull(), // e.g. "M", "Red"
  sortOrder: integer('sort_order').notNull().default(0),
  // Assigned once at creation, sequentially across the WHOLE product (not
  // reset per group, not tied to sortOrder — must stay stable even if the
  // admin drag-reorders rows/values later). Used only to compute
  // items.permutationKey below: an item's key is the bitwise OR of the
  // bitPosition of each of its selected values, giving a single-column
  // uniqueness check for "this exact combination already exists" without
  // joining through itemOptionSelections. Caps a product at 64 total
  // option values across all its groups (SQLite integers are 64-bit) —
  // fine for realistic product option counts, but worth a comment here.
  bitPosition: integer('bit_position').notNull(),
  // Display options step: only meaningful for the group chosen as the
  // display axis. Only one value per product may have isDefault = true —
  // enforced at the application layer (no cheap partial-unique way to
  // scope this to "one per product" in SQLite across a whole group tree).
  imageUrl: text('image_url'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('product_option_values_group_id_idx').on(table.groupId),
]);

// ---------------------------------------------------------------------------
// Attributes — "Assign attributes" page, step 2. Each attribute belongs to
// the option group that modifies it (e.g. "Dimensions" and "Weight" belong
// to "Size"; a group with no attributes doesn't affect specs at all).
// ---------------------------------------------------------------------------

// Wizard metadata only — NOT where spec values live (see items.itemAttributes
// below for that). This just remembers "Size affects Dimensions and Weight"
// so a resumed draft can re-render the Specifications step correctly, and
// so the "add to existing product" flow (see Work notes) knows what fields
// to prompt for when a new value is added to an existing group later.
export const productAttributes = sqliteTable('product_attributes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => productOptionGroups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g. "Dimensions", "Weight"
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('product_attributes_group_id_idx').on(table.groupId),
]);

// ---------------------------------------------------------------------------
// Items — one row per permutation of option values (what rentals actually
// reference). Generated from a product's option groups; draft while the
// owning product is a draft (or individually, if a new item is added to an
// already-published product).
// ---------------------------------------------------------------------------

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  stockCount: integer('stock_count').notNull().default(1),
  // Soft delete, as in v1: items referenced by orderItems can't be hard-deleted.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  // The item shown/prefetched-into when a user opens the product page, and
  // pre-selected in the option pickers. Exactly one true per product —
  // enforced at the application layer, same as productOptionValues.isDefault
  // below (SQLite has no cheap partial-unique way to scope this per product
  // across a whole items table).
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  // Bitwise OR of productOptionValues.bitPosition for every value selected
  // on this item (see itemOptionSelections below) — a denormalized cache
  // of the combination, computed by the app when the item is created, that
  // exists solely so the unique index below can catch a duplicate
  // permutation atomically. Not a source of truth: itemOptionSelections is.
  permutationKey: integer('permutation_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('items_product_id_idx').on(table.productId),
  index('items_status_idx').on(table.status),
  // The actual fix for "two items with the same combination of option
  // values": insert attempts a row with this pair, and SQLite atomically
  // rejects a duplicate — no existence-check-then-insert race window, and
  // no delay needed (SQLite is a local ACID file: a commit is visible to
  // the very next read, with no propagation lag to wait out). The
  // generation code should attempt the insert and treat a constraint
  // violation as "this combination already exists, skip it" — which also
  // makes retried/double-submitted generation requests safe by construction.
  uniqueIndex('items_product_permutation_unique').on(table.productId, table.permutationKey),
]);

// Flexible key/value specs, stored directly on the item (e.g. "Weight" ->
// "2.4 kg") — revives the same flat pattern v1 used, just scoped under the
// new items table. Deliberately flat rather than normalized through
// productAttributes/option values: reading a fully-resolved item is one
// lookup instead of two joins, and specs rarely need cross-item filtering
// (nothing here queries "all items with weight > X"). The tradeoff is
// duplication — e.g. Red-M and Blue-M each carry their own "Weight: 2.4kg"
// row — but keeping every colored M in sync is a rare, admin-driven,
// low-volume write (fan out to items sharing that option value when the
// Specifications step is edited), not a hot path.
export const itemAttributes = sqliteTable('item_attributes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('item_attributes_item_id_idx').on(table.itemId),
]);

// One row per option group for each item — the specific value chosen along
// that axis (e.g. item #7 -> Size group -> "M" value, Color group -> "Red"
// value). This is the source of truth for "what values does this item
// have" — items.permutationKey above is a derived cache, only for the
// uniqueness check, and must be kept in sync with these rows.
export const itemOptionSelections = sqliteTable('item_option_selections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => productOptionGroups.id, { onDelete: 'cascade' }),
  valueId: integer('value_id').notNull().references(() => productOptionValues.id, { onDelete: 'cascade' }),
}, (table) => [
  // One selected value per group per item.
  uniqueIndex('item_option_selections_item_group_unique').on(table.itemId, table.groupId),
  index('item_option_selections_value_id_idx').on(table.valueId),
]);

// ---------------------------------------------------------------------------
// Users, orders, order items — unchanged from v1, carried forward as-is.
// Rentals always reference items, never products (see top of this doc).
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // ID from external OAuth provider
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // NNNAAA format (3 digits + 3 letters, e.g. "482KXQ") — generated and
  // uniqueness-checked by generate_orderCode() (see Work notes below).
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
  // Booking-window prototype carried over from the navbar-homepage worktree.
  reservedFrom: text('reserved_from'),
  reservedTo: text('reserved_to'),
}, (table) => [
  uniqueIndex('order_items_order_item_unique').on(table.orderId, table.itemId),
  index('order_items_order_id_idx').on(table.orderId),
  check('requested_quantity_positive', sql`${table.requestedQuantity} > 0`),
  check('retrieved_quantity_non_negative', sql`${table.retrievedQuantity} IS NULL OR ${table.retrievedQuantity} >= 0`),
  check(
    'reserved_range_valid',
    sql`${table.reservedFrom} IS NULL OR ${table.reservedTo} IS NULL OR ${table.reservedTo} >= ${table.reservedFrom}`
  ),
]);

// relations() intentionally omitted here for brevity — see schema_fixes.md
// #1 for the one/many pattern to follow per FK above once this is built.
```

This is a draft for discussion, not final — no open schema questions remain at the moment (the spec-value-typing question below was resolved by removing the table it was about).

We're also deliberately assuming no concurrent edits to the same draft product (e.g. two admins, or two tabs, editing the same draft at once) — not handled, not planned for. This is an accepted simplification for a small internal admin tool, not an oversight; worth revisiting if the assumption stops holding.

**Resolved:** `products.defaultItemId` is gone. Its circular FK was checked end-to-end first (TypeScript compile under this repo's strict tsconfig, `drizzle-kit generate`, and applying the generated migration against a real SQLite db with `foreign_keys = ON`) and confirmed fixable with an `AnySQLiteColumn` return-type annotation — but rather than keep that fix, `products` was changed to never reference `items` at all, since the only items->product lookups in this app are admin/moderator-side (rendering an order line's product title, see the order-review discussion) and the customer-facing catalog/product-page direction only ever needs product->items. The default item is now found via `items.isDefault` (indexed by the existing `items.productId`), and `products.thumbnailImageUrl` is a plain (non-FK) copy of the default item's image, refreshed whenever the admin (re)sets the default, purely so the catalog listing page can render without joining out to items at all.

**Resolved:** Item-permutation uniqueness now has a real DB-level check: `productOptionValues.bitPosition` + `items.permutationKey` + a `UNIQUE(productId, permutationKey)` index (verified end-to-end — generated migration applied to a real SQLite db, confirmed it rejects a duplicate permutation on the same product and correctly allows the same key on a different product). The generation code should attempt the insert and treat a unique-constraint violation as "already exists, skip" rather than checking-then-inserting — this also makes retried/double-submitted requests safe without needing any artificial delay (SQLite has no propagation lag to wait out; a commit is visible to the very next read).

**Resolved:** `productOptionValueSpecs` is gone — no filtering/sorting by spec value is needed, so the normalized (option value × attribute) table was replaced with `items.itemAttributes`, a flat key/value table per item (reviving the same pattern v1 used for `itemAttributes`, just under the new items). Specs now live directly on each item rather than being derived through `itemOptionSelections` + a shared value table: fully resolving an item is one lookup instead of two joins, which is both simpler for future developers and faster for the doc's "prefetch all items, snappy" requirement. `productAttributes` (which attributes a group affects) still persists, but purely as wizard metadata — for resuming a draft at the Specifications step and for the "add to existing product" flow to know what fields to prompt for — not as a place values are stored. The tradeoff is that editing a shared spec (e.g. correcting M's weight) means fanning the write out to every item that has Size=M, rather than editing one row; accepted as a rare, low-volume, admin-driven write, not a hot path.

# Work notes
Agents: only append new entries below this line. Do not edit or remove anything above it.

## Work item: `generate_orderCode()`
`orders.orderCode` format is changing from 6 random alphanumeric characters to a fixed `NNNAAA` pattern — 3 digits (`N`) followed by 3 letters (`A`), e.g. `482KXQ`.

Add a `generate_orderCode()` function, called when a new order is submitted, that:
- Generates a candidate code in `NNNAAA` format.
- Queries `orders` for an existing row with that `orderCode`.
- If a match exists, generates a new candidate and checks again (retry loop) until a unique code is produced, then returns it.

Open question carried over from the original orderCode design rationale: should the letter portion exclude visually-ambiguous characters (e.g. `I`/`O`) since the code is read aloud to moderators at pickup? Not decided yet — flag for follow-up before implementing.

## Work item: "Add to existing product" workflow
The add-product wizard needs a way to add new option values (e.g. a new size or color) to a product that already exists, not just create brand-new products — e.g. adding yellow boxes to an existing "Boxes" product.

- The first screen of the add-product flow shows a list of existing products alongside an "Add new product ->" button.
- Selecting an existing product jumps into the same wizard (Options / Attributes / Specifications / Display options), pre-populated with that product's current option groups/values/attributes, scoped to adding new value(s) rather than starting from scratch.
- On submit, only the new permutations introduced by the added value(s) are generated (existing items are untouched) — generation uses the attempt-insert-and-catch pattern described above (`items_product_permutation_unique`), so this is safe even if the request is retried.

## Work item: Draft expiry sweep
Abandoned drafts (a product an admin started but never finished/published) shouldn't accumulate forever.

- When an admin opens the add-product screen, check for `products` rows where `status = 'draft' AND updatedAt < (now - 7 days)` and delete them.
- Use `updatedAt`, not `createdAt` — an admin slowly working an old-but-still-active draft shouldn't have it wiped out from under them; only genuinely stale (untouched) drafts should go.
- No cascade logic needed beyond what's already in the schema: deleting a draft `products` row cascades through `productOptionGroups` -> `productOptionValues`/`productAttributes` -> `productOptionValueSpecs`, and through `items` -> `itemOptionSelections`, via the existing `onDelete: 'cascade'` FKs.
- This is a lazy, on-access sweep (checked when the page loads), not a background job — acceptable given this assumes no concurrent admins (see the concurrency assumption noted above) and the low stakes of a draft sitting a bit past 7 days if nobody opens that page.
