-- Unit notes move from the units.notes JSON column into `messages` (with
-- messages.unit_id set), keeping each note's date (as created_at) and author.
-- Hand-ordered around drizzle-kit's generated table rebuild: notes are staged
-- in a scratch table first, because messages may only reference units
-- *after* the rebuild — DROP TABLE on a referenced table fails while foreign
-- keys are enforced, and the PRAGMA below can't turn them off inside the
-- migrator's transaction.
CREATE TABLE `__unit_notes` AS
SELECT
	`units`.`id` AS unit_id,
	note.key AS position,
	json_extract(note.value, '$.text') AS content,
	json_extract(note.value, '$.authorId') AS author_id,
	unixepoch(json_extract(note.value, '$.date')) AS created_at
FROM `units`, json_each(`units`.`notes`) AS note;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`brand` text,
	`model` text,
	`marking` text,
	`serial_number` text,
	`manufactured_at` text,
	`purchased_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`opts` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "units_status_valid" CHECK("__new_units"."status" IN ('active', 'out_of_service', 'retired')),
	CONSTRAINT "units_opts_is_object" CHECK(json_valid("__new_units"."opts") AND json_type("__new_units"."opts") = 'object')
);
--> statement-breakpoint
INSERT INTO `__new_units`("id", "item_id", "brand", "model", "marking", "serial_number", "manufactured_at", "purchased_at", "status", "opts", "created_at") SELECT "id", "item_id", "brand", "model", "marking", "serial_number", "manufactured_at", "purchased_at", "status", "opts", "created_at" FROM `units`;--> statement-breakpoint
DROP TABLE `units`;--> statement-breakpoint
ALTER TABLE `__new_units` RENAME TO `units`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `units_item_id_status_idx` ON `units` (`item_id`,`status`);--> statement-breakpoint
CREATE INDEX `units_serial_number_idx` ON `units` (`serial_number`);--> statement-breakpoint
ALTER TABLE `messages` ADD `unit_id` integer REFERENCES units(id);--> statement-breakpoint
CREATE INDEX `messages_unit_id_idx` ON `messages` (`unit_id`);--> statement-breakpoint
INSERT INTO `messages` (`content`, `author_name`, `author_id`, `created_at`, `unit_id`)
SELECT n.content, coalesce(author.name, author.email, 'Unknown'), n.author_id, n.created_at, n.unit_id
FROM `__unit_notes` AS n
LEFT JOIN `users` AS author ON author.id = n.author_id
ORDER BY n.unit_id, n.position;--> statement-breakpoint
DROP TABLE `__unit_notes`;
