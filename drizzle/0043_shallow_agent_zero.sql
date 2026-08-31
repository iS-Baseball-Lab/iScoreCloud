CREATE TABLE `team_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`team_id` text,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'other' NOT NULL,
	`scope` text DEFAULT 'team' NOT NULL,
	`priority` integer DEFAULT 0,
	`is_important` integer DEFAULT false,
	`image_url` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_team_links_org_id` ON `team_links` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_team_links_team_id` ON `team_links` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`team_id` text,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`scope` text DEFAULT 'team' NOT NULL,
	`priority` integer DEFAULT 0,
	`is_important` integer DEFAULT false,
	`image_url` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_team_rules_org_id` ON `team_rules` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_team_rules_team_id` ON `team_rules` (`team_id`);--> statement-breakpoint
ALTER TABLE `attendances` ADD `selected_group_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `activity_groups` text;