-- 0052_related_teams.sql
-- 関連チーム・所属連盟チーム名鑑テーブル (related_teams) の新設
CREATE TABLE IF NOT EXISTS `related_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text REFERENCES `organizations`(`id`) ON DELETE cascade,
	`team_id` text REFERENCES `teams`(`id`) ON DELETE cascade,
	`name` text NOT NULL,
	`short_name` text,
	`league_name` text,
	`relation_type` text DEFAULT 'league_member' NOT NULL,
	`team_category` text,
	`area` text,
	`home_ground` text,
	`website_url` text,
	`links_json` text,
	`description` text,
	`scope` text DEFAULT 'organization' NOT NULL,
	`is_favorite` integer DEFAULT 0,
	`priority` integer DEFAULT 0,
	`created_by_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_related_teams_org_id` ON `related_teams` (`organization_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_related_teams_team_id` ON `related_teams` (`team_id`);
