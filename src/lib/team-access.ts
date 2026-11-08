// filepath: src/lib/team-access.ts
import type { Context, MiddlewareHandler } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, inArray, or } from "drizzle-orm";
import {
  account,
  events,
  eventCarpools,
  matches,
  memberCars,
  organizationMembers,
  parentChildRelations,
  players,
  teamDocuments,
  teamEquipments,
  teamFaqs,
  teamLinks,
  teamMembers,
  teamRules,
  teams,
  user,
} from "@/db/schema";
import { ensureAuthSchema, getAuth } from "@/lib/auth";
import { canEditScore, canManageTeam } from "@/lib/roles";
import type { WorkerEnv } from "@/types/api";

export const IGNORED_MOCK_USER_IDS = new Set([
  "cached-user",
  "mock-user-12345",
  "undefined",
  "null",
]);

export interface ResolvedSessionUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: string;
}

export interface TeamRoleGrant {
  memberId: string;
  role: string;
  subRoles: string[];
}

export interface CallerTeamAccess {
  sessionUser: ResolvedSessionUser | null;
  headerUserId: string;
  headerUserName: string;
  candidateUserIds: string[];
  isAuthenticated: boolean;
  isSystemAdmin: boolean;
  activeTeamIds: Set<string>;
  activeOrgIds: Set<string>;
  managedTeamIds: Set<string>;
  scoreEditableTeamIds: Set<string>;
  teamRoles: Map<string, TeamRoleGrant>;
  canAccessTeam: (teamId: string | null | undefined) => boolean;
  canManageTeamId: (teamId: string | null | undefined) => boolean;
  canEditScoreForTeam: (teamId: string | null | undefined) => boolean;
  canAccessOrganization: (orgId: string | null | undefined) => boolean;
}

const requestAccessCache = new WeakMap<Request, Promise<CallerTeamAccess>>();

export function isDemoTeamId(teamId: string | null | undefined): boolean {
  return teamId === "demo-team";
}

export function isDemoEntityId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id === "demo-team" ||
    id === "convoy-test" ||
    id.startsWith("demo-") ||
    id.startsWith("venue-") ||
    id.startsWith("test-cp-")
  );
}

export function sanitizeCallerUserId(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || IGNORED_MOCK_USER_IDS.has(trimmed)) return "";
  return trimmed;
}

export function extractHeaderUserId(c: Context): string {
  return sanitizeCallerUserId(c.req.header("x-liff-user-id"));
}

