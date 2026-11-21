-- 0056_team_special_events.sql
-- チーム特別イベント・アンケート（忘年会・卒団式・親子レク・日程調整・同伴家族＆会費管理）テーブルの新設
CREATE TABLE IF NOT EXISTS `team_special_events` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL REFERENCES `teams`(`id`) ON DELETE cascade,
	`title` text NOT NULL,
	`category` text DEFAULT 'party' NOT NULL,
	`mode` text DEFAULT 'rsvp' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`event_date` text,
	`start_time` text,
	`end_time` text,
	`location` text,
	`location_url` text,
	`deadline_date` text,
	`description` text,
	`allow_companions` integer DEFAULT 1 NOT NULL,
	`use_fee_calculation` integer DEFAULT 1 NOT NULL,
	`fee_tiers_json` text,
	`candidate_dates_json` text,
	`questions_json` text,
	`created_by_user_id` text,
	`created_by_name` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_special_events_team_status_date` ON `team_special_events` (`team_id`, `status`, `event_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `team_special_event_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`special_event_id` text NOT NULL REFERENCES `team_special_events`(`id`) ON DELETE cascade,
	`team_id` text NOT NULL REFERENCES `teams`(`id`) ON DELETE cascade,
	`household_key` text NOT NULL,
	`household_label` text NOT NULL,
	`member_entries_json` text DEFAULT '[]' NOT NULL,
	`companions_json` text DEFAULT '[]' NOT NULL,
	`date_votes_json` text DEFAULT '[]' NOT NULL,
	`survey_answers_json` text DEFAULT '{}' NOT NULL,
	`comment` text,
	`fee_paid` integer DEFAULT 0 NOT NULL,
	`updated_by_user_id` text,
	`updated_by_name` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_special_event_resp_uniq` ON `team_special_event_responses` (`special_event_id`, `household_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_special_event_resp_team_ev` ON `team_special_event_responses` (`team_id`, `special_event_id`);
