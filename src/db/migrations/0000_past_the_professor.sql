CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `item_attribute_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `product_attribute_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_attribute_values_item_attribute_unique` ON `item_attribute_values` (`item_id`,`attribute_id`);--> statement-breakpoint
CREATE INDEX `item_attribute_values_item_id_idx` ON `item_attribute_values` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_attribute_values_attribute_id_idx` ON `item_attribute_values` (`attribute_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`stock_count` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_slug_unique` ON `items` (`slug`);--> statement-breakpoint
CREATE INDEX `items_product_id_idx` ON `items` (`product_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`requested_quantity` integer DEFAULT 1 NOT NULL,
	`retrieved_quantity` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requested_quantity_positive" CHECK("order_items"."requested_quantity" > 0),
	CONSTRAINT "retrieved_quantity_non_negative" CHECK("order_items"."retrieved_quantity" IS NULL OR "order_items"."retrieved_quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_item_unique` ON `order_items` (`order_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_code` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`note` text,
	`confirmed_by_user_id` text,
	`returned_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`activated_at` integer,
	`returned_at` integer,
	`rejected_at` integer,
	`rejected_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`returned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_code_unique` ON `orders` (`order_code`);--> statement-breakpoint
CREATE INDEX `orders_user_id_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `product_attribute_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_attribute_keys_product_name_unique` ON `product_attribute_keys` (`product_id`,`name`);--> statement-breakpoint
CREATE INDEX `product_attribute_keys_product_id_idx` ON `product_attribute_keys` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_links_product_id_idx` ON `product_links` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category_id` integer,
	`subcategory_id` integer,
	`status` text DEFAULT 'hidden' NOT NULL,
	`thumbnail_image_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subcategory_id`) REFERENCES `subcategories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_subcategory_id_idx` ON `products` (`subcategory_id`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE TABLE `subcategories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subcategories_category_slug_unique` ON `subcategories` (`category_id`,`slug`);--> statement-breakpoint
CREATE INDEX `subcategories_category_id_idx` ON `subcategories` (`category_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);