CREATE TABLE `pickup_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
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
CREATE UNIQUE INDEX `pickup_days_single_user_date_unique` ON `pickup_days` (`user_id`,`date`) WHERE "pickup_days"."kind" = 'single';--> statement-breakpoint
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
CREATE INDEX `pickup_recurring_rules_created_by_user_id_idx` ON `pickup_recurring_rules` (`created_by_user_id`);