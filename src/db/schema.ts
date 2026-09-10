import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';

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
// `items`: the only items->product lookups this app needs are
// admin/moderator-side, and the customer-facing direction only ever needs
// product->items, queried directly (`where items.productId = X`) rather
// than through a column on products. A product keeps both categoryId and
// subcategoryId, so it can be classified broadly (just "Protection") or
// precisely ("Protection" -> "Cams").
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  subcategoryId: integer('subcategory_id').references(() => subcategories.id),
  // "Hidden" is a deliberate, permanent admin choice — the product stays
  // fully visible/manageable in admin/moderator views, it just isn't shown
  // in the web shop. It does not imply an incomplete or abandoned product
  // (see docs/schema.md's "Open question" re: the old draft-expiry sweep,
  // deliberately not ported here).
  status: text('status', { enum: ['hidden', 'published'] }).notNull().default('hidden'),
  thumbnailImageUrl: text('thumbnail_image_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('products_category_id_idx').on(table.categoryId),
  index('products_subcategory_id_idx').on(table.subcategoryId),
  index('products_status_idx').on(table.status),
]);

// External links per product (e.g. manufacturer page, manual PDF). Moved
// here from item-level (v1/v2's item_links) — a link like "manufacturer
// page" describes the product, not one specific item permutation of it.
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
// optionally assigned to a product afterward via "Set product". Category,
// sub-category, description, and attribute keys all come from the assigned
// product, not stored here.
// ---------------------------------------------------------------------------

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Nullable: an item can exist unassigned — the wizard's whole premise is
  // creating items before (or instead of) assigning them to a product.
  // onDelete is 'set null', not 'cascade': deleting a product must never
  // delete items, since they may already be referenced by past orders.
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
  // rentals (see docs/schema-legacy-fixes.md's original `available` derivation,
  // carried forward unchanged): a stored second number can only drift out
  // of sync.
  stockCount: integer('stock_count').notNull().default(1),
  // How many of stockCount an admin has manually pulled out of the rentable
  // pool right now (sent out for service/repair, or quarantined pending
  // inspection) — issue #62. Deliberately just a quantity, not a separate
  // item-level status enum: it's not timed/automated, doesn't affect order
  // history (orders/orderItems are untouched), and every availability query
  // (reservation.ts, shop.ts, cart.ts, wizard.ts) treats it exactly like
  // reserved quantity — subtracted from stockCount before anything is offered
  // as available. Only admins may change it (see /api/wizard/service.ts).
  // Cleared the same way it's set: an admin sets it back to 0.
  serviceQuantity: integer('service_quantity').notNull().default(0),
  // Soft delete: items referenced by orderItems can't be hard-deleted.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('items_product_id_idx').on(table.productId),
  check('service_quantity_bounds', sql`${table.serviceQuantity} >= 0 AND ${table.serviceQuantity} <= ${table.stockCount}`),
]);

// ---------------------------------------------------------------------------
// Attribute values — items own these directly (plain FKs; no cross-product
// enforcement at the DB level — see docs/schema.md's "Resolved" section for
// why one was drafted and then dropped in favor of application-level
// consistency, see the Work notes there). unique(itemId, attributeId)
// guarantees one value per key per item, and attributeId must reference a
// real productAttributeKeys row, so an item can never accumulate more
// distinct values than its assigned product currently has keys.
//
// Not DB-enforced: that a row's attributeId belongs to the same product the
// item is *currently* assigned to. If an item is reassigned, its old rows
// go stale unless the reassignment logic explicitly clears them first —
// see src/lib/wizard.ts's setItemProduct.
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

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // ID from external OAuth provider
  // WARNING: this UNIQUE constraint assumes bloc never reports the same
  // email for two different, both-currently-valid userIds. bloc's own API
  // does not document or enforce that (checked its OpenAPI spec — `email`
  // is a plain nullable string with no uniqueness guarantee); not observed
  // across this org's real 288-member roster as of 2026-09-06, but not
  // ruled out either. If it happens, the two accounts will perpetually
  // overwrite each other's email on alternating sign-ins — see the
  // TODO(investigate) above upsertSignedInUser in src/lib/upsertUser.ts,
  // and the tracking GitHub issue.
  email: text('email').notNull().unique(),
  name: text('name'),
  // Role is NOT stored here — it is fetched live from the external API on every request
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// No `sessions` table: Auth.js (src/auth.ts) manages its own signed JWT
// session cookie and does not use a database-backed session.