export function extractHeaderUserName(c: Context): string {
  const raw = c.req.header("x-liff-user-name");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export function parseSubRolesList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // カンマ区切り等の旧形式フォールバック
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 🔑 `account` テーブルのみを介して確定済みの連携アカウントIDを双方向展開する
 * ⚠️ 未承認・未招待ユーザーの他人名義混入を防ぐため、表示名や苗字による横断推測は絶対に行わない。
 */
export async function expandLinkedUserIds(
  db: ReturnType<typeof drizzle>,
  rawIds: Array<string | null | undefined>
): Promise<string[]> {
  const idSet = new Set<string>();
  for (const raw of rawIds) {
    const clean = sanitizeCallerUserId(raw);
    if (clean) idSet.add(clean);
  }
  if (idSet.size === 0) return [];

  try {
    const initialIds = Array.from(idSet);
    const linkedRows = await db
      .select({ userId: account.userId, accountId: account.accountId })
      .from(account)
      .where(
        or(
          inArray(account.accountId, initialIds),
          inArray(account.userId, initialIds)
        )
      )
      .all();

    const newlyDiscoveredUserIds: string[] = [];
    for (const row of linkedRows) {
      const uid = sanitizeCallerUserId(row.userId);
      const aid = sanitizeCallerUserId(row.accountId);
      if (uid && !idSet.has(uid)) {
        idSet.add(uid);
        newlyDiscoveredUserIds.push(uid);
      }
      if (aid) {
        idSet.add(aid);
      }
    }

    if (newlyDiscoveredUserIds.length > 0) {
      const extraRows = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(inArray(account.userId, newlyDiscoveredUserIds))
        .all();
      for (const row of extraRows) {
        const aid = sanitizeCallerUserId(row.accountId);
        if (aid) idSet.add(aid);
      }
    }
  } catch (err) {
    console.warn("expandLinkedUserIds warning:", err);
  }

  return Array.from(idSet);
}

async function computeCallerTeamAccess(
  c: Context<{ Bindings: WorkerEnv }>,
  extraUserIds: Array<string | null | undefined>
): Promise<CallerTeamAccess> {
  const db = drizzle(c.env.DB);
  const headerUserId = extractHeaderUserId(c);
  const headerUserName = extractHeaderUserName(c);
  const queryUserId = sanitizeCallerUserId(c.req.query("userId"));

  let sessionUser: ResolvedSessionUser | null = null;
  const cookieHeader = c.req.header("cookie") || "";
  if (cookieHeader.includes("better-auth")) {
    try {
      await ensureAuthSchema(c.env.DB);
      const auth = getAuth(c.env.DB, c.env);
      const session = await auth.api
        .getSession({ headers: c.req.raw.headers })
        .catch(() => null);
      if (session?.user?.id) {
        const rawRole = (session.user as { role?: string }).role || "USER";
        sessionUser = {
          id: session.user.id,
          name: session.user.name || "メンバー",
          email: session.user.email || "",
          image: session.user.image || undefined,
          role: rawRole,
        };
      }
    } catch {
      sessionUser = null;
    }
  }

  const candidateUserIds = await expandLinkedUserIds(db, [
    sessionUser?.id,
    headerUserId,
    queryUserId,
    ...extraUserIds,
  ]);

  const activeTeamIds = new Set<string>();
  const activeOrgIds = new Set<string>();
  const managedTeamIds = new Set<string>();
  const scoreEditableTeamIds = new Set<string>();
  const teamRoles = new Map<string, TeamRoleGrant>();
  let isSystemAdmin = sessionUser?.role === "SYSTEM_ADMIN";

  if (candidateUserIds.length > 0) {
    const candidateSet = new Set(candidateUserIds);

    const [dbUsers, memberRows, allTeamsRows, orgMemberRows, playerRows] =
      await db.batch([
        db
          .select({ id: user.id, role: user.role })
          .from(user)
          .where(inArray(user.id, candidateUserIds)),
        db
          .select({
            id: teamMembers.id,
            teamId: teamMembers.teamId,
            role: teamMembers.role,
            subRoles: teamMembers.subRoles,
            status: teamMembers.status,
          })
          .from(teamMembers)
          .where(inArray(teamMembers.userId, candidateUserIds)),
        db
          .select({
            id: teams.id,
            organizationId: teams.organizationId,
            createdBy: teams.createdBy,
          })
          .from(teams),
        db
          .select({
            organizationId: organizationMembers.organizationId,
            role: organizationMembers.role,
            status: organizationMembers.status,
          })
          .from(organizationMembers)
          .where(inArray(organizationMembers.userId, candidateUserIds)),
        db
          .select({ teamId: players.teamId })
          .from(players)
          .where(inArray(players.userId, candidateUserIds)),
      ]);

    if (dbUsers.some((u) => u.role === "SYSTEM_ADMIN")) {
      isSystemAdmin = true;
    }

    const teamOrgById = new Map<string, string | null>();
    const teamsByOrgId = new Map<string, string[]>();
    for (const t of allTeamsRows) {
      teamOrgById.set(t.id, t.organizationId);
      if (t.organizationId) {
        const list = teamsByOrgId.get(t.organizationId) || [];
        list.push(t.id);
        teamsByOrgId.set(t.organizationId, list);
      }
      if (t.createdBy && candidateSet.has(t.createdBy)) {
        activeTeamIds.add(t.id);
        managedTeamIds.add(t.id);
        scoreEditableTeamIds.add(t.id);
        if (t.organizationId) activeOrgIds.add(t.organizationId);
      }
    }

    const pendingOrBlockedTeams = new Set<string>();
    for (const m of memberRows) {
      if (!m.teamId) continue;
      const normalizedStatus = (m.status || "active").toLowerCase();
      const normalizedRole = (m.role || "parent").toLowerCase();
      if (normalizedStatus !== "active" || normalizedRole === "pending") {
        pendingOrBlockedTeams.add(m.teamId);
        continue;
      }

      activeTeamIds.add(m.teamId);
      const orgId = teamOrgById.get(m.teamId);
      if (orgId) activeOrgIds.add(orgId);

      const subRoles = parseSubRolesList(m.subRoles);
      const existingGrant = teamRoles.get(m.teamId);
      if (!existingGrant || canManageTeam(m.role, subRoles)) {
        teamRoles.set(m.teamId, {
          memberId: m.id,
          role: m.role,
          subRoles,
        });
      }
      if (canManageTeam(m.role, subRoles)) {
        managedTeamIds.add(m.teamId);
        scoreEditableTeamIds.add(m.teamId);
      } else if (canEditScore(m.role, subRoles)) {
        scoreEditableTeamIds.add(m.teamId);
      }
    }

    for (const om of orgMemberRows) {
      const st = (om.status || "active").toLowerCase();
      if (st !== "active") continue;
      activeOrgIds.add(om.organizationId);

      const r = (om.role || "").toUpperCase();
      if (r === "OWNER" || r === "ADMIN" || r === "MANAGER" || r === "IT_ADMIN") {
        const orgTeams = teamsByOrgId.get(om.organizationId) || [];
        for (const tid of orgTeams) {
          activeTeamIds.add(tid);
          managedTeamIds.add(tid);
          scoreEditableTeamIds.add(tid);
        }
      }
    }

    for (const p of playerRows) {
      if (p.teamId && !pendingOrBlockedTeams.has(p.teamId)) {
        activeTeamIds.add(p.teamId);
        const orgId = teamOrgById.get(p.teamId);
        if (orgId) activeOrgIds.add(orgId);
      }
    }
  }

  const canAccessTeam = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || activeTeamIds.has(teamId);
  };

  const canManageTeamId = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || managedTeamIds.has(teamId);
  };

  const canEditScoreForTeam = (teamId: string | null | undefined): boolean => {
    if (!teamId || teamId === "demo-team") return false;
    return isSystemAdmin || scoreEditableTeamIds.has(teamId);
  };

  const canAccessOrganization = (orgId: string | null | undefined): boolean => {
    if (!orgId) return false;
    return isSystemAdmin || activeOrgIds.has(orgId);
  };

  return {
    sessionUser,
    headerUserId,
    headerUserName,
    candidateUserIds,
    isAuthenticated: candidateUserIds.length > 0,
    isSystemAdmin,
    activeTeamIds,
    activeOrgIds,
    managedTeamIds,
    scoreEditableTeamIds,
    teamRoles,
    canAccessTeam,
    canManageTeamId,
    canEditScoreForTeam,
    canAccessOrganization,
  };
}

