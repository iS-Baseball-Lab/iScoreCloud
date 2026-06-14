CREATE TABLE `team_group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`player_id` text,
	`team_member_id` text,
	`role` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `team_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tg_members_group_id` ON `team_group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_tg_members_player_id` ON `team_group_members` (`player_id`);--> statement-breakpoint
CREATE INDEX `idx_tg_members_team_member_id` ON `team_group_members` (`team_member_id`);--> statement-breakpoint
CREATE TABLE `team_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `team_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_team_groups_team_id` ON `team_groups` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_team_groups_parent_id` ON `team_groups` (`parent_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text,
	`name` text,
	`name_kana` text,
	`member_type` text DEFAULT 'parent' NOT NULL,
	`phone` text,
	`email` text,
	`role` text DEFAULT 'player' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_team_members`("id", "team_id", "user_id", "name", "name_kana", "member_type", "phone", "email", "role", "status", "joined_at") SELECT "id", "team_id", "user_id", "name", "name_kana", "member_type", "phone", "email", "role", "status", "joined_at" FROM `team_members`;--> statement-breakpoint
DROP TABLE `team_members`;--> statement-breakpoint
ALTER TABLE `__new_team_members` RENAME TO `team_members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_team_members_team_id` ON `team_members` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_team_members_user_id` ON `team_members` (`user_id`);