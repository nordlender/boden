PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pickup_days` (
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
	CONSTRAINT "pickup_days_kind_recurring_rule_consistent" CHECK(("__new_pickup_days"."kind" = 'recurring') = ("__new_pickup_days"."recurring_rule_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_pickup_days`("id", "date", "start_time", "end_time", "where", "user_id", "kind", "recurring_rule_id", "created_at") SELECT "id", "date", "start_time", "end_time", "where", "user_id", "kind", "recurring_rule_id", "created_at" FROM `pickup_days`;--> statement-breakpoint
DROP TABLE `pickup_days`;--> statement-breakpoint
ALTER TABLE `__new_pickup_days` RENAME TO `pickup_days`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `pickup_days_date_idx` ON `pickup_days` (`date`);--> statement-breakpoint
CREATE INDEX `pickup_days_user_id_idx` ON `pickup_days` (`user_id`);--> statement-breakpoint
CREATE INDEX `pickup_days_recurring_rule_id_idx` ON `pickup_days` (`recurring_rule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pickup_days_single_user_date_time_unique` ON `pickup_days` (`user_id`,`date`,`start_time`,`end_time`) WHERE "pickup_days"."kind" = 'single';