PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_base_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`at_bat_id` text NOT NULL,
	`pitch_id` text,
	`runner_id` text,
	`from_base` integer NOT NULL,
	`to_base` integer NOT NULL,
	`reason` text NOT NULL,
	`is_out` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`at_bat_id`) REFERENCES `at_bats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pitch_id`) REFERENCES `pitches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`runner_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_base_advances`("id", "match_id", "at_bat_id", "pitch_id", "runner_id", "from_base", "to_base", "reason", "is_out", "created_at") SELECT "id", "match_id", "at_bat_id", "pitch_id", "runner_id", "from_base", "to_base", "reason", "is_out", "created_at" FROM `base_advances`;--> statement-breakpoint
DROP TABLE `base_advances`;--> statement-breakpoint
ALTER TABLE `__new_base_advances` RENAME TO `base_advances`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_base_advances_match_id` ON `base_advances` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_base_advances_at_bat_id` ON `base_advances` (`at_bat_id`);