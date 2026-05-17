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
// 現場の声：「去年のAチームと今年のAチームは別物として管理したい」
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
  // 🌟 LINE 連携用の追加カラム
  /** 💡 Webhook で取得したグループ固有の ID */
  lineGroupId: text('line_group_id'),
  /** 💡 自動速報の有効化フラグ (0:無効, 1:有効) */
  isAutoReportEnabled: integer('is_auto_report_enabled', { mode: 'boolean' }).default(false),
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ==========================================
// 👤 選手名簿（ロースター）テーブル
// チームに所属する全選手のデータベース
// ==========================================
export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // 選手名（スコアブック印字用）
  uniformNumber: text('uniform_number').notNull(), // 背番号 (00や監督の30番等も考慮し文字列)
  nickname: text('nickname'), // アプリ内のタイムライン実況で呼ぶ愛称
  primaryPosition: text('primary_position'), // メインポジション（例: '1'(投), '2'(捕)）
  subPositions: text('sub_positions', { mode: 'json' }).$type<string[]>(), // 守れるサブポジの配列（交代UIでサジェストする用）
  throws: text('throws'), // 'R'(右投), 'L'(左投)
  bats: text('bats'),     // 'R'(右打), 'L'(左打), 'B'(両打)
  height: integer('height'), // 身長(cm)
  weight: integer('weight'), // 体重(kg)
  profileImageUrl: text('profile_image_url'), // 選手アイコン画像
  notes: text('notes'), // 「肩痛い」「代走のみ」など、監督・スコアラー向け秘密のメモ
  isActive: integer('is_active', { mode: 'boolean' }).default(true), // 今日来ているか、ケガで休んでいないか（UIの表示切替用）
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_players_team_id").on(table.teamId), // チームの選手一覧を開く時の爆速化インデックス
}));

// ==========================================
// 📋 スタメンテンプレート（事前オーダー保存）テーブル
// 現場の声：「試合前のメンバー登録を10秒で終わらせたい！」
// ==========================================
export const lineupTemplates = sqliteTable("lineup_templates", {
  id: text("id").primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // 例: "Aチーム ベストメンバー", "全員打ち練習用"
  lineupData: text("lineup_data", { mode: "json" }).notNull(), // JSON配列で一括保存 [{playerId:"x", order:1, pos:"8"}, ...]
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  teamIdx: index("idx_lineup_templates_team_id").on(table.teamId),
}));

// ==========================================
// 🏢 組織メンバー（権限管理）テーブル
// クラブ全体を管理するオーナーや総監督などの権限を管理
// ==========================================
export const organizationMembers = sqliteTable("organization_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id), // Authユーザー
  role: text("role").notNull(), // 例: 'OWNER' (代表), 'ADMIN' (総監督), 'MEMBER' (保護者/選手)

  // 🔥 ここを追加！（'active': 承認済み/参加中, 'pending': 参加申請中）
  status: text("status").notNull().default("active"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  orgIdx: index("idx_org_members_org_id").on(table.organizationId),
  userIdx: index("idx_org_members_user_id").on(table.userId),
}));

// ==========================================
// 🤝 チーム所属（メンバー・権限）テーブル
// ※ players(選手名簿)とは異なり、「アプリのユーザー」がどのチームの編集権限を持つかを管理
// ==========================================
export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id), // Authユーザー
  role: text('role').notNull(), // 例: 'MANAGER'(監督・スコアラー), 'PLAYER'(閲覧のみ)

  // 🔥 ここを追加！（'active': 承認済み/参加中, 'pending': 参加申請中）
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
