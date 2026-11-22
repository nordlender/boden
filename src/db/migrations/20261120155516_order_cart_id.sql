ALTER TABLE `orders` ADD `cart_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_cart_id_unique` ON `orders` (`cart_id`);