export async function resolveCallerTeamAccess(
  c: Context<{ Bindings: WorkerEnv }>,
  extraUserIds?: Array<string | null | undefined>
): Promise<CallerTeamAccess> {
  const cleanExtras = (extraUserIds || [])
    .map((id) => sanitizeCallerUserId(id))
    .filter(Boolean);

  if (cleanExtras.length > 0) {
    return computeCallerTeamAccess(c, cleanExtras);
  }

  const existing = requestAccessCache.get(c.req.raw);
  if (existing) return existing;

  const promise = computeCallerTeamAccess(c, []);
  requestAccessCache.set(c.req.raw, promise);
  return promise;
}

export async function findTeamIdForMatch(
  db: ReturnType<typeof drizzle>,
  matchId: string | null | undefined
): Promise<string | null> {
  if (!matchId || isDemoEntityId(matchId)) return null;
  const row = await db
    .select({ teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  return row?.teamId ?? null;
}

export async function findTeamIdForEvent(
  db: ReturnType<typeof drizzle>,
  eventId: string | null | undefined
): Promise<string | null> {
  if (!eventId || isDemoEntityId(eventId)) return null;
  const row = await db
    .select({ teamId: events.teamId })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  return row?.teamId ?? null;
}

export async function findTeamIdForPlayer(
  db: ReturnType<typeof drizzle>,
  playerId: string | null | undefined
): Promise<string | null> {
  if (!playerId || isDemoEntityId(playerId)) return null;
  const row = await db
    .select({ teamId: players.teamId })
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  return row?.teamId ?? null;
}

export async function findTeamIdForCarpool(
  db: ReturnType<typeof drizzle>,
  carpoolId: string | null | undefined
): Promise<string | null> {
  if (!carpoolId || isDemoEntityId(carpoolId)) return null;
  const row = await db
    .select({ eventId: eventCarpools.eventId })
    .from(eventCarpools)
    .where(eq(eventCarpools.id, carpoolId))
    .get();
  if (!row?.eventId) return null;
  return findTeamIdForEvent(db, row.eventId);
}

export async function verifyScopedRecordOwnership(
  db: ReturnType<typeof drizzle>,
  access: CallerTeamAccess,
  kind: "document" | "faq" | "rule" | "link" | "relation" | "car" | "equipment",
  id: string
): Promise<boolean> {
  if (isDemoEntityId(id)) return true;
  if (access.isSystemAdmin) return true;

  if (kind === "relation") {
    const row = await db
      .select({ teamId: parentChildRelations.teamId })
      .from(parentChildRelations)
      .where(eq(parentChildRelations.id, id))
      .get();
    return Boolean(row?.teamId && access.canAccessTeam(row.teamId));
  }

  if (kind === "car") {
    const row = await db
      .select({ teamId: memberCars.teamId })
      .from(memberCars)
      .where(eq(memberCars.id, id))
      .get();
    return Boolean(row?.teamId && access.canAccessTeam(row.teamId));
  }

  if (kind === "equipment") {
    const row = await db
      .select({ teamId: teamEquipments.teamId })
      .from(teamEquipments)
      .where(eq(teamEquipments.id, id))
      .get();
    return Boolean(row?.teamId && access.canAccessTeam(row.teamId));
  }

  const table =
    kind === "document"
      ? teamDocuments
      : kind === "faq"
      ? teamFaqs
      : kind === "rule"
      ? teamRules
      : teamLinks;

  const row = await db
    .select({
      teamId: table.teamId,
      organizationId: table.organizationId,
    })
    .from(table)
    .where(eq(table.id, id))
    .get();

  if (!row) return false;
  if (row.teamId && access.canAccessTeam(row.teamId)) return true;
  if (row.organizationId && access.canAccessOrganization(row.organizationId)) {
    return true;
  }
  return false;
}

export async function peekJsonBodyFields(
  c: Context
): Promise<Record<string, unknown> | null> {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }
  const ct = (c.req.header("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return null;
  }
  try {
    const parsed: unknown = await c.req.raw.clone().json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed json here; route handler will return 400
  }
  return null;
}

function pickStringField(
  obj: Record<string, unknown> | null,
  key: string
): string {
  if (!obj) return "";
  const val = obj[key];
  return typeof val === "string" ? val.trim() : "";
}

/**
 * 🛡️ LIFF API 共通チーム隔離ガードミドルウェア
 * - 未招待・承認待ち（`pending`）・他チーム所属ユーザーが実チームの `teamId` / `matchId` / `eventId` / `playerId` へアクセスすることをサーバー入口で完全遮断する。
 * - `demo-team`（およびデモ用ID）への閲覧・体験シミュレーションは引き続き許可する。
 */
export function createLiffTeamIsolationMiddleware(options?: {
  publicSubpaths?: string[];
}): MiddlewareHandler<{ Bindings: WorkerEnv }> {
  const publicSet = new Set(options?.publicSubpaths || []);

  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "OPTIONS") {
      return next();
    }

    const fullPath = new URL(c.req.url).pathname;
    if (publicSet.has(fullPath)) {
      return next();
    }

    // URLパスセグメント抽出 (['api', 'liff', ...])
    const segs = fullPath.split("/").filter(Boolean);

    // ギャラリー画像メディア配信（24文字暗号学的ランダムシークレット検証付き）は <img> 直読込のため通過
    if (method === "GET" && segs[2] === "gallery" && segs[3] === "media") {
      return next();
    }

    const bodyFields = await peekJsonBodyFields(c);
    const bodyUserId = pickStringField(bodyFields, "userId");
    const access = await resolveCallerTeamAccess(
      c,
      bodyUserId ? [bodyUserId] : undefined
    );

    // /api/liff/teams/:teamId/logo
    const pathTeamId = segs[2] === "teams" && segs[3] ? segs[3] : "";
    const queryTeamId = (c.req.query("teamId") || "").trim();
    const bodyTeamId = pickStringField(bodyFields, "teamId");
    const explicitTeamId = pathTeamId || queryTeamId || bodyTeamId;

    // 1. 明示的に demo-team が指定されたリクエストは各ハンドラのデモ分岐へ通す
    if (explicitTeamId === "demo-team") {
      return next();
    }

    // 2. 実チームIDが指定されている場合は所属（または SYSTEM_ADMIN）を厳格検証
    if (explicitTeamId) {
      if (!access.canAccessTeam(explicitTeamId)) {
        return c.json(
          {
            success: false,
            error: "このチームへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }

      // 管理者コンソールの更新系はチーム管理権限（監督・代表・IT管理者・創設者・SYSTEM_ADMIN）を必須化
      if (
        method !== "GET" &&
        segs[2] === "admin" &&
        !access.canManageTeamId(explicitTeamId)
      ) {
        return c.json(
          {
            success: false,
            error: "管理者権限がありません",
            isForbidden: true,
          },
          403
        );
      }

      return next();
    }

    // 3. teamId が無いリクエスト: matchId / eventId / playerId / 各種リソースID から所有チームを逆引き検証
    const db = drizzle(c.env.DB);
    const matchId =
      (c.req.query("matchId") || "").trim() ||
      pickStringField(bodyFields, "matchId");
    if (matchId) {
      if (isDemoEntityId(matchId)) return next();
      const ownerTeamId = await findTeamIdForMatch(db, matchId);
      if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
        return c.json(
          {
            success: false,
            error: "この試合データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
      return next();
    }

    const eventId =
      (c.req.query("eventId") || "").trim() ||
      pickStringField(bodyFields, "eventId");
    if (eventId && eventId !== "__new__") {
      if (isDemoEntityId(eventId)) return next();
      const ownerTeamId = await findTeamIdForEvent(db, eventId);
      if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
        return c.json(
          {
            success: false,
            error: "この予定データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
      return next();
    }

    // /api/liff/players/:playerId/condition or /photo
    const pathPlayerId =
      segs[2] === "players" && segs[3] && segs[3] !== "growth" ? segs[3] : "";
    const playerId =
      pathPlayerId ||
      (c.req.query("playerId") || "").trim() ||
      pickStringField(bodyFields, "playerId");
    if (playerId) {
      if (isDemoEntityId(playerId)) return next();
      const ownerTeamId = await findTeamIdForPlayer(db, playerId);
      if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
        return c.json(
          {
            success: false,
            error: "この選手データへのアクセス権限がありません",
            isForbidden: true,
          },
          403
        );
      }
      return next();
    }

    // 個別ID更新・削除ルート (/documents/:id, /faqs/:id, /rules/:id, /links/:id, /profile/family/:relationId, /profile/cars/:carId)
    if (method !== "GET") {
      if (segs[2] === "profile" && segs[3] === "family" && segs[4]) {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "relation",
          segs[4]
        );
        if (!ok) {
          return c.json(
            { success: false, error: "このデータへの変更権限がありません" },
            403
          );
        }
        return next();
      }

      if (segs[2] === "profile" && segs[3] === "cars" && segs[4]) {
        const ok = await verifyScopedRecordOwnership(db, access, "car", segs[4]);
        if (!ok) {
          return c.json(
            { success: false, error: "この車両データへの変更権限がありません" },
            403
          );
        }
        return next();
      }

      if (segs[2] === "grounds" && segs[3] && isDemoEntityId(segs[3])) {
        return next();
      }

      const kindMap: Record<string, "document" | "faq" | "rule" | "link"> = {
        documents: "document",
        faqs: "faq",
        rules: "rule",
        links: "link",
      };
      const scopedKind = kindMap[segs[2] || ""];
      if (scopedKind && segs[3] && segs[3] !== "upload") {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          scopedKind,
          segs[3]
        );
        if (!ok) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }

      // teamId なしのその他の書き込み（/grounds, /grounds/ai-lookup, multipart /upload, /scorebook/analyze-* 等）は
      // 承認済みの所属チームを1つ以上持つメンバー（または SYSTEM_ADMIN）のみ許可
      if (!access.isSystemAdmin && access.activeTeamIds.size === 0) {
        return c.json(
          {
            success: false,
            error: "承認済みの所属チームがないため、この操作は実行できません",
            isForbidden: true,
          },
          403
        );
      }
    }

    return next();
  };
}

/**
 * 🛡️ 共通・Web版 API (`/api/matches`, `/api/events`, `/api/attendance`, `/api/carpools`, `/api/equipments`, `/api/venues`, `/api/tournaments`, `/api/teams` サブルート等) 向けのチーム隔離ガード
 * - Better-Auth Cookie と LIFF の `X-Liff-User-Id` ヘッダー双方に対応する。
 */
export function createSharedApiTeamIsolationMiddleware(): MiddlewareHandler<{
  Bindings: WorkerEnv;
}> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "OPTIONS") {
      return next();
    }

    const fullPath = new URL(c.req.url).pathname;
    const segs = fullPath.split("/").filter(Boolean); // ['api', '<module>', ...]
    const mod = segs[1] || "";

    // LINE Bot Webhook や静的ファイル配信はスキップ
    if (
      fullPath.startsWith("/api/matches/webhook") ||
      (mod === "documents" && segs[2] === "files") ||
      (mod === "images" && method === "GET")
    ) {
      return next();
    }

    const bodyFields = await peekJsonBodyFields(c);
    const bodyUserId = pickStringField(bodyFields, "userId");
    const access = await resolveCallerTeamAccess(
      c,
      bodyUserId ? [bodyUserId] : undefined
    );

    const db = drizzle(c.env.DB);
    const queryTeamId = (c.req.query("teamId") || "").trim();
    const bodyTeamId = pickStringField(bodyFields, "teamId");

    // 1. /api/events/:teamId/...
    if (mod === "events") {
      const targetTeamId = segs[2] || queryTeamId || bodyTeamId;
      if (targetTeamId === "demo-team") return next();
      if (!targetTeamId || !access.canAccessTeam(targetTeamId)) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }
      return next();
    }

    // 2. /api/matches/...
    if (mod === "matches") {
      const targetTeamId = queryTeamId || bodyTeamId;
      if (targetTeamId === "demo-team") return next();
      if (targetTeamId) {
        if (!access.canAccessTeam(targetTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }

      const maybeMatchId = segs[2] || "";
      if (maybeMatchId && maybeMatchId !== "create") {
        if (isDemoEntityId(maybeMatchId)) return next();
        const ownerTeamId = await findTeamIdForMatch(db, maybeMatchId);
        if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }

      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 3. /api/attendance/...
    if (mod === "attendance") {
      const targetTeamId = queryTeamId || bodyTeamId;
      if (targetTeamId === "demo-team") return next();
      if (targetTeamId) {
        if (!access.canAccessTeam(targetTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      const evId =
        (segs[2] && segs[2] !== "update" ? segs[2] : "") ||
        pickStringField(bodyFields, "eventId");
      if (evId) {
        if (isDemoEntityId(evId)) return next();
        const ownerTeamId = await findTeamIdForEvent(db, evId);
        if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 4. /api/carpools/...
    if (mod === "carpools") {
      const targetTeamId = queryTeamId || bodyTeamId;
      if (targetTeamId === "demo-team") return next();
      if (targetTeamId) {
        if (!access.canAccessTeam(targetTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (segs[2] === "events" && segs[3]) {
        if (isDemoEntityId(segs[3])) return next();
        const ownerTeamId = await findTeamIdForEvent(db, segs[3]);
        if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (segs[2] === "cars" && segs[3] && method === "DELETE") {
        const ok = await verifyScopedRecordOwnership(db, access, "car", segs[3]);
        if (!ok) return c.json({ success: false, error: "権限がありません" }, 403);
        return next();
      }
      if (segs[2] === "family" && segs[3] && method === "DELETE") {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "relation",
          segs[3]
        );
        if (!ok) return c.json({ success: false, error: "権限がありません" }, 403);
        return next();
      }
      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 5. /api/equipments/...
    if (mod === "equipments") {
      const targetTeamId = queryTeamId || bodyTeamId;
      if (targetTeamId === "demo-team") return next();
      if (targetTeamId) {
        if (!access.canAccessTeam(targetTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (segs[2] === "events" && segs[3]) {
        if (isDemoEntityId(segs[3])) return next();
        const ownerTeamId = await findTeamIdForEvent(db, segs[3]);
        if (!ownerTeamId || !access.canAccessTeam(ownerTeamId)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      if (segs[2] && method === "DELETE") {
        const ok = await verifyScopedRecordOwnership(
          db,
          access,
          "equipment",
          segs[2]
        );
        if (!ok) return c.json({ success: false, error: "権限がありません" }, 403);
        return next();
      }
      return c.json({ success: false, error: "権限がありません" }, 403);
    }

    // 6. /api/teams/:teamId/players, stats, lineup-templates, groups, settings, update-line, test-push 等
    if (mod === "teams") {
      // /api/teams (GET/POST), /api/teams/join, /api/teams/search/:id は各ハンドラで認証処理
      const second = segs[2] || "";
      if (!second || second === "join" || second === "search") {
        return next();
      }
      if (
        second === "update-line" ||
        second === "settings" ||
        second === "test-push"
      ) {
        const targetTid = queryTeamId || bodyTeamId;
        if (targetTid === "demo-team") return next();
        if (!targetTid || !access.canAccessTeam(targetTid)) {
          return c.json({ success: false, error: "権限がありません" }, 403);
        }
        return next();
      }
      // /api/teams/:teamId/...
      if (second === "demo-team") return next();
      if (!access.canAccessTeam(second)) {
        return c.json({ success: false, error: "権限がありません" }, 403);
      }
      return next();
    }

    // 7. /api/venues, /api/tournaments, /api/documents/upload, /api/images/upload
    if (
      mod === "venues" ||
      mod === "tournaments" ||
      mod === "documents" ||
      mod === "images"
    ) {
      if (!access.isSystemAdmin && access.activeTeamIds.size === 0) {
        return c.json(
          {
            success: false,
            error: "承認済みの所属チームが必要です",
          },
          403
        );
      }
      return next();
    }

    return next();
  };
}
