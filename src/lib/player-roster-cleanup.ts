// filepath: src/lib/player-roster-cleanup.ts
import { ensureMatchLineupColumns } from "@/lib/db-helper";
import { toMatchCalendarKey } from "@/lib/liff/demo-lineup";

interface RawTeamMatchAttendanceRow {
  id: string;
  date: string | null;
  myLineup: string | null;
  myAttendance: string | null;
}

interface RawMatchLineupAppearanceRow {
  matchId: string;
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

