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
// items->product lookups in this app are admin/moderator-side (see
// schema_v2.md work notes), so the relationship stays one-way, and the
// exact default item is found via `items.isDefault` below, not from here.
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
// Rentals always reference items, never products (see top of schema_v2.md).
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
  // uniqueness-checked by generate_orderCode() (see schema_v2.md work item).
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
