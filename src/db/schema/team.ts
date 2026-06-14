// src/db/schema/team.ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

// ==========================================
// 🏢 組織（クラブ全体）テーブル
// 一つのクラブが複数の年代やカテゴリを持つ場合の「大元」となる箱
// ==========================================
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // 例: "川崎中央シニア", "東京草野球アタッカーズ"
  shortName: text("short_name"), // スコアボード表示用の略称（例: "川崎中央", "東京A"）
  logoImageUrl: text("logo_image_url"), // PDFスコアブックのヘッダーに印字するチームロゴ
  description: text("description"), // チームのスローガンや紹介文
  foundedYear: integer("founded_year"), // 結成された年（西暦）
  category: text("category").notNull().default('other'), // 学童、中学硬式、草野球など
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ==========================================
// 🧢 チーム（年度ごと・階層ごとの編成）テーブル
// ==========================================
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(), // 例: "2026年度 1軍", "秋季大会用メンバー"
  year: integer('year').notNull().default(2026), // データの混在を防ぐ年度キー
  managerName: text('manager_name'), // 監督名（スコアブックのヘッダーに印字）
  captainId: text('captain_id'), // 主将の選手ID（名簿画面で「C」マークをつける用）
  homeGround: text('home_ground'), // 普段よく使う練習場所やグラウンド
  tier: text('tier'), // 'A', 'B', '1軍', '2軍' などの階層
  teamType: text('team_type').default('regular'), // 'regular'(公式用), 'practice'(練習用)
  lineGroupId: text('line_group_id'),
  isAutoReportEnabled: integer('is_auto_report_enabled', { mode: 'boolean' }).default(false),
  reportPlayballEnabled: integer('report_playball_enabled', { mode: 'boolean' }).notNull().default(true),
  reportInningEnabled: integer('report_inning_enabled', { mode: 'boolean' }).notNull().default(true),
  reportGameSetEnabled: integer('report_game_set_enabled', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ==========================================
// 👤 選手名簿（ロースター）テーブル
// ==========================================
export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // 選手名
  nameKana: text('name_kana'), // 選手名のよみがな
  uniformNumber: text('uniform_number').notNull(), // 背番号
  nickname: text('nickname'), 
  primaryPosition: text('primary_position'), // メインポジション
  subPositions: text('sub_positions', { mode: 'json' }).$type<string[]>(), 
  throws: text('throws'), // 'R'(右投), 'L'(左投)
  bats: text('bats'),     // 'R'(右打), 'L'(左打), 'B'(両打)
  height: integer('height'), 
  weight: integer('weight'), 
  profileImageUrl: text('profile_image_url'), 
  notes: text('notes'), 
  isActive: integer('is_active', { mode: 'boolean' }).default(true), 
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_players_team_id").on(table.teamId),
}));

// ==========================================
// 📋 スタメンテンプレート（事前オーダー保存）テーブル
// ==========================================
export const lineupTemplates = sqliteTable("lineup_templates", {
  id: text("id").primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), 
  lineupData: text("lineup_data", { mode: "json" }).notNull(), 
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_lineup_templates_team_id").on(table.teamId),
}));

// ==========================================
// 🏢 組織メンバー（権限管理）テーブル
// ==========================================
export const organizationMembers = sqliteTable("organization_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id), 
  role: text("role").notNull(), 
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  orgIdx: index("idx_org_members_org_id").on(table.organizationId),
  userIdx: index("idx_org_members_user_id").on(table.userId),
}));

// ==========================================
// 🤝 チーム所属メンバー（名簿 & 権限テーブル）
// ==========================================
export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id), // 💡 Nullable (アカウント未紐付けのメンバー対応)
  
  // 💡 名簿管理用の追加カラム
  name: text('name'),                                // 名前
  nameKana: text('name_kana'),                       // フリガナ
  memberType: text('member_type').notNull().default('parent'), // 'staff' | 'parent' | 'other'
  phone: text('phone'),                              // 電話番号
  email: text('email'),                              // メールアドレス
  
  role: text('role').notNull().default('player'), // 例: 'MANAGER'(監督・スコアラー), 'PLAYER'(閲覧のみ), 'pending'(申請中)
  status: text("status").notNull().default("active"),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_team_members_team_id").on(table.teamId),
  userIdx: index("idx_team_members_user_id").on(table.userId),
}));

export const teamRoleSettings = sqliteTable('team_role_settings', {
  id: text('id').primaryKey(),                  // 設定ID (ULID等)
  teamId: text('team_id').notNull(),            // チームIDへの参照
  role: text('role').notNull(),                  // 'MANAGER', 'COACH' 等のシステムロールキー
  customLabel: text('custom_label').notNull(),  // '代表', 'ヘッドコーチ' などのカスタム呼称
}, (table) => ({
  // 1つのチーム内で1つのロールに対して設定は1つのみ
  teamRoleIdx: uniqueIndex('team_role_idx').on(table.teamId, table.role),
}));

// ==========================================
// 👥 チーム内グループ（親子・階層構造対応）
// ==========================================
export const teamGroups = sqliteTable('team_groups', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),                      // グループ名 (例: "保護者会")
  parentId: text('parent_id').references((): any => teamGroups.id, { onDelete: 'cascade' }), // 親グループID (階層構造用)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_team_groups_team_id").on(table.teamId),
  parentIdx: index("idx_team_groups_parent_id").on(table.parentId),
}));

// ==========================================
// 🔗 グループ所属メンバーと役割（選手・その他メンバー両対応）
// ==========================================
export const teamGroupMembers = sqliteTable('team_group_members', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => teamGroups.id, { onDelete: 'cascade' }),
  playerId: text('player_id').references(() => players.id, { onDelete: 'cascade' }),       // 選手ID (Nullable)
  teamMemberId: text('team_member_id').references(() => teamMembers.id, { onDelete: 'cascade' }), // 選手以外ID (Nullable)
  role: text('role'),                                 // グループ内での役割 (例: "会計", "車当番", "ヘッドコーチ")
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  groupIdx: index("idx_tg_members_group_id").on(table.groupId),
  playerIdx: index("idx_tg_members_player_id").on(table.playerId),
  teamMemberIdx: index("idx_tg_members_team_member_id").on(table.teamMemberId),
}));
