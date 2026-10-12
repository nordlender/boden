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
-- Hand-added backfill: one blank active unit per unit of each item's old
-- stock_count, so existing stock is unchanged after the column is dropped.
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < (SELECT coalesce(max(stock_count), 0) FROM items))
INSERT INTO `units` (`item_id`) SELECT items.id FROM items JOIN n ON n.i <= items.stock_count ORDER BY items.id, n.i;--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `stock_count`;