PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`stock_count` integer DEFAULT 1 NOT NULL,
	`service_quantity` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "service_quantity_bounds" CHECK("__new_items"."service_quantity" >= 0 AND "__new_items"."service_quantity" <= "__new_items"."stock_count")
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "product_id", "slug", "name", "image_url", "stock_count", "service_quantity", "archived", "created_at") SELECT "id", "product_id", "slug", "name", "image_url", "stock_count", 0, "archived", "created_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `items_slug_unique` ON `items` (`slug`);--> statement-breakpoint
CREATE INDEX `items_product_id_idx` ON `items` (`product_id`);
