// filepath: src/lib/player-roster-cleanup.ts
import {
  ensureMatchLineupColumns,
  ensurePlayerConditionPeriodsTable,
} from "@/lib/db-helper";
import { toMatchCalendarKey } from "@/lib/liff/demo-lineup";
import {
  isNonActiveConditionStatus,
  normalizeIsoDateKey,
  sortPlayerConditionPeriods,
  type PlayerConditionPeriod,
} from "@/lib/liff/player-condition";

interface RawTeamMatchAttendanceRow {
  id: string;
  date: string | null;
  myLineup: string | null;
  myAttendance: string | null;
}

interface RawMatchLineupAppearanceRow {
  matchId: string;
}

interface RawPlayerConditionPeriodRow {
  id: string;
  playerId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  privateNote: string | null;
  updatedAt: number | null;
}

function mapRawPeriodRow(row: RawPlayerConditionPeriodRow): PlayerConditionPeriod | null {
  if (!isNonActiveConditionStatus(row.status)) return null;
  const startDate = normalizeIsoDateKey(row.startDate);
  if (!startDate) return null;
  const endDate = row.endDate ? normalizeIsoDateKey(row.endDate) : null;
  return {
    id: row.id,
    playerId: row.playerId,
    status: row.status,
    startDate,
    endDate,
    privateNote: row.privateNote || null,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : undefined,
  };
}

/**
 * チーム全体の選手コンディション期間（休部・故障・制限）を単一インデックスクエリで一括取得し、
 * `playerId -> PlayerConditionPeriod[]` の Map で返却する（N+1ゼロ）。
 */
export async function loadTeamPlayerConditionPeriodsMap(
  db: D1Database | undefined | null,
  teamId: string
): Promise<Map<string, PlayerConditionPeriod[]>> {
  const map = new Map<string, PlayerConditionPeriod[]>();
  if (!db || !teamId || teamId === "demo-team") return map;

  await ensurePlayerConditionPeriodsTable(db);

  try {
    const res = await db
      .prepare(
        `SELECT
           id,
           player_id AS playerId,
           status,
           start_date AS startDate,
           end_date AS endDate,
           private_note AS privateNote,
           updated_at AS updatedAt
         FROM player_condition_periods
         WHERE team_id = ?
         ORDER BY start_date ASC, updated_at DESC`
      )
      .bind(teamId)
      .all<RawPlayerConditionPeriodRow>();

    for (const row of res.results || []) {
      const item = mapRawPeriodRow(row);
      if (!item) continue;
      const bucket = map.get(item.playerId);
      if (bucket) {
        bucket.push(item);
      } else {
        map.set(item.playerId, [item]);
      }
    }

    for (const [pid, list] of map.entries()) {
      map.set(pid, sortPlayerConditionPeriods(list));
    }
  } catch {
    // 万一テーブル未作成環境等でも他機能を止めない
  }

  return map;
}

export async function loadSinglePlayerConditionPeriods(
  db: D1Database | undefined | null,
  teamId: string,
  playerId: string
): Promise<PlayerConditionPeriod[]> {
  if (!db || !teamId || !playerId || teamId === "demo-team") return [];

  await ensurePlayerConditionPeriodsTable(db);

  try {
    const res = await db
      .prepare(
        `SELECT
           id,
           player_id AS playerId,
           status,
           start_date AS startDate,
           end_date AS endDate,
           private_note AS privateNote,
           updated_at AS updatedAt
         FROM player_condition_periods
         WHERE team_id = ? AND player_id = ?
         ORDER BY start_date ASC, updated_at DESC`
      )
      .bind(teamId, playerId)
      .all<RawPlayerConditionPeriodRow>();

    const parsed: PlayerConditionPeriod[] = [];
    for (const row of res.results || []) {
      const item = mapRawPeriodRow(row);
      if (item) parsed.push(item);
    }
    return sortPlayerConditionPeriods(parsed);
  } catch {
    return [];
  }
}

/**
 * 選手の「入団日（joinedDateKey: YYYY-MM-DD）」を登録・更新した際、
 * 入団日より前の過去試合において my_attendance に誤って "bench" が保存されていたレコードを
 * 一括で "excluded"（対象外）へクリーンアップする。
 * ※当該試合でスタメン（my_lineup）または途中出場（match_lineups）していた実績がある試合は保護する。
 */
