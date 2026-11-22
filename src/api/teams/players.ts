// filepath: src/api/teams/players.ts
import { Hono, type Context } from "hono";
import { ensurePlayerProfileColumns } from "@/lib/db-helper";
import {
  comparePlayersByConditionAndUniform,
  getTodayJstDateKey,
  maskConditionPeriodsForViewer,
  normalizePlayerConditionStatus,
  resolveEffectivePlayerConditionOnDate,
  type PlayerConditionStatus,
} from "@/lib/liff/player-condition";
import {
  parseDateInputToUnixSeconds,
  parsePlayerProfileDetails,
} from "@/lib/liff/player-profile-schema";
import {
  cleanupPreJoinMatchAttendance,
  loadTeamPlayerConditionPeriodsMap,
} from "@/lib/player-roster-cleanup";
import { resolveCallerTeamAccess } from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

interface RawPlayerDbRow {
  id: string;
  teamId: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  primaryPosition: string | null;
  throws: string | null;
  bats: string | null;
  isActive: number | boolean | null;
  notes: string | null;
  conditionStatus: string | null;
  conditionNote: string | null;
  profileImageUrl: string | null;
  userId: string | null;
  joinedAt: number | null;
  createdAt: number | null;
}

async function resolveCanViewPlayerConditionNotes(
  c: Context<{ Bindings: WorkerEnv }>,
  teamId: string
): Promise<boolean> {
  if (!teamId || teamId === "demo-team") return true;
  const access = await resolveCallerTeamAccess(c);
  return access.canManagePlayersForTeam(teamId);
}

export async function computeRecentPitchWorkloadByPlayerId(
  d1: D1Database,
  teamId: string,
  referenceDateKey: string,
  excludeMatchId: string
): Promise<
  Map<
    string,
    {
      yesterdayPitches: number;
      last7DaysPitches: number;
      lastPitchedDate: string | null;
      lastPitchedPitches: number;
    }
  >
