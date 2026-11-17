// filepath: src/lib/tenant-scope.ts
import { eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { teams } from "@/db/schema/team";
import type { CallerTeamAccess } from "@/lib/team-access";

export interface TeamTenantIds {
  teamId: string;
  organizationId: string | null;
}

export interface TenantScopedColumns {
  organizationId: SQLiteColumn;
  teamId: SQLiteColumn;
}

/**
 * 指定された teamId の所属クラブ（organizationId）を解決する
 */
export async function resolveTeamTenantIds(
  db: DrizzleD1Database<Record<string, unknown>> | DrizzleD1Database,
  teamId: string
): Promise<TeamTenantIds | null> {
  const cleanId = (teamId || "").trim();
  if (!cleanId || cleanId === "demo-team") return null;

  const row = await db
    .select({
      id: teams.id,
      organizationId: teams.organizationId,
    })
    .from(teams)
    .where(eq(teams.id, cleanId))
    .get();

  if (!row) return null;
  return {
    teamId: row.id,
    organizationId: row.organizationId || null,
  };
}

/**
 * 特定チーム（および同一クラブ内のA/B編成）に紐づく球場・大会のみを抽出する WHERE 条件
 */
export function buildTeamTenantWhere(
  cols: TenantScopedColumns,
  tenant: TeamTenantIds | null
): SQL {
  if (!tenant) {
    return sql`1 = 0`;
  }
  if (tenant.organizationId) {
    return or(
      eq(cols.organizationId, tenant.organizationId),
      eq(cols.teamId, tenant.teamId)
    )!;
  }
  return eq(cols.teamId, tenant.teamId);
}

/**
 * 事前クエリなしで teamId 1つから同一クラブ／チームのレコードのみを SQL サブクエリで抽出する WHERE 条件
 * （Promise.all / db.batch 内で往復を増やさずマルチテナント分離を維持したい場合に使用）
 */
export function buildTeamSubqueryTenantWhere(
  cols: TenantScopedColumns,
  teamId: string
): SQL {
  const cleanId = (teamId || "").trim();
  if (!cleanId || cleanId === "demo-team") {
    return sql`1 = 0`;
  }
  return or(
    eq(cols.teamId, cleanId),
    sql`${cols.organizationId} = (SELECT organization_id FROM teams WHERE id = ${cleanId})`
  )!;
}

/**
 * ログインユーザーが所属・アクセス可能な全クラブ／チームの球場・大会のみを抽出する WHERE 条件
 */
export function buildCallerTenantWhere(
  cols: TenantScopedColumns,
  access: CallerTeamAccess
): SQL | undefined {
  if (access.isSystemAdmin) {
    return undefined;
  }

  const orgIds = Array.from(access.activeOrgIds).filter(
    (id) => Boolean(id) && id !== "demo-team"
  );
  const teamIds = Array.from(access.activeTeamIds).filter(
    (id) => Boolean(id) && id !== "demo-team"
  );

  const conditions: SQL[] = [];
  if (orgIds.length > 0) {
    conditions.push(inArray(cols.organizationId, orgIds));
  }
  if (teamIds.length > 0) {
    conditions.push(inArray(cols.teamId, teamIds));
  }

  if (conditions.length === 0) {
    return sql`1 = 0`;
  }
  return conditions.length === 1 ? conditions[0] : or(...conditions)!;
}

/**
 * 対象の球場・大会レコードが呼び出し元ユーザーの所属クラブ／チームに属しているか判定する
 */
export function canCallerAccessTenantEntity(
  entity: { organizationId?: string | null; teamId?: string | null },
  access: CallerTeamAccess
): boolean {
  if (access.isSystemAdmin) return true;
  if (entity.organizationId && access.canAccessOrganization(entity.organizationId)) {
    return true;
  }
  if (entity.teamId && access.canAccessTeam(entity.teamId)) {
    return true;
  }
  return false;
}

/**
 * 対象の球場・大会レコードを呼び出し元ユーザーが編集・削除できるか判定する
 */
export function canCallerMutateTenantEntity(
  entity: { organizationId?: string | null; teamId?: string | null },
  access: CallerTeamAccess,
  options?: { requireManage?: boolean; requirePlayerManage?: boolean }
): boolean {
  if (access.isSystemAdmin) return true;
  if (!canCallerAccessTenantEntity(entity, access)) return false;

  if (options?.requireManage) {
    if (entity.teamId && access.canManageTeamId(entity.teamId)) return true;
    return access.managedTeamIds.size > 0;
  }

  if (options?.requirePlayerManage) {
    if (entity.teamId && access.canManagePlayersForTeam(entity.teamId)) return true;
    return access.playerManageableTeamIds.size > 0;
  }

  if (entity.teamId && access.canMutateTeamData(entity.teamId)) return true;
  return access.mutableTeamIds.size > 0;
}
