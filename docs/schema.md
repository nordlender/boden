# Schema v3

> The schema block below is generated from `src/db/schema.ts` — never edit
> it by hand. After changing the schema run `npm run docs:schema`; CI fails
> (`npm run docs:schema:check`) if the block is out of date. The prose around
> it is hand-written and must be kept current separately.

This supersedes `schema_v2.md` and `schemav2.ts` (both deleted). Schema v2
was designed around an admin wizard that generated items as systematic
permutations of product option values (Size × Color, etc.), driven by an
Options → Attributes → Specifications → Display-options flow. That wizard no
longer exists — see `docs/wizard.md` for the wizard that replaced it,
which was already partly built (`src/components/wizard/`) by the time this
schema was designed against it.

Terminology (product/item) is unchanged from `AGENTS.md` — a product is a
category-level listing; an item is one specific thing that gets rented.
What's new here relative to that terminology note:

- **Sub-category**: a product can additionally be classified one level below
  its category, e.g. category "Protection" → sub-category "Cams".
- Under the dynamic wizard, an admin creates items freeform first (just a
  name, and an optional image; stock is derived from its units) and assigns them to a product
  afterward — or never. Everything classification/description-shaped about
  an item — category, sub-category, description, attributes — is inherited
  from whichever product it's assigned to, not set on the item itself.
  Unassigned items have none of this to show.

## Schema

