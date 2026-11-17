ALTER TABLE `venues` ADD `organization_id` text;--> statement-breakpoint
ALTER TABLE `venues` ADD `team_id` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_venues_org_id` ON `venues` (`organization_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_venues_team_id` ON `venues` (`team_id`);--> statement-breakpoint
ALTER TABLE `tournaments` ADD `organization_id` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `team_id` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tournaments_org_id` ON `tournaments` (`organization_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tournaments_team_id` ON `tournaments` (`team_id`);
