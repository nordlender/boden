PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`requested_quantity` integer DEFAULT 1 NOT NULL,
	`retrieved_quantity` integer,
	`reserved_from` text,
	`reserved_to` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requested_quantity_positive" CHECK("__new_order_items"."requested_quantity" > 0),
	CONSTRAINT "retrieved_quantity_non_negative" CHECK("__new_order_items"."retrieved_quantity" IS NULL OR "__new_order_items"."retrieved_quantity" >= 0),
	CONSTRAINT "reserved_range_valid" CHECK("__new_order_items"."reserved_from" IS NULL OR "__new_order_items"."reserved_to" IS NULL OR "__new_order_items"."reserved_to" >= "__new_order_items"."reserved_from")
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "order_id", "item_id", "requested_quantity", "retrieved_quantity") SELECT "id", "order_id", "item_id", "requested_quantity", "retrieved_quantity" FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_item_unique` ON `order_items` (`order_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);