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
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_slug_unique` ON `items` (`slug`);--> statement-breakpoint
CREATE INDEX `items_product_id_idx` ON `items` (`product_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`author_name` text NOT NULL,
	`author_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`pinned_at` integer
);
--> statement-breakpoint
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
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`note` text,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`contact_mobile` text,
	`has_unpaid_fees` integer,
	`user_is_member` integer,
	`confirmed_by_user_id` text,
	`returned_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`accepted_at` integer,
	`activated_at` integer,
	`returned_at` integer,
	`rejected_at` integer,
	`rejected_reason` text,
	`disclaimer_accepted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`returned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_date_range_valid" CHECK("orders"."to_date" >= "orders"."from_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_code_unique` ON `orders` (`order_code`);--> statement-breakpoint
CREATE INDEX `orders_user_id_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_date_range_idx` ON `orders` (`from_date`,`to_date`);--> statement-breakpoint
CREATE TABLE `pickup_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`where` text,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'single' NOT NULL,
	`recurring_rule_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `pickup_recurring_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pickup_days_kind_recurring_rule_consistent" CHECK(("pickup_days"."kind" = 'recurring') = ("pickup_days"."recurring_rule_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `pickup_days_date_idx` ON `pickup_days` (`date`);--> statement-breakpoint
CREATE INDEX `pickup_days_user_id_idx` ON `pickup_days` (`user_id`);--> statement-breakpoint
CREATE INDEX `pickup_days_recurring_rule_id_idx` ON `pickup_days` (`recurring_rule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pickup_days_single_user_date_time_unique` ON `pickup_days` (`user_id`,`date`,`start_time`,`end_time`) WHERE "pickup_days"."kind" = 'single';--> statement-breakpoint
CREATE TABLE `pickup_recurring_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_by_user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pickup_recurring_rules_weekday_valid" CHECK("pickup_recurring_rules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "pickup_recurring_rules_date_range_valid" CHECK("pickup_recurring_rules"."end_date" >= "pickup_recurring_rules"."start_date")
);
--> statement-breakpoint
CREATE INDEX `pickup_recurring_rules_created_by_user_id_idx` ON `pickup_recurring_rules` (`created_by_user_id`);--> statement-breakpoint
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
CREATE INDEX `sets_product_id_idx` ON `sets` (`product_id`);--> statement-breakpoint
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
CREATE TABLE `units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`brand` text,
	`model` text,
	`marking` text,
	`serial_number` text,
	`manufactured_at` text,
	`purchased_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`opts` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "units_status_valid" CHECK("units"."status" IN ('active', 'out_of_service', 'retired')),
	CONSTRAINT "units_notes_is_array" CHECK(json_valid("units"."notes") AND json_type("units"."notes") = 'array'),
	CONSTRAINT "units_opts_is_object" CHECK(json_valid("units"."opts") AND json_type("units"."opts") = 'object')
);
--> statement-breakpoint
CREATE INDEX `units_item_id_status_idx` ON `units` (`item_id`,`status`);--> statement-breakpoint
CREATE INDEX `units_serial_number_idx` ON `units` (`serial_number`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);