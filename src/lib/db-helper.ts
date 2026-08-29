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

  isEventsSchemaReady = true;
}