> {
  const result = new Map<
    string,
    {
      yesterdayPitches: number;
      last7DaysPitches: number;
      lastPitchedDate: string | null;
      lastPitchedPitches: number;
    }
  >();
  if (!teamId || teamId === "demo-team") return result;

  try {
    const parseIsoDayMs = (dateKey: string): number | null => {
      const m = dateKey.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (!m) return null;
      return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    };
    const normalizeDateKey = (raw: string | null | undefined): string => {
      const m = (raw || "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (!m) return "";
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    };

    const refMs = parseIsoDayMs(referenceDateKey);
    if (refMs === null) return result;
    const yesterdayMs = refMs - 86_400_000;
    const window7StartMs = refMs - 7 * 86_400_000;

    const matchRowsRes = await d1
      .prepare(
        `SELECT id, date, batting_order AS battingOrder, status
         FROM matches
         WHERE team_id = ? AND status != 'rainout'`
      )
      .bind(teamId)
      .all<{
        id: string;
        date: string | null;
        battingOrder: string | null;
        status: string | null;
      }>();

    const candidateMatches = (matchRowsRes.results || [])
      .map((m) => {
        const dk = normalizeDateKey(m.date);
        const dayMs = dk ? parseIsoDayMs(dk) : null;
        return { ...m, dateKey: dk, dayMs };
      })
      .filter(
        (m): m is typeof m & { dayMs: number } =>
          m.id !== excludeMatchId &&
          m.dayMs !== null &&
          m.dayMs >= window7StartMs &&
          m.dayMs <= refMs
      );

    if (candidateMatches.length === 0) return result;

    const matchIds = candidateMatches.map((m) => m.id);
    const placeholders = matchIds.map(() => "?").join(",");

    const [abRes, snapRes, liveRes] = await Promise.all([
      d1
        .prepare(
          `SELECT
             ab.id AS atBatId,
             ab.match_id AS matchId,
             ab.pitcher_id AS pitcherId,
             COUNT(CASE
               WHEN p.id IS NOT NULL
                AND p.result NOT LIKE 'pickoff%'
                AND p.result != 'balk'
               THEN 1
             END) AS pitchCount
           FROM at_bats ab
           LEFT JOIN pitches p ON p.at_bat_id = ab.id
           WHERE ab.match_id IN (${placeholders})
             AND ab.pitcher_id IS NOT NULL
           GROUP BY ab.id, ab.match_id, ab.pitcher_id`
        )
        .bind(...matchIds)
        .all<{
          atBatId: string;
          matchId: string;
          pitcherId: string;
          pitchCount: number;
        }>(),
      d1
        .prepare(
          `SELECT match_id AS matchId, top_at_bats_json AS topJson, bottom_at_bats_json AS bottomJson
           FROM match_scorebook_snapshots
           WHERE match_id IN (${placeholders})`
        )
        .bind(...matchIds)
        .all<{
          matchId: string;
          topJson: string | null;
          bottomJson: string | null;
        }>(),
      d1
        .prepare(
          `SELECT match_id AS matchId, report_json AS reportJson
           FROM match_live_reports
           WHERE match_id IN (${placeholders})`
        )
        .bind(...matchIds)
        .all<{ matchId: string; reportJson: string | null }>(),
    ]);

    // matchId -> Map<playerId, pitches>
    const perMatchPitchMap = new Map<string, Map<string, number>>();
    const addMatchPitches = (mid: string, pid: string, count: number) => {
      if (!pid || count <= 0) return;
      let mMap = perMatchPitchMap.get(mid);
      if (!mMap) {
        mMap = new Map<string, number>();
        perMatchPitchMap.set(mid, mMap);
      }
      mMap.set(pid, (mMap.get(pid) || 0) + count);
    };

    const matchesWithDbAtBats = new Set<string>();
    for (const row of abRes.results || []) {
      matchesWithDbAtBats.add(row.matchId);
      addMatchPitches(row.matchId, row.pitcherId, Number(row.pitchCount) || 0);
    }

    // DBの pitches 行が未保存（0件）の試合について snapshot 配列やライブ速報JSONから補完
    const snapByMatchId = new Map(
      (snapRes.results || []).map((s) => [s.matchId, s])
    );
    const liveByMatchId = new Map(
      (liveRes.results || []).map((l) => [l.matchId, l.reportJson])
    );

    for (const m of candidateMatches) {
      const existingTotal = Array.from(
        perMatchPitchMap.get(m.id)?.values() || []
      ).reduce((a, b) => a + b, 0);
      if (existingTotal > 0) continue;

      const snap = snapByMatchId.get(m.id);
      if (snap) {
        const oppIsTop = m.battingOrder === "second";
        const rawJson = oppIsTop ? snap.topJson : snap.bottomJson;
        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson) as Array<{
              pitcherId?: string | null;
              balls?: number;
              strikes?: number;
              pitches?: Array<{ result?: string } | string>;
            }>;
            if (Array.isArray(parsed)) {
              for (const ab of parsed) {
                if (!ab?.pitcherId) continue;
                const arrCount = Array.isArray(ab.pitches)
                  ? ab.pitches.filter((p) => {
                      const r = typeof p === "string" ? p : p?.result || "";
                      return !r.startsWith("pickoff") && r !== "balk";
                    }).length
                  : 0;
                const fallbackCnt =
                  arrCount > 0
                    ? arrCount
                    : Math.max(0, Number(ab.balls || 0) + Number(ab.strikes || 0));
                addMatchPitches(m.id, ab.pitcherId, fallbackCnt);
              }
            }
          } catch {}
        }
      }

      const afterSnapTotal = Array.from(
        perMatchPitchMap.get(m.id)?.values() || []
      ).reduce((a, b) => a + b, 0);
      if (afterSnapTotal > 0 || matchesWithDbAtBats.has(m.id)) continue;

      const liveRaw = liveByMatchId.get(m.id);
      if (liveRaw) {
        try {
          const doc = JSON.parse(liveRaw) as {
            halfInnings?: Array<{
              entries?: Array<{
                pitcherPlayerId?: string | null;
                pitchCount?: number;
                pitches?: string[];
              }>;
            }>;
            pitcherPitchAdjustments?: Record<string, number>;
          };
          for (const hi of doc.halfInnings || []) {
            for (const ent of hi.entries || []) {
              if (!ent?.pitcherPlayerId) continue;
              const cnt =
                typeof ent.pitchCount === "number" && ent.pitchCount > 0
                  ? ent.pitchCount
                  : Array.isArray(ent.pitches)
                  ? ent.pitches.length
                  : 0;
              addMatchPitches(m.id, ent.pitcherPlayerId, cnt);
            }
          }
          if (
            doc.pitcherPitchAdjustments &&
            typeof doc.pitcherPitchAdjustments === "object"
          ) {
            for (const [key, adj] of Object.entries(doc.pitcherPitchAdjustments)) {
              if (key.startsWith("id:") && typeof adj === "number" && adj !== 0) {
                const pid = key.slice(3);
                const mMap = perMatchPitchMap.get(m.id) || new Map<string, number>();
                const nextVal = Math.max(0, (mMap.get(pid) || 0) + Math.trunc(adj));
                mMap.set(pid, nextVal);
                perMatchPitchMap.set(m.id, mMap);
              }
            }
          }
        } catch {}
      }
    }

    // 日付順に集計
    const sortedMatchesAsc = [...candidateMatches].sort(
      (a, b) => a.dayMs - b.dayMs
    );
    for (const m of sortedMatchesAsc) {
      const mMap = perMatchPitchMap.get(m.id);
      if (!mMap) continue;
      for (const [pid, count] of mMap.entries()) {
        if (count <= 0) continue;
        const cur = result.get(pid) || {
          yesterdayPitches: 0,
          last7DaysPitches: 0,
          lastPitchedDate: null,
          lastPitchedPitches: 0,
        };
        if (m.dayMs === yesterdayMs) {
          cur.yesterdayPitches += count;
        }
        if (m.dayMs >= window7StartMs && m.dayMs < refMs) {
          cur.last7DaysPitches += count;
        }
        if (m.dayMs < refMs) {
          if (!cur.lastPitchedDate || m.dateKey > cur.lastPitchedDate) {
            cur.lastPitchedDate = m.dateKey;
            cur.lastPitchedPitches = count;
          } else if (m.dateKey === cur.lastPitchedDate) {
            cur.lastPitchedPitches += count;
          }
        }
        result.set(pid, cur);
      }
    }
  } catch (err) {
    console.warn("Pitch workload aggregation skipped:", err);
  }

  return result;
}

