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
// Protection -> Cams). Slug uniqueness is per-parent category, not global —
// see docs/schema.md "Resolved" for why this is a dedicated table rather than
// a self-referencing parentId on categories.
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
// `items` (carried forward from v2): the only items->product lookups this
// app needs are admin/moderator-side; the customer-facing direction only
// ever needs product->items, queried directly rather than via a column on
// products. Keeps both categoryId and subcategoryId, so a product can be
// classified broadly (just "Protection") or precisely ("Protection" ->
// "Cams").
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  subcategoryId: integer('subcategory_id').references(() => subcategories.id),
  // "Hidden" (not v2's "draft") is a deliberate, permanent admin choice —
  // still fully visible/manageable in admin/moderator views, just excluded
  // from the web shop. See docs/schema.md "Open question" re: the
  // draft-expiry sweep this replaces the meaning of.
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
// (see itemAttributeValues below).
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
// here is generated from option permutations anymore — v2's
// productOptionGroups/productOptionValues/itemOptionSelections and the
// bitmask permutation-uniqueness check are all dropped.
// ---------------------------------------------------------------------------

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Nullable: an item can exist unassigned. onDelete 'set null' (not
  // 'cascade'): deleting a product must never delete items — they're real
  // inventory, possibly already referenced by past orders.
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  // Internal/admin-only label (e.g. "Blue Rain Jacket, size M") — never
  // shown to end customers.
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  // Total owned. "In stock right now" is never stored — always computed as
  // stockCount minus quantities on currently active/requested rentals.
  stockCount: integer('stock_count').notNull().default(1),
  // Soft delete: items referenced by orderItems can't be hard-deleted.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('items_product_id_idx').on(table.productId),
]);

// ---------------------------------------------------------------------------
// Attribute values — items own these directly (plain FKs; no cross-product
// enforcement trick, see docs/schema.md "Resolved"). unique(itemId,
// attributeId) guarantees one value per key per item, and attributeId must
// reference a real productAttributeKeys row, so an item can never
// accumulate more distinct values than its assigned product currently has
// keys. Rows are never shared between items — itemId is a plain FK, so two
// items under the same product each get their own private row for
// "Weight", even though the key is shared via the template.
//
// Not DB-enforced: that a row's attributeId belongs to the same product the
// item is *currently* assigned to. If an item is reassigned, its old rows
// go stale unless the reassignment logic explicitly clears them first (see
// docs/schema.md Work notes: "Set product" reassignment).
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
  // NNNAAA format (3 digits + 3 letters, e.g. "482KXQ") — generated and
  // uniqueness-checked by generate_orderCode().
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
]);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
  products: many(products),
}));

export const subcategoriesRelations = relations(subcategories, ({ one, many }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [products.subcategoryId],
    references: [subcategories.id],
  }),
  links: many(productLinks),
  attributeKeys: many(productAttributeKeys),
  // Drizzle-only convenience relation — no real FK column on `products`,
  // same pattern as usersRelations' many(orders) below. The one-way design
  // (items -> products) is unchanged.
  items: many(items),
}));

export const productLinksRelations = relations(productLinks, ({ one }) => ({
  product: one(products, {
    fields: [productLinks.productId],
    references: [products.id],
  }),
}));

export const productAttributeKeysRelations = relations(productAttributeKeys, ({ one, many }) => ({
  product: one(products, {
    fields: [productAttributeKeys.productId],
    references: [products.id],
  }),
  itemValues: many(itemAttributeValues),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  product: one(products, {
    fields: [items.productId],
    references: [products.id],
  }),
  attributeValues: many(itemAttributeValues),
  orderItems: many(orderItems),
}));

export const itemAttributeValuesRelations = relations(itemAttributeValues, ({ one }) => ({
  item: one(items, {
    fields: [itemAttributeValues.itemId],
    references: [items.id],
  }),
  attribute: one(productAttributeKeys, {
    fields: [itemAttributeValues.attributeId],
    references: [productAttributeKeys.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  item: one(items, {
    fields: [orderItems.itemId],
    references: [items.id],
  }),
}));
