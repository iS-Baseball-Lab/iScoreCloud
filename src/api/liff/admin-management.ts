// filepath: src/api/liff/admin-management.ts
import { Hono } from "hono";
import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  matches,
  memberCars,
  organizationMembers,
  organizations,
  parentChildRelations,
  players,
  teamEquipments,
  teamMembers,
  teamRoleSettings,
  teams,
  tournaments,
  user,
} from "@/db/schema";
import { ensureAuthSchema } from "@/lib/auth";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { canManageSystem, canManageTeam, ROLES } from "@/lib/roles";
import {
  extractHeaderUserId,
  extractHeaderUserName,
  IGNORED_MOCK_USER_IDS,
  parseSubRolesList,
  resolveCallerTeamAccess,
  type CallerTeamAccess,
} from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";

const liffAdminMgmtRouter = new Hono<{ Bindings: WorkerEnv }>();

// =========================================================
// 共通インターフェース定義（フロントエンドと共有）
// =========================================================

export interface AdminOrgSummary {
  id: string;
  name: string;
  shortName: string;
  category: string;
  foundedYear: number | null;
  description: string;
  logoImageUrl: string | null;
  coverImageUrl: string | null;
}

export interface AdminSquadItem {
  id: string;
  organizationId: string | null;
  name: string;
  year: number;
  managerName: string;
  captainId: string | null;
  homeGround: string;
  tier: string;
  teamType: "regular" | "practice";
  playerCount: number;
  memberCount: number;
  matchCount: number;
  isCurrent: boolean;
}

export interface AdminTeamsResponse {
  success: boolean;
  isDemo: boolean;
  canManage: boolean;
  myRole: string;
  organization: AdminOrgSummary;
  currentSquad: AdminSquadItem;
  siblingSquads: AdminSquadItem[];
  players: Array<{
    id: string;
    name: string;
    uniformNumber: string;
  }>;
  error?: string;
}

export type AdminCarType = "normal" | "cargo" | "bus";

export interface AdminCarItem {
  id: string;
  teamId: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerId2: string | null;
  ownerName2: string | null;
  name: string;
  color: string | null;
  colorCode: string | null;
  numberPlate: string | null;
  capacity: number;
  fuelEfficiency: number;
  carType: AdminCarType;
}

export interface AdminCarsResponse {
  success: boolean;
  isDemo: boolean;
  canManage: boolean;
  myRole: string;
  cars: AdminCarItem[];
  adultMembers: Array<{
    memberId: string;
    name: string;
    role: string;
    memberType: string;
  }>;
  summary: {
    totalCars: number;
    busCount: number;
    cargoCount: number;
    normalCount: number;
    sharedCount?: number;
    totalCapacity: number;
  };
  error?: string;
}

export interface AdminRoleMemberItem {
  memberId: string;
  userId: string | null;
  name: string;
  nameKana: string;
  memberType: string;
  phone: string;
  email: string;
  role: string;
  subRoles: string[];
  subLabel: string;
  status: string;
  isLineLinked: boolean;
}

export interface AdminCustomRoleTitle {
  role: string;
  customLabel: string;
}

export interface AdminRolesResponse {
  success: boolean;
  isDemo: boolean;
  canManage: boolean;
  myRole: string;
  members: AdminRoleMemberItem[];
  roleSettings: AdminCustomRoleTitle[];
  error?: string;
}

export interface AdminFamilyRelationItem {
  id: string;
  parentId: string;
  parentName: string;
  parentMemberType: string;
  parentSubLabel: string;
  childId: string;
  childName: string;
  uniformNumber: string;
}

export interface AdminFamilyResponse {
  success: boolean;
  isDemo: boolean;
  canManage: boolean;
  myRole: string;
  players: Array<{
    id: string;
    name: string;
    uniformNumber: string;
    conditionStatus: string;
  }>;
  adultMembers: Array<{
    memberId: string;
    name: string;
    memberType: string;
    role: string;
    subLabel: string;
  }>;
  relations: AdminFamilyRelationItem[];
  presetDutyLabels: string[];
  error?: string;
}

export interface AdminTournamentItem {
  id: string;
  name: string;
  category: string;
  season: string;
  organizer: string;
  bracketUrl: string;
  timeLimit: string;
  coldGameRule: string;
  tiebreakerRule: string;
  startDate: string;
  endDate: string;
  teamMatchCount: number;
  otherTeamMatchCount: number;
}

export interface AdminTournamentsResponse {
  success: boolean;
  isDemo: boolean;
  canManage: boolean;
  myRole: string;
  teamCategory: string;
  tournaments: AdminTournamentItem[];
  error?: string;
}

export interface AdminEquipmentItem {
  id: string;
  teamId: string;
  name: string;
  description: string;
  isHeavy: boolean;
  quantity: number;
}

export interface AdminEquipmentsResponse {
  success: boolean;
  isDemo: boolean;
  canManage: boolean;
  myRole: string;
  equipments: AdminEquipmentItem[];
  error?: string;
}

// =========================================================
// 内部ヘルパー：権限判定 ＆ ユーザーレコード保証
// =========================================================

interface ResolvedMgmtContext {
  isDemo: boolean;
  teamId: string;
  canManage: boolean;
  myRole: string;
  access: CallerTeamAccess | null;
}

const VALID_ROLES_SET = new Set<string>([
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.COACH,
  ROLES.SCORER,
  ROLES.STAFF,
  ROLES.PARENT,
  ROLES.PLAYER,
  ROLES.VIEWER,
]);

const DEFAULT_DUTY_PRESETS = [
  "1班",
  "2班",
  "3班",
  "4班",
  "5班",
  "6班",
  "配車",
  "審判",
  "用具",
  "救急",
  "免除",
];

function sanitizeCarType(raw: unknown): AdminCarType {
  if (raw === "bus" || raw === "cargo" || raw === "normal") return raw;
  return "normal";
}

function parseSubLabelsMap(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) {
          out[k] = v.trim();
        }
      }
      return out;
    }
  } catch {
    // ignore invalid json
  }
  return {};
}

async function resolveAdminMgmtContext(
  c: Context<{ Bindings: WorkerEnv }>,
  explicitTeamId: string,
  extraUserId?: string | null
): Promise<
  | { ok: true; ctx: ResolvedMgmtContext }
  | { ok: false; status: 400 | 403 | 404; error: string }
> {
  const tid = explicitTeamId.trim();
  if (!tid || tid === "demo-team") {
    return {
      ok: true,
      ctx: {
        isDemo: true,
        teamId: "demo-team",
        canManage: true,
        myRole: "admin",
        access: null,
      },
    };
  }

  await ensureAllSchemasOnce(c.env.DB);
  const access = await resolveCallerTeamAccess(c, extraUserId ? [extraUserId] : undefined);
  if (!access.canAccessTeam(tid)) {
    return {
      ok: false,
      status: 403,
      error: "このチームへのアクセス権限がありません",
    };
  }

  const grant = access.teamRoles.get(tid);
  let myRole = (grant?.role || "viewer").toLowerCase();
  const subRoles = grant?.subRoles || [];

  if (canManageSystem(myRole, subRoles) || access.isSystemAdmin) {
    myRole = "admin";
  } else if (canManageTeam(myRole, subRoles) || access.canManageTeamId(tid)) {
    myRole = "manager";
  }

  const canManage =
    access.isSystemAdmin ||
    access.canManageTeamId(tid) ||
    canManageTeam(myRole, subRoles);

  return {
    ok: true,
    ctx: {
      isDemo: false,
      teamId: tid,
      canManage,
      myRole,
      access,
    },
  };
}

