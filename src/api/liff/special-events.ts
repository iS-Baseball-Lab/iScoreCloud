// filepath: src/api/liff/special-events.ts
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  parentChildRelations,
  playerConditionPeriods,
  players,
  teamMembers,
  teamSpecialEventResponses,
  teamSpecialEvents,
} from "@/db/schema";
import {
  buildDemoSpecialEventsBundle,
  buildSpecialEventHouseholdsAndSummary,
  buildSpecialEventTimeRangeLabel,
  buildTeamHouseholdUnits,
  formatDateKeyToJaLabel,
  normalizeCandidateDates,
  normalizeCompanionsList,
  normalizeDateVotesList,
  normalizeMemberAttendanceEntries,
  normalizeSpecialEventCategory,
  normalizeSpecialEventFeeTiers,
  normalizeSpecialEventMode,
  normalizeSpecialEventStatus,
  normalizeSurveyAnswersMap,
  normalizeSurveyQuestions,
  resolveSpecialEventSortDateKey,
  toHubSpecialEventSummary,
  type HubSpecialEventSummary,
  type RawSpecialEventResponseRow,
  type SpecialEventDetailItem,
  type TeamHouseholdUnit,
} from "@/lib/liff/special-events-schema";
import type { PlayerConditionPeriod } from "@/lib/liff/player-condition";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { resolveCallerTeamAccess, type CallerTeamAccess } from "@/lib/team-access";
import { validateSafeHttpUrl } from "@/lib/utils";
import type { WorkerEnv } from "@/types/api";

const liffSpecialEventsRouter = new Hono<{ Bindings: WorkerEnv }>();

