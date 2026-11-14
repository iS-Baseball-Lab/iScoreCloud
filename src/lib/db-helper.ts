// filepath: src/lib/db-helper.ts
import {
  normalizeLegacyForceOutAtBat,
  repairPlayLogForceOutDescription,
} from "@/lib/liff/scorebook-fielding";
import type { ScorebookV2AtBat } from "@/types/scorebook-v2";

/**
 * ⚡ 高速・ゼロ書き込みロックのスキーマ整合性チェックヘルパー
 * - 毎回直列で `ALTER TABLE` / `CREATE TABLE`（D1プライマリへの書き込みロック）を投げるのを完全廃止。
 * - Isolate ごとに初回1回のみ `d1.batch` で `sqlite_master` と `PRAGMA table_info` を一括読取（1往復・約10ms）し、
 *   万が一不足しているテーブル・カラム・インデックスが存在する場合のみ DDL を実行する（本番稼働中は書き込み0回）。
 */

interface SqliteMasterRow {
  type?: string;
  name?: string;
}

interface PragmaColumnRow {
  name?: string;
}

interface SnapshotRepairRow {
  match_id: string;
  top_at_bats_json: string | null;
  bottom_at_bats_json: string | null;
}

interface DbAtBatRepairRow {
  id: string;
  inning: number;
  is_top: number;
  result: string | null;
}

interface DbPlayLogRepairRow {
  id: string;
  match_id: string;
  at_bat_id: string | null;
  description: string;
}

let isAllSchemaVerified = false;
let schemaVerificationPromise: Promise<void> | null = null;

