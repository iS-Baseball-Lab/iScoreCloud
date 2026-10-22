// filepath: src/lib/db-helper.ts

let isEventsSchemaReady = false;

/**
 * 🛠️ D1 の events テーブルに必要なカラム（needs_lunch, needs_snack 等）が
 * 確実に存在することを保証するセーフティマイグレーション関数
 */
export async function ensureEventColumns(d1?: any) {
  if (!d1 || isEventsSchemaReady) return;

  try {
    // needs_lunch カラムの追加 (既存の場合はエラーを無視)
    await d1.prepare("ALTER TABLE events ADD COLUMN needs_lunch integer DEFAULT 0").run().catch(() => {});
  } catch {}

  try {
    // needs_snack カラムの追加 (既存の場合はエラーを無視)
    await d1.prepare("ALTER TABLE events ADD COLUMN needs_snack integer DEFAULT 0").run().catch(() => {});
  } catch {}

  try {
    // duty_group カラムの追加
    await d1.prepare("ALTER TABLE events ADD COLUMN duty_group text").run().catch(() => {});
  } catch {}

  try {
    // target_group カラムの追加
    await d1.prepare("ALTER TABLE events ADD COLUMN target_group text").run().catch(() => {});
  } catch {}

  try {
    // pm_start_at カラムの追加
    await d1.prepare("ALTER TABLE events ADD COLUMN pm_start_at integer").run().catch(() => {});
  } catch {}

  try {
    // pm_end_at カラムの追加
    await d1.prepare("ALTER TABLE events ADD COLUMN pm_end_at integer").run().catch(() => {});
  } catch {}

  try {
    // pm_location カラムの追加
    await d1.prepare("ALTER TABLE events ADD COLUMN pm_location text").run().catch(() => {});
  } catch {}

  try {
    // activity_groups カラムの追加（複数活動グループ情報 JSON）
    await d1.prepare("ALTER TABLE events ADD COLUMN activity_groups text").run().catch(() => {});
  } catch {}

  try {
    // am_type カラムの追加（午前の活動種別、または 'off'）
    await d1.prepare("ALTER TABLE events ADD COLUMN am_type text").run().catch(() => {});
  } catch {}

  try {
    // selected_group_id カラムの追加（出欠回答時のグループ選択）
    await d1.prepare("ALTER TABLE attendances ADD COLUMN selected_group_id text").run().catch(() => {});
  } catch {}

  isEventsSchemaReady = true;
}

let isRulesSchemaReady = false;

/**
 * 🛠️ D1 の team_rules テーブルが確実に存在することを保証するセーフティマイグレーション関数
 */
export async function ensureRulesTable(d1?: any) {
  if (!d1 || isRulesSchemaReady) return;

  try {
    await d1.prepare(`
      CREATE TABLE IF NOT EXISTS team_rules (
        id text PRIMARY KEY NOT NULL,
        organization_id text,
        team_id text,
        title text NOT NULL,
        content text NOT NULL,
        category text NOT NULL DEFAULT 'general',
        scope text NOT NULL DEFAULT 'team',
        priority integer DEFAULT 0,
        is_important integer DEFAULT 0,
        image_url text,
        pdf_url text,
        pdf_name text,
        created_by_id text,
        created_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `).run().catch(() => {});
  } catch {}

  try {
    await d1.prepare("ALTER TABLE team_rules ADD COLUMN is_important integer DEFAULT 0").run().catch(() => {});
  } catch {}

  try {
    await d1.prepare("ALTER TABLE team_rules ADD COLUMN image_url text").run().catch(() => {});
  } catch {}

  try {
    await d1.prepare("ALTER TABLE team_rules ADD COLUMN pdf_url text").run().catch(() => {});
  } catch {}

  try {
    await d1.prepare("ALTER TABLE team_rules ADD COLUMN pdf_name text").run().catch(() => {});
  } catch {}

  try {
    await d1.prepare(`
      CREATE INDEX IF NOT EXISTS idx_team_rules_org_id ON team_rules (organization_id)
    `).run().catch(() => {});
  } catch {}

  try {
    await d1.prepare(`
      CREATE INDEX IF NOT EXISTS idx_team_rules_team_id ON team_rules (team_id)
    `).run().catch(() => {});
  } catch {}

  isRulesSchemaReady = true;
}

let isLinksSchemaReady = false;

/**
 * 🛠️ D1 の team_links テーブルが確実に存在することを保証するセーフティマイグレーション関数
 */
export async function ensureLinksTable(d1?: any) {
  if (!d1 || isLinksSchemaReady) return;

  try {
    await d1.prepare(`
      CREATE TABLE IF NOT EXISTS team_links (
        id text PRIMARY KEY NOT NULL,
        organization_id text,
        team_id text,
        title text NOT NULL,
        url text NOT NULL,
        description text,
        category text NOT NULL DEFAULT 'other',
        scope text NOT NULL DEFAULT 'team',
        priority integer DEFAULT 0,
        is_important integer DEFAULT 0,
        image_url text,
        created_by_id text,
        created_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `).run().catch(() => {});
  } catch {}

  try {
    await d1.prepare("ALTER TABLE team_links ADD COLUMN is_important integer DEFAULT 0").run().catch(() => {});
  } catch {}

  try {
    await d1.prepare("ALTER TABLE team_links ADD COLUMN image_url text").run().catch(() => {});
  } catch {}

  try {
    await d1.prepare(`
      CREATE INDEX IF NOT EXISTS idx_team_links_org_id ON team_links (organization_id)
    `).run().catch(() => {});
  } catch {}

  try {
    await d1.prepare(`
      CREATE INDEX IF NOT EXISTS idx_team_links_team_id ON team_links (team_id)
    `).run().catch(() => {});
  } catch {}

  isLinksSchemaReady = true;
}

let isMemberOrderSchemaReady = false;

/**
 * 🛠️ D1 の teams テーブルに member_sort_order カラムが存在することを保証する関数
 */
export async function ensureMemberOrderColumn(d1?: any) {
  if (!d1 || isMemberOrderSchemaReady) return;
  try {
    await d1.prepare("ALTER TABLE teams ADD COLUMN member_sort_order text").run().catch(() => {});
  } catch {}
  isMemberOrderSchemaReady = true;
}

let isStatusConfigSchemaReady = false;

/**
 * 🛠️ D1 の teams テーブルに attendance_status_config カラムが存在することを保証する関数
 */
export async function ensureStatusConfigColumn(d1?: any) {
  if (!d1 || isStatusConfigSchemaReady) return;
  try {
    await d1.prepare("ALTER TABLE teams ADD COLUMN attendance_status_config text").run().catch(() => {});
  } catch {}
  isStatusConfigSchemaReady = true;
}

let isMemberSubLabelsSchemaReady = false;

/**
 * 🛠️ D1 の teams テーブルに member_sub_labels カラムが存在することを保証する関数
 */
export async function ensureMemberSubLabelsColumn(d1?: any) {
  if (!d1 || isMemberSubLabelsSchemaReady) return;
  try {
    await d1.prepare("ALTER TABLE teams ADD COLUMN member_sub_labels text").run().catch(() => {});
  } catch {}
  isMemberSubLabelsSchemaReady = true;
}

