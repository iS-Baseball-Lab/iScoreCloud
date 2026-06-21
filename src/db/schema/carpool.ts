// filepath: src/db/schema/carpool.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { teams, players, teamMembers } from "./team";
import { events } from "./attendance";

// ==========================================
// 🔗 選手と保護者の親子関係テーブル
// ==========================================
export const parentChildRelations = sqliteTable("parent_child_relations", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  parentId: text("parent_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" }), // 保護者(大人のメンバー)
  childId: text("child_id").notNull().references(() => players.id, { onDelete: "cascade" }),    // 選手(子供のメンバー)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_pc_relations_team_id").on(table.teamId),
  parentIdx: index("idx_pc_relations_parent_id").on(table.parentId),
  childIdx: index("idx_pc_relations_child_id").on(table.childId),
}));

// ==========================================
// 🚗 各メンバーの登録車両情報テーブル
// ==========================================
export const memberCars = sqliteTable("member_cars", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").references(() => teamMembers.id, { onDelete: "cascade" }), // 🌟 複数所有・バス対応：任意に
  ownerId2: text("owner_id2").references(() => teamMembers.id, { onDelete: "set null" }), // 🌟 第二所有者
  name: text("name").notNull(), // 例: "セレナ", "アルファード", "デミオ"
  color: text("color"), // 車の色名称
  colorCode: text("color_code"), // 車の色カラーコード (HEX)
  numberPlate: text("number_plate"), // ナンバープレート番号 (下4桁など)
  capacity: integer("capacity").notNull().default(4), // 乗車定員（運転手を除く乗れる人数）
  fuelEfficiency: integer("fuel_efficiency").notNull().default(10), // 燃費 (km/L)
  carType: text("car_type").$type<"normal" | "cargo" | "bus">().default("normal"), // 普通車 / 道具車 / バス
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_member_cars_team_id").on(table.teamId),
  ownerIdx: index("idx_member_cars_owner_id").on(table.ownerId),
  owner2Idx: index("idx_member_cars_owner_id2").on(table.ownerId2),
}));

// ==========================================
// ⚙️ イベント別の配車・交通費共通設定テーブル
// ==========================================
export const eventCarpoolSettings = sqliteTable("event_carpool_settings", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  distanceKm: integer("distance_km").default(0), // 往復の走行距離 (km)
  gasolinePrice: integer("gasoline_price").default(170), // ガソリン時価単価 (レギュラーガソリン1Lあたり円)
  splitMethod: text("split_method").$type<"by_car" | "by_team">().default("by_team"), // 車ごとに割り勘 / 全体で均等割り
  noParentChild: integer("no_parent_child", { mode: "boolean" }).default(true), // 親子同乗禁止ルールを適用するか
}, (table) => ({
  eventIdx: index("idx_ec_settings_event_id").on(table.eventId),
}));

// ==========================================
// 🚙 イベントごとの配車枠テーブル
// ==========================================
export const eventCarpools = sqliteTable("event_carpools", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  driverId: text("driver_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" }),
  carId: text("car_id").references(() => memberCars.id, { onDelete: "set null" }), // どの車を使うか (任意)
  capacity: integer("capacity").notNull(), // その日の乗車可能定員（大人・子供含む、運転手除く）
  carType: text("car_type").$type<"normal" | "cargo" | "bus">().default("normal"), // その日の車両区分
  highwayFee: integer("highway_fee").default(0), // 高速料金 (往復)
  parkingFee: integer("parking_fee").default(0), // 駐車場料金
}, (table) => ({
  eventIdx: index("idx_event_carpools_event_id").on(table.eventId),
  driverIdx: index("idx_event_carpools_driver_id").on(table.driverId),
}));

// ==========================================
// 🧑‍🤝‍🧑 各車への配車乗車メンバーテーブル
// ==========================================
export const eventCarpoolRiders = sqliteTable("event_carpool_riders", {
  id: text("id").primaryKey(),
  carpoolId: text("carpool_id").notNull().references(() => eventCarpools.id, { onDelete: "cascade" }),
  playerId: text("player_id").references(() => players.id, { onDelete: "cascade" }), // 同乗する選手 (Nullable)
  memberId: text("member_id").references(() => teamMembers.id, { onDelete: "cascade" }), // 同乗する大人/指導者/保護者 (Nullable)
}, (table) => ({
  carpoolIdx: index("idx_ec_riders_carpool_id").on(table.carpoolId),
  playerIdx: index("idx_ec_riders_player_id").on(table.playerId),
  memberIdx: index("idx_ec_riders_member_id").on(table.memberId),
}));
