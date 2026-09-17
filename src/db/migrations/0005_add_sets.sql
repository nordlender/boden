CREATE TABLE `set_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
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
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`thumbnail_image_url` text,
	`status` text DEFAULT 'hidden' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sets_slug_unique` ON `sets` (`slug`);--> statement-breakpoint
CREATE INDEX `sets_status_idx` ON `sets` (`status`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `set_id` integer REFERENCES sets(id);--> statement-breakpoint
CREATE INDEX `order_items_set_id_idx` ON `order_items` (`set_id`);