function getTodayJstDateKey(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value || "2026";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function sanitizeOptionalDateStr(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function sanitizeOptionalTimeStr(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
  return trimmed.padStart(5, "0");
}

function sanitizeSafeOptionalUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const candidate = raw.trim().slice(0, 500);
  return validateSafeHttpUrl(candidate) ? candidate : "";
}

function sortSpecialEventItems(
  items: SpecialEventDetailItem[]
): SpecialEventDetailItem[] {
  const statusRank: Record<SpecialEventDetailItem["status"], number> = {
    open: 0,
    closed: 1,
    archived: 2,
  };
  return [...items].sort((a, b) => {
    const rDiff = statusRank[a.status] - statusRank[b.status];
    if (rDiff !== 0) return rDiff;
    const aDate = resolveSpecialEventSortDateKey(a);
    const bDate = resolveSpecialEventSortDateKey(b);
    if (a.status === "open" && aDate !== bDate) {
      return aDate.localeCompare(bDate);
    }
    if (aDate !== bDate) {
      return bDate.localeCompare(aDate);
    }
    return a.title.localeCompare(b.title, "ja");
  });
}

export interface RawSpecialEventDbRow {
  id: string;
  teamId: string;
  title: string;
  category: string;
  mode: string;
  status: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  locationUrl: string | null;
  interimDeadlineDate?: string | null;
  deadlineDate: string | null;
  description: string | null;
  importantNotice?: string | null;
  allowCompanions: boolean | number;
  useFeeCalculation: boolean | number;
  feeTiersJson: string | null;
  candidateDatesJson: string | null;
  questionsJson: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
}

export function buildSpecialEventDetailItemsFromRaw(params: {
  eventRows: readonly RawSpecialEventDbRow[];
  responseRows: readonly RawSpecialEventResponseRow[];
  players: ReadonlyArray<{
    id: string;
    name?: string | null;
    uniformNumber?: string | null;
    userId?: string | null;
    isActive?: boolean | number | null;
    conditionStatus?: string | null;
    conditionPeriods?: readonly PlayerConditionPeriod[];
  }>;
  teamMembers: ReadonlyArray<{
    id: string;
    userId?: string | null;
    name?: string | null;
    memberType?: string | null;
    role?: string | null;
    subRoles?: string | null;
    status?: string | null;
  }>;
  relations: ReadonlyArray<{
    parentId: string | null;
    childId: string | null;
  }>;
  candidateUserIds: readonly string[];
  callerUserName: string;
  canManagePlayers: boolean;
  todayKey?: string;
}): {
  events: SpecialEventDetailItem[];
  myHouseholdKey: string | null;
} {
  const todayKey = params.todayKey || getTodayJstDateKey();
  const candidateIdSet = new Set(params.candidateUserIds);

  const unitsByDateCache = new Map<
    string,
    { units: TeamHouseholdUnit[]; myHouseholdKey: string | null }
  >();
  const getUnitsForDate = (dateKey: string | null) => {
    const k = dateKey || "__today__";
    const cached = unitsByDateCache.get(k);
    if (cached) return cached;
    const computed = buildTeamHouseholdUnits({
      players: params.players,
      teamMembers: params.teamMembers,
      relations: params.relations,
      candidateUserIds: params.candidateUserIds,
      callerUserName: params.callerUserName,
      dateKey: dateKey || todayKey,
      todayKey,
    });
    unitsByDateCache.set(k, computed);
    return computed;
  };

  const defaultUnitsBundle = getUnitsForDate(null);
  const responsesByEventId = new Map<string, RawSpecialEventResponseRow[]>();
  for (const r of params.responseRows) {
    const list = responsesByEventId.get(r.specialEventId) || [];
    list.push(r);
    responsesByEventId.set(r.specialEventId, list);
  }

  const items: SpecialEventDetailItem[] = params.eventRows.map((row) => {
    const category = normalizeSpecialEventCategory(row.category);
    const mode = normalizeSpecialEventMode(row.mode);
    const status = normalizeSpecialEventStatus(row.status);
    const allowCompanions =
      row.allowCompanions === true || row.allowCompanions === 1;
    const useFeeCalculation =
      row.useFeeCalculation === true || row.useFeeCalculation === 1;
    const feeTiers = normalizeSpecialEventFeeTiers(row.feeTiersJson);
    const candidateDates = normalizeCandidateDates(row.candidateDatesJson);
    const questions = normalizeSurveyQuestions(row.questionsJson);

    const unitsBundle = getUnitsForDate(row.eventDate);
    const evResponses = responsesByEventId.get(row.id) || [];

    const built = buildSpecialEventHouseholdsAndSummary({
      units: unitsBundle.units,
      responseRows: evResponses,
      mode,
      allowCompanions,
      useFeeCalculation,
      feeTiers,
      candidateDates,
      questions,
    });

    const myHouseholdResponse = unitsBundle.myHouseholdKey
      ? built.households.find(
          (h) => h.householdKey === unitsBundle.myHouseholdKey
        ) || null
      : null;

    const isCreator = Boolean(
      row.createdByUserId && candidateIdSet.has(row.createdByUserId)
    );

    return {
      id: row.id,
      teamId: row.teamId,
      title: row.title,
      category,
      mode,
      status,
      eventDate: row.eventDate || null,
      eventDateLabel: formatDateKeyToJaLabel(row.eventDate),
      startTime: row.startTime || null,
      endTime: row.endTime || null,
      timeRangeLabel: buildSpecialEventTimeRangeLabel(
        row.startTime,
        row.endTime
      ),
      location: row.location || "",
      locationUrl: row.locationUrl || "",
      interimDeadlineDate: row.interimDeadlineDate || null,
      interimDeadlineDateLabel: formatDateKeyToJaLabel(row.interimDeadlineDate),
      deadlineDate: row.deadlineDate || null,
      deadlineDateLabel: formatDateKeyToJaLabel(row.deadlineDate),
      description: row.description || "",
      importantNotice: row.importantNotice || "",
      allowCompanions,
      useFeeCalculation,
      feeTiers,
      candidateDates,
      questions,
      createdByUserId: row.createdByUserId || null,
      createdByName: row.createdByName || null,
      canDelete: params.canManagePlayers || isCreator,
      myHouseholdResponse,
      households: built.households,
      summary: built.summary,
    };
  });

  return {
    events: sortSpecialEventItems(items),
    myHouseholdKey: defaultUnitsBundle.myHouseholdKey,
  };
}

export function buildHubSpecialEventSummariesFromRaw(
  params: Parameters<typeof buildSpecialEventDetailItemsFromRaw>[0]
): HubSpecialEventSummary[] {
  const { events } = buildSpecialEventDetailItemsFromRaw(params);
  return events
    .filter((ev) => ev.status !== "archived")
    .map((ev) => toHubSpecialEventSummary(ev));
}

function buildConditionMapFromRows(
  rows: ReadonlyArray<{
    id: string;
    playerId: string;
    status: string;
    startDate: string;
    endDate: string | null;
  }>
): Map<string, PlayerConditionPeriod[]> {
  const map = new Map<string, PlayerConditionPeriod[]>();
  for (const r of rows) {
    if (
      r.status !== "restricted" &&
      r.status !== "rehab" &&
      r.status !== "on_leave"
    ) {
      continue;
    }
    const list = map.get(r.playerId) || [];
    list.push({
      id: r.id,
      playerId: r.playerId,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
    });
    map.set(r.playerId, list);
  }
  return map;
}

function resolveCallerDisplayName(
  access: CallerTeamAccess,
  explicitName?: string | null
): string {
  return (
    (explicitName || "").trim() ||
    access.primaryUserName ||
    access.headerUserName ||
    access.sessionUser?.name ||
    "メンバー"
  );
}

/**
 * GET /api/liff/special-events?teamId=xxx
 */
liffSpecialEventsRouter.get("/", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();
  const queryUserName = c.req.query("userName") || "";

  try {
    if (!teamId || teamId === "demo-team") {
      const demo = buildDemoSpecialEventsBundle();
      return c.json({
        success: true,
        isDemo: true,
        myHouseholdKey: demo.myHouseholdKey,
        events: demo.events,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(teamId)) {
      return c.json(
        {
          success: false,
          error: "このチームへのアクセス権限がありません",
          isForbidden: true,
        },
        403
      );
    }

    const db = drizzle(c.env.DB);
    const [
      eventRows,
      responseRows,
      playerRows,
      memberRows,
      relationRows,
      condPeriodRows,
    ] = await db.batch([
      db
        .select()
        .from(teamSpecialEvents)
        .where(eq(teamSpecialEvents.teamId, teamId))
        .orderBy(desc(teamSpecialEvents.createdAt)),
      db
        .select()
        .from(teamSpecialEventResponses)
        .where(eq(teamSpecialEventResponses.teamId, teamId)),
      db
        .select({
          id: players.id,
          name: players.name,
          uniformNumber: players.uniformNumber,
          userId: players.userId,
          isActive: players.isActive,
          conditionStatus: players.conditionStatus,
        })
        .from(players)
        .where(eq(players.teamId, teamId)),
      db
        .select({
          id: teamMembers.id,
          userId: teamMembers.userId,
          name: teamMembers.name,
          memberType: teamMembers.memberType,
          role: teamMembers.role,
          subRoles: teamMembers.subRoles,
          status: teamMembers.status,
        })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId)),
      db
        .select({
          parentId: parentChildRelations.parentId,
          childId: parentChildRelations.childId,
        })
        .from(parentChildRelations)
        .where(eq(parentChildRelations.teamId, teamId)),
      db
        .select({
          id: playerConditionPeriods.id,
          playerId: playerConditionPeriods.playerId,
          status: playerConditionPeriods.status,
          startDate: playerConditionPeriods.startDate,
          endDate: playerConditionPeriods.endDate,
        })
        .from(playerConditionPeriods)
        .where(eq(playerConditionPeriods.teamId, teamId)),
    ]);

    const condMap = buildConditionMapFromRows(condPeriodRows);
    const enrichedPlayers = playerRows.map((p) => ({
      ...p,
      conditionPeriods: condMap.get(p.id) || [],
    }));

    const built = buildSpecialEventDetailItemsFromRaw({
      eventRows,
      responseRows,
      players: enrichedPlayers,
      teamMembers: memberRows,
      relations: relationRows,
      candidateUserIds: access.candidateUserIds,
      callerUserName: resolveCallerDisplayName(access, queryUserName),
      canManagePlayers:
        access.canEditScheduleForTeam(teamId) ||
        access.canManagePlayersForTeam(teamId) ||
        access.canManageTeamId(teamId),
    });

    return c.json({
      success: true,
      isDemo: false,
      myHouseholdKey: built.myHouseholdKey,
      events: built.events,
    });
  } catch (err: unknown) {
    console.error("[GET /api/liff/special-events Error]:", err);
    return c.json(
      {
        success: false,
        error: "行事・アンケート一覧の取得に失敗しました",
      },
      500
    );
  }
});

