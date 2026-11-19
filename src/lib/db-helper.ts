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
    { name: "profile_json", ddl: "ALTER TABLE organizations ADD COLUMN profile_json text" },
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
    { name: "pm_type", ddl: "ALTER TABLE events ADD COLUMN pm_type text" },
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
    { name: "schedule_settings", ddl: "ALTER TABLE teams ADD COLUMN schedule_settings text" },
    { name: "score_settings", ddl: "ALTER TABLE teams ADD COLUMN score_settings text" },
    { name: "cheer_songs_json", ddl: "ALTER TABLE teams ADD COLUMN cheer_songs_json text" },
    { name: "weekend_reminder_settings", ddl: "ALTER TABLE teams ADD COLUMN weekend_reminder_settings text" },
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
    { name: "organization_id", ddl: "ALTER TABLE venues ADD COLUMN organization_id TEXT" },
    { name: "team_id", ddl: "ALTER TABLE venues ADD COLUMN team_id TEXT" },
    { name: "category", ddl: "ALTER TABLE venues ADD COLUMN category TEXT DEFAULT 'stadium'" },
    { name: "parking_info", ddl: "ALTER TABLE venues ADD COLUMN parking_info TEXT" },
    { name: "spike_rule", ddl: "ALTER TABLE venues ADD COLUMN spike_rule TEXT" },
  ],
  tournaments: [
    { name: "organization_id", ddl: "ALTER TABLE tournaments ADD COLUMN organization_id TEXT" },
    { name: "team_id", ddl: "ALTER TABLE tournaments ADD COLUMN team_id TEXT" },
    { name: "pitch_limit_rule", ddl: "ALTER TABLE tournaments ADD COLUMN pitch_limit_rule TEXT" },
  ],
  event_carpools: [
    { name: "return_riders_json", ddl: "ALTER TABLE event_carpools ADD COLUMN return_riders_json text" },
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
    { name: "sub_links", ddl: "ALTER TABLE team_links ADD COLUMN sub_links text" },
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
      sub_links text,
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
  {
    name: "event_equipments",
    ddl: `CREATE TABLE IF NOT EXISTS event_equipments (
      id text PRIMARY KEY NOT NULL,
      event_id text NOT NULL,
      equipment_id text NOT NULL,
      carpool_id text,
      responsible_member_id text,
      status text DEFAULT 'pending',
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
  {
    name: "related_teams",
    ddl: `CREATE TABLE IF NOT EXISTS related_teams (
      id text PRIMARY KEY NOT NULL,
      organization_id text,
      team_id text,
      name text NOT NULL,
      short_name text,
      league_name text,
      relation_type text NOT NULL DEFAULT 'league_member',
      team_category text,
      area text,
      home_ground text,
      website_url text,
      links_json text,
      description text,
      scope text NOT NULL DEFAULT 'organization',
      is_favorite integer DEFAULT 0,
      priority integer DEFAULT 0,
      created_by_id text,
      created_at integer NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,
  },
];

const REQUIRED_INDEXES: Array<{ name: string; ddl: string }> = [
  { name: "idx_team_rules_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_rules_org_id ON team_rules (organization_id)" },
  { name: "idx_team_rules_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_rules_team_id ON team_rules (team_id)" },
  { name: "idx_team_links_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_links_org_id ON team_links (organization_id)" },
  { name: "idx_team_links_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_links_team_id ON team_links (team_id)" },
  { name: "idx_related_teams_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_related_teams_org_id ON related_teams (organization_id)" },
  { name: "idx_related_teams_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_related_teams_team_id ON related_teams (team_id)" },
  { name: "idx_lineup_templates_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_lineup_templates_team_id ON lineup_templates (team_id)" },
  { name: "idx_match_live_reports_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_match_live_reports_team_id ON match_live_reports (team_id)" },
  { name: "idx_match_live_reports_match_id", ddl: "CREATE INDEX IF NOT EXISTS idx_match_live_reports_match_id ON match_live_reports (match_id)" },
  { name: "idx_carpool_live_event_dir", ddl: "CREATE INDEX IF NOT EXISTS idx_carpool_live_event_dir ON carpool_live_locations (event_id, direction)" },
  { name: "idx_carpool_live_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_carpool_live_team_id ON carpool_live_locations (team_id)" },
  { name: "idx_player_cond_periods_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_player_cond_periods_team_id ON player_condition_periods (team_id)" },
  { name: "idx_player_cond_periods_player_id", ddl: "CREATE INDEX IF NOT EXISTS idx_player_cond_periods_player_id ON player_condition_periods (player_id)" },
  { name: "team_role_idx", ddl: "CREATE UNIQUE INDEX IF NOT EXISTS team_role_idx ON team_role_settings (team_id, role)" },
  { name: "idx_team_equipments_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_team_equipments_team_id ON team_equipments (team_id)" },
  { name: "idx_event_equipments_event_id", ddl: "CREATE INDEX IF NOT EXISTS idx_event_equipments_event_id ON event_equipments (event_id)" },
  { name: "idx_event_equipments_eq_id", ddl: "CREATE INDEX IF NOT EXISTS idx_event_equipments_eq_id ON event_equipments (equipment_id)" },
  { name: "idx_event_equipments_cp_id", ddl: "CREATE INDEX IF NOT EXISTS idx_event_equipments_cp_id ON event_equipments (carpool_id)" },
  { name: "idx_venues_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_venues_org_id ON venues (organization_id)" },
  { name: "idx_venues_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_venues_team_id ON venues (team_id)" },
  { name: "idx_tournaments_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_tournaments_org_id ON tournaments (organization_id)" },
  { name: "idx_tournaments_team_id", ddl: "CREATE INDEX IF NOT EXISTS idx_tournaments_team_id ON tournaments (team_id)" },
  { name: "idx_teams_org_id", ddl: "CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams (organization_id)" },
  { name: "idx_teams_created_by", ddl: "CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams (created_by)" },
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

        // 既存保存データの一括修復は D1 上で完了マーカー未作成の初回1回のみ実行（コールドIsolate起動ごとの全件LIKE走査・CPUスパイクを完全防止）
        const FORCE_OUT_REPAIR_SENTINEL_TABLE = "_repair_force_out_v1_done";
        if (!existingTables.has(FORCE_OUT_REPAIR_SENTINEL_TABLE)) {
          const repairedCleanly = await repairLegacyForceOutScorebookData(d1);
          if (repairedCleanly) {
            try {
              await d1
                .prepare(
                  `CREATE TABLE IF NOT EXISTS ${FORCE_OUT_REPAIR_SENTINEL_TABLE} (done integer PRIMARY KEY)`
                )
                .run()
                .catch(() => {});
            } catch {}
          }
        }

        const TENANT_SCOPE_SENTINEL_TABLE = "_repair_venue_tournament_tenant_v1_done";
        if (!existingTables.has(TENANT_SCOPE_SENTINEL_TABLE)) {
          const backfilledCleanly = await backfillLegacyVenueTournamentTenants(d1);
          if (backfilledCleanly) {
            try {
              await d1
                .prepare(
                  `CREATE TABLE IF NOT EXISTS ${TENANT_SCOPE_SENTINEL_TABLE} (done integer PRIMARY KEY)`
                )
                .run()
                .catch(() => {});
            } catch {}
          }
        }
      }
      isAllSchemaVerified = true;
    } catch {
      // 万が一 batch 読取が一時エラーになった場合も現在のリクエストはブロックせず、次回リクエストで再検証可能にする
    } finally {
      schemaVerificationPromise = null;
    }
  })();

  await schemaVerificationPromise;
}

