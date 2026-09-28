DROP INDEX `products_status_idx`;--> statement-breakpoint
ALTER TABLE `products` ADD `published` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `status`;--> statement-breakpoint
CREATE INDEX `products_published_idx` ON `products` (`published`);
