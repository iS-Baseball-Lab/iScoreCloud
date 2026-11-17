// filepath: src/api/tournaments.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { tournaments, matches } from "@/db/schema";
import { resolveCallerTeamAccess } from "@/lib/team-access";
import {
  buildCallerTenantWhere,
  buildTeamTenantWhere,
  canCallerMutateTenantEntity,
  resolveTeamTenantIds,
} from "@/lib/tenant-scope";
import { validateSafeHttpUrl } from "@/lib/utils";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

// ──────────────────────────────────
// GET /api/tournaments
// 大会一覧取得（所属クラブ・チームの大会のみ新しい順）
// ──────────────────────────────────
app.get("/", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);

  const db = drizzle(c.env.DB);
  const category = c.req.query("category");
  const requestedTeamId = (c.req.query("teamId") || "").trim();

  try {
    const conditions: SQL[] = [];

    if (requestedTeamId && requestedTeamId !== "demo-team") {
      if (!access.canAccessTeam(requestedTeamId)) {
        return c.json({ error: "対象チームへのアクセス権限がありません" }, 403);
      }
      const tenant = await resolveTeamTenantIds(db, requestedTeamId);
      conditions.push(
        buildTeamTenantWhere(
          {
            organizationId: tournaments.organizationId,
            teamId: tournaments.teamId,
          },
          tenant
        )
      );
    } else {
      const callerWhere = buildCallerTenantWhere(
        {
          organizationId: tournaments.organizationId,
          teamId: tournaments.teamId,
        },
        access
      );
      if (callerWhere) {
        conditions.push(callerWhere);
      }
    }

    if (category && category !== "all") {
      conditions.push(eq(tournaments.category, category));
    }

    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

    const results = whereClause
      ? await db
          .select()
          .from(tournaments)
          .where(whereClause)
          .orderBy(desc(tournaments.createdAt))
          .all()
      : await db
          .select()
          .from(tournaments)
          .orderBy(desc(tournaments.createdAt))
          .all();
    return c.json(results);
  } catch {
    return c.json({ error: "大会の取得に失敗しました" }, 500);
  }
});

// ──────────────────────────────────
// POST /api/tournaments
// 大会の新規登録（指導者・管理者のみ）
// ──────────────────────────────────
app.post("/", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: "大会の登録には指導者・管理者権限が必要です" }, 403);
  }

  const body = await c.req.json<{
    teamId?: string;
    name: string;
    category?: string;
    season?: string;
    organizer?: string | null;
    bracketUrl?: string | null;
    timeLimit?: string | null;
    coldGameRule?: string | null;
    tiebreakerRule?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "大会名は必須です" }, 400);
  }

  const bracketCheck = validateSafeHttpUrl(body.bracketUrl, { allowEmpty: true });
  if (!bracketCheck.ok) {
    return c.json({ error: bracketCheck.error }, 400);
  }

  const db = drizzle(c.env.DB);
  const candidateTeamId =
    body.teamId && access.canManagePlayersForTeam(body.teamId)
      ? body.teamId
      : Array.from(access.playerManageableTeamIds)[0] || "";
  const tenant = candidateTeamId ? await resolveTeamTenantIds(db, candidateTeamId) : null;
  const tournamentId = crypto.randomUUID();

  try {
    await db.insert(tournaments).values({
      id: tournamentId,
      organizationId: tenant?.organizationId || null,
      teamId: tenant?.teamId || null,
      name: body.name.trim(),
      category: body.category ?? "other",
      season: body.season ?? String(new Date().getFullYear()),
      organizer: body.organizer ?? null,
      bracketUrl: bracketCheck.url,
      timeLimit: body.timeLimit ?? null,
      coldGameRule: body.coldGameRule ?? null,
      tiebreakerRule: body.tiebreakerRule ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
    });
    return c.json({ success: true, id: tournamentId });
  } catch (e) {
    console.error(e);
    return c.json({ success: false, error: "大会の作成に失敗しました" }, 500);
  }
});

// ──────────────────────────────────
// PATCH /api/tournaments/:id
// 大会情報の更新（指導者・管理者のみ ＆ 他クラブ大会の上書き防止）
// ──────────────────────────────────
app.patch("/:id", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: "大会の更新には指導者・管理者権限が必要です" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json<{
    name: string;
    category?: string;
    season?: string;
    organizer?: string | null;
    bracketUrl?: string | null;
    timeLimit?: string | null;
    coldGameRule?: string | null;
    tiebreakerRule?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>();

  const bracketCheck = validateSafeHttpUrl(body.bracketUrl, { allowEmpty: true });
  if (!bracketCheck.ok) {
    return c.json({ success: false, error: bracketCheck.error }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const existing = await db.select().from(tournaments).where(eq(tournaments.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: "対象の大会が見つかりません" }, 404);
    }
    if (!canCallerMutateTenantEntity(existing, access, { requirePlayerManage: true })) {
      return c.json({ success: false, error: "他クラブの大会情報は変更できません" }, 403);
    }

    if (!access.isSystemAdmin) {
      const refMatches = await db
        .select({ teamId: matches.teamId })
        .from(matches)
        .where(eq(matches.tournamentId, id))
        .all();
      const usedByOtherTeam = refMatches.some(
        (m) => !access.canManagePlayersForTeam(m.teamId) && !access.canAccessTeam(m.teamId)
      );
      if (usedByOtherTeam) {
        return c.json(
          { success: false, error: "他チームの試合記録で使用されている大会のため変更できません" },
          403
        );
      }
    }

    await db
      .update(tournaments)
      .set({
        name: body.name.trim(),
        category: body.category ?? "other",
        season: body.season,
        organizer: body.organizer ?? null,
        bracketUrl: bracketCheck.url,
        timeLimit: body.timeLimit ?? null,
        coldGameRule: body.coldGameRule ?? null,
        tiebreakerRule: body.tiebreakerRule ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
      })
      .where(eq(tournaments.id, id));
    return c.json({ success: true });
  } catch (e) {
    console.error(e);
    return c.json({ success: false, error: "更新に失敗しました" }, 500);
  }
});

// ──────────────────────────────────
// DELETE /api/tournaments/:id
// 大会の削除（指導者・管理者のみ ＆ 他クラブ大会の削除防止）
// ──────────────────────────────────
app.delete("/:id", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: "大会の削除には指導者・管理者権限が必要です" }, 403);
  }

  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  try {
    const existing = await db.select().from(tournaments).where(eq(tournaments.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: "対象の大会が見つかりません" }, 404);
    }
    if (!canCallerMutateTenantEntity(existing, access, { requirePlayerManage: true })) {
      return c.json({ success: false, error: "他クラブの大会は削除できません" }, 403);
    }

    if (!access.isSystemAdmin) {
      const refMatches = await db
        .select({ teamId: matches.teamId })
        .from(matches)
        .where(eq(matches.tournamentId, id))
        .all();
      const usedByOtherTeam = refMatches.some(
        (m) => !access.canManagePlayersForTeam(m.teamId) && !access.canAccessTeam(m.teamId)
      );
      if (usedByOtherTeam) {
        return c.json(
          { success: false, error: "他チームの試合記録で使用されている大会のため削除できません" },
          403
        );
      }
    }

    await db.update(matches).set({ tournamentId: null }).where(eq(matches.tournamentId, id));
    await db.delete(tournaments).where(eq(tournaments.id, id));
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, error: "削除に失敗しました" }, 500);
  }
});

export default app;
