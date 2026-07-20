// src/db/schema/score.ts
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { matches } from "./match";
import { players } from "./team";

// ==========================================
// 🏏 打席（At Bat）テーブル
// 1回の打席ごとの結果を記録。個人成績（打率・防御率など）の集計元
// ==========================================
export const atBats = sqliteTable("at_bats", {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    inning: integer("inning").notNull(), // イニング数 (例: 1, 2, 3...)
    isTop: integer("is_top", { mode: "boolean" }).notNull(), // 表(true)か裏(false)か
    batterId: text("batter_id").references(() => players.id), // 打席に立ったバッターのID
    pitcherId: text("pitcher_id").references(() => players.id), // 投げていたピッチャーのID
    result: text("result"), // 打席の最終結果 (例: '1B'(単打), 'K'(三振), 'BB'(四球), '6-3'(遊ゴロ))
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
    matchIdx: index("idx_at_bats_match_id").on(table.matchId),
    batterIdx: index("idx_at_bats_batter_id").on(table.batterId), // 🔥山田選手のシーズン打席一覧を一瞬で出す！
    pitcherIdx: index("idx_at_bats_pitcher_id").on(table.pitcherId), // 🔥佐藤投手のシーズン投球回を一瞬で出す！
}));

// ==========================================
// ⚾️ 1球ごとの投球（Pitch）テーブル
// 配球図（チャート）の描画や、カウント管理に使用
// ==========================================
export const pitches = sqliteTable("pitches", {
    id: text("id").primaryKey(),
    atBatId: text("at_bat_id").notNull().references(() => atBats.id, { onDelete: "cascade" }),
    pitchNumber: integer("pitch_number").notNull(), // この打席で何球目か (1, 2, 3...)
    result: text("result").notNull(), // 投球結果: 'strike', 'ball', 'foul', 'hit', 'swinging_strike'(空振り)
    ballsBefore: integer("balls_before").notNull().default(0), // 投げる前のボールカウント
    strikesBefore: integer("strikes_before").notNull().default(0), // 投げる前のストライクカウント
    zoneX: real("zone_x"), // ストライクゾーンのX座標 (-1.0 〜 1.0 などUIで決めたスケール)
    zoneY: real("zone_y"), // ストライクゾーンのY座標
    pitchType: text("pitch_type"), // 球種（'fastball', 'slider' 等。将来的な拡張用）
    pitchSpeed: integer("pitch_speed"), // 球速 (km/h)
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
    atBatIdx: index("idx_pitches_at_bat_id").on(table.atBatId), // 打席ごとの球歴を爆速取得
}));

// ==========================================
// 🏃‍♂️ 進塁・走塁（Base Advances）テーブル
// 【超重要】早稲田式スコアブック特有の「ひし形の赤字（盗塁S、暴投Wなど）」を描画するための心臓部
// ==========================================
export const baseAdvances = sqliteTable("base_advances", {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    atBatId: text("at_bat_id").notNull().references(() => atBats.id, { onDelete: "cascade" }), // 誰の打席中に起きた進塁か
    pitchId: text("pitch_id").references(() => pitches.id), // どの投球のタイミングで起きたか（盗塁等の記録用）
    runnerId: text("runner_id").references(() => players.id), // 走者（ランナー）のID (未登録選手の場合は null)
    fromBase: integer("from_base").notNull(), // 元いた塁 (0: バッターボックス, 1: 1塁, 2: 2塁, 3: 3塁)
    toBase: integer("to_base").notNull(),     // 進んだ（またはアウトになった）先の塁 (1, 2, 3, 4: 本塁)
    reason: text("reason").notNull(), // 進塁理由（PDF出力時の記号の元！） 例: 'hit'(安打), 'steal'(盗塁), 'wp'(暴投), 'error'(エラー)
    isOut: integer("is_out", { mode: "boolean" }).notNull().default(false), // 牽制死や盗塁死など、進塁に失敗してアウトになった場合は true
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
    matchIdx: index("idx_base_advances_match_id").on(table.matchId),
    atBatIdx: index("idx_base_advances_at_bat_id").on(table.atBatId),
}));

// ==========================================
// 📝 プレイログ・実況テーブル
// アプリUI上の「タイムライン（実況板）」に表示するテキストデータ
// ==========================================
export const playLogs = sqliteTable("play_logs", {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    inningText: text("inning_text").notNull(), // 見出し用 (例: "1回表")
    resultType: text("result_type").notNull(), // アイコンの色分け等に使用 (例: 'hit', 'out', 'score', 'sub'(交代))
    description: text("description").notNull(), // 実況テキスト (例: "1番 山田: センター前へのクリーンヒット！")
    validationMessage: text("validation_message"), // 🌟 AI解析による矛盾点・エラーの個別メモ
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
    matchIdx: index("idx_play_logs_match_id").on(table.matchId),
}));

// ==========================================
// 🔄 UNDO履歴（Undo Histories）テーブル
// 共同編集者間でUNDO履歴を同期・共有するための専用ストア
// ==========================================
export const matchUndoHistories = sqliteTable("match_undo_histories", {
    matchId: text("match_id").primaryKey().references(() => matches.id, { onDelete: "cascade" }),
    historyJson: text("history_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
});