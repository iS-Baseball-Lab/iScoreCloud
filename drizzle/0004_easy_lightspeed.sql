CREATE TABLE `team_role_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`role` text NOT NULL,
	`custom_label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_role_idx` ON `team_role_settings` (`team_id`,`role`);