async function ensureValidUserRow(
  d1: D1Database,
  userIdCandidate: string,
  displayNameCandidate: string
): Promise<string | null> {
  const cleanId = userIdCandidate.trim();
  if (!cleanId || IGNORED_MOCK_USER_IDS.has(cleanId)) return null;

  await ensureAuthSchema(d1);
  const db = drizzle(d1);
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, cleanId))
    .get();
  if (existing) return existing.id;

  await db.insert(user).values({
    id: cleanId,
    name: displayNameCandidate.trim() || "LINEユーザー",
    email: `${cleanId}@line.user`,
    emailVerified: false,
    role: "GUEST",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return cleanId;
}

// =========================================================
// 1. チーム・編成管理 API (/teams & /create-club)
// =========================================================

liffAdminMgmtRouter.get("/teams", async (c) => {
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;

  if (ctx.isDemo) {
    const demoSquadA: AdminSquadItem = {
      id: "demo-team",
      organizationId: "demo-org",
      name: "2026年度 Aチーム",
      year: 2026,
      managerName: "田中 監督",
      captainId: "demo-p-1",
      homeGround: "多摩川緑地グラウンド",
      tier: "Aチーム",
      teamType: "regular",
      playerCount: 14,
      memberCount: 18,
      matchCount: 12,
      isCurrent: true,
    };
    const demoSquadB: AdminSquadItem = {
      id: "demo-team-b",
      organizationId: "demo-org",
      name: "2026年度 Bチーム（低学年）",
      year: 2026,
      managerName: "高橋 コーチ",
      captainId: null,
      homeGround: "市立第一小グラウンド",
      tier: "Bチーム",
      teamType: "regular",
      playerCount: 11,
      memberCount: 14,
      matchCount: 6,
      isCurrent: false,
    };
    const payload: AdminTeamsResponse = {
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      organization: {
        id: "demo-org",
        name: "iScore ドリームス",
        shortName: "ドリームス",
        category: "gakudou",
        foundedYear: 2015,
        description: "全力疾走・笑顔でつなぐ全員野球！",
        logoImageUrl: "/liff-logo.png",
        coverImageUrl: null,
      },
      currentSquad: demoSquadA,
      siblingSquads: [demoSquadA, demoSquadB],
      players: [
        { id: "demo-p-1", name: "鈴木 翔太", uniformNumber: "10" },
        { id: "demo-p-2", name: "佐藤 蓮", uniformNumber: "1" },
        { id: "demo-p-3", name: "高橋 陸", uniformNumber: "6" },
      ],
    };
    return c.json(payload);
  }

  const db = drizzle(c.env.DB);
  const currentRow = await db
    .select({
      id: teams.id,
      organizationId: teams.organizationId,
      name: teams.name,
      year: teams.year,
      managerName: teams.managerName,
      captainId: teams.captainId,
      homeGround: teams.homeGround,
      tier: teams.tier,
      teamType: teams.teamType,
      orgName: organizations.name,
      orgShortName: organizations.shortName,
      orgCategory: organizations.category,
      orgFoundedYear: organizations.foundedYear,
      orgDescription: organizations.description,
      orgLogoImageUrl: organizations.logoImageUrl,
      orgCoverImageUrl: organizations.coverImageUrl,
    })
    .from(teams)
    .leftJoin(organizations, eq(teams.organizationId, organizations.id))
    .where(eq(teams.id, ctx.teamId))
    .get();

  if (!currentRow) {
    return c.json({ success: false, error: "チームが見つかりません" }, 404);
  }

  const [rawSiblingTeams, teamPlayers] = await Promise.all([
    currentRow.organizationId
      ? db
          .select()
          .from(teams)
          .where(eq(teams.organizationId, currentRow.organizationId))
          .orderBy(desc(teams.year), desc(teams.createdAt))
          .all()
      : db.select().from(teams).where(eq(teams.id, ctx.teamId)).all(),
    db
      .select({
        id: players.id,
        name: players.name,
        uniformNumber: players.uniformNumber,
      })
      .from(players)
      .where(eq(players.teamId, ctx.teamId))
      .all(),
  ]);

  const authorizedSiblingTeams = rawSiblingTeams.filter(
    (st) => st.id === ctx.teamId || Boolean(ctx.access?.canAccessTeam(st.id))
  );
  const siblingIds = authorizedSiblingTeams.map((t) => t.id);

  const [playerCounts, memberCounts, matchCounts] =
    siblingIds.length > 0
      ? await Promise.all([
          db
            .select({
              teamId: players.teamId,
              count: sql<number>`count(*)`,
            })
            .from(players)
            .where(inArray(players.teamId, siblingIds))
            .groupBy(players.teamId)
            .all(),
          db
            .select({
              teamId: teamMembers.teamId,
              count: sql<number>`count(*)`,
            })
            .from(teamMembers)
            .where(
              and(
                inArray(teamMembers.teamId, siblingIds),
                eq(teamMembers.status, "active")
              )
            )
            .groupBy(teamMembers.teamId)
            .all(),
          db
            .select({
              teamId: matches.teamId,
              count: sql<number>`count(*)`,
            })
            .from(matches)
            .where(inArray(matches.teamId, siblingIds))
            .groupBy(matches.teamId)
            .all(),
        ])
      : [[], [], []];

  const pCountMap = new Map(playerCounts.map((r) => [r.teamId, Number(r.count) || 0]));
  const mCountMap = new Map(memberCounts.map((r) => [r.teamId, Number(r.count) || 0]));
  const gCountMap = new Map(matchCounts.map((r) => [r.teamId, Number(r.count) || 0]));

  const siblingSquads: AdminSquadItem[] = authorizedSiblingTeams.map((st) => ({
    id: st.id,
    organizationId: st.organizationId,
    name: st.name,
    year: st.year || new Date().getFullYear(),
    managerName: st.managerName || "",
    captainId: st.captainId || null,
    homeGround: st.homeGround || "",
    tier: st.tier || "",
    teamType: st.teamType === "practice" ? "practice" : "regular",
    playerCount: pCountMap.get(st.id) || 0,
    memberCount: mCountMap.get(st.id) || 0,
    matchCount: gCountMap.get(st.id) || 0,
    isCurrent: st.id === ctx.teamId,
  }));

  const currentSquad =
    siblingSquads.find((s) => s.id === ctx.teamId) || {
      id: currentRow.id,
      organizationId: currentRow.organizationId,
      name: currentRow.name,
      year: currentRow.year || new Date().getFullYear(),
      managerName: currentRow.managerName || "",
      captainId: currentRow.captainId || null,
      homeGround: currentRow.homeGround || "",
      tier: currentRow.tier || "",
      teamType: currentRow.teamType === "practice" ? "practice" : "regular",
      playerCount: teamPlayers.length,
      memberCount: 0,
      matchCount: 0,
      isCurrent: true,
    };

  const payload: AdminTeamsResponse = {
    success: true,
    isDemo: false,
    canManage: ctx.canManage,
    myRole: ctx.myRole,
    organization: {
      id: currentRow.organizationId || currentRow.id,
      name: currentRow.orgName || currentRow.name,
      shortName: currentRow.orgShortName || "",
      category: currentRow.orgCategory || "gakudou",
      foundedYear: currentRow.orgFoundedYear ?? null,
      description: currentRow.orgDescription || "",
      logoImageUrl: currentRow.orgLogoImageUrl || null,
      coverImageUrl: currentRow.orgCoverImageUrl || null,
    },
    currentSquad,
    siblingSquads,
    players: teamPlayers,
  };

  return c.json(payload);
});

/**
 * 現在のクラブ（organizations）＆編成（teams）基本情報の更新
 */
liffAdminMgmtRouter.patch("/teams/current", async (c) => {
  const body = (await c.req.json()) as {
    teamId?: string;
    userId?: string;
    orgName?: string;
    orgShortName?: string;
    category?: string;
    foundedYear?: number | null;
    description?: string;
    squadName?: string;
    year?: number;
    managerName?: string;
    captainId?: string | null;
    homeGround?: string;
    tier?: string;
    teamType?: string;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo) {
    return c.json({ success: true, isDemo: true, message: "チーム情報を保存しました（デモ）" });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const currentTeam = await db
    .select({ id: teams.id, organizationId: teams.organizationId, name: teams.name })
    .from(teams)
    .where(eq(teams.id, ctx.teamId))
    .get();

  if (!currentTeam) {
    return c.json({ success: false, error: "チームが見つかりません" }, 404);
  }

  let orgId = currentTeam.organizationId;
  const trimmedOrgName = (body.orgName || "").trim();
  const trimmedSquadName = (body.squadName || "").trim();

  if (!orgId) {
    orgId = crypto.randomUUID();
    await db.insert(organizations).values({
      id: orgId,
      name: trimmedOrgName || currentTeam.name,
      shortName: body.orgShortName ? body.orgShortName.trim() : null,
      category: (body.category || "gakudou").trim(),
      foundedYear:
        typeof body.foundedYear === "number" && Number.isFinite(body.foundedYear)
          ? body.foundedYear
          : null,
      description: body.description ? body.description.trim() : null,
      createdAt: new Date(),
    });
    await db
      .update(teams)
      .set({ organizationId: orgId })
      .where(eq(teams.id, ctx.teamId));
  } else {
    const orgUpdate: Partial<typeof organizations.$inferInsert> = {};
    if (trimmedOrgName) orgUpdate.name = trimmedOrgName;
    if (body.orgShortName !== undefined) {
      orgUpdate.shortName = body.orgShortName.trim() || null;
    }
    if (body.category !== undefined && body.category.trim()) {
      orgUpdate.category = body.category.trim();
    }
    if (body.foundedYear !== undefined) {
      orgUpdate.foundedYear =
        typeof body.foundedYear === "number" && Number.isFinite(body.foundedYear)
          ? body.foundedYear
          : null;
    }
    if (body.description !== undefined) {
      orgUpdate.description = body.description.trim() || null;
    }
    if (Object.keys(orgUpdate).length > 0) {
      await db
        .update(organizations)
        .set(orgUpdate)
        .where(eq(organizations.id, orgId));
    }
  }

  const teamUpdate: Partial<typeof teams.$inferInsert> = {};
  if (trimmedSquadName) teamUpdate.name = trimmedSquadName;
  if (typeof body.year === "number" && body.year >= 1950 && body.year <= 2100) {
    teamUpdate.year = body.year;
  }
  if (body.managerName !== undefined) {
    teamUpdate.managerName = body.managerName.trim() || null;
  }
  if (body.captainId !== undefined) {
    teamUpdate.captainId = body.captainId ? body.captainId.trim() : null;
  }
  if (body.homeGround !== undefined) {
    teamUpdate.homeGround = body.homeGround.trim() || null;
  }
  if (body.tier !== undefined) {
    teamUpdate.tier = body.tier.trim() || null;
  }
  if (body.teamType !== undefined) {
    teamUpdate.teamType = body.teamType === "practice" ? "practice" : "regular";
  }

  if (Object.keys(teamUpdate).length > 0) {
    await db.update(teams).set(teamUpdate).where(eq(teams.id, ctx.teamId));
  }

  return c.json({ success: true, message: "チーム・編成情報を更新しました" });
});

/**
 * 同一クラブ内に新しい編成（Bチーム・低学年・次年度編成等）を追加
 */
liffAdminMgmtRouter.post("/teams/squad", async (c) => {
  const body = (await c.req.json()) as {
    teamId?: string;
    userId?: string;
    userName?: string;
    name?: string;
    year?: number;
    tier?: string;
    teamType?: string;
    managerName?: string;
    homeGround?: string;
    copyStaffMembers?: boolean;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  const squadName = (body.name || "").trim();
  if (!squadName) {
    return c.json({ success: false, error: "編成名を入力してください" }, 400);
  }

  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      squadId: "demo-team",
      message: `編成「${squadName}」を作成しました（デモ）`,
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const baseTeam = await db
    .select()
    .from(teams)
    .where(eq(teams.id, ctx.teamId))
    .get();
  if (!baseTeam) {
    return c.json({ success: false, error: "元のチームが見つかりません" }, 404);
  }

  const effectiveUserId =
    (body.userId || "").trim() ||
    extractHeaderUserId(c) ||
    ctx.access?.sessionUser?.id ||
    baseTeam.createdBy;
  const effectiveUserName =
    (body.userName || "").trim() ||
    extractHeaderUserName(c) ||
    ctx.access?.sessionUser?.name ||
    "管理者";

  const creatorUserId =
    (await ensureValidUserRow(c.env.DB, effectiveUserId, effectiveUserName)) ||
    baseTeam.createdBy;

  let orgId = baseTeam.organizationId;
  if (!orgId) {
    orgId = crypto.randomUUID();
    await db.insert(organizations).values({
      id: orgId,
      name: baseTeam.name,
      category: "gakudou",
      createdAt: new Date(),
    });
    await db
      .update(teams)
      .set({ organizationId: orgId })
      .where(eq(teams.id, baseTeam.id));
  }

  const newTeamId = crypto.randomUUID();
  const nextYear =
    typeof body.year === "number" && body.year >= 1950 && body.year <= 2100
      ? body.year
      : baseTeam.year || new Date().getFullYear();

  await db.insert(teams).values({
    id: newTeamId,
    organizationId: orgId,
    name: squadName,
    year: nextYear,
    tier: body.tier ? body.tier.trim() : null,
    teamType: body.teamType === "practice" ? "practice" : "regular",
    managerName: body.managerName ? body.managerName.trim() : baseTeam.managerName,
    homeGround: body.homeGround ? body.homeGround.trim() : baseTeam.homeGround,
    scorebookSymbolRules: baseTeam.scorebookSymbolRules,
    scheduleDefaultTimes: baseTeam.scheduleDefaultTimes,
    createdBy: creatorUserId,
    createdAt: new Date(),
  });

  // 作成者本人 ＆ オプションで現在の監督・IT管理・コーチ陣を新編成へ自動引き継ぎ
  const addedUserIds = new Set<string>();
  if (creatorUserId) {
    addedUserIds.add(creatorUserId);
    await db.insert(teamMembers).values({
      id: `tm_${crypto.randomUUID().replace(/-/g, "")}`,
      teamId: newTeamId,
      userId: creatorUserId,
      name: effectiveUserName,
      memberType: "staff",
      role: "manager",
      status: "active",
      joinedAt: new Date(),
    });
  }

  if (body.copyStaffMembers !== false) {
    const existingStaff = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, baseTeam.id), eq(teamMembers.status, "active"))
      )
      .all();

    for (const m of existingStaff) {
      const r = (m.role || "").toLowerCase();
      const subs = parseSubRolesList(m.subRoles);
      const isLeaderOrStaff =
        r === "admin" ||
        r === "manager" ||
        r === "coach" ||
        r === "scorer" ||
        r === "staff" ||
        m.memberType === "staff" ||
        subs.some((sr) =>
          ["admin", "manager", "coach", "scorer", "staff"].includes(
            sr.toLowerCase()
          )
        );
      if (!isLeaderOrStaff) continue;
      if (m.userId && addedUserIds.has(m.userId)) continue;
      if (m.userId) addedUserIds.add(m.userId);

      await db.insert(teamMembers).values({
        id: `tm_${crypto.randomUUID().replace(/-/g, "")}`,
        teamId: newTeamId,
        userId: m.userId,
        name: m.name,
        nameKana: m.nameKana,
        memberType: m.memberType,
        phone: m.phone,
        email: m.email,
        role: m.role,
        subRoles: m.subRoles,
        status: "active",
        joinedAt: new Date(),
      });
    }
  }

  return c.json({
    success: true,
    squadId: newTeamId,
    message: `新しい編成「${squadName}」を作成しました`,
  });
});

