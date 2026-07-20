ALTER TABLE `play_logs` ADD `at_bat_id` text REFERENCES at_bats(id);--> statement-breakpoint
CREATE INDEX `idx_play_logs_at_bat_id` ON `play_logs` (`at_bat_id`);