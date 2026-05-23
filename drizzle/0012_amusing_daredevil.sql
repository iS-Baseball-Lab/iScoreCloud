ALTER TABLE `matches` ADD `locked_by_user_id` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `locked_by_user_name` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `locked_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `lock_expires_at` integer;