/**
 * 編成（teams）の削除（クラブ最後の1編成や現在選択中の試合あり編成の誤削除を防止）
 */
liffAdminMgmtRouter.delete("/teams/squad/:squadId", async (c) => {
  const squadId = c.req.param("squadId");
  const teamId = c.req.query("teamId") || "";
  const userId = c.req.query("userId");

  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo || squadId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true, message: "編成を削除しました（デモ）" });
  }
  if (!ctx.canManage || !ctx.access?.canManageTeamId(squadId)) {
    return c.json({ success: false, error: "この編成を削除する権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const targetSquad = await db
    .select()
    .from(teams)
    .where(eq(teams.id, squadId))
    .get();
  if (!targetSquad) {
    return c.json({ success: false, error: "編成が見つかりません" }, 404);
  }

  if (targetSquad.organizationId) {
    const siblings = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.organizationId, targetSquad.organizationId))
      .all();
    if (siblings.length <= 1) {
      return c.json(
        {
          success: false,
          error: "クラブ内の最後の1編成は削除できません。",
        },
        400
      );
    }
  }

  const matchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.teamId, squadId))
    .limit(1)
    .all();
  if (matchRows.length > 0) {
    return c.json(
      {
        success: false,
        error:
          "試合記録が登録されている編成は誤消失防止のため直接削除できません。先に試合データを削除するか年度保管として残してください。",
      },
      400
    );
  }

  await db.delete(teams).where(eq(teams.id, squadId));
  return c.json({ success: true, message: `編成「${targetSquad.name}」を削除しました` });
});

/**
 * 新しいクラブ（organizations）＋初期編成（teams）の新規立ち上げ
 * （未所属のLINEログイン済みユーザーが自分のチームを立ち上げるケースにも対応）
 */
