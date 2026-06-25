ALTER TABLE `matches` ADD `live_my_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `live_opponent_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `live_my_inning_scores` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `matches` ADD `live_opponent_inning_scores` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `matches` ADD `live_status` text DEFAULT 'none' NOT NULL;