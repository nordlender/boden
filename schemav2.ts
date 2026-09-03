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
// from the web shop. `defaultItemId` is set once the Display options step
// marks a default value, and is what the web shop links to/prefetches from.
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  // Set once an item exists to point to (Display options step). Nullable
  // because it can't be populated until at least one item has been
  // generated — products <-> items is a circular FK, which drizzle-kit
  // may need an explicit AnySQLiteColumn return type on to satisfy TS.
  defaultItemId: integer('default_item_id').references(() => items.id),
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

export const productAttributes = sqliteTable('product_attributes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => productOptionGroups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g. "Dimensions", "Weight"
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('product_attributes_group_id_idx').on(table.groupId),
]);

// "Specifications" page, step 3: one value per (option value, attribute)
// pair — the cell where the row is an option value (e.g. "M") and the
// column is an attribute (e.g. "Weight").
export const productOptionValueSpecs = sqliteTable('product_option_value_specs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  optionValueId: integer('option_value_id').notNull().references(() => productOptionValues.id, { onDelete: 'cascade' }),
  attributeId: integer('attribute_id').notNull().references(() => productAttributes.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
}, (table) => [
  uniqueIndex('product_option_value_specs_unique').on(table.optionValueId, table.attributeId),
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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('items_product_id_idx').on(table.productId),
  index('items_status_idx').on(table.status),
]);

// One row per option group for each item — the specific value chosen along
// that axis (e.g. item #7 -> Size group -> "M" value, Color group -> "Red"
// value). A resolved item's specs are derived by joining each selected
// value to productOptionValueSpecs, not duplicated onto the item.
export const itemOptionSelections = sqliteTable('item_option_selections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => productOptionGroups.id, { onDelete: 'cascade' }),
  valueId: integer('value_id').notNull().references(() => productOptionValues.id, { onDelete: 'cascade' }),
}, (table) => [
  // One selected value per group per item. (Uniqueness of the whole
  // permutation across an item's sibling items is an application-layer
  // check, not expressible as a single SQLite constraint here.)
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
