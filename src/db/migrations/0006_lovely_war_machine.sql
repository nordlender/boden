PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`strikes` integer DEFAULT 0 NOT NULL,
	`barred_at` integer,
	CONSTRAINT "user_strikes_non_negative" CHECK("__new_users"."strikes" >= 0)
);
--> statement-breakpoint
-- strikes/barred_at don't exist on the pre-migration `users` table —
-- backfilled with the column defaults (0 / NULL) for any pre-existing rows,
-- same convention as 0004's contact_name/contact_email backfill.
INSERT INTO `__new_users`("id", "email", "name", "created_at", "strikes", "barred_at") SELECT "id", "email", "name", "created_at", 0, NULL FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);