liffAdminMgmtRouter.post("/create-club", async (c) => {
  await ensureAllSchemasOnce(c.env.DB);
  const body = (await c.req.json()) as {
    userId?: string;
    userName?: string;
    orgName?: string;
    orgShortName?: string;
    category?: string;
    squadName?: string;
    year?: number;
    homeGround?: string;
  };

  const orgName = (body.orgName || "").trim();
  const squadName = (body.squadName || `${new Date().getFullYear()}年度 Aチーム`).trim();
  if (!orgName) {
    return c.json({ success: false, error: "チーム（クラブ）名を入力してください" }, 400);
  }

  const access = await resolveCallerTeamAccess(c, body.userId ? [body.userId] : undefined);
  const rawUserId =
    (body.userId || "").trim() ||
    extractHeaderUserId(c) ||
    access.sessionUser?.id ||
    "";
  const rawUserName =
    (body.userName || "").trim() ||
    extractHeaderUserName(c) ||
    access.sessionUser?.name ||
    "代表・監督";

  const validUserId = await ensureValidUserRow(c.env.DB, rawUserId, rawUserName);
  if (!validUserId) {
    return c.json(
      {
        success: false,
        error: "新しいチームを作成するにはLINEログインが必要です。",
      },
      401
    );
  }

  const db = drizzle(c.env.DB);
  const orgId = crypto.randomUUID();
  const newTeamId = crypto.randomUUID();
  const yearVal =
    typeof body.year === "number" && body.year >= 1950 && body.year <= 2100
      ? body.year
      : new Date().getFullYear();

  await db.insert(organizations).values({
    id: orgId,
    name: orgName,
    shortName: body.orgShortName ? body.orgShortName.trim() : null,
    category: (body.category || "gakudou").trim(),
    createdAt: new Date(),
  });

  await db.insert(organizationMembers).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId: validUserId,
    role: "OWNER",
    status: "active",
    createdAt: new Date(),
  });

  await db.insert(teams).values({
    id: newTeamId,
    organizationId: orgId,
    name: squadName,
    year: yearVal,
    homeGround: body.homeGround ? body.homeGround.trim() : null,
    teamType: "regular",
    createdBy: validUserId,
    createdAt: new Date(),
  });

  await db.insert(teamMembers).values({
    id: `tm_${crypto.randomUUID().replace(/-/g, "")}`,
    teamId: newTeamId,
    userId: validUserId,
    name: rawUserName,
    memberType: "staff",
    role: "manager",
    subRoles: JSON.stringify(["admin"]),
    status: "active",
    joinedAt: new Date(),
  });

  return c.json({
    success: true,
    orgId,
    teamId: newTeamId,
    displayName: `${orgName} ${squadName}`.trim(),
    message: `新しいクラブ「${orgName}」を作成しました！`,
  });
});

// =========================================================
// 2. 車両・マイクロバス管理 API (/cars)
// =========================================================

