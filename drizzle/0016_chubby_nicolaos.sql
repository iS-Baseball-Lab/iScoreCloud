PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attendances` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player_id` text,
	`member_id` text,
	`user_id` text,
	`status` text DEFAULT 'pending',
	`role_in_event` text DEFAULT 'player',
	`has_car` integer DEFAULT false,
	`comment` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_attendances`("id", "event_id", "player_id", "member_id", "user_id", "status", "role_in_event", "has_car", "comment", "updated_at") SELECT "id", "event_id", "player_id", "member_id", "user_id", "status", "role_in_event", "has_car", "comment", "updated_at" FROM `attendances`;--> statement-breakpoint
DROP TABLE `attendances`;--> statement-breakpoint
ALTER TABLE `__new_attendances` RENAME TO `attendances`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_player_uniq` ON `attendances` (`event_id`,`player_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_member_uniq` ON `attendances` (`event_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`start_at` integer NOT NULL,
	`event_type` text DEFAULT 'practice',
	`description` text,
	`location` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "team_id", "title", "start_at", "event_type", "description", "location") SELECT "id", "team_id", "title", "start_at", "event_type", "description", "location" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;