<!-- schema:start (generated from src/db/schema.ts by scripts/sync-schema-doc.mjs — do not edit by hand) -->
```ts
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
  // Admin-chosen: this key is what a shopper picks between on the product
  // page (rendered as buttons), and is left out of the displayed attribute
  // list since the picked button already shows it. A flag per key rather
  // than one product-level column so more than one variant key can be
  // supported later without a schema change; the UI currently only lets
  // the admin choose one.
  isVariant: integer('is_variant', { mode: 'boolean' }).notNull().default(false),
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
  // No stock column: how many of an item exist is the number of its
  // `units` with status 'active' (src/lib/units.ts's activeUnitCount), and
  // availability is derived per day from the orders occupying the item on
  // that day (src/lib/availability.ts). A stored count could only drift out
  // of sync with the units table.
  // Soft delete: items referenced by orderItems can't be hard-deleted.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('items_product_id_idx').on(table.productId),
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

// ---------------------------------------------------------------------------
// Units — one physical object of an item (e.g. one specific Dragon Cam #2,
// bought and manufactured at its own time), tracked individually because
// this is safety equipment: service, retirement and its lifetime history
// belong to the physical object, not to the item as a whole. Admin-only —
// rentals never see units: orderItems keep referencing items, and a
// moderator hands out "a Dragon Cam #2", not a particular unit (see #276).
//
// An item's stock is derived from these rows: count(status = 'active').
// Taking a unit out of service or retiring it shrinks availability with no
// other bookkeeping. Units are never hard-deleted — a retired unit stays as
// the record of what happened to it.
//
// A unit's lifetime log (inspections, damage, status changes) is ordinary
// `messages` rows with messages.unitId set — see that table.
// ---------------------------------------------------------------------------

export const UNIT_STATUSES = ['active', 'out_of_service', 'retired'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const units = sqliteTable('units', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // No onDelete: an item can't be hard-deleted out from under its units
  // (items are soft-deleted via `archived` anyway).
  itemId: integer('item_id').notNull().references(() => items.id),
  brand: text('brand'),
  model: text('model'),
  // Physical marking on the unit itself (engraving, tape, tag number) — how
  // an admin holding it in their hand finds its row.
  marking: text('marking'),
  serialNumber: text('serial_number'),
  manufacturedAt: text('manufactured_at'), // YYYY-MM-DD
  purchasedAt: text('purchased_at'), // YYYY-MM-DD
  status: text('status', { enum: UNIT_STATUSES }).notNull().default('active'),
  // Optional per-unit key/value facts that only some units have (e.g. a
  // rope cut down to `{ "length": "58 m" }`). Normally empty.
  opts: text('opts', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  // Covers the itemId FK too (leftmost column), and is exactly the shape of
  // the stock-count subquery: where item_id = ? and status = 'active'.
  index('units_item_id_status_idx').on(table.itemId, table.status),
  index('units_serial_number_idx').on(table.serialNumber),
  // Drizzle's text enum is TypeScript-only; this makes SQLite enforce it too.
  check('units_status_valid', sql`${table.status} IN ('active', 'out_of_service', 'retired')`),
  check('units_opts_is_object', sql`json_valid(${table.opts}) AND json_type(${table.opts}) = 'object'`),
]);

// ---------------------------------------------------------------------------
// Sets — an alternative to `items` for a product's variant slot. A product
// points to an item OR a set for each of its variants (schema-v3 already
// lets a product have several items as its variants, e.g. Size/Color; a set
// is the same idea, except that variant resolves to a *bundle* of items
// rather than one physical item — e.g. "Indoor Rope Climbing Set" comes in
// S/M/L, each a `sets` row, each resolving via `setItems` to a harness of
// that size plus a chalk bag and a belay device). Mirrors `items` in shape
// (productId, slug, name, imageUrl, archived) so the two behave the same way
// everywhere a product lists its variants.
// ---------------------------------------------------------------------------

export const sets = sqliteTable('sets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Nullable/set-null, same rationale as items.productId: a set can exist
  // unassigned, and deleting a product must never delete (or orphan the
  // meaning of) a set that past orders' resolved items still reference.
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  // Internal/admin-only label, same as items.name — never shown to customers.
  name: text('name').notNull(),
  // Short customer-facing text distinguishing this set from its siblings
  // under the same product (e.g. "S"/"M"/"L") — typed directly by the admin
  // when creating the set, same as any other manually-entered field. There
  // is deliberately no attribute-key/value template for sets (unlike items'
  // productAttributeKeys/itemAttributeValues split): a set's *contents* are
  // shown automatically, derived from its components' own attribute values
  // (see src/lib/sets.ts's getSetComponentDisplayBulk), but a set's own
  // identity/label is not derived — the admin creates each variant by hand.
  label: text('label'),
  imageUrl: text('image_url'),
  // Soft delete: a set that's ever been ordered has its resolved items
  // living on in orderItems, independent of this row — same rationale as
  // items.archived.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('sets_product_id_idx').on(table.productId),
]);

// ---------------------------------------------------------------------------
// Set items — the bundle a set resolves into. A rental/order never
// references a set directly (see orderItems above); at the moment an order
// is placed, each cart line for a set is expanded into its setItems rows
// (quantity multiplied by however many of the set were requested) and
// inserted as ordinary orderItems rows. Kept here purely so a set's
// composition — and therefore its availability, computed from its
// components' stock same as any other item — can be looked up.
// ---------------------------------------------------------------------------

export const setItems = sqliteTable('set_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  setId: integer('set_id').notNull().references(() => sets.id, { onDelete: 'cascade' }),
  // No onDelete: a component item can't be hard-deleted out from under a
  // set that still resolves to it — same convention as orderItems.itemId.
  itemId: integer('item_id').notNull().references(() => items.id),
  quantity: integer('quantity').notNull().default(1),
}, (table) => [
  uniqueIndex('set_items_set_item_unique').on(table.setId, table.itemId),
  index('set_items_set_id_idx').on(table.setId),
  index('set_items_item_id_idx').on(table.itemId),
  check('set_items_quantity_positive', sql`${table.quantity} > 0`),
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
  // `NNAAX` format — two digits, two free letters, then a letter flagging
  // the creating member's role: A=admin, B=board member, I=instructor
  // (moderator), M=member — always one of these four — see
  // src/lib/orders.ts's generateOrderCode. This is what members read aloud
  // to moderators and what appears in the retrieve-order URL.
  orderCode: text('order_code').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['requested', 'scheduled', 'active', 'returned', 'rejected'],
  }).notNull().default('requested'),
  // Reservation date range (YYYY-MM-DD, inclusive on both ends) chosen on the
  // /reservation page — the whole order (all its orderItems) shares one
  // range. fromDate is the pick-up day, toDate the return day (see
  // pickupDays below for which pick-up days have a moderator confirmed
  // available to hand out the order). Availability for a range is
  // computed from other requested/active orders whose range overlaps this
  // one — see src/lib/reservation.ts.
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  note: text('note'), // optional note from member at checkout
  // Snapshot of the checkout form's contact fields at submission time — not
  // kept in sync with the member's live profile. contactEmail/contactMobile
  // are intentionally not shown on the member-facing order page (privacy);
  // they exist for future admin/moderator visibility only.
  contactName: text('contact_name').notNull().default(''),
  contactEmail: text('contact_email').notNull().default(''),
  contactMobile: text('contact_mobile'),
  // Snapshot of bloc's fee/membership status at submission time (see
  // docs/moderator-review.md) — not re-fetched live from bloc at review time.
  // Nullable boolean rather than a text tri-state enum: "Unknown" isn't a real
  // business state, it's the absence of data (bloc call failed/timed out), so
  // NULL is the correct representation, same as the underlying value's real
  // type. Fetched server-side in src/pages/api/orders/create.ts, never taken
  // from the posted form.
  hasUnpaidFees: integer('has_unpaid_fees', { mode: 'boolean' }),
  userIsMember: integer('user_is_member', { mode: 'boolean' }),
  // Moderator accountability: who confirmed retrieval / processed the return
  confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
  returnedByUserId: text('returned_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  // Set when a moderator accepts the order on the review step, ahead of
  // retrieval — accept also moves `status` to 'scheduled' (see
  // src/lib/moderatorOrders.ts's acceptOrder), so acceptedAt is redundant
  // with that for gating purposes but kept as the accountability timestamp.
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
  activatedAt: integer('activated_at', { mode: 'timestamp' }), // set when moderator confirms
  returnedAt: integer('returned_at', { mode: 'timestamp' }), // set when moderator marks returned
  rejectedAt: integer('rejected_at', { mode: 'timestamp' }), // set when moderator rejects
  rejectedReason: text('rejected_reason'), // set when moderator rejects
  // Set when the checkout submitter (the renting user) accepted the liability
  // disclaimer (OSI is not liable for injury, etc — see #134). Required at
  // checkout, shown to moderators on the order detail. A timestamp (not a
  // plain boolean) so there's a record of *when*, same pattern as acceptedAt
  // above. Nullable only for orders created before the disclaimer existed.
  disclaimerAcceptedAt: integer('disclaimer_accepted_at', { mode: 'timestamp' }),
  // TODO: dueAt (rental due date) — not yet confirmed, see docs/schema-legacy-fixes.md #9
}, (table) => [
  index('orders_user_id_idx').on(table.userId),
  index('orders_status_idx').on(table.status),
  index('orders_date_range_idx').on(table.fromDate, table.toDate),
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

// A recurring rule an admin sets up (see /admin/pickup-days): "every
// Monday, 18:00-20:00, between these two dates". This row exists purely for
// display (docs/schema.md / the admin UI collapse every date the rule
// generated back into one line, e.g. "21/09 - 10/12 | Monday | 18:00 -
// 20:00") — the rule is never re-evaluated at read time. The individual
// dates it covers are generated once, up front, as ordinary rows in
// `pickupDays` below (kind: 'recurring', recurringRuleId: this row's id).
// Deleting a rule cascades to those generated rows (onDelete: 'cascade' on
// pickupDays.recurringRuleId).
export const pickupRecurringRules = sqliteTable('pickup_recurring_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  // 0 (Sunday) - 6 (Saturday), matching JS Date#getDay().
  weekday: integer('weekday').notNull(),
  startTime: text('start_time').notNull(), // HH:MM, 24h
  endTime: text('end_time').notNull(), // HH:MM, 24h
  startDate: text('start_date').notNull(), // YYYY-MM-DD, inclusive
  endDate: text('end_date').notNull(), // YYYY-MM-DD, inclusive
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('pickup_recurring_rules_created_by_user_id_idx').on(table.createdByUserId),
  check('pickup_recurring_rules_weekday_valid', sql`${table.weekday} BETWEEN 0 AND 6`),
  check('pickup_recurring_rules_date_range_valid', sql`${table.endDate} >= ${table.startDate}`),
]);

// One row per individual pick-up day, of either origin:
//
// - 'single': a moderator (or admin) registering their own ad-hoc
//   availability via the calendar on /moderator/pickup-days or
//   /admin/pickup-days — userId is whoever submitted it, recurringRuleId is
//   null. Deletable only by its owner (see deleteSingleDay in
//   src/lib/pickupDays.ts, which enforces that in the WHERE clause itself,
//   not just a check before calling — a lesson carried over from the
//   ownership bug flagged in the abandoned PR #112).
// - 'recurring': one of the individual dates generated from a
//   pickupRecurringRules row at creation time — userId is that rule's
//   creator (an admin), recurringRuleId points back to it.
//
// Every row (of either kind) is a real pick-up day: /reservation reads the
// union of both to color its calendar, exactly like the old
// pickupAvailableDays table's rows did — see getUpcomingAvailablePickupDates.
export const pickupDays = sqliteTable('pickup_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  // HH:MM, 24h — NOT NULL: every real caller already requires a window
  // (the moderator API validates it before calling createSingleDays;
  // createRecurringRule always copies it from the rule). Kept NOT NULL
  // deliberately, not just by convention: pickup_days_single_user_date_time_unique
  // below is scoped to (date, startTime, endTime), and SQLite treats NULL as
  // distinct from NULL in a unique index — nullable columns here would have
  // silently let two null-time single days for the same user/date past that
  // constraint.
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  // Free-text meeting point ("At Vulkan", "In the reception at SiO Athletica
  // Blindern") — moderator-submitted single days only; recurring rows leave
  // this null (the recurring form never collects one).
  where: text('where'),
  userId: text('user_id').notNull().references(() => users.id),
  kind: text('kind', { enum: ['single', 'recurring'] }).notNull().default('single'),
  recurringRuleId: integer('recurring_rule_id').references(() => pickupRecurringRules.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('pickup_days_date_idx').on(table.date),
  index('pickup_days_user_id_idx').on(table.userId),
  index('pickup_days_recurring_rule_id_idx').on(table.recurringRuleId),
  // A moderator can offer more than one window on the same day (e.g.
  // 12:00-14:00 and 18:00-20:00) — so uniqueness is scoped to a distinct
  // (date, startTime, endTime) per moderator, not just (date), and only
  // blocks submitting the exact same window twice. Overlapping-but-not-
  // identical windows on the same day aren't rejected — not asked for, and
  // detecting real overlap would need interval comparison this doesn't do.
  // Scoped to kind = 'single' only: a recurring rule may legitimately
  // generate the same date twice if two separate rules overlap (e.g. two
  // different training rules both landing on the same Monday).
  uniqueIndex('pickup_days_single_user_date_time_unique')
    .on(table.userId, table.date, table.startTime, table.endTime)
    .where(sql`${table.kind} = 'single'`),
  check('pickup_days_kind_recurring_rule_consistent', sql`(${table.kind} = 'recurring') = (${table.recurringRuleId} IS NOT NULL)`),
]);

// Admin- or moderator-authored messages shown on the moderator hub (see
// src/components/messages/MessageTable.astro) — shift notes, stock issues,
// closures, etc. A plain feed (newest first), no expiry or read-receipts:
// those were open questions on issue #151, deliberately deferred rather than
// guessed at. There's no editing (see issue #225) — a correction is just a
// new message — so there's no updatedAt to track. authorName is a snapshot
// of the posting user's display name at write time, same reasoning as
// orders.contactName — there's no local users table to join against (see
// src/lib/auth.ts), only bloc user ids. authorId is that bloc user id
// (locals.user.id), kept alongside the display-name snapshot so who wrote a
// message is recorded reliably even if two users share a display name (see
// issue #225) — it's nullable because rows written before that column
// existed have no id to backfill. pinnedAt: null means not
// pinned; a timestamp both flags a message as pinned and orders the pinned
// group (most recently pinned first) without a separate boolean + sort
// column.
//
// unitId: null is a hub-board message; set, the message is a note in that
// unit's lifetime log (admin-only, shown on /admin/items/[id]/units, never
// on the hub board). One table rather than a separate unit_notes table so
// both share the same code and components (src/lib/messages.ts,
// MessageTable.astro). Messages can't be edited, and only admins can delete
// them — that matters most for unit notes, which are a safety record.
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  content: text('content').notNull(),
  authorName: text('author_name').notNull(),
  authorId: text('author_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  pinnedAt: integer('pinned_at', { mode: 'timestamp' }),
  // No onDelete: units are never hard-deleted (see `units`).
  unitId: integer('unit_id').references(() => units.id),
}, (table) => [
  index('messages_unit_id_idx').on(table.unitId),
]);

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
  sets: many(sets),
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
  setItems: many(setItems),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  item: one(items, {
    fields: [units.itemId],
    references: [items.id],
  }),
  notes: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  unit: one(units, {
    fields: [messages.unitId],
    references: [units.id],
  }),
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

export const setsRelations = relations(sets, ({ one, many }) => ({
  product: one(products, {
    fields: [sets.productId],
    references: [products.id],
  }),
  setItems: many(setItems),
}));

export const setItemsRelations = relations(setItems, ({ one }) => ({
  set: one(sets, {
    fields: [setItems.setId],
    references: [sets.id],
  }),
  item: one(items, {
    fields: [setItems.itemId],
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

export const pickupRecurringRulesRelations = relations(pickupRecurringRules, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [pickupRecurringRules.createdByUserId],
    references: [users.id],
  }),
  generatedDays: many(pickupDays),
}));

export const pickupDaysRelations = relations(pickupDays, ({ one }) => ({
  user: one(users, {
    fields: [pickupDays.userId],
    references: [users.id],
  }),
  recurringRule: one(pickupRecurringRules, {
    fields: [pickupDays.recurringRuleId],
    references: [pickupRecurringRules.id],
  }),
}));
```
<!-- schema:end -->

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
  many `productAttributeKeys`, many `sets`, and — a Drizzle-only convenience relation,
  with no real FK column on `products`, same pattern as `usersRelations`'
  `many(orders)` — many `items`