// 選手一覧取得（主要フィールド全て含む・conditionNote/privateNoteは指導者/管理者のみ返却）
app.get("/:teamId/players", async (c) => {
  const teamId = c.req.param("teamId");
  const referenceDateParam = (c.req.query("referenceDate") || "").trim();
  const excludeMatchIdParam = (c.req.query("excludeMatchId") || "").trim();
  if (teamId && teamId !== "demo-team") {
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(teamId)) {
      return c.json({ error: "対象チームへのアクセス権限がありません" }, 403);
    }
  }
  try {
    await ensurePlayerProfileColumns(c.env.DB);
    const todayKey = getTodayJstDateKey();
    const effectiveRefDate =
      /^\d{4}-\d{2}-\d{2}$/.test(referenceDateParam)
        ? referenceDateParam
        : todayKey;

    const [queryRes, canViewNotes, periodsByPlayerId, workloadMap] =
      await Promise.all([
        c.env.DB.prepare(
          `SELECT
            id,
            team_id           AS teamId,
            name,
            name_kana         AS nameKana,
            uniform_number    AS uniformNumber,
            primary_position  AS primaryPosition,
            throws,
            bats,
            is_active         AS isActive,
            notes,
            condition_status  AS conditionStatus,
            condition_note    AS conditionNote,
            profile_image_url AS profileImageUrl,
            user_id           AS userId,
            joined_at         AS joinedAt,
            created_at        AS createdAt
           FROM players
           WHERE team_id = ?
           ORDER BY CAST(uniform_number AS INTEGER) ASC`
        )
          .bind(teamId)
          .all<RawPlayerDbRow>(),
        resolveCanViewPlayerConditionNotes(c, teamId),
        loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
        computeRecentPitchWorkloadByPlayerId(
          c.env.DB,
          teamId,
          effectiveRefDate,
          excludeMatchIdParam
        ),
      ]);

    const maskedResults = (queryRes.results || [])
      .map((row) => {
        const rawPeriods = periodsByPlayerId.get(row.id) || [];
        const effectiveToday = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: rawPeriods,
          fallbackStatus: row.conditionStatus,
          fallbackNote: row.conditionNote,
          dateKey: effectiveRefDate,
          todayKey,
        });
        const resolvedNote =
          effectiveToday.status !== "active"
            ? effectiveToday.note ?? row.conditionNote
            : row.conditionNote;
        const workload = workloadMap.get(row.id);
        return {
          ...row,
          conditionStatus: effectiveToday.status as PlayerConditionStatus,
          conditionNote: canViewNotes ? resolvedNote || null : null,
          conditionPeriods: maskConditionPeriodsForViewer(rawPeriods, canViewNotes),
          yesterdayPitches: workload?.yesterdayPitches || 0,
          last7DaysPitches: workload?.last7DaysPitches || 0,
          lastPitchedDate: workload?.lastPitchedDate || null,
          lastPitchedPitches: workload?.lastPitchedPitches || 0,
        };
      })
      .sort(comparePlayersByConditionAndUniform);

    return c.json(maskedResults);
  } catch {
    return c.json({ error: "選手の取得に失敗しました" }, 500);
  }
});

