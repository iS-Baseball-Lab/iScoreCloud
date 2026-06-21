// filepath: src/db/schema/equipment.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { teams, teamMembers } from "./team";
import { events } from "./attendance";
import { eventCarpools } from "./carpool";

// ==========================================
// 🎒 チームの道具マスタ
// ==========================================
export const teamEquipments = sqliteTable("team_equipments", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // 例: "キャッチャー防具一式", "バットケース", "ラインカー"
  description: text("description"), // 補足説明
  isHeavy: integer("is_heavy", { mode: "boolean" }).default(false), // 道具車（cargo車）推奨フラグ
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_team_equipments_team_id").on(table.teamId),
}));

// ==========================================
// 📦 イベントごとの道具積載・担当状況
// ==========================================
export const eventEquipments = sqliteTable("event_equipments", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  equipmentId: text("equipment_id").notNull().references(() => teamEquipments.id, { onDelete: "cascade" }),
  carpoolId: text("carpool_id").references(() => eventCarpools.id, { onDelete: "set null" }), // 積み込む車
  responsibleMemberId: text("responsible_member_id").references(() => teamMembers.id, { onDelete: "set null" }), // 持ち出し・返却の担当者
  status: text("status").$type<"pending" | "loaded" | "returned">().default("pending"), // 積載待ち / 積載済 / 返却完了
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  eventIdx: index("idx_event_equipments_event_id").on(table.eventId),
  equipmentIdx: index("idx_event_equipments_eq_id").on(table.equipmentId),
  carpoolIdx: index("idx_event_equipments_cp_id").on(table.carpoolId),
}));