- `productLinksRelations`: one `product`
- `productAttributeKeysRelations`: one `product`, many `itemAttributeValues`
- `itemsRelations`: one `product`, many `itemAttributeValues`, many `orderItems`,
  many `setItems`, many `units`
- `unitsRelations`: one `item`, many `messages` (as `notes`)
- `messagesRelations`: one `unit` (nullable)
- `setsRelations`: one `product`, many `setItems`; `setItemsRelations`: one `set`, one `item`
- `itemAttributeValuesRelations`: one `item`, one `attribute` (→ `productAttributeKeys`)
- `usersRelations`, `ordersRelations`, `orderItemsRelations`: unchanged from v2
- `pickupRecurringRulesRelations`: one `createdBy` (→ `users`), many `generatedDays` (→ `pickupDays`)
- `pickupDaysRelations`: one `user`, one `recurringRule` (→ `pickupRecurringRules`, nullable)

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

## Schema addition: sets (rentable bundles) — PR #212
A product's variant slot can now point to a **set** instead of an item (a
product's variants are all items or all sets, never a mix — enforced by the
admin wizard) — a set resolves to a bundle of real items with
quantities, e.g. "Indoor Rope Climbing Set — M" -> Harness M + Chalk Bag +
Singing Rock Rama Belay Device. Two new tables:

- `sets` (id, productId nullable/set-null, slug, name, label nullable,
  imageUrl, archived, createdAt) — mostly mirrors `items`, except `label`: a
  plain, manually-typed short string (e.g. "S"/"M"/"L") the admin picks to
  distinguish sibling sets. A set is a peer of `items` under a product, not
  a child of it.
- `setItems` (setId -> sets cascade, itemId -> items no-action, quantity) —
  the bundle's composition. unique(setId, itemId).

Deliberately **no** `productAttributeKeys`/`itemAttributeValues`-style
template for sets (an earlier version of this PR added exactly that —
`setAttributeValues` — before the addition below replaced it): a set never
gets its own admin-entered attribute values. What a set "includes" is
instead derived automatically at display time from its components' own
already-existing attribute values — `src/lib/sets.ts`'s
`getSetComponentDisplayBulk` groups components sharing an identical
attribute-key signature (i.e. the same product template) into one shared
table (e.g. a rack of different cam sizes); anything else — a lone
component, or one with no attribute keys at all — renders as a plain line.

Orders/rentals still always reference items, never sets (unchanged
invariant from the top of this doc) — a set cart entry is expanded into its
component items, merged by itemId with any other demand for the same item
in the cart, only at checkout (`src/lib/sets.ts`'s
`resolveEntriesToItemQuantities`, called from `src/lib/orders.ts`). Sets are
authored under `/admin/sets` (issue #214); `scripts/seed-example-catalog.mjs`
seeds two example sets into the dev catalogue.

Note: "Set" here (a rentable bundle) is unrelated to this doc's existing
"Set dropdown"/"Set attributes"/"Set product" wizard-UI terminology above
(a bulk-action menu for selected items) — an unfortunate naming collision,
not a design relationship. Worth renaming one of the two if it causes
confusion in practice.

## Feature: homepage grid groups tiles by product, not item
`getShopGridProducts()`/`groupShopItemsByProduct()` in `src/lib/shop.ts`
collapse `getShopItems()`'s one-row-per-item rows into one row per product
for the homepage grid, so a product's size/color variants share a single
tile instead of one tile each. The representative item (used for the
tile's image and its `?item=<id>` preselect link) is the first in-stock
item in the group, falling back to the group's first item if none are in
stock. A product whose variants are sets (`getShopSets()`) is grouped the
same way and gets a `representativeSetId` with a `?set=<id>` link instead,
plus a "Set" tag on the tile. The tile's stock number sums `inStock` across
every variant in the group — an interim approach (issue #64 still owns the stock badge's final
design), so it effectively reads "in stock if any item in the group is
available." `ItemGrid.astro`/`ItemCard.astro` take product-level props now;
`ItemCard.astro` no longer renders a per-variant attribute label, since a
tile can represent several variants at once.

## Schema addition: units (physical objects behind an item) — #276
`items.stockCount` is gone. A new `units` table (see `src/db/schema.ts`) has
one row per physical object of an item: `itemId`, `brand`, `model`,
`marking`, `serialNumber`, `manufacturedAt`, `purchasedAt`, `status`
(`active` / `out_of_service` / `retired`) and `opts` (JSON object of
optional key/value facts, normally empty, e.g. `{ "length": "58 m" }` for a
rope that was cut).

- **Stock is derived**: an item's stock is `count(units where status =
  'active')`, via `activeUnitCount` / `itemStockExtras` in
  `src/lib/units.ts`. Taking a unit out of service or retiring it lowers
  availability immediately, with no extra bookkeeping. Every former reader of
  `items.stockCount` goes through it.
- **Rentals are unchanged**: `orderItems` still reference items. Units are
  admin-only bookkeeping (`/admin/items/[id]/units`).
- **Never hard-deleted**: retired units stay as the record of what happened
  to them (same reasoning as `items.archived`).
- **Overbooking is a warning, not a block**: when stock drops below what's
  already booked, the units page lists the affected orders
  (`getOverbookedOrders` in `src/lib/availability.ts`). The admin decides what
  to do; nothing is cancelled automatically.
- **Notes are messages**: a unit's lifetime log is `messages` rows with
  `messages.unitId` set (`unitId` null = hub-board message), so it reuses
  `src/lib/messages.ts` and `MessageTable.astro`. Status changes post a note
  ("Status: Active → Out of service — reason"). Notes follow exactly the
  hub-message rules: dated by when they were posted, never edited, deletable
  by an admin or their own author. On the units page each unit shows its
  three newest notes as compact one-line entries ("John A. 20/09/26 <note>",
  scrolling for more), a new-note popover, a status popover on its status
  pill and a details panel for its fields.
- **Separate from reports**: unit notes hold admin-written history only.
  Member/moderator damage reports will be their own table later, assignable
  to a unit.
