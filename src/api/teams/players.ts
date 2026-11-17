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

// 選手一覧取得（主要フィールド全て含む・conditionNote/privateNoteは指導者/管理者のみ返却）
app.get("/:teamId/players", async (c) => {
  const teamId = c.req.param("teamId");
  if (teamId && teamId !== "demo-team") {
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(teamId)) {
      return c.json({ error: "対象チームへのアクセス権限がありません" }, 403);
    }
  }
  try {
    await ensurePlayerProfileColumns(c.env.DB);
    const [queryRes, canViewNotes, periodsByPlayerId] = await Promise.all([
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
    ]);

    const todayKey = getTodayJstDateKey();
    const maskedResults = (queryRes.results || [])
      .map((row) => {
        const rawPeriods = periodsByPlayerId.get(row.id) || [];
        const effectiveToday = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: rawPeriods,
          fallbackStatus: row.conditionStatus,
          fallbackNote: row.conditionNote,
          dateKey: todayKey,
          todayKey,
        });
        const resolvedNote =
          effectiveToday.status !== "active"
            ? effectiveToday.note ?? row.conditionNote
            : row.conditionNote;
        return {
          ...row,
          conditionStatus: effectiveToday.status as PlayerConditionStatus,
          conditionNote: canViewNotes ? resolvedNote || null : null,
          conditionPeriods: maskConditionPeriodsForViewer(rawPeriods, canViewNotes),
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
    uniformNumber: string;
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
          body.uniformNumber,
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
          body.uniformNumber,
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