interface UpsertSpecialEventBody {
  teamId?: string;
  title?: string;
  category?: string;
  mode?: string;
  status?: string;
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  interimDeadlineDate?: string | null;
  deadlineDate?: string | null;
  description?: string | null;
  importantNotice?: string | null;
  allowCompanions?: boolean;
  useFeeCalculation?: boolean;
  feeTiers?: unknown;
  candidateDates?: unknown;
  questions?: unknown;
  createdByName?: string;
}

/**
 * POST /api/liff/special-events — 新規作成
 */
liffSpecialEventsRouter.post("/", async (c) => {
  try {
    const body = (await c.req.json()) as UpsertSpecialEventBody;
    const teamId = (body.teamId || "").trim();
    const title = (body.title || "").trim().slice(0, 100);

    if (!teamId) {
      return c.json({ success: false, error: "対象チームが指定されていません" }, 400);
    }
    if (!title) {
      return c.json({ success: false, error: "イベント名を入力してください" }, 400);
    }

    const interimDeadlineDate = sanitizeOptionalDateStr(
      body.interimDeadlineDate
    );
    const deadlineDate = sanitizeOptionalDateStr(body.deadlineDate);
    if (
      interimDeadlineDate &&
      deadlineDate &&
      interimDeadlineDate > deadlineDate
    ) {
      return c.json(
        {
          success: false,
          error:
            "中間回答期限は、最終回答期限（最終日）と同じか前の日付を指定してください",
        },
        400
      );
    }

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        id: `demo-spev-${Date.now()}`,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (
      !access.canEditScheduleForTeam(teamId) &&
      !access.canManagePlayersForTeam(teamId) &&
      !access.canManageTeamId(teamId)
    ) {
      return c.json(
        { success: false, error: "行事・アンケートの作成権限がありません" },
        403
      );
    }

    const category = normalizeSpecialEventCategory(body.category);
    const mode = normalizeSpecialEventMode(body.mode);
    const status = normalizeSpecialEventStatus(body.status);
    const eventDate = sanitizeOptionalDateStr(body.eventDate);
    const startTime = sanitizeOptionalTimeStr(body.startTime);
    const endTime = sanitizeOptionalTimeStr(body.endTime);
    const location = (body.location || "").trim().slice(0, 120);
    const locationUrl = sanitizeSafeOptionalUrl(body.locationUrl);
    const description = (body.description || "").trim().slice(0, 2000);
    const importantNotice = (body.importantNotice || "").trim().slice(0, 2000);
    const allowCompanions = body.allowCompanions !== false;
    const useFeeCalculation = body.useFeeCalculation !== false;
    const feeTiers = normalizeSpecialEventFeeTiers(body.feeTiers);
    const candidateDates = normalizeCandidateDates(body.candidateDates);
    const questions = normalizeSurveyQuestions(body.questions);

    if (mode === "date_poll" && candidateDates.length === 0) {
      return c.json(
        {
          success: false,
          error: "候補日アンケートでは候補日を1つ以上追加してください",
        },
        400
      );
    }

    const db = drizzle(c.env.DB);
    const newId = `spev_${crypto.randomUUID().replace(/-/g, "")}`;
    const now = new Date();
    const creatorName = resolveCallerDisplayName(access, body.createdByName);

    await db.insert(teamSpecialEvents).values({
      id: newId,
      teamId,
      title,
      category,
      mode,
      status,
      eventDate: mode === "rsvp" ? eventDate : null,
      startTime,
      endTime,
      location,
      locationUrl,
      interimDeadlineDate,
      deadlineDate,
      description,
      importantNotice,
      allowCompanions,
      useFeeCalculation,
      feeTiersJson: JSON.stringify(feeTiers),
      candidateDatesJson: JSON.stringify(candidateDates),
      questionsJson: JSON.stringify(questions),
      createdByUserId: access.primaryUserId || null,
      createdByName: creatorName.slice(0, 60),
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      success: true,
      id: newId,
    });
  } catch (err: unknown) {
    console.error("[POST /api/liff/special-events Error]:", err);
    return c.json(
      { success: false, error: "行事・アンケートの作成に失敗しました" },
      500
    );
  }
});

