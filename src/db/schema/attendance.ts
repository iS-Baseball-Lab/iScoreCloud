import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { teams, players, teamMembers } from "./team";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startAt: integer("start_at", { mode: "timestamp" }).notNull(),
  endAt: integer("end_at", { mode: "timestamp" }),
  eventType: text("event_type").$type<"match" | "practice" | "meeting">().default("practice"),
  description: text("description"),
  location: text("location"),
  dutyGroup: text("duty_group"), // 当番班
});

export const attendances = sqliteTable("attendances", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  playerId: text("player_id").references(() => players.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => teamMembers.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id),
  status: text("status").$type<"present" | "absent" | "pending" | "late" | "partial">().default("pending"),
  roleInEvent: text("role_in_event").default("player"),
  hasCar: integer("has_car", { mode: "boolean" }).default(false),
  comment: text("comment"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  eventPlayerUniqueIdx: uniqueIndex("idx_event_player_uniq").on(table.eventId, table.playerId),
  eventMemberUniqueIdx: uniqueIndex("idx_event_member_uniq").on(table.eventId, table.memberId),
}));