async function backfillLegacyVenueTournamentTenants(d1: D1Database): Promise<boolean> {
  try {
    const [teamsRes, venuesRes, tournamentsRes, matchesRes, eventsRes] =
      await d1.batch([
        d1.prepare("SELECT id, organization_id FROM teams"),
        d1.prepare(
          "SELECT id, name, short_name, category, address, map_url, surface_type, dimensions, parking_info, spike_rule, notes FROM venues WHERE team_id IS NULL AND organization_id IS NULL"
        ),
        d1.prepare(
          "SELECT id, name, category, season, organizer, bracket_url, time_limit, cold_game_rule, tiebreaker_rule, start_date, end_date FROM tournaments WHERE team_id IS NULL AND organization_id IS NULL"
        ),
        d1.prepare(
          "SELECT id, team_id, venue_id, tournament_id FROM matches WHERE venue_id IS NOT NULL OR tournament_id IS NOT NULL"
        ),
        d1.prepare(
          "SELECT team_id, location, pm_location FROM events WHERE location IS NOT NULL OR pm_location IS NOT NULL"
        ),
      ]);

    const teamRows = (teamsRes?.results || []) as Array<{
      id: string;
      organization_id: string | null;
    }>;
    const realTeams = teamRows.filter((t) => t.id && t.id !== "demo-team");
    const teamOrgMap = new Map<string, string | null>();
    const distinctOrgs = new Set<string>();
    for (const t of realTeams) {
      teamOrgMap.set(t.id, t.organization_id || null);
      if (t.organization_id) distinctOrgs.add(t.organization_id);
    }

    const singleFallbackTeam =
      distinctOrgs.size === 1
        ? realTeams.find((t) => t.organization_id && distinctOrgs.has(t.organization_id)) || null
        : realTeams.length === 1
        ? realTeams[0]
        : null;

    const matchRows = (matchesRes?.results || []) as Array<{
      id: string;
      team_id: string;
      venue_id: string | null;
      tournament_id: string | null;
    }>;
    const eventRows = (eventsRes?.results || []) as Array<{
      team_id: string;
      location: string | null;
      pm_location: string | null;
    }>;

    const writeStmts: D1PreparedStatement[] = [];

    // 1. Venues backfill
    const orphanVenues = (venuesRes?.results || []) as Array<{
      id: string;
      name: string;
      short_name: string | null;
      category: string | null;
      address: string | null;
      map_url: string | null;
      surface_type: string | null;
      dimensions: string | null;
      parking_info: string | null;
      spike_rule: string | null;
      notes: string | null;
    }>;

    for (const v of orphanVenues) {
      const refMatches = matchRows.filter((m) => m.venue_id === v.id && m.team_id);
      if (refMatches.length > 0) {
        const groupedByTenant = new Map<
          string,
          { teamId: string; orgId: string | null; matchIds: string[] }
        >();
        for (const m of refMatches) {
          const orgId = teamOrgMap.get(m.team_id) || null;
          const key = orgId ? `org:${orgId}` : `team:${m.team_id}`;
          const existing = groupedByTenant.get(key);
          if (existing) {
            existing.matchIds.push(m.id);
          } else {
            groupedByTenant.set(key, {
              teamId: m.team_id,
              orgId,
              matchIds: [m.id],
            });
          }
        }
        const entries = Array.from(groupedByTenant.values());
        const primary = entries[0];
        if (primary) {
          writeStmts.push(
            d1
              .prepare(
                "UPDATE venues SET team_id = ?, organization_id = ? WHERE id = ?"
              )
              .bind(primary.teamId, primary.orgId, v.id)
          );
        }
        for (let idx = 1; idx < entries.length; idx++) {
          const extra = entries[idx];
          const clonedId = crypto.randomUUID();
          writeStmts.push(
            d1
              .prepare(
                `INSERT INTO venues (id, organization_id, team_id, name, short_name, category, address, map_url, surface_type, dimensions, parking_info, spike_rule, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                clonedId,
                extra.orgId,
                extra.teamId,
                v.name,
                v.short_name,
                v.category,
                v.address,
                v.map_url,
                v.surface_type,
                v.dimensions,
                v.parking_info,
                v.spike_rule,
                v.notes
              )
          );
          for (const mid of extra.matchIds) {
            writeStmts.push(
              d1
                .prepare("UPDATE matches SET venue_id = ? WHERE id = ?")
                .bind(clonedId, mid)
            );
          }
        }
        continue;
      }

      const vName = (v.name || "").trim();
      const vShort = (v.short_name || "").trim();
      const matchedEvent = eventRows.find((ev) => {
        const loc = (ev.location || "").trim();
        const pmLoc = (ev.pm_location || "").trim();
        return (
          (vName && (loc === vName || pmLoc === vName)) ||
          (vShort && (loc === vShort || pmLoc === vShort))
        );
      });
      if (matchedEvent && matchedEvent.team_id) {
        const orgId = teamOrgMap.get(matchedEvent.team_id) || null;
        writeStmts.push(
          d1
            .prepare(
              "UPDATE venues SET team_id = ?, organization_id = ? WHERE id = ?"
            )
            .bind(matchedEvent.team_id, orgId, v.id)
        );
        continue;
      }

      if (singleFallbackTeam) {
        writeStmts.push(
          d1
            .prepare(
              "UPDATE venues SET team_id = ?, organization_id = ? WHERE id = ?"
            )
            .bind(
              singleFallbackTeam.id,
              singleFallbackTeam.organization_id || null,
              v.id
            )
        );
      }
    }

    // 2. Tournaments backfill
    const orphanTournaments = (tournamentsRes?.results || []) as Array<{
      id: string;
      name: string;
      category: string;
      season: string;
      organizer: string | null;
      bracket_url: string | null;
      time_limit: string | null;
      cold_game_rule: string | null;
      tiebreaker_rule: string | null;
      start_date: string | null;
      end_date: string | null;
    }>;

    for (const trn of orphanTournaments) {
      const refMatches = matchRows.filter(
        (m) => m.tournament_id === trn.id && m.team_id
      );
      if (refMatches.length > 0) {
        const groupedByTenant = new Map<
          string,
          { teamId: string; orgId: string | null; matchIds: string[] }
        >();
        for (const m of refMatches) {
          const orgId = teamOrgMap.get(m.team_id) || null;
          const key = orgId ? `org:${orgId}` : `team:${m.team_id}`;
          const existing = groupedByTenant.get(key);
          if (existing) {
            existing.matchIds.push(m.id);
          } else {
            groupedByTenant.set(key, {
              teamId: m.team_id,
              orgId,
              matchIds: [m.id],
            });
          }
        }
        const entries = Array.from(groupedByTenant.values());
        const primary = entries[0];
        if (primary) {
          writeStmts.push(
            d1
              .prepare(
                "UPDATE tournaments SET team_id = ?, organization_id = ? WHERE id = ?"
              )
              .bind(primary.teamId, primary.orgId, trn.id)
          );
        }
        for (let idx = 1; idx < entries.length; idx++) {
          const extra = entries[idx];
          const clonedId = `trn_${crypto.randomUUID().replace(/-/g, "")}`;
          writeStmts.push(
            d1
              .prepare(
                `INSERT INTO tournaments (id, organization_id, team_id, name, category, season, organizer, bracket_url, time_limit, cold_game_rule, tiebreaker_rule, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                clonedId,
                extra.orgId,
                extra.teamId,
                trn.name,
                trn.category,
                trn.season,
                trn.organizer,
                trn.bracket_url,
                trn.time_limit,
                trn.cold_game_rule,
                trn.tiebreaker_rule,
                trn.start_date,
                trn.end_date
              )
          );
          for (const mid of extra.matchIds) {
            writeStmts.push(
              d1
                .prepare("UPDATE matches SET tournament_id = ? WHERE id = ?")
                .bind(clonedId, mid)
            );
          }
        }
        continue;
      }

      if (singleFallbackTeam) {
        writeStmts.push(
          d1
            .prepare(
              "UPDATE tournaments SET team_id = ?, organization_id = ? WHERE id = ?"
            )
            .bind(
              singleFallbackTeam.id,
              singleFallbackTeam.organization_id || null,
              trn.id
            )
        );
      }
    }

    for (let i = 0; i < writeStmts.length; i += 50) {
      const chunk = writeStmts.slice(i, i + 50);
      if (chunk.length > 0) {
        await d1.batch(chunk);
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function repairLegacyForceOutScorebookData(d1: D1Database): Promise<boolean> {
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
            OR bottom_at_bats_json LIKE '%"IF"%'
            OR top_at_bats_json LIKE '%K-E2%'
            OR bottom_at_bats_json LIKE '%K-E2%'`
      ),
      d1.prepare(
        `SELECT id, match_id, at_bat_id, description
         FROM play_logs
         WHERE ((description LIKE '%野選%' OR description LIKE '%FC%')
                AND description LIKE '%アウト%')
            OR description LIKE '%(K-E2)%'
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
    return true;
  } catch {
    // 修復処理中に例外が発生しても通常リクエストは一切阻害しない
    return false;
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
