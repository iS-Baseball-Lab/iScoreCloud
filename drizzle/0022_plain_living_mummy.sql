CREATE TABLE `event_carpool_riders` (
	`id` text PRIMARY KEY NOT NULL,
	`carpool_id` text NOT NULL,
	`player_id` text,
	`member_id` text,
	FOREIGN KEY (`carpool_id`) REFERENCES `event_carpools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ec_riders_carpool_id` ON `event_carpool_riders` (`carpool_id`);--> statement-breakpoint
CREATE INDEX `idx_ec_riders_player_id` ON `event_carpool_riders` (`player_id`);--> statement-breakpoint
CREATE INDEX `idx_ec_riders_member_id` ON `event_carpool_riders` (`member_id`);--> statement-breakpoint
CREATE TABLE `event_carpool_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`distance_km` integer DEFAULT 0,
	`gasoline_price` integer DEFAULT 170,
	`split_method` text DEFAULT 'by_team',
	`no_parent_child` integer DEFAULT true,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ec_settings_event_id` ON `event_carpool_settings` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_carpools` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`car_id` text,
	`capacity` integer NOT NULL,
	`car_type` text DEFAULT 'normal',
	`highway_fee` integer DEFAULT 0,
	`parking_fee` integer DEFAULT 0,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`driver_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`car_id`) REFERENCES `member_cars`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_event_carpools_event_id` ON `event_carpools` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_event_carpools_driver_id` ON `event_carpools` (`driver_id`);--> statement-breakpoint
CREATE TABLE `member_cars` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer DEFAULT 4 NOT NULL,
	`fuel_efficiency` integer DEFAULT 10 NOT NULL,
	`car_type` text DEFAULT 'normal',
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_member_cars_team_id` ON `member_cars` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_member_cars_owner_id` ON `member_cars` (`owner_id`);--> statement-breakpoint
CREATE TABLE `parent_child_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pc_relations_team_id` ON `parent_child_relations` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_pc_relations_parent_id` ON `parent_child_relations` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_pc_relations_child_id` ON `parent_child_relations` (`child_id`);