liffAdminMgmtRouter.get("/cars", async (c) => {
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;

  if (ctx.isDemo) {
    const demoCars: AdminCarItem[] = [
      {
        id: "demo-bus-1",
        teamId: "demo-team",
        ownerId: null,
        ownerName: null,
        ownerId2: null,
        ownerName2: null,
        name: "チーム マイクロバス 1号",
        color: "ホワイト×ネイビー",
        colorCode: "#1e3a8a",
        numberPlate: "・・29",
        capacity: 24,
        fuelEfficiency: 7,
        carType: "bus",
      },
      {
        id: "demo-car-cargo-shared",
        teamId: "demo-team",
        ownerId: null,
        ownerName: null,
        ownerId2: null,
        ownerName2: null,
        name: "チーム道具車（ハイエース）",
        color: "シルバー",
        colorCode: "#94a3b8",
        numberPlate: "・・55",
        capacity: 2,
        fuelEfficiency: 9,
        carType: "cargo",
      },
      {
        id: "demo-car-cargo-1",
        teamId: "demo-team",
        ownerId: "demo-mem-3",
        ownerName: "高橋 コーチ",
        ownerId2: null,
        ownerName2: null,
        name: "軽バン（防具・バット積載）",
        color: "ホワイト",
        colorCode: "#f8fafc",
        numberPlate: "56-78",
        capacity: 1,
        fuelEfficiency: 14,
        carType: "cargo",
      },
      {
        id: "demo-car-1",
        teamId: "demo-team",
        ownerId: "demo-mem-4",
        ownerName: "伊藤 父",
        ownerId2: "demo-mem-5",
        ownerName2: "伊藤 母",
        name: "セレナ",
        color: "パールホワイト",
        colorCode: "#e2e8f0",
        numberPlate: "12-34",
        capacity: 6,
        fuelEfficiency: 12,
        carType: "normal",
      },
    ];
    const payload: AdminCarsResponse = {
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      cars: demoCars,
      adultMembers: [
        { memberId: "demo-mem-1", name: "田中 監督", role: "manager", memberType: "staff" },
        { memberId: "demo-mem-3", name: "高橋 コーチ", role: "coach", memberType: "staff" },
        { memberId: "demo-mem-4", name: "伊藤 父", role: "parent", memberType: "parent" },
        { memberId: "demo-mem-5", name: "伊藤 母", role: "parent", memberType: "parent" },
      ],
      summary: {
        totalCars: 4,
        busCount: 1,
        cargoCount: 2,
        normalCount: 1,
        sharedCount: 2,
        totalCapacity: 33,
      },
    };
    return c.json(payload);
  }

  const db = drizzle(c.env.DB);
  const owner2Alias = alias(teamMembers, "owner2");

  const [carRows, memberRows] = await Promise.all([
    db
      .select({
        id: memberCars.id,
        teamId: memberCars.teamId,
        ownerId: memberCars.ownerId,
        ownerName: teamMembers.name,
        ownerId2: memberCars.ownerId2,
        ownerName2: owner2Alias.name,
        name: memberCars.name,
        color: memberCars.color,
        colorCode: memberCars.colorCode,
        numberPlate: memberCars.numberPlate,
        capacity: memberCars.capacity,
        fuelEfficiency: memberCars.fuelEfficiency,
        carType: memberCars.carType,
      })
      .from(memberCars)
      .leftJoin(teamMembers, eq(memberCars.ownerId, teamMembers.id))
      .leftJoin(owner2Alias, eq(memberCars.ownerId2, owner2Alias.id))
      .where(eq(memberCars.teamId, ctx.teamId))
      .all(),
    db
      .select({
        memberId: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
        memberType: teamMembers.memberType,
        status: teamMembers.status,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, ctx.teamId))
      .all(),
  ]);

  const typeOrder: Record<AdminCarType, number> = {
    bus: 0,
    cargo: 1,
    normal: 2,
  };

  const cars: AdminCarItem[] = carRows
    .map((r) => {
      const sanitizedType = sanitizeCarType(r.carType);
      const rawCap =
        r.capacity !== null && r.capacity !== undefined
          ? Number(r.capacity)
          : NaN;
      const defaultCap = sanitizedType === "bus" ? 20 : 4;
      return {
        id: r.id,
        teamId: r.teamId,
        ownerId: r.ownerId || null,
        ownerName: r.ownerName || null,
        ownerId2: r.ownerId2 || null,
        ownerName2: r.ownerName2 || null,
        name: r.name,
        color: r.color || null,
        colorCode: r.colorCode || null,
        numberPlate: r.numberPlate || null,
        capacity: Number.isFinite(rawCap) ? Math.max(0, rawCap) : defaultCap,
        fuelEfficiency: Number(r.fuelEfficiency) || 10,
        carType: sanitizedType,
      };
    })
    .sort((a, b) => {
      const diff = typeOrder[a.carType] - typeOrder[b.carType];
      if (diff !== 0) return diff;
      const aShared = !a.ownerId;
      const bShared = !b.ownerId;
      if (aShared !== bShared) return aShared ? -1 : 1;
      return (a.ownerName || a.name).localeCompare(b.ownerName || b.name, "ja");
    });

  const adultMembers = memberRows
    .filter(
      (m) =>
        m.status === "active" &&
        m.memberType !== "player" &&
        Boolean(m.name && m.name.trim())
    )
    .map((m) => ({
      memberId: m.memberId,
      name: (m.name || "").trim(),
      role: m.role,
      memberType: m.memberType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const summary = {
    totalCars: cars.length,
    busCount: cars.filter((x) => x.carType === "bus").length,
    cargoCount: cars.filter((x) => x.carType === "cargo").length,
    normalCount: cars.filter((x) => x.carType === "normal").length,
    sharedCount: cars.filter((x) => !x.ownerId).length,
    totalCapacity: cars.reduce((sum, x) => sum + x.capacity, 0),
  };

  const payload: AdminCarsResponse = {
    success: true,
    isDemo: false,
    canManage: ctx.canManage,
    myRole: ctx.myRole,
    cars,
    adultMembers,
    summary,
  };

  return c.json(payload);
});

liffAdminMgmtRouter.post("/cars", async (c) => {
  const body = (await c.req.json()) as {
    id?: string | null;
    teamId?: string;
    userId?: string;
    ownerId?: string | null;
    ownerId2?: string | null;
    name?: string;
    color?: string | null;
    colorCode?: string | null;
    numberPlate?: string | null;
    capacity?: number;
    fuelEfficiency?: number;
    carType?: AdminCarType;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  const carName = (body.name || "").trim();
  if (!carName) {
    return c.json({ success: false, error: "車両名を入力してください" }, 400);
  }

  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      message: body.id ? "車両情報を更新しました（デモ）" : "車両を登録しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const carType = sanitizeCarType(body.carType);
  const rawOwner1 =
    body.ownerId && body.ownerId !== "__shared__" ? body.ownerId.trim() : "";
  const rawOwner2 =
    rawOwner1 &&
    body.ownerId2 &&
    body.ownerId2 !== "__none__" &&
    body.ownerId2 !== rawOwner1
      ? body.ownerId2.trim()
      : "";

  const minCap = carType === "cargo" ? 0 : 1;
  const parsedCap =
    body.capacity !== undefined && body.capacity !== null
      ? Number(body.capacity)
      : NaN;
  const defaultCap = carType === "bus" ? 20 : 4;
  const capacity = Math.min(
    60,
    Math.max(
      minCap,
      Number.isFinite(parsedCap) ? Math.trunc(parsedCap) : defaultCap
    )
  );
  const fuelEfficiency = Math.min(50, Math.max(1, Number(body.fuelEfficiency) || 10));

  const db = drizzle(c.env.DB);
  const values = {
    teamId: ctx.teamId,
    ownerId: rawOwner1 || null,
    ownerId2: rawOwner2 || null,
    name: carName,
    color: body.color ? body.color.trim() || null : null,
    colorCode: body.colorCode ? body.colorCode.trim() || null : null,
    numberPlate: body.numberPlate ? body.numberPlate.trim() || null : null,
    capacity,
    fuelEfficiency,
    carType,
  };

  if (body.id) {
    await db
      .update(memberCars)
      .set(values)
      .where(and(eq(memberCars.id, body.id), eq(memberCars.teamId, ctx.teamId)));
    return c.json({ success: true, message: "車両情報を更新しました" });
  }

  const newId = `car_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(memberCars).values({
    id: newId,
    ...values,
  });

  return c.json({ success: true, id: newId, message: "車両を登録しました" });
});

liffAdminMgmtRouter.delete("/cars/:carId", async (c) => {
  const carId = c.req.param("carId");
  const teamId = c.req.query("teamId") || "";
  const userId = c.req.query("userId");

  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo || carId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true, message: "車両を削除しました（デモ）" });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  await db
    .delete(memberCars)
    .where(and(eq(memberCars.id, carId), eq(memberCars.teamId, ctx.teamId)));

  return c.json({ success: true, message: "車両を削除しました" });
});

// =========================================================
// 3. 権限・役職・マルチロール管理 API (/roles)
// =========================================================

liffAdminMgmtRouter.get("/roles", async (c) => {
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;

  if (ctx.isDemo) {
    const payload: AdminRolesResponse = {
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      members: [
        {
          memberId: "demo-mem-1",
          userId: "user-1",
          name: "田中 監督",
          nameKana: "タナカ カントク",
          memberType: "staff",
          phone: "090-0000-1111",
          email: "",
          role: "manager",
          subRoles: ["scorer"],
          subLabel: "総監督",
          status: "active",
          isLineLinked: true,
        },
        {
          memberId: "demo-mem-2",
          userId: "user-2",
          name: "山田 事務局",
          nameKana: "ヤマダ ジムキョク",
          memberType: "staff",
          phone: "090-0000-2222",
          email: "",
          role: "admin",
          subRoles: ["parent"],
          subLabel: "IT管理",
          status: "active",
          isLineLinked: true,
        },
        {
          memberId: "demo-mem-3",
          userId: "user-3",
          name: "高橋 コーチ",
          nameKana: "タカハシ コーチ",
          memberType: "staff",
          phone: "090-0000-3333",
          email: "",
          role: "coach",
          subRoles: ["parent", "scorer"],
          subLabel: "1班",
          status: "active",
          isLineLinked: true,
        },
        {
          memberId: "demo-mem-4",
          userId: null,
          name: "伊藤 保護者",
          nameKana: "イトウ ホゴシャ",
          memberType: "parent",
          phone: "",
          email: "",
          role: "parent",
          subRoles: ["staff"],
          subLabel: "2班",
          status: "active",
          isLineLinked: false,
        },
      ],
      roleSettings: [
        { role: "manager", customLabel: "監督・代表" },
        { role: "staff", customLabel: "事務局・役員" },
      ],
    };
    return c.json(payload);
  }

  const db = drizzle(c.env.DB);
  const [teamRow, memberRows, roleRows] = await Promise.all([
    db
      .select({ memberSubLabels: teams.memberSubLabels })
      .from(teams)
      .where(eq(teams.id, ctx.teamId))
      .get(),
    db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, ctx.teamId), eq(teamMembers.status, "active")))
      .orderBy(desc(teamMembers.joinedAt))
      .all(),
    db
      .select({
        role: teamRoleSettings.role,
        customLabel: teamRoleSettings.customLabel,
      })
      .from(teamRoleSettings)
      .where(eq(teamRoleSettings.teamId, ctx.teamId))
      .all()
      .catch(() => []),
  ]);

  const subLabelsMap = parseSubLabelsMap(teamRow?.memberSubLabels);
  const rolePriority: Record<string, number> = {
    admin: 0,
    manager: 1,
    coach: 2,
    scorer: 3,
    staff: 4,
    parent: 5,
    player: 6,
    viewer: 7,
  };

  const members: AdminRoleMemberItem[] = memberRows
    .map((m) => {
      const normRole = (m.role || "parent").toLowerCase();
      const subs = parseSubRolesList(m.subRoles)
        .map((s) => s.toLowerCase())
        .filter((s) => VALID_ROLES_SET.has(s) && s !== normRole);
      return {
        memberId: m.id,
        userId: m.userId || null,
        name: m.name || "名称未設定",
        nameKana: m.nameKana || "",
        memberType: m.memberType || "parent",
        phone: ctx.canManage ? m.phone || "" : "",
        email: ctx.canManage ? m.email || "" : "",
        role: VALID_ROLES_SET.has(normRole) ? normRole : "parent",
        subRoles: Array.from(new Set(subs)),
        subLabel: subLabelsMap[m.id] || "",
        status: m.status,
        isLineLinked: Boolean(m.userId),
      };
    })
    .sort((a, b) => {
      const pa = rolePriority[a.role] ?? 99;
      const pb = rolePriority[b.role] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, "ja");
    });

  const payload: AdminRolesResponse = {
    success: true,
    isDemo: false,
    canManage: ctx.canManage,
    myRole: ctx.myRole,
    members,
    roleSettings: roleRows.map((r) => ({
      role: r.role.toLowerCase(),
      customLabel: r.customLabel,
    })),
  };

  return c.json(payload);
});

/**
 * メンバーの新規事前登録 または 権限・兼務ロール・基本情報の更新
 */
liffAdminMgmtRouter.post("/roles/member", async (c) => {
  const body = (await c.req.json()) as {
    teamId?: string;
    userId?: string;
    memberId?: string | null;
    name?: string;
    nameKana?: string;
    memberType?: string;
    phone?: string;
    email?: string;
    role?: string;
    subRoles?: string[];
    subLabel?: string;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      message: body.memberId
        ? "権限・メンバー情報を更新しました（デモ）"
        : "メンバーを事前登録しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const primaryRole = (body.role || "parent").toLowerCase();
  const safePrimaryRole = VALID_ROLES_SET.has(primaryRole) ? primaryRole : "parent";
  const safeSubRoles = Array.isArray(body.subRoles)
    ? Array.from(
        new Set(
          body.subRoles
            .map((s) => String(s).trim().toLowerCase())
            .filter((s) => VALID_ROLES_SET.has(s) && s !== safePrimaryRole)
        )
      )
    : [];

  const db = drizzle(c.env.DB);

  if (body.memberId) {
    // 最後の管理者（監督・IT管理者）が全員いなくなる変更をブロック
    const allActive = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, ctx.teamId), eq(teamMembers.status, "active")))
      .all();

    const target = allActive.find((m) => m.id === body.memberId);
    if (!target) {
      return c.json({ success: false, error: "対象メンバーが見つかりません" }, 404);
    }

    const willStillHaveManager = allActive.some((m) => {
      if (m.id === body.memberId) {
        return canManageTeam(safePrimaryRole, safeSubRoles);
      }
      return Boolean(m.userId) && canManageTeam(m.role, parseSubRolesList(m.subRoles));
    });

    if (
      target.userId &&
      canManageTeam(target.role, parseSubRolesList(target.subRoles)) &&
      !willStillHaveManager &&
      !ctx.access?.isSystemAdmin
    ) {
      return c.json(
        {
          success: false,
          error:
            "LINE連携済みの「監督・代表」または「IT管理者」が0名になるため変更できません。先に別のメンバーへ管理権限を付与してください。",
        },
        400
      );
    }

    const memberUpdate: Partial<typeof teamMembers.$inferInsert> = {
      role: safePrimaryRole,
      subRoles: safeSubRoles.length > 0 ? JSON.stringify(safeSubRoles) : null,
    };
    if (body.name !== undefined && body.name.trim()) {
      memberUpdate.name = body.name.trim();
    }
    if (body.nameKana !== undefined) {
      memberUpdate.nameKana = body.nameKana.trim() || null;
    }
    if (body.memberType !== undefined && body.memberType.trim()) {
      memberUpdate.memberType = body.memberType.trim();
    }
    if (body.phone !== undefined) {
      memberUpdate.phone = body.phone.trim() || null;
    }
    if (body.email !== undefined) {
      memberUpdate.email = body.email.trim() || null;
    }

    await db
      .update(teamMembers)
      .set(memberUpdate)
      .where(and(eq(teamMembers.id, body.memberId), eq(teamMembers.teamId, ctx.teamId)));

    if (body.subLabel !== undefined) {
      const tRow = await db
        .select({ memberSubLabels: teams.memberSubLabels })
        .from(teams)
        .where(eq(teams.id, ctx.teamId))
        .get();
      const map = parseSubLabelsMap(tRow?.memberSubLabels);
      const cleanLabel = body.subLabel.trim();
      if (cleanLabel) {
        map[body.memberId] = cleanLabel;
      } else {
        delete map[body.memberId];
      }
      await db
        .update(teams)
        .set({ memberSubLabels: JSON.stringify(map) })
        .where(eq(teams.id, ctx.teamId));
    }

    return c.json({ success: true, message: "権限・メンバー情報を更新しました" });
  }

  // 新規手動事前登録
  const newName = (body.name || "").trim();
  if (!newName) {
    return c.json({ success: false, error: "氏名を入力してください" }, 400);
  }
  const newMemberId = `tm_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(teamMembers).values({
    id: newMemberId,
    teamId: ctx.teamId,
    userId: null,
    name: newName,
    nameKana: body.nameKana ? body.nameKana.trim() || null : null,
    memberType: (body.memberType || "parent").trim(),
    phone: body.phone ? body.phone.trim() || null : null,
    email: body.email ? body.email.trim() || null : null,
    role: safePrimaryRole,
    subRoles: safeSubRoles.length > 0 ? JSON.stringify(safeSubRoles) : null,
    status: "active",
    joinedAt: new Date(),
  });

  if (body.subLabel && body.subLabel.trim()) {
    const tRow = await db
      .select({ memberSubLabels: teams.memberSubLabels })
      .from(teams)
      .where(eq(teams.id, ctx.teamId))
      .get();
    const map = parseSubLabelsMap(tRow?.memberSubLabels);
    map[newMemberId] = body.subLabel.trim();
    await db
      .update(teams)
      .set({ memberSubLabels: JSON.stringify(map) })
      .where(eq(teams.id, ctx.teamId));
  }

  return c.json({
    success: true,
    memberId: newMemberId,
    message: `「${newName}」さんを事前登録しました`,
  });
});

liffAdminMgmtRouter.delete("/roles/member/:memberId", async (c) => {
  const memberId = c.req.param("memberId");
  const teamId = c.req.query("teamId") || "";
  const userId = c.req.query("userId");

  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo || memberId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true, message: "メンバーを除籍しました（デモ）" });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const allActive = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, ctx.teamId), eq(teamMembers.status, "active")))
    .all();

  const target = allActive.find((m) => m.id === memberId);
  if (!target) {
    return c.json({ success: false, error: "メンバーが見つかりません" }, 404);
  }

  const remainingManagers = allActive.filter(
    (m) =>
      m.id !== memberId &&
      Boolean(m.userId) &&
      canManageTeam(m.role, parseSubRolesList(m.subRoles))
  );
  if (
    target.userId &&
    canManageTeam(target.role, parseSubRolesList(target.subRoles)) &&
    remainingManagers.length === 0 &&
    !ctx.access?.isSystemAdmin
  ) {
    return c.json(
      {
        success: false,
        error: "チーム最後の管理者は削除できません。",
      },
      400
    );
  }

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, ctx.teamId)));

  return c.json({ success: true, message: "メンバーを削除しました" });
});

