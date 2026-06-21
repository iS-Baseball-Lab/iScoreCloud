PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_member_cars` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`owner_id` text,
	`owner_id2` text,
	`name` text NOT NULL,
	`color` text,
	`color_code` text,
	`number_plate` text,
	`capacity` integer DEFAULT 4 NOT NULL,
	`fuel_efficiency` integer DEFAULT 10 NOT NULL,
	`car_type` text DEFAULT 'normal',
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id2`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_member_cars`("id", "team_id", "owner_id", "owner_id2", "name", "color", "color_code", "number_plate", "capacity", "fuel_efficiency", "car_type", "created_at") SELECT "id", "team_id", "owner_id", NULL, "name", "color", "color_code", "number_plate", "capacity", "fuel_efficiency", "car_type", "created_at" FROM `member_cars`;--> statement-breakpoint
DROP TABLE `member_cars`;--> statement-breakpoint
ALTER TABLE `__new_member_cars` RENAME TO `member_cars`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_member_cars_team_id` ON `member_cars` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_member_cars_owner_id` ON `member_cars` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_member_cars_owner_id2` ON `member_cars` (`owner_id2`);