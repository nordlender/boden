import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  stockCount: integer('stock_count').notNull().default(1),
  // Soft delete: items that have ever been ordered can't be hard-deleted
  // (orderItems.itemId references them), so "removing" an item archives it.
  // Availability is derived (stockCount minus active-rental quantities), not stored.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Flexible key/value attributes per item (e.g. "Weight" → "2.4 kg")
export const itemAttributes = sqliteTable('item_attributes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('item_attributes_item_id_idx').on(table.itemId),
]);

// External links per item (e.g. manufacturer page, manual PDF)
export const itemLinks = sqliteTable('item_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
}, (table) => [
  index('item_links_item_id_idx').on(table.itemId),
]);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // ID from external OAuth provider
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
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['requested', 'active', 'returned', 'rejected'],
  }).notNull().default('requested'),
  note: text('note'), // optional note from member at checkout
  // Moderator accountability: who confirmed retrieval / processed the return
  confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
  returnedByUserId: text('returned_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  activatedAt: integer('activated_at', { mode: 'timestamp' }), // set when moderator confirms
  returnedAt: integer('returned_at', { mode: 'timestamp' }), // set when moderator marks returned
  rejectedAt: integer('rejected_at', { mode: 'timestamp' }), // set when moderator rejects
  rejectedReason: text('rejected_reason'), // set when moderator rejects
  // TODO: dueAt (rental due date) — not yet confirmed, see schema_fixes.md #9
}, (table) => [
  index('orders_user_id_idx').on(table.userId),
  index('orders_status_idx').on(table.status),
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

export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(categories, {
    fields: [items.categoryId],
    references: [categories.id],
  }),
  attributes: many(itemAttributes),
  links: many(itemLinks),
  orderItems: many(orderItems),
}));

export const itemAttributesRelations = relations(itemAttributes, ({ one }) => ({
  item: one(items, {
    fields: [itemAttributes.itemId],
    references: [items.id],
  }),
}));

export const itemLinksRelations = relations(itemLinks, ({ one }) => ({
  item: one(items, {
    fields: [itemLinks.itemId],
    references: [items.id],
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
