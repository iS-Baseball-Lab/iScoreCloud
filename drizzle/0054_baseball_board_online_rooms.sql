-- 0054_baseball_board_online_rooms.sql
-- 野球盤ミニゲーム：チーム内オンライン通信対戦ルームテーブル (baseball_board_rooms) の新設
CREATE TABLE IF NOT EXISTS `baseball_board_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL REFERENCES `teams`(`id`) ON DELETE cascade,
	`room_code` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`total_innings` integer DEFAULT 3 NOT NULL,
	`host_user_id` text NOT NULL,
	`host_name` text NOT NULL,
	`host_side` text DEFAULT 'away' NOT NULL,
	`guest_user_id` text,
	`guest_name` text,
	`turn_seq` integer DEFAULT 1 NOT NULL,
	`pitch_seq` integer DEFAULT 0 NOT NULL,
	`current_pitch_json` text,
	`last_play_json` text,
	`match_state_json` text NOT NULL,
	`rematch_requested_by` text,
	`host_last_seen_at` integer NOT NULL,
	`guest_last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_baseball_board_rooms_team_status` ON `baseball_board_rooms` (`team_id`, `status`, `updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_baseball_board_rooms_team_code` ON `baseball_board_rooms` (`team_id`, `room_code`);