// 選手登録（指導者・管理者のみ）
app.post("/:teamId/players", async (c) => {
  const teamId = c.req.param("teamId");
  if (!teamId || teamId === "demo-team") {
    return c.json({ success: true, id: `demo-player-${Date.now()}` });
  }
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated || !access.canManagePlayersForTeam(teamId)) {
    return c.json({ error: "選手を登録する権限がありません" }, 403);
  }

  const body = (await c.req.json()) as {
    name: string;
    nameKana?: string | null;
    uniformNumber: string;
    primaryPosition?: string | null;
    throws?: string | null;
    bats?: string | null;
    profileImageUrl?: string | null;
    userId?: string | null;
    joinedAt?: string | number | null;
    conditionStatus?: string | null;
    conditionNote?: string | null;
  };
  if (!body.name?.trim()) {
    return c.json({ error: "選手名を入力してください" }, 400);
  }

  const playerId = crypto.randomUUID();
  const { unixSeconds: joinedAtSeconds, dateKey: joinedDateKey } =
    parseDateInputToUnixSeconds(body.joinedAt);
  const conditionStatus = normalizePlayerConditionStatus(body.conditionStatus);
  const conditionNote =
    typeof body.conditionNote === "string" && body.conditionNote.trim()
      ? body.conditionNote.trim().slice(0, 160)
      : null;

  try {
    await ensurePlayerProfileColumns(c.env.DB);
    await c.env.DB.prepare(
      `INSERT INTO players (id, team_id, name, name_kana, uniform_number, primary_position, throws, bats, profile_image_url, user_id, is_active, condition_status, condition_note, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
      .bind(
        playerId,
        teamId,
        body.name.trim(),
        body.nameKana?.trim() || null,
        (body.uniformNumber || "").trim(),
        body.primaryPosition ?? null,
        body.throws ?? null,
        body.bats ?? null,
        body.profileImageUrl ?? null,
        body.userId ?? null,
        conditionStatus,
        conditionNote,
        joinedAtSeconds
      )
      .run();
    if (joinedDateKey) {
      await cleanupPreJoinMatchAttendance(c.env.DB, teamId, playerId, joinedDateKey);
    }
    return c.json({ success: true, id: playerId });
  } catch {
    return c.json({ error: "選手の登録に失敗しました" }, 500);
  }
});

// 選手情報更新（指導者・管理者のみ）
app.patch("/:teamId/players/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  if (!teamId || teamId === "demo-team") {
    return c.json({ success: true });
  }
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated || !access.canManagePlayersForTeam(teamId)) {
    return c.json({ error: "選手情報を更新する権限がありません" }, 403);
  }

  const body = (await c.req.json()) as {
    name: string;
    nameKana?: string | null;
    uniformNumber?: string | null;
    primaryPosition?: string | null;
    throws?: string | null;
    bats?: string | null;
    profileImageUrl?: string | null;
    userId?: string | null;
    isActive?: boolean;
    joinedAt?: string | number | null;
    conditionStatus?: string;
    conditionNote?: string | null;
  };
  const rawUniform =
    typeof body.uniformNumber === "string"
      ? body.uniformNumber
          .replace(/[０-９]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
          )
          .trim()
          .replace(/^[#＃]+/, "")
      : "";
  const normalizedUniform =
    rawUniform === "-" ||
    rawUniform === "--" ||
    rawUniform === "ー" ||
    rawUniform === "なし" ||
    rawUniform === "未設定"
      ? ""
      : rawUniform.slice(0, 6);
  const { unixSeconds: joinedAtSeconds, dateKey: joinedDateKey } =
    parseDateInputToUnixSeconds(body.joinedAt);
  try {
    await ensurePlayerProfileColumns(c.env.DB);
    if (body.conditionStatus !== undefined || body.conditionNote !== undefined) {
      const nextStatus = normalizePlayerConditionStatus(body.conditionStatus);
      const nextNote =
        typeof body.conditionNote === "string" && body.conditionNote.trim()
          ? body.conditionNote.trim().slice(0, 160)
          : null;
      await c.env.DB.prepare(
        `UPDATE players
         SET name = ?, name_kana = ?, uniform_number = ?, primary_position = ?, throws = ?, bats = ?, profile_image_url = ?, user_id = ?, is_active = ?, condition_status = ?, condition_note = ?, joined_at = ?
         WHERE id = ? AND team_id = ?`
      )
        .bind(
          body.name,
          body.nameKana ?? null,
          normalizedUniform,
          body.primaryPosition ?? null,
          body.throws ?? null,
          body.bats ?? null,
          body.profileImageUrl ?? null,
          body.userId !== undefined ? body.userId : null,
          body.isActive !== false ? 1 : 0,
          nextStatus,
          nextNote,
          joinedAtSeconds,
          playerId,
          teamId
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `UPDATE players
         SET name = ?, name_kana = ?, uniform_number = ?, primary_position = ?, throws = ?, bats = ?, profile_image_url = ?, user_id = ?, is_active = ?, joined_at = ?
         WHERE id = ? AND team_id = ?`
      )
        .bind(
          body.name,
          body.nameKana ?? null,
          normalizedUniform,
          body.primaryPosition ?? null,
          body.throws ?? null,
          body.bats ?? null,
          body.profileImageUrl ?? null,
          body.userId !== undefined ? body.userId : null,
          body.isActive !== false ? 1 : 0,
          joinedAtSeconds,
          playerId,
          teamId
        )
        .run();
    }
    if (joinedDateKey) {
      await cleanupPreJoinMatchAttendance(c.env.DB, teamId, playerId, joinedDateKey);
    }
    return c.json({ success: true });
  } catch {
    return c.json({ error: "選手の更新に失敗しました" }, 500);
  }
});

// 選手削除（指導者・管理者のみ ＆ 試合出場履歴がある場合は削除拒否し卒団・退団アーカイブへ誘導）
app.delete("/:teamId/players/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  if (!teamId || teamId === "demo-team") {
    return c.json({ success: true });
  }
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated || !access.canManagePlayersForTeam(teamId)) {
    return c.json({ error: "選手を削除する権限がありません" }, 403);
  }

  try {
    const existing = await c.env.DB.prepare(
      `SELECT id, profile_image_url AS profileImageUrl, profile_details AS profileDetails
       FROM players WHERE id = ? AND team_id = ?`
    )
      .bind(playerId, teamId)
      .first<{
        id: string;
        profileImageUrl: string | null;
        profileDetails: string | null;
      }>();

    if (!existing) {
      return c.json({ error: "対象の選手が見つかりません" }, 404);
    }

    const [abRow, advRow, lineupRow, jsonLineupRow] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id FROM at_bats WHERE batter_id = ? OR pitcher_id = ? LIMIT 1`
      )
        .bind(playerId, playerId)
        .first<{ id: string }>(),
      c.env.DB.prepare(
        `SELECT id FROM base_advances WHERE runner_id = ? LIMIT 1`
      )
        .bind(playerId)
        .first<{ id: string }>()
        .catch(() => null),
      c.env.DB.prepare(
        `SELECT id FROM match_lineups WHERE player_id = ? LIMIT 1`
      )
        .bind(playerId)
        .first<{ id: string }>()
        .catch(() => null),
      c.env.DB.prepare(
        `SELECT id FROM matches WHERE team_id = ? AND my_lineup LIKE ? LIMIT 1`
      )
        .bind(teamId, `%${playerId}%`)
        .first<{ id: string }>()
        .catch(() => null),
    ]);

    if (abRow || advRow || lineupRow || jsonLineupRow) {
      return c.json(
        {
          success: false,
          code: "HAS_MATCH_RECORDS",
          error:
            "過去の試合記録が存在するため完全削除できません。戦績データを保護するため「在籍外（卒団・退団）」へ移動してください。",
        },
        409
      );
    }

    if (c.env.BUCKET) {
      if (existing.profileImageUrl?.startsWith("/api/images/players/")) {
        await c.env.BUCKET.delete(
          existing.profileImageUrl.slice("/api/images/".length)
        ).catch(() => {});
      }
      const details = parsePlayerProfileDetails(existing.profileDetails);
      if (details.actionImageUrl?.startsWith("/api/images/players/")) {
        await c.env.BUCKET.delete(
          details.actionImageUrl.slice("/api/images/".length)
        ).catch(() => {});
      }
    }

    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM player_condition_periods WHERE player_id = ?`
      ).bind(playerId),
      c.env.DB.prepare(
        `DELETE FROM parent_child_relations WHERE child_id = ?`
      ).bind(playerId),
      c.env.DB.prepare(
        `DELETE FROM team_group_members WHERE player_id = ?`
      ).bind(playerId),
      c.env.DB.prepare(`DELETE FROM attendances WHERE player_id = ?`).bind(
        playerId
      ),
      c.env.DB.prepare(
        `UPDATE teams SET captain_id = NULL WHERE id = ? AND captain_id = ?`
      ).bind(teamId, playerId),
      c.env.DB.prepare(`DELETE FROM players WHERE id = ? AND team_id = ?`).bind(
        playerId,
        teamId
      ),
    ]).catch(async () => {
      await c.env.DB.prepare(
        `DELETE FROM players WHERE id = ? AND team_id = ?`
      )
        .bind(playerId, teamId)
        .run();
    });

    return c.json({ success: true });
  } catch {
    return c.json({ error: "選手の削除に失敗しました" }, 500);
  }
});

export default app;
