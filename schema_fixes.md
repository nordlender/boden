Update `src/db/schema.ts` with the following fixes. Then regenerate and apply the Drizzle migration.

## 1. Add relations() — required, currently missing

The app uses Drizzle's relational query API (`db.query.orders.findFirst({ with: {...} })`) in the moderator and admin pages. This will not work without explicit relation declarations. Add:

- `itemsRelations`: one `category`, many `attributes` (itemAttributes), many `links` (itemLinks), many `orderItems`
- `itemAttributesRelations`: one `item`
- `itemLinksRelations`: one `item`
- `usersRelations`: many `orders`
- `ordersRelations`: one `user`, many `orderItems`
- `orderItemsRelations`: one `order`, one `item`

## 2. Add validation constraints on order_items

- `requestedQuantity` must be > 0 (check constraint)
- `retrievedQuantity` must be NULL or >= 0 (check constraint)
- Add a unique constraint on `(orderId, itemId)` so the same item can't appear twice in one order

## 3. Add accountability fields to orders

Add `confirmedByUserId` and `returnedByUserId` (both `text`, references `users.id`, nullable) to track which moderator confirmed retrieval and which moderator processed the return. Wire these into the confirm/return API routes from `locals.user.id`.

## 4. Switch items from hard delete to soft delete

Add `archived` boolean column (default false) to `items`. This is needed because `orderItems.itemId` references `items.id`, and SQLite's default RESTRICT behavior will block deletion of any item that has ever been ordered — which breaks the archive/order-history views. Update:
- Admin "remove item" action to set `archived = true` instead of deleting
- Catalogue queries to filter `where(eq(items.archived, false))`

## 5. Replace sequential order IDs with a random order code

Add `orderCode` (text, unique, not null) to `orders` — a short random alphanumeric code (6 chars, exclude ambiguous characters like 0/O and 1/I). This is what members read aloud to moderators and what appears in the retrieve-order URL, instead of the internal auto-increment `id`. Keep `id` as the internal primary key.

## 6. Remove redundant `available` boolean

Drop the `available` column from `items`. Availability should be derived from `stockCount` minus quantities currently on active rentals, not stored as a separately-maintained boolean (it will drift out of sync). Update any code currently reading `item.available` to compute this instead.

## 7. Add indexes on foreign keys

SQLite does not auto-index foreign keys. Add indexes on:
- `orderItems.orderId`
- `orders.userId`
- `orders.status`
- `itemAttributes.itemId`
- `itemLinks.itemId`

## 8. Use database-level timestamp defaults

Replace `$defaultFn(() => new Date())` with a SQL-level default (`sql\`(unixepoch())\``) so timestamps are guaranteed even for rows inserted outside the app (seed scripts, manual SQL).

## 9. Flag for discussion, don't implement yet

The `rejected` order status has no supporting fields (no `rejectedAt`, no reason field) and there's no `dueAt` field for rental due dates. Leave a `// TODO` comment on each — don't add fields until we confirm the requirements.

---

After updating the schema, run `npx drizzle-kit generate:sqlite` and show me the generated migration SQL before applying it.
