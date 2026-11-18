-- Phase 4: LINE週末自動リマインド設定カラム ＋ 未登録ランタイムテーブル・インデックス統合
ALTER TABLE `teams` ADD COLUMN `weekend_reminder_settings` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_teams_org_id` ON `teams` (`organization_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_teams_created_by` ON `teams` (`created_by`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `match_scorebook_snapshots` (
	`match_id` text PRIMARY KEY NOT NULL,
	`top_structure_json` text,
	`bottom_structure_json` text,
	`top_at_bats_json` text,
	`bottom_at_bats_json` text,
	`top_image_url` text,
	`bottom_image_url` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `match_live_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`match_id` text,
	`report_json` text NOT NULL,
	`editor_owner_key` text,
	`updated_by_name` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_match_live_reports_team_id` ON `match_live_reports` (`team_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_match_live_reports_match_id` ON `match_live_reports` (`match_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `carpool_live_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`event_id` text NOT NULL,
	`carpool_id` text NOT NULL,
	`direction` text DEFAULT 'outbound' NOT NULL,
	`is_sharing` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'moving' NOT NULL,
	`latitude` real,
	`longitude` real,
	`heading` real,
	`speed_kmh` real,
	`accuracy_m` real,
	`sender_user_id` text,
	`sender_name` text,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_carpool_live_event_dir` ON `carpool_live_locations` (`event_id`, `direction`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_carpool_live_team_id` ON `carpool_live_locations` (`team_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `player_condition_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`private_note` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_player_cond_periods_team_id` ON `player_condition_periods` (`team_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_player_cond_periods_player_id` ON `player_condition_periods` (`player_id`);