/**
 * PUT /api/liff/special-events/:specialEventId — 更新（候補日決定による本出欠切替を含む）
 */
liffSpecialEventsRouter.put("/:specialEventId", async (c) => {
  const specialEventId = (c.req.param("specialEventId") || "").trim();

  try {
    const body = (await c.req.json()) as UpsertSpecialEventBody;

    if (specialEventId.startsWith("demo-") || body.teamId === "demo-team") {
      const demoInterim = sanitizeOptionalDateStr(body.interimDeadlineDate);
      const demoFinal = sanitizeOptionalDateStr(body.deadlineDate);
      if (demoInterim && demoFinal && demoInterim > demoFinal) {
        return c.json(
          {
            success: false,
            error:
              "中間回答期限は、最終回答期限（最終日）と同じか前の日付を指定してください",
          },
          400
        );
      }
      return c.json({
        success: true,
        isDemo: true,
        id: specialEventId,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);
    const existing = await db
      .select()
      .from(teamSpecialEvents)
      .where(eq(teamSpecialEvents.id, specialEventId))
      .get();

    if (!existing) {
      return c.json(
        { success: false, error: "対象の行事・アンケートが見つかりません" },
        404
      );
    }

    const access = await resolveCallerTeamAccess(c);
    const isCreator = Boolean(
      existing.createdByUserId &&
        access.candidateUserIds.includes(existing.createdByUserId)
    );
    if (
      !access.canEditScheduleForTeam(existing.teamId) &&
      !access.canManagePlayersForTeam(existing.teamId) &&
      !access.canManageTeamId(existing.teamId) &&
      !isCreator
    ) {
      return c.json(
        { success: false, error: "行事・アンケートの編集権限がありません" },
        403
      );
    }

    const title =
      body.title !== undefined
        ? body.title.trim().slice(0, 100)
        : existing.title;
    if (!title) {
      return c.json({ success: false, error: "イベント名を入力してください" }, 400);
    }

    const category =
      body.category !== undefined
        ? normalizeSpecialEventCategory(body.category)
        : normalizeSpecialEventCategory(existing.category);
    const mode =
      body.mode !== undefined
        ? normalizeSpecialEventMode(body.mode)
        : normalizeSpecialEventMode(existing.mode);
    const status =
      body.status !== undefined
        ? normalizeSpecialEventStatus(body.status)
        : normalizeSpecialEventStatus(existing.status);

    const eventDate =
      body.eventDate !== undefined
        ? sanitizeOptionalDateStr(body.eventDate)
        : existing.eventDate;
    const startTime =
      body.startTime !== undefined
        ? sanitizeOptionalTimeStr(body.startTime)
        : existing.startTime;
    const endTime =
      body.endTime !== undefined
        ? sanitizeOptionalTimeStr(body.endTime)
        : existing.endTime;
    const interimDeadlineDate =
      body.interimDeadlineDate !== undefined
        ? sanitizeOptionalDateStr(body.interimDeadlineDate)
        : existing.interimDeadlineDate;
    const deadlineDate =
      body.deadlineDate !== undefined
        ? sanitizeOptionalDateStr(body.deadlineDate)
        : existing.deadlineDate;
    if (
      interimDeadlineDate &&
      deadlineDate &&
      interimDeadlineDate > deadlineDate
    ) {
      return c.json(
        {
          success: false,
          error:
            "中間回答期限は、最終回答期限（最終日）と同じか前の日付を指定してください",
        },
        400
      );
    }
    const location =
      body.location !== undefined
        ? (body.location || "").trim().slice(0, 120)
        : existing.location || "";
    const locationUrl =
      body.locationUrl !== undefined
        ? sanitizeSafeOptionalUrl(body.locationUrl)
        : existing.locationUrl || "";
    const description =
      body.description !== undefined
        ? (body.description || "").trim().slice(0, 2000)
        : existing.description || "";
    const importantNotice =
      body.importantNotice !== undefined
        ? (body.importantNotice || "").trim().slice(0, 2000)
        : existing.importantNotice || "";
    const allowCompanions =
      body.allowCompanions !== undefined
        ? Boolean(body.allowCompanions)
        : Boolean(existing.allowCompanions);
    const useFeeCalculation =
      body.useFeeCalculation !== undefined
        ? Boolean(body.useFeeCalculation)
        : Boolean(existing.useFeeCalculation);
    const feeTiers =
      body.feeTiers !== undefined
        ? normalizeSpecialEventFeeTiers(body.feeTiers)
        : normalizeSpecialEventFeeTiers(existing.feeTiersJson);
    const candidateDates =
      body.candidateDates !== undefined
        ? normalizeCandidateDates(body.candidateDates)
        : normalizeCandidateDates(existing.candidateDatesJson);
    const questions =
      body.questions !== undefined
        ? normalizeSurveyQuestions(body.questions)
        : normalizeSurveyQuestions(existing.questionsJson);

    if (mode === "date_poll" && candidateDates.length === 0) {
      return c.json(
        {
          success: false,
          error: "候補日アンケートでは候補日を1つ以上残してください",
        },
        400
      );
    }

    await db
      .update(teamSpecialEvents)
      .set({
        title,
        category,
        mode,
        status,
        eventDate: mode === "rsvp" ? eventDate : null,
        startTime,
        endTime,
        location,
        locationUrl,
        interimDeadlineDate,
        deadlineDate,
        description,
        importantNotice,
        allowCompanions,
        useFeeCalculation,
        feeTiersJson: JSON.stringify(feeTiers),
        candidateDatesJson: JSON.stringify(candidateDates),
        questionsJson: JSON.stringify(questions),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(teamSpecialEvents.id, specialEventId),
          eq(teamSpecialEvents.teamId, existing.teamId)
        )
      );

    return c.json({
      success: true,
      id: specialEventId,
    });
  } catch (err: unknown) {
    console.error("[PUT /api/liff/special-events/:id Error]:", err);
    return c.json(
      { success: false, error: "行事・アンケートの更新に失敗しました" },
      500
    );
  }
});

/**
 * DELETE /api/liff/special-events/:specialEventId — 削除（指導者・管理者または作成者本人）
 */
liffSpecialEventsRouter.delete("/:specialEventId", async (c) => {
  const specialEventId = (c.req.param("specialEventId") || "").trim();
  const queryTeamId = (c.req.query("teamId") || "").trim();

  try {
    if (specialEventId.startsWith("demo-") || queryTeamId === "demo-team") {
      return c.json({ success: true, isDemo: true });
    }

    const db = drizzle(c.env.DB);
    const existing = await db
      .select()
      .from(teamSpecialEvents)
      .where(eq(teamSpecialEvents.id, specialEventId))
      .get();

    if (!existing) {
      return c.json(
        { success: false, error: "対象の行事・アンケートが見つかりません" },
        404
      );
    }

    const access = await resolveCallerTeamAccess(c);
    const isCreator = Boolean(
      existing.createdByUserId &&
        access.candidateUserIds.includes(existing.createdByUserId)
    );
    if (
      !access.canEditScheduleForTeam(existing.teamId) &&
      !access.canManagePlayersForTeam(existing.teamId) &&
      !access.canManageTeamId(existing.teamId) &&
      !isCreator
    ) {
      return c.json(
        {
          success: false,
          error: "削除できるのは予定・行事編集権限メンバーまたは作成者のみです",
        },
        403
      );
    }

    await db
      .delete(teamSpecialEvents)
      .where(
        and(
          eq(teamSpecialEvents.id, specialEventId),
          eq(teamSpecialEvents.teamId, existing.teamId)
        )
      );

    return c.json({ success: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/liff/special-events/:id Error]:", err);
    return c.json(
      { success: false, error: "行事・アンケートの削除に失敗しました" },
      500
    );
  }
});

interface RespondSpecialEventBody {
  teamId?: string;
  householdKey?: string;
  householdLabel?: string;
  memberEntries?: unknown;
  companions?: unknown;
  dateVotes?: unknown;
  surveyAnswers?: unknown;
  comment?: string;
  updatedByName?: string;
}

/**
 * POST /api/liff/special-events/:specialEventId/respond — 世帯・個人の出欠＆同伴家族＆アンケート回答保存
 */
liffSpecialEventsRouter.post("/:specialEventId/respond", async (c) => {
  const specialEventId = (c.req.param("specialEventId") || "").trim();

  try {
    const body = (await c.req.json()) as RespondSpecialEventBody;
    const householdKey = (body.householdKey || "").trim().slice(0, 80);
    const householdLabel =
      (body.householdLabel || "").trim().slice(0, 60) || "ご家族";

    if (!householdKey) {
      return c.json(
        { success: false, error: "回答対象の世帯が指定されていません" },
        400
      );
    }

    if (specialEventId.startsWith("demo-") || body.teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        householdKey,
      });
    }

    const db = drizzle(c.env.DB);
    const existingEvent = await db
      .select()
      .from(teamSpecialEvents)
      .where(eq(teamSpecialEvents.id, specialEventId))
      .get();

    if (!existingEvent) {
      return c.json(
        { success: false, error: "対象の行事・アンケートが見つかりません" },
        404
      );
    }

    const access = await resolveCallerTeamAccess(c);
    if (!access.canMutateTeamData(existingEvent.teamId)) {
      return c.json({ success: false, error: "回答権限がありません" }, 403);
    }

    if (existingEvent.status !== "open") {
      const canOverrideClosed =
        access.canEditScheduleForTeam(existingEvent.teamId) ||
        access.canManagePlayersForTeam(existingEvent.teamId) ||
        access.canManageTeamId(existingEvent.teamId) ||
        Boolean(
          existingEvent.createdByUserId &&
            access.candidateUserIds.includes(existingEvent.createdByUserId)
        );
      if (!canOverrideClosed) {
        return c.json(
          {
            success: false,
            error: "このイベントは受付を締め切っています（変更は幹事へご連絡ください）",
          },
          400
        );
      }
    }

    const memberEntries = normalizeMemberAttendanceEntries(body.memberEntries);
    const companions = existingEvent.allowCompanions
      ? normalizeCompanionsList(body.companions)
      : [];
    const dateVotes = normalizeDateVotesList(body.dateVotes);
    const surveyAnswers = normalizeSurveyAnswersMap(body.surveyAnswers);
    const comment = (body.comment || "").trim().slice(0, 500);
    const updaterName = resolveCallerDisplayName(access, body.updatedByName);
    const now = new Date();
    const responseId = `sper_${crypto.randomUUID().replace(/-/g, "")}`;

    await db
      .insert(teamSpecialEventResponses)
      .values({
        id: responseId,
        specialEventId,
        teamId: existingEvent.teamId,
        householdKey,
        householdLabel,
        memberEntriesJson: JSON.stringify(memberEntries),
        companionsJson: JSON.stringify(companions),
        dateVotesJson: JSON.stringify(dateVotes),
        surveyAnswersJson: JSON.stringify(surveyAnswers),
        comment,
        feePaid: false,
        updatedByUserId: access.primaryUserId || null,
        updatedByName: updaterName.slice(0, 60),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          teamSpecialEventResponses.specialEventId,
          teamSpecialEventResponses.householdKey,
        ],
        set: {
          householdLabel,
          memberEntriesJson: JSON.stringify(memberEntries),
          companionsJson: JSON.stringify(companions),
          dateVotesJson: JSON.stringify(dateVotes),
          surveyAnswersJson: JSON.stringify(surveyAnswers),
          comment,
          updatedByUserId: access.primaryUserId || null,
          updatedByName: updaterName.slice(0, 60),
          updatedAt: now,
        },
      });

    return c.json({
      success: true,
      householdKey,
    });
  } catch (err: unknown) {
    console.error("[POST /api/liff/special-events/:id/respond Error]:", err);
    return c.json({ success: false, error: "回答の保存に失敗しました" }, 500);
  }
});

