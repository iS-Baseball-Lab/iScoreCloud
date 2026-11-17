// filepath: src/api/venues.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import { venues, matches } from "@/db/schema/match";
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗺️ 球場・グラウンド 基本CRUD（マルチテナント分離済み）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 球場一覧の取得（所属クラブ・チームの球場のみ返却） */
app.get("/", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);

  const db = drizzle(c.env.DB);
  const requestedTeamId = (c.req.query("teamId") || "").trim();

  try {
    if (requestedTeamId && requestedTeamId !== "demo-team") {
      if (!access.canAccessTeam(requestedTeamId)) {
        return c.json({ success: false, error: "対象チームへのアクセス権限がありません" }, 403);
      }
      const tenant = await resolveTeamTenantIds(db, requestedTeamId);
      const list = await db
        .select()
        .from(venues)
        .where(
          buildTeamTenantWhere(
            { organizationId: venues.organizationId, teamId: venues.teamId },
            tenant
          )
        )
        .orderBy(desc(venues.createdAt))
        .all();
      return c.json({ success: true, data: list });
    }

    const callerWhere = buildCallerTenantWhere(
      { organizationId: venues.organizationId, teamId: venues.teamId },
      access
    );
    const list = callerWhere
      ? await db.select().from(venues).where(callerWhere).orderBy(desc(venues.createdAt)).all()
      : await db.select().from(venues).orderBy(desc(venues.createdAt)).all();
    return c.json({ success: true, data: list });
  } catch {
    return c.json({ success: false, error: "球場一覧の取得に失敗しました" }, 500);
  }
});

/** 新規球場の追加（指導者・管理者のみ） */
app.post("/", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: "球場の登録には指導者・管理者権限が必要です" }, 403);
  }

  const body = await c.req.json<{
    teamId?: string;
    name: string;
    shortName?: string;
    address?: string;
    mapUrl?: string;
    surfaceType?: string;
    dimensions?: string;
    notes?: string;
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "球場名は必須です" }, 400);
  }

  const mapUrlCheck = validateSafeHttpUrl(body.mapUrl, { allowEmpty: true });
  if (!mapUrlCheck.ok) {
    return c.json({ error: mapUrlCheck.error }, 400);
  }

  const db = drizzle(c.env.DB);
  const candidateTeamId =
    body.teamId && access.canManagePlayersForTeam(body.teamId)
      ? body.teamId
      : Array.from(access.playerManageableTeamIds)[0] || "";
  const tenant = candidateTeamId ? await resolveTeamTenantIds(db, candidateTeamId) : null;

  const newId = crypto.randomUUID();
  try {
    await db.insert(venues).values({
      id: newId,
      organizationId: tenant?.organizationId || null,
      teamId: tenant?.teamId || null,
      name: body.name.trim(),
      shortName: body.shortName?.trim() || null,
      address: body.address?.trim() || null,
      mapUrl: mapUrlCheck.url,
      surfaceType: body.surfaceType || "dirt",
      dimensions: body.dimensions?.trim() || null,
      notes: body.notes?.trim() || null,
    });
    return c.json({ success: true, id: newId });
  } catch {
    return c.json({ success: false, error: "球場の登録に失敗しました" }, 500);
  }
});

/** 球場情報の更新（指導者・管理者のみ ＆ 自クラブ外の球場上書き防止） */
app.patch("/:id", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: "球場の更新には指導者・管理者権限が必要です" }, 403);
  }

  const id = c.req.param("id")!;
  const body = await c.req.json<{
    name?: string | null;
    shortName?: string | null;
    address?: string | null;
    mapUrl?: string | null;
    surfaceType?: string | null;
    dimensions?: string | null;
    notes?: string | null;
  }>();

  if (body.mapUrl !== undefined) {
    const mapUrlCheck = validateSafeHttpUrl(body.mapUrl, { allowEmpty: true });
    if (!mapUrlCheck.ok) {
      return c.json({ success: false, error: mapUrlCheck.error }, 400);
    }
  }

  const db = drizzle(c.env.DB);
  try {
    const existing = await db.select().from(venues).where(eq(venues.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: "対象の球場が見つかりません" }, 404);
    }
    if (!canCallerMutateTenantEntity(existing, access, { requirePlayerManage: true })) {
      return c.json({ success: false, error: "他クラブの球場は変更できません" }, 403);
    }

    if (!access.isSystemAdmin) {
      const refMatches = await db
        .select({ teamId: matches.teamId })
        .from(matches)
        .where(eq(matches.venueId, id))
        .all();
      const usedByOtherTeam = refMatches.some(
        (m) => !access.canManagePlayersForTeam(m.teamId) && !access.canAccessTeam(m.teamId)
      );
      if (usedByOtherTeam) {
        return c.json(
          { success: false, error: "他チームの試合記録で使用されている球場のため変更できません" },
          403
        );
      }
    }

    const s = (val: string | null | undefined) =>
      val && typeof val === "string" ? val.trim() || null : null;
    const updateData: Partial<typeof venues.$inferInsert> = {};
    if (body.name !== undefined && body.name?.trim()) updateData.name = body.name.trim();
    if (body.shortName !== undefined) updateData.shortName = s(body.shortName);
    if (body.address !== undefined) updateData.address = s(body.address);
    if (body.mapUrl !== undefined) updateData.mapUrl = s(body.mapUrl);
    if (body.surfaceType !== undefined && body.surfaceType) updateData.surfaceType = body.surfaceType;
    if (body.dimensions !== undefined) updateData.dimensions = s(body.dimensions);
    if (body.notes !== undefined) updateData.notes = s(body.notes);

    if (Object.keys(updateData).length > 0) {
      await db.update(venues).set(updateData).where(eq(venues.id, id));
    }
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, error: "球場の更新に失敗しました" }, 500);
  }
});

/** 球場の削除（指導者・管理者のみ ＆ 自クラブ外の球場削除防止） */
app.delete("/:id", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: "球場の削除には指導者・管理者権限が必要です" }, 403);
  }

  const id = c.req.param("id")!;
  const db = drizzle(c.env.DB);
  try {
    const existing = await db.select().from(venues).where(eq(venues.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: "対象の球場が見つかりません" }, 404);
    }
    if (!canCallerMutateTenantEntity(existing, access, { requirePlayerManage: true })) {
      return c.json({ success: false, error: "他クラブの球場は削除できません" }, 403);
    }

    const refMatches = await db
      .select({ teamId: matches.teamId })
      .from(matches)
      .where(eq(matches.venueId, id))
      .all();
    if (!access.isSystemAdmin) {
      const usedByOtherTeam = refMatches.some(
        (m) => !access.canManagePlayersForTeam(m.teamId) && !access.canAccessTeam(m.teamId)
      );
      if (usedByOtherTeam) {
        return c.json(
          { success: false, error: "他チームの試合記録で使用されている球場のため削除できません" },
          403
        );
      }
    }

    if (refMatches.length > 0) {
      await db.update(matches).set({ venueId: null }).where(eq(matches.venueId, id));
    }
    await db.delete(venues).where(eq(venues.id, id));
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, error: "球場の削除に失敗しました" }, 500);
  }
});

export default app;
