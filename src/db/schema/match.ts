// filepath: src/db/schema/match.ts
/* 💡 i-Score 現場仕様拡張: 
   1. currentInning, isBottom を追加し、LINE速報の自動生成（○回表/裏）を完全自動化。
   2. isTiebreaker, isColdGame フラグにより、記録としての正確性を担保する。
   3. 現場視認性のため、デフォルトイニングは中学・草野球標準の「7」へ調整。 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { teams, players } from "./team";

// ==========================================
// 🏆 大会（トーナメント）テーブル
// 試合のレギュレーション（ルール）を管理
// ==========================================
export const tournaments = sqliteTable("tournaments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // 例: "第15回 関東秋季大会"
  category: text("category").notNull().default('other'), // 学童、中学、草野球などのカテゴリ
  season: text("season").notNull(), // 例: "2026"
  organizer: text("organizer"), // 主催者・連盟名
  bracketUrl: text("bracket_url"), // 公式のトーナメント表（Webページ）へのリンク
  timeLimit: text("time_limit"), // 例: "1時間30分 (新しいイニングに入らない)"
  coldGameRule: text("cold_game_rule"), // 例: "3回10点、5回7点差"
  tiebreakerRule: text("tiebreaker_rule"), // 例: "タイブレーク: 1アウト満塁から"
  startDate: text("start_date"), // 大会開幕日
  endDate: text("end_date"), // 大会終了日
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ==========================================
// 🗺️ 球場・グラウンド（Venues）テーブル
// マップ連携や、グラウンド特有のコンディション情報を管理
// ==========================================
export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // 例: "多摩川緑地野球場"
  shortName: text("short_name"), // 画面表示用の略称
  address: text("address"), // 住所
  mapUrl: text("map_url"), // Google Map等のURL（配車や集合時にメンバーへ共有）
  surfaceType: text("surface_type"), // 'dirt'(土), 'turf'(人工芝), 'grass'(天然芝) ※スパイク指定用
  dimensions: text("dimensions"), // 球場の広さ 例: "両翼90m センター110m"
  notes: text("notes"), // 例: "駐車場から遠い", "ファウルボール注意" などのローカルメモ
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ==========================================
// ⚾️ 試合テーブル
// スコア記録の親となる、試合ごとの基本情報
// ==========================================
export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  tournamentId: text("tournament_id").references(() => tournaments.id),
  opponent: text("opponent").notNull(),
  date: text("date").notNull(),
  matchType: text("match_type").notNull(), // 'official', 'practice'
  battingOrder: text("batting_order").notNull(), // 'first'(先攻), 'second'(後攻)

  // 🌟 追加：ベンチ位置（1塁側 / 3塁側 / 未定）当日グラウンドで決まるケースに対応！
  benchSide: text("bench_side", { enum: ["unknown", "1B", "3B"] }).notNull().default("unknown"),

  // 🌟 現在の試合進行状況（LINE速報の心臓部）
  currentInning: integer("current_inning").notNull().default(1),
  isBottom: integer("is_bottom", { mode: "boolean" }).notNull().default(false), // false: 表, true: 裏

  // 🌟 特別ルール・決着フラグ
  isTiebreaker: integer("is_tiebreaker", { mode: "boolean" }).notNull().default(false),
  isColdGame: integer("is_cold_game", { mode: "boolean" }).notNull().default(false),

  venueId: text("venue_id").references(() => venues.id),
  surfaceDetails: text("surface_details"),

  // 🌟 現場仕様：規定イニングを草野球標準の 7回 に設定
  innings: integer("innings").notNull().default(7),

  status: text("status").notNull().default("scheduled"), // 'scheduled', 'live', 'finished', 'rainout'

  myScore: integer("my_score").notNull().default(0),
  opponentScore: integer("opponent_score").notNull().default(0),

  // JSON文字列で各回の得点を保持
  myInningScores: text("my_inning_scores").default('[]'),
  opponentInningScores: text("opponent_inning_scores").default('[]'),

  // 🌟 試合の詳細状況（BSO、ランナー、ヒット、エラー）
  balls: integer("balls").notNull().default(0),
  strikes: integer("strikes").notNull().default(0),
  outs: integer("outs").notNull().default(0),
  runners: text("runners").default('{"base1":null,"base2":null,"base3":null}'),
  myHits: integer("my_hits").notNull().default(0),
  opponentHits: integer("opponent_hits").notNull().default(0),
  myErrors: integer("my_errors").notNull().default(0),
  opponentErrors: integer("opponent_errors").notNull().default(0),

  // JSON文字列でスタメンを保持（相手チームはダミーの可能性があるためJSONで完結させる）
  myLineup: text("my_lineup").default('[]'),
  opponentLineup: text("opponent_lineup").default('[]'),
  myAttendance: text("my_attendance").default('{}'),

  weather: text("weather"),
  youtubeUrl: text("youtube_url"),
  liveMyScore: integer("live_my_score").notNull().default(0),
  liveOpponentScore: integer("live_opponent_score").notNull().default(0),
  liveMyInningScores: text("live_my_inning_scores").default('[]'),
  liveOpponentInningScores: text("live_opponent_inning_scores").default('[]'),
  liveStatus: text("live_status").notNull().default("none"), // 'none', 'draft', 'completed'
  lockedByUserId: text("locked_by_user_id"),
  lockedByUserName: text("locked_by_user_name"),
  lockedAt: integer("locked_at", { mode: "timestamp" }),
  lockExpiresAt: integer("lock_expires_at", { mode: "timestamp" }),
  
  // 🌟 AIスコアブック解析の矛盾点（バリデーションメッセージ）を保持するJSON文字列
  scorebookValidations: text("scorebook_validations").default('[]'),
  
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_matches_team_id").on(table.teamId),
  tournamentIdx: index("idx_matches_tournament_id").on(table.tournamentId),
  dateIdx: index("idx_matches_date").on(table.date),
}));

// ==========================================
// 📋 試合出場枠（スタメン＆途中出場）テーブル
// 「誰が・何番で・どこを守ったか」の歴史。スコアブック描画の要！
// ==========================================
export const matchLineups = sqliteTable('match_lineups', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
  battingOrder: integer('batting_order').notNull(), // 打順: 1〜9 (DH制度なら10や11も考慮)
  position: text('position').notNull(), // 守備位置: '1'(投)〜'9'(右), 'D'(DH), 'P'(代打), 'R'(代走)
  isStarting: integer("is_starting", { mode: "boolean" }).notNull().default(true), // スタメン(true)か途中出場(false)か
  inningEntered: integer("inning_entered").default(1), // 途中出場の場合、何回から出場したか（交代の波線を描画する用）
}, (table) => ({
  matchIdx: index("idx_match_lineups_match_id").on(table.matchId), // 試合詳細を開いた時にスタメンを爆速取得
}));
