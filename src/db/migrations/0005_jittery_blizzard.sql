CREATE TABLE `moderator_pickup_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`moderator_user_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`retracted_at` integer,
	FOREIGN KEY (`moderator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "moderator_pickup_offers_time_range_valid" CHECK("moderator_pickup_offers"."end_time" IS NULL OR "moderator_pickup_offers"."start_time" IS NULL OR "moderator_pickup_offers"."end_time" > "moderator_pickup_offers"."start_time")
);
--> statement-breakpoint
CREATE INDEX `moderator_pickup_offers_date_idx` ON `moderator_pickup_offers` (`date`);--> statement-breakpoint
CREATE INDEX `moderator_pickup_offers_moderator_user_id_idx` ON `moderator_pickup_offers` (`moderator_user_id`);--> statement-breakpoint
CREATE INDEX `moderator_pickup_offers_status_idx` ON `moderator_pickup_offers` (`status`);
