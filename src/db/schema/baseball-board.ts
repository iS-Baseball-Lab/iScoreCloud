// filepath: src/db/schema/baseball-board.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { teams } from "./team";

/**
 * ⚾ 野球盤ミニゲーム：チーム内オンライン通信対戦ルーム
 * ※ 公式の試合スコア・個人成績・チーム戦績テーブルとは100%完全独立（12時間で自動クリーンアップ）
 */
export const baseballBoardRooms = sqliteTable(
  "baseball_board_rooms",
  {
    id: text("id").primaryKey().notNull(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roomCode: text("room_code").notNull(),
    status: text("status").notNull().default("waiting"), // 'waiting' | 'playing' | 'finished' | 'closed'
    totalInnings: integer("total_innings").notNull().default(3),
    hostUserId: text("host_user_id").notNull(),
    hostName: text("host_name").notNull(),
    hostSide: text("host_side").notNull().default("away"), // 'away' | 'home'
    guestUserId: text("guest_user_id"),
    guestName: text("guest_name"),
    turnSeq: integer("turn_seq").notNull().default(1),
    pitchSeq: integer("pitch_seq").notNull().default(0),
    currentPitchJson: text("current_pitch_json"),
    lastPlayJson: text("last_play_json"),
    matchStateJson: text("match_state_json").notNull(),
    rematchRequestedBy: text("rematch_requested_by"), // 'host' | 'guest' | null
    hostLastSeenAt: integer("host_last_seen_at").notNull(),
    guestLastSeenAt: integer("guest_last_seen_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_baseball_board_rooms_team_status").on(
      table.teamId,
      table.status,
      table.updatedAt
    ),
    index("idx_baseball_board_rooms_team_code").on(
      table.teamId,
      table.roomCode
    ),
  ]
);
