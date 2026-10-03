CREATE TABLE `set_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "set_items_quantity_positive" CHECK("set_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_items_set_item_unique` ON `set_items` (`set_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `set_items_set_id_idx` ON `set_items` (`set_id`);--> statement-breakpoint
CREATE INDEX `set_items_item_id_idx` ON `set_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`label` text,
	`image_url` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sets_slug_unique` ON `sets` (`slug`);--> statement-breakpoint
CREATE INDEX `sets_product_id_idx` ON `sets` (`product_id`);