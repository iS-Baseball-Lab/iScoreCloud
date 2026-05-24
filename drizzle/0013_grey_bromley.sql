CREATE TABLE `match_undo_histories` (
	`match_id` text PRIMARY KEY NOT NULL,
	`history_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