export async function cleanupPreJoinMatchAttendance(
  db: D1Database,
  teamId: string,
  playerId: string,
  joinedDateKey: string | null
): Promise<number> {
  if (!teamId || !playerId || !joinedDateKey) return 0;

  await ensureMatchLineupColumns(db);

  const [matchesRes, appearancesRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, date, my_lineup AS myLineup, my_attendance AS myAttendance
         FROM matches
         WHERE team_id = ?`
      )
      .bind(teamId)
      .all<RawTeamMatchAttendanceRow>(),
    db
      .prepare(
        `SELECT DISTINCT match_id AS matchId
         FROM match_lineups
         WHERE player_id = ?`
      )
      .bind(playerId)
      .all<RawMatchLineupAppearanceRow>()
      .catch(() => ({ results: [] as RawMatchLineupAppearanceRow[] })),
  ]);

  const appearedMatchIds = new Set<string>(
    (appearancesRes.results || []).map((r) => r.matchId).filter(Boolean)
  );

  const statements: D1PreparedStatement[] = [];

  for (const row of matchesRes.results || []) {
    const matchKey = toMatchCalendarKey(row.date);
    if (!matchKey || matchKey >= joinedDateKey) continue;
    if (appearedMatchIds.has(row.id)) continue;

    // スタメンJSON内に含まれている場合も出場実績として保護
    if (row.myLineup) {
      try {
        const parsedLineup = JSON.parse(row.myLineup) as unknown;
        if (
          Array.isArray(parsedLineup) &&
          parsedLineup.some(
            (slot) =>
              slot &&
              typeof slot === "object" &&
              (slot as { playerId?: unknown }).playerId === playerId
          )
        ) {
          continue;
        }
      } catch {
        // ignore invalid JSON
      }
    }

    if (!row.myAttendance) continue;
    let parsedAttendance: Record<string, unknown> | null = null;
    try {
      const rawObj = JSON.parse(row.myAttendance) as unknown;
      if (rawObj && typeof rawObj === "object" && !Array.isArray(rawObj)) {
        parsedAttendance = rawObj as Record<string, unknown>;
      }
    } catch {
      parsedAttendance = null;
    }

    if (!parsedAttendance) continue;
    if (parsedAttendance[playerId] !== "bench") continue;

    const nextAttendance: Record<string, unknown> = {
      ...parsedAttendance,
      [playerId]: "excluded",
    };
    statements.push(
      db
        .prepare(`UPDATE matches SET my_attendance = ? WHERE id = ? AND team_id = ?`)
        .bind(JSON.stringify(nextAttendance), row.id, teamId)
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return statements.length;
}

/**
 * 選手の「休部期間（status = 'on_leave'）」を登録・更新した際、
 * 【設定された休部期間内（startDate <= matchDate <= endDate/未定）】の試合において
 * 事前に "bench" が保存されていた未出場レコードのみを "excluded"（対象外）へ補正する。
 * ※開始日より前の過去試合、復帰日以降の試合、および出場実績がある試合には一切影響を与えない。
 */
export async function cleanupLeavePeriodsMatchAttendance(
  db: D1Database,
  teamId: string,
  playerId: string,
  periods: readonly PlayerConditionPeriod[]
): Promise<number> {
  if (!teamId || !playerId) return 0;
  const leavePeriods = periods.filter((p) => p.status === "on_leave" && Boolean(p.startDate));
  if (leavePeriods.length === 0) return 0;

  await ensureMatchLineupColumns(db);

  const [matchesRes, appearancesRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, date, my_lineup AS myLineup, my_attendance AS myAttendance
         FROM matches
         WHERE team_id = ?`
      )
      .bind(teamId)
      .all<RawTeamMatchAttendanceRow>(),
    db
      .prepare(
        `SELECT DISTINCT match_id AS matchId
         FROM match_lineups
         WHERE player_id = ?`
      )
      .bind(playerId)
      .all<RawMatchLineupAppearanceRow>()
      .catch(() => ({ results: [] as RawMatchLineupAppearanceRow[] })),
  ]);

  const appearedMatchIds = new Set<string>(
    (appearancesRes.results || []).map((r) => r.matchId).filter(Boolean)
  );

  const statements: D1PreparedStatement[] = [];

  for (const row of matchesRes.results || []) {
    const matchKey = toMatchCalendarKey(row.date);
    if (!matchKey) continue;

    const isInLeavePeriod = leavePeriods.some(
      (lp) => lp.startDate <= matchKey && (!lp.endDate || matchKey <= lp.endDate)
    );
    if (!isInLeavePeriod) continue;
    if (appearedMatchIds.has(row.id)) continue;

    if (row.myLineup) {
      try {
        const parsedLineup = JSON.parse(row.myLineup) as unknown;
        if (
          Array.isArray(parsedLineup) &&
          parsedLineup.some(
            (slot) =>
              slot &&
              typeof slot === "object" &&
              (slot as { playerId?: unknown }).playerId === playerId
          )
        ) {
          continue;
        }
      } catch {
        // ignore invalid JSON
      }
    }

    if (!row.myAttendance) continue;
    let parsedAttendance: Record<string, unknown> | null = null;
    try {
      const rawObj = JSON.parse(row.myAttendance) as unknown;
      if (rawObj && typeof rawObj === "object" && !Array.isArray(rawObj)) {
        parsedAttendance = rawObj as Record<string, unknown>;
      }
    } catch {
      parsedAttendance = null;
    }

    if (!parsedAttendance) continue;
    if (parsedAttendance[playerId] !== "bench") continue;

    const nextAttendance: Record<string, unknown> = {
      ...parsedAttendance,
      [playerId]: "excluded",
    };
    statements.push(
      db
        .prepare(`UPDATE matches SET my_attendance = ? WHERE id = ? AND team_id = ?`)
        .bind(JSON.stringify(nextAttendance), row.id, teamId)
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return statements.length;
}