interface ToggleFeePaidBody {
  teamId?: string;
  householdKey?: string;
  feePaid?: boolean;
}

/**
 * PATCH /api/liff/special-events/:specialEventId/fee-paid — 幹事・会計用の集金済チェック更新
 */
liffSpecialEventsRouter.patch("/:specialEventId/fee-paid", async (c) => {
  const specialEventId = (c.req.param("specialEventId") || "").trim();

  try {
    const body = (await c.req.json()) as ToggleFeePaidBody;
    const householdKey = (body.householdKey || "").trim();
    const feePaid = Boolean(body.feePaid);

    if (!householdKey) {
      return c.json(
        { success: false, error: "対象世帯が指定されていません" },
        400
      );
    }

    if (specialEventId.startsWith("demo-") || body.teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        householdKey,
        feePaid,
      });
    }

    const db = drizzle(c.env.DB);
    const existingEvent = await db
      .select()
      .from(teamSpecialEvents)
      .where(eq(teamSpecialEvents.id, specialEventId))
      .get();

    if (!existingEvent) {
      return c.json(
        { success: false, error: "対象のイベントが見つかりません" },
        404
      );
    }

    const access = await resolveCallerTeamAccess(c);
    const isCreator = Boolean(
      existingEvent.createdByUserId &&
        access.candidateUserIds.includes(existingEvent.createdByUserId)
    );
    if (
      !access.canEditScheduleForTeam(existingEvent.teamId) &&
      !access.canManagePlayersForTeam(existingEvent.teamId) &&
      !access.canManageTeamId(existingEvent.teamId) &&
      !isCreator
    ) {
      return c.json(
        { success: false, error: "集金状況の更新権限がありません" },
        403
      );
    }

    await db
      .update(teamSpecialEventResponses)
      .set({
        feePaid,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(teamSpecialEventResponses.specialEventId, specialEventId),
          eq(teamSpecialEventResponses.householdKey, householdKey)
        )
      );

    return c.json({
      success: true,
      householdKey,
      feePaid,
    });
  } catch (err: unknown) {
    console.error("[PATCH /api/liff/special-events/:id/fee-paid Error]:", err);
    return c.json(
      { success: false, error: "集金状況の更新に失敗しました" },
      500
    );
  }
});

export default liffSpecialEventsRouter;
