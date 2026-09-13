CREATE TABLE `pickup_available_days` (
	`date` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_code` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
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
	FOREIGN KEY (`returned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_date_range_valid" CHECK("__new_orders"."to_date" >= "__new_orders"."from_date")
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_code", "user_id", "status", "from_date", "to_date", "note", "confirmed_by_user_id", "returned_by_user_id", "created_at", "activated_at", "returned_at", "rejected_at", "rejected_reason") SELECT "id", "order_code", "user_id", "status", "from_date", "to_date", "note", "confirmed_by_user_id", "returned_by_user_id", "created_at", "activated_at", "returned_at", "rejected_at", "rejected_reason" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_code_unique` ON `orders` (`order_code`);--> statement-breakpoint
CREATE INDEX `orders_user_id_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_date_range_idx` ON `orders` (`from_date`,`to_date`);