// One order = one rental request, potentially covering multiple items
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Short random alphanumeric code (6 chars, excludes ambiguous 0/O, 1/I) — this is
  // what members read aloud to moderators and what appears in the retrieve-order URL.
  orderCode: text('order_code').notNull().unique(),
  // Shared by every order created from one checkout submission (split or
  // not) — the confirmation page looks orders up by this instead of by
  // (potentially duplicated/tampered) order codes joined in a URL. Not
  // unique: two rows from the same split submission share one token by
  // design. Independently random, deliberately not derived from orderCode.
  checkoutToken: text('checkout_token').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['requested', 'active', 'returned', 'rejected'],
  }).notNull().default('requested'),
  // Reservation date range (YYYY-MM-DD, inclusive on both ends) chosen on the
  // /reservation page — the whole order (all its orderItems) shares one
  // range. fromDate is the pick-up day, toDate the return day (see
  // pickupAvailableDays below for which pick-up days have a moderator
  // confirmed available to hand out the order). Availability for a range is
  // computed from other requested/active orders whose range overlaps this
  // one — see src/lib/reservation.ts.
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  note: text('note'), // optional note from member at checkout
  // Moderator accountability: who confirmed retrieval / processed the return
  confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
  returnedByUserId: text('returned_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  activatedAt: integer('activated_at', { mode: 'timestamp' }), // set when moderator confirms
  returnedAt: integer('returned_at', { mode: 'timestamp' }), // set when moderator marks returned
  rejectedAt: integer('rejected_at', { mode: 'timestamp' }), // set when moderator rejects
  rejectedReason: text('rejected_reason'), // set when moderator rejects
  // TODO: dueAt (rental due date) — not yet confirmed, see docs/schema-legacy-fixes.md #9
}, (table) => [
  index('orders_user_id_idx').on(table.userId),
  index('orders_status_idx').on(table.status),
  index('orders_date_range_idx').on(table.fromDate, table.toDate),
  index('orders_checkout_token_idx').on(table.checkoutToken),
  check('order_date_range_valid', sql`${table.toDate} >= ${table.fromDate}`),
]);

// Line items: one row per item in an order
export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  requestedQuantity: integer('requested_quantity').notNull().default(1),
  // Set by moderator at confirm step — may differ from requested if stock was short
  retrievedQuantity: integer('retrieved_quantity'),
}, (table) => [
  uniqueIndex('order_items_order_item_unique').on(table.orderId, table.itemId),
  index('order_items_order_id_idx').on(table.orderId),
  check('requested_quantity_positive', sql`${table.requestedQuantity} > 0`),
  check('retrieved_quantity_non_negative', sql`${table.retrievedQuantity} IS NULL OR ${table.retrievedQuantity} >= 0`),
]);

// Which pick-up days (orders.fromDate) have a moderator confirmed available
// to hand out orders — maintained by an admin (see /admin/pickup-days,
// src/lib/pickupDays.ts) and expected to change often as moderator
// availability is confirmed week to week. Existence of a row is the only
// signal: a date with no row here just means nobody's confirmed a moderator
// for it yet, not that pick-up is refused — the reservation page shows it
// as "request pick up" rather than disallowing it.
export const pickupAvailableDays = sqliteTable('pickup_available_days', {
  date: text('date').primaryKey(), // YYYY-MM-DD
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

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
  // Convenience relation only — no real FK column on `products` (same
  // pattern as usersRelations' `many(orders)` below).
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
  values: many(itemAttributeValues),
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
