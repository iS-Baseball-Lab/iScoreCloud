ALTER TABLE `event_carpools` ADD `return_riders_json` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `pitch_limit_rule` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `schedule_settings` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `score_settings` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `cheer_songs_json` text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event_equipments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`carpool_id` text,
	`responsible_member_id` text,
	`status` text DEFAULT 'pending',
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_id`) REFERENCES `team_equipments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`carpool_id`) REFERENCES `event_carpools`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`responsible_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_event_equipments_event_id` ON `event_equipments` (`event_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_event_equipments_eq_id` ON `event_equipments` (`equipment_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_event_equipments_cp_id` ON `event_equipments` (`carpool_id`);
