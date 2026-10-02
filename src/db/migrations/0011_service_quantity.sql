-- Added in place rather than via drizzle's table-rebuild: DROP TABLE `items`
-- runs inside migrate()'s transaction (where PRAGMA foreign_keys=OFF is a
-- no-op), so it would cascade-delete every item_attribute_values row and fail
-- outright once any order_items row references an item.
ALTER TABLE `items` ADD `service_quantity` integer DEFAULT 0 NOT NULL CONSTRAINT "service_quantity_bounds" CHECK("service_quantity" >= 0 AND "service_quantity" <= "stock_count");