const REQUIRED_COLUMNS: Record<string, Array<{ name: string; ddl: string }>> = {
  organizations: [
    { name: "google_maps_api_key", ddl: "ALTER TABLE organizations ADD COLUMN google_maps_api_key text" },
    { name: "cover_image_url", ddl: "ALTER TABLE organizations ADD COLUMN cover_image_url text" },
  ],
  events: [
    { name: "needs_lunch", ddl: "ALTER TABLE events ADD COLUMN needs_lunch integer DEFAULT 0" },
    { name: "needs_snack", ddl: "ALTER TABLE events ADD COLUMN needs_snack integer DEFAULT 0" },
    { name: "duty_group", ddl: "ALTER TABLE events ADD COLUMN duty_group text" },
    { name: "target_group", ddl: "ALTER TABLE events ADD COLUMN target_group text" },
    { name: "pm_start_at", ddl: "ALTER TABLE events ADD COLUMN pm_start_at integer" },
    { name: "pm_end_at", ddl: "ALTER TABLE events ADD COLUMN pm_end_at integer" },
    { name: "pm_location", ddl: "ALTER TABLE events ADD COLUMN pm_location text" },
    { name: "activity_groups", ddl: "ALTER TABLE events ADD COLUMN activity_groups text" },
    { name: "am_type", ddl: "ALTER TABLE events ADD COLUMN am_type text" },
  ],
  attendances: [
    { name: "selected_group_id", ddl: "ALTER TABLE attendances ADD COLUMN selected_group_id text" },
  ],
  teams: [
    { name: "member_sort_order", ddl: "ALTER TABLE teams ADD COLUMN member_sort_order text" },
    { name: "attendance_status_config", ddl: "ALTER TABLE teams ADD COLUMN attendance_status_config text" },
    { name: "member_sub_labels", ddl: "ALTER TABLE teams ADD COLUMN member_sub_labels text" },
    { name: "scorebook_legend_url", ddl: "ALTER TABLE teams ADD COLUMN scorebook_legend_url text" },
    { name: "scorebook_symbol_rules", ddl: "ALTER TABLE teams ADD COLUMN scorebook_symbol_rules text" },
    { name: "schedule_default_times", ddl: "ALTER TABLE teams ADD COLUMN schedule_default_times text" },
  ],
  matches: [
    { name: "my_lineup", ddl: "ALTER TABLE matches ADD COLUMN my_lineup text DEFAULT '[]'" },
    { name: "opponent_lineup", ddl: "ALTER TABLE matches ADD COLUMN opponent_lineup text DEFAULT '[]'" },
    { name: "opponent_bench", ddl: "ALTER TABLE matches ADD COLUMN opponent_bench text DEFAULT '[]'" },
    { name: "my_attendance", ddl: "ALTER TABLE matches ADD COLUMN my_attendance text DEFAULT '{}'" },
    { name: "my_hits", ddl: "ALTER TABLE matches ADD COLUMN my_hits integer DEFAULT 0" },
    { name: "opponent_hits", ddl: "ALTER TABLE matches ADD COLUMN opponent_hits integer DEFAULT 0" },
    { name: "my_errors", ddl: "ALTER TABLE matches ADD COLUMN my_errors integer DEFAULT 0" },
    { name: "opponent_errors", ddl: "ALTER TABLE matches ADD COLUMN opponent_errors integer DEFAULT 0" },
    { name: "bench_side", ddl: "ALTER TABLE matches ADD COLUMN bench_side text DEFAULT 'unknown'" },
    { name: "scorebook_validations", ddl: "ALTER TABLE matches ADD COLUMN scorebook_validations text DEFAULT '[]'" },
    { name: "match_day_ops", ddl: "ALTER TABLE matches ADD COLUMN match_day_ops text DEFAULT '{}'" },
  ],
  players: [
    { name: "nickname", ddl: "ALTER TABLE players ADD COLUMN nickname text" },
    { name: "sub_positions", ddl: "ALTER TABLE players ADD COLUMN sub_positions text" },
    { name: "height", ddl: "ALTER TABLE players ADD COLUMN height integer" },
    { name: "weight", ddl: "ALTER TABLE players ADD COLUMN weight integer" },
    { name: "notes", ddl: "ALTER TABLE players ADD COLUMN notes text" },
    { name: "profile_image_url", ddl: "ALTER TABLE players ADD COLUMN profile_image_url text" },
    { name: "condition_status", ddl: "ALTER TABLE players ADD COLUMN condition_status text DEFAULT 'active'" },
    { name: "condition_note", ddl: "ALTER TABLE players ADD COLUMN condition_note text" },
    { name: "profile_details", ddl: "ALTER TABLE players ADD COLUMN profile_details text" },
  ],
  venues: [
    { name: "category", ddl: "ALTER TABLE venues ADD COLUMN category TEXT DEFAULT 'stadium'" },
    { name: "parking_info", ddl: "ALTER TABLE venues ADD COLUMN parking_info TEXT" },
    { name: "spike_rule", ddl: "ALTER TABLE venues ADD COLUMN spike_rule TEXT" },
  ],
  team_rules: [
    { name: "is_important", ddl: "ALTER TABLE team_rules ADD COLUMN is_important integer DEFAULT 0" },
    { name: "image_url", ddl: "ALTER TABLE team_rules ADD COLUMN image_url text" },
    { name: "pdf_url", ddl: "ALTER TABLE team_rules ADD COLUMN pdf_url text" },
    { name: "pdf_name", ddl: "ALTER TABLE team_rules ADD COLUMN pdf_name text" },
  ],
  team_links: [
    { name: "is_important", ddl: "ALTER TABLE team_links ADD COLUMN is_important integer DEFAULT 0" },
    { name: "image_url", ddl: "ALTER TABLE team_links ADD COLUMN image_url text" },
  ],
  member_cars: [
    { name: "owner_id2", ddl: "ALTER TABLE member_cars ADD COLUMN owner_id2 text" },
    { name: "color_code", ddl: "ALTER TABLE member_cars ADD COLUMN color_code text" },
    { name: "car_type", ddl: "ALTER TABLE member_cars ADD COLUMN car_type text DEFAULT 'normal'" },
  ],
  match_live_reports: [
    { name: "editor_owner_key", ddl: "ALTER TABLE match_live_reports ADD COLUMN editor_owner_key text" },
  ],
};

