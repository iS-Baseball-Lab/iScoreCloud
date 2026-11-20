-- 0055_auth_player_match_perf_indexes.sql
-- 認証・選手照合・出欠および試合日付ソート用パフォーマンスインデックス一括補完（べき等）
CREATE INDEX IF NOT EXISTS `idx_session_user_id` ON `session` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_account_user_id` ON `account` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_account_account_id` ON `account` (`account_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_verification_identifier` ON `verification` (`identifier`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_players_user_id` ON `players` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_attendances_user_id` ON `attendances` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_matches_team_norm_date` ON `matches` (`team_id`, replace(`date`, '/', '-') DESC, `created_at` DESC);
