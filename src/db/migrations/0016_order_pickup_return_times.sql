ALTER TABLE `orders` ADD `pickup_day_id` integer REFERENCES pickup_days(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `orders` ADD `pickup_requested_time` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `return_day_id` integer REFERENCES pickup_days(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `orders` ADD `return_requested_time` text;--> statement-breakpoint
CREATE INDEX `orders_pickup_day_id_idx` ON `orders` (`pickup_day_id`);--> statement-breakpoint
CREATE INDEX `orders_return_day_id_idx` ON `orders` (`return_day_id`);