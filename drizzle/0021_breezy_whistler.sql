ALTER TABLE `players` ADD `user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `team_members` ADD `avatar_url` text;