/**
 * チーム独自の役職カスタム呼称（team_role_settings）一括保存
 */
liffAdminMgmtRouter.put("/roles/titles", async (c) => {
  const body = (await c.req.json()) as {
    teamId?: string;
    userId?: string;
    settings?: Array<{ role: string; customLabel: string }>;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      message: "役職のカスタム呼称を保存しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  await db.delete(teamRoleSettings).where(eq(teamRoleSettings.teamId, ctx.teamId));

  const incoming = Array.isArray(body.settings) ? body.settings : [];
  for (const item of incoming) {
    const roleKey = String(item.role || "").trim().toLowerCase();
    const customLabel = String(item.customLabel || "").trim();
    if (!VALID_ROLES_SET.has(roleKey) || !customLabel) continue;

    await db.insert(teamRoleSettings).values({
      id: `trs_${crypto.randomUUID().replace(/-/g, "")}`,
      teamId: ctx.teamId,
      role: roleKey,
      customLabel,
    });
  }

  return c.json({ success: true, message: "役職のカスタム呼称を保存しました" });
});

// =========================================================
// 4. 家族（親子・兄弟）紐付け ＆ 当番班一括管理 API (/family)
// =========================================================

liffAdminMgmtRouter.get("/family", async (c) => {
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;

  if (ctx.isDemo) {
    const payload: AdminFamilyResponse = {
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      players: [
        { id: "demo-p-1", name: "鈴木 翔太", uniformNumber: "10", conditionStatus: "active" },
        { id: "demo-p-2", name: "鈴木 陽太", uniformNumber: "18", conditionStatus: "active" },
        { id: "demo-p-3", name: "佐藤 蓮", uniformNumber: "1", conditionStatus: "active" },
        { id: "demo-p-4", name: "高橋 陸", uniformNumber: "6", conditionStatus: "active" },
      ],
      adultMembers: [
        { memberId: "demo-mem-1", name: "鈴木 父", memberType: "parent", role: "coach", subLabel: "1班" },
        { memberId: "demo-mem-2", name: "鈴木 母", memberType: "parent", role: "parent", subLabel: "1班" },
        { memberId: "demo-mem-3", name: "佐藤 母", memberType: "parent", role: "parent", subLabel: "2班" },
        { memberId: "demo-mem-4", name: "高橋 父", memberType: "parent", role: "parent", subLabel: "" },
      ],
      relations: [
        {
          id: "demo-rel-1",
          parentId: "demo-mem-1",
          parentName: "鈴木 父",
          parentMemberType: "parent",
          parentSubLabel: "1班",
          childId: "demo-p-1",
          childName: "鈴木 翔太",
          uniformNumber: "10",
        },
        {
          id: "demo-rel-2",
          parentId: "demo-mem-1",
          parentName: "鈴木 父",
          parentMemberType: "parent",
          parentSubLabel: "1班",
          childId: "demo-p-2",
          childName: "鈴木 陽太",
          uniformNumber: "18",
        },
        {
          id: "demo-rel-3",
          parentId: "demo-mem-2",
          parentName: "鈴木 母",
          parentMemberType: "parent",
          parentSubLabel: "1班",
          childId: "demo-p-1",
          childName: "鈴木 翔太",
          uniformNumber: "10",
        },
        {
          id: "demo-rel-4",
          parentId: "demo-mem-3",
          parentName: "佐藤 母",
          parentMemberType: "parent",
          parentSubLabel: "2班",
          childId: "demo-p-3",
          childName: "佐藤 蓮",
          uniformNumber: "1",
        },
      ],
      presetDutyLabels: DEFAULT_DUTY_PRESETS,
    };
    return c.json(payload);
  }

  const db = drizzle(c.env.DB);
  const [teamRow, playerRows, memberRows, relationRows] = await Promise.all([
    db
      .select({ memberSubLabels: teams.memberSubLabels })
      .from(teams)
      .where(eq(teams.id, ctx.teamId))
      .get(),
    db
      .select({
        id: players.id,
        name: players.name,
        uniformNumber: players.uniformNumber,
        conditionStatus: players.conditionStatus,
      })
      .from(players)
      .where(eq(players.teamId, ctx.teamId))
      .all(),
    db
      .select({
        memberId: teamMembers.id,
        name: teamMembers.name,
        memberType: teamMembers.memberType,
        role: teamMembers.role,
        status: teamMembers.status,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, ctx.teamId))
      .all(),
    db
      .select({
        id: parentChildRelations.id,
        parentId: parentChildRelations.parentId,
        parentName: teamMembers.name,
        parentMemberType: teamMembers.memberType,
        childId: parentChildRelations.childId,
        childName: players.name,
        uniformNumber: players.uniformNumber,
      })
      .from(parentChildRelations)
      .innerJoin(teamMembers, eq(parentChildRelations.parentId, teamMembers.id))
      .innerJoin(players, eq(parentChildRelations.childId, players.id))
      .where(eq(parentChildRelations.teamId, ctx.teamId))
      .all(),
  ]);

  const subLabelsMap = parseSubLabelsMap(teamRow?.memberSubLabels);
  const customLabelsInUse = Object.values(subLabelsMap).filter(Boolean);
  const presetSet = new Set<string>([...DEFAULT_DUTY_PRESETS, ...customLabelsInUse]);

  const sortedPlayers = [...playerRows]
    .map((p) => ({
      id: p.id,
      name: p.name,
      uniformNumber: p.uniformNumber || "",
      conditionStatus: p.conditionStatus || "active",
    }))
    .sort((a, b) => {
      const na = parseInt(a.uniformNumber, 10);
      const nb = parseInt(b.uniformNumber, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.name.localeCompare(b.name, "ja");
    });

  const adultMembers = memberRows
    .filter(
      (m) =>
        m.status === "active" &&
        m.memberType !== "player" &&
        Boolean(m.name && m.name.trim())
    )
    .map((m) => ({
      memberId: m.memberId,
      name: (m.name || "").trim(),
      memberType: m.memberType || "parent",
      role: m.role || "parent",
      subLabel: subLabelsMap[m.memberId] || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const relations: AdminFamilyRelationItem[] = relationRows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    parentName: r.parentName || "保護者",
    parentMemberType: r.parentMemberType || "parent",
    parentSubLabel: subLabelsMap[r.parentId] || "",
    childId: r.childId,
    childName: r.childName,
    uniformNumber: r.uniformNumber || "",
  }));

  const payload: AdminFamilyResponse = {
    success: true,
    isDemo: false,
    canManage: ctx.canManage,
    myRole: ctx.myRole,
    players: sortedPlayers,
    adultMembers,
    relations,
    presetDutyLabels: Array.from(presetSet),
  };

  return c.json(payload);
});

/**
 * 親子・兄弟紐付けの追加（複数選手の同時紐付け対応）
 */
liffAdminMgmtRouter.post("/family/relation", async (c) => {
  const body = (await c.req.json()) as {
    teamId?: string;
    userId?: string;
    parentId?: string;
    childIds?: string[];
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  const parentId = (body.parentId || "").trim();
  const childIds = Array.isArray(body.childIds)
    ? Array.from(new Set(body.childIds.map((id) => String(id).trim()).filter(Boolean)))
    : [];

  if (!parentId || childIds.length === 0) {
    return c.json(
      { success: false, error: "保護者と対象の選手を選択してください" },
      400
    );
  }

  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      addedCount: childIds.length,
      message: "親子紐付けを登録しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const existing = await db
    .select({ childId: parentChildRelations.childId })
    .from(parentChildRelations)
    .where(
      and(
        eq(parentChildRelations.teamId, ctx.teamId),
        eq(parentChildRelations.parentId, parentId)
      )
    )
    .all();

  const existingChildSet = new Set(existing.map((r) => r.childId));
  let addedCount = 0;

  for (const childId of childIds) {
    if (existingChildSet.has(childId)) continue;
    await db.insert(parentChildRelations).values({
      id: `pcr_${crypto.randomUUID().replace(/-/g, "")}`,
      teamId: ctx.teamId,
      parentId,
      childId,
      createdAt: new Date(),
    });
    addedCount += 1;
  }

  return c.json({
    success: true,
    addedCount,
    message:
      addedCount > 0
        ? `${addedCount}件の親子紐付けを登録しました`
        : "すでに登録済みの紐付けです",
  });
});

liffAdminMgmtRouter.delete("/family/relation/:relationId", async (c) => {
  const relationId = c.req.param("relationId");
  const teamId = c.req.query("teamId") || "";
  const userId = c.req.query("userId");

  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo || relationId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true, message: "紐付けを解除しました（デモ）" });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  await db
    .delete(parentChildRelations)
    .where(
      and(
        eq(parentChildRelations.id, relationId),
        eq(parentChildRelations.teamId, ctx.teamId)
      )
    );

  return c.json({ success: true, message: "親子紐付けを解除しました" });
});

/**
 * 当番班ラベル（teams.member_sub_labels）の一括保存
 */
liffAdminMgmtRouter.post("/family/duty-batch", async (c) => {
  const body = (await c.req.json()) as {
    teamId?: string;
    userId?: string;
    assignments?: Array<{ memberId: string; subLabel: string }>;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      message: "当番班の割当を保存しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const tRow = await db
    .select({ memberSubLabels: teams.memberSubLabels })
    .from(teams)
    .where(eq(teams.id, ctx.teamId))
    .get();
  const map = parseSubLabelsMap(tRow?.memberSubLabels);

  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  for (const item of assignments) {
    const mid = String(item.memberId || "").trim();
    if (!mid) continue;
    const label = String(item.subLabel || "").trim();
    if (label) {
      map[mid] = label;
    } else {
      delete map[mid];
    }
  }

  await db
    .update(teams)
    .set({ memberSubLabels: JSON.stringify(map) })
    .where(eq(teams.id, ctx.teamId));

  return c.json({ success: true, message: "当番班の割当を一括保存しました" });
});

// =========================================================
// 5. 大会・リーグ戦マスタ管理 API (/tournaments)
// =========================================================

liffAdminMgmtRouter.get("/tournaments", async (c) => {
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;

  if (ctx.isDemo) {
    const payload: AdminTournamentsResponse = {
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      teamCategory: "gakudou",
      tournaments: [
        {
          id: "demo-trn-1",
          name: "春季学童軟式野球大会",
          category: "gakudou",
          season: "2026",
          organizer: "市少年野球連盟",
          bracketUrl: "",
          timeLimit: "1時間30分（新しいイニングに入らない）",
          coldGameRule: "3回10点・5回7点差",
          tiebreakerRule: "無死一・二塁 継続打順",
          startDate: "2026-04-05",
          endDate: "2026-05-17",
          teamMatchCount: 4,
          otherTeamMatchCount: 0,
        },
        {
          id: "demo-trn-2",
          name: "夏季親善交流リーグ戦",
          category: "gakudou",
          season: "2026",
          organizer: "地域交流リーグ実行委員会",
          bracketUrl: "",
          timeLimit: "1時間20分",
          coldGameRule: "4回10点・5回7点差",
          tiebreakerRule: "引き分けあり",
          startDate: "2026-07-01",
          endDate: "2026-08-30",
          teamMatchCount: 6,
          otherTeamMatchCount: 0,
        },
      ],
    };
    return c.json(payload);
  }

  const db = drizzle(c.env.DB);
  const [teamOrgRow, allTournaments, matchRefRows] = await Promise.all([
    db
      .select({ orgCategory: organizations.category })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, ctx.teamId))
      .get(),
    db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).all(),
    db
      .select({
        tournamentId: matches.tournamentId,
        teamId: matches.teamId,
        count: sql<number>`count(*)`,
      })
      .from(matches)
      .groupBy(matches.tournamentId, matches.teamId)
      .all(),
  ]);

  const myMatchCountMap = new Map<string, number>();
  const otherMatchCountMap = new Map<string, number>();
  for (const row of matchRefRows) {
    if (!row.tournamentId) continue;
    const cnt = Number(row.count) || 0;
    if (row.teamId === ctx.teamId) {
      myMatchCountMap.set(
        row.tournamentId,
        (myMatchCountMap.get(row.tournamentId) || 0) + cnt
      );
    } else {
      otherMatchCountMap.set(
        row.tournamentId,
        (otherMatchCountMap.get(row.tournamentId) || 0) + cnt
      );
    }
  }

  const items: AdminTournamentItem[] = allTournaments.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category || "other",
    season: t.season || String(new Date().getFullYear()),
    organizer: t.organizer || "",
    bracketUrl: t.bracketUrl || "",
    timeLimit: t.timeLimit || "",
    coldGameRule: t.coldGameRule || "",
    tiebreakerRule: t.tiebreakerRule || "",
    startDate: t.startDate || "",
    endDate: t.endDate || "",
    teamMatchCount: myMatchCountMap.get(t.id) || 0,
    otherTeamMatchCount: otherMatchCountMap.get(t.id) || 0,
  }));

  const payload: AdminTournamentsResponse = {
    success: true,
    isDemo: false,
    canManage: ctx.canManage,
    myRole: ctx.myRole,
    teamCategory: teamOrgRow?.orgCategory || "gakudou",
    tournaments: items,
  };

  return c.json(payload);
});