const REQUIRED_TABLES: Array<{ name: string; ddl: string }> = [
  {
    name: "team_rules",
    ddl: `CREATE TABLE IF NOT EXISTS team_rules (
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
    )`,
  },
  {
    name: "team_links",
    ddl: `CREATE TABLE IF NOT EXISTS team_links (
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
    )`,
  },
  {
    name: "lineup_templates",
    ddl: `CREATE TABLE IF NOT EXISTS lineup_templates (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      name text NOT NULL,
      lineup_data text NOT NULL,
      created_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
  {
    name: "match_scorebook_snapshots",
    ddl: `CREATE TABLE IF NOT EXISTS match_scorebook_snapshots (
      match_id text PRIMARY KEY NOT NULL,
      top_structure_json text,
      bottom_structure_json text,
      top_at_bats_json text,
      bottom_at_bats_json text,
      top_image_url text,
      bottom_image_url text,
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
  {
    name: "match_live_reports",
    ddl: `CREATE TABLE IF NOT EXISTS match_live_reports (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      match_id text,
      report_json text NOT NULL,
      editor_owner_key text,
      updated_by_name text,
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
  {
    name: "carpool_live_locations",
    ddl: `CREATE TABLE IF NOT EXISTS carpool_live_locations (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      event_id text NOT NULL,
      carpool_id text NOT NULL,
      direction text NOT NULL DEFAULT 'outbound',
      is_sharing integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'moving',
      latitude real,
      longitude real,
      heading real,
      speed_kmh real,
      accuracy_m real,
      sender_user_id text,
      sender_name text,
      updated_at integer NOT NULL
    )`,
  },
  {
    name: "player_condition_periods",
    ddl: `CREATE TABLE IF NOT EXISTS player_condition_periods (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      player_id text NOT NULL,
      status text NOT NULL,
      start_date text NOT NULL,
      end_date text,
      private_note text,
      created_at integer NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
  {
    name: "team_role_settings",
    ddl: `CREATE TABLE IF NOT EXISTS team_role_settings (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      role text NOT NULL,
      custom_label text NOT NULL
    )`,
  },
  {
    name: "team_equipments",
    ddl: `CREATE TABLE IF NOT EXISTS team_equipments (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      name text NOT NULL,
      description text,
      is_heavy integer DEFAULT 0,
      quantity integer DEFAULT 1,
      created_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
];

const REQUIRED_INDEXES: Array<{ name: string; ddl: string }> = [
  { name: "idx_team_rules_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_rules_org_id ON team_rules (organization_id)" },
  { name: "idx_team_rules_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_rules_team_id ON team_rules (team_id)" },
  { name: "idx_team_links_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_links_org_id ON team_links (organization_id)" },
  { name: "idx_team_links_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_links_team_id ON team_links (team_id)" },
  { name: "idx_lineup_templates_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_lineup_templates_team_id ON lineup_templates (team_id)" },
  { name: "idx_match_live_reports_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_match_live_reports_team_id ON match_live_reports (team_id)" },
  { name: "idx_match_live_reports_match_id", ddl: "CREATE INDEX IF NOT EXISTS idx_match_live_reports_match_id ON match_live_reports (match_id)" },
  { name: "idx_carpool_live_event_dir", ddl: "CREATE INDEX IF NOT EXISTS idx_carpool_live_event_dir ON carpool_live_locations (event_id, direction)" },
  { name: "idx_carpool_live_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_carpool_live_team_id ON carpool_live_locations (team_id)" },
  { name: "idx_player_cond_periods_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_player_cond_periods_team_id ON player_condition_periods (team_id)" },
  { name: "idx_player_cond_periods_player_id", ddl: "CREATE INDEX IF NOT EXISTS idx_player_cond_periods_player_id ON player_condition_periods (player_id)" },
  { name: "team_role_idx", ddl: "CREATE UNIQUE INDEX IF NOT EXISTS team_role_idx ON team_role_settings (team_id, role)" },
  { name: "idx_team_equipments_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_equipments_team_id ON team_equipments (team_id)" },
];

export async function ensureAllSchemasOnce(d1?: D1Database | null): Promise<void> {
  if (!d1 || isAllSchemaVerified) return;
  if (schemaVerificationPromise) {
    await schemaVerificationPromise;
    return;
  }

  schemaVerificationPromise = (async () => {
    try {
      const tableNames = Object.keys(REQUIRED_COLUMNS);
      if (typeof d1.batch === "function") {
        const readStatements = [
          d1.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index')"),
          ...tableNames.map((tbl) => d1.prepare(`PRAGMA table_info(${tbl})`)),
        ];

        const batchResults = await d1.batch(readStatements);
        const masterRows = (batchResults[0]?.results || []) as SqliteMasterRow[];
        const existingTables = new Set<string>();
        const existingIndexes = new Set<string>();

        for (const row of masterRows) {
          if (row.type === "table" && row.name) existingTables.add(row.name);
          if (row.type === "index" && row.name) existingIndexes.add(row.name);
        }

        const missingDdls: string[] = [];

        for (const tbl of REQUIRED_TABLES) {
          if (!existingTables.has(tbl.name)) {
            missingDdls.push(tbl.ddl);
          }
        }

        tableNames.forEach((tblName, idx) => {
          const cols = (batchResults[idx + 1]?.results || []) as PragmaColumnRow[];
          // テーブル自体が新規作成対象なら CREATE TABLE に全カラムが含まれている場合はスキップ、
          // 既存テーブルで不足しているカラムのみ ALTER TABLE を積む
          if (cols.length > 0 || existingTables.has(tblName)) {
            const colSet = new Set(cols.map((c) => c.name).filter(Boolean) as string[]);
            for (const reqCol of REQUIRED_COLUMNS[tblName]) {
              if (!colSet.has(reqCol.name)) {
                missingDdls.push(reqCol.ddl);
              }
            }
          }
        });

        for (const idxDef of REQUIRED_INDEXES) {
          if (!existingIndexes.has(idxDef.name)) {
            missingDdls.push(idxDef.ddl);
          }
        }

        // 本番稼働中は missingDdls.length === 0 のため書き込みクエリは一切発行されない
        for (const ddl of missingDdls) {
          try {
            await d1.prepare(ddl).run().catch(() => {});
          } catch {}
        }

        // 既存保存データに「先行走者封殺ゴロ（outsInPlay >= 1）なのに resultCode='fc'」が混入している場合のみ自動修復（べき等・修復後は書き込み0回）
        await repairLegacyForceOutScorebookData(d1);
      }
      isAllSchemaVerified = true;
    } catch {
      // 万が一 batch 読取が失敗した場合もリクエスト自体はブロックしない
      isAllSchemaVerified = true;
    } finally {
      schemaVerificationPromise = null;
    }
  })();

  await schemaVerificationPromise;
}

async function repairLegacyForceOutScorebookData(d1: D1Database): Promise<void> {
  try {
    const [snapQueryRes, standaloneLogRes] = await d1.batch([
      d1.prepare(
        `SELECT match_id, top_at_bats_json, bottom_at_bats_json
         FROM match_scorebook_snapshots
         WHERE top_at_bats_json LIKE '%"fc"%'
            OR bottom_at_bats_json LIKE '%"fc"%'
            OR top_at_bats_json LIKE '%infield_fly%'
            OR bottom_at_bats_json LIKE '%infield_fly%'
            OR top_at_bats_json LIKE '%インフィールド%'
            OR bottom_at_bats_json LIKE '%インフィールド%'
            OR top_at_bats_json LIKE '%"IF"%'
            OR bottom_at_bats_json LIKE '%"IF"%'`
      ),
      d1.prepare(
        `SELECT id, match_id, at_bat_id, description
         FROM play_logs
         WHERE ((description LIKE '%野選%' OR description LIKE '%FC%')
                AND description LIKE '%アウト%')
            OR (description LIKE '%インフィールド%'
                AND (description LIKE '%中インフィールド%'
                  OR description LIKE '%左インフィールド%'
                  OR description LIKE '%右インフィールド%'
                  OR description LIKE '%センターインフィールド%'
                  OR description LIKE '%レフトインフィールド%'
                  OR description LIKE '%ライトインフィールド%'
                  OR description LIKE '%8IF%'
                  OR description LIKE '%7IF%'
                  OR description LIKE '%9IF%'
                  OR description LIKE '%(8)%'
                  OR description LIKE '%(7)%'
                  OR description LIKE '%(9)%'))`
      ),
    ]);

    const snapRows = (snapQueryRes?.results || []) as SnapshotRepairRow[];
    const standaloneLogRows = (standaloneLogRes?.results || []) as DbPlayLogRepairRow[];

    const writeStatements: D1PreparedStatement[] = [];
    const updatedPlayLogIds = new Set<string>();
    const updatedAtBatIds = new Set<string>();

    const normalizeSideArray = (
      rawJson: string | null
    ): { parsed: ScorebookV2AtBat[] | null; changed: boolean } => {
      if (!rawJson) return { parsed: null, changed: false };
      try {
        const arr = JSON.parse(rawJson) as ScorebookV2AtBat[];
        if (!Array.isArray(arr)) return { parsed: null, changed: false };
        let changed = false;
        const nextArr = arr.map((item) => {
          const norm = normalizeLegacyForceOutAtBat(item);
          if (
            norm.resultCode !== item.resultCode ||
            norm.battedDirection !== item.battedDirection ||
            norm.resultLabel !== item.resultLabel
          ) {
            changed = true;
          }
          return norm;
        });
        return { parsed: nextArr, changed };
      } catch {
        return { parsed: null, changed: false };
      }
    };

    for (const row of snapRows) {
      const topNorm = normalizeSideArray(row.top_at_bats_json);
      const botNorm = normalizeSideArray(row.bottom_at_bats_json);
      if (!topNorm.changed && !botNorm.changed) {
        continue;
      }

      const nextTopJson =
        topNorm.changed && topNorm.parsed
          ? JSON.stringify(topNorm.parsed)
          : row.top_at_bats_json;
      const nextBotJson =
        botNorm.changed && botNorm.parsed
          ? JSON.stringify(botNorm.parsed)
          : row.bottom_at_bats_json;

      writeStatements.push(
        d1
          .prepare(
            `UPDATE match_scorebook_snapshots
             SET top_at_bats_json = ?, bottom_at_bats_json = ?
             WHERE match_id = ?`
          )
          .bind(nextTopJson, nextBotJson, row.match_id)
      );

      const [abRes, plRes] = await d1.batch([
        d1
          .prepare(
            `SELECT id, inning, is_top, result
             FROM at_bats
             WHERE match_id = ?
             ORDER BY inning ASC, created_at ASC`
          )
          .bind(row.match_id),
        d1
          .prepare(
            `SELECT id, match_id, at_bat_id, description
             FROM play_logs
             WHERE match_id = ?`
          )
          .bind(row.match_id),
      ]);

      const dbAtBats = (abRes?.results || []) as DbAtBatRepairRow[];
      const dbPlayLogs = (plRes?.results || []) as DbPlayLogRepairRow[];

      const topQueue = new Map<number, ScorebookV2AtBat[]>();
      for (const sAb of topNorm.parsed || []) {
        const q = topQueue.get(sAb.inning) || [];
        q.push(sAb);
        topQueue.set(sAb.inning, q);
      }
      const botQueue = new Map<number, ScorebookV2AtBat[]>();
      for (const sAb of botNorm.parsed || []) {
        const q = botQueue.get(sAb.inning) || [];
        q.push(sAb);
        botQueue.set(sAb.inning, q);
      }

      const topOffsets = new Map<number, number>();
      const botOffsets = new Map<number, number>();
      const snapByDbAtBatId = new Map<string, ScorebookV2AtBat>();

      for (const dbAb of dbAtBats) {
        const isTop = Boolean(dbAb.is_top);
        if (isTop) {
          const idx = topOffsets.get(dbAb.inning) || 0;
          topOffsets.set(dbAb.inning, idx + 1);
          const sAb = topQueue.get(dbAb.inning)?.[idx];
          if (sAb) snapByDbAtBatId.set(dbAb.id, sAb);
        } else {
          const idx = botOffsets.get(dbAb.inning) || 0;
          botOffsets.set(dbAb.inning, idx + 1);
          const sAb = botQueue.get(dbAb.inning)?.[idx];
          if (sAb) snapByDbAtBatId.set(dbAb.id, sAb);
        }

        const matchedSnap = snapByDbAtBatId.get(dbAb.id);
        if (
          matchedSnap &&
          ((dbAb.result === "fc" && matchedSnap.resultCode !== "fc") ||
            (dbAb.result === "flyout" &&
              matchedSnap.resultCode === "infield_fly"))
        ) {
          updatedAtBatIds.add(dbAb.id);
          writeStatements.push(
            d1
              .prepare(`UPDATE at_bats SET result = ? WHERE id = ?`)
              .bind(matchedSnap.resultCode, dbAb.id)
          );
        }
      }

      for (const pl of dbPlayLogs) {
        const matchedSnap = pl.at_bat_id
          ? snapByDbAtBatId.get(pl.at_bat_id)
          : undefined;
        const nextDesc = repairPlayLogForceOutDescription(
          pl.description,
          matchedSnap
        );
        if (nextDesc !== pl.description) {
          updatedPlayLogIds.add(pl.id);
          writeStatements.push(
            d1
              .prepare(`UPDATE play_logs SET description = ? WHERE id = ?`)
              .bind(nextDesc, pl.id)
          );
        }
      }
    }

    for (const pl of standaloneLogRows) {
      if (updatedPlayLogIds.has(pl.id)) continue;
      const nextDesc = repairPlayLogForceOutDescription(pl.description);
      if (nextDesc !== pl.description) {
        updatedPlayLogIds.add(pl.id);
        writeStatements.push(
          d1
            .prepare(`UPDATE play_logs SET description = ? WHERE id = ?`)
            .bind(nextDesc, pl.id)
        );
        if (pl.at_bat_id && !updatedAtBatIds.has(pl.at_bat_id)) {
          updatedAtBatIds.add(pl.at_bat_id);
          if (nextDesc.includes("インフィールド")) {
            writeStatements.push(
              d1
                .prepare(
                  `UPDATE at_bats SET result = 'infield_fly' WHERE id = ? AND result = 'flyout'`
                )
                .bind(pl.at_bat_id)
            );
          } else {
            writeStatements.push(
              d1
                .prepare(
                  `UPDATE at_bats SET result = 'groundout' WHERE id = ? AND result = 'fc'`
                )
                .bind(pl.at_bat_id)
            );
          }
        }
      }
    }

    for (let i = 0; i < writeStatements.length; i += 50) {
      const chunk = writeStatements.slice(i, i + 50);
      if (chunk.length > 0) {
        await d1.batch(chunk);
      }
    }
  } catch {
    // 修復処理中に例外が発生しても通常リクエストは一切阻害しない
  }
}

export async function ensureEventColumns(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureRulesTable(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureLinksTable(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureMemberOrderColumn(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureStatusConfigColumn(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureMemberSubLabelsColumn(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureMatchLineupColumns(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensurePlayerProfileColumns(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureVenuesColumns(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureLiveReportsTable(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensureScheduleDefaultTimesColumn(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}

export async function ensurePlayerConditionPeriodsTable(d1?: D1Database | null): Promise<void> {
  await ensureAllSchemasOnce(d1);
}
