// filepath: src/api/teams/players.ts
import { Hono } from "hono";
import { getAuth } from "@/lib/auth";
import { ensurePlayerProfileColumns } from "@/lib/db-helper";
import {
  comparePlayersByConditionAndUniform,
  getTodayJstDateKey,
  maskConditionPeriodsForViewer,
  normalizePlayerConditionStatus,
  resolveEffectivePlayerConditionOnDate,
  type PlayerConditionStatus,
} from "@/lib/liff/player-condition";
import { parseDateInputToUnixSeconds } from "@/lib/liff/player-profile-schema";
import {
  cleanupPreJoinMatchAttendance,
  loadTeamPlayerConditionPeriodsMap,
} from "@/lib/player-roster-cleanup";
import { canManageTeam } from "@/lib/roles";
import type { AuthUser, WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

const STAFF_ROLES = new Set([
  "admin",
  "system_admin",
  "manager",
  "coach",
  "scorer",
  "staff",
]);

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
  c: {
    env: WorkerEnv;
    req: {
      raw: Request;
      query: (key: string) => string | undefined;
    };
  },
  teamId: string
): Promise<boolean> {
  if (!teamId || teamId === "demo-team") return true;

  let sessionUserId: string | null = null;
  let sessionUserName: string | null = null;

  try {
    if (c.req.raw.headers.get("cookie")) {
      const auth = getAuth(c.env.DB, c.env);
      const session = await auth.api
        .getSession({ headers: c.req.raw.headers })
        .catch(() => null);
      if (session?.user) {
        const role = ((session.user as AuthUser).role || "").toUpperCase();
        if (role === "SYSTEM_ADMIN" || role === "ADMIN") {
          return true;
        }
        sessionUserId = session.user.id || null;
        sessionUserName = session.user.name || null;
      }
    }
  } catch {
    // ignore session errors
  }

  const queryUserId = (c.req.query("userId") || "").trim();
  const queryUserName = (c.req.query("userName") || "").trim();
  const candidateIds = Array.from(
    new Set(
      [sessionUserId, queryUserId].filter(
        (v): v is string =>
          Boolean(v && v !== "cached-user" && v !== "mock-user-12345" && !v.startsWith("demo-"))
      )
    )
  );

  // LINE accountId 連携からの userId 展開
  if (candidateIds.length > 0) {
    try {
      const placeholders = candidateIds.map(() => "?").join(",");
      const accRes = await c.env.DB.prepare(
        `SELECT userId, accountId FROM account WHERE userId IN (${placeholders}) OR accountId IN (${placeholders})`
      )
        .bind(...candidateIds, ...candidateIds)
        .all<{ userId: string | null; accountId: string | null }>();
      for (const row of accRes.results || []) {
        if (row.userId && !candidateIds.includes(row.userId)) candidateIds.push(row.userId);
        if (row.accountId && !candidateIds.includes(row.accountId)) candidateIds.push(row.accountId);
      }
    } catch {
      // ignore
    }
  }

  // 1. チーム作成者 または 組織管理者チェック
  try {
    const teamRow = await c.env.DB.prepare(
      `SELECT created_by AS createdBy, organization_id AS organizationId FROM teams WHERE id = ?`
    )
      .bind(teamId)
      .first<{ createdBy: string | null; organizationId: string | null }>();
    if (teamRow?.createdBy && candidateIds.includes(teamRow.createdBy)) {
      return true;
    }
    if (teamRow?.organizationId && candidateIds.length > 0) {
      const placeholders = candidateIds.map(() => "?").join(",");
      const orgRow = await c.env.DB.prepare(
        `SELECT role FROM organization_members WHERE organization_id = ? AND user_id IN (${placeholders}) LIMIT 1`
      )
        .bind(teamRow.organizationId, ...candidateIds)
        .first<{ role: string | null }>();
      const orgRole = (orgRow?.role || "").toUpperCase();
      if (orgRole === "OWNER" || orgRole === "ADMIN") {
        return true;
      }
    }
  } catch {
    // ignore
  }

  // 2. team_members ロールチェック（userId または 氏名一致の指導者・管理者）
  try {
    const memRes = await c.env.DB.prepare(
      `SELECT user_id AS userId, name, role, status FROM team_members WHERE team_id = ?`
    )
      .bind(teamId)
      .all<{
        userId: string | null;
        name: string | null;
        role: string | null;
        status: string | null;
      }>();

    const activeMembers = (memRes.results || []).filter(
      (m) => !m.status || m.status === "active"
    );

    for (const m of activeMembers) {
      const roleLower = (m.role || "").toLowerCase();
      if (!STAFF_ROLES.has(roleLower) && !canManageTeam(m.role)) continue;
      if (m.userId && candidateIds.includes(m.userId)) {
        return true;
      }
    }

    const candidateNames = [queryUserName, sessionUserName]
      .filter((n): n is string => Boolean(n && n.trim()))
      .map((n) => n.replace(/[\s　]+/g, ""));
    if (candidateNames.length > 0) {
      for (const m of activeMembers) {
        const roleLower = (m.role || "").toLowerCase();
        if (!STAFF_ROLES.has(roleLower) && !canManageTeam(m.role)) continue;
        const memberNorm = (m.name || "").replace(/[\s　]+/g, "");
        if (memberNorm && candidateNames.some((cn) => cn === memberNorm)) {
          return true;
        }
      }
    }
  } catch {
    // ignore
  }

  return false;
}

// 選手一覧取得（主要フィールド全て含む・conditionNote/privateNoteは指導者/管理者のみ返却）
app.get("/:teamId/players", async (c) => {
  const teamId = c.req.param("teamId");
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

// 選手登録（主要フィールド対応）
app.post("/:teamId/players", async (c) => {
  const teamId = c.req.param("teamId");
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
        body.name,
        body.nameKana ?? null,
        body.uniformNumber,
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

// 選手情報更新（主要フィールド対応）
app.patch("/:teamId/players/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
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

// 選手削除
app.delete("/:teamId/players/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  try {
    await c.env.DB.prepare(`DELETE FROM players WHERE id = ? AND team_id = ?`)
      .bind(playerId, teamId)
      .run();
    return c.json({ success: true });
  } catch {
    return c.json({ error: "選手の削除に失敗しました" }, 500);
  }
});

export default app;