liffAdminMgmtRouter.post("/tournaments", async (c) => {
  const body = (await c.req.json()) as {
    id?: string | null;
    teamId?: string;
    userId?: string;
    name?: string;
    category?: string;
    season?: string;
    organizer?: string;
    bracketUrl?: string;
    timeLimit?: string;
    coldGameRule?: string;
    tiebreakerRule?: string;
    startDate?: string;
    endDate?: string;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  const trnName = (body.name || "").trim();
  if (!trnName) {
    return c.json({ success: false, error: "大会・リーグ名を入力してください" }, 400);
  }

  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      message: body.id ? "大会情報を更新しました（デモ）" : "大会を登録しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const values = {
    name: trnName,
    category: (body.category || "other").trim(),
    season: (body.season || String(new Date().getFullYear())).trim(),
    organizer: body.organizer ? body.organizer.trim() || null : null,
    bracketUrl: body.bracketUrl ? body.bracketUrl.trim() || null : null,
    timeLimit: body.timeLimit ? body.timeLimit.trim() || null : null,
    coldGameRule: body.coldGameRule ? body.coldGameRule.trim() || null : null,
    tiebreakerRule: body.tiebreakerRule ? body.tiebreakerRule.trim() || null : null,
    startDate: body.startDate ? body.startDate.trim() || null : null,
    endDate: body.endDate ? body.endDate.trim() || null : null,
  };

  if (body.id) {
    await db.update(tournaments).set(values).where(eq(tournaments.id, body.id));
    return c.json({ success: true, message: "大会情報を更新しました" });
  }

  const newId = `trn_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(tournaments).values({
    id: newId,
    ...values,
    createdAt: new Date(),
  });

  return c.json({ success: true, id: newId, message: "大会を登録しました" });
});

liffAdminMgmtRouter.delete("/tournaments/:tournamentId", async (c) => {
  const tournamentId = c.req.param("tournamentId");
  const teamId = c.req.query("teamId") || "";
  const userId = c.req.query("userId");

  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo || tournamentId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true, message: "大会を削除しました（デモ）" });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const linkedMatches = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .all();

  const usedByOtherTeam = linkedMatches.some((m) => m.teamId !== ctx.teamId);
  if (usedByOtherTeam && !ctx.access?.isSystemAdmin) {
    return c.json(
      {
        success: false,
        error: "他チームの試合記録でも参照されている共通大会のため削除できません。",
      },
      400
    );
  }

  // 自チームの試合に紐づいている場合は外部キー制約違反を防ぐため tournament_id を null へ解除してから削除
  if (linkedMatches.length > 0) {
    await db
      .update(matches)
      .set({ tournamentId: null })
      .where(eq(matches.tournamentId, tournamentId));
  }

  await db.delete(tournaments).where(eq(tournaments.id, tournamentId));
  return c.json({ success: true, message: "大会を削除しました" });
});

// =========================================================
// 6. チーム道具・備品マスタ管理 API (/equipments)
// =========================================================

liffAdminMgmtRouter.get("/equipments", async (c) => {
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;

  if (ctx.isDemo) {
    const payload: AdminEquipmentsResponse = {
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      equipments: [
        {
          id: "demo-eq-1",
          teamId: "demo-team",
          name: "キャッチャー防具一式",
          description: "マスク・プロテクター・レガース（正・副2セット）",
          isHeavy: true,
          quantity: 2,
        },
        {
          id: "demo-eq-2",
          teamId: "demo-team",
          name: "バットケース・ヘルメットバッグ",
          description: "チーム共用バット6本＋打者用ヘルメット7個",
          isHeavy: true,
          quantity: 1,
        },
        {
          id: "demo-eq-3",
          teamId: "demo-team",
          name: "タープテント・ベンチシート",
          description: "夏場・雨天待機用（道具車への積載必須）",
          isHeavy: true,
          quantity: 2,
        },
        {
          id: "demo-eq-4",
          teamId: "demo-team",
          name: "救急バッグ・アイシング用品",
          description: "コールドスプレー・氷嚢・絆創膏・経口補水液",
          isHeavy: false,
          quantity: 1,
        },
      ],
    };
    return c.json(payload);
  }

  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(teamEquipments)
    .where(eq(teamEquipments.teamId, ctx.teamId))
    .orderBy(desc(teamEquipments.isHeavy), desc(teamEquipments.createdAt))
    .all();

  const equipments: AdminEquipmentItem[] = rows.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    name: r.name,
    description: r.description || "",
    isHeavy: Boolean(r.isHeavy),
    quantity: Number(r.quantity) || 1,
  }));

  const payload: AdminEquipmentsResponse = {
    success: true,
    isDemo: false,
    canManage: ctx.canManage,
    myRole: ctx.myRole,
    equipments,
  };

  return c.json(payload);
});

liffAdminMgmtRouter.post("/equipments", async (c) => {
  const body = (await c.req.json()) as {
    id?: string | null;
    teamId?: string;
    userId?: string;
    name?: string;
    description?: string;
    isHeavy?: boolean;
    quantity?: number;
  };

  const resolved = await resolveAdminMgmtContext(c, body.teamId || "", body.userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  const eqName = (body.name || "").trim();
  if (!eqName) {
    return c.json({ success: false, error: "道具・備品名を入力してください" }, 400);
  }

  if (ctx.isDemo) {
    return c.json({
      success: true,
      isDemo: true,
      message: body.id ? "道具情報を更新しました（デモ）" : "道具を登録しました（デモ）",
    });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const qty = Math.min(999, Math.max(1, Number(body.quantity) || 1));
  const descText = body.description ? body.description.trim() || null : null;
  const isHeavy = Boolean(body.isHeavy);
  const db = drizzle(c.env.DB);

  if (body.id) {
    await db
      .update(teamEquipments)
      .set({
        name: eqName,
        description: descText,
        isHeavy,
        quantity: qty,
      })
      .where(and(eq(teamEquipments.id, body.id), eq(teamEquipments.teamId, ctx.teamId)));
    return c.json({ success: true, message: "道具情報を更新しました" });
  }

  const newId = `eq_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(teamEquipments).values({
    id: newId,
    teamId: ctx.teamId,
    name: eqName,
    description: descText,
    isHeavy,
    quantity: qty,
    createdAt: new Date(),
  });

  return c.json({ success: true, id: newId, message: "道具を登録しました" });
});

liffAdminMgmtRouter.delete("/equipments/:equipmentId", async (c) => {
  const equipmentId = c.req.param("equipmentId");
  const teamId = c.req.query("teamId") || "";
  const userId = c.req.query("userId");

  const resolved = await resolveAdminMgmtContext(c, teamId, userId);
  if (!resolved.ok) {
    return c.json({ success: false, error: resolved.error }, resolved.status);
  }
  const { ctx } = resolved;
  if (ctx.isDemo || equipmentId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true, message: "道具を削除しました（デモ）" });
  }
  if (!ctx.canManage) {
    return c.json({ success: false, error: "管理者権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  await db
    .delete(teamEquipments)
    .where(
      and(eq(teamEquipments.id, equipmentId), eq(teamEquipments.teamId, ctx.teamId))
    );

  return c.json({ success: true, message: "道具を削除しました" });
});

export default liffAdminMgmtRouter;
