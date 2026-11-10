// filepath: src/api/liff.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, asc, gte, and, or, inArray, sql } from "drizzle-orm";
import {
  teams,
  organizations,
  organizationMembers,
  matches,
  matchLineups,
  atBats,
  baseAdvances,
  playLogs,
  matchScorebookSnapshots,
  events,
  attendances,
  venues,
  teamMembers,
  players,
  user,
  account,
  eventCarpools,
  eventCarpoolRiders,
  memberCars,
  eventCarpoolSettings,
  teamDocuments,
  teamFaqs,
  teamRules,
  teamLinks,
  parentChildRelations,
  tournaments,
  eventEquipments,
  teamGroups,
  teamGroupMembers,
} from "@/db/schema";
import type { ScorebookSheetStructure, ScorebookV2AtBat } from "@/types/scorebook-v2";
import {
  DEMO_SCHEDULED_MATCH_CARPOOL_SYNC,
  parseMatchDayOpsJson,
  type LiffAdultMemberOption,
  type LiffMatchOpsContextResponse,
  type LiffMatchScheduleCarpoolCar,
  type LiffMatchScheduleSyncInfo,
  type LiffMyMatchIdentity,
} from "@/lib/liff/match-day-ops";
import { aggregateTeamPlayerPositions } from "@/lib/liff/player-positions-and-growth";
import {
  comparePlayersByConditionAndUniform,
  findUpcomingPlayerConditionPeriod,
  getTodayJstDateKey,
  isNonActiveConditionStatus,
  maskConditionPeriodsForViewer,
  normalizeIsoDateKey,
  normalizePlayerConditionStatus,
  resolveEffectivePlayerConditionOnDate,
  shiftIsoDateKeyByDays,
  type PlayerConditionPeriod,
  type PlayerConditionStatus,
} from "@/lib/liff/player-condition";
import {
  normalizeCanonicalPositionCode,
  parseDateInputToUnixSeconds,
  parsePlayerProfileDetails,
  type PlayerProfileDetails,
} from "@/lib/liff/player-profile-schema";
import {
  cleanupLeavePeriodsMatchAttendance,
  cleanupPreJoinMatchAttendance,
  loadSinglePlayerConditionPeriods,
  loadTeamPlayerConditionPeriodsMap,
} from "@/lib/player-roster-cleanup";
import { ensureAllSchemasOnce, ensureEventColumns, ensureRulesTable, ensureLinksTable, ensureMemberOrderColumn, ensureStatusConfigColumn, ensureMemberSubLabelsColumn, ensureMatchLineupColumns, ensurePlayerProfileColumns, ensurePlayerConditionPeriodsTable, ensureVenuesColumns, ensureScheduleDefaultTimesColumn } from "@/lib/db-helper";
import {
  buildParentToChildrenMap,
  classifyTeamAttendanceRosters,
  computeEventGroupAttendance,
  DEMO_GROUP_ATTEND_COUNT_LIST,
  normalizeGroupStatusSummaryConfig,
  type ClassifiedTeamAttendanceRosters,
} from "@/lib/liff/group-attendance";
import {
  DEFAULT_TEAM_SCHEDULE_TIMES,
  extractRawTimeHHMM,
  normalizeTeamScheduleDefaultTimes,
} from "@/lib/liff/schedule-default-times";
import {
  DEFAULT_PRACTICE_MATCH_LABEL,
  extractPracticeMatchLabelFromJson,
  extractScoreTeamNameModeFromJson,
} from "@/lib/liff/scorebook-symbol-rules";
import type { WorkerEnv, AuthUser } from "@/types/api";
import { ensureAuthSchema, getAuth } from "@/lib/auth";
import { canManageSystem, canManageTeam } from "@/lib/roles";
import {
  extractHeaderUserId,
  extractHeaderUserName,
  resolveCallerTeamAccess,
} from "@/lib/team-access";
import {
  buildGoogleMapsEmbedFromUrl,
  expandGoogleMapsShortUrl,
  isGoogleMapsShortUrl,
} from "@/lib/google-maps";

const app = new Hono<{ Bindings: WorkerEnv }>();

const toBoolean = (val: any, defaultVal = false): boolean => {
  if (val === true || val === 1 || val === "1" || val === "true") return true;
  if (val === false || val === 0 || val === "0" || val === "false") return false;
  return defaultVal;
};

const IGNORED_MOCK_USER_IDS = new Set(["cached-user", "mock-user-12345"]);

/**
 * 🔑 LINE userId / Web Better-Auth userId を `account` テーブル経由で双方向展開するヘルパー
 * - Google等でWeb登録済みのユーザーに LINE `U...` が紐づいている場合 (accountId -> userId)
 * - LINE `U...` でメンバー登録済みのユーザーが Web LINEログインした場合 (userId -> accountId)
 * の双方を漏れなく解決する。
 */
async function expandCandidateUserIds(
  db: ReturnType<typeof drizzle>,
  rawIds: Array<string | null | undefined>
): Promise<string[]> {
  const idSet = new Set<string>();
  for (const raw of rawIds) {
    const trimmed = raw?.trim();
    if (trimmed && !IGNORED_MOCK_USER_IDS.has(trimmed)) {
      idSet.add(trimmed);
    }
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
      if (row.userId && !IGNORED_MOCK_USER_IDS.has(row.userId) && !idSet.has(row.userId)) {
        idSet.add(row.userId);
        newlyDiscoveredUserIds.push(row.userId);
      }
      if (row.accountId && !IGNORED_MOCK_USER_IDS.has(row.accountId)) {
        idSet.add(row.accountId);
      }
    }

    // 1段目で新たな Better-Auth userId が見つかった場合のみ、それに紐づく別プロバイダ accountId を補完
    if (newlyDiscoveredUserIds.length > 0) {
      const extraRows = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(inArray(account.userId, newlyDiscoveredUserIds))
        .all();
      for (const row of extraRows) {
        if (row.accountId && !IGNORED_MOCK_USER_IDS.has(row.accountId)) {
          idSet.add(row.accountId);
        }
      }
    }
  } catch (err) {
    console.warn("expandCandidateUserIds warning:", err);
  }

  return Array.from(idSet);
}

const IGNORED_GENERIC_USER_NAMES = new Set([
  "メンバー",
  "LINEユーザー",
  "ゲスト",
  "新規メンバー",
  "保護者",
  "選手",
  "name",
]);

function normalizeMemberName(raw: string): string {
  return raw.replace(/[\s　()（）【】［］\[\]]+/g, "").trim();
}

function hasFatherRoleTag(name: string): boolean {
  return /(?:父|パパ|お父さん|夫)/.test(name);
}

function hasMotherRoleTag(name: string): boolean {
  return /(?:母|ママ|お母さん|妻)/.test(name);
}

/**
 * 「小西 父」→「小西」、「風岡（母）」→「風岡」のように末尾の続柄ラベルを除いた苗字ステムを抽出
 */
function extractParentSurnameStem(rawName: string): string {
  return rawName
    .replace(/[\s　()（）【】［］\[\]]*(?:お父さん|お母さん|保護者|パパ|ママ|父|母|夫|妻)[\s　()（）【】［］\[\]]*$/g, "")
    .replace(/[\s　()（）【】［］\[\]]+/g, "")
    .trim();
}

/**
 * 「中島 敏文」⇔「敏文中島」、「守 佐藤」⇔「佐藤守」のように姓名順の揺れも吸収した正規化名セットを生成
 */
function buildCanonicalPersonNameSet(raw: string | null | undefined): Set<string> {
  const result = new Set<string>();
  if (!raw) return result;
  const trimmed = raw.trim();
  if (!trimmed || IGNORED_GENERIC_USER_NAMES.has(trimmed)) return result;

  const direct = normalizeMemberName(trimmed);
  if (direct && !IGNORED_GENERIC_USER_NAMES.has(direct)) {
    result.add(direct);
  }

  const tokens = trimmed
    .replace(/[()（）【】［］\[\]]+/g, " ")
    .trim()
    .split(/[\s　]+/)
    .filter(Boolean);
  if (tokens.length === 2) {
    const ab = normalizeMemberName(tokens[0] + tokens[1]);
    const ba = normalizeMemberName(tokens[1] + tokens[0]);
    if (ab) result.add(ab);
    if (ba) result.add(ba);
  }
  return result;
}

/**
 * 🏷️ 大人メンバー（保護者・指導者等）の安全な名前照合ヘルパー
 * 1) 空白・括弧を除去した正規化名の完全一致を最優先（複数ある場合は非 tm_ の正規IDを優先）
 * 2) 部分一致は父/母の逆転を防ぎ、候補が1名に一意特定できる場合のみ採用（同姓の父母誤爆を防止）
 * 3) 「苗字 父 / 苗字 母」形式の名簿に対し、「苗字＋実名（例：小西敏幸 → 小西 父）」で一意の家族に該当する場合は安全に解決
 */
function findMatchingAdultMemberByName<
  T extends {
    id: string;
    name: string | null;
    userId?: string | null;
    memberType?: string | null;
    status?: string | null;
  }
>(
  members: T[],
  searchNames: Array<string | null | undefined>,
  options?: { allowAmbiguousFamilyParent?: boolean }
): T | null {
  const adultActive = members.filter(
    (m) => m.memberType !== "player" && (m.status === "active" || !m.status) && Boolean(m.name?.trim())
  );
  if (adultActive.length === 0) return null;

  const cleanQueries = searchNames
    .map((s) => (s ? s.trim() : ""))
    .filter((s) => s.length > 0 && !IGNORED_GENERIC_USER_NAMES.has(s));

  for (const q of cleanQueries) {
    const normQ = normalizeMemberName(q);
    if (!normQ) continue;
    const exactMatches = adultActive.filter((m) => normalizeMemberName(m.name || "") === normQ);
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) {
      return exactMatches.find((m) => !m.id.startsWith("tm_")) || exactMatches[0];
    }
  }

  for (const q of cleanQueries) {
    const normQ = normalizeMemberName(q);
    if (!normQ || normQ.length < 2) continue;
    const qIsFather = hasFatherRoleTag(q);
    const qIsMother = hasMotherRoleTag(q);

    const partialMatches = adultActive.filter((m) => {
      const rawM = m.name || "";
      const normM = normalizeMemberName(rawM);
      if (!normM) return false;
      if (qIsFather && hasMotherRoleTag(rawM)) return false;
      if (qIsMother && hasFatherRoleTag(rawM)) return false;
      return normM.includes(normQ) || normQ.includes(normM);
    });

    if (partialMatches.length === 1) {
      return partialMatches[0];
    }
  }

  // 3) 名簿側が「苗字 父」「苗字 母」形式で、ユーザー名が「小西敏幸」「風岡 太郎」のようなフルネームの場合の家族照合
  for (const q of cleanQueries) {
    const normQ = normalizeMemberName(q);
    if (!normQ || normQ.length < 2) continue;
    const qIsFather = hasFatherRoleTag(q);
    const qIsMother = hasMotherRoleTag(q);
    const qTokens = q.trim().split(/[\s　]+/).filter(Boolean);
    const qFirstTokenNorm = qTokens.length >= 2 ? normalizeMemberName(qTokens[0]) : "";

    const stemCandidates: Array<{ member: T; stem: string }> = [];
    for (const m of adultActive) {
      const rawM = m.name || "";
      if (!hasFatherRoleTag(rawM) && !hasMotherRoleTag(rawM)) continue;
      if (qIsFather && hasMotherRoleTag(rawM)) continue;
      if (qIsMother && hasFatherRoleTag(rawM)) continue;

      const stem = extractParentSurnameStem(rawM);
      if (!stem) continue;

      const isStemMatch =
        (stem.length >= 2 && normQ.startsWith(stem)) ||
        (stem.length === 1 && qFirstTokenNorm === stem);

      if (isStemMatch) {
        stemCandidates.push({ member: m, stem });
      }
    }

    if (stemCandidates.length === 0) continue;
    const distinctStems = new Set(stemCandidates.map((c) => c.stem));
    if (distinctStems.size !== 1) continue; // 複数家族にまたがる場合は誤爆防止のためスキップ

    const familyMembers = stemCandidates.map((c) => c.member);
    if (familyMembers.length === 1) {
      return familyMembers[0];
    }

    // 同一家族内で片方の親が既に別アカウント連携済みで、もう片方のみ userId 未設定なら未設定枠を採用
    const unlinkedMembers = familyMembers.filter((m) => !m.userId);
    if (unlinkedMembers.length === 1) {
      return unlinkedMembers[0];
    }

    // 閲覧・出欠権限解決時は同一家族の代表レコードを返却（家族間で権限共有されるため安全）
    if (options?.allowAmbiguousFamilyParent) {
      return (
        familyMembers.find((m) => !m.id.startsWith("tm_") && hasFatherRoleTag(m.name || "")) ||
        familyMembers.find((m) => !m.id.startsWith("tm_")) ||
        familyMembers[0]
      );
    }
  }

  return null;
}

/**
 * 🔗 チームメンバーに紐づく `user.name`（Web Google/Microsoft登録名など）と LINE表示名を照合し、
 * 一意に一致した場合は `account` テーブルへ自動連携して該当メンバーを返す（中島父・小西父・松下父・石田父パターン根絶）
 */
async function findAndAutoLinkMemberByUserTableName<
  T extends {
    id: string;
    name: string | null;
    userId: string | null;
    memberType?: string | null;
    status?: string | null;
  }
>(
  db: ReturnType<typeof drizzle>,
  members: T[],
  searchNames: Array<string | null | undefined>,
  rawLineUserId?: string | null
): Promise<T | null> {
  const queryCanonical = new Set<string>();
  for (const s of searchNames) {
    for (const c of buildCanonicalPersonNameSet(s)) {
      if (c.length >= 2) queryCanonical.add(c);
    }
  }
  if (queryCanonical.size === 0) return null;

  const adultWithUid = members.filter(
    (m) =>
      m.memberType !== "player" &&
      (m.status === "active" || !m.status) &&
      Boolean(m.userId?.trim())
  );
  if (adultWithUid.length === 0) return null;

  const memberUserIds = Array.from(
    new Set(adultWithUid.map((m) => m.userId!.trim()).filter(Boolean))
  );
  if (memberUserIds.length === 0) return null;

  try {
    const linkedUsers = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, memberUserIds))
      .all();

    const matchedUserIds = new Set<string>();
    for (const u of linkedUsers) {
      const uNames = buildCanonicalPersonNameSet(u.name);
      for (const cn of uNames) {
        if (queryCanonical.has(cn)) {
          matchedUserIds.add(u.id);
          break;
        }
      }
    }

    if (matchedUserIds.size !== 1) return null;
    const targetUserId = Array.from(matchedUserIds)[0];
    const matchedMembers = adultWithUid.filter((m) => m.userId === targetUserId);
    if (matchedMembers.length === 0) return null;

    const chosen =
      matchedMembers.find((m) => !m.id.startsWith("tm_")) || matchedMembers[0];

    const cleanLine = rawLineUserId?.trim() || "";
    if (cleanLine.startsWith("U") && targetUserId !== cleanLine) {
      await ensureLineAccountLink(db, targetUserId, cleanLine);
    }

    return chosen;
  } catch (err) {
    console.warn("findAndAutoLinkMemberByUserTableName warning:", err);
    return null;
  }
}

/**
 * 🔑 `account` テーブル経由での確定済み連携アカウントID展開
 * ⚠️ 未承認・未招待ユーザーの他人名義混入を防ぐため、表示名によるチーム横断の推測紐付けは行わない。
 */
async function autoLinkAndExpandCandidateUserIds(
  db: ReturnType<typeof drizzle>,
  rawIds: Array<string | null | undefined>,
  _searchNames?: Array<string | null | undefined>
): Promise<string[]> {
  return expandCandidateUserIds(db, rawIds);
}

/**
 * 🔗 既存の Better-Auth `user.id` に対して LINE `U...` アカウントを `account` テーブルへ安全に紐付ける
 */
async function ensureLineAccountLink(
  db: ReturnType<typeof drizzle>,
  primaryUserId: string,
  lineAccountId: string
): Promise<void> {
  const cleanPrimary = primaryUserId.trim();
  const cleanLine = lineAccountId.trim();
  if (
    !cleanPrimary ||
    !cleanLine ||
    cleanPrimary === cleanLine ||
    IGNORED_MOCK_USER_IDS.has(cleanPrimary) ||
    IGNORED_MOCK_USER_IDS.has(cleanLine) ||
    !cleanLine.startsWith("U")
  ) {
    return;
  }

  try {
    const primaryExists = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, cleanPrimary))
      .get();
    if (!primaryExists) return;

    const existingAcc = await db
      .select({ id: account.id, userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, "line"), eq(account.accountId, cleanLine)))
      .get();

    if (!existingAcc) {
      await db.insert(account).values({
        id: `acc_line_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        accountId: cleanLine,
        providerId: "line",
        userId: cleanPrimary,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else if (existingAcc.userId !== cleanPrimary && existingAcc.userId.startsWith("U")) {
      await db
        .update(account)
        .set({ userId: cleanPrimary, updatedAt: new Date() })
        .where(eq(account.id, existingAcc.id));
    }
  } catch (err) {
    console.warn("ensureLineAccountLink warning:", err);
  }
}

const extractMatchDateKey = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const m = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};

const extractEventRawIsoDateKey = (
  val: Date | number | string | null | undefined
): string => {
  if (!val) return "";
  if (typeof val === "string") {
    const m = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const ms =
    val instanceof Date
      ? val.getTime()
      : typeof val === "number"
        ? val
        : new Date(val).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
};

const toEventJstDateKey = (
  val: Date | number | string | null | undefined
): string => {
  if (!val) return "";
  const ms =
    val instanceof Date
      ? val.getTime()
      : typeof val === "number"
        ? val
        : new Date(val).getTime();
  if (!Number.isFinite(ms)) return "";
  const jst = new Date(ms + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
};

const toEventJstTimeText = (
  val: Date | number | string | null | undefined
): string | null => {
  if (!val) return null;
  const ms =
    val instanceof Date
      ? val.getTime()
      : typeof val === "number"
        ? val
        : new Date(val).getTime();
  if (!Number.isFinite(ms)) return null;
  const jst = new Date(ms + 9 * 3600 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  if (hh === "00" && mi === "00") return null;
  return `${hh}:${mi}`;
};

const resolveEventDisplayStartTime = (
  startAt: Date | number | string | null | undefined,
  matchedDateKey?: string
): string | null => {
  if (!startAt) return null;
  const rawDate = extractEventRawIsoDateKey(startAt);
  const rawTime = extractRawTimeHHMM(startAt);
  if (matchedDateKey && rawDate && rawDate !== matchedDateKey && toEventJstDateKey(startAt) === matchedDateKey) {
    return toEventJstTimeText(startAt);
  }
  if (rawTime && rawTime !== "00:00") {
    return rawTime;
  }
  return toEventJstTimeText(startAt);
};

const findSameDayScheduleEvent = <
  T extends {
    id: string;
    startAt: Date | number | string | null;
    eventType?: string | null;
    amType?: string | null;
  },
>(
  eventRows: ReadonlyArray<T>,
  dateKey: string
): T | undefined => {
  if (!dateKey) return undefined;
  const rawSameDay = eventRows.filter(
    (ev) => extractEventRawIsoDateKey(ev.startAt) === dateKey
  );
  if (rawSameDay.length > 0) {
    return (
      rawSameDay.find(
        (ev) => ev.eventType === "match" || ev.amType === "match"
      ) || rawSameDay[0]
    );
  }
  const jstSameDay = eventRows.filter(
    (ev) => toEventJstDateKey(ev.startAt) === dateKey
  );
  return (
    jstSameDay.find(
      (ev) => ev.eventType === "match" || ev.amType === "match"
    ) || jstSameDay[0]
  );
};

/**
 * 🚗 予定試合（scheduled 等）のカード向けに、同日スケジュール・配車情報を N+1 ゼロで一括解決する
 */
async function buildScheduledMatchCarpoolSyncMap(
  db: ReturnType<typeof drizzle>,
  teamId: string,
  matchRows: ReadonlyArray<{
    id: string;
    date: string | null;
    status: string | null;
    matchDayOps?: unknown;
  }>,
  preloadedEvents?: ReadonlyArray<typeof events.$inferSelect>
): Promise<Map<string, LiffMatchScheduleSyncInfo>> {
  const result = new Map<string, LiffMatchScheduleSyncInfo>();
  const candidateMatches = matchRows.filter(
    (m) => m.status !== "finished" && m.status !== "live"
  );
  if (candidateMatches.length === 0) {
    return result;
  }

  const teamEvents =
    preloadedEvents ??
    (await db
      .select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(desc(events.startAt))
      .all()
      .catch(() => [] as Array<typeof events.$inferSelect>));

  if (teamEvents.length === 0) {
    return result;
  }

  const eventIdByMatchId = new Map<string, string>();
  const matchedDateKeyByEventId = new Map<string, string>();
  const targetEventMap = new Map<string, (typeof teamEvents)[number]>();

  for (const m of candidateMatches) {
    const ops = parseMatchDayOpsJson(m.matchDayOps);
    if (ops.carpoolMode === "none") continue;

    const dateKey = extractMatchDateKey(m.date);
    let targetEvent: (typeof teamEvents)[number] | undefined;
    if (ops.linkedEventId) {
      targetEvent = teamEvents.find((ev) => ev.id === ops.linkedEventId);
    }
    if (!targetEvent && dateKey) {
      targetEvent = findSameDayScheduleEvent(teamEvents, dateKey);
    }

    if (targetEvent) {
      eventIdByMatchId.set(m.id, targetEvent.id);
      if (dateKey) matchedDateKeyByEventId.set(targetEvent.id, dateKey);
      targetEventMap.set(targetEvent.id, targetEvent);
    }
  }

  const targetEventIds = Array.from(targetEventMap.keys());
  if (targetEventIds.length === 0) {
    return result;
  }

  const eventIdChunks: string[][] = [];
  for (let i = 0; i < targetEventIds.length; i += 80) {
    eventIdChunks.push(targetEventIds.slice(i, i + 80));
  }

  const carpoolChunkResults = await Promise.all(
    eventIdChunks.map((chunk) =>
      db
        .select({
          id: eventCarpools.id,
          eventId: eventCarpools.eventId,
          driverName: teamMembers.name,
          capacity: eventCarpools.capacity,
          carType: eventCarpools.carType,
          carName: memberCars.name,
          carColor: memberCars.color,
          numberPlate: memberCars.numberPlate,
        })
        .from(eventCarpools)
        .leftJoin(teamMembers, eq(eventCarpools.driverId, teamMembers.id))
        .leftJoin(memberCars, eq(eventCarpools.carId, memberCars.id))
        .where(inArray(eventCarpools.eventId, chunk))
        .all()
    )
  );
  const allCarpools = carpoolChunkResults.flat();

  const carpoolIds = allCarpools.map((c) => c.id);
  const carpoolIdChunks: string[][] = [];
  for (let i = 0; i < carpoolIds.length; i += 80) {
    carpoolIdChunks.push(carpoolIds.slice(i, i + 80));
  }

  const riderChunkResults =
    carpoolIdChunks.length > 0
      ? await Promise.all(
          carpoolIdChunks.map((chunk) =>
            db
              .select({
                carpoolId: eventCarpoolRiders.carpoolId,
                riderPlayerName: players.name,
                riderMemberName: teamMembers.name,
                riderMemberType: teamMembers.memberType,
              })
              .from(eventCarpoolRiders)
              .leftJoin(players, eq(eventCarpoolRiders.playerId, players.id))
              .leftJoin(
                teamMembers,
                eq(eventCarpoolRiders.memberId, teamMembers.id)
              )
              .where(inArray(eventCarpoolRiders.carpoolId, chunk))
              .all()
          )
        )
      : [];
  const allRiders = riderChunkResults.flat();

  const ridersByCarpoolId = new Map<string, typeof allRiders>();
  for (const r of allRiders) {
    if (!r.carpoolId) continue;
    const list = ridersByCarpoolId.get(r.carpoolId) || [];
    list.push(r);
    ridersByCarpoolId.set(r.carpoolId, list);
  }

  const carpoolsByEventId = new Map<string, typeof allCarpools>();
  for (const car of allCarpools) {
    if (!car.eventId) continue;
    const list = carpoolsByEventId.get(car.eventId) || [];
    list.push(car);
    carpoolsByEventId.set(car.eventId, list);
  }

  const syncByEventId = new Map<string, LiffMatchScheduleSyncInfo>();
  for (const [evId, targetEvent] of targetEventMap.entries()) {
    const carpoolsList = carpoolsByEventId.get(evId) || [];
    const cars: LiffMatchScheduleCarpoolCar[] = carpoolsList.map(
      (car, index) => {
        const riders = ridersByCarpoolId.get(car.id) || [];
        const passengers = riders.map((r) => {
          if (r.riderPlayerName) {
            return {
              name: `${r.riderPlayerName} (選手)`,
              type: "player" as const,
            };
          }
          return {
            name: `${r.riderMemberName || "メンバー"} (${
              r.riderMemberType === "staff" ? "指導者" : "保護者"
            })`,
            type: "adult" as const,
          };
        });

        return {
          carNumber: index + 1,
          driverName: car.driverName || "ドライバー",
          carModel: car.carName
            ? `${car.carName}${car.carColor ? ` (${car.carColor})` : ""}`
            : "登録車",
          plate: car.numberPlate || "未登録",
          capacity: car.capacity || 4,
          isCargo: car.carType === "cargo",
          passengers,
        };
      }
    );

    const gatherTimeRaw = resolveEventDisplayStartTime(
      targetEvent.startAt,
      matchedDateKeyByEventId.get(evId)
    );
    syncByEventId.set(evId, {
      eventId: targetEvent.id,
      title: targetEvent.title,
      dutyGroup: targetEvent.dutyGroup || null,
      needsLunch: toBoolean(targetEvent.needsLunch, false),
      needsSnack: toBoolean(targetEvent.needsSnack, false),
      gatherTime: gatherTimeRaw ? `${gatherTimeRaw}頃` : null,
      gatherLocation: targetEvent.location || null,
      destination: targetEvent.location || null,
      cars,
    });
  }

  for (const [matchId, evId] of eventIdByMatchId.entries()) {
    const sync = syncByEventId.get(evId);
    if (sync) {
      result.set(matchId, sync);
    }
  }

  return result;
}

/**
 * デモチーム（体験用サンプルデータ）
 */
const DEMO_TEAM_LOGO_URL = "/demo-team-logo.svg";

const DEMO_TEAM = {
  id: "demo-team",
  name: "iScore ドリームス (体験デモ)",
  orgName: "iScore ドリームス",
  teamName: "体験デモチーム",
  shortName: "ドリームス",
  scoreTeamNameMode: "organization" as const,
  practiceMatchLabel: DEFAULT_PRACTICE_MATCH_LABEL,
  managerName: "山田 監督",
  homeGround: "多摩川緑地野球場 (1面)",
  logoImageUrl: DEMO_TEAM_LOGO_URL as string | undefined,
  coverImageUrl: undefined as string | undefined,
  year: 2026,
  isDemo: true,
};

const DEMO_NEXT_EVENT = {
  id: "demo-ev-1",
  title: "秋季大会 2回戦 vs レッドソックス",
  date: "8月30日(日)",
  time: "08:30 集合 (09:30 PB)",
  location: "多摩川緑地野球場 (1面)",
  eventType: "match",
  dutyGroup: "B班 (鍵・救急)",
  carInfo: "配車 4台 / 18名乗車",
  needsLunch: true,
  attendCount: { present: 26, absent: 4, pending: 2 },
  groupAttendCount: DEMO_GROUP_ATTEND_COUNT_LIST[0],
};

const DEMO_MATCHES = [
  {
    id: "demo-match-1",
    opponent: "横浜ベイブルース",
    tournamentName: "川崎市秋季大会 1回戦",
    date: "2026/08/23",
    status: "finished",
    myScore: 7,
    opponentScore: 4,
    youtubeUrl: "https://www.youtube.com/watch?v=qkRUcYHJ1JI", // 2023 WBC 決勝 日本代表 優勝ハイライト (MLB公式)
    matchType: "official",
    battingOrder: "first" as const,
    venueName: "市民第2球場",
    venueShortName: "市民第2",
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 1, 0],
    hasLineup: true,
    hasScorebook: true,
    matchDayOps: {
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["小西 父", "中島 父"], note: "球審・塁審（当日割振）" },
        { roleKey: "scorer", roleLabel: "スコアラー", assignees: ["佐藤 ママ"], note: "公式本部席" },
        { roleKey: "bso_board", roleLabel: "BSO・得点板", assignees: ["高橋 父"] },
        { roleKey: "line_live", roleLabel: "LINE速報", assignees: ["鈴木 パパ"] },
        { roleKey: "video_camera", roleLabel: "動画撮影", assignees: ["山本 父"], note: "バックネット裏" },
      ],
    },
  },
  {
    id: "demo-match-2",
    opponent: "ブルーサンダース",
    tournamentName: "練習試合",
    date: "2026/08/09",
    status: "finished",
    myScore: 4,
    opponentScore: 5,
    youtubeUrl: "https://www.youtube.com/watch?v=L25-Iw6kJ7w", // 2023 WBC 優勝決定 最終イニング 大谷vsトラウト (MLB公式)
    matchType: "practice",
    battingOrder: "second" as const,
    venueName: "等々力球場",
    venueShortName: "等々力",
    innings: 7,
    myInningScores: [0, 1, 0, 2, 0, 1, 0],
    opponentInningScores: [1, 0, 2, 0, 1, 1, 0],
    hasLineup: true,
    hasScorebook: true,
    matchDayOps: null,
  },
  {
    id: "demo-match-3",
    opponent: "レッドソックス",
    tournamentName: "秋季大会 2回戦",
    date: "2026/11/08 09:30",
    status: "scheduled",
    myScore: 0,
    opponentScore: 0,
    youtubeUrl: null,
    matchType: "official",
    battingOrder: "first" as const,
    venueName: "多摩川緑地野球場 (1面)",
    venueShortName: "多摩川緑地",
    venueParkingInfo: "河川敷駐車場利用（可能な限り乗り合い必須）",
    innings: 7,
    myInningScores: [],
    opponentInningScores: [],
    hasLineup: false,
    hasScorebook: false,
    matchDayOps: {
      gatherTime: "07:45 集合 / 08:00 出発",
      gatherPlace: "桜本小学校 正門前（乗り合い出発）",
      uniform: "公式戦ユニフォーム",
      meal: "lunch_and_snack",
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["田中 パパ", "小西 父", "中島 父"], note: "審判服着用（球審・塁審は当日決定）" },
        { roleKey: "scorer", roleLabel: "スコアラー", assignees: ["佐藤 ママ"], note: "公式本部席" },
        { roleKey: "bso_board", roleLabel: "BSO・得点板", assignees: ["高橋 父"], note: "ベンチ横カウント操作" },
        { roleKey: "line_live", roleLabel: "LINE速報", assignees: ["鈴木 パパ"], note: "グループLINE実況" },
        { roleKey: "buzzer", roleLabel: "ブザー", assignees: ["山田 母"], note: "放送室ブザー操作" },
        { roleKey: "video_camera", roleLabel: "動画撮影", assignees: ["山本 父"], note: "バックネット裏三脚" },
      ],
    },
    scheduleSync: DEMO_SCHEDULED_MATCH_CARPOOL_SYNC,
  },
];

/**
 * LIFF設定情報（LIFF ID）の取得
 */
app.get("/config", (c) => {
  const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";
  const miniAppUrl =
    c.env.NEXT_PUBLIC_LINE_MINIAPP_URL || c.env.LINE_MINIAPP_URL || "";
  return c.json({
    success: true,
    liffId,
    miniAppUrl,
  });
});

/**
 * ユーザーの所属チームおよび参加申請ステータス取得API
 */
app.get("/my-status", async (c) => {
  await ensureAllSchemasOnce(c.env.DB);
  const db = drizzle(c.env.DB);
  const userId = c.req.query("userId");

  try {
    const access = await resolveCallerTeamAccess(c, [userId]);
    const candidateIds = access.candidateUserIds;
    if (candidateIds.length === 0) {
      return c.json({
        success: true,
        activeTeams: [],
        pendingTeams: [],
        isDemo: true,
      });
    }

    const [memberships, allTeamsRows] = await Promise.all([
      db
        .select({
          memberId: teamMembers.id,
          teamId: teamMembers.teamId,
          role: teamMembers.role,
          status: teamMembers.status,
          teamName: teams.name,
          managerName: teams.managerName,
          orgName: organizations.name,
          logoImageUrl: organizations.logoImageUrl,
        })
        .from(teamMembers)
        .leftJoin(teams, eq(teamMembers.teamId, teams.id))
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(inArray(teamMembers.userId, candidateIds))
        .all(),
      access.isSystemAdmin || access.activeTeamIds.size > 0
        ? db
            .select({
              id: teams.id,
              name: teams.name,
              orgName: organizations.name,
              logoImageUrl: organizations.logoImageUrl,
              coverImageUrl: organizations.coverImageUrl,
            })
            .from(teams)
            .leftJoin(organizations, eq(teams.organizationId, organizations.id))
            .all()
        : Promise.resolve([]),
    ]);

    const roleByTeamId = new Map<string, string>();
    for (const m of memberships) {
      if (m.status === "active" && m.teamId) {
        roleByTeamId.set(m.teamId, m.role);
      }
    }

    const activeTeams = allTeamsRows
      .filter((t) => access.isSystemAdmin || access.activeTeamIds.has(t.id))
      .map((t) => ({
        id: t.id,
        name:
          t.orgName && t.orgName !== t.name
            ? `${t.orgName} ${t.name || "チーム"}`.trim()
            : t.name || t.orgName || "チーム",
        orgName: t.orgName || t.name || "チーム",
        teamName: t.name || "チーム",
        shortName: t.name || "チーム",
        logoImageUrl: t.logoImageUrl || undefined,
        coverImageUrl: t.coverImageUrl || undefined,
        role: roleByTeamId.get(t.id) || (access.canManageTeamId(t.id) ? "admin" : "member"),
      }));

    const pendingTeams = memberships
      .filter(
        (m) =>
          m.status === "pending" &&
          m.teamId &&
          !access.activeTeamIds.has(m.teamId)
      )
      .map((m) => ({
        id: m.teamId,
        name:
          m.orgName && m.orgName !== m.teamName
            ? `${m.orgName} ${m.teamName || "チーム"}`.trim()
            : m.teamName || m.orgName || "チーム",
        orgName: m.orgName || m.teamName || "チーム",
        teamName: m.teamName || "チーム",
        shortName: m.teamName || "チーム",
        logoImageUrl: m.logoImageUrl || undefined,
      }));

    return c.json({
      success: true,
      activeTeams,
      pendingTeams,
      isDemo: activeTeams.length === 0,
    });
  } catch (error: unknown) {
    console.error("Failed to load user my-status:", error);
    return c.json({
      success: false,
      activeTeams: [],
      pendingTeams: [],
      isDemo: true,
    });
  }
});

/**
 * チーム参加申請API (招待コードまたはチームIDでの申請)
 */
app.post("/join", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      inviteCode?: string;
      userId?: string;
      userName?: string;
      memberType?: string;
      phone?: string;
    };
    const {
      teamId,
      inviteCode,
      userId: bodyUserId,
      userName,
      memberType = "parent",
      phone,
    } = body;

    const access = await resolveCallerTeamAccess(c, [bodyUserId]);
    const effectiveUserId =
      (typeof bodyUserId === "string" && bodyUserId.trim()) ||
      extractHeaderUserId(c) ||
      access.sessionUser?.id ||
      "";
    const effectiveUserName =
      (typeof userName === "string" && userName.trim()) ||
      extractHeaderUserName(c) ||
      access.sessionUser?.name ||
      "";

    const code = (inviteCode || teamId || "").trim();

    // 1. デモモード・デモコードの即時判定
    if (
      code.toUpperCase() === "DEMO2026" ||
      code.toLowerCase() === "demo" ||
      code === "demo-team" ||
      teamId === "demo-team"
    ) {
      return c.json({
        success: true,
        message: "チーム参加申請を受け付けました！管理者の承認をお待ちください。（デモ）",
        status: "pending",
        teamId: "demo-team",
        teamName: DEMO_TEAM.name,
        logoImageUrl: DEMO_TEAM.logoImageUrl,
      });
    }

    if (code.length < 6) {
      return c.json(
        {
          success: false,
          error: "正しいチーム招待コード（8文字以上）を入力してください。",
        },
        400
      );
    }

    // 2. チーム特定ロジック（招待コード＝チームID完全一致、または8文字以上のUUID一意前方一致のみ許可）
    let targetTeam:
      | {
          id: string;
          name: string;
          orgName: string | null;
          logoImageUrl: string | null;
        }
      | undefined = undefined;

    // ① ID完全一致
    targetTeam = await db
      .select({
        id: teams.id,
        name: teams.name,
        orgName: organizations.name,
        logoImageUrl: organizations.logoImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, code))
      .get();

    // ② 8文字以上のUUIDコードかつ1チームに一意特定できる場合のみ前方一致を許可（チーム名部分一致やDB先頭フォールバックは厳禁）
    if (!targetTeam && code.length >= 8 && /^[0-9a-f-]+$/i.test(code)) {
      const prefixMatches = await db
        .select({
          id: teams.id,
          name: teams.name,
          orgName: organizations.name,
          logoImageUrl: organizations.logoImageUrl,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(sql`lower(${teams.id}) LIKE lower(${code + "%"})`)
        .limit(2)
        .all();
      if (prefixMatches.length === 1) {
        targetTeam = prefixMatches[0];
      }
    }

    if (!targetTeam) {
      return c.json(
        {
          success: false,
          error: "指定されたチームが見つかりませんでした。招待コードをご確認ください。",
        },
        404
      );
    }

    const targetTeamId = targetTeam.id;
    const targetDisplayName =
      targetTeam.orgName && targetTeam.orgName !== targetTeam.name
        ? `${targetTeam.orgName} ${targetTeam.name}`.trim()
        : targetTeam.orgName || targetTeam.name;
    const targetLogoImageUrl = targetTeam.logoImageUrl || undefined;

    // 3. ユーザーの整合性チェック (外部キー制約違反を防止)
    let validUserId: string | null = null;
    if (
      effectiveUserId &&
      !IGNORED_MOCK_USER_IDS.has(effectiveUserId)
    ) {
      try {
        const userExists = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, effectiveUserId))
          .get();
        if (userExists) {
          validUserId = userExists.id;
        } else {
          await db.insert(user).values({
            id: effectiveUserId,
            name: effectiveUserName || "LINEユーザー",
            email: `${effectiveUserId}@line.user`,
            emailVerified: false,
            role: "GUEST",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          validUserId = effectiveUserId;
        }
      } catch {
        validUserId = null;
      }
    }

    // 4. 確定済みアカウントID（userId / account テーブル）に基づく重複・所属チェック
    // ⚠️ 入力された表示名や電話番号だけで未承認ユーザーを即時 active 昇格させることは絶対にしない
    const joinCandidateIds = await expandCandidateUserIds(db, [
      validUserId,
      effectiveUserId,
      access.sessionUser?.id,
    ]);

    if (access.canAccessTeam(targetTeamId)) {
      return c.json({
        success: true,
        message: "すでにこのチームの承認済みメンバーとして登録されています",
        status: "active",
        teamId: targetTeamId,
        teamName: targetDisplayName,
        logoImageUrl: targetLogoImageUrl,
      });
    }

    let existingByAccount: typeof teamMembers.$inferSelect | undefined;
    if (joinCandidateIds.length > 0) {
      existingByAccount = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, targetTeamId),
            inArray(teamMembers.userId, joinCandidateIds)
          )
        )
        .get();
    }

    if (existingByAccount) {
      if (existingByAccount.status === "active") {
        return c.json({
          success: true,
          message: "すでにこのチームのメンバーとして登録されています",
          status: "active",
          teamId: targetTeamId,
          teamName: targetDisplayName,
          logoImageUrl: targetLogoImageUrl,
        });
      }
      return c.json({
        success: true,
        message: `「${targetDisplayName}」への参加申請は送信済みです。管理者の承認をお待ちください。`,
        status: "pending",
        teamId: targetTeamId,
        teamName: targetDisplayName,
        logoImageUrl: targetLogoImageUrl,
      });
    }

    // 同一名の未承認申請（pending）が既にある場合は重複レコード作成を防ぐ
    if (effectiveUserName) {
      const pendingSameName = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, targetTeamId),
            eq(teamMembers.status, "pending"),
            eq(teamMembers.name, effectiveUserName)
          )
        )
        .get();

      if (pendingSameName) {
        if (validUserId && !pendingSameName.userId) {
          await db
            .update(teamMembers)
            .set({ userId: validUserId })
            .where(eq(teamMembers.id, pendingSameName.id));
        }
        return c.json({
          success: true,
          message: `「${targetDisplayName}」への参加申請は送信済みです。管理者の承認をお待ちください。`,
          status: "pending",
          teamId: targetTeamId,
          teamName: targetDisplayName,
          logoImageUrl: targetLogoImageUrl,
        });
      }
    }

    // 5. 参加申請の新規登録（必ず status: "pending" で登録し、チーム管理者の承認を必須化）
    const newMemberId = `tm_${crypto.randomUUID()}`;
    await db.insert(teamMembers).values({
      id: newMemberId,
      teamId: targetTeamId,
      userId: validUserId,
      name: effectiveUserName || "新規メンバー",
      memberType: memberType || "parent",
      phone: phone?.trim() || null,
      role: "pending",
      status: "pending",
      joinedAt: new Date(),
    });

    return c.json({
      success: true,
      message: `「${targetDisplayName}」への参加申請を受け付けました！管理者の承認をお待ちください。`,
      status: "pending",
      teamId: targetTeamId,
      teamName: targetDisplayName,
      logoImageUrl: targetLogoImageUrl,
    });
  } catch (error: unknown) {
    console.error("Failed to submit join request:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "参加申請の送信に失敗しました",
      },
      500
    );
  }
});

/**
 * チームHUB用総合データ取得API
 * 🛡️ 厳格なチーム分離:
 * - 未招待・未承認（`pending`）ユーザーには `DEMO_TEAM`（`demo-team`）のみを返却し、実在チーム名や実データは一切含めない。
 * - 承認済みメンバーには自身が所属するチーム（＋体験デモチーム）のみを返却する。
 */
app.get("/hub", async (c) => {
  await ensureEventColumns(c.env.DB);
  await ensureMatchLineupColumns(c.env.DB);
  await ensurePlayerProfileColumns(c.env.DB);
  await ensureStatusConfigColumn(c.env.DB);
  await ensureScheduleDefaultTimesColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  const requestedTeamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");

  try {
    const allTeamsPromise = db
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.name,
        managerName: teams.managerName,
        homeGround: teams.homeGround,
        year: teams.year,
        orgName: organizations.name,
        logoImageUrl: organizations.logoImageUrl,
        coverImageUrl: organizations.coverImageUrl,
        scorebookSymbolRules: teams.scorebookSymbolRules,
        attendanceStatusConfig: teams.attendanceStatusConfig,
        scheduleDefaultTimes: teams.scheduleDefaultTimes,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .orderBy(desc(teams.createdAt))
      .all();

    const [access, allTeams] = await Promise.all([
      resolveCallerTeamAccess(c, [userId]),
      allTeamsPromise,
    ]);

    const sessionUser = access.sessionUser;
    const candidateIdsArray = access.candidateUserIds;
    const cleanName = (
      userName ||
      access.headerUserName ||
      sessionUser?.name ||
      ""
    ).trim();

    // 確定済みの承認済み所属チームIDセット（表示名一致や未承認レコードは一切含めない）
    const userTeamIds = access.isSystemAdmin
      ? new Set(allTeams.map((t) => t.id))
      : access.activeTeamIds;

    // チームリストの生成: 承認済みの所属チームのみを抽出し、未招待・承認待ちユーザーには実在チームを一切露出させない
    // ⚠️ 内部DBスキーマでは organizations.name (`orgName`) = チーム名、teams.name (`teamName`) = 構成名
    const authorizedRealTeams = allTeams.filter(
      (t) => access.isSystemAdmin || userTeamIds.has(t.id)
    );

    const teamList = [
      ...authorizedRealTeams.map((t) => ({
        id: t.id,
        name:
          t.orgName && t.orgName !== t.name
            ? `${t.orgName} ${t.name}`.trim()
            : t.name,
        orgName: t.orgName || t.name,
        teamName: t.name,
        shortName: t.shortName,
        logoImageUrl: t.logoImageUrl || undefined,
        coverImageUrl: t.coverImageUrl || undefined,
        scoreTeamNameMode: extractScoreTeamNameModeFromJson(
          t.scorebookSymbolRules
        ),
        practiceMatchLabel: extractPracticeMatchLabelFromJson(
          t.scorebookSymbolRules
        ),
        isDemo: false,
        isMember: true,
      })),
      DEMO_TEAM,
    ];

    const hubSessionUser = sessionUser?.id
      ? {
          userId: sessionUser.id,
          displayName: sessionUser.name || "メンバー",
          pictureUrl: sessionUser.image || undefined,
        }
      : null;

    // 本人アカウントで申請中（status = 'pending'）のチーム名・ロゴのみを取得（実データは一切含めない）
    const allTeamsById = new Map(allTeams.map((t) => [t.id, t]));
    const pendingTeams: Array<{
      id: string;
      name: string;
      orgName: string;
      teamName: string;
      shortName: string;
      logoImageUrl?: string;
    }> = [];

    if (candidateIdsArray.length > 0) {
      const pendingRows = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.status, "pending"),
            inArray(teamMembers.userId, candidateIdsArray)
          )
        )
        .all();

      const seenPendingIds = new Set<string>();
      for (const row of pendingRows) {
        const tid = row.teamId;
        if (!tid || userTeamIds.has(tid) || seenPendingIds.has(tid)) continue;
        const foundTeam = allTeamsById.get(tid);
        if (!foundTeam) continue;
        seenPendingIds.add(tid);
        pendingTeams.push({
          id: foundTeam.id,
          name:
            foundTeam.orgName && foundTeam.orgName !== foundTeam.name
              ? `${foundTeam.orgName} ${foundTeam.name}`.trim()
              : foundTeam.orgName || foundTeam.name,
          orgName: foundTeam.orgName || foundTeam.name,
          teamName: foundTeam.name,
          shortName: foundTeam.shortName,
          logoImageUrl: foundTeam.logoImageUrl || undefined,
        });
      }
    }

    const hubLiffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";
    const hubMiniAppUrl =
      c.env.NEXT_PUBLIC_LINE_MINIAPP_URL || c.env.LINE_MINIAPP_URL || "";

    // 🌟 0. 明示的に体験デモチームが要求された場合は即座にデモチームとして返却
    if (requestedTeamId === "demo-team") {
      return c.json({
        success: true,
        liffId: hubLiffId,
        miniAppUrl: hubMiniAppUrl,
        sessionUser: hubSessionUser,
        isDemo: true,
        team: DEMO_TEAM,
        teams: teamList,
        pendingTeams,
        nextEvent: DEMO_NEXT_EVENT,
        attendanceStatusConfig: normalizeGroupStatusSummaryConfig(null),
        scheduleDefaultTimes: DEFAULT_TEAM_SCHEDULE_TIMES,
        matches: DEMO_MATCHES,
      });
    }

    let targetTeam: (typeof allTeams)[number] | null = null;

    // 1. リクエストされた teamId がある場合でも、必ず所属権限があるチーム（authorizedRealTeams）からのみ選択する
    if (requestedTeamId) {
      targetTeam =
        authorizedRealTeams.find((t) => t.id === requestedTeamId) || null;
    }

    // 2. 指定がない（または権限外の旧キャッシュIDだった）場合で承認済み所属チームがある場合は先頭の所属チームを選択
    if (!targetTeam && authorizedRealTeams.length > 0) {
      targetTeam = authorizedRealTeams[0];
    }

    // 3. 所属チームが 0 件の未招待・承認待ちユーザーは、絶対に DB の他チームへフォールバックせず DEMO_TEAM を返却
    if (!targetTeam) {
      return c.json({
        success: true,
        liffId: hubLiffId,
        miniAppUrl: hubMiniAppUrl,
        sessionUser: hubSessionUser,
        isDemo: true,
        team: DEMO_TEAM,
        teams: teamList,
        pendingTeams,
        nextEvent: DEMO_NEXT_EVENT,
        attendanceStatusConfig: normalizeGroupStatusSummaryConfig(null),
        scheduleDefaultTimes: DEFAULT_TEAM_SCHEDULE_TIMES,
        matches: DEMO_MATCHES,
      });
    }

    const teamId = targetTeam.id;
    const fullTeamName =
      targetTeam.orgName && targetTeam.orgName !== targetTeam.name
        ? `${targetTeam.orgName} ${targetTeam.name}`.trim()
        : targetTeam.name;

    // ⚡ 単一テーブル5クエリを db.batch()、JOIN を含む直近10試合取得を .all()（D1 batch の同名カラム衝突による列ずれを完全排除）で完全並列実行
    const [
      [allEventsList, teamMemberList, teamPlayerRows, teamRelationsRows, teamVenues],
      matchesList,
    ] = await Promise.all([
      db.batch([
        db
          .select()
          .from(events)
          .where(eq(events.teamId, teamId))
          .orderBy(asc(events.startAt)),
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
            id: players.id,
            name: players.name,
            userId: players.userId,
            isActive: players.isActive,
            conditionStatus: players.conditionStatus,
          })
          .from(players)
          .where(eq(players.teamId, teamId)),
        db
          .select({
            parentId: parentChildRelations.parentId,
            childId: parentChildRelations.childId,
          })
          .from(parentChildRelations)
          .where(eq(parentChildRelations.teamId, teamId)),
        db.select({ name: venues.name, shortName: venues.shortName }).from(venues),
      ]),
      db
        .select({
          id: matches.id,
          opponent: matches.opponent,
          date: matches.date,
          status: matches.status,
          myScore: matches.myScore,
          opponentScore: matches.opponentScore,
          youtubeUrl: matches.youtubeUrl,
          matchType: matches.matchType,
          tournamentName: tournaments.name,
          tournamentId: matches.tournamentId,
          venueName: venues.name,
          venueShortName: venues.shortName,
          venueParkingInfo: venues.parkingInfo,
          surfaceDetails: matches.surfaceDetails,
          battingOrder: matches.battingOrder,
          innings: matches.innings,
          myInningScores: matches.myInningScores,
          opponentInningScores: matches.opponentInningScores,
          myHits: matches.myHits,
          opponentHits: matches.opponentHits,
          myErrors: matches.myErrors,
          opponentErrors: matches.opponentErrors,
          myLineup: matches.myLineup,
          matchDayOps: matches.matchDayOps,
        })
        .from(matches)
        .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
        .leftJoin(venues, eq(matches.venueId, venues.id))
        .where(eq(matches.teamId, teamId))
        .orderBy(desc(sql`replace(${matches.date}, '/', '-')`), desc(matches.createdAt))
        .limit(10)
        .all(),
    ]);

    // ログインユーザーの memberId をメモリ上で即時解決
    const userAttendances: Record<string, string> = {};
    let currentMemberId: string | null = null;
    const hubCandidateSet = new Set(candidateIdsArray);

    if (candidateIdsArray.length > 0) {
      const matchedMembers = teamMemberList.filter((m) => m.userId && hubCandidateSet.has(m.userId));
      const canonical = matchedMembers.find((m) => !m.id.startsWith("tm_")) || matchedMembers[0];
      if (canonical) currentMemberId = canonical.id;
    }

    if (!currentMemberId && cleanName) {
      const matched = findMatchingAdultMemberByName(teamMemberList, [cleanName]);
      if (matched) currentMemberId = matched.id;
    }

    const hubEventIds = allEventsList.map((ev) => ev.id);
    const hubAttChunks: string[][] = [];
    for (let i = 0; i < hubEventIds.length; i += 80) {
      hubAttChunks.push(hubEventIds.slice(i, i + 80));
    }

    const hubMatchIds = matchesList.map((m) => m.id);

    // ⚡ 全イベント出欠一括取得・at_bats 存在確認・予定試合の配車連携・休部/故障期間マップを完全並列取得
    const [hubAttChunkResults, abRows, hubScheduleSyncMap, hubConditionPeriodsMap] = await Promise.all([
      Promise.all(
        hubAttChunks.map((chunk) =>
          db
            .select({
              eventId: attendances.eventId,
              status: attendances.status,
              userId: attendances.userId,
              memberId: attendances.memberId,
              playerId: attendances.playerId,
            })
            .from(attendances)
            .where(inArray(attendances.eventId, chunk))
            .all()
        )
      ),
      hubMatchIds.length > 0
        ? db
            .selectDistinct({ matchId: atBats.matchId })
            .from(atBats)
            .where(inArray(atBats.matchId, hubMatchIds))
            .all()
        : Promise.resolve([]),
      buildScheduledMatchCarpoolSyncMap(db, teamId, matchesList, allEventsList),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    const hubStatusConfig = normalizeGroupStatusSummaryConfig(targetTeam.attendanceStatusConfig);
    const hubTeamScheduleDefaults = normalizeTeamScheduleDefaultTimes(targetTeam.scheduleDefaultTimes);
    const hubTodayKey = getTodayJstDateKey();
    const hubRosterPlayerInputs = teamPlayerRows.map((p) => ({
      ...p,
      conditionPeriods: hubConditionPeriodsMap.get(p.id) || [],
    }));
    const hubRostersByDateCache = new Map<string, ClassifiedTeamAttendanceRosters>();
    const getHubRostersForDate = (dateKey: string): ClassifiedTeamAttendanceRosters => {
      const cacheKey = hubConditionPeriodsMap.size > 0 ? dateKey : "__default__";
      const cached = hubRostersByDateCache.get(cacheKey);
      if (cached) return cached;
      const computed = classifyTeamAttendanceRosters({
        players: hubRosterPlayerInputs,
        teamMembers: teamMemberList,
        relations: teamRelationsRows,
        dateKey,
        todayKey: hubTodayKey,
      });
      hubRostersByDateCache.set(cacheKey, computed);
      return computed;
    };

    const hubAttendancesByEvent = new Map<
      string,
      Array<{
        status: string | null;
        userId: string | null;
        memberId: string | null;
        playerId: string | null;
      }>
    >();

    for (const rows of hubAttChunkResults) {
      for (const a of rows) {
        if (!a.eventId) continue;
        let bucket = hubAttendancesByEvent.get(a.eventId);
        if (!bucket) {
          bucket = [];
          hubAttendancesByEvent.set(a.eventId, bucket);
        }
        bucket.push(a);

        if (
          a.status &&
          !a.playerId &&
          ((currentMemberId && a.memberId === currentMemberId) ||
            (a.userId && hubCandidateSet.has(a.userId)))
        ) {
          userAttendances[a.eventId] = a.status;
        }
      }
    }

    const hubScorebookIds = new Set<string>();
    for (const ab of abRows) {
      if (ab.matchId) hubScorebookIds.add(ab.matchId);
    }

    const venueMap = new Map<string, string>();
    for (const v of teamVenues) {
      if (v.name && v.shortName && v.shortName.trim()) {
        venueMap.set(v.name.trim(), v.shortName.trim());
      }
    }

    const extractTime = (val: any) => {
      if (!val) return null;
      if (typeof val === "string") {
        const match = val.match(/T?(\d{2}):(\d{2})/);
        if (match) return `${match[1]}:${match[2]}`;
      }
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      } catch {}
      return null;
    };

    const formattedEventsList = allEventsList.map((ev) => {
      const d = new Date(ev.startAt);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${day}`;

      const rawLocation = ev.location || targetTeam.homeGround || "グラウンド";
      const displayLocation = venueMap.get(rawLocation.trim()) || rawLocation;

      const rawPmLocation = ev.pmLocation ? ev.pmLocation.trim() : null;
      const displayPmLocation = rawPmLocation ? (venueMap.get(rawPmLocation) || rawPmLocation) : null;

      const hasPm = !!ev.pmStartAt || !!displayPmLocation;

      // 時間の安全抽出（UTC/JSTずれ防止）
      const startHHMM = extractRawTimeHHMM(ev.startAt) || hubTeamScheduleDefaults.amStart;
      const endHHMM = extractRawTimeHHMM(ev.endAt);
      const pmStartHHMM = extractRawTimeHHMM(ev.pmStartAt);
      const pmEndHHMM = extractRawTimeHHMM(ev.pmEndAt);

      const amTime = hasPm
        ? (endHHMM && (pmEndHHMM || (pmStartHHMM && endHHMM <= pmStartHHMM))
            ? `${startHHMM}〜${endHHMM}`
            : `${startHHMM}〜${hubTeamScheduleDefaults.amEnd}`)
        : (endHHMM ? `${startHHMM}〜${endHHMM}` : `${startHHMM}〜${hubTeamScheduleDefaults.amEnd}`);

      const pmTime = hasPm
        ? `${pmStartHHMM || hubTeamScheduleDefaults.summerPmStart}〜${pmEndHHMM || endHHMM || hubTeamScheduleDefaults.summerPmEnd}`
        : "";

      // 🚗 練習の場合は配車なし（試合または明示的な配車のみ）
      const isMatch = ev.eventType === "match" || ev.eventType === "camp";
      const carInfo = isMatch ? "配車調整中" : "";

      // 🎯 対象チーム・グループ（Aチーム/Bチーム/試合組/練習組/全体など）
      const extractedTarget = ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || null);
      const evAttRows = hubAttendancesByEvent.get(ev.id) || [];
      const groupAtt = computeEventGroupAttendance(getHubRostersForDate(dateStr), evAttRows);

      return {
        id: ev.id,
        title: ev.title,
        date: d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }),
        dateStr,
        startAt: ev.startAt,
        endAt: ev.endAt,
        pmStartAt: ev.pmStartAt,
        pmEndAt: ev.pmEndAt,
        amTime,
        pmTime,
        location: displayLocation,
        amLocation: displayLocation,
        pmLocation: displayPmLocation,
        hasPm,
        targetGroup: extractedTarget,
        eventType: ev.eventType || "practice",
        dutyGroup: ev.dutyGroup || undefined,
        carInfo,
        needsLunch: toBoolean(ev.needsLunch, hasPm || isMatch),
        needsSnack: toBoolean(ev.needsSnack, false),
        memo: ev.description || "",
        myStatus: (userAttendances[ev.id] as any) || "pending",
        attendCount: groupAtt.attendCount,
        groupAttendCount: groupAtt.groupAttendCount,
      };
    });

    const nextEvent = formattedEventsList[0] || null;

    const formattedMatches = matchesList.map(m => {
      let hasLineup = false;
      try {
        const parsed = typeof m.myLineup === "string" ? JSON.parse(m.myLineup) : m.myLineup;
        hasLineup = Array.isArray(parsed) && parsed.some((item: { playerId?: string }) => Boolean(item?.playerId));
      } catch {}
      const { myLineup: _omittedLineup, matchDayOps: rawMatchDayOps, ...rest } = m;
      return {
        ...rest,
        hasLineup,
        hasScorebook: hubScorebookIds.has(m.id),
        tournamentName: m.tournamentName || (m.tournamentId && !m.tournamentId.includes("-") ? m.tournamentId : null),
        myInningScores: typeof m.myInningScores === "string" ? JSON.parse(m.myInningScores || "[]") : (m.myInningScores || []),
        opponentInningScores: typeof m.opponentInningScores === "string" ? JSON.parse(m.opponentInningScores || "[]") : (m.opponentInningScores || []),
        matchDayOps: parseMatchDayOpsJson(rawMatchDayOps),
        scheduleSync: hubScheduleSyncMap.get(m.id) || null,
      };
    });

    return c.json({
      success: true,
      liffId: hubLiffId,
      miniAppUrl: hubMiniAppUrl,
      sessionUser: hubSessionUser,
      isDemo: false,
      team: {
        id: targetTeam.id,
        name: fullTeamName,
        orgName: targetTeam.orgName || targetTeam.name,
        teamName: targetTeam.name,
        shortName: targetTeam.name,
        scoreTeamNameMode: extractScoreTeamNameModeFromJson(
          targetTeam.scorebookSymbolRules
        ),
        practiceMatchLabel: extractPracticeMatchLabelFromJson(
          targetTeam.scorebookSymbolRules
        ),
        homeGround: targetTeam.homeGround || null,
        logoImageUrl: targetTeam.logoImageUrl || undefined,
        coverImageUrl: targetTeam.coverImageUrl || undefined,
      },
      teams: teamList,
      pendingTeams,
      nextEvent,
      events: formattedEventsList,
      attendanceStatusConfig: hubStatusConfig,
      scheduleDefaultTimes: hubTeamScheduleDefaults,
      matches: formattedMatches,
    });
  } catch (error: any) {
    console.error("Failed to load liff hub data:", error);
    return c.json({
      success: true,
      liffId: c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "",
      isDemo: true,
      team: DEMO_TEAM,
      teams: [DEMO_TEAM],
      nextEvent: DEMO_NEXT_EVENT,
      events: [
        {
          id: "demo-ev-1",
          title: "秋季大会 2回戦 vs レッドソックス",
          date: "8/29(土)",
          dateStr: "2026-08-29",
          time: "08:00〜12:00",
          location: "市民第1球場",
          eventType: "match",
          dutyGroup: "1班",
          carInfo: "鈴木号・佐藤号",
          needsLunch: false,
          needsSnack: true,
        },
        {
          id: "demo-ev-2",
          title: "全日通常練習 & 守備連携・走塁強化",
          date: "8/30(日)",
          dateStr: "2026-08-30",
          time: "08:00〜18:00",
          location: "大師河原第3G",
          eventType: "practice",
          dutyGroup: "2班",
          carInfo: "配車調整中",
          needsLunch: true,
          needsSnack: false,
        },
      ],
      matches: DEMO_MATCHES,
    });
  }
});

/**
 * チームの試合一覧取得API (動画付き試合含む)
 */
app.get("/matches", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  let teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        matches: DEMO_MATCHES,
      });
    }

    const rawMatches = await db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        youtubeUrl: matches.youtubeUrl,
        matchType: matches.matchType,
        tournamentName: tournaments.name,
        tournamentId: matches.tournamentId,
        venueName: venues.name,
        venueShortName: venues.shortName,
        venueParkingInfo: venues.parkingInfo,
        surfaceDetails: matches.surfaceDetails,
        battingOrder: matches.battingOrder,
        innings: matches.innings,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
        myHits: matches.myHits,
        opponentHits: matches.opponentHits,
        myErrors: matches.myErrors,
        opponentErrors: matches.opponentErrors,
        myLineup: matches.myLineup,
        matchDayOps: matches.matchDayOps,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(sql`replace(${matches.date}, '/', '-')`), desc(matches.createdAt))
      .all();

    const listScorebookIds = new Set<string>();
    const listMatchIds = rawMatches.map((m) => m.id);
    const chunks: string[][] = [];
    for (let i = 0; i < listMatchIds.length; i += 80) {
      chunks.push(listMatchIds.slice(i, i + 80));
    }
    const [chunkResults, listScheduleSyncMap] = await Promise.all([
      Promise.all(
        chunks.map((chunk) =>
          db
            .selectDistinct({ matchId: atBats.matchId })
            .from(atBats)
            .where(inArray(atBats.matchId, chunk))
            .all()
        )
      ),
      buildScheduledMatchCarpoolSyncMap(db, teamId, rawMatches),
    ]);
    for (const abRows of chunkResults) {
      for (const ab of abRows) {
        if (ab.matchId) listScorebookIds.add(ab.matchId);
      }
    }

    const formattedMatches = rawMatches.map((m) => {
      let myInnings: number[] = [];
      let opponentInnings: number[] = [];
      let hasLineup = false;

      try {
        if (typeof m.myInningScores === "string") {
          myInnings = JSON.parse(m.myInningScores);
        } else if (Array.isArray(m.myInningScores)) {
          myInnings = m.myInningScores;
        }
      } catch {}

      try {
        if (typeof m.opponentInningScores === "string") {
          opponentInnings = JSON.parse(m.opponentInningScores);
        } else if (Array.isArray(m.opponentInningScores)) {
          opponentInnings = m.opponentInningScores;
        }
      } catch {}

      try {
        const parsedLineup = typeof m.myLineup === "string" ? JSON.parse(m.myLineup) : m.myLineup;
        hasLineup = Array.isArray(parsedLineup) && parsedLineup.some((item: { playerId?: string }) => Boolean(item?.playerId));
      } catch {}

      const { myLineup: _omittedLineup, matchDayOps: rawMatchDayOps, ...rest } = m;

      return {
        ...rest,
        hasLineup,
        hasScorebook: listScorebookIds.has(m.id),
        tournamentName: m.tournamentName || (m.tournamentId && !m.tournamentId.includes("-") ? m.tournamentId : null),
        myInningScores: myInnings,
        opponentInningScores: opponentInnings,
        matchDayOps: parseMatchDayOpsJson(rawMatchDayOps),
        scheduleSync: listScheduleSyncMap.get(m.id) || null,
      };
    });

    return c.json({
      success: true,
      isDemo: false,
      matches: formattedMatches,
    });
  } catch (error: any) {
    console.error("Failed to load liff matches:", error);
    return c.json({ success: false, matches: [] });
  }
});

/**
 * チームの予定・スケジュール一覧取得API (出欠回答状況つき)
 */
app.get("/schedule", async (c) => {
  await ensureEventColumns(c.env.DB);
  await ensurePlayerProfileColumns(c.env.DB);
  await ensureStatusConfigColumn(c.env.DB);
  await ensureScheduleDefaultTimesColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        attendanceStatusConfig: normalizeGroupStatusSummaryConfig(null),
        scheduleDefaultTimes: DEFAULT_TEAM_SCHEDULE_TIMES,
        events: [
          {
            id: "demo-ev-1",
            title: "秋季大会 2回戦 ＆ Bチーム合同練習",
            date: "8月30日(日)",
            dateStr: "2026-08-30",
            time: "08:00 集合",
            location: "多摩川緑地野球場 / 桜本小",
            eventType: "match",
            dutyGroup: "B班 (鍵・救急)",
            needsLunch: true,
            needsSnack: true,
            myStatus: "present",
            mySelectedGroupId: "demo-grp-1",
            activityGroups: [
              {
                id: "demo-grp-1",
                name: "Aチーム（試合組・遠征）",
                time: "08:00集合 (09:30 PB)",
                location: "多摩川緑地野球場 (1面)",
                eventType: "match",
                dutyGroup: "B班 (鍵・救急)",
                carInfo: "配車 3台 / 12名乗車",
              },
              {
                id: "demo-grp-2",
                name: "Bチーム（練習組・学校居残り）",
                time: "09:00 〜 12:00",
                location: "桜本小学校 グラウンド",
                eventType: "practice",
                dutyGroup: "C班 (用具整備)",
                carInfo: "現地集合・送迎不要",
              },
            ],
            groupCounts: {
              "demo-grp-1": 10,
              "demo-grp-2": 6,
            },
            attendCount: { present: 26, absent: 4, pending: 2 },
            groupAttendCount: DEMO_GROUP_ATTEND_COUNT_LIST[0],
          },
          {
            id: "demo-ev-2",
            title: "全日 強化守備・走塁練習",
            date: "9月5日(土)",
            dateStr: "2026-09-05",
            time: "08:00〜12:00 / 12:00〜18:00",
            location: "桜本小学校 グラウンド",
            eventType: "practice",
            dutyGroup: "C班 (グラウンド整備)",
            needsLunch: true,
            needsSnack: false,
            myStatus: "pending",
            attendCount: { present: 20, absent: 5, pending: 7 },
            groupAttendCount: DEMO_GROUP_ATTEND_COUNT_LIST[1],
          },
          {
            id: "demo-ev-3",
            title: "練習試合 vs グリーンライオンズ (ダブルヘッダー)",
            date: "9月6日(日)",
            dateStr: "2026-09-06",
            time: "08:00 集合 (第1試合 09:00 / 第2試合 11:30)",
            location: "等々力球場",
            eventType: "match",
            dutyGroup: "A班 (審判割当・配車)",
            needsLunch: true,
            needsSnack: false,
            myStatus: "pending",
            attendCount: { present: 19, absent: 2, pending: 11 },
            groupAttendCount: DEMO_GROUP_ATTEND_COUNT_LIST[2],
          },
        ],
      });
    }

    // ⚡ イベント一覧・球場一覧・チームメンバー・選手・親子関係・チーム設定・セッションを単一バッチ並列取得
    const cookieHeader = c.req.header("cookie") || "";
    const sessionPromise = cookieHeader.includes("better-auth")
      ? (async () => {
          try {
            const auth = getAuth(c.env.DB, c.env);
            const session = await auth.api
              .getSession({ headers: c.req.raw.headers as unknown as Headers })
              .catch(() => null);
            return session?.user ?? null;
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null);

    const [
      [
        eventList,
        teamVenues,
        teamMemberList,
        teamPlayerRows,
        teamRelationsRows,
        teamConfigRows,
      ],
      sessionUser,
    ] = await Promise.all([
      db.batch([
        db
          .select()
          .from(events)
          .where(eq(events.teamId, teamId))
          .orderBy(asc(events.startAt)),
        db.select({ name: venues.name, shortName: venues.shortName }).from(venues),
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
            id: players.id,
            name: players.name,
            userId: players.userId,
            isActive: players.isActive,
            conditionStatus: players.conditionStatus,
          })
          .from(players)
          .where(eq(players.teamId, teamId)),
        db
          .select({
            parentId: parentChildRelations.parentId,
            childId: parentChildRelations.childId,
          })
          .from(parentChildRelations)
          .where(eq(parentChildRelations.teamId, teamId)),
        db
          .select({
            attendanceStatusConfig: teams.attendanceStatusConfig,
            scheduleDefaultTimes: teams.scheduleDefaultTimes,
          })
          .from(teams)
          .where(eq(teams.id, teamId))
          .limit(1),
      ]),
      sessionPromise,
    ]);

    const teamConfigRow = teamConfigRows[0];
    const schedStatusConfig = normalizeGroupStatusSummaryConfig(
      teamConfigRow?.attendanceStatusConfig
    );
    const schedDefaultTimes = normalizeTeamScheduleDefaultTimes(
      teamConfigRow?.scheduleDefaultTimes
    );

    const authUserId = sessionUser?.id;
    const authUserName = sessionUser?.name || undefined;

    // ⚡ account連携展開・全イベント出欠一括取得・休部/故障期間マップを並列実行（N+1クエリ完全排除）
    const eventIds = eventList.map((ev) => ev.id);
    const attendanceChunks: string[][] = [];
    for (let i = 0; i < eventIds.length; i += 80) {
      attendanceChunks.push(eventIds.slice(i, i + 80));
    }

    const [schedCandidateIds, attChunkResults, schedConditionPeriodsMap] = await Promise.all([
      expandCandidateUserIds(db, [userId, authUserId]),
      Promise.all(
        attendanceChunks.map((chunk) =>
          db
            .select({
              eventId: attendances.eventId,
              status: attendances.status,
              userId: attendances.userId,
              memberId: attendances.memberId,
              playerId: attendances.playerId,
              selectedGroupId: attendances.selectedGroupId,
            })
            .from(attendances)
            .where(inArray(attendances.eventId, chunk))
            .all()
        )
      ),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    const schedTodayKey = getTodayJstDateKey();
    const schedRosterPlayerInputs = teamPlayerRows.map((p) => ({
      ...p,
      conditionPeriods: schedConditionPeriodsMap.get(p.id) || [],
    }));
    const schedRostersByDateCache = new Map<string, ClassifiedTeamAttendanceRosters>();
    const getSchedRostersForDate = (dateKey: string): ClassifiedTeamAttendanceRosters => {
      const cacheKey = schedConditionPeriodsMap.size > 0 ? dateKey : "__default__";
      const cached = schedRostersByDateCache.get(cacheKey);
      if (cached) return cached;
      const computed = classifyTeamAttendanceRosters({
        players: schedRosterPlayerInputs,
        teamMembers: teamMemberList,
        relations: teamRelationsRows,
        dateKey,
        todayKey: schedTodayKey,
      });
      schedRostersByDateCache.set(cacheKey, computed);
      return computed;
    };

    const attendancesByEventId = new Map<
      string,
      Array<{
        status: string | null;
        userId: string | null;
        memberId: string | null;
        playerId: string | null;
        selectedGroupId: string | null;
      }>
    >();
    for (const rows of attChunkResults) {
      for (const row of rows) {
        if (!row.eventId) continue;
        let bucket = attendancesByEventId.get(row.eventId);
        if (!bucket) {
          bucket = [];
          attendancesByEventId.set(row.eventId, bucket);
        }
        bucket.push(row);
      }
    }

    const schedMemberIdsSet = new Set<string>();
    const requestedMemberId = c.req.query("memberId");
    const schedCandidateSet = new Set(schedCandidateIds);

    if (schedCandidateIds.length > 0) {
      for (const m of teamMemberList) {
        if (m.userId && schedCandidateSet.has(m.userId)) {
          schedMemberIdsSet.add(m.id);
        }
      }
    }

    if (schedMemberIdsSet.size === 0 && requestedMemberId && !requestedMemberId.startsWith("demo-")) {
      const reqMember = teamMemberList.find((m) => m.id === requestedMemberId);
      if (reqMember && (!reqMember.userId || schedCandidateSet.has(reqMember.userId))) {
        schedMemberIdsSet.add(reqMember.id);
      }
    }

    if (schedMemberIdsSet.size === 0 && (userName || authUserName)) {
      const matched = findMatchingAdultMemberByName(teamMemberList, [userName, authUserName]);
      if (matched) schedMemberIdsSet.add(matched.id);
    }

    const venueMap = new Map<string, string>();
    for (const v of teamVenues) {
      if (v.name && v.shortName && v.shortName.trim()) {
        venueMap.set(v.name.trim(), v.shortName.trim());
      }
    }

    // 各イベントの出欠集計（メモリ上で O(N) 計算、DB クエリ 0 回）
    const formattedEvents = eventList.map((ev) => {
      const startDate = new Date(ev.startAt);
      const y = startDate.getUTCFullYear();
      const m = String(startDate.getUTCMonth() + 1).padStart(2, "0");
      const d = String(startDate.getUTCDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const wStr = ["日", "月", "火", "水", "木", "金", "土"][startDate.getUTCDay()];

      const attList = attendancesByEventId.get(ev.id) || [];
      const groupAtt = computeEventGroupAttendance(getSchedRostersForDate(dateStr), attList);

      let myStatus: string = "pending";
      let mySelectedGroupId: string | null = null;
      if (schedCandidateIds.length > 0 || schedMemberIdsSet.size > 0) {
        const myAtt = attList.find(
          (a) =>
            !a.playerId &&
            ((a.memberId && schedMemberIdsSet.has(a.memberId)) ||
              (a.userId && schedCandidateIds.includes(a.userId)))
        );
        if (myAtt?.status) {
          myStatus = myAtt.status;
          mySelectedGroupId = myAtt.selectedGroupId || null;
        }
      }

      // 活動グループ（JSON）のパース
      let parsedGroups: Array<{
        id: string;
        name: string;
        time?: string;
        location?: string;
        eventType?: "match" | "practice" | "meeting" | "camp";
        dutyGroup?: string;
        carInfo?: string;
      }> = [];

      if (ev.activityGroups) {
        try {
          parsedGroups = typeof ev.activityGroups === "string" ? JSON.parse(ev.activityGroups) : ev.activityGroups;
        } catch {}
      }

      // グループ別出席集計の計算
      const groupCounts: Record<string, number> = {};
      for (const att of attList) {
        if (att.status === "present" || att.status === "late" || att.status === "partial") {
          const gid = att.selectedGroupId;
          if (gid) {
            groupCounts[gid] = (groupCounts[gid] || 0) + 1;
          }
        }
      }

      const isAmOff = ev.amType === "off";
      const hasAm = !isAmOff;
      const hasPm = !!ev.pmStartAt || !!ev.pmLocation;

      const startTimeStr = extractRawTimeHHMM(ev.startAt) || schedDefaultTimes.amStart;
      const rawEndStr = extractRawTimeHHMM(ev.endAt);
      const pmStartStr = extractRawTimeHHMM(ev.pmStartAt);
      const pmEndStr = extractRawTimeHHMM(ev.pmEndAt);

      const resolvedAmEndStr =
        hasPm && !pmEndStr && rawEndStr && pmStartStr && rawEndStr > pmStartStr
          ? schedDefaultTimes.amEnd
          : rawEndStr;

      const formattedAmTime = isAmOff
        ? ""
        : resolvedAmEndStr
        ? `${startTimeStr}〜${resolvedAmEndStr}`
        : `${startTimeStr} 集合`;

      let pmTime = "";
      if (hasPm && pmStartStr) {
        const effectivePmEnd = pmEndStr || rawEndStr || "";
        pmTime = effectivePmEnd ? `${pmStartStr}〜${effectivePmEnd}` : `${pmStartStr}〜`;
      }

      const rawLocation = ev.location || "グラウンド";
      const displayLocation = venueMap.get(rawLocation.trim()) || rawLocation;
      const rawPmLocation = ev.pmLocation || rawLocation;
      const displayPmLocation = venueMap.get(rawPmLocation.trim()) || rawPmLocation;

      const extractedTarget = ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || null);
      const isMatch = ev.eventType === "match" || ev.amType === "match";

      let overallTime = formattedAmTime;
      if (isAmOff && hasPm && pmTime) {
        overallTime = pmTime;
      } else if (hasAm && hasPm && pmTime) {
        overallTime = `${formattedAmTime} / ${pmTime}`;
      } else if (!overallTime) {
        overallTime = "時間調整中";
      }

      return {
        id: ev.id,
        title: ev.title,
        targetGroup: extractedTarget,
        date: `${Number(m)}/${Number(d)}(${wStr})`,
        dateStr,
        time: overallTime,
        startAt: ev.startAt,
        endAt: ev.endAt,
        pmStartAt: ev.pmStartAt,
        pmEndAt: ev.pmEndAt,
        location: isAmOff ? displayPmLocation : displayLocation,
        rawLocation,
        hasAm,
        amTime: formattedAmTime,
        amLocation: isAmOff ? "" : displayLocation,
        pmTime,
        pmLocation: displayPmLocation,
        hasPm,
        eventType: ev.eventType || "practice",
        amType: isAmOff ? "off" : (ev.amType || ev.eventType || "practice"),
        pmType: hasPm ? (ev.eventType || "practice") : "off",
        dutyGroup: ev.dutyGroup || undefined,
        needsLunch: toBoolean(ev.needsLunch, isMatch || hasPm),
        needsSnack: toBoolean(ev.needsSnack, false),
        memo: ev.description || "",
        carInfo: isMatch ? "7:30 集合・配車調整済" : undefined,
        activityGroups: parsedGroups.length > 0 ? parsedGroups : undefined,
        groupCounts,
        myStatus,
        mySelectedGroupId,
        attendCount: groupAtt.attendCount,
        groupAttendCount: groupAtt.groupAttendCount,
      };
    });

    return c.json({
      success: true,
      isDemo: false,
      attendanceStatusConfig: schedStatusConfig,
      scheduleDefaultTimes: schedDefaultTimes,
      events: formattedEvents,
    });
  } catch (error: any) {
    console.error("Failed to load liff schedule:", error);
    return c.json({ success: false, events: [] });
  }
});

/**
 * 📊 出欠マトリクス・一覧表取得API
 * GET /api/liff/attendance-matrix?teamId=xxx&userId=xxx&userName=xxx&month=YYYY-MM
 */
app.get("/attendance-matrix", async (c) => {
  await ensureEventColumns(c.env.DB);
  await ensureMemberOrderColumn(c.env.DB);
  await ensureStatusConfigColumn(c.env.DB);
  await ensureMemberSubLabelsColumn(c.env.DB);
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");
  const monthParam = c.req.query("month"); // e.g. "2026-10"

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        includesOnLeave: true,
        memberSubLabels: {
          "demo-p-1": "1班",
          "demo-p-2": "2班",
          "demo-p-3": "3班",
          "demo-p-4": "4班",
          "demo-p-5": "1班",
          "demo-p-6": "2班",
          "demo-mother-1": "1班",
          "demo-mother-2": "2班",
          "demo-mother-3": "3班",
          "demo-mother-4": "4班",
          "demo-mother-5": "1班",
          "demo-father-1": "1班",
          "demo-father-2": "2班",
          "demo-father-3": "3班",
          "demo-father-4": "1班",
        },
        myInfo: {
          memberId: "demo-mother-1",
          playerIds: ["demo-p-1"],
          isManager: true,
          name: "山田 (母)",
        },
        events: [
          {
            id: "demo-ev-1",
            title: "秋季大会 2回戦 vs ライオンズ",
            dateStr: "2026-10-11",
            date: "10/11",
            dayOfWeek: "日",
            dutyGroup: "1班",
            location: "多摩川緑地第1",
            eventType: "match",
            description: "8:30現地集合。お弁当・補食持参",
            statusSummary: { duty: 2, help: 5, setup: 2, game: 3, absent: 1, totalPresent: 12 },
          },
          {
            id: "demo-ev-2",
            title: "午前合同練習 ＆ 午後練習試合",
            dateStr: "2026-10-17",
            date: "10/17",
            dayOfWeek: "土",
            dutyGroup: "2班",
            location: "桜本小グラウンド",
            eventType: "practice",
            description: "雨天時は7時までにLINE連絡。車出し3台必要",
            statusSummary: { duty: 2, help: 6, setup: 1, game: 2, absent: 2, totalPresent: 11 },
          },
          {
            id: "demo-ev-3",
            title: "支部大会 準決勝",
            dateStr: "2026-10-18",
            date: "10/18",
            dayOfWeek: "日",
            dutyGroup: "3班",
            location: "等々力球場",
            eventType: "match",
            description: "白ユニフォーム着用。アナウンス当番あり",
            statusSummary: { duty: 2, help: 7, setup: 2, game: 1, absent: 1, totalPresent: 12 },
          },
          {
            id: "demo-ev-4",
            title: "全日 基礎強化練習",
            dateStr: "2026-10-24",
            date: "10/24",
            dayOfWeek: "土",
            dutyGroup: "4班",
            location: "桜本小グラウンド",
            eventType: "practice",
            description: "水分多めに用意してください",
            statusSummary: { duty: 2, help: 4, setup: 3, game: 1, absent: 3, totalPresent: 10 },
          },
          {
            id: "demo-ev-5",
            title: "練習試合 vs ブルースカイ",
            dateStr: "2026-10-25",
            date: "10/25",
            dayOfWeek: "日",
            dutyGroup: "1班",
            location: "市民第2球場",
            eventType: "match",
            statusSummary: { duty: 2, help: 6, setup: 1, game: 2, absent: 2, totalPresent: 11 },
          },
        ],
        groups: {
          players: [
            { id: "demo-p-1", name: "山田 翔太", uniformNumber: "1", subText: "#1", groupType: "player" },
            { id: "demo-p-2", name: "佐藤 陸", uniformNumber: "2", subText: "#2", groupType: "player" },
            { id: "demo-p-3", name: "鈴木 大地", uniformNumber: "3", subText: "#3", groupType: "player" },
            { id: "demo-p-4", name: "高橋 蓮", uniformNumber: "5", subText: "#5", groupType: "player" },
            { id: "demo-p-5", name: "田中 颯真", uniformNumber: "7", subText: "#7", groupType: "player" },
            { id: "demo-p-6", name: "渡辺 湊", uniformNumber: "10", subText: "#10", groupType: "player" },
          ],
          parents: [
            { id: "demo-mother-1", name: "山田 (母)", subText: "翔太の母 (1班)", groupType: "mother" },
            { id: "demo-mother-2", name: "佐藤 (母)", subText: "陸の母 (2班)", groupType: "mother" },
            { id: "demo-mother-3", name: "鈴木 (母)", subText: "大地の母 (3班)", groupType: "mother" },
            { id: "demo-mother-4", name: "高橋 (母)", subText: "蓮の母 (4班)", groupType: "mother" },
            { id: "demo-mother-5", name: "田中 (母)", subText: "颯真の母 (1班)", groupType: "mother" },
            { id: "demo-father-1", name: "山田 (父)", subText: "翔太の父 (審判)", groupType: "father" },
            { id: "demo-father-2", name: "佐藤 (父)", subText: "陸の父 (車出し)", groupType: "father" },
            { id: "demo-father-3", name: "鈴木 (父)", subText: "大地の父 (設営)", groupType: "father" },
            { id: "demo-father-4", name: "田中 (父)", subText: "颯真の父 (審判)", groupType: "father" },
          ],
          mothers: [
            { id: "demo-mother-1", name: "山田 (母)", subText: "翔太の母 (1班)", groupType: "mother" },
            { id: "demo-mother-2", name: "佐藤 (母)", subText: "陸の母 (2班)", groupType: "mother" },
            { id: "demo-mother-3", name: "鈴木 (母)", subText: "大地の母 (3班)", groupType: "mother" },
            { id: "demo-mother-4", name: "高橋 (母)", subText: "蓮の母 (4班)", groupType: "mother" },
            { id: "demo-mother-5", name: "田中 (母)", subText: "颯真の母 (1班)", groupType: "mother" },
          ],
          fathers: [
            { id: "demo-father-1", name: "山田 (父)", subText: "翔太の父 (審判)", groupType: "father" },
            { id: "demo-father-2", name: "佐藤 (父)", subText: "陸の父 (車出し)", groupType: "father" },
            { id: "demo-father-3", name: "鈴木 (父)", subText: "大地の父 (設営)", groupType: "father" },
            { id: "demo-father-4", name: "田中 (父)", subText: "颯真の父 (審判)", groupType: "father" },
          ],
          staff: [
            { id: "demo-staff-1", name: "中村 監督", subText: "監督", groupType: "staff" },
            { id: "demo-staff-2", name: "小林 コーチ", subText: "ヘッドコーチ", groupType: "staff" },
            { id: "demo-staff-3", name: "伊藤 コーチ", subText: "守備走塁コーチ", groupType: "staff" },
          ],
        },
        matrix: {
          "demo-ev-1": {
            "demo-p-1": { status: "game", comment: "" },
            "demo-p-2": { status: "game", comment: "" },
            "demo-p-3": { status: "game", comment: "" },
            "demo-p-4": { status: "absent", comment: "法事のため" },
            "demo-p-5": { status: "game", comment: "" },
            "demo-p-6": { status: "game", comment: "" },
            "demo-mother-1": { status: "duty", comment: "救急箱持参" },
            "demo-mother-2": { status: "help", comment: "午前のみ可" },
            "demo-mother-3": { status: "absent", comment: "" },
            "demo-mother-4": { status: "help", comment: "" },
            "demo-mother-5": { status: "duty", comment: "鍵当番" },
            "demo-father-1": { status: "setup", comment: "朝のグラウンド設営" },
            "demo-father-2": { status: "help", comment: "車出し配車3名可" },
            "demo-father-3": { status: "absent", comment: "仕事" },
            "demo-father-4": { status: "setup", comment: "撤収手伝い" },
            "demo-staff-1": { status: "duty", comment: "" },
            "demo-staff-2": { status: "duty", comment: "塁審対応可" },
            "demo-staff-3": { status: "help", comment: "" },
          },
          "demo-ev-2": {
            "demo-p-1": { status: "game", comment: "" },
            "demo-p-2": { status: "game", comment: "" },
            "demo-p-3": { status: "absent", comment: "学校行事" },
            "demo-p-4": { status: "game", comment: "" },
            "demo-p-5": { status: "game", comment: "" },
            "demo-p-6": { status: "game", comment: "" },
            "demo-mother-1": { status: "help", comment: "" },
            "demo-mother-2": { status: "duty", comment: "当番" },
            "demo-mother-3": { status: "help", comment: "" },
            "demo-mother-4": { status: "help", comment: "" },
            "demo-mother-5": { status: "absent", comment: "" },
            "demo-father-1": { status: "help", comment: "" },
            "demo-father-2": { status: "duty", comment: "配車当番" },
            "demo-father-3": { status: "setup", comment: "ネット設営のみ" },
            "demo-father-4": { status: "help", comment: "" },
            "demo-staff-1": { status: "duty", comment: "" },
            "demo-staff-2": { status: "help", comment: "" },
            "demo-staff-3": { status: "duty", comment: "" },
          },
          "demo-ev-3": {
            "demo-p-1": { status: "game", comment: "" },
            "demo-p-2": { status: "game", comment: "" },
            "demo-p-3": { status: "game", comment: "" },
            "demo-p-4": { status: "game", comment: "" },
            "demo-p-5": { status: "game", comment: "" },
            "demo-p-6": { status: "game", comment: "" },
            "demo-mother-1": { status: "help", comment: "" },
            "demo-mother-2": { status: "help", comment: "" },
            "demo-mother-3": { status: "duty", comment: "アナウンス担当" },
            "demo-mother-4": { status: "duty", comment: "スコアブック" },
            "demo-mother-5": { status: "help", comment: "" },
            "demo-father-1": { status: "help", comment: "審判" },
            "demo-father-2": { status: "setup", comment: "撤収のみ" },
            "demo-father-3": { status: "help", comment: "配車4名" },
            "demo-father-4": { status: "help", comment: "" },
            "demo-staff-1": { status: "duty", comment: "" },
            "demo-staff-2": { status: "duty", comment: "" },
            "demo-staff-3": { status: "duty", comment: "" },
          },
        },
      });
    }

    // ⚡ 1. セッション・チーム設定・メンバー・親子関係・選手・イベントの6クエリを完全並列取得
    const cookieHeader = c.req.header("cookie") || "";
    const sessionPromise = cookieHeader.includes("better-auth")
      ? (async () => {
          try {
            const auth = getAuth(c.env.DB, c.env);
            const session = await auth.api
              .getSession({ headers: c.req.raw.headers as unknown as Headers })
              .catch(() => null);
            return session?.user ?? null;
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null);

    const [
      sessionUser,
      [teamRows, allTeamMembersRaw, relations, allPlayersRaw, allEvents],
    ] = await Promise.all([
      sessionPromise,
      db.batch([
        db
          .select({
            createdBy: teams.createdBy,
            organizationId: teams.organizationId,
            memberSortOrder: teams.memberSortOrder,
            attendanceStatusConfig: teams.attendanceStatusConfig,
            memberSubLabels: teams.memberSubLabels,
          })
          .from(teams)
          .where(eq(teams.id, teamId))
          .limit(1),
        db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)),
        db
          .select({
            parentId: parentChildRelations.parentId,
            childId: parentChildRelations.childId,
          })
          .from(parentChildRelations)
          .where(eq(parentChildRelations.teamId, teamId)),
        db.select().from(players).where(eq(players.teamId, teamId)),
        db
          .select()
          .from(events)
          .where(eq(events.teamId, teamId))
          .orderBy(asc(events.startAt)),
      ]),
    ]);
    const teamRecord = teamRows[0];

    const authUserId = sessionUser?.id;
    const authUserName = sessionUser?.name;
    const isSysAdmin = (sessionUser as AuthUser | null)?.role === "SYSTEM_ADMIN";
    const requestedMemberId = c.req.query("memberId");

    let parsedSortOrder: Record<string, string[]> = {};
    try {
      if (teamRecord?.memberSortOrder) {
        parsedSortOrder = JSON.parse(teamRecord.memberSortOrder) as Record<string, string[]>;
      }
    } catch {}
    const orderedIdsSet = new Set<string>(Object.values(parsedSortOrder).flat());

    // ⚡ 候補ユーザーID展開 と 当該チームイベントのみの出欠一括取得（全テーブルスキャン廃止）を並列実行
    const teamEventIds = allEvents.map((ev) => ev.id);
    const matrixAttChunks: string[][] = [];
    for (let i = 0; i < teamEventIds.length; i += 80) {
      matrixAttChunks.push(teamEventIds.slice(i, i + 80));
    }

    const [searchUserIds, attChunkResults, matrixConditionPeriodsMap] = await Promise.all([
      expandCandidateUserIds(db, [userId, authUserId]),
      Promise.all(
        matrixAttChunks.map((chunk) =>
          db
            .select({
              eventId: attendances.eventId,
              playerId: attendances.playerId,
              memberId: attendances.memberId,
              status: attendances.status,
              comment: attendances.comment,
            })
            .from(attendances)
            .where(inArray(attendances.eventId, chunk))
            .all()
        )
      ),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    const isTeamCreator = Boolean(
      teamRecord?.createdBy && searchUserIds.includes(teamRecord.createdBy)
    );

    let isOrgAdmin = false;
    if (!isSysAdmin && !isTeamCreator && teamRecord?.organizationId && searchUserIds.length > 0) {
      try {
        const orgRow = await db
          .select({ role: organizationMembers.role })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, teamRecord.organizationId),
              inArray(organizationMembers.userId, searchUserIds)
            )
          )
          .get();
        const orgRole = (orgRow?.role || "").toUpperCase();
        isOrgAdmin = orgRole === "OWNER" || orgRole === "ADMIN";
      } catch {}
    }

    const activeAllMembers = allTeamMembersRaw.filter(
      (m) => m.status === "active" || !m.status
    );

    const matchedMembers: Array<typeof teamMembers.$inferSelect> = [];
    if (searchUserIds.length > 0) {
      for (const m of activeAllMembers) {
        if (m.userId && searchUserIds.includes(m.userId)) {
          matchedMembers.push(m);
        }
      }
    }

    // Web登録済み user.name（例：小西敏幸 / 松下修造 / 石田英紀 / 敏文中島）との自動連携照合
    if (matchedMembers.length === 0 && (userName || authUserName)) {
      const matchedByUserTable = await findAndAutoLinkMemberByUserTableName(
        db,
        activeAllMembers,
        [userName, authUserName],
        userId
      );
      if (matchedByUserTable) {
        matchedMembers.push(matchedByUserTable);
      }
    }

    if (
      matchedMembers.length === 0 &&
      requestedMemberId &&
      !requestedMemberId.startsWith("demo-")
    ) {
      const reqMember = activeAllMembers.find((m) => m.id === requestedMemberId);
      if (reqMember && (!reqMember.userId || searchUserIds.includes(reqMember.userId))) {
        matchedMembers.push(reqMember);
      }
    }

    if (matchedMembers.length === 0) {
      const matchedByName = findMatchingAdultMemberByName(
        activeAllMembers,
        [userName, authUserName],
        { allowAmbiguousFamilyParent: true }
      );
      if (matchedByName) {
        matchedMembers.push(matchedByName);
      }
    }

    // 複数レコードがヒットした場合は、並び順に登録されている正規列 または 非 tm_ UUID を最優先で代表IDとする
    const currentMember =
      matchedMembers.find((m) => orderedIdsSet.has(m.id)) ||
      matchedMembers.find((m) => !m.id.startsWith("tm_")) ||
      matchedMembers[0] ||
      null;

    const myMemberId = currentMember?.id || null;
    const primaryMemberIds = Array.from(new Set(matchedMembers.map((m) => m.id)));
    const isITAdmin = Boolean(
      isSysAdmin ||
      isTeamCreator ||
      isOrgAdmin ||
      matchedMembers.some((m) => {
        const r = (m.role || "").toLowerCase();
        return r === "admin" || r === "system_admin";
      })
    );
    const isManager = Boolean(
      isITAdmin ||
      matchedMembers.some((m) => {
        const r = (m.role || "").toLowerCase();
        return r === "manager" || r === "coach" || r === "scorer";
      })
    );

    const allPlayers = allPlayersRaw.filter((p) => p.isActive !== false);

    // 家族単位の出欠編集権限解決（本人 + 子ども選手 + 同じ子どもに紐づく配偶者[父⇔母]）
    const myPlayerIdsSet = new Set<string>();
    if (searchUserIds.length > 0) {
      for (const p of allPlayers) {
        if (p.userId && searchUserIds.includes(p.userId)) {
          myPlayerIdsSet.add(p.id);
        }
      }
    }
    for (const rel of relations) {
      if (primaryMemberIds.includes(rel.parentId) && rel.childId) {
        myPlayerIdsSet.add(rel.childId);
      }
    }

    // 親子関係テーブル未設定時のセーフティネット（苗字ステム一致の一意な子ども選手を補完）
    if (myPlayerIdsSet.size === 0 && matchedMembers.length > 0) {
      for (const m of matchedMembers) {
        const stem = extractParentSurnameStem(m.name || "");
        if (!stem) continue;
        const surnamePlayers = allPlayers.filter((p) => {
          const pTokens = (p.name || "").trim().split(/[\s　]+/).filter(Boolean);
          if (pTokens.length >= 2) {
            return normalizeMemberName(pTokens[0]) === stem;
          }
          return stem.length >= 2 && normalizeMemberName(p.name || "").startsWith(stem);
        });
        if (surnamePlayers.length > 0) {
          for (const sp of surnamePlayers) {
            myPlayerIdsSet.add(sp.id);
          }
        }
      }
    }

    const familyMemberIdsSet = new Set<string>(primaryMemberIds);
    if (myPlayerIdsSet.size > 0) {
      for (const rel of relations) {
        if (rel.childId && myPlayerIdsSet.has(rel.childId) && rel.parentId) {
          familyMemberIdsSet.add(rel.parentId);
        }
      }
    }
    // 同一苗字ステムを持つ配偶者レコード（例：小西 父 ⇔ 小西 母）も同一家族として編集許可
    for (const m of matchedMembers) {
      const rawM = m.name || "";
      if (!hasFatherRoleTag(rawM) && !hasMotherRoleTag(rawM)) continue;
      const stem = extractParentSurnameStem(rawM);
      if (!stem) continue;
      const sameStemParents = activeAllMembers.filter((cand) => {
        const rawC = cand.name || "";
        if (cand.memberType === "player") return false;
        if (!hasFatherRoleTag(rawC) && !hasMotherRoleTag(rawC)) return false;
        return extractParentSurnameStem(rawC) === stem;
      });
      if (sameStemParents.length <= 2) {
        for (const sp of sameStemParents) {
          familyMemberIdsSet.add(sp.id);
        }
      }
    }

    const myMemberIds = Array.from(familyMemberIdsSet);
    const myPlayerIds = Array.from(myPlayerIdsSet);

    // ⏸ 休部中 (on_leave) の選手も出欠一覧表に表示（初期順は末尾へ配置し、期間内のイベントは⏸休部バッジ＆「休」セルで明示）
    // 🩹 リハビリ・調整中 / ⚠️ 一部制限あり と合わせて conditionStatus & conditionPeriods を付与する
    const matrixTodayKey = getTodayJstDateKey();
    const formattedPlayers = allPlayers
      .map((p) => {
        const rawPeriods = matrixConditionPeriodsMap.get(p.id) || [];
        const effectiveToday = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: rawPeriods,
          fallbackStatus: p.conditionStatus,
          dateKey: matrixTodayKey,
          todayKey: matrixTodayKey,
        });
        return {
          id: p.id,
          name: p.name,
          uniformNumber: p.uniformNumber || "",
          subText: p.uniformNumber ? `#${p.uniformNumber}` : "",
          groupType: "player" as const,
          conditionStatus: effectiveToday.status,
          conditionPeriods: maskConditionPeriodsForViewer(rawPeriods, false),
        };
      })
      .sort(comparePlayersByConditionAndUniform);

    const formattedPlayerById = new Map(formattedPlayers.map((fp) => [fp.id, fp]));

    // 4. 大人のメンバー一覧分類 (選手除外 & 承認済みアクティブのみ)
    const allTeamMembers = activeAllMembers.filter(m => m.memberType !== "player");

    // 親ID -> 子供IDリスト・子供名リストのマッピング（親子関係テーブル ＋ 未設定時の苗字一致補完）
    const parentToChildIdsMap = buildParentToChildrenMap({
      players: allPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        userId: p.userId,
        isActive: p.isActive,
        conditionStatus: p.conditionStatus,
        conditionPeriods: matrixConditionPeriodsMap.get(p.id) || [],
      })),
      teamMembers: allTeamMembers,
      relations,
    });
    const parentChildrenMap = new Map<string, string[]>();
    for (const [parentId, cIds] of parentToChildIdsMap.entries()) {
      const names = cIds
        .map((cid) => formattedPlayerById.get(cid)?.name)
        .filter((n): n is string => Boolean(n));
      if (names.length > 0) {
        parentChildrenMap.set(parentId, names);
      }
    }

    const mothersList: Array<any> = [];
    const fathersList: Array<any> = [];
    const staffList: Array<any> = [];
    const otherParentsList: Array<any> = [];

    for (const m of allTeamMembers) {
      const name = m.name || "";
      const linkedChildIds = parentToChildIdsMap.get(m.id) || [];
      const kids = parentChildrenMap.get(m.id) || [];
      const hasKids = kids.length > 0;
      const kidsName = hasKids ? kids.join("・") : "";
      const isAllKidsOnLeaveToday =
        linkedChildIds.length > 0 &&
        linkedChildIds.every(
          (cid) => formattedPlayerById.get(cid)?.conditionStatus === "on_leave"
        );

      const hasFatherKeyword =
        name.includes("父") ||
        name.includes("パパ") ||
        name.includes("夫") ||
        name.includes("お父さん") ||
        name.includes("守"); // 💡 佐藤守様等の男性名や父表記に対応
      const hasMotherKeyword =
        name.includes("母") ||
        name.includes("ママ") ||
        name.includes("妻") ||
        name.includes("お母さん");

      const isManagerOrAdmin = m.role === "manager" || m.role === "admin";
      const isScorerOrCoach = m.role === "coach" || m.role === "scorer";
      const isStaffKeyword = name.includes("監督") || name.includes("コーチ") || name.includes("代表");
      const isStaffExplicit = m.memberType === "staff" || isStaffKeyword;
      const isParentExplicit = m.memberType === "parent" || hasKids;

      // 👔 指導者・スタッフ判定（純粋なスタッフ、またはIT管理者・役員）
      const shouldIncludeInStaff = isStaffExplicit || isScorerOrCoach || isManagerOrAdmin;

      // 👪 保護者判定（保護者区分、子どもがいる、または純粋な指導者でない管理者）
      const shouldIncludeInParent = isParentExplicit || (!isStaffKeyword && !isScorerOrCoach);

      // 指導者・スタッフリストへの登録
      if (shouldIncludeInStaff) {
        const roleLabel = name.includes("監督")
          ? "監督"
          : name.includes("コーチ")
          ? "コーチ"
          : name.includes("代表")
          ? "代表"
          : isManagerOrAdmin
          ? "IT管理者"
          : m.role === "scorer"
          ? "スコアラー"
          : "スタッフ";
        staffList.push({
          id: m.id,
          name: name,
          subText: hasKids ? `${kidsName} / ${roleLabel}` : roleLabel,
          groupType: "staff" as const,
        });
      }

      // 保護者リストへの登録（母・父・その他の保護者）
      if (shouldIncludeInParent) {
        const adminTag = isManagerOrAdmin ? " (IT管理者)" : "";
        const isMother =
          m.memberType === "mother" ||
          m.role === "mother" ||
          (typeof m.subRoles === "string" && m.subRoles.toLowerCase().includes("mother")) ||
          hasMotherKeyword;

        if (isMother) {
          mothersList.push({
            id: m.id,
            name: name,
            subText: (hasKids ? `${kidsName}の母` : "保護者(母)") + adminTag,
            groupType: "mother" as const,
            linkedChildIds,
            conditionStatus: isAllKidsOnLeaveToday ? ("on_leave" as const) : ("active" as const),
          });
        } else {
          // 母設定・キーワードがない保護者は父グループとして扱い、タブ未所属による孤立や選手誤判定を防ぐ
          fathersList.push({
            id: m.id,
            name: name,
            subText: (hasKids ? `${kidsName}の父` : "保護者(父)") + adminTag,
            groupType: "father" as const,
            linkedChildIds,
            conditionStatus: isAllKidsOnLeaveToday ? ("on_leave" as const) : ("active" as const),
          });
        }
      }
    }

    const sortParentDefault = (list: Array<any>) =>
      list.sort((a, b) => {
        const aLeave = a.conditionStatus === "on_leave";
        const bLeave = b.conditionStatus === "on_leave";
        if (aLeave !== bLeave) return aLeave ? 1 : -1;
        return 0;
      });
    sortParentDefault(mothersList);
    sortParentDefault(fathersList);

    // 👪 保護者全体（母 + 父 + 一般保護者）
    const allParentsList = [...mothersList, ...fathersList, ...otherParentsList];

    const wStr = ["日", "月", "火", "水", "木", "金", "土"];
    const formattedEvents = allEvents.map(ev => {
      const st = new Date(ev.startAt);
      const y = st.getFullYear();
      const m = String(st.getMonth() + 1).padStart(2, "0");
      const d = String(st.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const day = wStr[st.getDay()];

      return {
        id: ev.id,
        title: ev.title,
        description: ev.description || "",
        dateStr,
        date: `${st.getMonth() + 1}/${st.getDate()}`,
        dayOfWeek: day,
        dutyGroup: ev.dutyGroup || "なし",
        location: ev.location || "グラウンド",
        eventType: ev.eventType || "practice",
      };
    });

    // ⚡ 6. 出欠レコードを O(N) でイベントごとにバケット化してマトリクス構築
    const attendancesByEvent = new Map<
      string,
      Array<{
        playerId: string | null;
        memberId: string | null;
        status: string | null;
        comment: string | null;
      }>
    >();
    for (const rows of attChunkResults) {
      for (const att of rows) {
        if (!att.eventId) continue;
        let bucket = attendancesByEvent.get(att.eventId);
        if (!bucket) {
          bucket = [];
          attendancesByEvent.set(att.eventId, bucket);
        }
        bucket.push(att);
      }
    }

    const matrix: Record<string, Record<string, { status: string; comment: string }>> = {};
    const eventSummaries: Record<string, any> = {};

    for (const ev of formattedEvents) {
      matrix[ev.id] = {};
      let duty = 0;
      let help = 0;
      let setup = 0;
      let game = 0;
      let absent = 0;

      const evAtts = attendancesByEvent.get(ev.id) || [];
      for (const att of evAtts) {
        const key = att.playerId || att.memberId;
        if (!key) continue;

        let st: string = (att.status as string) || "pending";
        // 互換性マッピング
        if (st === "present") st = "help";
        if (st === "late" || st === "partial") st = "setup";

        matrix[ev.id][key] = {
          status: st,
          comment: att.comment || "",
        };

        if (st === "duty") duty++;
        else if (st === "help") help++;
        else if (st === "setup") setup++;
        else if (st === "game") game++;
        else if (st === "absent") absent++;
      }

      eventSummaries[ev.id] = {
        duty,
        help,
        setup,
        game,
        absent,
        totalPresent: duty + help + setup + game,
      };
    }

    const eventsWithSummary = formattedEvents.map(ev => ({
      ...ev,
      statusSummary: eventSummaries[ev.id] || { duty: 0, help: 0, setup: 0, game: 0, absent: 0, totalPresent: 0 },
    }));

    let memberSortOrder = {};
    try {
      if (teamRecord?.memberSortOrder) {
        memberSortOrder = JSON.parse(teamRecord.memberSortOrder);
      }
    } catch {}

    let attendanceStatusConfig = null;
    try {
      if (teamRecord?.attendanceStatusConfig) {
        attendanceStatusConfig = JSON.parse(teamRecord.attendanceStatusConfig);
      }
    } catch {}

    let memberSubLabels = {};
    try {
      if (teamRecord?.memberSubLabels) {
        memberSubLabels = JSON.parse(teamRecord.memberSubLabels);
      }
    } catch {}

    return c.json({
      success: true,
      isDemo: false,
      includesOnLeave: true,
      memberSortOrder,
      attendanceStatusConfig,
      memberSubLabels,
      myInfo: {
        memberId: myMemberId,
        memberIds: myMemberIds,
        isITAdmin,
        groupType: myMemberId ? (
          fathersList.some(f => f.id === myMemberId) ? "father" :
          mothersList.some(m => m.id === myMemberId) ? "mother" :
          staffList.some(s => s.id === myMemberId) ? "staff" :
          allPlayers.some(p => p.id === myMemberId) ? "player" : "father"
        ) : "father",
        playerIds: myPlayerIds,
        isManager,
        name: currentMember?.name || userName || "ゲスト",
      },
      events: eventsWithSummary,
      groups: {
        players: formattedPlayers,
        parents: allParentsList,
        mothers: mothersList,
        fathers: fathersList,
        staff: staffList,
      },
      matrix,
    });
  } catch (error: any) {
    console.error("Failed to load attendance matrix:", error);
    return c.json({ success: false, error: error?.message || "出欠マトリクスの取得に失敗しました" }, 500);
  }
});

/**
 * 📊 出欠マトリクス・セル更新API
 * POST /api/liff/attendance-matrix
 */
app.post("/attendance-matrix", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { eventId, personId, personType, status, comment, userId } = body;

    if (!eventId || !personId || !status) {
      return c.json({ success: false, error: "eventId, personId, and status are required" }, 400);
    }

    if (eventId.startsWith("demo-")) {
      return c.json({
        success: true,
        message: "出欠を更新しました（デモ）",
        updated: { eventId, personId, status, comment: comment || "" },
      });
    }

    // 💡 外部キー整合性チェック (account連携済みの場合は正規 Better-Auth user.id を優先採用)
    let validUserId: string | null = null;
    if (userId) {
      try {
        const expandedIds = await expandCandidateUserIds(db, [userId]);
        const sortedIds = [
          ...expandedIds.filter((id) => !id.startsWith("U")),
          ...expandedIds.filter((id) => id.startsWith("U")),
        ];
        for (const uid of sortedIds) {
          const u = await db.select({ id: user.id }).from(user).where(eq(user.id, uid)).get();
          if (u) {
            validUserId = u.id;
            break;
          }
        }
      } catch (err) {
        console.warn("Could not check userId in user table:", err);
      }
    }

    // 選手かメンバーかを判定
    let isPlayer = personType === "player";
    if (!isPlayer) {
      const p = await db.select({ id: players.id }).from(players).where(eq(players.id, personId)).get();
      if (p) isPlayer = true;
    }

    if (!validUserId && !isPlayer) {
      try {
        const tm = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.id, personId)).get();
        if (tm?.userId) {
          const u = await db.select({ id: user.id }).from(user).where(eq(user.id, tm.userId)).get();
          if (u) validUserId = u.id;
        }
      } catch (err) {
        console.warn("Could not check member userId:", err);
      }
    }

    if (isPlayer) {
      const existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.eventId, eventId), eq(attendances.playerId, personId)))
        .get();

      if (existing) {
        await db
          .update(attendances)
          .set({
            status: status as any,
            comment: comment !== undefined ? comment : existing.comment,
            updatedAt: new Date(),
          })
          .where(eq(attendances.id, existing.id));
      } else {
        try {
          await db.insert(attendances).values({
            id: `att_${crypto.randomUUID()}`,
            eventId,
            playerId: personId,
            userId: validUserId,
            status: status as any,
            roleInEvent: "player",
            comment: comment || null,
            updatedAt: new Date(),
          });
        } catch (insertErr: any) {
          await db
            .update(attendances)
            .set({
              status: status as any,
              comment: comment !== undefined ? comment : null,
              updatedAt: new Date(),
            })
            .where(and(eq(attendances.eventId, eventId), eq(attendances.playerId, personId)));
        }
      }
    } else {
      // メンバー（保護者・スタッフ）
      const existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.eventId, eventId), eq(attendances.memberId, personId)))
        .get();

      if (existing) {
        await db
          .update(attendances)
          .set({
            status: status as any,
            comment: comment !== undefined ? comment : existing.comment,
            updatedAt: new Date(),
          })
          .where(eq(attendances.id, existing.id));
      } else {
        try {
          await db.insert(attendances).values({
            id: `att_${crypto.randomUUID()}`,
            eventId,
            memberId: personId,
            userId: validUserId,
            status: status as any,
            roleInEvent: "parent",
            comment: comment || null,
            updatedAt: new Date(),
          });
        } catch (insertErr: any) {
          await db
            .update(attendances)
            .set({
              status: status as any,
              comment: comment !== undefined ? comment : null,
              updatedAt: new Date(),
            })
            .where(and(eq(attendances.eventId, eventId), eq(attendances.memberId, personId)));
        }
      }
    }

    return c.json({
      success: true,
      message: "出欠を保存しました",
      updated: { eventId, personId, status, comment: comment || "" },
    });
  } catch (error: any) {
    console.error("Failed to update attendance matrix cell:", error);
    return c.json({ success: false, error: error?.message || "更新に失敗しました" }, 500);
  }
});

/**
 * 📊 出欠マトリクス・メンバー表示順（グループ内並び順）保存API
 * POST /api/liff/attendance-matrix/member-order
 */
app.post("/attendance-matrix/member-order", async (c) => {
  await ensureMemberOrderColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, memberSortOrder } = body;
    if (!teamId || !memberSortOrder) {
      return c.json({ success: false, error: "teamId and memberSortOrder are required" }, 400);
    }

    await db.update(teams)
      .set({ memberSortOrder: JSON.stringify(memberSortOrder) })
      .where(eq(teams.id, teamId));

    return c.json({ success: true, message: "並び順を保存しました" });
  } catch (err: any) {
    console.error("Failed to save member sort order:", err);
    return c.json({ success: false, error: err?.message || "並び順の保存に失敗しました" }, 500);
  }
});

/**
 * 📝 イベント（日程）ごとのメモ・備考保存API
 * POST /api/liff/attendance-matrix/event-note
 */
app.post("/attendance-matrix/event-note", async (c) => {
  await ensureEventColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { eventId, description } = body;
    if (!eventId) {
      return c.json({ success: false, error: "eventId is required" }, 400);
    }

    await db.update(events)
      .set({ description: description || null })
      .where(eq(events.id, eventId));

    return c.json({ success: true, message: "日別メモを保存しました" });
  } catch (err: any) {
    console.error("Failed to save event description:", err);
    return c.json({ success: false, error: err?.message || "日別メモの保存に失敗しました" }, 500);
  }
});

/**
 * 🏷️ グループ別 出欠ステータス設定保存API
 * POST /api/liff/attendance-matrix/status-config
 */
app.post("/attendance-matrix/status-config", async (c) => {
  await ensureStatusConfigColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, statusConfig } = body;
    if (!teamId || !statusConfig) {
      return c.json({ success: false, error: "teamId and statusConfig are required" }, 400);
    }

    await db.update(teams)
      .set({ attendanceStatusConfig: JSON.stringify(statusConfig) })
      .where(eq(teams.id, teamId));

    return c.json({ success: true, message: "ステータス設定を保存しました" });
  } catch (err: any) {
    console.error("Failed to save status config:", err);
    return c.json({ success: false, error: err?.message || "ステータス設定の保存に失敗しました" }, 500);
  }
});

/**
 * 🏷️ メンバーサブラベル（班・役職等）保存API
 * POST /api/liff/attendance-matrix/sub-labels
 */
app.post("/attendance-matrix/sub-labels", async (c) => {
  await ensureMemberSubLabelsColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, memberSubLabels } = body;
    if (!teamId || !memberSubLabels) {
      return c.json({ success: false, error: "teamId and memberSubLabels are required" }, 400);
    }

    await db.update(teams)
      .set({ memberSubLabels: JSON.stringify(memberSubLabels) })
      .where(eq(teams.id, teamId));

    return c.json({ success: true, message: "サブラベルを保存しました" });
  } catch (err: any) {
    console.error("Failed to save member sub labels:", err);
    return c.json({ success: false, error: err?.message || "サブラベルの保存に失敗しました" }, 500);
  }
});

/**
 * ⏰ チームの予定スケジューラー初期時間設定（午前・午後／季節・対象月別）取得・保存API
 * GET  /api/liff/schedule-default-times?teamId=xxx
 * POST /api/liff/schedule-default-times
 */
app.get("/schedule-default-times", async (c) => {
  await ensureScheduleDefaultTimesColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        scheduleDefaultTimes: DEFAULT_TEAM_SCHEDULE_TIMES,
      });
    }

    const row = await db
      .select({ scheduleDefaultTimes: teams.scheduleDefaultTimes })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    return c.json({
      success: true,
      isDemo: false,
      scheduleDefaultTimes: normalizeTeamScheduleDefaultTimes(row?.scheduleDefaultTimes),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "初期時間設定の取得に失敗しました";
    return c.json({ success: false, error: msg }, 500);
  }
});

app.post("/schedule-default-times", async (c) => {
  await ensureScheduleDefaultTimesColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      scheduleDefaultTimes?: unknown;
    };
    const teamId = body.teamId?.trim();
    if (!teamId) {
      return c.json({ success: false, error: "teamId is required" }, 400);
    }

    const normalized = normalizeTeamScheduleDefaultTimes(body.scheduleDefaultTimes);

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        scheduleDefaultTimes: normalized,
      });
    }

    await db
      .update(teams)
      .set({ scheduleDefaultTimes: JSON.stringify(normalized) })
      .where(eq(teams.id, teamId));

    return c.json({
      success: true,
      isDemo: false,
      scheduleDefaultTimes: normalized,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "初期時間設定の保存に失敗しました";
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * 👨‍👦 ログイン中保護者の親子関係・お子様一覧取得API
 * GET /api/liff/my-family?teamId=xxx&userId=xxx&userName=xxx&parentId=xxx
 */
app.get("/my-family", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");
  const targetParentId = c.req.query("parentId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isParent: true,
        children: [
          {
            id: "demo-player-1",
            name: "山田 翔太",
            uniformNumber: "#10",
            memberType: "player",
            conditionStatus: "active" as PlayerConditionStatus,
          },
        ],
        allFamilyRelations: [
          { id: "demo-rel-1", parentId: "demo-parent-1", parentName: "山田 (保護者)", childId: "demo-player-1", childName: "山田 翔太", uniformNumber: "#10" }
        ],
        attendances: {},
      });
    }

    // 1. チーム全体の親子関係一覧 ＆ 在籍選手一覧 ＆ 休部/故障期間マップを並列取得
    const [allRelations, familyAllPlayers, familyConditionPeriodsMap] = await Promise.all([
      db
        .select({
          id: parentChildRelations.id,
          parentId: parentChildRelations.parentId,
          parentName: teamMembers.name,
          childId: parentChildRelations.childId,
          childName: players.name,
          uniformNumber: players.uniformNumber,
          conditionStatus: players.conditionStatus,
        })
        .from(parentChildRelations)
        .leftJoin(teamMembers, eq(parentChildRelations.parentId, teamMembers.id))
        .leftJoin(players, eq(parentChildRelations.childId, players.id))
        .where(eq(parentChildRelations.teamId, teamId))
        .all(),
      db
        .select({
          id: players.id,
          name: players.name,
          uniformNumber: players.uniformNumber,
          conditionStatus: players.conditionStatus,
          isActive: players.isActive,
        })
        .from(players)
        .where(eq(players.teamId, teamId))
        .all(),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    // 2. チームメンバーから保護者レコードを特定（account双方向連携 & 安全な名前照合）
    let authUserId: string | undefined;
    let authUserName: string | undefined;
    try {
      const auth = getAuth(c.env.DB, c.env);
      const session = await auth.api
        .getSession({ headers: c.req.raw.headers as unknown as Headers })
        .catch(() => null);
      authUserId = session?.user?.id;
      authUserName = session?.user?.name || undefined;
    } catch {}

    const familyCandidateIds = await expandCandidateUserIds(db, [userId, authUserId]);
    let member: typeof teamMembers.$inferSelect | null = null;
    const matchedFamilyMemberIds = new Set<string>();

    if (targetParentId && !targetParentId.startsWith("demo-")) {
      const targetRow = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, targetParentId)))
        .get();
      if (targetRow) {
        member = targetRow;
        matchedFamilyMemberIds.add(targetRow.id);
      }
    }

    if (!member && familyCandidateIds.length > 0) {
      const rows = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            or(...familyCandidateIds.map((uid) => eq(teamMembers.userId, uid)))
          )
        )
        .all();
      const activeRows = rows.filter((r) => r.status === "active" || !r.status);
      for (const r of activeRows) {
        matchedFamilyMemberIds.add(r.id);
      }
      member =
        activeRows.find((r) => !r.id.startsWith("tm_")) ||
        activeRows[0] ||
        null;
    }

    if (!member && (userName || authUserName)) {
      const teamMemberList = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId))
        .all();
      const matchedByUserTable = await findAndAutoLinkMemberByUserTableName(
        db,
        teamMemberList,
        [userName, authUserName],
        userId
      );
      const matched =
        matchedByUserTable ||
        findMatchingAdultMemberByName(teamMemberList, [userName, authUserName], {
          allowAmbiguousFamilyParent: true,
        });
      if (matched) {
        member = matched;
        matchedFamilyMemberIds.add(matched.id);
      }
    }

    // 3. 親子関係から該当する保護者のお子様のみを抽出（重複排除 ＋ 未設定時の苗字一致補完）
    const familyTodayKey = getTodayJstDateKey();
    let childrenList: Array<{
      id: string;
      name: string;
      uniformNumber?: string;
      parentId?: string;
      parentName?: string;
      conditionStatus?: PlayerConditionStatus;
      conditionPeriods?: PlayerConditionPeriod[];
    }> = [];

    if (member) {
      const myRelations = allRelations.filter(
        (r) => (r.parentId === member!.id || matchedFamilyMemberIds.has(r.parentId)) && !!r.childId
      );
      const seen = new Set<string>();
      for (const rel of myRelations) {
        if (!seen.has(rel.childId)) {
          seen.add(rel.childId);
          const rawPeriods = familyConditionPeriodsMap.get(rel.childId) || [];
          const effectiveToday = resolveEffectivePlayerConditionOnDate({
            conditionPeriods: rawPeriods,
            fallbackStatus: rel.conditionStatus,
            dateKey: familyTodayKey,
            todayKey: familyTodayKey,
          });
          childrenList.push({
            id: rel.childId,
            name: rel.childName || "選手",
            uniformNumber: rel.uniformNumber ? (rel.uniformNumber.startsWith("#") ? rel.uniformNumber : `#${rel.uniformNumber}`) : undefined,
            parentId: member.id,
            parentName: member.name || undefined,
            conditionStatus: effectiveToday.status,
            conditionPeriods: maskConditionPeriodsForViewer(rawPeriods, false),
          });
        }
      }

      if (childrenList.length === 0) {
        const fallbackParentMap = buildParentToChildrenMap({
          players: familyAllPlayers,
          teamMembers: [member],
          relations: [],
        });
        const fallbackChildIds = fallbackParentMap.get(member.id) || [];
        for (const cid of fallbackChildIds) {
          const pRow = familyAllPlayers.find((fp) => fp.id === cid);
          if (!pRow || seen.has(cid)) continue;
          seen.add(cid);
          const rawPeriods = familyConditionPeriodsMap.get(cid) || [];
          const effectiveToday = resolveEffectivePlayerConditionOnDate({
            conditionPeriods: rawPeriods,
            fallbackStatus: pRow.conditionStatus,
            dateKey: familyTodayKey,
            todayKey: familyTodayKey,
          });
          childrenList.push({
            id: cid,
            name: pRow.name || "選手",
            uniformNumber: pRow.uniformNumber
              ? pRow.uniformNumber.startsWith("#")
                ? pRow.uniformNumber
                : `#${pRow.uniformNumber}`
              : undefined,
            parentId: member.id,
            parentName: member.name || undefined,
            conditionStatus: effectiveToday.status,
            conditionPeriods: maskConditionPeriodsForViewer(rawPeriods, false),
          });
        }
      }
    }

    // 4. 子供たちの既存出欠一覧を取得
    const childIds = childrenList.map((c) => c.id);
    const childAttMap: Record<string, Record<string, "present" | "absent" | "pending" | "late">> = {};
    const childGroupMap: Record<string, Record<string, string>> = {};

    if (childIds.length > 0) {
      const attList = await db
        .select({
          eventId: attendances.eventId,
          playerId: attendances.playerId,
          status: attendances.status,
          selectedGroupId: attendances.selectedGroupId,
        })
        .from(attendances)
        .where(sql`${attendances.playerId} IN (${sql.join(childIds.map(id => sql`${id}`), sql`, `)})`)
        .all();

      for (const att of attList) {
        if (att.eventId && att.playerId && att.status) {
          if (!childAttMap[att.eventId]) {
            childAttMap[att.eventId] = {};
          }
          childAttMap[att.eventId][att.playerId] = (att.status as any) || "pending";

          if (att.selectedGroupId) {
            if (!childGroupMap[att.eventId]) {
              childGroupMap[att.eventId] = {};
            }
            childGroupMap[att.eventId][att.playerId] = att.selectedGroupId;
          }
        }
      }
    }

    // 6. 保護者本人の既存出欠一覧を取得
    const parentAttMap: Record<string, "present" | "absent" | "pending" | "late"> = {};
    const parentGroupMap: Record<string, string> = {};
    if (matchedFamilyMemberIds.size > 0 || familyCandidateIds.length > 0) {
      const parentConditions = [];
      for (const mid of matchedFamilyMemberIds) {
        parentConditions.push(eq(attendances.memberId, mid));
      }
      for (const uid of familyCandidateIds) {
        parentConditions.push(eq(attendances.userId, uid));
      }

      if (parentConditions.length > 0) {
        const parentAttList = await db
          .select({
            eventId: attendances.eventId,
            status: attendances.status,
            selectedGroupId: attendances.selectedGroupId,
          })
          .from(attendances)
          .where(or(...parentConditions))
          .all();

        for (const att of parentAttList) {
          if (att.eventId && att.status) {
            parentAttMap[att.eventId] = (att.status as any) || "pending";
            if (att.selectedGroupId) {
              parentGroupMap[att.eventId] = att.selectedGroupId;
            }
          }
        }
      }
    }

    return c.json({
      success: true,
      isParent: true,
      memberId: member?.id || null,
      memberName: member?.name || null,
      children: childrenList,
      attendances: childAttMap,
      childGroupMap,
      parentAttendances: parentAttMap,
      parentGroupMap,
    });
  } catch (error: any) {
    console.error("Failed to load my-family:", error);
    return c.json({
      success: false,
      isParent: true,
      children: [],
      attendances: {},
      parentAttendances: {},
    });
  }
});

/**
 * 出欠回答送信API (保護者本人または選手個別の出欠を保存)
 */
app.post("/attendance", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { eventId, userId, memberId, playerId, status, selectedGroupId, hasCar, comment } = body;

    if (!eventId || !status) {
      return c.json({ success: false, error: "eventId and status are required" }, 400);
    }

    if (eventId.startsWith("demo-")) {
      return c.json({ success: true, message: "出欠回答を記録しました（デモ）" });
    }

    // 👦 選手の出欠の場合 (playerId が指定されている場合)
    if (playerId) {
      const existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.eventId, eventId), eq(attendances.playerId, playerId)))
        .get();

      const isAttending = status !== "absent" && status !== "pending";
      if (existing) {
        await db
          .update(attendances)
          .set({
            status: status,
            selectedGroupId: isAttending ? (selectedGroupId || existing.selectedGroupId) : null,
            comment: comment || existing.comment,
            updatedAt: new Date(),
          })
          .where(eq(attendances.id, existing.id));
      } else {
        await db.insert(attendances).values({
          id: `att_${crypto.randomUUID()}`,
          eventId,
          playerId,
          status: status,
          selectedGroupId: isAttending ? (selectedGroupId || null) : null,
          roleInEvent: "player",
          comment: comment || null,
          updatedAt: new Date(),
        });
      }

      return c.json({ success: true, message: "お子様の出欠回答を保存しました" });
    }

    let authUserId: string | undefined;
    try {
      const auth = getAuth(c.env.DB, c.env);
      const session = await auth.api
        .getSession({ headers: c.req.raw.headers as unknown as Headers })
        .catch(() => null);
      authUserId = session?.user?.id;
    } catch {}

    const expandedIds = await expandCandidateUserIds(db, [userId, authUserId]);
    const evRow = await db
      .select({ teamId: events.teamId })
      .from(events)
      .where(eq(events.id, eventId))
      .get();

    // 💡 外部キー整合性チェック (account連携済みの場合は正規 Better-Auth user.id を優先採用)
    let validUserId: string | null = null;
    if (expandedIds.length > 0) {
      const sortedIds = [
        ...expandedIds.filter((id) => !id.startsWith("U")),
        ...expandedIds.filter((id) => id.startsWith("U")),
      ];
      for (const uid of sortedIds) {
        try {
          const u = await db.select({ id: user.id }).from(user).where(eq(user.id, uid)).get();
          if (u) {
            validUserId = u.id;
            break;
          }
        } catch {}
      }
    }

    // 👨 保護者・メンバー本人の出欠の場合（イベントの所属チーム内で正確に特定）
    let effectiveMemberId: string | null = memberId || null;
    if (effectiveMemberId && evRow?.teamId) {
      const verifiedMember = await db
        .select({ id: teamMembers.id, userId: teamMembers.userId })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, evRow.teamId), eq(teamMembers.id, effectiveMemberId)))
        .get();
      if (!verifiedMember) {
        effectiveMemberId = null;
      } else if (!validUserId && verifiedMember.userId) {
        const u = await db.select({ id: user.id }).from(user).where(eq(user.id, verifiedMember.userId)).get();
        if (u) validUserId = u.id;
      }
    }

    if (!effectiveMemberId && expandedIds.length > 0) {
      const tmConditions = [or(...expandedIds.map((uid) => eq(teamMembers.userId, uid)))];
      if (evRow?.teamId) {
        tmConditions.push(eq(teamMembers.teamId, evRow.teamId));
      }
      const tmRows = await db
        .select({ id: teamMembers.id, userId: teamMembers.userId })
        .from(teamMembers)
        .where(and(...tmConditions))
        .all();
      const canonicalTm = tmRows.find((r) => !r.id.startsWith("tm_")) || tmRows[0];
      if (canonicalTm) {
        effectiveMemberId = canonicalTm.id;
        if (!validUserId && canonicalTm.userId) {
          const u = await db.select({ id: user.id }).from(user).where(eq(user.id, canonicalTm.userId)).get();
          if (u) validUserId = u.id;
        }
      }
    }

    const conditions = [];
    if (effectiveMemberId) conditions.push(eq(attendances.memberId, effectiveMemberId));
    if (validUserId) conditions.push(eq(attendances.userId, validUserId));

    let existing = null;
    if (conditions.length > 0) {
      existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.eventId, eventId), or(...conditions)))
        .get();
    }

    const isAttending = status !== "absent" && status !== "pending";
    if (existing) {
      await db
        .update(attendances)
        .set({
          status: status,
          selectedGroupId: isAttending ? (selectedGroupId || existing.selectedGroupId) : null,
          userId: validUserId || existing.userId || null,
          memberId: effectiveMemberId || existing.memberId,
          hasCar: hasCar !== undefined ? hasCar : existing.hasCar,
          comment: comment || existing.comment,
          updatedAt: new Date(),
        })
        .where(eq(attendances.id, existing.id));
    } else {
      await db.insert(attendances).values({
        id: `att_${crypto.randomUUID()}`,
        eventId,
        userId: validUserId,
        memberId: effectiveMemberId || null,
        status: status,
        selectedGroupId: isAttending ? (selectedGroupId || null) : null,
        hasCar: !!hasCar,
        roleInEvent: "parent",
        comment: comment || null,
        updatedAt: new Date(),
      });
    }

    return c.json({ success: true, message: "出欠回答を保存しました" });
  } catch (error: any) {
    console.error("Failed to save attendance:", error);
    return c.json({ success: false, error: error?.message || "出欠回答の保存に失敗しました" }, 500);
  }
});

/**
 * 配車表取得API (実イベント配車またはデモ配車)
 */
app.get("/carpool", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const eventId = c.req.query("eventId");

  const DEMO_CARPOOL = {
    eventId: "demo-event-carpool",
    eventTitle: "秋季大会 2回戦 vs レッドソックス",
    date: "2026年8月30日(日)",
    gatherTime: "07:45 集合 / 08:00 出発",
    gatherLocation: "桜本小学校 正門前",
    destination: "多摩川緑地野球場 第1駐車場",
    costShare: "1家族あたり 約 600 円 (高速・ガソリン代割り勘)",
    notes: "※道具車はボールケース・テント・救急箱を積載します。\n※各自水筒と氷の準備をお願いします。",
    availableEvents: [
      {
        eventId: "demo-event-carpool",
        title: "秋季大会 2回戦 vs レッドソックス",
        dateLabel: "8/30(日)",
        carCount: 3,
      },
    ],
    cars: [
      {
        carpoolId: "demo-cp-1",
        carNumber: 1,
        driverName: "鈴木 パパ",
        carModel: "セレナ (白)",
        plate: "・12-34",
        capacity: 6,
        passengers: [
          { name: "鈴木 翔太 (選手)", type: "player" },
          { name: "佐藤 蓮 (選手)", type: "player" },
          { name: "高橋 陸 (選手)", type: "player" },
          { name: "田中 健太 (選手)", type: "player" },
          { name: "佐藤 ママ (保護者)", type: "adult" },
        ],
      },
      {
        carpoolId: "demo-cp-2",
        carNumber: 2,
        driverName: "田中 パパ (コーチ)",
        carModel: "アルファード (黒)",
        plate: "・・88",
        capacity: 5,
        passengers: [
          { name: "田中 颯太 (選手)", type: "player" },
          { name: "伊藤 悠斗 (選手)", type: "player" },
          { name: "渡辺 陽向 (選手)", type: "player" },
          { name: "渡辺 パパ (コーチ)", type: "adult" },
        ],
      },
      {
        carpoolId: "demo-cp-3",
        carNumber: 3,
        driverName: "山下 監督",
        carModel: "ハイエース (道具車)",
        plate: "・56-78",
        capacity: 3,
        isCargo: true,
        passengers: [
          { name: "中村 湊 (選手)", type: "player" },
          { name: "小林 樹 (選手)", type: "player" },
        ],
      },
    ],
  };

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        carpool: DEMO_CARPOOL,
      });
    }

    // チーム内のイベント一覧と各イベントの配車台数を並列取得し、当日〜直近予定の配車イベントを最優先で選択
    const teamEvents = await db
      .select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(desc(events.startAt))
      .all();

    if (teamEvents.length === 0) {
      return c.json({
        success: true,
        isDemo: false,
        carpool: null,
      });
    }

    const allEventIds = teamEvents.map((ev) => ev.id);
    const carpoolCountRows =
      allEventIds.length > 0
        ? await db
            .select({
              eventId: eventCarpools.eventId,
              count: sql<number>`count(*)`,
            })
            .from(eventCarpools)
            .where(inArray(eventCarpools.eventId, allEventIds))
            .groupBy(eventCarpools.eventId)
            .all()
        : [];

    const carCountByEventId = new Map<string, number>();
    for (const row of carpoolCountRows) {
      carCountByEventId.set(row.eventId, Number(row.count) || 0);
    }

    const availableEvents = teamEvents
      .filter((ev) => (carCountByEventId.get(ev.id) || 0) > 0)
      .slice(0, 12)
      .map((ev) => ({
        eventId: ev.id,
        title: ev.title,
        dateLabel: new Date(ev.startAt).toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
          weekday: "short",
        }),
        carCount: carCountByEventId.get(ev.id) || 0,
      }));

    let targetEvent: (typeof teamEvents)[number] | null = null;
    if (eventId) {
      targetEvent = teamEvents.find((ev) => ev.id === eventId) || null;
    } else {
      // 当日朝0:00(JST)以降の「配車ありイベント（近い順）」 -> 「当日以降の予定（近い順）」 -> 「直近過去の配車ありイベント」 -> 「最新イベント」
      const jstNow = new Date(Date.now() + 9 * 3600_000);
      const jstTodayStartMs =
        Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) -
        9 * 3600_000;

      const upcomingEventsAsc = teamEvents
        .filter((ev) => new Date(ev.startAt).getTime() >= jstTodayStartMs)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

      const upcomingWithCars = upcomingEventsAsc.find(
        (ev) => (carCountByEventId.get(ev.id) || 0) > 0
      );
      const pastWithCars = teamEvents.find(
        (ev) => (carCountByEventId.get(ev.id) || 0) > 0
      );

      targetEvent =
        upcomingWithCars ||
        upcomingEventsAsc[0] ||
        pastWithCars ||
        teamEvents[0] ||
        null;
    }

    if (!targetEvent) {
      return c.json({
        success: true,
        isDemo: false,
        carpool: null,
      });
    }

    // 配車枠とチーム基本情報（ホームグラウンド名等）を並列取得
    const [carpoolsList, teamRow] = await Promise.all([
      db
        .select({
          id: eventCarpools.id,
          driverId: eventCarpools.driverId,
          driverName: teamMembers.name,
          capacity: eventCarpools.capacity,
          carType: eventCarpools.carType,
          carName: memberCars.name,
          carColor: memberCars.color,
          numberPlate: memberCars.numberPlate,
        })
        .from(eventCarpools)
        .leftJoin(teamMembers, eq(eventCarpools.driverId, teamMembers.id))
        .leftJoin(memberCars, eq(eventCarpools.carId, memberCars.id))
        .where(eq(eventCarpools.eventId, targetEvent.id))
        .all(),
      db
        .select({ homeGround: teams.homeGround })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
    ]);

    const defaultGatherPlace =
      teamRow?.homeGround?.trim() || targetEvent.location || "集合場所";

    if (carpoolsList.length === 0) {
      return c.json({
        success: true,
        isDemo: false,
        carpool: {
          eventId: targetEvent.id,
          eventTitle: targetEvent.title,
          date: new Date(targetEvent.startAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }),
          gatherTime: `${new Date(targetEvent.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 集合`,
          gatherLocation: defaultGatherPlace,
          destination: targetEvent.location || "グラウンド",
          costShare: "配車割り当て調整中",
          notes: targetEvent.description || "",
          availableEvents,
          cars: [],
        },
      });
    }

    // ⚡ 全車両の乗車メンバー（riders）を1回の inArray クエリで一括取得（N+1クエリを排除）
    const carpoolIds = carpoolsList.map((car) => car.id);
    const allRiders =
      carpoolIds.length > 0
        ? await db
            .select({
              carpoolId: eventCarpoolRiders.carpoolId,
              riderPlayerName: players.name,
              riderMemberName: teamMembers.name,
              riderMemberType: teamMembers.memberType,
            })
            .from(eventCarpoolRiders)
            .leftJoin(players, eq(eventCarpoolRiders.playerId, players.id))
            .leftJoin(teamMembers, eq(eventCarpoolRiders.memberId, teamMembers.id))
            .where(inArray(eventCarpoolRiders.carpoolId, carpoolIds))
            .all()
        : [];

    const ridersByCarpoolId = new Map<string, typeof allRiders>();
    for (const r of allRiders) {
      if (!r.carpoolId) continue;
      let list = ridersByCarpoolId.get(r.carpoolId);
      if (!list) {
        list = [];
        ridersByCarpoolId.set(r.carpoolId, list);
      }
      list.push(r);
    }

    const carsWithPassengers = carpoolsList.map((car, index) => {
      const riders = ridersByCarpoolId.get(car.id) || [];
      const passengers = riders.map((r) => {
        if (r.riderPlayerName) {
          return { name: `${r.riderPlayerName} (選手)`, type: "player" as const };
        }
        return {
          name: `${r.riderMemberName || "メンバー"} (${r.riderMemberType === "staff" ? "指導者" : "保護者"})`,
          type: "adult" as const,
        };
      });

      return {
        carpoolId: car.id,
        carNumber: index + 1,
        driverName: car.driverName || "ドライバー",
        carModel: car.carName ? `${car.carName}${car.carColor ? ` (${car.carColor})` : ""}` : "登録車",
        plate: car.numberPlate || "未登録",
        capacity: car.capacity || 4,
        isCargo: car.carType === "cargo",
        passengers,
      };
    });

    return c.json({
      success: true,
      isDemo: false,
      carpool: {
        eventId: targetEvent.id,
        eventTitle: targetEvent.title,
        date: new Date(targetEvent.startAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }),
        gatherTime: `${new Date(targetEvent.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 集合`,
        gatherLocation: defaultGatherPlace,
        destination: targetEvent.location || "グラウンド",
        costShare: "1家族あたり実費割り勘",
        notes: targetEvent.description || "",
        availableEvents,
        cars: carsWithPassengers,
      },
    });
  } catch (error: any) {
    console.error("Failed to load liff carpool:", error);
    return c.json({ success: false, carpool: null });
  }
});

/**
 * 🧢 試合詳細ページ用：当日運営スタッフ候補・ログイン保護者本人照合・同日スケジュール/配車サマリー一括取得API
 * - N+1ゼロ（Promise.all 並列取得 ＋ 配車乗車メンバーの inArray 一括取得）
 * - 書き込みDDLロックゼロ（Isolateキャッシュ済みスキーマ検証のみ）
 */
app.get("/match-ops-context", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const matchDate = c.req.query("matchDate") || "";
  const linkedEventId = c.req.query("linkedEventId") || "";
  const rawUserId = c.req.query("userId") || "";
  const rawUserName = c.req.query("userName") || "";

  const extractDateKey = (raw: string): string => {
    const m = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return "";
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  };

  const toJstDateKey = (val: Date | number | string | null | undefined): string => {
    if (!val) return "";
    const ms = val instanceof Date ? val.getTime() : typeof val === "number" ? val : new Date(val).getTime();
    if (!Number.isFinite(ms)) return "";
    const jst = new Date(ms + 9 * 3600 * 1000);
    return jst.toISOString().slice(0, 10);
  };

  const toJstTimeText = (val: Date | number | string | null | undefined): string | null => {
    if (!val) return null;
    const ms = val instanceof Date ? val.getTime() : typeof val === "number" ? val : new Date(val).getTime();
    if (!Number.isFinite(ms)) return null;
    const jst = new Date(ms + 9 * 3600 * 1000);
    const hh = String(jst.getUTCHours()).padStart(2, "0");
    const mi = String(jst.getUTCMinutes()).padStart(2, "0");
    if (hh === "00" && mi === "00") return null;
    return `${hh}:${mi}`;
  };

  // デモモード
  if (!teamId || teamId === "demo-team") {
    const demoAdultMembers: LiffAdultMemberOption[] = [
      { id: "demo-m-1", name: "山下 監督", memberType: "staff", role: "coach", isFatherOrStaff: true },
      { id: "demo-m-2", name: "田中 パパ", memberType: "staff", role: "coach", isFatherOrStaff: true },
      { id: "demo-m-3", name: "渡辺 パパ", memberType: "staff", role: "coach", isFatherOrStaff: true },
      { id: "demo-m-4", name: "鈴木 パパ", memberType: "guardian", role: "member", isFatherOrStaff: true },
      { id: "demo-m-5", name: "小西 父", memberType: "guardian", role: "member", isFatherOrStaff: true },
      { id: "demo-m-6", name: "中島 父", memberType: "guardian", role: "member", isFatherOrStaff: true },
      { id: "demo-m-7", name: "高橋 父", memberType: "guardian", role: "member", isFatherOrStaff: true },
      { id: "demo-m-8", name: "山本 父", memberType: "guardian", role: "member", isFatherOrStaff: true },
      { id: "demo-m-9", name: "佐藤 ママ", memberType: "guardian", role: "member", isFatherOrStaff: false },
      { id: "demo-m-10", name: "山田 母", memberType: "guardian", role: "member", isFatherOrStaff: false },
    ];

    const targetDateKey = extractDateKey(matchDate);
    const isDemoScheduledMatch = !targetDateKey || targetDateKey === "2026-11-08";

    const demoScheduleSync: LiffMatchScheduleSyncInfo | null = isDemoScheduledMatch
      ? DEMO_SCHEDULED_MATCH_CARPOOL_SYNC
      : null;

    const demoDisplayName =
      rawUserName && !IGNORED_GENERIC_USER_NAMES.has(rawUserName.trim())
        ? rawUserName.trim()
        : "鈴木 パパ";

    const demoPayload: LiffMatchOpsContextResponse = {
      success: true,
      isDemo: true,
      adultMembers: demoAdultMembers,
      myIdentity: {
        memberId: "demo-m-4",
        memberName: demoDisplayName,
        displayName: demoDisplayName,
        childNames: ["鈴木 蓮"],
      },
      scheduleSync: demoScheduleSync,
    };
    return c.json(demoPayload);
  }

  try {
    await ensureEventColumns(c.env.DB);
    const targetDateKey = extractDateKey(matchDate);

    const [allMembers, familyRows, teamEvents, authSession] = await Promise.all([
      db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all(),
      db
        .select({
          parentId: parentChildRelations.parentId,
          playerId: players.id,
          playerName: players.name,
        })
        .from(parentChildRelations)
        .innerJoin(players, eq(parentChildRelations.childId, players.id))
        .where(eq(parentChildRelations.teamId, teamId))
        .all()
        .catch(() => [] as Array<{ parentId: string; playerId: string; playerName: string }>),
      linkedEventId || targetDateKey
        ? db
            .select()
            .from(events)
            .where(eq(events.teamId, teamId))
            .orderBy(desc(events.startAt))
            .all()
        : Promise.resolve([]),
      getAuth(c.env.DB, c.env)
        .api.getSession({ headers: c.req.raw.headers })
        .catch(() => null),
    ]);

    // 1. 大人メンバー一覧（保護者・指導者・スタッフ）を重複排除・ソートして整形
    const activeAdultsRaw = allMembers.filter(
      (m) =>
        m.memberType !== "player" &&
        (m.status === "active" || !m.status) &&
        Boolean(m.name && m.name.trim())
    );

    const dedupByNormName = new Map<string, (typeof activeAdultsRaw)[number]>();
    for (const m of activeAdultsRaw) {
      const key = normalizeMemberName(m.name || "");
      if (!key) continue;
      const existing = dedupByNormName.get(key);
      if (!existing) {
        dedupByNormName.set(key, m);
      } else {
        const existingScore = (existing.id.startsWith("tm_") ? 0 : 2) + (existing.userId ? 1 : 0);
        const nextScore = (m.id.startsWith("tm_") ? 0 : 2) + (m.userId ? 1 : 0);
        if (nextScore > existingScore) {
          dedupByNormName.set(key, m);
        }
      }
    }

    const adultMembers: LiffAdultMemberOption[] = Array.from(dedupByNormName.values())
      .map((m) => {
        const rawName = (m.name || "").trim();
        const mType = m.memberType || "guardian";
        const mRole = m.role || "member";
        const isFatherOrStaff =
          mType === "staff" ||
          mRole === "owner" ||
          mRole === "admin" ||
          mRole === "coach" ||
          hasFatherRoleTag(rawName);
        return {
          id: m.id,
          name: rawName,
          memberType: mType,
          role: mRole,
          isFatherOrStaff,
        };
      })
      .sort((a, b) => {
        if (a.isFatherOrStaff !== b.isFatherOrStaff) {
          return a.isFatherOrStaff ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "ja");
      });

    // 2. ログイン中の保護者・指導者アイデンティティ解決
    const sessionUser = authSession?.user as AuthUser | undefined;
    const expandedIds = await expandCandidateUserIds(db, [rawUserId, sessionUser?.id]);
    const candidateIdSet = new Set<string>(expandedIds);

    let matchedMember =
      activeAdultsRaw.find((m) => Boolean(m.userId && candidateIdSet.has(m.userId))) || null;

    if (!matchedMember) {
      matchedMember = await findAndAutoLinkMemberByUserTableName(
        db,
        activeAdultsRaw,
        [rawUserName, sessionUser?.name],
        rawUserId
      );
    }

    if (!matchedMember) {
      matchedMember = findMatchingAdultMemberByName(
        activeAdultsRaw,
        [rawUserName, sessionUser?.name],
        { allowAmbiguousFamilyParent: true }
      );
    }

    if (matchedMember?.userId) {
      candidateIdSet.add(matchedMember.userId);
    }
    if (matchedMember?.id) {
      candidateIdSet.add(matchedMember.id);
    }

    const childNamesSet = new Set<string>();
    for (const rel of familyRows) {
      if (rel.parentId && candidateIdSet.has(rel.parentId) && rel.playerName) {
        childNamesSet.add(rel.playerName);
      }
    }

    const cleanDisplayName =
      rawUserName && !IGNORED_GENERIC_USER_NAMES.has(rawUserName.trim())
        ? rawUserName.trim()
        : sessionUser?.name && !IGNORED_GENERIC_USER_NAMES.has(sessionUser.name.trim())
          ? sessionUser.name.trim()
          : null;

    const myIdentity: LiffMyMatchIdentity = {
      memberId: matchedMember?.id || null,
      memberName: matchedMember?.name?.trim() || null,
      displayName: cleanDisplayName,
      childNames: Array.from(childNamesSet),
    };

    // 3. 同日のスケジュール・配車データを自動リンク
    let targetEvent: (typeof teamEvents)[number] | undefined;
    if (linkedEventId) {
      targetEvent = teamEvents.find((ev) => ev.id === linkedEventId);
    }
    if (!targetEvent && targetDateKey) {
      targetEvent = findSameDayScheduleEvent(teamEvents, targetDateKey);
    }

    let scheduleSync: LiffMatchScheduleSyncInfo | null = null;
    if (targetEvent) {
      const carpoolsList = await db
        .select({
          id: eventCarpools.id,
          driverName: teamMembers.name,
          capacity: eventCarpools.capacity,
          carType: eventCarpools.carType,
          carName: memberCars.name,
          carColor: memberCars.color,
          numberPlate: memberCars.numberPlate,
        })
        .from(eventCarpools)
        .leftJoin(teamMembers, eq(eventCarpools.driverId, teamMembers.id))
        .leftJoin(memberCars, eq(eventCarpools.carId, memberCars.id))
        .where(eq(eventCarpools.eventId, targetEvent.id))
        .all();

      const carpoolIds = carpoolsList.map((car) => car.id);
      const allRiders =
        carpoolIds.length > 0
          ? await db
              .select({
                carpoolId: eventCarpoolRiders.carpoolId,
                riderPlayerName: players.name,
                riderMemberName: teamMembers.name,
                riderMemberType: teamMembers.memberType,
              })
              .from(eventCarpoolRiders)
              .leftJoin(players, eq(eventCarpoolRiders.playerId, players.id))
              .leftJoin(teamMembers, eq(eventCarpoolRiders.memberId, teamMembers.id))
              .where(inArray(eventCarpoolRiders.carpoolId, carpoolIds))
              .all()
          : [];

      const ridersByCarpoolId = new Map<string, typeof allRiders>();
      for (const r of allRiders) {
        if (!r.carpoolId) continue;
        const list = ridersByCarpoolId.get(r.carpoolId) || [];
        list.push(r);
        ridersByCarpoolId.set(r.carpoolId, list);
      }

      const cars: LiffMatchScheduleCarpoolCar[] = carpoolsList.map((car, index) => {
        const riders = ridersByCarpoolId.get(car.id) || [];
        const passengers = riders.map((r) => {
          if (r.riderPlayerName) {
            return { name: `${r.riderPlayerName} (選手)`, type: "player" as const };
          }
          return {
            name: `${r.riderMemberName || "メンバー"} (${
              r.riderMemberType === "staff" ? "指導者" : "保護者"
            })`,
            type: "adult" as const,
          };
        });

        return {
          carNumber: index + 1,
          driverName: car.driverName || "ドライバー",
          carModel: car.carName
            ? `${car.carName}${car.carColor ? ` (${car.carColor})` : ""}`
            : "登録車",
          plate: car.numberPlate || "未登録",
          capacity: car.capacity || 4,
          isCargo: car.carType === "cargo",
          passengers,
        };
      });

      const gatherTimeRaw = resolveEventDisplayStartTime(targetEvent.startAt, targetDateKey);
      scheduleSync = {
        eventId: targetEvent.id,
        title: targetEvent.title,
        dutyGroup: targetEvent.dutyGroup || null,
        needsLunch: toBoolean(targetEvent.needsLunch, false),
        needsSnack: toBoolean(targetEvent.needsSnack, false),
        gatherTime: gatherTimeRaw ? `${gatherTimeRaw}頃` : null,
        gatherLocation: targetEvent.location || null,
        destination: targetEvent.location || null,
        cars,
      };
    }

    const responsePayload: LiffMatchOpsContextResponse = {
      success: true,
      isDemo: false,
      adultMembers,
      myIdentity,
      scheduleSync,
    };
    return c.json(responsePayload);
  } catch (error) {
    console.error("Failed to load match-ops-context:", error);
    const fallbackPayload: LiffMatchOpsContextResponse = {
      success: false,
      adultMembers: [],
      myIdentity: {
        memberId: null,
        memberName: null,
        displayName: null,
        childNames: [],
      },
      scheduleSync: null,
    };
    return c.json(fallbackPayload, 500);
  }
});

/**
 * 球場・グラウンド一覧取得API
 */
app.get("/grounds", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  const DEMO_VENUES = [
    {
      id: "venue-3",
      name: "桜本小学校 グラウンド (ホーム)",
      shortName: "桜本小 (ホーム)",
      category: "home",
      categoryLabel: "本拠地・ホーム",
      address: "神奈川県川崎市川崎区桜本1-10-1",
      mapUrl: "https://maps.google.com/?q=川崎市立桜本小学校",
      surface: "土 (クレー)",
      spikeRule: "ポイントスパイクまたはトレーニングシューズ",
      parkingInfo: "正門から入り体育館裏へ（事前登録車のみ3台まで駐車可）。近隣コインPあり。",
      notes: "学校敷地内です。近隣住宅へのボール飛び出し防止ネットの確認必須。ゴミは全て持ち帰り。",
    },
    {
      id: "venue-2",
      name: "川崎市等々力球場",
      shortName: "等々力球場",
      category: "stadium",
      categoryLabel: "球場・公営",
      address: "神奈川県川崎市中原区等々力1-1",
      mapUrl: "https://maps.google.com/?q=等々力球場",
      surface: "人工芝 (全面)",
      spikeRule: "⚠️ 金具スパイク禁止 (ポイント・アップシューズのみ)",
      parkingInfo: "等々力緑地公園 東駐車場を利用（有料）。満車の可能性が高いため乗り合い必須。",
      notes: "屋根付きスタンドあり。更衣室・シャワー完備。敷地内全面禁煙。",
    },
    {
      id: "venue-1",
      name: "多摩川緑地野球場 (多摩川緑地広場)",
      shortName: "多摩川緑地 (1面・2面)",
      category: "stadium",
      categoryLabel: "球場・公営",
      address: "神奈川県川崎市高津区二子地先",
      mapUrl: "https://maps.google.com/?q=多摩川緑地野球場",
      surface: "土 (内野) / 天然芝 (外野)",
      spikeRule: "金具スパイク可 / ポイント推奨",
      parkingInfo: "第1駐車場（土日祝は1台500円）。チーム枠4台まで。河川敷道路は徐行厳守。",
      notes: "水道あり・簡易トイレあり。自販機は土手上にあり。雨天後はグラウンド水はけ注意。",
    },
    {
      id: "venue-4",
      name: "宮崎中学校 野球場",
      shortName: "宮崎中",
      category: "school",
      categoryLabel: "学校・地域",
      address: "神奈川県川崎市宮前区宮崎100",
      mapUrl: "https://maps.google.com/?q=川崎市立宮崎中学校",
      surface: "土 (クレー)",
      spikeRule: "金具禁止・ポイントスパイクのみ",
      parkingInfo: "体育館横スペース（チーム最大4台・要駐車証掲示）。",
      notes: "校内完全禁煙。通用門の施錠確認を徹底してください。",
    },
    {
      id: "venue-5",
      name: "かわさきベースボールラボ (室内練習場)",
      shortName: "川崎インドア",
      category: "indoor",
      categoryLabel: "室内・練習場",
      address: "神奈川県川崎市幸区南幸町2-15",
      mapUrl: "https://maps.google.com/?q=川崎市幸区南幸町2-15",
      surface: "人工芝 (室内)",
      spikeRule: "⚠️ スパイク禁止 (アップシューズ・スニーカーのみ)",
      parkingInfo: "施設前2台のみ。満車時は隣接コインパーキングをご利用ください。",
      notes: "雨天練習・夜間バッティング対応。マシン打席・ピッチングレーンあり。",
    },
  ];

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        venues: DEMO_VENUES,
      });
    }

    await ensureVenuesColumns(c.env.DB);
    const venuesList = await db.select().from(venues).all();

    if (venuesList.length === 0) {
      return c.json({
        success: true,
        isDemo: false,
        venues: DEMO_VENUES,
      });
    }

    const categoryLabels: Record<string, string> = {
      home: "本拠地・ホーム",
      stadium: "球場・公営",
      school: "学校・地域",
      indoor: "室内・練習場",
    };

    const inferCategory = (name: string, shortName?: string | null, notes?: string | null, cat?: string | null): { category: string; categoryLabel: string } => {
      if (cat && categoryLabels[cat]) {
        return { category: cat, categoryLabel: categoryLabels[cat] };
      }
      const text = `${name} ${shortName || ""} ${notes || ""}`;
      if (text.includes("ホーム") || text.includes("本拠地") || text.includes("専用") || text.includes("拠点")) {
        return { category: "home", categoryLabel: "本拠地・ホーム" };
      }
      if (text.includes("小学校") || text.includes("中学校") || text.includes("高校") || text.includes("大学") || text.includes("学校")) {
        return { category: "school", categoryLabel: "学校・地域" };
      }
      if (text.includes("室内") || text.includes("インドア") || text.includes("ドーム") || text.includes("練習場") || text.includes("バッティング")) {
        return { category: "indoor", categoryLabel: "室内・練習場" };
      }
      return { category: "stadium", categoryLabel: "球場・公営" };
    };

    const formatted = await Promise.all(
      venuesList.map(async (v) => {
        const catInfo = inferCategory(v.name, v.shortName, v.notes, v.category);
        const rawMapUrl = (v.mapUrl || "").trim();
        let resolvedEmbedMapUrl = "";
        if (rawMapUrl) {
          const expanded = isGoogleMapsShortUrl(rawMapUrl)
            ? await expandGoogleMapsShortUrl(rawMapUrl)
            : rawMapUrl;
          resolvedEmbedMapUrl = buildGoogleMapsEmbedFromUrl(expanded);
        }
        return {
          id: v.id,
          name: v.name,
          shortName: v.shortName || v.name,
          category: catInfo.category,
          categoryLabel: catInfo.categoryLabel,
          address: v.address || "住所未登録",
          mapUrl:
            rawMapUrl ||
            `https://maps.google.com/?q=${encodeURIComponent(v.address || v.name)}`,
          embedMapUrl: resolvedEmbedMapUrl || undefined,
          surface:
            v.surfaceType === "artificial_turf" || v.surfaceType === "turf"
              ? "人工芝"
              : v.surfaceType === "natural_turf" || v.surfaceType === "grass"
              ? "天然芝"
              : v.surfaceType || "土 (クレー)",
          spikeRule: v.spikeRule || "ポイントスパイクまたはトレーニングシューズ",
          parkingInfo: v.parkingInfo || "駐車場ルールは管理者にお問い合わせください",
          notes: v.notes || "",
        };
      })
    );

    return c.json({
      success: true,
      isDemo: false,
      venues: formatted,
    });
  } catch (error: any) {
    console.error("Failed to load liff grounds:", error);
    return c.json({ success: true, isDemo: true, venues: DEMO_VENUES });
  }
});

/**
 * ➕ 球場・施設 新規登録API
 */
app.post("/grounds", async (c) => {
  await ensureVenuesColumns(c.env.DB);
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json<{
      name: string;
      shortName?: string;
      category?: string;
      address?: string;
      mapUrl?: string;
      surface?: string;
      parkingInfo?: string;
      spikeRule?: string;
      notes?: string;
      teamId?: string;
    }>();

    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "球場・施設名は必須です" }, 400);
    }

    if (body.teamId === "demo-team") {
      return c.json({ success: true, id: `demo-venue-${Date.now()}`, message: "施設を登録しました（デモ）" });
    }

    const newId = crypto.randomUUID();
    const mapUrl = body.mapUrl?.trim() || `https://maps.google.com/?q=${encodeURIComponent(body.address || body.name)}`;

    await db.insert(venues).values({
      id: newId,
      name: body.name.trim(),
      shortName: body.shortName?.trim() || body.name.trim(),
      category: body.category || "stadium",
      address: body.address?.trim() || null,
      mapUrl: mapUrl,
      surfaceType: body.surface?.trim() || "土 (クレー)",
      parkingInfo: body.parkingInfo?.trim() || null,
      spikeRule: body.spikeRule?.trim() || null,
      notes: body.notes?.trim() || null,
    });

    return c.json({ success: true, id: newId });
  } catch (error: any) {
    console.error("Failed to create ground:", error);
    return c.json({ success: false, error: error.message || "球場・施設の登録に失敗しました" }, 500);
  }
});

/**
 * ✏️ 球場・施設 更新API
 */
app.patch("/grounds/:id", async (c) => {
  await ensureVenuesColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  try {
    const body = await c.req.json<{
      name?: string;
      shortName?: string;
      category?: string;
      address?: string;
      mapUrl?: string;
      surface?: string;
      parkingInfo?: string;
      spikeRule?: string;
      notes?: string;
    }>();

    if (id.startsWith("venue-") || id.startsWith("demo-")) {
      return c.json({ success: true, message: "施設情報を更新しました（デモ）" });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.shortName !== undefined) updateData.shortName = body.shortName ? body.shortName.trim() : null;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.address !== undefined) updateData.address = body.address ? body.address.trim() : null;
    if (body.mapUrl !== undefined) {
      updateData.mapUrl = body.mapUrl ? body.mapUrl.trim() : `https://maps.google.com/?q=${encodeURIComponent(body.address || body.name || "")}`;
    }
    if (body.surface !== undefined) updateData.surfaceType = body.surface ? body.surface.trim() : null;
    if (body.parkingInfo !== undefined) updateData.parkingInfo = body.parkingInfo ? body.parkingInfo.trim() : null;
    if (body.spikeRule !== undefined) updateData.spikeRule = body.spikeRule ? body.spikeRule.trim() : null;
    if (body.notes !== undefined) updateData.notes = body.notes ? body.notes.trim() : null;

    await db.update(venues).set(updateData).where(eq(venues.id, id));

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Failed to update ground:", error);
    return c.json({ success: false, error: error.message || "球場・施設の更新に失敗しました" }, 500);
  }
});

/**
 * 🗑️ 球場・施設 削除API
 */
app.delete("/grounds/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  try {
    if (id.startsWith("venue-") || id.startsWith("demo-")) {
      return c.json({ success: true, message: "施設を削除しました（デモ）" });
    }

    await db.delete(venues).where(eq(venues.id, id));
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete ground:", error);
    return c.json({ success: false, error: error.message || "球場・施設の削除に失敗しました" }, 500);
  }
});

/**
 * チーム成績・スタッツ取得API（勝敗・得失点内訳・試合別スコア・個人打撃/投手成績）
 */
type StatsFilterKey = "all" | "official" | "exchange" | "practice";

interface LiffStatsSummaryPayload {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: string;
  winRatePercent: number;
  runsScored: number;
  runsAllowed: number;
  runDiff: string;
  avgRunsScored: string;
  avgRunsAllowed: string;
  maxRunsScored: number;
  shutouts: number;
  teamHits: number;
  opponentHits: number;
  teamErrors: number;
  opponentErrors: number;
  teamAvg: string;
  teamOps: string;
  teamHomeRuns: number;
  teamStolenBases: number;
  teamEra: string;
}

interface LiffStatsMatchItemPayload {
  id: string;
  date: string;
  opponent: string;
  matchType: "official" | "exchange" | "practice";
  tournamentName: string | null;
  venueName: string | null;
  battingOrder: "first" | "second";
  myScore: number;
  opponentScore: number;
  result: "win" | "loss" | "draw";
  myHits: number;
  opponentHits: number;
  myErrors: number;
  opponentErrors: number;
  isColdGame: boolean;
  isTiebreaker: boolean;
  hasScorebook: boolean;
}

interface LiffSeasonBatterStatPayload {
  id: string;
  name: string;
  uniformNumber: string;
  games: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  totalBases: number;
  rbi: number;
  runs: number;
  walks: number;
  hitByPitch: number;
  strikeouts: number;
  sacBunts: number;
  sacFlies: number;
  stolenBases: number;
  avg: string;
  obp: string;
  ops: string;
}

interface LiffSeasonPitcherStatPayload {
  id: string;
  name: string;
  uniformNumber: string;
  games: number;
  outs: number;
  ip: string;
  battersFaced: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  runs: number;
  earnedRuns: number;
  era: string;
  whip: string;
}

interface LiffStatsSectionPayload {
  summary: LiffStatsSummaryPayload;
  battingStats: LiffSeasonBatterStatPayload[];
  pitchingStats: LiffSeasonPitcherStatPayload[];
}

function formatBaseballRate(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return ".000";
  if (val >= 1) return "1.00";
  return val.toFixed(3).replace(/^0/, "");
}

function formatOpsRate(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return ".000";
  const fixed = val.toFixed(3);
  return fixed.startsWith("0.") ? fixed.slice(1) : fixed;
}

function normalizeStatsMatchCategory(
  rawType: string | null | undefined
): "official" | "exchange" | "practice" {
  if (rawType === "official") return "official";
  if (rawType === "exchange") return "exchange";
  return "practice";
}

function isNonRbiAdvanceReasonForSeason(rawReason: string | null | undefined): boolean {
  const r = String(rawReason || "").trim().toLowerCase();
  if (!r) return false;
  return (
    r === "wp" ||
    r === "pb" ||
    r === "balk" ||
    r === "steal" ||
    r === "pickoff_error" ||
    r === "error" ||
    r === "obstruction" ||
    r.includes("暴投") ||
    r.includes("捕逸") ||
    r.includes("ボーク") ||
    r.includes("盗塁") ||
    r.includes("失策") ||
    r.includes("エラー")
  );
}

function buildDemoStatsResponse() {
  const demoMatches: LiffStatsMatchItemPayload[] = [
    {
      id: "demo-match-1",
      date: "2026-10-25 13:00",
      opponent: "相模原西リトルシニア",
      matchType: "practice",
      tournamentName: null,
      venueName: "東芝エレベーターG",
      battingOrder: "second",
      myScore: 6,
      opponentScore: 3,
      result: "win",
      myHits: 9,
      opponentHits: 5,
      myErrors: 1,
      opponentErrors: 2,
      isColdGame: false,
      isTiebreaker: false,
      hasScorebook: true,
    },
    {
      id: "demo-match-2",
      date: "2026-10-18 10:00",
      opponent: "横浜青葉ボーイズ",
      matchType: "exchange",
      tournamentName: "秋季一年生交流戦",
      venueName: "多摩川緑地野球場",
      battingOrder: "first",
      myScore: 8,
      opponentScore: 2,
      result: "win",
      myHits: 11,
      opponentHits: 4,
      myErrors: 0,
      opponentErrors: 3,
      isColdGame: false,
      isTiebreaker: false,
      hasScorebook: true,
    },
    {
      id: "demo-match-3",
      date: "2026-10-11 09:00",
      opponent: "中央ベアーズ",
      matchType: "official",
      tournamentName: "市連盟秋季大会 準々決勝",
      venueName: "等々力球場",
      battingOrder: "second",
      myScore: 4,
      opponentScore: 5,
      result: "loss",
      myHits: 7,
      opponentHits: 8,
      myErrors: 2,
      opponentErrors: 1,
      isColdGame: false,
      isTiebreaker: true,
      hasScorebook: true,
    },
    {
      id: "demo-match-4",
      date: "2026-10-04 11:00",
      opponent: "世田谷イーグルス",
      matchType: "official",
      tournamentName: "市連盟秋季大会 2回戦",
      venueName: "多摩川緑地野球場",
      battingOrder: "first",
      myScore: 7,
      opponentScore: 0,
      result: "win",
      myHits: 10,
      opponentHits: 2,
      myErrors: 0,
      opponentErrors: 1,
      isColdGame: true,
      isTiebreaker: false,
      hasScorebook: true,
    },
    {
      id: "demo-match-5",
      date: "2026-09-27 13:30",
      opponent: "港北ファイターズ",
      matchType: "exchange",
      tournamentName: "秋季一年生交流戦",
      venueName: "新横浜少年野球場",
      battingOrder: "second",
      myScore: 5,
      opponentScore: 5,
      result: "draw",
      myHits: 8,
      opponentHits: 7,
      myErrors: 1,
      opponentErrors: 1,
      isColdGame: false,
      isTiebreaker: false,
      hasScorebook: true,
    },
  ];

  const demoBatters: LiffSeasonBatterStatPayload[] = [
    {
      id: "demo-player-1",
      name: "山田 翔太",
      uniformNumber: "10",
      games: 14,
      plateAppearances: 37,
      atBats: 32,
      hits: 14,
      doubles: 4,
      triples: 1,
      homeRuns: 2,
      totalBases: 26,
      rbi: 11,
      runs: 13,
      walks: 4,
      hitByPitch: 1,
      strikeouts: 3,
      sacBunts: 0,
      sacFlies: 0,
      stolenBases: 7,
      avg: ".438",
      obp: ".514",
      ops: "1.326",
    },
    {
      id: "demo-player-2",
      name: "佐藤 健太",
      uniformNumber: "1",
      games: 14,
      plateAppearances: 34,
      atBats: 31,
      hits: 12,
      doubles: 3,
      triples: 0,
      homeRuns: 1,
      totalBases: 18,
      rbi: 9,
      runs: 10,
      walks: 3,
      hitByPitch: 0,
      strikeouts: 4,
      sacBunts: 0,
      sacFlies: 0,
      stolenBases: 4,
      avg: ".387",
      obp: ".441",
      ops: "1.022",
    },
    {
      id: "demo-player-6",
      name: "渡辺 陽向",
      uniformNumber: "4",
      games: 14,
      plateAppearances: 38,
      atBats: 33,
      hits: 12,
      doubles: 2,
      triples: 1,
      homeRuns: 3,
      totalBases: 25,
      rbi: 14,
      runs: 12,
      walks: 5,
      hitByPitch: 0,
      strikeouts: 5,
      sacBunts: 0,
      sacFlies: 0,
      stolenBases: 6,
      avg: ".364",
      obp: ".447",
      ops: "1.205",
    },
    {
      id: "demo-player-4",
      name: "高橋 陸",
      uniformNumber: "8",
      games: 13,
      plateAppearances: 36,
      atBats: 31,
      hits: 11,
      doubles: 2,
      triples: 1,
      homeRuns: 1,
      totalBases: 18,
      rbi: 8,
      runs: 11,
      walks: 4,
      hitByPitch: 1,
      strikeouts: 4,
      sacBunts: 0,
      sacFlies: 0,
      stolenBases: 9,
      avg: ".355",
      obp: ".444",
      ops: "1.025",
    },
    {
      id: "demo-player-3",
      name: "鈴木 大輔",
      uniformNumber: "2",
      games: 14,
      plateAppearances: 35,
      atBats: 30,
      hits: 10,
      doubles: 2,
      triples: 0,
      homeRuns: 1,
      totalBases: 15,
      rbi: 7,
      runs: 8,
      walks: 4,
      hitByPitch: 0,
      strikeouts: 3,
      sacBunts: 1,
      sacFlies: 0,
      stolenBases: 2,
      avg: ".333",
      obp: ".412",
      ops: ".912",
    },
  ];

  const demoPitchers: LiffSeasonPitcherStatPayload[] = [
    {
      id: "demo-player-2",
      name: "佐藤 健太",
      uniformNumber: "1",
      games: 8,
      outs: 72,
      ip: "24.0",
      battersFaced: 88,
      hitsAllowed: 14,
      homeRunsAllowed: 1,
      strikeouts: 28,
      walks: 5,
      hitByPitch: 1,
      runs: 7,
      earnedRuns: 5,
      era: "1.46",
      whip: "0.79",
    },
    {
      id: "demo-player-4",
      name: "高橋 陸",
      uniformNumber: "8",
      games: 6,
      outs: 54,
      ip: "18.0",
      battersFaced: 62,
      hitsAllowed: 11,
      homeRunsAllowed: 0,
      strikeouts: 19,
      walks: 4,
      hitByPitch: 1,
      runs: 6,
      earnedRuns: 5,
      era: "1.94",
      whip: "0.83",
    },
    {
      id: "demo-player-10",
      name: "小林 樹",
      uniformNumber: "18",
      games: 5,
      outs: 36,
      ip: "12.0",
      battersFaced: 45,
      hitsAllowed: 9,
      homeRunsAllowed: 1,
      strikeouts: 14,
      walks: 3,
      hitByPitch: 0,
      runs: 5,
      earnedRuns: 4,
      era: "2.33",
      whip: "1.00",
    },
  ];

  const makeDemoSummary = (
    totalMatches: number,
    wins: number,
    losses: number,
    draws: number,
    runsScored: number,
    runsAllowed: number,
    maxRunsScored: number,
    shutouts: number
  ): LiffStatsSummaryPayload => {
    const decided = wins + losses;
    const diff = runsScored - runsAllowed;
    return {
      totalMatches,
      wins,
      losses,
      draws,
      winRate: decided > 0 ? formatBaseballRate(wins / decided) : ".000",
      winRatePercent: decided > 0 ? Math.round((wins / decided) * 100) : 0,
      runsScored,
      runsAllowed,
      runDiff: diff > 0 ? `+${diff}` : `${diff}`,
      avgRunsScored: totalMatches > 0 ? (runsScored / totalMatches).toFixed(1) : "0.0",
      avgRunsAllowed: totalMatches > 0 ? (runsAllowed / totalMatches).toFixed(1) : "0.0",
      maxRunsScored,
      shutouts,
      teamHits: 112,
      opponentHits: 64,
      teamErrors: 11,
      opponentErrors: 19,
      teamAvg: ".342",
      teamOps: ".918",
      teamHomeRuns: 8,
      teamStolenBases: 31,
      teamEra: "1.81",
    };
  };

  const allSummary = makeDemoSummary(14, 10, 3, 1, 86, 42, 11, 2);
  const officialSummary = makeDemoSummary(5, 4, 1, 0, 31, 14, 9, 1);
  const exchangeSummary = makeDemoSummary(5, 3, 1, 1, 32, 16, 8, 1);
  const practiceSummary = makeDemoSummary(4, 3, 1, 0, 23, 12, 7, 0);

  return {
    success: true,
    isDemo: true,
    team: {
      id: DEMO_TEAM.id,
      name: DEMO_TEAM.name,
      orgName: DEMO_TEAM.orgName,
      logoImageUrl: DEMO_TEAM.logoImageUrl,
      year: DEMO_TEAM.year || 2026,
    },
    stats: allSummary,
    sectionsByFilter: {
      all: { summary: allSummary, battingStats: demoBatters, pitchingStats: demoPitchers },
      official: { summary: officialSummary, battingStats: demoBatters, pitchingStats: demoPitchers },
      exchange: { summary: exchangeSummary, battingStats: demoBatters, pitchingStats: demoPitchers },
      practice: { summary: practiceSummary, battingStats: demoBatters, pitchingStats: demoPitchers },
    },
    matches: demoMatches,
  };
}

app.get("/stats", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json(buildDemoStatsResponse());
    }

    const [teamRow, rawTeamMatches, rosterPlayers] = await Promise.all([
      db
        .select({
          id: teams.id,
          name: teams.name,
          orgName: organizations.name,
          year: teams.year,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          id: matches.id,
          date: matches.date,
          opponent: matches.opponent,
          matchType: matches.matchType,
          battingOrder: matches.battingOrder,
          status: matches.status,
          myScore: matches.myScore,
          opponentScore: matches.opponentScore,
          myHits: matches.myHits,
          opponentHits: matches.opponentHits,
          myErrors: matches.myErrors,
          opponentErrors: matches.opponentErrors,
          isColdGame: matches.isColdGame,
          isTiebreaker: matches.isTiebreaker,
          createdAt: matches.createdAt,
          tournamentName: tournaments.name,
          venueShortName: venues.shortName,
          venueFullName: venues.name,
          surfaceDetails: matches.surfaceDetails,
        })
        .from(matches)
        .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
        .leftJoin(venues, eq(matches.venueId, venues.id))
        .where(eq(matches.teamId, teamId))
        .orderBy(desc(matches.date), desc(matches.createdAt))
        .all(),
      db
        .select({
          id: players.id,
          name: players.name,
          uniformNumber: players.uniformNumber,
        })
        .from(players)
        .where(eq(players.teamId, teamId))
        .all(),
    ]);

    const finishedRaw = rawTeamMatches
      .filter(
        (m) =>
          m.status === "finished" &&
          m.myScore !== null &&
          m.opponentScore !== null
      )
      .sort((a, b) =>
        b.date.replace(/\//g, "-").localeCompare(a.date.replace(/\//g, "-"))
      );

    const finishedIds = finishedRaw.map((m) => m.id);

    const normalizeNameKey = (raw: string | null | undefined): string =>
      (raw || "").replace(/[\s　]+/g, "").trim();

    const playerMetaById = new Map<string, { name: string; uniformNumber: string }>();
    const playerIdByCleanName = new Map<string, string>();
    for (const rp of rosterPlayers) {
      playerMetaById.set(rp.id, {
        name: rp.name,
        uniformNumber: rp.uniformNumber || "-",
      });
      const cn = normalizeNameKey(rp.name);
      if (cn && !playerIdByCleanName.has(cn)) {
        playerIdByCleanName.set(cn, rp.id);
      }
    }

    const chunkIds = (ids: string[], size = 50): string[][] => {
      const out: string[][] = [];
      for (let i = 0; i < ids.length; i += size) {
        out.push(ids.slice(i, i + size));
      }
      return out;
    };

    const allAtBats: Array<typeof atBats.$inferSelect> = [];
    const allAdvances: Array<typeof baseAdvances.$inferSelect> = [];
    const allPlayLogs: Array<{
      atBatId: string | null;
      matchId: string;
      description: string;
    }> = [];
    const allLineups: Array<{
      matchId: string;
      playerId: string;
    }> = [];
    const allSnapshots: Array<typeof matchScorebookSnapshots.$inferSelect> = [];

    if (finishedIds.length > 0) {
      const idChunks = chunkIds(finishedIds, 50);
      for (const batch of idChunks) {
        const [abRows, advRows, plRows, luRows, snapRows] = await db.batch([
          db
            .select()
            .from(atBats)
            .where(inArray(atBats.matchId, batch))
            .orderBy(asc(atBats.inning), asc(atBats.createdAt)),
          db
            .select()
            .from(baseAdvances)
            .where(inArray(baseAdvances.matchId, batch)),
          db
            .select({
              atBatId: playLogs.atBatId,
              matchId: playLogs.matchId,
              description: playLogs.description,
            })
            .from(playLogs)
            .where(inArray(playLogs.matchId, batch)),
          db
            .select({
              matchId: matchLineups.matchId,
              playerId: matchLineups.playerId,
            })
            .from(matchLineups)
            .where(inArray(matchLineups.matchId, batch)),
          db
            .select()
            .from(matchScorebookSnapshots)
            .where(inArray(matchScorebookSnapshots.matchId, batch)),
        ]);
        allAtBats.push(...abRows);
        allAdvances.push(...advRows);
        allPlayLogs.push(...plRows);
        allLineups.push(...luRows);
        allSnapshots.push(...snapRows);
      }
    }

    // スナップショットとプレイログからの補完マップ構築
    const explicitRbiByAtBatId = new Map<string, number>();
    const playLogDescByAtBatId = new Map<string, string>();
    for (const pl of allPlayLogs) {
      if (!pl.atBatId || !pl.description) continue;
      playLogDescByAtBatId.set(pl.atBatId, pl.description);
      const rbiMatch = pl.description.match(/打点(\d+)/);
      if (rbiMatch) {
        explicitRbiByAtBatId.set(pl.atBatId, Number(rbiMatch[1]));
      }
    }

    const extractBatterFromLog = (descText: string | undefined): string => {
      if (!descText) return "";
      const m = descText.match(/^(?:\d+番\s*)?([^:：]+)[：:]/);
      return m ? m[1].trim() : "";
    };

    const matchMetaMap = new Map<
      string,
      { isMyTeamTop: boolean; matchType: "official" | "exchange" | "practice" }
    >();
    for (const m of finishedRaw) {
      matchMetaMap.set(m.id, {
        isMyTeamTop: m.battingOrder === "first",
        matchType: normalizeStatsMatchCategory(m.matchType),
      });
    }

    const snapMapByDbAtBatId = new Map<string, ScorebookV2AtBat>();
    const oppStructureByMatchId = new Map<string, ScorebookSheetStructure>();
    const snapByMatchId = new Map<string, typeof matchScorebookSnapshots.$inferSelect>();
    for (const sn of allSnapshots) {
      snapByMatchId.set(sn.matchId, sn);
    }

    const atBatsByMatchId = new Map<string, Array<typeof atBats.$inferSelect>>();
    for (const ab of allAtBats) {
      const list = atBatsByMatchId.get(ab.matchId) || [];
      list.push(ab);
      atBatsByMatchId.set(ab.matchId, list);
    }

    for (const m of finishedRaw) {
      const sn = snapByMatchId.get(m.id);
      if (!sn) continue;
      const isTop = m.battingOrder === "first";
      const myAtBatsJson = isTop ? sn.topAtBatsJson : sn.bottomAtBatsJson;
      const oppAtBatsJson = isTop ? sn.bottomAtBatsJson : sn.topAtBatsJson;
      const myStructJson = isTop ? sn.topStructureJson : sn.bottomStructureJson;
      const oppStructJson = isTop ? sn.bottomStructureJson : sn.topStructureJson;

      let mySnapAbs: ScorebookV2AtBat[] = [];
      let oppSnapAbs: ScorebookV2AtBat[] = [];
      try {
        if (myAtBatsJson) mySnapAbs = JSON.parse(myAtBatsJson) as ScorebookV2AtBat[];
      } catch {}
      try {
        if (oppAtBatsJson) oppSnapAbs = JSON.parse(oppAtBatsJson) as ScorebookV2AtBat[];
      } catch {}
      try {
        if (myStructJson) {
          const mySt = JSON.parse(myStructJson) as ScorebookSheetStructure;
          for (const slot of mySt.batters || []) {
            if (slot.playerId && slot.name?.trim()) {
              const prev = playerMetaById.get(slot.playerId);
              if (!prev) {
                playerMetaById.set(slot.playerId, {
                  name: slot.name.trim(),
                  uniformNumber: slot.uniformNumber?.trim() || "-",
                });
              }
            }
          }
        }
      } catch {}
      try {
        if (oppStructJson) {
          oppStructureByMatchId.set(
            m.id,
            JSON.parse(oppStructJson) as ScorebookSheetStructure
          );
        }
      } catch {}

      const myQueueByInn = new Map<number, ScorebookV2AtBat[]>();
      for (const sAb of mySnapAbs) {
        const q = myQueueByInn.get(sAb.inning) || [];
        q.push(sAb);
        myQueueByInn.set(sAb.inning, q);
      }
      const oppQueueByInn = new Map<number, ScorebookV2AtBat[]>();
      for (const sAb of oppSnapAbs) {
        const q = oppQueueByInn.get(sAb.inning) || [];
        q.push(sAb);
        oppQueueByInn.set(sAb.inning, q);
      }
      const myOffsets = new Map<number, number>();
      const oppOffsets = new Map<number, number>();
      for (const dbAb of atBatsByMatchId.get(m.id) || []) {
        if (dbAb.isTop === isTop) {
          const idx = myOffsets.get(dbAb.inning) || 0;
          myOffsets.set(dbAb.inning, idx + 1);
          const sAb = myQueueByInn.get(dbAb.inning)?.[idx];
          if (sAb) snapMapByDbAtBatId.set(dbAb.id, sAb);
        } else {
          const idx = oppOffsets.get(dbAb.inning) || 0;
          oppOffsets.set(dbAb.inning, idx + 1);
          const sAb = oppQueueByInn.get(dbAb.inning)?.[idx];
          if (sAb) snapMapByDbAtBatId.set(dbAb.id, sAb);
        }
      }
    }

    const classifyHitKind = (res: string) => {
      const is2B =
        res === "double" ||
        res.includes("2B") ||
        res.includes("二塁打") ||
        res.includes("２塁打");
      const is3B =
        res === "triple" ||
        res.includes("3B") ||
        res.includes("三塁打") ||
        res.includes("３塁打");
      const isHR =
        res === "home_run" || res.includes("HR") || res.includes("本塁打");
      const is1B =
        res === "single" ||
        res.includes("1B") ||
        res.includes("単打") ||
        (res.includes("安") && !is2B && !is3B && !isHR);
      return { is1B, is2B, is3B, isHR, isHit: is1B || is2B || is3B || isHR };
    };

    const isErrorResult = (res: string): boolean =>
      res === "error" ||
      res.includes("E") ||
      res.includes("失策") ||
      res.includes("エラー");

    // 各試合の安打・失策数を打席データからも自動補完し、試合別スコア一覧を生成
    const enrichedMatches: LiffStatsMatchItemPayload[] = finishedRaw.map((m) => {
      const isMyTop = m.battingOrder === "first";
      const mAbs = atBatsByMatchId.get(m.id) || [];
      let calcMyHits = 0;
      let calcOppHits = 0;
      let calcMyErrors = 0;
      let calcOppErrors = 0;

      for (const ab of mAbs) {
        const res = ab.result || "";
        const { isHit } = classifyHitKind(res);
        const err = isErrorResult(res);
        if (ab.isTop === isMyTop) {
          if (isHit) calcMyHits++;
          if (err) calcOppErrors++;
        } else {
          if (isHit) calcOppHits++;
          if (err) calcMyErrors++;
        }
      }

      const myScore = m.myScore ?? 0;
      const oppScore = m.opponentScore ?? 0;
      const result: "win" | "loss" | "draw" =
        myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";

      const venueDisplay =
        m.venueShortName?.trim() ||
        m.venueFullName?.trim() ||
        m.surfaceDetails?.trim() ||
        null;

      return {
        id: m.id,
        date: m.date,
        opponent: m.opponent,
        matchType: normalizeStatsMatchCategory(m.matchType),
        tournamentName: m.tournamentName || null,
        venueName: venueDisplay,
        battingOrder: m.battingOrder === "first" ? "first" : "second",
        myScore,
        opponentScore: oppScore,
        result,
        myHits: Math.max(m.myHits || 0, calcMyHits),
        opponentHits: Math.max(m.opponentHits || 0, calcOppHits),
        myErrors: Math.max(m.myErrors || 0, calcMyErrors),
        opponentErrors: Math.max(m.opponentErrors || 0, calcOppErrors),
        isColdGame: Boolean(m.isColdGame),
        isTiebreaker: Boolean(m.isTiebreaker),
        hasScorebook: mAbs.length > 0,
      };
    });

    const advancesByAtBatId = new Map<string, Array<typeof baseAdvances.$inferSelect>>();
    for (const adv of allAdvances) {
      const arr = advancesByAtBatId.get(adv.atBatId) || [];
      arr.push(adv);
      advancesByAtBatId.set(adv.atBatId, arr);
    }
    const abById = new Map(allAtBats.map((a) => [a.id, a]));

    // スコープ別の集計関数（全体 / 公式戦 / 交流戦 / OP戦）
    const buildSectionForFilter = (filterKey: StatsFilterKey): LiffStatsSectionPayload => {
      const targetMatches =
        filterKey === "all"
          ? enrichedMatches
          : enrichedMatches.filter((m) => m.matchType === filterKey);
      const targetMatchIds = new Set(targetMatches.map((m) => m.id));

      interface BatterAcc {
        id: string;
        name: string;
        uniformNumber: string;
        matchSet: Set<string>;
        plateAppearances: number;
        atBats: number;
        singles: number;
        doubles: number;
        triples: number;
        homeRuns: number;
        hits: number;
        walks: number;
        hitByPitch: number;
        runs: number;
        rbi: number;
        stolenBases: number;
        strikeouts: number;
        sacBunts: number;
        sacFlies: number;
      }

      interface PitcherAcc {
        id: string;
        name: string;
        uniformNumber: string;
        matchSet: Set<string>;
        outs: number;
        battersFaced: number;
        hitsAllowed: number;
        homeRunsAllowed: number;
        strikeouts: number;
        walks: number;
        hitByPitch: number;
        runs: number;
        earnedRuns: number;
      }

      const batterMap = new Map<string, BatterAcc>();
      const pitcherMap = new Map<string, PitcherAcc>();
      const pitcherKeyByAtBatId = new Map<string, string>();

      const ensureBatter = (
        key: string,
        fallbackName: string,
        fallbackNumber = "-"
      ): BatterAcc => {
        const existing = batterMap.get(key);
        if (existing) return existing;
        const meta = playerMetaById.get(key);
        const created: BatterAcc = {
          id: key,
          name: meta?.name || fallbackName || "不明",
          uniformNumber: meta?.uniformNumber || fallbackNumber || "-",
          matchSet: new Set<string>(),
          plateAppearances: 0,
          atBats: 0,
          singles: 0,
          doubles: 0,
          triples: 0,
          homeRuns: 0,
          hits: 0,
          walks: 0,
          hitByPitch: 0,
          runs: 0,
          rbi: 0,
          stolenBases: 0,
          strikeouts: 0,
          sacBunts: 0,
          sacFlies: 0,
        };
        batterMap.set(key, created);
        return created;
      };

      const ensurePitcher = (
        key: string,
        fallbackName: string,
        fallbackNumber = "-"
      ): PitcherAcc => {
        const existing = pitcherMap.get(key);
        if (existing) return existing;
        const meta = playerMetaById.get(key);
        const created: PitcherAcc = {
          id: key,
          name: meta?.name || fallbackName || "不明",
          uniformNumber: meta?.uniformNumber || fallbackNumber || "-",
          matchSet: new Set<string>(),
          outs: 0,
          battersFaced: 0,
          hitsAllowed: 0,
          homeRunsAllowed: 0,
          strikeouts: 0,
          walks: 0,
          hitByPitch: 0,
          runs: 0,
          earnedRuns: 0,
        };
        pitcherMap.set(key, created);
        return created;
      };

      // 出場ラインナップからの試合数記録（実際に打席・個人データが存在する試合のみ対象とし、個人データ削除済み試合のスタメン残存による試合数水増しを防止）
      const matchesWithPersonalData = new Set<string>();
      for (const ab of allAtBats) {
        if (targetMatchIds.has(ab.matchId)) {
          matchesWithPersonalData.add(ab.matchId);
        }
      }
      for (const lu of allLineups) {
        if (
          !targetMatchIds.has(lu.matchId) ||
          !matchesWithPersonalData.has(lu.matchId) ||
          !lu.playerId
        ) {
          continue;
        }
        if (playerMetaById.has(lu.playerId)) {
          ensureBatter(lu.playerId, "").matchSet.add(lu.matchId);
        }
      }

      for (const ab of allAtBats) {
        if (!targetMatchIds.has(ab.matchId)) continue;
        const mMeta = matchMetaMap.get(ab.matchId);
        if (!mMeta) continue;

        const isMyAttack = ab.isTop === mMeta.isMyTeamTop;
        const snapAb = snapMapByDbAtBatId.get(ab.id);
        const res = ab.result || "";

        if (isMyAttack) {
          const fallbackName =
            snapAb?.batterName?.trim() ||
            extractBatterFromLog(playLogDescByAtBatId.get(ab.id)) ||
            "";
          const cleanBatter = normalizeNameKey(fallbackName);
          const batterKey =
            ab.batterId ||
            snapAb?.batterPlayerId ||
            (cleanBatter
              ? playerIdByCleanName.get(cleanBatter) || `name:${cleanBatter}`
              : "");

          if (batterKey && res !== "other" && !res.includes("途中断")) {
            const b = ensureBatter(batterKey, fallbackName);
            b.matchSet.add(ab.matchId);
            b.plateAppearances++;

            const isWalk =
              res === "walk" ||
              res === "intentional_walk" ||
              res.includes("BB") ||
              res.includes("四球") ||
              res.includes("敬遠");
            const isHbp =
              res === "hit_by_pitch" ||
              res.includes("HP") ||
              res.includes("DB") ||
              res.includes("死球");
            const isSacBunt =
              res === "sac_bunt" ||
              res.includes("SH") ||
              res.includes("犠打") ||
              (res.includes("犠") && !res.includes("飛"));
            const isSacFly =
              res === "sac_fly" || res.includes("SF") || res.includes("犠飛");
            const isInterferenceReach =
              res === "interference" || res.includes("打撃妨害");

            if (isWalk) b.walks++;
            if (isHbp) b.hitByPitch++;
            if (isSacBunt) b.sacBunts++;
            if (isSacFly) b.sacFlies++;

            if (
              !isWalk &&
              !isHbp &&
              !isSacBunt &&
              !isSacFly &&
              !isInterferenceReach
            ) {
              b.atBats++;
            }

            const { is1B, is2B, is3B, isHR } = classifyHitKind(res);
            if (isHR) {
              b.homeRuns++;
              b.hits++;
            } else if (is3B) {
              b.triples++;
              b.hits++;
            } else if (is2B) {
              b.doubles++;
              b.hits++;
            } else if (is1B) {
              b.singles++;
              b.hits++;
            }

            const isStrikeoutPlay =
              res === "strikeout" ||
              res === "dropped_third_strike" ||
              res === "dropped_third_strike_out" ||
              res.includes("K") ||
              res.includes("三振") ||
              res.includes("振逃");
            if (isStrikeoutPlay) b.strikeouts++;

            const isDoublePlay =
              res === "double_play" ||
              res === "triple_play" ||
              res.includes("DP") ||
              res.includes("併殺") ||
              res.includes("三重殺") ||
              res.includes("ゲッツー");
            const isErr = isErrorResult(res);

            const abSafeRuns = (advancesByAtBatId.get(ab.id) || []).filter(
              (a) => a.toBase === 4 && !a.isOut
            );
            const snapSelfScored = Boolean(
              snapAb?.advances?.some(
                (a) => a.from === "BAT" && a.to === "HP" && !a.isOut
              )
            );
            const hasBatterSelfRunRow =
              abSafeRuns.some(
                (a) => a.runnerId === batterKey || a.fromBase === 0
              ) ||
              (abSafeRuns.length > 0 && snapSelfScored);

            if (isHR && !hasBatterSelfRunRow) {
              b.runs++;
            }

            const explicitRbi = explicitRbiByAtBatId.get(ab.id);
            const rbiCount =
              typeof explicitRbi === "number"
                ? explicitRbi
                : typeof snapAb?.rbi === "number"
                ? snapAb.rbi
                : isDoublePlay || isErr || isStrikeoutPlay
                ? 0
                : isWalk || isHbp || isInterferenceReach
                ? Math.min(
                    1,
                    abSafeRuns.filter(
                      (a) => !isNonRbiAdvanceReasonForSeason(a.reason)
                    ).length
                  )
                : abSafeRuns.filter(
                    (a) => !isNonRbiAdvanceReasonForSeason(a.reason)
                  ).length + (isHR && !hasBatterSelfRunRow ? 1 : 0);
            b.rbi += rbiCount;
          }

          // 走塁（得点・盗塁）集計
          const abAdvances = advancesByAtBatId.get(ab.id) || [];
          abAdvances.forEach((adv, advIdx) => {
            const snapAdv = snapAb?.advances?.[advIdx];
            const fallbackRunner = snapAdv?.runnerName?.trim() || "";
            const cleanRunner = normalizeNameKey(fallbackRunner);
            const runnerKey =
              adv.runnerId ||
              (cleanRunner
                ? playerIdByCleanName.get(cleanRunner) || `name:${cleanRunner}`
                : "");
            if (!runnerKey) return;

            const rAcc = ensureBatter(runnerKey, fallbackRunner);
            rAcc.matchSet.add(ab.matchId);
            if (adv.toBase === 4 && !adv.isOut) {
              rAcc.runs++;
            }
            const reasonStr = String(adv.reason || "");
            if (
              !adv.isOut &&
              (reasonStr === "steal" ||
                reasonStr.includes("stolen") ||
                reasonStr.includes("SB") ||
                reasonStr.includes("盗塁"))
            ) {
              rAcc.stolenBases++;
            }
          });
        } else {
          // 自チーム守備イニング（投手成績）
          const oppSt = oppStructureByMatchId.get(ab.matchId);
          const fallbackPitcher = snapAb?.pitcherName?.trim() || "";
          const cleanPitcher = normalizeNameKey(fallbackPitcher);
          const matchedStint = oppSt?.pitchers?.find(
            (st) =>
              (ab.pitcherId && st.playerId === ab.pitcherId) ||
              (cleanPitcher && normalizeNameKey(st.name) === cleanPitcher)
          );
          const pitcherKey =
            ab.pitcherId ||
            snapAb?.pitcherPlayerId ||
            matchedStint?.playerId ||
            (cleanPitcher &&
            cleanPitcher !== "相手投手" &&
            cleanPitcher !== "投手" &&
            cleanPitcher !== "不明"
              ? playerIdByCleanName.get(cleanPitcher) || `name:${cleanPitcher}`
              : "");

          if (!pitcherKey) continue;
          pitcherKeyByAtBatId.set(ab.id, pitcherKey);

          const p = ensurePitcher(
            pitcherKey,
            fallbackPitcher,
            matchedStint?.uniformNumber?.trim() || "-"
          );
          p.matchSet.add(ab.matchId);

          if (res !== "other" && !res.includes("途中断")) {
            p.battersFaced++;
          }

          const { isHit, isHR } = classifyHitKind(res);
          if (isHit) p.hitsAllowed++;
          if (isHR) p.homeRunsAllowed++;

          if (
            res === "strikeout" ||
            res === "dropped_third_strike" ||
            res === "dropped_third_strike_out" ||
            res.includes("K") ||
            res.includes("三振") ||
            res.includes("振逃")
          ) {
            p.strikeouts++;
          }
          if (
            res === "walk" ||
            res === "intentional_walk" ||
            res.includes("BB") ||
            res.includes("四球") ||
            res.includes("敬遠")
          ) {
            p.walks++;
          }
          if (
            res === "hit_by_pitch" ||
            res.includes("HP") ||
            res.includes("DB") ||
            res.includes("死球")
          ) {
            p.hitByPitch++;
          }

          const isOut =
            res.includes("アウト") ||
            res.includes("K") ||
            res.includes("三振") ||
            res.includes("ゴロ") ||
            res.includes("フライ") ||
            res.includes("ライナー") ||
            res.includes("併殺") ||
            res.includes("犠") ||
            /^[1-9]-[1-9]$/.test(res) ||
            /^[1-9]F$/.test(res) ||
            /^[1-9]L$/.test(res) ||
            res === "groundout" ||
            res === "flyout" ||
            res === "lineout" ||
            res === "infield_fly" ||
            res === "strikeout" ||
            res === "dropped_third_strike_out" ||
            res === "sac_bunt" ||
            res === "sac_fly" ||
            res === "interference_out" ||
            res === "double_play" ||
            res === "triple_play" ||
            res.includes("DP") ||
            res.includes("TP");

          if (isOut) {
            if (
              res === "triple_play" ||
              res.includes("三重殺") ||
              res.includes("TP")
            ) {
              p.outs += 3;
            } else if (
              res === "double_play" ||
              res.includes("併殺") ||
              res.includes("DP")
            ) {
              p.outs += 2;
            } else {
              p.outs += 1;
            }
          }

          const defAdvances = advancesByAtBatId.get(ab.id) || [];
          for (const adv of defAdvances) {
            const rStr = String(adv.reason || "");
            if (
              adv.isOut &&
              adv.fromBase > 0 &&
              (rStr === "caught_stealing" ||
                rStr === "pickoff_out" ||
                rStr === "interference_out" ||
                rStr === "appeal_out" ||
                rStr === "out_on_base" ||
                rStr.includes("盗塁") ||
                rStr.includes("牽制"))
            ) {
              p.outs += 1;
            }
            if (adv.toBase === 4 && !adv.isOut) {
              p.runs += 1;
              const lowReason = rStr.toLowerCase();
              const lowAbRes = res.toLowerCase();
              const isUnearned =
                lowReason === "error" ||
                lowReason === "pb" ||
                lowReason === "pickoff_error" ||
                lowReason.includes("失策") ||
                lowReason.includes("エラー") ||
                lowReason.includes("捕逸") ||
                lowAbRes === "error" ||
                lowAbRes.includes("失策") ||
                lowAbRes.includes("エラー");
              if (!isUnearned) {
                p.earnedRuns += 1;
              }
            }
          }
        }
      }

      const battingStats: LiffSeasonBatterStatPayload[] = Array.from(
        batterMap.values()
      )
        .filter(
          (b) =>
            b.plateAppearances > 0 ||
            b.runs > 0 ||
            b.stolenBases > 0 ||
            b.rbi > 0
        )
        .map((b) => {
          const totalBases =
            b.singles + b.doubles * 2 + b.triples * 3 + b.homeRuns * 4;
          const avgNum = b.atBats > 0 ? b.hits / b.atBats : 0;
          const obpDenom = b.atBats + b.walks + b.hitByPitch + b.sacFlies;
          const obpNum =
            obpDenom > 0 ? (b.hits + b.walks + b.hitByPitch) / obpDenom : 0;
          const slgNum = b.atBats > 0 ? totalBases / b.atBats : 0;
          return {
            id: b.id,
            name: b.name,
            uniformNumber: b.uniformNumber,
            games: b.matchSet.size,
            plateAppearances: b.plateAppearances,
            atBats: b.atBats,
            hits: b.hits,
            doubles: b.doubles,
            triples: b.triples,
            homeRuns: b.homeRuns,
            totalBases,
            rbi: b.rbi,
            runs: b.runs,
            walks: b.walks,
            hitByPitch: b.hitByPitch,
            strikeouts: b.strikeouts,
            sacBunts: b.sacBunts,
            sacFlies: b.sacFlies,
            stolenBases: b.stolenBases,
            avg: b.atBats > 0 ? formatBaseballRate(avgNum) : ".000",
            obp: obpDenom > 0 ? formatBaseballRate(obpNum) : ".000",
            ops:
              b.atBats > 0 || obpDenom > 0
                ? formatOpsRate(obpNum + slgNum)
                : ".000",
          };
        })
        .sort((a, b) => {
          if (b.hits !== a.hits) return b.hits - a.hits;
          if (b.rbi !== a.rbi) return b.rbi - a.rbi;
          return b.plateAppearances - a.plateAppearances;
        });

      const pitchingStats: LiffSeasonPitcherStatPayload[] = Array.from(
        pitcherMap.values()
      )
        .filter((p) => p.battersFaced > 0 || p.outs > 0)
        .map((p) => {
          const fullInn = Math.floor(p.outs / 3);
          const remOuts = p.outs % 3;
          const ip = remOuts > 0 ? `${fullInn}.${remOuts}` : `${fullInn}.0`;
          const eraVal = p.outs > 0 ? (p.earnedRuns * 7 * 3) / p.outs : 0;
          const whipVal =
            p.outs > 0 ? ((p.hitsAllowed + p.walks) * 3) / p.outs : 0;
          return {
            id: p.id,
            name: p.name,
            uniformNumber: p.uniformNumber,
            games: p.matchSet.size,
            outs: p.outs,
            ip,
            battersFaced: p.battersFaced,
            hitsAllowed: p.hitsAllowed,
            homeRunsAllowed: p.homeRunsAllowed,
            strikeouts: p.strikeouts,
            walks: p.walks,
            hitByPitch: p.hitByPitch,
            runs: p.runs,
            earnedRuns: p.earnedRuns,
            era: p.outs > 0 ? eraVal.toFixed(2) : "0.00",
            whip: p.outs > 0 ? whipVal.toFixed(2) : "0.00",
          };
        })
        .sort((a, b) => {
          if (b.outs !== a.outs) return b.outs - a.outs;
          return b.strikeouts - a.strikeouts;
        });

      const wins = targetMatches.filter((m) => m.result === "win").length;
      const losses = targetMatches.filter((m) => m.result === "loss").length;
      const draws = targetMatches.filter((m) => m.result === "draw").length;
      const total = targetMatches.length;
      const decided = wins + losses;
      const winRate =
        decided > 0 ? formatBaseballRate(wins / decided) : ".000";
      const winRatePercent =
        decided > 0 ? Math.round((wins / decided) * 100) : 0;

      const runsScored = targetMatches.reduce((acc, m) => acc + m.myScore, 0);
      const runsAllowed = targetMatches.reduce(
        (acc, m) => acc + m.opponentScore,
        0
      );
      const diff = runsScored - runsAllowed;
      const runDiff = diff > 0 ? `+${diff}` : `${diff}`;
      const avgRunsScored =
        total > 0 ? (runsScored / total).toFixed(1) : "0.0";
      const avgRunsAllowed =
        total > 0 ? (runsAllowed / total).toFixed(1) : "0.0";
      const maxRunsScored =
        total > 0 ? Math.max(...targetMatches.map((m) => m.myScore)) : 0;
      const shutouts = targetMatches.filter(
        (m) => m.result === "win" && m.opponentScore === 0
      ).length;

      const totalAB = battingStats.reduce((s, b) => s + b.atBats, 0);
      const totalBatterHits = battingStats.reduce((s, b) => s + b.hits, 0);
      const totalWalks = battingStats.reduce((s, b) => s + b.walks, 0);
      const totalHbp = battingStats.reduce((s, b) => s + b.hitByPitch, 0);
      const totalSf = battingStats.reduce((s, b) => s + b.sacFlies, 0);
      const totalTb = battingStats.reduce((s, b) => s + b.totalBases, 0);
      const totalHr = battingStats.reduce((s, b) => s + b.homeRuns, 0);
      const totalSb = battingStats.reduce((s, b) => s + b.stolenBases, 0);

      const obpDen = totalAB + totalWalks + totalHbp + totalSf;
      const teamObp =
        obpDen > 0 ? (totalBatterHits + totalWalks + totalHbp) / obpDen : 0;
      const teamSlg = totalAB > 0 ? totalTb / totalAB : 0;

      const totalPitcherOuts = pitchingStats.reduce((s, p) => s + p.outs, 0);
      const totalPitcherEr = pitchingStats.reduce(
        (s, p) => s + p.earnedRuns,
        0
      );

      const matchSumMyHits = targetMatches.reduce(
        (s, m) => s + m.myHits,
        0
      );
      const matchSumOppHits = targetMatches.reduce(
        (s, m) => s + m.opponentHits,
        0
      );
      const matchSumMyErr = targetMatches.reduce(
        (s, m) => s + m.myErrors,
        0
      );
      const matchSumOppErr = targetMatches.reduce(
        (s, m) => s + m.opponentErrors,
        0
      );

      return {
        summary: {
          totalMatches: total,
          wins,
          losses,
          draws,
          winRate,
          winRatePercent,
          runsScored,
          runsAllowed,
          runDiff,
          avgRunsScored,
          avgRunsAllowed,
          maxRunsScored,
          shutouts,
          teamHits: Math.max(matchSumMyHits, totalBatterHits),
          opponentHits: matchSumOppHits,
          teamErrors: matchSumMyErr,
          opponentErrors: matchSumOppErr,
          teamAvg: totalAB > 0 ? formatBaseballRate(totalBatterHits / totalAB) : ".000",
          teamOps:
            totalAB > 0 || obpDen > 0
              ? formatOpsRate(teamObp + teamSlg)
              : ".000",
          teamHomeRuns: totalHr,
          teamStolenBases: totalSb,
          teamEra:
            totalPitcherOuts > 0
              ? ((totalPitcherEr * 7 * 3) / totalPitcherOuts).toFixed(2)
              : "0.00",
        },
        battingStats,
        pitchingStats,
      };
    };

    const sectionsByFilter: Record<StatsFilterKey, LiffStatsSectionPayload> = {
      all: buildSectionForFilter("all"),
      official: buildSectionForFilter("official"),
      exchange: buildSectionForFilter("exchange"),
      practice: buildSectionForFilter("practice"),
    };

    return c.json({
      success: true,
      isDemo: false,
      team: {
        id: teamRow?.id || teamId,
        name: teamRow
          ? `${teamRow.orgName ? `${teamRow.orgName} ` : ""}${teamRow.name}`.trim()
          : "チーム",
        orgName: teamRow?.orgName || teamRow?.name || "チーム",
        year: teamRow?.year || new Date().getFullYear(),
      },
      stats: sectionsByFilter.all.summary,
      sectionsByFilter,
      matches: enrichedMatches,
    });
  } catch (error: unknown) {
    console.error("Failed to load liff stats:", error);
    return c.json({
      success: false,
      stats: null,
      error: error instanceof Error ? error.message : "成績データの取得に失敗しました",
    });
  }
});

/**
 * チーム資料一覧取得API (チーム全体共有 + この編成限定)
 */
app.get("/documents", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  const DEMO_DOCUMENTS = [
    {
      id: "demo-doc-1",
      title: "2026年度 チーム規約・父母会会則",
      category: "rules",
      categoryLabel: "規約・会則",
      fileType: "PDF",
      fileSize: "1.2 MB",
      updatedAt: "2026/04/01",
      description: "チームの理念、部費・活動方針、父母会の役割と運営規定に関する基本規約です。",
      fileUrl: "https://example.com/demo-rules.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-2",
      title: "配車・送迎マニュアル & 安全ガイドライン",
      category: "manual",
      categoryLabel: "配車・当番",
      fileType: "PDF",
      fileSize: "840 KB",
      updatedAt: "2026/05/15",
      description: "遠征時の集合場所、ジュニアシートの着用基準、高速代・ガソリン代の精算ルールです。",
      fileUrl: "https://example.com/demo-carpool.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-3",
      title: "29期 秋季遠征合宿のしおり・持ち物表",
      category: "trip",
      categoryLabel: "遠征・合宿",
      fileType: "PDF",
      fileSize: "1.8 MB",
      updatedAt: "2026/08/10",
      description: "29期専用の遠征合宿スケジュール、宿泊先案内、持ち物リスト、健康チェックシートです。",
      fileUrl: "https://example.com/demo-trip.pdf",
      scope: "team",
      scopeLabel: "29期",
    },
    {
      id: "demo-doc-4",
      title: "学童・少年野球 連盟指定用具・服装規定",
      category: "equipment",
      categoryLabel: "用具・服装",
      fileType: "PDF",
      fileSize: "2.1 MB",
      updatedAt: "2026/03/20",
      description: "公式戦で使用可能なバット(JSBBマーク)、ヘルメット、スパイク(金具禁止)、アンダーシャツの規定です。",
      fileUrl: "https://example.com/demo-equipment.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-5",
      title: "スポーツ安全保険 補償内容・事故時対応マニュアル",
      category: "insurance",
      categoryLabel: "保険・安全",
      fileType: "PDF",
      fileSize: "650 KB",
      updatedAt: "2026/04/01",
      description: "怪我や事故が発生した際の初期対応手順、病院受診時の連絡先、保険金請求の流れです。",
      fileUrl: "https://example.com/demo-insurance.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-6",
      title: "2026年度 部費・合宿会計収支報告書（Excel雛形）",
      category: "rules",
      categoryLabel: "規約・会則",
      fileType: "XLSX",
      fileSize: "48 KB",
      updatedAt: "2026/04/10",
      description: "期ごとの部費徴収、遠征費、備品購入の収支を管理・報告するための標準エクセルテンプレートです。",
      fileUrl: "https://example.com/demo-accounting.xlsx",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-7",
      title: "遠征・練習試合 配車管理・交通費精算シート（Excel）",
      category: "manual",
      categoryLabel: "配車・当番",
      fileType: "XLSX",
      fileSize: "64 KB",
      updatedAt: "2026/05/20",
      description: "配車当番、同乗児童、高速道路料金・ガソリン代の割り勘精算を自動計算するエクセルシートです。",
      fileUrl: "https://example.com/demo-carpool-calc.xlsx",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-8",
      title: "2026年度 連盟春季大会 トーナメント組み合わせ表・大会要項",
      category: "match",
      categoryLabel: "大会・試合",
      fileType: "PDF",
      fileSize: "1.4 MB",
      updatedAt: "2026/04/15",
      description: "市少年野球連盟主催 春季公式戦トーナメント組み合わせ、試合会場・審判割当および大会規定です。",
      fileUrl: "https://example.com/demo-tournament.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
  ];

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        documents: DEMO_DOCUMENTS,
      });
    }

    // チームと組織IDを取得
    const currentTeam = await db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!currentTeam) {
      return c.json({ success: true, isDemo: false, documents: [] });
    }

    // 組織全体資料 または この編成限定資料を取得
    const conditions = [eq(teamDocuments.teamId, teamId)];
    if (currentTeam.organizationId) {
      conditions.push(eq(teamDocuments.organizationId, currentTeam.organizationId));
    }

    const docs = await db
      .select()
      .from(teamDocuments)
      .where(or(...conditions))
      .orderBy(desc(teamDocuments.createdAt))
      .all();

    const categoryLabels: Record<string, string> = {
      match: "大会・試合",
      tournament: "大会・試合",
      rules: "規約・会則",
      manual: "配車・当番",
      equipment: "用具・服装",
      insurance: "保険・安全",
      form: "届出書類",
      trip: "遠征・合宿",
      other: "その他",
    };

    const formatted = docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      categoryLabel: categoryLabels[d.category] || "その他",
      fileType: d.fileType || "PDF",
      fileSize: d.fileSize || "ファイル",
      updatedAt: new Date(d.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }),
      description: d.description || "",
      fileUrl: d.fileUrl,
      scope: d.scope,
      scopeLabel: d.scope === "organization" ? "チーム全体" : (currentTeam.name || "編成"),
    }));

    return c.json({
      success: true,
      isDemo: false,
      documents: formatted,
    });
  } catch (error: any) {
    console.error("Failed to load liff documents:", error);
    return c.json({ success: false, documents: [] });
  }
});

/**
 * 📄 資料ファイルアップロード API (POST /api/liff/documents/upload)
 */
app.post("/documents/upload", async (c) => {
  try {
    let file: File | null = null;
    let teamId = "general";

    try {
      const formData = await c.req.formData();
      file = formData.get("file") as File | null;
      const t = formData.get("teamId");
      if (typeof t === "string" && t) teamId = t;
    } catch {
      const body = await c.req.parseBody();
      file = (body["file"] as File) || null;
      if (typeof body["teamId"] === "string" && body["teamId"]) {
        teamId = body["teamId"];
      }
    }

    if (!file || typeof file === "string" || !file.name) {
      return c.json({ success: false, error: "ファイルが選択されていません" }, 400);
    }

    const originalName = file.name || "document.pdf";
    const ext = originalName.split(".").pop()?.toLowerCase() || "pdf";

    let fileType = "PDF";
    if (["xls", "xlsx", "csv"].includes(ext)) fileType = "XLSX";
    else if (["doc", "docx"].includes(ext)) fileType = "DOCX";
    else if (["png", "jpg", "jpeg", "webp"].includes(ext)) fileType = "IMG";
    else if (["ppt", "pptx"].includes(ext)) fileType = "PPTX";

    const sizeBytes = file.size || 0;
    let fileSizeStr = `${(sizeBytes / 1024).toFixed(0)} KB`;
    if (sizeBytes >= 1024 * 1024) {
      fileSizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (c.env.BUCKET) {
      const safeExt = ext.replace(/[^a-z0-9]/gi, "");
      const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
      const r2Key = `documents/${teamId}/${filename}`;

      const mimeType = file.type || (ext === "pdf" ? "application/pdf" : "application/octet-stream");
      const arrayBuffer = await file.arrayBuffer();

      await c.env.BUCKET.put(r2Key, arrayBuffer, {
        httpMetadata: {
          contentType: mimeType,
          contentDisposition: `inline; filename="${encodeURIComponent(originalName)}"`,
        },
        customMetadata: {
          originalName: encodeURIComponent(originalName),
          teamId,
        },
      });

      const fileUrl = `/api/documents/files/${teamId}/${filename}`;

      return c.json({
        success: true,
        fileUrl,
        fileName: originalName,
        fileType,
        fileSize: fileSizeStr,
      });
    }

    return c.json({ success: false, error: "R2ストレージが設定されていません" }, 500);
  } catch (error: any) {
    console.error("Document upload in liff error:", error);
    return c.json({ success: false, error: error?.message || "アップロードに失敗しました" }, 500);
  }
});

/**
 * 資料登録API
 */
app.post("/documents", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, title, category, fileUrl, fileType, fileSize, description, scope, userId } = body;

    if (!teamId || !title || !fileUrl) {
      return c.json({ success: false, error: "teamId, title, fileUrl are required" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, message: "資料を登録しました（デモ）" });
    }

    // チーム情報を取得して organizationId を特定
    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId || null;
    const documentScope = scope === "organization" ? "organization" : "team";

    await db.insert(teamDocuments).values({
      id: `doc_${crypto.randomUUID()}`,
      organizationId: documentScope === "organization" ? organizationId : null,
      teamId: documentScope === "team" ? teamId : null,
      title,
      category: category || "other",
      fileUrl,
      fileType: fileType || "PDF",
      fileSize: fileSize || "WEB",
      description: description || null,
      scope: documentScope,
      createdById: userId || null,
      createdAt: new Date(),
    });

    return c.json({ success: true, message: "資料を登録しました" });
  } catch (error: any) {
    console.error("Failed to create document:", error);
    return c.json({ success: false, error: error?.message || "資料の登録に失敗しました" }, 500);
  }
});

/**
 * ❓ チーム・編成Q&A (FAQ) 一覧取得API
 */
app.get("/faqs", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  const DEMO_FAQS = [
    {
      id: "demo-faq-1",
      category: "rain",
      categoryLabel: "雨天・中止判断",
      question: "雨天時の練習・試合の中止判断はいつ、どこで連絡されますか？",
      answer: "原則として【当日の朝 6:30 まで】にLINEグループおよびチームHUBにて連絡します。グラウンド状態により現地判断となる場合もありますので、連絡があるまでは待機をお願いします。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-2",
      category: "duty",
      categoryLabel: "当番・配車",
      question: "お当番の日に急用や体調不良で行けなくなった場合はどうすればいいですか？",
      answer: "まずは同じ班のメンバーにLINEで連絡し、交代可能かご相談ください。調整がつかない場合は、父母会長または学年幹事へ速やかにご連絡をお願いします。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-3",
      category: "duty",
      categoryLabel: "当番・配車",
      question: "配車時の高速代やガソリン代の精算はどうなりますか？",
      answer: "遠征終了後、配車表に記載された目安金額を元に、同乗した各家庭から運転手の方へ直接現金またはPayPay等でお支払いいただきます（1家族あたり500〜800円程度が目安です）。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-4",
      category: "trip",
      categoryLabel: "遠征・合宿",
      question: "29期の遠征合宿の集合時間とお小遣いの上限は？",
      answer: "集合は川崎駅西口 6:00 厳守です。お小遣いは2,000円以内（飲み物・お土産用）とし、名前を書いた封筒に入れて持たせてください。",
      scope: "team",
      scopeLabel: "29期",
    },
    {
      id: "demo-faq-5",
      category: "equipment",
      categoryLabel: "用具・持ち物",
      question: "バットやスパイクを新しく購入する際の注意点はありますか？",
      answer: "公式戦では全日本軟式野球連盟（JSBB）公認マークのバットが必要です。また、小学生（学童部）は金属刃のスパイクは禁止されており、ポイントスパイクまたはゴム底のみ使用可能です。購入前に監督・コーチにご相談いただくことをおすすめします。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-6",
      category: "equipment",
      categoryLabel: "用具・持ち物",
      question: "夏場の活動時の持ち物や熱中症対策について教えてください。",
      answer: "水筒（2L以上推奨・スポーツドリンク推奨）、氷嚢（アイシング用）、塩分タブレット、着替え用アンダーシャツを必ずご持参ください。ベンチにはチーム用の大型クーラーボックスと氷を用意しています。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-7",
      category: "cost",
      categoryLabel: "部費・保険",
      question: "部費の支払い方法と期限について教えてください。",
      answer: "部費は毎月25日までに指定口座へのお振込み、または父母会会計への手渡しとなります。半期・年間のまとめ払いも可能です。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-8",
      category: "manner",
      categoryLabel: "試合観戦マナー",
      question: "試合の応援やベンチ裏での観戦ルールはありますか？",
      answer: "選手への過度な指示出し（審判へのアピールや暴言）は禁止されています。全力プレーを称える温かい声援と拍手をお願いします。また、球場ごとの指定応援席エリアのルールを遵守してください。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
  ];

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        faqs: DEMO_FAQS,
      });
    }

    // チーム情報を取得して organizationId を特定
    const currentTeam = await db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!currentTeam) {
      return c.json({ success: true, isDemo: false, faqs: [] });
    }

    // 組織全体FAQ または この編成限定FAQを取得
    const conditions = [eq(teamFaqs.teamId, teamId)];
    if (currentTeam.organizationId) {
      conditions.push(eq(teamFaqs.organizationId, currentTeam.organizationId));
    }

    const rows = await db
      .select()
      .from(teamFaqs)
      .where(or(...conditions))
      .orderBy(desc(teamFaqs.createdAt))
      .all();

    const categoryLabels: Record<string, string> = {
      rain: "雨天・中止判断",
      duty: "当番・配車",
      equipment: "用具・持ち物",
      cost: "部費・保険",
      manner: "観戦マナー",
      trip: "遠征・合宿",
      general: "その他・全般",
    };

    const formatted = rows.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      category: f.category,
      categoryLabel: categoryLabels[f.category] || "その他",
      scope: f.scope,
      scopeLabel: f.scope === "organization" ? "チーム全体" : (currentTeam.name || "編成"),
      createdAt: f.createdAt,
    }));

    return c.json({
      success: true,
      isDemo: false,
      faqs: formatted,
    });
  } catch (error: any) {
    console.error("Failed to load liff faqs:", error);
    return c.json({ success: false, faqs: [] });
  }
});

/**
 * ❓ Q&A (FAQ) 新規登録API
 */
app.post("/faqs", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, question, answer, category, scope, userId } = body;

    if (!teamId || !question || !answer) {
      return c.json({ success: false, error: "teamId, question, answer are required" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, message: "Q&Aを登録しました（デモ）" });
    }

    // チーム情報を取得して organizationId を特定
    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId || null;
    const faqScope = scope === "organization" ? "organization" : "team";

    await db.insert(teamFaqs).values({
      id: `faq_${crypto.randomUUID()}`,
      organizationId: faqScope === "organization" ? organizationId : null,
      teamId: faqScope === "team" ? teamId : null,
      question: question.trim(),
      answer: answer.trim(),
      category: category || "general",
      scope: faqScope,
      createdById: userId || null,
      createdAt: new Date(),
    });

    return c.json({ success: true, message: "Q&Aを登録しました" });
  } catch (error: any) {
    console.error("Failed to create faq:", error);
    return c.json({ success: false, error: error?.message || "Q&Aの登録に失敗しました" }, 500);
  }
});

/**
 * 📄 資料更新API (PUT /documents/:id)
 */
app.put("/documents/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const { title, category, fileUrl, fileType, fileSize, description, scope, teamId } = body;

    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "資料を更新しました（デモ）" });
    }

    const currentDoc = await db.select().from(teamDocuments).where(eq(teamDocuments.id, id)).get();
    if (!currentDoc) {
      return c.json({ success: false, error: "指定された資料が見つかりません" }, 404);
    }

    // スコープの切り替え
    let organizationId = currentDoc.organizationId;
    let targetTeamId = currentDoc.teamId;

    if (scope === "organization" && !organizationId && targetTeamId) {
      const team = await db.select({ orgId: teams.organizationId }).from(teams).where(eq(teams.id, targetTeamId)).get();
      organizationId = team?.orgId || null;
      targetTeamId = null;
    } else if (scope === "team" && teamId) {
      targetTeamId = teamId;
      organizationId = null;
    }

    await db
      .update(teamDocuments)
      .set({
        title: title ? title.trim() : currentDoc.title,
        category: category || currentDoc.category,
        fileUrl: fileUrl ? fileUrl.trim() : currentDoc.fileUrl,
        fileType: fileType || currentDoc.fileType,
        fileSize: fileSize || currentDoc.fileSize,
        description: description !== undefined ? description.trim() : currentDoc.description,
        scope: scope || currentDoc.scope,
        organizationId: scope === "organization" ? organizationId : null,
        teamId: scope === "team" ? targetTeamId : null,
      })
      .where(eq(teamDocuments.id, id));

    return c.json({ success: true, message: "資料を更新しました" });
  } catch (error: any) {
    console.error("Failed to update document:", error);
    return c.json({ success: false, error: error?.message || "資料の更新に失敗しました" }, 500);
  }
});

/**
 * 📄 資料削除API (DELETE /documents/:id)
 */
app.delete("/documents/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "資料を削除しました（デモ）" });
    }

    await db.delete(teamDocuments).where(eq(teamDocuments.id, id));
    return c.json({ success: true, message: "資料を削除しました" });
  } catch (error: any) {
    console.error("Failed to delete document:", error);
    return c.json({ success: false, error: error?.message || "資料の削除に失敗しました" }, 500);
  }
});

/**
 * ❓ Q&A更新API (PUT /faqs/:id)
 */
app.put("/faqs/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const { question, answer, category, scope, teamId } = body;

    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "Q&Aを更新しました（デモ）" });
    }

    const currentFaq = await db.select().from(teamFaqs).where(eq(teamFaqs.id, id)).get();
    if (!currentFaq) {
      return c.json({ success: false, error: "指定されたQ&Aが見つかりません" }, 404);
    }

    // スコープの切り替え
    let organizationId = currentFaq.organizationId;
    let targetTeamId = currentFaq.teamId;

    if (scope === "organization" && !organizationId && targetTeamId) {
      const team = await db.select({ orgId: teams.organizationId }).from(teams).where(eq(teams.id, targetTeamId)).get();
      organizationId = team?.orgId || null;
      targetTeamId = null;
    } else if (scope === "team" && teamId) {
      targetTeamId = teamId;
      organizationId = null;
    }

    await db
      .update(teamFaqs)
      .set({
        question: question ? question.trim() : currentFaq.question,
        answer: answer ? answer.trim() : currentFaq.answer,
        category: category || currentFaq.category,
        scope: scope || currentFaq.scope,
        organizationId: scope === "organization" ? organizationId : null,
        teamId: scope === "team" ? targetTeamId : null,
      })
      .where(eq(teamFaqs.id, id));

    return c.json({ success: true, message: "Q&Aを更新しました" });
  } catch (error: any) {
    console.error("Failed to update faq:", error);
    return c.json({ success: false, error: error?.message || "Q&Aの更新に失敗しました" }, 500);
  }
});

/**
 * ❓ Q&A削除API (DELETE /faqs/:id)
 */
app.delete("/faqs/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "Q&Aを削除しました（デモ）" });
    }

    await db.delete(teamFaqs).where(eq(teamFaqs.id, id));
    return c.json({ success: true, message: "Q&Aを削除しました" });
  } catch (error: any) {
    console.error("Failed to delete faq:", error);
    return c.json({ success: false, error: error?.message || "Q&Aの削除に失敗しました" }, 500);
  }
});

/**
 * ⚾ 試合一覧取得API (GET /matches?teamId=xxx)
 */
app.get("/matches", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        matches: DEMO_MATCHES,
      });
    }

    const matchesList = await db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        youtubeUrl: matches.youtubeUrl,
        matchType: matches.matchType,
        tournamentName: tournaments.name,
        venueName: venues.name,
        venueShortName: venues.shortName,
        venueParkingInfo: venues.parkingInfo,
        surfaceDetails: matches.surfaceDetails,
        battingOrder: matches.battingOrder,
        innings: matches.innings,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
        myHits: matches.myHits,
        opponentHits: matches.opponentHits,
        myErrors: matches.myErrors,
        opponentErrors: matches.opponentErrors,
        matchDayOps: matches.matchDayOps,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(sql`replace(${matches.date}, '/', '-')`), desc(matches.createdAt))
      .all();

    const secondScheduleSyncMap = await buildScheduledMatchCarpoolSyncMap(
      db,
      teamId,
      matchesList
    );

    const formattedMatches = matchesList.map(({ matchDayOps: rawMatchDayOps, ...m }) => ({
      ...m,
      myInningScores: typeof m.myInningScores === "string" ? JSON.parse(m.myInningScores || "[]") : (m.myInningScores || []),
      opponentInningScores: typeof m.opponentInningScores === "string" ? JSON.parse(m.opponentInningScores || "[]") : (m.opponentInningScores || []),
      matchDayOps: parseMatchDayOpsJson(rawMatchDayOps),
      scheduleSync: secondScheduleSyncMap.get(m.id) || null,
    }));

    return c.json({
      success: true,
      isDemo: false,
      matches: formattedMatches,
    });
  } catch (error: any) {
    console.error("Failed to load liff matches:", error);
    return c.json({ success: false, error: error?.message || "試合一覧の取得に失敗しました", matches: [] }, 500);
  }
});

// ========================================================
// ⚠️ チーム・編成別 注意事項 (Rules / Guidelines) API
// ========================================================

const DEMO_RULES = [
  {
    id: "demo-rule-0",
    category: "match",
    categoryLabel: "試合・遠征",
    title: "公式戦・遠征時の集合厳守とお弁当・補食の準備",
    content: "・公式戦当日は試合開始2時間前集合を原則とし、遅刻・欠席の連絡は集合30分前までに必ず学年幹事へご連絡ください。\n・遠征時のお弁当は消化が良く傷みにくいもの（おにぎり・サンドイッチ等）をご用意ください（ゼリー飲料や塩分補給タブレット等の捕食も推奨）。\n・遠征時のお小遣いは原則2,000円以内とし、財布や貴重品には必ず記名をお願いします。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 0,
    isImportant: true,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
  {
    id: "demo-rule-1",
    category: "carpool",
    categoryLabel: "配車・送迎",
    title: "配車時のチャイルドシート着用と車内飲食マナー",
    content: "・小学生未満またはジュニアシートが必要なお子様が同乗する場合は、保護者間で必ず専用シートの貸し借り・装着を行ってください。\n・車内での飲食は原則フタ付きの飲み物（水筒・ペットボトル）のみとし、お菓子やアイス等の車内飲食はご遠慮ください。\n・泥汚れ防止のため、乗車前に靴の泥を落とし、必要に応じてタオル等を座席に敷くようご協力をお願いします。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 1,
    isImportant: true,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
  {
    id: "demo-rule-2",
    category: "duty",
    categoryLabel: "当番・保護者",
    title: "お当番の活動服装と救急キット・水分確認",
    content: "・お当番時は動きやすい服装・運動靴でご参加ください（サンダル・ヒール等は怪我防止のため不可）。\n・集合時にチーム救急箱（AED・冷却パック・テーピング・消毒液）の所在と、予備ジャグの水・スポーツドリンク残量をご確認ください。\n・活動中に体調不良（熱中症の初期症状等）が見られる選手がいた場合は、無理をさせず直ちに日陰で休ませ、指導者へ報告してください。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 2,
    isImportant: false,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
  {
    id: "demo-rule-3",
    category: "venue",
    categoryLabel: "グラウンド・観戦",
    title: "球場利用時の駐車マナー・喫煙ルールおよびゴミ持ち帰り",
    content: "・各グラウンドごとに指定された駐車可能台数・指定エリアを厳守してください（近隣の商業施設や路上への無断駐車は厳禁です）。\n・球場敷地内および周辺道路は【全面禁煙】です。\n・発生したゴミ（空き缶・ペットボトル・テーピング等）は各自およびチームで必ずすべて持ち帰りをお願いします。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 3,
    isImportant: false,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
  {
    id: "demo-rule-4",
    category: "equipment",
    categoryLabel: "用具・ユニフォーム",
    title: "試合用ユニフォームの着こなし規定と忘れ物防止",
    content: "・公式戦・練習試合時は、指定ユニフォーム・帽子・アンダーシャツ・ソックス・ベルトを正しく着用してください。\n・バット・グローブ・ヘルメット・水筒等のすべての持ち物に、必ず油性ペンで【氏名（フルネーム）】を明記してください。\n・ベンチ内での用具整理整頓（バットケース・ヘルメット掛けの活用）を選手自ら徹底するよう指導しています。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 4,
    isImportant: false,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
  {
    id: "demo-rule-5",
    category: "safety",
    categoryLabel: "熱中症・安全管理",
    title: "夏期練習時の水分補給（2L以上）と氷嚢持参の徹底",
    content: "・5月〜10月の活動時は、最低2L以上の水分（スポーツドリンク推奨）と、アイシング用の【氷嚢（または保冷剤）】を必ず持参してください。\n・朝の検温を行い、37.0℃以上の発熱や倦怠感・睡眠不足がある場合は無理をせず参加を見合わせてください。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 5,
    isImportant: true,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
  {
    id: "demo-rule-6",
    category: "emergency",
    categoryLabel: "雨天・緊急連絡",
    title: "雨天時の活動可否判断基準とLINE連絡タイミング",
    content: "・雨天による活動中止・時間変更の判断は、原則として【当日朝 6:30 まで】にLINEグループにて一斉連絡します。\n・連絡があるまでは各自集合場所へ向かう準備をして待機をお願いします。\n・急な天候悪化により現地で活動打ち切りとなる場合も、速やかにLINEにてお迎え等の連絡を行います。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 6,
    isImportant: false,
    imageUrl: null,
    pdfUrl: null,
    pdfName: null,
  },
];

/**
 * 📷 / 📄 ルール & 注意事項 添付ファイル（画像・PDF）アップロード API (POST /rules/upload)
 */
app.post("/rules/upload", async (c) => {
  try {
    let file: File | null = null;
    let teamId = "general";

    try {
      const formData = await c.req.formData();
      file = formData.get("file") as File | null;
      const t = formData.get("teamId");
      if (typeof t === "string" && t) teamId = t;
    } catch {
      const body = await c.req.parseBody();
      file = (body["file"] as File) || null;
      if (typeof body["teamId"] === "string" && body["teamId"]) {
        teamId = body["teamId"];
      }
    }

    if (!file || typeof file === "string" || !file.name) {
      return c.json({ success: false, error: "ファイルが選択されていません" }, 400);
    }

    const originalName = file.name || "rule_file";
    const ext = originalName.split(".").pop()?.toLowerCase() || "";
    const isPdf = ext === "pdf" || file.type === "application/pdf";

    // R2バケットが使える場合
    if (c.env.BUCKET) {
      const safeExt = ext.replace(/[^a-z0-9]/gi, "") || (isPdf ? "pdf" : "jpg");
      const filename = `rules/${teamId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
      const mimeType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
      const arrayBuffer = await file.arrayBuffer();

      await c.env.BUCKET.put(filename, arrayBuffer, {
        httpMetadata: {
          contentType: mimeType,
          contentDisposition: `inline; filename="${encodeURIComponent(originalName)}"`,
        },
      });

      const fileUrl = `/api/images/${filename}`;
      return c.json({
        success: true,
        fileUrl,
        imageUrl: isPdf ? null : fileUrl,
        pdfUrl: isPdf ? fileUrl : null,
        fileName: originalName,
        isPdf,
      });
    }

    // R2バケットがないローカル/フォールバック環境: Base64 Data URL
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const mimeType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return c.json({
      success: true,
      fileUrl: dataUrl,
      imageUrl: isPdf ? null : dataUrl,
      pdfUrl: isPdf ? dataUrl : null,
      fileName: originalName,
      isPdf,
    });
  } catch (error: any) {
    console.error("Rules file upload error:", error);
    return c.json({ success: false, error: error?.message || "ファイルのアップロードに失敗しました" }, 500);
  }
});

/**
 * ⚠️ チーム・編成 ルール & 注意事項 (Rules) 一覧取得API
 */
app.get("/rules", async (c) => {
  await ensureRulesTable(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        rules: DEMO_RULES,
      });
    }

    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
        teamName: teams.name,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId;

    const conditions = [];
    if (organizationId) {
      conditions.push(eq(teamRules.organizationId, organizationId));
    }
    conditions.push(eq(teamRules.teamId, teamId));

    const rulesList = await db
      .select({
        id: teamRules.id,
        title: teamRules.title,
        content: teamRules.content,
        category: teamRules.category,
        scope: teamRules.scope,
        priority: teamRules.priority,
        isImportant: teamRules.isImportant,
        imageUrl: teamRules.imageUrl,
        pdfUrl: teamRules.pdfUrl,
        pdfName: teamRules.pdfName,
        createdAt: teamRules.createdAt,
        organizationId: teamRules.organizationId,
        teamId: teamRules.teamId,
      })
      .from(teamRules)
      .where(or(...conditions))
      .orderBy(desc(teamRules.isImportant), asc(teamRules.priority), desc(teamRules.createdAt))
      .all();

    const categoryLabels: Record<string, string> = {
      match: "試合・遠征",
      carpool: "配車・送迎",
      duty: "当番・保護者",
      venue: "グラウンド・観戦",
      equipment: "用具・ユニフォーム",
      safety: "熱中症・安全管理",
      emergency: "雨天・緊急連絡",
      general: "その他・心得",
    };

    const formattedRules = rulesList.map((r) => {
      const isOrg = r.scope === "organization" || !!r.organizationId;
      return {
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        categoryLabel: categoryLabels[r.category] || "その他",
        scope: (isOrg ? "organization" : "team") as "organization" | "team",
        scopeLabel: isOrg ? "チーム全体" : (currentTeam?.teamName || "編成"),
        priority: r.priority || 0,
        isImportant: toBoolean(r.isImportant, false),
        imageUrl: r.imageUrl || null,
        pdfUrl: r.pdfUrl || null,
        pdfName: r.pdfName || null,
      };
    });

    return c.json({
      success: true,
      isDemo: false,
      rules: formattedRules.length > 0 ? formattedRules : DEMO_RULES,
    });
  } catch (error: any) {
    console.error("Failed to load rules:", error);
    return c.json({
      success: true,
      isDemo: false,
      rules: DEMO_RULES,
    });
  }
});

/**
 * ⚠️ ルール & 注意事項 新規登録API
 */
app.post("/rules", async (c) => {
  await ensureRulesTable(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, title, content, category, scope, userId, priority, isImportant, imageUrl, pdfUrl, pdfName } = body;

    if (!teamId || !title || !content) {
      return c.json({ success: false, error: "teamId, title, content are required" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, message: "ルール & 注意事項を登録しました（デモ）" });
    }

    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId || null;
    const ruleScope = scope === "organization" ? "organization" : "team";

    await db.insert(teamRules).values({
      id: `rule_${crypto.randomUUID()}`,
      organizationId: ruleScope === "organization" ? organizationId : null,
      teamId: ruleScope === "team" ? teamId : null,
      title: title.trim(),
      content: content.trim(),
      category: category || "general",
      scope: ruleScope,
      priority: Number(priority) || 0,
      isImportant: toBoolean(isImportant, false),
      imageUrl: imageUrl ? imageUrl.trim() : null,
      pdfUrl: pdfUrl ? pdfUrl.trim() : null,
      pdfName: pdfName ? pdfName.trim() : null,
      createdById: userId || null,
      createdAt: new Date(),
    });

    return c.json({ success: true, message: "ルール & 注意事項を登録しました" });
  } catch (error: any) {
    console.error("Failed to create rule:", error);
    return c.json({ success: false, error: error?.message || "ルール & 注意事項の登録に失敗しました" }, 500);
  }
});

/**
 * ⚠️ ルール & 注意事項 更新API (PUT /rules/:id)
 */
app.put("/rules/:id", async (c) => {
  await ensureRulesTable(c.env.DB);
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const { title, content, category, scope, teamId, priority, isImportant, imageUrl, pdfUrl, pdfName } = body;

    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "ルール & 注意事項を更新しました（デモ）" });
    }

    const currentRule = await db.select().from(teamRules).where(eq(teamRules.id, id)).get();
    if (!currentRule) {
      return c.json({ success: false, error: "指定されたルール & 注意事項が見つかりません" }, 404);
    }

    let organizationId = currentRule.organizationId;
    let targetTeamId = currentRule.teamId;

    if (scope === "organization" && !organizationId && targetTeamId) {
      const team = await db.select({ orgId: teams.organizationId }).from(teams).where(eq(teams.id, targetTeamId)).get();
      organizationId = team?.orgId || null;
      targetTeamId = null;
    } else if (scope === "team" && teamId) {
      targetTeamId = teamId;
      organizationId = null;
    }

    await db
      .update(teamRules)
      .set({
        title: title ? title.trim() : currentRule.title,
        content: content ? content.trim() : currentRule.content,
        category: category || currentRule.category,
        scope: scope || currentRule.scope,
        priority: priority !== undefined ? Number(priority) : currentRule.priority,
        isImportant: isImportant !== undefined ? toBoolean(isImportant, false) : currentRule.isImportant,
        imageUrl: imageUrl !== undefined ? (imageUrl ? imageUrl.trim() : null) : currentRule.imageUrl,
        pdfUrl: pdfUrl !== undefined ? (pdfUrl ? pdfUrl.trim() : null) : currentRule.pdfUrl,
        pdfName: pdfName !== undefined ? (pdfName ? pdfName.trim() : null) : currentRule.pdfName,
        organizationId: scope === "organization" ? organizationId : null,
        teamId: scope === "team" ? targetTeamId : null,
      })
      .where(eq(teamRules.id, id));

    return c.json({ success: true, message: "ルール & 注意事項を更新しました" });
  } catch (error: any) {
    console.error("Failed to update rule:", error);
    return c.json({ success: false, error: error?.message || "ルール & 注意事項の更新に失敗しました" }, 500);
  }
});

/**
 * ⚠️ ルール & 注意事項 削除API (DELETE /rules/:id)
 */
app.delete("/rules/:id", async (c) => {
  await ensureRulesTable(c.env.DB);
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "ルール & 注意事項を削除しました（デモ）" });
    }

    await db.delete(teamRules).where(eq(teamRules.id, id));
    return c.json({ success: true, message: "ルール & 注意事項を削除しました" });
  } catch (error: any) {
    console.error("Failed to delete rule:", error);
    return c.json({ success: false, error: error?.message || "ルール & 注意事項の削除に失敗しました" }, 500);
  }
});

// ==========================================
// 🔗 関連リンク (Links) API エンドポイント
// ==========================================

const DEMO_LINKS = [
  {
    id: "demo-link-1",
    category: "league",
    categoryLabel: "連盟・協会",
    title: "公益財団法人 全日本軟式野球連盟 (JSBB)",
    url: "https://jsbb.or.jp/",
    description: "公認野球規則、全国大会日程、用具規定（JSBBマーク基準）などの公式情報ポータルです。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 0,
    isImportant: true,
    imageUrl: null,
  },
  {
    id: "demo-link-2",
    category: "weather",
    categoryLabel: "天気・暑さ指数",
    title: "環境省 熱中症予防情報サイト (暑さ指数 WBGT速報)",
    url: "https://www.wbgt.env.go.jp/",
    description: "各グラウンド地域のリアルタイムWBGT値（暑さ指数）および活動中止・警戒基準を確認できます。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 1,
    isImportant: true,
    imageUrl: null,
  },
  {
    id: "demo-link-3",
    category: "weather",
    categoryLabel: "天気・暑さ指数",
    title: "雨雲レーダー・ピンポイント天気 (Yahoo!天気)",
    url: "https://weather.yahoo.co.jp/weather/zoomradar/",
    description: "今後の降雨・降雪予想、雷雲の接近予測がリアルタイムで確認できます。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 2,
    isImportant: false,
    imageUrl: null,
  },
  {
    id: "demo-link-4",
    category: "sns",
    categoryLabel: "公式SNS・HP",
    title: "チーム公式 Instagram (活動写真・ハイライト)",
    url: "https://www.instagram.com/",
    description: "試合風景、イベント写真、練習動画を随時更新中！ぜひフォロー＆いいねをお願いします。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 3,
    isImportant: true,
    imageUrl: null,
  },
  {
    id: "demo-link-5",
    category: "grounds",
    categoryLabel: "球場・施設予約",
    title: "自治体 公共スポーツ施設 予約システム",
    url: "https://www.city.sports-reserve.jp/",
    description: "グラウンド・体育館の空き状況確認および施設予約の公式ポータルです。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 4,
    isImportant: false,
    imageUrl: null,
  },
  {
    id: "demo-link-6",
    category: "partner",
    categoryLabel: "提携・ショップ",
    title: "ベースボールプロショップ (チーム指定用品店)",
    url: "https://www.baseball-shop-sample.com/",
    description: "指定ユニフォーム・ヘルメット・グラブのメンテナンス・割引購入が可能です。",
    scope: "organization",
    scopeLabel: "チーム全体",
    priority: 5,
    isImportant: false,
    imageUrl: null,
  },
];

/**
 * 📷 関連リンク ロゴ/画像アップロード API (POST /links/upload)
 */
app.post("/links/upload", async (c) => {
  try {
    let file: File | null = null;
    let teamId = "general";

    try {
      const formData = await c.req.formData();
      file = formData.get("file") as File | null;
      const t = formData.get("teamId");
      if (typeof t === "string" && t) teamId = t;
    } catch {
      const body = await c.req.parseBody();
      file = (body["file"] as File) || null;
      if (typeof body["teamId"] === "string" && body["teamId"]) {
        teamId = body["teamId"];
      }
    }

    if (!file || typeof file === "string" || !file.name) {
      return c.json({ success: false, error: "ファイルが選択されていません" }, 400);
    }

    const originalName = file.name || "link_image.jpg";
    const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";

    if (c.env.BUCKET) {
      const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "jpg";
      const filename = `links/${teamId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
      const mimeType = file.type || "image/jpeg";
      const arrayBuffer = await file.arrayBuffer();

      await c.env.BUCKET.put(filename, arrayBuffer, {
        httpMetadata: { contentType: mimeType },
      });

      const imageUrl = `/api/images/${filename}`;
      return c.json({ success: true, imageUrl });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const mimeType = file.type || "image/jpeg";
    const imageUrl = `data:${mimeType};base64,${base64}`;

    return c.json({ success: true, imageUrl });
  } catch (error: any) {
    console.error("Links image upload error:", error);
    return c.json({ success: false, error: error?.message || "画像のアップロードに失敗しました" }, 500);
  }
});

/**
 * 🔗 関連リンク (Links) 一覧取得API
 */
app.get("/links", async (c) => {
  await ensureLinksTable(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        links: DEMO_LINKS,
      });
    }

    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
        teamName: teams.name,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId;

    const conditions = [];
    if (organizationId) {
      conditions.push(eq(teamLinks.organizationId, organizationId));
    }
    conditions.push(eq(teamLinks.teamId, teamId));

    const linksList = await db
      .select({
        id: teamLinks.id,
        title: teamLinks.title,
        url: teamLinks.url,
        description: teamLinks.description,
        category: teamLinks.category,
        scope: teamLinks.scope,
        priority: teamLinks.priority,
        isImportant: teamLinks.isImportant,
        imageUrl: teamLinks.imageUrl,
        createdAt: teamLinks.createdAt,
        organizationId: teamLinks.organizationId,
        teamId: teamLinks.teamId,
      })
      .from(teamLinks)
      .where(or(...conditions))
      .orderBy(desc(teamLinks.isImportant), asc(teamLinks.priority), desc(teamLinks.createdAt))
      .all();

    const categoryLabels: Record<string, string> = {
      league: "連盟・協会",
      tournament: "大会・速報",
      sns: "公式SNS・HP",
      grounds: "球場・施設予約",
      weather: "天気・暑さ指数",
      partner: "提携・ショップ",
      other: "その他・お役立ち",
    };

    const formattedLinks = linksList.map((l) => {
      const isOrg = l.scope === "organization" || !!l.organizationId;
      return {
        id: l.id,
        title: l.title,
        url: l.url,
        description: l.description || "",
        category: l.category,
        categoryLabel: categoryLabels[l.category] || "その他",
        scope: (isOrg ? "organization" : "team") as "organization" | "team",
        scopeLabel: isOrg ? "チーム全体" : (currentTeam?.teamName || "編成"),
        priority: l.priority || 0,
        isImportant: toBoolean(l.isImportant, false),
        imageUrl: l.imageUrl || null,
      };
    });

    return c.json({
      success: true,
      isDemo: false,
      links: formattedLinks.length > 0 ? formattedLinks : DEMO_LINKS,
    });
  } catch (error: any) {
    console.error("Failed to load links:", error);
    return c.json({
      success: true,
      isDemo: false,
      links: DEMO_LINKS,
    });
  }
});

/**
 * 🔗 関連リンク 新規登録API
 */
app.post("/links", async (c) => {
  await ensureLinksTable(c.env.DB);
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, title, url, description, category, scope, userId, priority, isImportant, imageUrl } = body;

    if (!teamId || !title || !url) {
      return c.json({ success: false, error: "teamId, title, url are required" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, message: "関連リンクを登録しました（デモ）" });
    }

    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId || null;
    const linkScope = scope === "organization" ? "organization" : "team";

    await db.insert(teamLinks).values({
      id: `link_${crypto.randomUUID()}`,
      organizationId: linkScope === "organization" ? organizationId : null,
      teamId: linkScope === "team" ? teamId : null,
      title: title.trim(),
      url: url.trim(),
      description: description ? description.trim() : null,
      category: category || "other",
      scope: linkScope,
      priority: Number(priority) || 0,
      isImportant: toBoolean(isImportant, false),
      imageUrl: imageUrl ? imageUrl.trim() : null,
      createdById: userId || null,
      createdAt: new Date(),
    });

    return c.json({ success: true, message: "関連リンクを登録しました" });
  } catch (error: any) {
    console.error("Failed to create link:", error);
    return c.json({ success: false, error: error?.message || "関連リンクの登録に失敗しました" }, 500);
  }
});

/**
 * 🔗 関連リンク 更新API (PUT /links/:id)
 */
app.put("/links/:id", async (c) => {
  await ensureLinksTable(c.env.DB);
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const { title, url, description, category, scope, teamId, priority, isImportant, imageUrl } = body;

    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "関連リンクを更新しました（デモ）" });
    }

    const currentLink = await db.select().from(teamLinks).where(eq(teamLinks.id, id)).get();
    if (!currentLink) {
      return c.json({ success: false, error: "指定された関連リンクが見つかりません" }, 404);
    }

    let organizationId = currentLink.organizationId;
    let targetTeamId = currentLink.teamId;

    if (scope === "organization" && !organizationId && targetTeamId) {
      const team = await db.select({ orgId: teams.organizationId }).from(teams).where(eq(teams.id, targetTeamId)).get();
      organizationId = team?.orgId || null;
      targetTeamId = null;
    } else if (scope === "team" && teamId) {
      targetTeamId = teamId;
      organizationId = null;
    }

    await db
      .update(teamLinks)
      .set({
        title: title ? title.trim() : currentLink.title,
        url: url ? url.trim() : currentLink.url,
        description: description !== undefined ? (description ? description.trim() : null) : currentLink.description,
        category: category || currentLink.category,
        scope: scope || currentLink.scope,
        priority: priority !== undefined ? Number(priority) : currentLink.priority,
        isImportant: isImportant !== undefined ? toBoolean(isImportant, false) : currentLink.isImportant,
        imageUrl: imageUrl !== undefined ? (imageUrl ? imageUrl.trim() : null) : currentLink.imageUrl,
        organizationId: scope === "organization" ? organizationId : null,
        teamId: scope === "team" ? targetTeamId : null,
      })
      .where(eq(teamLinks.id, id));

    return c.json({ success: true, message: "関連リンクを更新しました" });
  } catch (error: any) {
    console.error("Failed to update link:", error);
    return c.json({ success: false, error: error?.message || "関連リンクの更新に失敗しました" }, 500);
  }
});

/**
 * 🛡️ IT管理者ダッシュボード情報取得API (GET /admin/dashboard)
 */
app.get("/admin/dashboard", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const envMapsKey =
    (c.env.GOOGLE_MAPS_API_KEY || "").trim() ||
    (c.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
    null;
  const adminLiffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";
  const adminMiniAppUrl =
    c.env.NEXT_PUBLIC_LINE_MINIAPP_URL || c.env.LINE_MINIAPP_URL || "";

  // 1. デモモードまたはチーム未指定時のフォールバック
  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      canManage: true,
      myRole: "admin",
      liffId: adminLiffId,
      miniAppUrl: adminMiniAppUrl,
      googleMapsApiKey: envMapsKey,
      googleMapsKeySource: envMapsKey ? "env" : "none",
      team: {
        id: "demo-team",
        name: DEMO_TEAM.name,
        orgName: DEMO_TEAM.orgName,
        logoImageUrl: DEMO_TEAM.logoImageUrl,
        inviteCode: "DEMO2026",
      },
      stats: {
        pendingCount: 2,
        activeCount: 18,
        playerCount: 14,
      },
      pendingRequests: [
        {
          memberId: "demo-pending-1",
          userId: null,
          name: "鈴木 健一",
          nameKana: "スズキ ケンイチ",
          memberType: "father",
          phone: "090-1234-5678",
          email: "kenichi.suzuki@example.com",
          joinedAt: "2026-10-24T14:30:00Z",
          role: "pending",
        },
        {
          memberId: "demo-pending-2",
          userId: null,
          name: "佐藤 美咲",
          nameKana: "サトウ ミサキ",
          memberType: "mother",
          phone: "080-9876-5432",
          email: "misaki.sato@example.com",
          joinedAt: "2026-10-25T08:15:00Z",
          role: "pending",
        },
      ],
      activeMembers: [
        {
          memberId: "demo-mem-1",
          userId: "user-1",
          name: "田中 監督",
          role: "manager",
          memberType: "staff",
          subLabel: "監督",
          phone: "090-0000-1111",
        },
        {
          memberId: "demo-mem-2",
          userId: "user-2",
          name: "山田 IT担当",
          role: "admin",
          memberType: "staff",
          subLabel: "IT管理",
          phone: "090-0000-2222",
        },
        {
          memberId: "demo-mem-3",
          userId: "user-3",
          name: "高橋 コーチ",
          role: "coach",
          memberType: "staff",
          subLabel: "1班",
          phone: "090-0000-3333",
        },
        {
          memberId: "demo-mem-4",
          userId: "user-4",
          name: "伊藤 父母会長",
          role: "parent",
          memberType: "mother",
          subLabel: "1班",
          phone: "090-0000-4444",
        },
      ],
    });
  }

  try {
    await ensureAllSchemasOnce(c.env.DB);

    // 2. チーム情報の取得
    const targetTeam = await db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
        orgName: organizations.name,
        orgLogoImageUrl: organizations.logoImageUrl,
        orgGoogleMapsApiKey: organizations.googleMapsApiKey,
        createdBy: teams.createdBy,
        memberSubLabels: teams.memberSubLabels,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!targetTeam) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    // 3. ユーザーの所属・管理権限チェック（確定済みアカウントID・創設者・組織OWNER/ADMIN・SYSTEM_ADMINのみ）
    // ⚠️ 特定個人名のハードコードや表示名一致による管理者昇格は厳禁
    const access = await resolveCallerTeamAccess(c, [userId]);
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

    const candidateUserIds = access.candidateUserIds;
    let myRole = "viewer";
    let parsedSubRoles: string[] = [];

    if (candidateUserIds.length > 0) {
      const idMatches = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.status, "active"),
            inArray(teamMembers.userId, candidateUserIds)
          )
        )
        .all();

      const myMembership =
        idMatches.find((m) => canManageTeam(m.role)) || idMatches[0];

      if (myMembership) {
        myRole = (myMembership.role || "viewer").toLowerCase();
        if (myMembership.subRoles) {
          try {
            const parsed: unknown = JSON.parse(myMembership.subRoles);
            if (Array.isArray(parsed)) {
              parsedSubRoles = parsed
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.toLowerCase());
            }
          } catch {
            parsedSubRoles = myMembership.subRoles
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);
          }
        }
        if (canManageSystem(myRole, parsedSubRoles)) {
          myRole = "admin";
        } else if (canManageTeam(myRole, parsedSubRoles) && myRole !== "admin") {
          myRole = "manager";
        }
      }
    }

    const isFounder = Boolean(
      targetTeam.createdBy && candidateUserIds.includes(targetTeam.createdBy)
    );
    const canManage =
      isFounder ||
      access.isSystemAdmin ||
      access.canManageTeamId(teamId) ||
      canManageTeam(myRole, parsedSubRoles);

    if (canManage && (myRole === "viewer" || myRole === "parent" || myRole === "player")) {
      myRole = "admin";
    }

    const orgMapsKey = (targetTeam.orgGoogleMapsApiKey || "").trim() || null;
    const effectiveMapsKey = envMapsKey || orgMapsKey;
    const mapsKeySource: "env" | "org" | "none" = envMapsKey
      ? "env"
      : orgMapsKey
      ? "org"
      : "none";

    // 4. サブラベルパース
    let subLabelsMap: Record<string, string> = {};
    try {
      if (targetTeam.memberSubLabels) {
        subLabelsMap = JSON.parse(targetTeam.memberSubLabels) as Record<
          string,
          string
        >;
      }
    } catch {}

    // 5. メンバー一覧クエリ（連絡先・参加申請・招待コードはチーム管理権限保持者のみに開示）
    const allMembers = await db
      .select({
        memberId: teamMembers.id,
        userId: teamMembers.userId,
        name: teamMembers.name,
        nameKana: teamMembers.nameKana,
        memberType: teamMembers.memberType,
        phone: teamMembers.phone,
        email: teamMembers.email,
        role: teamMembers.role,
        status: teamMembers.status,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(desc(teamMembers.joinedAt))
      .all();

    const pendingRequests = allMembers
      .filter((m) => m.status === "pending")
      .map((m) => ({
        ...m,
        joinedAt: m.joinedAt
          ? new Date(m.joinedAt).toISOString()
          : new Date().toISOString(),
      }));

    const activeMembers = allMembers
      .filter((m) => m.status === "active")
      .map((m) => ({
        ...m,
        subLabel: subLabelsMap[m.memberId] || "",
        joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : undefined,
      }));

    // 選手数カウント
    const playersList = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.teamId, teamId))
      .all();

    return c.json({
      success: true,
      isDemo: false,
      canManage,
      myRole,
      liffId: adminLiffId,
      miniAppUrl: adminMiniAppUrl,
      googleMapsApiKey: canManage ? effectiveMapsKey : null,
      googleMapsKeySource: canManage ? mapsKeySource : "none",
      team: {
        id: targetTeam.id,
        name: `${targetTeam.orgName ? `${targetTeam.orgName} ` : ""}${targetTeam.name}`.trim(),
        orgName: targetTeam.orgName || targetTeam.name,
        shortName: targetTeam.name,
        logoImageUrl: targetTeam.orgLogoImageUrl || undefined,
        inviteCode: canManage ? targetTeam.id : "",
      },
      stats: {
        pendingCount: canManage ? pendingRequests.length : 0,
        activeCount: activeMembers.length,
        playerCount: playersList.length,
      },
      pendingRequests: canManage ? pendingRequests : [],
      activeMembers: canManage ? activeMembers : [],
    });
  } catch (error: any) {
    console.error("Failed to load admin dashboard:", error);
    return c.json({ success: false, error: error?.message || "データの取得に失敗しました" }, 500);
  }
});

/**
 * 🛡️ 参加申請の承認・却下実行API (POST /admin/requests/action)
 */
app.post("/admin/requests/action", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, memberId, action, role = "parent" } = body;

    if (!teamId || !memberId || !action) {
      return c.json({ success: false, error: "パラメーターが不足しています" }, 400);
    }

    if (teamId === "demo-team" || memberId.startsWith("demo-")) {
      return c.json({
        success: true,
        message: action === "approve" ? "参加申請を承認しました（デモ）" : "参加申請を却下しました（デモ）",
      });
    }

    if (action === "approve") {
      await db
        .update(teamMembers)
        .set({ status: "active", role: role })
        .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)));

      return c.json({ success: true, message: "参加申請を承認しました" });
    } else {
      await db
        .delete(teamMembers)
        .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)));

      return c.json({ success: true, message: "参加申請を却下しました" });
    }
  } catch (error: any) {
    console.error("Failed to execute request action:", error);
    return c.json({ success: false, error: error?.message || "処理に失敗しました" }, 500);
  }
});

/**
 * 🛡️ メンバーの役割・班更新API (POST /admin/members/update)
 */
app.post("/admin/members/update", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, memberId, role, subLabel } = body;

    if (!teamId || !memberId) {
      return c.json({ success: false, error: "パラメーターが不足しています" }, 400);
    }

    if (teamId === "demo-team" || memberId.startsWith("demo-")) {
      return c.json({ success: true, message: "設定を更新しました（デモ）" });
    }

    if (role) {
      await db
        .update(teamMembers)
        .set({ role })
        .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)));
    }

    if (subLabel !== undefined) {
      const teamRow = await db.select({ memberSubLabels: teams.memberSubLabels }).from(teams).where(eq(teams.id, teamId)).get();
      let currentMap: Record<string, string> = {};
      try {
        if (teamRow?.memberSubLabels) {
          currentMap = JSON.parse(teamRow.memberSubLabels);
        }
      } catch {}

      if (subLabel) {
        currentMap[memberId] = subLabel.trim();
      } else {
        delete currentMap[memberId];
      }

      await db
        .update(teams)
        .set({ memberSubLabels: JSON.stringify(currentMap) })
        .where(eq(teams.id, teamId));
    }

    return c.json({ success: true, message: "メンバー情報を更新しました" });
  } catch (error: any) {
    console.error("Failed to update member:", error);
    return c.json({ success: false, error: error?.message || "更新に失敗しました" }, 500);
  }
});

/**
 * 🔗 メンバー統合（マージ）実行API (POST /admin/members/merge)
 * 手動登録メンバーとLINE等で参加承認されたアカウントを1つに合流・統合
 */
app.post("/admin/members/merge", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, targetMemberId, sourceMemberId } = body;

    if (!teamId || !targetMemberId || !sourceMemberId) {
      return c.json({ success: false, error: "統合対象のメンバーが正しく指定されていません" }, 400);
    }

    if (targetMemberId === sourceMemberId) {
      return c.json({ success: false, error: "同じメンバー同士を統合することはできません" }, 400);
    }

    // デモモード時のフォールバック
    if (teamId === "demo-team" || targetMemberId.startsWith("demo-") || sourceMemberId.startsWith("demo-")) {
      return c.json({
        success: true,
        message: "メンバーを正常に統合しました（デモ）",
      });
    }

    const target = await db.select().from(teamMembers).where(and(eq(teamMembers.id, targetMemberId), eq(teamMembers.teamId, teamId))).get();
    const source = await db.select().from(teamMembers).where(and(eq(teamMembers.id, sourceMemberId), eq(teamMembers.teamId, teamId))).get();

    if (!target) return c.json({ success: false, error: "統合先のメンバーが見つかりません" }, 404);
    if (!source) return c.json({ success: false, error: "統合元のメンバーが見つかりません" }, 404);

    // 💡 統合後のユーザーID決定 & LINEアカウント(U...)の account テーブル自動連携
    let resolvedUserId: string | null = target.userId || source.userId || null;
    let secondaryLineId: string | null = null;

    if (target.userId && source.userId && target.userId !== source.userId) {
      if (!target.userId.startsWith("U") && source.userId.startsWith("U")) {
        resolvedUserId = target.userId;
        secondaryLineId = source.userId;
      } else if (target.userId.startsWith("U") && !source.userId.startsWith("U")) {
        resolvedUserId = source.userId;
        secondaryLineId = target.userId;
      } else {
        resolvedUserId = target.userId;
      }
    }

    if (resolvedUserId && secondaryLineId) {
      await ensureLineAccountLink(db, resolvedUserId, secondaryLineId);
    }

    // 1. 🔗 親子関係の統合 (parentChildRelations)
    const sourceRelations = await db.select().from(parentChildRelations)
      .where(and(eq(parentChildRelations.teamId, teamId), eq(parentChildRelations.parentId, sourceMemberId))).all();
    for (const rel of sourceRelations) {
      const existing = await db.select().from(parentChildRelations)
        .where(and(eq(parentChildRelations.teamId, teamId), eq(parentChildRelations.parentId, targetMemberId), eq(parentChildRelations.childId, rel.childId))).get();
      if (existing) {
        await db.delete(parentChildRelations).where(eq(parentChildRelations.id, rel.id));
      } else {
        await db.update(parentChildRelations).set({ parentId: targetMemberId }).where(eq(parentChildRelations.id, rel.id));
      }
    }

    // 2. 📊 出欠記録の統合 (attendances)
    const sourceAttendances = await db.select().from(attendances)
      .where(eq(attendances.memberId, sourceMemberId)).all();
    for (const att of sourceAttendances) {
      const targetAtt = await db.select().from(attendances)
        .where(and(eq(attendances.eventId, att.eventId), eq(attendances.memberId, targetMemberId))).get();
      if (targetAtt) {
        if (targetAtt.status === 'pending' && att.status !== 'pending') {
          await db.update(attendances).set({
            status: att.status,
            comment: att.comment || targetAtt.comment,
            selectedGroupId: att.selectedGroupId || targetAtt.selectedGroupId,
            hasCar: att.hasCar || targetAtt.hasCar,
            carId: att.carId || targetAtt.carId,
            userId: resolvedUserId,
            updatedAt: new Date(),
          }).where(eq(attendances.id, targetAtt.id));
        }
        await db.delete(attendances).where(eq(attendances.id, att.id));
      } else {
        await db.update(attendances).set({
          memberId: targetMemberId,
          userId: resolvedUserId,
        }).where(eq(attendances.id, att.id));
      }
    }

    // 3. 🚗 登録車両の統合 (memberCars)
    await db.update(memberCars).set({ ownerId: targetMemberId })
      .where(and(eq(memberCars.teamId, teamId), eq(memberCars.ownerId, sourceMemberId)));
    await db.update(memberCars).set({ ownerId2: targetMemberId })
      .where(and(eq(memberCars.teamId, teamId), eq(memberCars.ownerId2, sourceMemberId)));

    // 4. 🚙 配車ドライバーの統合 (eventCarpools)
    await db.update(eventCarpools).set({ driverId: targetMemberId })
      .where(eq(eventCarpools.driverId, sourceMemberId));

    // 5. 👥 配車同乗者の統合 (eventCarpoolRiders)
    const sourceRiders = await db.select().from(eventCarpoolRiders)
      .where(eq(eventCarpoolRiders.memberId, sourceMemberId)).all();
    for (const rider of sourceRiders) {
      const existing = await db.select().from(eventCarpoolRiders)
        .where(and(eq(eventCarpoolRiders.carpoolId, rider.carpoolId), eq(eventCarpoolRiders.memberId, targetMemberId))).get();
      if (existing) {
        await db.delete(eventCarpoolRiders).where(eq(eventCarpoolRiders.id, rider.id));
      } else {
        await db.update(eventCarpoolRiders).set({ memberId: targetMemberId }).where(eq(eventCarpoolRiders.id, rider.id));
      }
    }

    // 6. 🏷️ チームグループ所属の統合 (teamGroupMembers)
    const sourceGroupMembers = await db.select().from(teamGroupMembers)
      .where(eq(teamGroupMembers.teamMemberId, sourceMemberId)).all();
    for (const tgm of sourceGroupMembers) {
      const existing = await db.select().from(teamGroupMembers)
        .where(and(eq(teamGroupMembers.groupId, tgm.groupId), eq(teamGroupMembers.teamMemberId, targetMemberId))).get();
      if (existing) {
        await db.delete(teamGroupMembers).where(eq(teamGroupMembers.id, tgm.id));
      } else {
        await db.update(teamGroupMembers).set({ teamMemberId: targetMemberId }).where(eq(teamGroupMembers.id, tgm.id));
      }
    }

    // 7. 📦 用具積載担当の統合 (eventEquipments)
    await db.update(eventEquipments).set({ responsibleMemberId: targetMemberId })
      .where(eq(eventEquipments.responsibleMemberId, sourceMemberId));

    // 8. 👤 ターゲットメンバーの更新 (userId, contact, status)
    const newAvatar = target.avatarUrl || source.avatarUrl || null;
    const newPhone = target.phone || source.phone || null;
    const newEmail = target.email || source.email || null;
    const newNameKana = target.nameKana || source.nameKana || null;

    await db.update(teamMembers).set({
      userId: resolvedUserId,
      avatarUrl: newAvatar,
      phone: newPhone,
      email: newEmail,
      nameKana: newNameKana,
      status: 'active',
    }).where(eq(teamMembers.id, targetMemberId));

    // 9. 🏷️ チームの並び順・班サブラベル設定からの旧IDクリーンアップ＆引き継ぎ
    try {
      const teamCfg = await db
        .select({
          memberSortOrder: teams.memberSortOrder,
          memberSubLabels: teams.memberSubLabels,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get();

      if (teamCfg) {
        const teamUpdates: { memberSortOrder?: string; memberSubLabels?: string } = {};

        if (teamCfg.memberSubLabels) {
          try {
            const subMap = JSON.parse(teamCfg.memberSubLabels) as Record<string, string>;
            if (sourceMemberId in subMap) {
              if (!subMap[targetMemberId] && subMap[sourceMemberId]) {
                subMap[targetMemberId] = subMap[sourceMemberId];
              }
              delete subMap[sourceMemberId];
              teamUpdates.memberSubLabels = JSON.stringify(subMap);
            }
          } catch {}
        }

        if (teamCfg.memberSortOrder) {
          try {
            const orderMap = JSON.parse(teamCfg.memberSortOrder) as Record<string, string[]>;
            let orderChanged = false;
            for (const grpKey of Object.keys(orderMap)) {
              const arr = orderMap[grpKey];
              if (Array.isArray(arr) && arr.includes(sourceMemberId)) {
                orderChanged = true;
                if (arr.includes(targetMemberId)) {
                  orderMap[grpKey] = arr.filter((id) => id !== sourceMemberId);
                } else {
                  orderMap[grpKey] = arr.map((id) => (id === sourceMemberId ? targetMemberId : id));
                }
              }
            }
            if (orderChanged) {
              teamUpdates.memberSortOrder = JSON.stringify(orderMap);
            }
          } catch {}
        }

        if (Object.keys(teamUpdates).length > 0) {
          await db.update(teams).set(teamUpdates).where(eq(teams.id, teamId));
        }
      }
    } catch (cfgErr) {
      console.warn("Team config cleanup on merge warning:", cfgErr);
    }

    // 10. 🗑️ 統合元メンバー（重複した参加レコード）の削除
    await db.delete(teamMembers).where(eq(teamMembers.id, sourceMemberId));

    return c.json({
      success: true,
      message: `「${target.name || 'メンバー'}」に「${source.name || 'アカウント'}」を正常に統合しました！`,
    });
  } catch (error: any) {
    console.error("Failed to merge members:", error);
    return c.json({ success: false, error: error?.message || "メンバー統合に失敗しました" }, 500);
  }
});

// ==========================================
// 👤 個人プロフィール設定・親子紐付け・マイカー登録 API
// ==========================================

async function resolveProfileMember(
  c: { env: WorkerEnv; req: { raw: Request } },
  db: ReturnType<typeof drizzle>,
  params: {
    teamId: string;
    memberId?: string | null;
    userId?: string | null;
    userName?: string | null;
    createIfMissing?: boolean;
    initialName?: string | null;
    initialMemberType?: string | null;
  }
) {
  const { teamId, memberId, userId, userName, createIfMissing = false, initialName, initialMemberType } = params;

  let sessionUser: { id?: string; name?: string | null; role?: string | null } | null = null;
  try {
    const auth = getAuth(c.env.DB, c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers as unknown as Headers }).catch(() => null);
    sessionUser = session?.user || null;
  } catch {}

  const cleanUid = userId?.trim();
  const candidateIds = await expandCandidateUserIds(db, [cleanUid, sessionUser?.id]);

  // `user` テーブル整合性付きの有効な userId 確保（連携済みの正規 Better-Auth ID を優先）
  let validUserId: string | null = null;
  const prioritizedUserIds = [
    ...candidateIds.filter((id) => !id.startsWith("U")),
    ...candidateIds.filter((id) => id.startsWith("U")),
  ];
  for (const uid of prioritizedUserIds) {
    try {
      const userExists = await db.select({ id: user.id }).from(user).where(eq(user.id, uid)).get();
      if (userExists) {
        validUserId = userExists.id;
        break;
      }
    } catch {}
  }

  const preferredUid =
    sessionUser?.id ||
    (cleanUid && !IGNORED_MOCK_USER_IDS.has(cleanUid) ? cleanUid : null);

  if (!validUserId && preferredUid && createIfMissing) {
    try {
      await db.insert(user).values({
        id: preferredUid,
        name: (initialName || userName || sessionUser?.name || "LINEユーザー").trim(),
        email: `${preferredUid}@line.user`,
        emailVerified: false,
        role: "GUEST",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      validUserId = preferredUid;
    } catch {
      validUserId = null;
    }
  }

  let foundMember: typeof teamMembers.$inferSelect | undefined;

  // 1. userId / account双方向連携による照合（正規の非 tm_ ID を最優先）
  if (candidateIds.length > 0) {
    const matchedByUid = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          or(...candidateIds.map((uid) => eq(teamMembers.userId, uid)))
        )
      )
      .all();
    const activeMatched = matchedByUid.filter((m) => m.status === "active" || !m.status);
    foundMember =
      activeMatched.find((m) => !m.id.startsWith("tm_")) ||
      activeMatched[0] ||
      matchedByUid[0];
  }

  // 2. memberId 明示指定（userId未連携メンバーのキャッシュ照合。他人のuserIdが紐付いているレコードは除外）
  if (!foundMember && memberId && memberId.trim() && !memberId.startsWith("demo-")) {
    const byId = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId.trim())))
      .get();
    if (byId && (!byId.userId || candidateIds.includes(byId.userId))) {
      foundMember = byId;
    }
  }

  // 3. 名前照合（保存時は入力された表示名 initialName を最優先で照合し、重複 tm_ 作成を防止！）
  const searchNames = [initialName, userName, sessionUser?.name];
  if (!foundMember && searchNames.some((s) => Boolean(s?.trim()))) {
    const allTeamMembers = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .all();

    if (initialMemberType === "player") {
      const normTargets = searchNames
        .map((s) => (s ? normalizeMemberName(s) : ""))
        .filter(Boolean);
      foundMember = allTeamMembers.find(
        (m) =>
          m.memberType === "player" &&
          Boolean(m.name) &&
          normTargets.includes(normalizeMemberName(m.name || ""))
      );
    } else {
      const matchedByUserTable = await findAndAutoLinkMemberByUserTableName(
        db,
        allTeamMembers,
        searchNames,
        cleanUid
      );
      foundMember =
        matchedByUserTable || findMatchingAdultMemberByName(allTeamMembers, searchNames) || undefined;
    }

    if (foundMember) {
      if (!foundMember.userId && validUserId) {
        try {
          await db
            .update(teamMembers)
            .set({ userId: validUserId })
            .where(eq(teamMembers.id, foundMember.id));
          foundMember = { ...foundMember, userId: validUserId };
        } catch {}
      } else if (foundMember.userId) {
        if (cleanUid && cleanUid.startsWith("U") && foundMember.userId !== cleanUid) {
          await ensureLineAccountLink(db, foundMember.userId, cleanUid);
        } else if (
          sessionUser?.id &&
          !sessionUser.id.startsWith("U") &&
          foundMember.userId.startsWith("U")
        ) {
          await ensureLineAccountLink(db, sessionUser.id, foundMember.userId);
        }
      }
    }
  }

  // 4. 未登録かつ createIfMissing の場合は安全に自動作成
  const fallbackName = (initialName || userName || sessionUser?.name || "メンバー").trim();
  if (!foundMember && createIfMissing) {
    const teamExists = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (teamExists) {
      const newMemberId = `tm_${crypto.randomUUID()}`;
      const mType = initialMemberType || "parent";
      const createdRow = {
        id: newMemberId,
        teamId,
        userId: validUserId,
        name: fallbackName,
        nameKana: null as string | null,
        memberType: mType,
        phone: null as string | null,
        email: null as string | null,
        avatarUrl: null as string | null,
        role: mType === "staff" ? "staff" : "parent",
        subRoles: null as string | null,
        status: "active",
        joinedAt: new Date(),
      };
      await db.insert(teamMembers).values(createdRow);
      foundMember = createdRow;
    }
  }

  return foundMember || null;
}

/**
 * 📋 個人プロフィール・親子紐付け・マイカー一覧取得 (GET /api/liff/profile)
 */
app.get("/profile", async (c) => {
  await ensureMemberSubLabelsColumn(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId") || "demo-team";
  const memberId = c.req.query("memberId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");

  if (teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      member: {
        id: "demo-parent-1",
        name: userName || "山田 太郎（翔太父）",
        nameKana: "ヤマダ タロウ",
        phone: "090-1234-5678",
        email: "",
        memberType: "parent",
        role: "parent",
        subLabel: "2班",
        status: "active",
      },
      groups: [{ groupId: "demo-grp-1", groupName: "保護者会・2班", role: "配車サポート" }],
      players: [
        { id: "demo-player-1", name: "山田 翔太", nameKana: "ヤマダ ショウタ", uniformNumber: "10", primaryPosition: "遊撃手", isSelfLinked: true, isOtherUserLinked: false },
        { id: "demo-player-2", name: "佐藤 健太", nameKana: "サトウ ケンタ", uniformNumber: "1", primaryPosition: "投手", isSelfLinked: false, isOtherUserLinked: false },
        { id: "demo-player-3", name: "鈴木 大輔", nameKana: "スズキ ダイスケ", uniformNumber: "2", primaryPosition: "捕手", isSelfLinked: false, isOtherUserLinked: false },
        { id: "demo-player-4", name: "高橋 陸", nameKana: "タカハシ リク", uniformNumber: "8", primaryPosition: "中堅手", isSelfLinked: false, isOtherUserLinked: false },
      ],
      mySelfPlayer: {
        id: "demo-player-1",
        name: "山田 翔太",
        uniformNumber: "10",
        primaryPosition: "遊撃手",
      },
      myChildren: [
        { relationId: "demo-rel-1", childId: "demo-player-1", childName: "山田 翔太", uniformNumber: "10" },
      ],
      myCars: [
        {
          id: "demo-car-1",
          name: "日産 セレナ",
          color: "パールホワイト",
          numberPlate: "12-34",
          capacity: 5,
          fuelEfficiency: 12,
          carType: "normal",
        },
      ],
    });
  }

  try {
    const teamRow = await db
      .select({ id: teams.id, memberSubLabels: teams.memberSubLabels })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!teamRow) {
      return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
    }

    let subLabelsMap: Record<string, string> = {};
    try {
      if (teamRow.memberSubLabels) {
        subLabelsMap = JSON.parse(teamRow.memberSubLabels);
      }
    } catch {}

    let sessionUserId: string | undefined;
    try {
      if (c.req.raw.headers.get("cookie")) {
        const auth = getAuth(c.env.DB, c.env);
        const session = await auth.api
          .getSession({ headers: c.req.raw.headers as unknown as Headers })
          .catch(() => null);
        sessionUserId = session?.user?.id;
      }
    } catch {}

    const callerCandidateIds = await expandCandidateUserIds(db, [
      userId,
      extractHeaderUserId(c),
      sessionUserId,
    ]);

    const member = await resolveProfileMember(c, db, {
      teamId,
      memberId,
      userId,
      userName,
      createIfMissing: false,
    });

    // チーム選手一覧（背番号順ソート・休部中は末尾へ）
    const rawPlayers = await db
      .select({
        id: players.id,
        name: players.name,
        nameKana: players.nameKana,
        uniformNumber: players.uniformNumber,
        primaryPosition: players.primaryPosition,
        userId: players.userId,
        conditionStatus: players.conditionStatus,
        isActive: players.isActive,
      })
      .from(players)
      .where(eq(players.teamId, teamId))
      .all();

    const activePlayers = rawPlayers
      .filter((p) => p.isActive !== false)
      .sort(comparePlayersByConditionAndUniform)
      .map((p) => {
        const isSelfLinked = Boolean(p.userId && callerCandidateIds.includes(p.userId));
        const isOtherUserLinked = Boolean(p.userId && !isSelfLinked);
        return {
          id: p.id,
          name: p.name,
          nameKana: p.nameKana,
          uniformNumber: p.uniformNumber,
          primaryPosition: p.primaryPosition,
          conditionStatus: normalizePlayerConditionStatus(p.conditionStatus),
          isSelfLinked,
          isOtherUserLinked,
        };
      });

    const selfPlayerMatch = activePlayers.find((p) => p.isSelfLinked) || null;
    const mySelfPlayer = selfPlayerMatch
      ? {
          id: selfPlayerMatch.id,
          name: selfPlayerMatch.name,
          uniformNumber: selfPlayerMatch.uniformNumber,
          primaryPosition: selfPlayerMatch.primaryPosition || null,
        }
      : null;

    let myGroups: Array<{ groupId: string; groupName: string; role: string | null }> = [];
    let myChildren: Array<{ relationId: string; childId: string; childName: string; uniformNumber: string }> = [];
    let myCars: Array<{
      id: string;
      name: string;
      color: string | null;
      numberPlate: string | null;
      capacity: number;
      fuelEfficiency: number;
      carType: "normal" | "cargo" | "bus";
    }> = [];

    if (member) {
      try {
        const grpRows = await db
          .select({
            groupId: teamGroups.id,
            groupName: teamGroups.name,
            role: teamGroupMembers.role,
          })
          .from(teamGroupMembers)
          .innerJoin(teamGroups, eq(teamGroupMembers.groupId, teamGroups.id))
          .where(and(eq(teamGroups.teamId, teamId), eq(teamGroupMembers.teamMemberId, member.id)))
          .all();
        myGroups = grpRows;
      } catch {}

      const relRows = await db
        .select({
          relationId: parentChildRelations.id,
          childId: parentChildRelations.childId,
          childName: players.name,
          uniformNumber: players.uniformNumber,
        })
        .from(parentChildRelations)
        .leftJoin(players, eq(parentChildRelations.childId, players.id))
        .where(and(eq(parentChildRelations.teamId, teamId), eq(parentChildRelations.parentId, member.id)))
        .all();

      myChildren = relRows
        .filter((r) => Boolean(r.childId))
        .map((r) => ({
          relationId: r.relationId,
          childId: r.childId,
          childName: r.childName || "選手",
          uniformNumber: r.uniformNumber || "",
        }));

      const carRows = await db
        .select()
        .from(memberCars)
        .where(
          and(
            eq(memberCars.teamId, teamId),
            or(eq(memberCars.ownerId, member.id), eq(memberCars.ownerId2, member.id))
          )
        )
        .all();

      myCars = carRows.map((car) => ({
        id: car.id,
        name: car.name,
        color: car.color,
        numberPlate: car.numberPlate,
        capacity: car.capacity,
        fuelEfficiency: car.fuelEfficiency,
        carType: (car.carType as "normal" | "cargo" | "bus") || "normal",
      }));
    }

    return c.json({
      success: true,
      isDemo: false,
      member: member
        ? {
            id: member.id,
            name: member.name || userName || "",
            nameKana: member.nameKana || "",
            phone: member.phone || "",
            email: member.email || "",
            memberType: member.memberType || "parent",
            role: member.role || "parent",
            subLabel: subLabelsMap[member.id] || "",
            status: member.status || "active",
          }
        : null,
      groups: myGroups,
      players: activePlayers,
      mySelfPlayer,
      myChildren,
      myCars,
    });
  } catch (err: unknown) {
    console.error("Failed to fetch LIFF profile:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "プロフィールの取得に失敗しました" },
      500
    );
  }
});

/**
 * 💾 基本プロフィールの更新 (POST /api/liff/profile)
 */
app.post("/profile", async (c) => {
  await ensureMemberSubLabelsColumn(c.env.DB);
  const db = drizzle(c.env.DB);

  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      memberId?: string;
      userId?: string;
      userName?: string;
      name?: string;
      nameKana?: string;
      phone?: string;
      memberType?: string;
      subLabel?: string;
    };

    const teamId = body.teamId || "demo-team";
    const trimmedName = (body.name || "").trim();
    if (!trimmedName) {
      return c.json({ success: false, error: "チーム内の表示名を入力してください" }, 400);
    }

    const allowedMemberTypes = ["parent", "staff", "player", "other"];
    const nextMemberType = allowedMemberTypes.includes(body.memberType || "") ? (body.memberType as string) : "parent";

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        memberId: "demo-parent-1",
        message: "プロフィールを保存しました（デモ）",
      });
    }

    const member = await resolveProfileMember(c, db, {
      teamId,
      memberId: body.memberId,
      userId: body.userId,
      userName: body.userName || trimmedName,
      createIfMissing: true,
      initialName: trimmedName,
      initialMemberType: nextMemberType,
    });

    if (!member) {
      return c.json({ success: false, error: "メンバー情報の特定に失敗しました" }, 404);
    }

    await db
      .update(teamMembers)
      .set({
        name: trimmedName,
        nameKana: body.nameKana?.trim() || null,
        phone: body.phone?.trim() || null,
        memberType: nextMemberType,
      })
      .where(and(eq(teamMembers.id, member.id), eq(teamMembers.teamId, teamId)));

    // サブラベル（担当班・役割タグ）の同期
    if (body.subLabel !== undefined) {
      const teamRow = await db
        .select({ memberSubLabels: teams.memberSubLabels })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get();
      let currentMap: Record<string, string> = {};
      try {
        if (teamRow?.memberSubLabels) {
          currentMap = JSON.parse(teamRow.memberSubLabels);
        }
      } catch {}

      const cleanSub = body.subLabel.trim();
      if (cleanSub) {
        currentMap[member.id] = cleanSub;
      } else {
        delete currentMap[member.id];
      }

      await db
        .update(teams)
        .set({ memberSubLabels: JSON.stringify(currentMap) })
        .where(eq(teams.id, teamId));
    }

    return c.json({
      success: true,
      isDemo: false,
      memberId: member.id,
      message: "プロフィールを保存しました",
    });
  } catch (err: unknown) {
    console.error("Failed to update LIFF profile:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "プロフィールの保存に失敗しました" },
      500
    );
  }
});

/**
 * 🔗 お子様（選手）との親子紐付け追加 (POST /api/liff/profile/family)
 */
app.post("/profile/family", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      memberId?: string;
      userId?: string;
      userName?: string;
      childId?: string;
    };

    const teamId = body.teamId || "demo-team";
    const childId = (body.childId || "").trim();
    if (!childId) {
      return c.json({ success: false, error: "紐付ける選手を選択してください" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        relationId: `demo-rel-${childId}`,
        memberId: "demo-parent-1",
      });
    }

    const member = await resolveProfileMember(c, db, {
      teamId,
      memberId: body.memberId,
      userId: body.userId,
      userName: body.userName,
      createIfMissing: true,
      initialName: body.userName,
      initialMemberType: "parent",
    });

    if (!member) {
      return c.json({ success: false, error: "保護者メンバー情報が見つかりません" }, 404);
    }

    const existing = await db
      .select()
      .from(parentChildRelations)
      .where(
        and(
          eq(parentChildRelations.teamId, teamId),
          eq(parentChildRelations.parentId, member.id),
          eq(parentChildRelations.childId, childId)
        )
      )
      .get();

    if (existing) {
      return c.json({
        success: true,
        isDemo: false,
        relationId: existing.id,
        memberId: member.id,
      });
    }

    const relationId = `pc_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.insert(parentChildRelations).values({
      id: relationId,
      teamId,
      parentId: member.id,
      childId,
    });

    return c.json({
      success: true,
      isDemo: false,
      relationId,
      memberId: member.id,
    });
  } catch (err: unknown) {
    console.error("Failed to link child in LIFF profile:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "お子様の紐付けに失敗しました" },
      500
    );
  }
});

/**
 * 🗑️ お子様（選手）との親子紐付け解除 (DELETE /api/liff/profile/family/:relationId)
 */
app.delete("/profile/family/:relationId", async (c) => {
  const relationId = c.req.param("relationId");
  if (relationId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true });
  }

  const db = drizzle(c.env.DB);
  try {
    await db.delete(parentChildRelations).where(eq(parentChildRelations.id, relationId));
    return c.json({ success: true, isDemo: false });
  } catch (err: unknown) {
    console.error("Failed to unlink child in LIFF profile:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "紐付けの解除に失敗しました" },
      500
    );
  }
});

/**
 * ⚾ 選手本人のLINEアカウント紐付け登録 (POST /api/liff/profile/self-player)
 * - 1アカウントにつき1チーム1選手まで紐付け可能
 * - 既に他アカウントが紐付いている選手への上書き（なりすまし）は完全拒否
 */
app.post("/profile/self-player", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);

  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      playerId?: string;
      memberId?: string;
      userId?: string;
      userName?: string;
    };

    const teamId = (body.teamId || "demo-team").trim();
    const playerId = (body.playerId || "").trim();
    if (!playerId) {
      return c.json({ success: false, error: "紐付けるご自身の選手を選択してください" }, 400);
    }

    if (teamId === "demo-team" || playerId.startsWith("demo-")) {
      return c.json({
        success: true,
        isDemo: true,
        selfPlayer: {
          id: playerId,
          name: "デモ選手",
          uniformNumber: "10",
          primaryPosition: "SS",
        },
      });
    }

    let sessionUser: { id?: string; name?: string | null } | null = null;
    try {
      if (c.req.raw.headers.get("cookie")) {
        const auth = getAuth(c.env.DB, c.env);
        const session = await auth.api
          .getSession({ headers: c.req.raw.headers as unknown as Headers })
          .catch(() => null);
        sessionUser = session?.user || null;
      }
    } catch {}

    const rawUid = body.userId?.trim() || extractHeaderUserId(c);
    const candidateIds = await expandCandidateUserIds(db, [rawUid, sessionUser?.id]);
    if (candidateIds.length === 0) {
      return c.json(
        { success: false, error: "選手本人紐付けを行うにはLINE連携ログインが必要です" },
        401
      );
    }

    const targetPlayer = await db
      .select({
        id: players.id,
        name: players.name,
        uniformNumber: players.uniformNumber,
        primaryPosition: players.primaryPosition,
        userId: players.userId,
      })
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)))
      .get();

    if (!targetPlayer) {
      return c.json({ success: false, error: "対象の選手が見つかりません" }, 404);
    }

    if (targetPlayer.userId && !candidateIds.includes(targetPlayer.userId)) {
      return c.json(
        {
          success: false,
          error:
            "この選手には既に別のLINEアカウントが紐付けられています。変更が必要な場合はチームの指導者・管理者へご相談ください。",
        },
        409
      );
    }

    // `user` 外部キー整合性を満たす有効な userId を確保
    let validUserId: string | null = null;
    const prioritizedUserIds = [
      ...candidateIds.filter((id) => !id.startsWith("U")),
      ...candidateIds.filter((id) => id.startsWith("U")),
    ];
    for (const uid of prioritizedUserIds) {
      try {
        const uRow = await db.select({ id: user.id }).from(user).where(eq(user.id, uid)).get();
        if (uRow) {
          validUserId = uRow.id;
          break;
        }
      } catch {}
    }

    const preferredUid =
      sessionUser?.id || (rawUid && !IGNORED_MOCK_USER_IDS.has(rawUid) ? rawUid : null);

    if (!validUserId && preferredUid) {
      try {
        await db.insert(user).values({
          id: preferredUid,
          name: (body.userName || sessionUser?.name || targetPlayer.name || "LINEユーザー").trim(),
          email: `${preferredUid}@line.user`,
          emailVerified: false,
          role: "GUEST",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        validUserId = preferredUid;
      } catch {
        validUserId = null;
      }
    }

    if (!validUserId) {
      return c.json({ success: false, error: "ユーザーアカウントの確認に失敗しました" }, 500);
    }

    // 同一チーム内で既に別選手に自分のIDが付いていれば先に解除（1人1選手保証）
    await db
      .update(players)
      .set({ userId: null })
      .where(
        and(
          eq(players.teamId, teamId),
          or(...candidateIds.map((uid) => eq(players.userId, uid)))
        )
      );

    await db
      .update(players)
      .set({ userId: validUserId })
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

    return c.json({
      success: true,
      isDemo: false,
      selfPlayer: {
        id: targetPlayer.id,
        name: targetPlayer.name,
        uniformNumber: targetPlayer.uniformNumber,
        primaryPosition: targetPlayer.primaryPosition || null,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to link self player:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "選手本人紐付けに失敗しました",
      },
      500
    );
  }
});

/**
 * 🔓 選手本人のLINEアカウント紐付け解除 (DELETE /api/liff/profile/self-player)
 */
app.delete("/profile/self-player", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);

  try {
    const teamId = (c.req.query("teamId") || "demo-team").trim();
    const targetPlayerId = (c.req.query("playerId") || "").trim();
    const queryUserId = c.req.query("userId");

    if (teamId === "demo-team" || targetPlayerId.startsWith("demo-")) {
      return c.json({ success: true, isDemo: true });
    }

    let sessionUser: { id?: string } | null = null;
    try {
      if (c.req.raw.headers.get("cookie")) {
        const auth = getAuth(c.env.DB, c.env);
        const session = await auth.api
          .getSession({ headers: c.req.raw.headers as unknown as Headers })
          .catch(() => null);
        sessionUser = session?.user || null;
      }
    } catch {}

    const candidateIds = await expandCandidateUserIds(db, [
      queryUserId,
      extractHeaderUserId(c),
      sessionUser?.id,
    ]);

    if (targetPlayerId) {
      const teamRow = await db
        .select({
          id: teams.id,
          createdBy: teams.createdBy,
          organizationId: teams.organizationId,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get();

      const canManage = teamRow
        ? await resolveCanManageTeamPlayers(c, db, {
            teamId,
            userId: queryUserId || extractHeaderUserId(c),
            userName: extractHeaderUserName(c),
            createdBy: teamRow.createdBy,
            organizationId: teamRow.organizationId,
          })
        : false;

      if (canManage) {
        await db
          .update(players)
          .set({ userId: null })
          .where(and(eq(players.id, targetPlayerId), eq(players.teamId, teamId)));
        return c.json({ success: true, isDemo: false });
      }
    }

    if (candidateIds.length === 0) {
      return c.json({ success: false, error: "ログイン情報が見つかりません" }, 401);
    }

    await db
      .update(players)
      .set({ userId: null })
      .where(
        and(
          eq(players.teamId, teamId),
          or(...candidateIds.map((uid) => eq(players.userId, uid)))
        )
      );

    return c.json({ success: true, isDemo: false });
  } catch (err: unknown) {
    console.error("Failed to unlink self player:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "選手本人紐付けの解除に失敗しました",
      },
      500
    );
  }
});

/**
 * 🚗 マイカー情報の登録・更新 (POST /api/liff/profile/cars)
 */
app.post("/profile/cars", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = (await c.req.json()) as {
      id?: string;
      teamId?: string;
      memberId?: string;
      userId?: string;
      userName?: string;
      name?: string;
      color?: string;
      numberPlate?: string;
      capacity?: number;
      carType?: "normal" | "cargo";
    };

    const teamId = body.teamId || "demo-team";
    const carName = (body.name || "").trim();
    if (!carName) {
      return c.json({ success: false, error: "車種名を入力してください（例: セレナ）" }, 400);
    }

    const capacityNum = Math.max(1, Math.min(29, Number(body.capacity) || 4));
    const carType: "normal" | "cargo" = body.carType === "cargo" ? "cargo" : "normal";

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        memberId: "demo-parent-1",
        car: {
          id: body.id || `demo-car-${Date.now()}`,
          name: carName,
          color: body.color?.trim() || null,
          numberPlate: body.numberPlate?.trim() || null,
          capacity: capacityNum,
          fuelEfficiency: 10,
          carType,
        },
      });
    }

    const member = await resolveProfileMember(c, db, {
      teamId,
      memberId: body.memberId,
      userId: body.userId,
      userName: body.userName,
      createIfMissing: true,
      initialName: body.userName,
      initialMemberType: "parent",
    });

    if (!member) {
      return c.json({ success: false, error: "所有者メンバー情報が見つかりません" }, 404);
    }

    const carId = body.id || `car_${crypto.randomUUID().replace(/-/g, "")}`;
    const values = {
      id: carId,
      teamId,
      ownerId: member.id,
      name: carName,
      color: body.color?.trim() || null,
      numberPlate: body.numberPlate?.trim() || null,
      capacity: capacityNum,
      fuelEfficiency: 10,
      carType,
    };

    if (body.id) {
      await db
        .update(memberCars)
        .set({
          name: values.name,
          color: values.color,
          numberPlate: values.numberPlate,
          capacity: values.capacity,
          carType: values.carType,
        })
        .where(and(eq(memberCars.id, body.id), eq(memberCars.teamId, teamId)));
    } else {
      await db.insert(memberCars).values(values);
    }

    return c.json({
      success: true,
      isDemo: false,
      memberId: member.id,
      car: values,
    });
  } catch (err: unknown) {
    console.error("Failed to save car in LIFF profile:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "車両情報の保存に失敗しました" },
      500
    );
  }
});

/**
 * 🗑️ マイカー情報の削除 (DELETE /api/liff/profile/cars/:carId)
 */
app.delete("/profile/cars/:carId", async (c) => {
  const carId = c.req.param("carId");
  if (carId.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true });
  }

  const db = drizzle(c.env.DB);
  try {
    await db.delete(memberCars).where(eq(memberCars.id, carId));
    return c.json({ success: true, isDemo: false });
  } catch (err: unknown) {
    console.error("Failed to delete car in LIFF profile:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "車両情報の削除に失敗しました" },
      500
    );
  }
});

// ==========================================
// ⚾ 選手名鑑（ロースター & 通算成績付きディレクトリ）API
// ==========================================

const PLAYER_CONDITION_MANAGER_ROLES = new Set([
  "admin",
  "system_admin",
  "manager",
  "coach",
  "scorer",
  "staff",
]);

interface CallerPlayerEditPermissions {
  canManagePlayers: boolean;
  searchUserIds: string[];
  linkedChildIds: Set<string>;
}

async function resolveCallerPlayerEditPermissions(
  c: {
    env: WorkerEnv;
    req: { raw: Request };
  },
  db: ReturnType<typeof drizzle>,
  params: {
    teamId: string;
    userId?: string | null;
    userName?: string | null;
    createdBy?: string | null;
    organizationId?: string | null;
  }
): Promise<CallerPlayerEditPermissions> {
  if (!params.teamId || params.teamId === "demo-team") {
    return {
      canManagePlayers: true,
      searchUserIds: [],
      linkedChildIds: new Set<string>(),
    };
  }

  let authUserId: string | undefined;
  let authUserName: string | undefined;
  let isSessionSysAdmin = false;
  if (c.req.raw.headers.get("cookie")) {
    try {
      const auth = getAuth(c.env.DB, c.env);
      const session = await auth.api
        .getSession({ headers: c.req.raw.headers })
        .catch(() => null);
      const sessRole = ((session?.user as AuthUser | undefined)?.role || "").toUpperCase();
      if (sessRole === "SYSTEM_ADMIN" || sessRole === "ADMIN") {
        isSessionSysAdmin = true;
      }
      authUserId = session?.user?.id;
      authUserName = session?.user?.name || undefined;
    } catch {
      // ignore session error
    }
  }

  const headerUid = sanitizeUserIdCandidate(c.req.raw.headers.get("x-liff-user-id"));
  const headerUnameRaw = c.req.raw.headers.get("x-liff-user-name");
  let headerUname = "";
  if (headerUnameRaw) {
    try {
      headerUname = decodeURIComponent(headerUnameRaw).trim();
    } catch {
      headerUname = headerUnameRaw.trim();
    }
  }

  const searchUserIds = await expandCandidateUserIds(db, [
    params.userId,
    headerUid,
    authUserId,
  ]);

  const [orgRow, allTeamMembersRaw, allRelations] = await Promise.all([
    params.organizationId && searchUserIds.length > 0
      ? db
          .select({ role: organizationMembers.role })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, params.organizationId),
              or(...searchUserIds.map((uid) => eq(organizationMembers.userId, uid)))
            )
          )
          .get()
          .catch(() => undefined)
      : Promise.resolve(undefined),
    db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, params.teamId))
      .all(),
    db
      .select({
        parentId: parentChildRelations.parentId,
        childId: parentChildRelations.childId,
      })
      .from(parentChildRelations)
      .where(eq(parentChildRelations.teamId, params.teamId))
      .all(),
  ]);

  const activeAllMembers = allTeamMembersRaw.filter(
    (m) => m.status === "active" || !m.status
  );

  const matchedMembers: Array<typeof teamMembers.$inferSelect> = [];
  if (searchUserIds.length > 0) {
    for (const m of activeAllMembers) {
      if (m.userId && searchUserIds.includes(m.userId)) {
        matchedMembers.push(m);
      }
    }
  }

  const candidateNames = [params.userName, headerUname, authUserName].filter((s) =>
    Boolean(s?.trim())
  );

  if (matchedMembers.length === 0 && candidateNames.length > 0) {
    const matchedByUserTable = await findAndAutoLinkMemberByUserTableName(
      db,
      activeAllMembers,
      candidateNames,
      params.userId || headerUid
    );
    if (matchedByUserTable) {
      matchedMembers.push(matchedByUserTable);
    }
  }

  if (matchedMembers.length === 0 && candidateNames.length > 0) {
    const matchedByName = findMatchingAdultMemberByName(
      activeAllMembers,
      candidateNames,
      { allowAmbiguousFamilyParent: false }
    );
    if (matchedByName) {
      matchedMembers.push(matchedByName);
    }
  }

  const matchedMemberIdSet = new Set(matchedMembers.map((m) => m.id));
  const linkedChildIds = new Set<string>();
  for (const rel of allRelations) {
    if (rel.parentId && rel.childId && matchedMemberIdSet.has(rel.parentId)) {
      linkedChildIds.add(rel.childId);
    }
  }

  const orgRole = (orgRow?.role || "").toUpperCase();
  const isOrgAdmin = orgRole === "OWNER" || orgRole === "ADMIN";
  const isCreator = Boolean(params.createdBy && searchUserIds.includes(params.createdBy));
  const isTeamManagerRole = matchedMembers.some((m) => {
    const r = (m.role || "").toLowerCase();
    return PLAYER_CONDITION_MANAGER_ROLES.has(r) || canManageTeam(m.role);
  });

  return {
    canManagePlayers: isSessionSysAdmin || isCreator || isOrgAdmin || isTeamManagerRole,
    searchUserIds,
    linkedChildIds,
  };
}

function sanitizeUserIdCandidate(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || IGNORED_MOCK_USER_IDS.has(trimmed)) return "";
  return trimmed;
}

async function resolveCanManageTeamPlayers(
  c: {
    env: WorkerEnv;
    req: { raw: Request };
  },
  db: ReturnType<typeof drizzle>,
  params: {
    teamId: string;
    userId?: string | null;
    userName?: string | null;
    createdBy?: string | null;
    organizationId?: string | null;
  }
): Promise<boolean> {
  const perm = await resolveCallerPlayerEditPermissions(c, db, params);
  return perm.canManagePlayers;
}

app.get("/players", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId") || "demo-team";
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");

  if (teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      canManagePlayers: true,
      mySelfPlayerId: "demo-player-1",
      myLinkedChildIds: [] as string[],
      canClaimSelfPlayer: false,
      team: {
        id: DEMO_TEAM.id,
        name: DEMO_TEAM.name,
        orgName: DEMO_TEAM.orgName,
        teamName: DEMO_TEAM.teamName,
        managerName: DEMO_TEAM.managerName,
        logoImageUrl: DEMO_TEAM.logoImageUrl || null,
        coverImageUrl: DEMO_TEAM.coverImageUrl || null,
        year: DEMO_TEAM.year,
        captainId: "demo-player-1",
      },
      players: [
        {
          id: "demo-player-2",
          name: "佐藤 健太",
          nameKana: "サトウ ケンタ",
          uniformNumber: "1",
          nickname: "ケンタ",
          primaryPosition: "P",
          subPositions: ["CF", "1B"],
          registeredPrimaryPosition: "P",
          registeredSubPositions: ["CF"],
          positionCounts: [
            { position: "P", games: 8, sharePercent: 67 },
            { position: "CF", games: 4, sharePercent: 33 },
            { position: "1B", games: 1, sharePercent: 8 },
          ],
          totalPositionGames: 12,
          positionSource: "match_data",
          throws: "R",
          bats: "R",
          height: 171,
          weight: 63,
          editableWeight: 63,
          profileImageUrl: null,
          notes: "伸びのある直球と制球力が武器の大黒柱エース。",
          profileDetails: parsePlayerProfileDetails({
            seasonGoal: "防御率1点台＆年間50奪三振！",
            playStyleTags: ["control", "strikeout", "clutch"],
            gradeOrAge: "20代後半",
            baseballHistory: "県大会ベスト8〜草野球4年目",
            admiredPlayer: "ダルビッシュ 有",
            favoriteTeam: "北海道日本ハムファイターズ",
            gloveGear: "ミズノプロ 投手用（Dブルー）",
            batGear: "ビヨンドマックスレガシー 84cm",
            walkUpSong: "第ゼロ感 / 10-FEET",
            maxVelocityKmh: 132,
            dash50mSec: "6.5",
            longTossM: 88,
            hideWeight: false,
          }),
          isSelf: false,
          isLinkedChild: false,
          canEditProfile: true,
          hasLinkedUser: false,
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 34, ab: 31, hits: 12, hr: 1, walks: 3, avg: ".387" },
          pitching: { battersFaced: 88, outs: 72, inningsText: "24", strikeouts: 28, hitsAllowed: 14, walks: 5 },
        },
        {
          id: "demo-player-3",
          name: "鈴木 大輔",
          nameKana: "スズキ ダイスケ",
          uniformNumber: "2",
          nickname: "ダイちゃん",
          primaryPosition: "C",
          subPositions: ["1B"],
          registeredPrimaryPosition: "C",
          registeredSubPositions: ["1B", "3B"],
          positionCounts: [
            { position: "C", games: 11, sharePercent: 92 },
            { position: "1B", games: 2, sharePercent: 17 },
          ],
          totalPositionGames: 12,
          positionSource: "match_data",
          throws: "R",
          bats: "R",
          height: 168,
          weight: 66,
          editableWeight: 66,
          profileImageUrl: null,
          notes: "強肩と冷静なリードで投手陣を引っ張る扇の要。",
          profileDetails: parsePlayerProfileDetails({
            seasonGoal: "盗塁阻止率5割＆チーム防御率No.1！",
            playStyleTags: ["arm", "brain", "mood"],
            gradeOrAge: "30代",
            baseballHistory: "野球歴15年（小4〜大学・草野球）",
            admiredPlayer: "古田 敦也",
            favoriteTeam: "東京ヤクルトスワローズ",
            gloveGear: "ハタケヤマ 甲斐モデル",
            batGear: "SSK MM23 84cm",
            walkUpSong: "タマシイレボリューション / Superfly",
            maxVelocityKmh: null,
            dash50mSec: null,
            longTossM: 82,
            hideWeight: false,
          }),
          isSelf: false,
          isLinkedChild: false,
          canEditProfile: true,
          hasLinkedUser: false,
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 35, ab: 30, hits: 10, hr: 1, walks: 5, avg: ".333" },
          pitching: null,
        },
        {
          id: "demo-player-5",
          name: "伊藤 蒼真",
          nameKana: "イトウ ソウマ",
          uniformNumber: "3",
          primaryPosition: "1B",
          subPositions: ["3B"],
          registeredPrimaryPosition: "1B",
          positionCounts: [
            { position: "1B", games: 10, sharePercent: 83 },
            { position: "3B", games: 2, sharePercent: 17 },
          ],
          totalPositionGames: 12,
          positionSource: "match_data",
          throws: "L",
          bats: "L",
          height: 174,
          weight: 68,
          profileImageUrl: null,
          notes: "広角に長打を放つ左のスラッガー。一塁守備も安定。",
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 33, ab: 29, hits: 9, hr: 2, walks: 4, avg: ".310" },
          pitching: null,
        },
        {
          id: "demo-player-6",
          name: "渡辺 陽向",
          nameKana: "ワタナベ ヒナタ",
          uniformNumber: "4",
          primaryPosition: "2B",
          subPositions: ["SS"],
          registeredPrimaryPosition: "2B",
          positionCounts: [
            { position: "2B", games: 9, sharePercent: 75 },
            { position: "SS", games: 3, sharePercent: 25 },
          ],
          totalPositionGames: 12,
          positionSource: "match_data",
          throws: "R",
          bats: "L",
          height: 163,
          weight: 55,
          profileImageUrl: null,
          notes: "俊足巧打のチャンスメーカー。広い守備範囲が魅力。",
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 38, ab: 33, hits: 12, hr: 3, walks: 5, avg: ".364" },
          pitching: null,
        },
        {
          id: "demo-player-7",
          name: "中村 颯",
          nameKana: "ナカムラ ハヤテ",
          uniformNumber: "5",
          primaryPosition: "3B",
          subPositions: ["2B"],
          registeredPrimaryPosition: "3B",
          positionCounts: [
            { position: "3B", games: 10, sharePercent: 91 },
            { position: "2B", games: 1, sharePercent: 9 },
          ],
          totalPositionGames: 11,
          positionSource: "match_data",
          throws: "R",
          bats: "R",
          height: 169,
          weight: 62,
          profileImageUrl: null,
          notes: "ホットコーナーを守る元気印。勝負強い打撃が光る。",
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 30, ab: 27, hits: 8, hr: 0, walks: 3, avg: ".296" },
          pitching: null,
        },
        {
          id: "demo-player-8",
          name: "山本 蓮",
          nameKana: "ヤマモト レン",
          uniformNumber: "7",
          primaryPosition: "LF",
          subPositions: ["RF", "CF"],
          registeredPrimaryPosition: "LF",
          positionCounts: [
            { position: "LF", games: 8, sharePercent: 80 },
            { position: "RF", games: 2, sharePercent: 20 },
            { position: "CF", games: 1, sharePercent: 10 },
          ],
          totalPositionGames: 10,
          positionSource: "match_data",
          throws: "R",
          bats: "B",
          height: 166,
          weight: 58,
          profileImageUrl: null,
          notes: "スイッチヒッターのユーティリティ外野手。",
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 28, ab: 25, hits: 8, hr: 0, walks: 3, avg: ".320" },
          pitching: null,
        },
        {
          id: "demo-player-4",
          name: "高橋 陸",
          nameKana: "タカハシ リク",
          uniformNumber: "8",
          primaryPosition: "CF",
          subPositions: ["P"],
          registeredPrimaryPosition: "CF",
          positionCounts: [
            { position: "CF", games: 9, sharePercent: 75 },
            { position: "P", games: 6, sharePercent: 50 },
          ],
          totalPositionGames: 12,
          positionSource: "match_data",
          throws: "L",
          bats: "L",
          height: 170,
          weight: 60,
          profileImageUrl: null,
          notes: "チームNo.1の俊足センター。リリーフ登板もこなす二刀流。",
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 36, ab: 31, hits: 11, hr: 1, walks: 5, avg: ".355" },
          pitching: { battersFaced: 62, outs: 54, inningsText: "18", strikeouts: 19, hitsAllowed: 11, walks: 4 },
        },
        {
          id: "demo-player-9",
          name: "松本 悠斗",
          nameKana: "マツモト ユウト",
          uniformNumber: "9",
          primaryPosition: "RF",
          subPositions: ["LF"],
          registeredPrimaryPosition: "RF",
          positionCounts: [
            { position: "RF", games: 9, sharePercent: 90 },
            { position: "LF", games: 1, sharePercent: 10 },
          ],
          totalPositionGames: 10,
          positionSource: "match_data",
          throws: "R",
          bats: "R",
          height: 172,
          weight: 64,
          profileImageUrl: null,
          notes: "レーザービーム送球が武器の強肩ライト。",
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 29, ab: 26, hits: 7, hr: 1, walks: 3, avg: ".269" },
          pitching: null,
        },
        {
          id: "demo-player-1",
          name: "山田 翔太",
          nameKana: "ヤマダ ショウタ",
          uniformNumber: "10",
          nickname: "ショウタ",
          primaryPosition: "SS",
          subPositions: ["2B", "P"],
          registeredPrimaryPosition: "SS",
          registeredSubPositions: ["2B", "P"],
          positionCounts: [
            { position: "SS", games: 10, sharePercent: 83 },
            { position: "2B", games: 3, sharePercent: 25 },
            { position: "P", games: 1, sharePercent: 8 },
          ],
          totalPositionGames: 12,
          positionSource: "match_data",
          throws: "R",
          bats: "R",
          height: 168,
          weight: 61,
          editableWeight: 61,
          profileImageUrl: null,
          notes: "走攻守三拍子揃った頼れるキャプテン。ここ一番の集中力は抜群。",
          profileDetails: parsePlayerProfileDetails({
            seasonGoal: "打率4割＆全試合ノーエラーで優勝へ導く！",
            playStyleTags: ["speed", "defense", "clutch"],
            gradeOrAge: "20代後半",
            baseballHistory: "〇〇高〜大学準硬式〜草野球5年目",
            admiredPlayer: "源田 壮亮",
            favoriteTeam: "埼玉西武ライオンズ",
            gloveGear: "ZETT プロステイタス（源田モデル）",
            batGear: "ミズノ ビヨンドマックスレガシー 83cm",
            walkUpSong: "できっこないを やらなくちゃ / サンボマスター",
            maxVelocityKmh: 124,
            dash50mSec: "6.2",
            longTossM: 85,
            hideWeight: false,
          }),
          isSelf: true,
          isLinkedChild: false,
          canEditProfile: true,
          hasLinkedUser: true,
          conditionStatus: "active" as PlayerConditionStatus,
          conditionNote: null,
          isCaptain: true,
          joinedAt: null,
          batting: { pa: 37, ab: 32, hits: 14, hr: 2, walks: 5, avg: ".438" },
          pitching: null,
        },
        {
          id: "demo-player-10",
          name: "小林 樹",
          nameKana: "コバヤシ イツキ",
          uniformNumber: "18",
          primaryPosition: "P",
          subPositions: ["RF"],
          registeredPrimaryPosition: "P",
          positionCounts: [
            { position: "P", games: 5, sharePercent: 83 },
            { position: "RF", games: 2, sharePercent: 33 },
          ],
          totalPositionGames: 6,
          positionSource: "match_data",
          throws: "R",
          bats: "L",
          height: 173,
          weight: 64,
          editableWeight: 64,
          profileImageUrl: null,
          notes: "キレ味鋭いスライダーで三振を奪う本格派右腕。",
          conditionStatus: "restricted" as PlayerConditionStatus,
          conditionNote: "右肘ケアのため投球球数制限（打撃・外野守備は通常参加可）",
          isCaptain: false,
          joinedAt: null,
          batting: { pa: 16, ab: 14, hits: 4, hr: 0, walks: 2, avg: ".286" },
          pitching: { battersFaced: 45, outs: 36, inningsText: "12", strikeouts: 14, hitsAllowed: 9, walks: 3 },
        },
      ],
    });
  }

  try {
    const [teamRow, rawPlayers, [battingQueryRes, pitchingQueryRes], periodsByPlayerId] = await Promise.all([
      db
        .select({
          id: teams.id,
          name: teams.name,
          year: teams.year,
          managerName: teams.managerName,
          captainId: teams.captainId,
          createdBy: teams.createdBy,
          organizationId: teams.organizationId,
          orgName: organizations.name,
          logoImageUrl: organizations.logoImageUrl,
          coverImageUrl: organizations.coverImageUrl,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          id: players.id,
          name: players.name,
          nameKana: players.nameKana,
          uniformNumber: players.uniformNumber,
          nickname: players.nickname,
          primaryPosition: players.primaryPosition,
          subPositions: players.subPositions,
          throws: players.throws,
          bats: players.bats,
          height: players.height,
          weight: players.weight,
          profileImageUrl: players.profileImageUrl,
          userId: players.userId,
          notes: players.notes,
          profileDetails: players.profileDetails,
          conditionStatus: players.conditionStatus,
          conditionNote: players.conditionNote,
          isActive: players.isActive,
          joinedAt: players.joinedAt,
        })
        .from(players)
        .where(eq(players.teamId, teamId))
        .all(),
      c.env.DB.batch([
        c.env.DB.prepare(`
          SELECT
            ab.batter_id AS playerId,
            COUNT(ab.result) AS pa,
            SUM(CASE WHEN ab.result IN ('single','1B','double','2B','triple','3B','home_run','HR','groundout','flyout','double_play','strikeout','K','SO','error','E','fc','FC') THEN 1 ELSE 0 END) AS ab,
            SUM(CASE WHEN ab.result IN ('single','1B','double','2B','triple','3B','home_run','HR') THEN 1 ELSE 0 END) AS hits,
            SUM(CASE WHEN ab.result IN ('home_run','HR') THEN 1 ELSE 0 END) AS hr,
            SUM(CASE WHEN ab.result IN ('walk','BB','HBP','hit_by_pitch') THEN 1 ELSE 0 END) AS walks
          FROM at_bats ab
          JOIN matches m ON ab.match_id = m.id
          WHERE m.team_id = ? AND m.status = 'finished' AND ab.batter_id IS NOT NULL
          GROUP BY ab.batter_id
        `).bind(teamId),
        c.env.DB.prepare(`
          SELECT
            ab.pitcher_id AS playerId,
            COUNT(ab.result) AS battersFaced,
            SUM(CASE WHEN ab.result IN ('groundout','flyout','strikeout','K','SO','sac_bunt','sac_fly') THEN 1 WHEN ab.result = 'double_play' THEN 2 ELSE 0 END) AS outs,
            SUM(CASE WHEN ab.result IN ('strikeout','K','SO') THEN 1 ELSE 0 END) AS strikeouts,
            SUM(CASE WHEN ab.result IN ('single','1B','double','2B','triple','3B','home_run','HR') THEN 1 ELSE 0 END) AS hitsAllowed,
            SUM(CASE WHEN ab.result IN ('walk','BB','HBP','hit_by_pitch') THEN 1 ELSE 0 END) AS walks
          FROM at_bats ab
          JOIN matches m ON ab.match_id = m.id
          WHERE m.team_id = ? AND m.status = 'finished' AND ab.pitcher_id IS NOT NULL
          GROUP BY ab.pitcher_id
        `).bind(teamId),
      ]).catch(() => [{ results: [] }, { results: [] }]),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
    }

    const callerPerm = await resolveCallerPlayerEditPermissions(c, db, {
      teamId,
      userId,
      userName,
      createdBy: teamRow.createdBy,
      organizationId: teamRow.organizationId,
    });
    const canManagePlayers = callerPerm.canManagePlayers;

    // シーズン打撃成績・投手成績のマップ構築
    interface BatterAggRow {
      playerId: string;
      pa: number;
      ab: number;
      hits: number;
      hr: number;
      walks: number;
    }

    interface PitcherAggRow {
      playerId: string;
      battersFaced: number;
      outs: number;
      strikeouts: number;
      hitsAllowed: number;
      walks: number;
    }

    const battingMap = new Map<string, BatterAggRow>();
    const pitchingMap = new Map<string, PitcherAggRow>();

    for (const r of (battingQueryRes.results || []) as unknown as BatterAggRow[]) {
      if (r.playerId) {
        battingMap.set(r.playerId, {
          playerId: r.playerId,
          pa: Number(r.pa) || 0,
          ab: Number(r.ab) || 0,
          hits: Number(r.hits) || 0,
          hr: Number(r.hr) || 0,
          walks: Number(r.walks) || 0,
        });
      }
    }

    for (const r of (pitchingQueryRes.results || []) as unknown as PitcherAggRow[]) {
      if (r.playerId) {
        pitchingMap.set(r.playerId, {
          playerId: r.playerId,
          battersFaced: Number(r.battersFaced) || 0,
          outs: Number(r.outs) || 0,
          strikeouts: Number(r.strikeouts) || 0,
          hitsAllowed: Number(r.hitsAllowed) || 0,
          walks: Number(r.walks) || 0,
        });
      }
    }

    const { byPlayerId: aggregatedPosMap } = await aggregateTeamPlayerPositions(
      c.env.DB,
      teamId,
      rawPlayers.map((rp) => ({
        id: rp.id,
        name: rp.name,
        uniformNumber: rp.uniformNumber,
        primaryPosition: rp.primaryPosition,
        subPositions: rp.subPositions,
      }))
    );

    const formatInningsText = (outs: number): string => {
      const full = Math.floor(outs / 3);
      const rem = outs % 3;
      return rem > 0 ? `${full} ${rem}/3` : `${full}`;
    };

    const playersTodayKey = getTodayJstDateKey();
    const sortedPlayers = rawPlayers
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const rawPeriods = periodsByPlayerId.get(p.id) || [];
        const effectiveToday = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: rawPeriods,
          fallbackStatus: p.conditionStatus,
          fallbackNote: p.conditionNote,
          dateKey: playersTodayKey,
          todayKey: playersTodayKey,
        });
        return {
          raw: p,
          rawPeriods,
          effectiveToday,
          conditionStatus: effectiveToday.status,
          uniformNumber: p.uniformNumber,
          name: p.name,
        };
      })
      .sort(comparePlayersByConditionAndUniform)
      .map(({ raw: p, rawPeriods, effectiveToday }) => {
        const bStat = battingMap.get(p.id);
        const pStat = pitchingMap.get(p.id);

        const batting =
          bStat && bStat.pa > 0
            ? {
                pa: bStat.pa,
                ab: bStat.ab,
                hits: bStat.hits,
                hr: bStat.hr,
                walks: bStat.walks,
                avg:
                  bStat.ab > 0
                    ? (bStat.hits / bStat.ab).toFixed(3).replace(/^0/, "")
                    : ".000",
              }
            : null;

        const pitching =
          pStat && pStat.battersFaced > 0
            ? {
                battersFaced: pStat.battersFaced,
                outs: pStat.outs,
                inningsText: formatInningsText(pStat.outs),
                strikeouts: pStat.strikeouts,
                hitsAllowed: pStat.hitsAllowed,
                walks: pStat.walks,
              }
            : null;

        let parsedSubs: string[] = [];
        if (Array.isArray(p.subPositions)) {
          parsedSubs = p.subPositions;
        } else if (typeof p.subPositions === "string") {
          try {
            const parsed = JSON.parse(p.subPositions);
            if (Array.isArray(parsed)) parsedSubs = parsed;
          } catch {}
        }

        const posAgg = aggregatedPosMap.get(p.id);

        let joinedTs: number | null = null;
        if (p.joinedAt instanceof Date) {
          joinedTs = Math.floor(p.joinedAt.getTime() / 1000);
        } else if (typeof p.joinedAt === "number") {
          joinedTs = p.joinedAt;
        }

        const normalizedCondition = effectiveToday.status;
        const resolvedPrivateNote =
          normalizedCondition !== "active"
            ? effectiveToday.note ?? p.conditionNote
            : p.conditionNote;
        const maskedPeriods = maskConditionPeriodsForViewer(rawPeriods, canManagePlayers);
        const activeConditionPeriod = effectiveToday.period
          ? maskConditionPeriodsForViewer([effectiveToday.period], canManagePlayers)[0] || null
          : null;
        const upcomingRaw = findUpcomingPlayerConditionPeriod(rawPeriods, playersTodayKey);
        const upcomingConditionPeriod = upcomingRaw
          ? maskConditionPeriodsForViewer([upcomingRaw], canManagePlayers)[0] || null
          : null;

        const profileDetails = parsePlayerProfileDetails(p.profileDetails);
        const isSelf = Boolean(p.userId && callerPerm.searchUserIds.includes(p.userId));
        const isLinkedChild = callerPerm.linkedChildIds.has(p.id);
        const canEditProfile = canManagePlayers || isSelf || isLinkedChild;

        return {
          id: p.id,
          name: p.name,
          nameKana: p.nameKana || null,
          uniformNumber: p.uniformNumber,
          nickname: p.nickname || null,
          primaryPosition: posAgg ? posAgg.primaryPosition : (p.primaryPosition || null),
          subPositions: posAgg ? posAgg.subPositions : parsedSubs,
          registeredPrimaryPosition: posAgg
            ? posAgg.registeredPrimaryPosition
            : (p.primaryPosition || null),
          registeredSubPositions: parsedSubs,
          positionCounts: posAgg ? posAgg.positionCounts : [],
          totalPositionGames: posAgg ? posAgg.totalPositionGames : 0,
          positionSource: posAgg ? posAgg.positionSource : "profile",
          throws: p.throws || null,
          bats: p.bats || null,
          height: p.height ?? null,
          weight: profileDetails.hideWeight ? null : (p.weight ?? null),
          editableWeight: canEditProfile ? (p.weight ?? null) : null,
          profileImageUrl: p.profileImageUrl || null,
          notes: p.notes || null,
          profileDetails,
          isSelf,
          isLinkedChild,
          canEditProfile,
          hasLinkedUser: Boolean(p.userId),
          conditionStatus: normalizedCondition,
          conditionNote: canManagePlayers ? resolvedPrivateNote || null : null,
          conditionPeriods: maskedPeriods,
          activeConditionPeriod,
          upcomingConditionPeriod,
          isCaptain: Boolean(teamRow.captainId && teamRow.captainId === p.id),
          joinedAt: joinedTs,
          batting,
          pitching,
        };
      });

    const mySelfPlayer = sortedPlayers.find((p) => p.isSelf) || null;
    const myLinkedChildIds = sortedPlayers
      .filter((p) => p.isLinkedChild)
      .map((p) => p.id);

    return c.json({
      success: true,
      isDemo: false,
      canManagePlayers,
      mySelfPlayerId: mySelfPlayer?.id || null,
      myLinkedChildIds,
      canClaimSelfPlayer: callerPerm.searchUserIds.length > 0 && !mySelfPlayer,
      team: {
        id: teamRow.id,
        name: `${teamRow.orgName ? `${teamRow.orgName} ` : ""}${teamRow.name}`.trim(),
        orgName: teamRow.orgName || teamRow.name,
        teamName: teamRow.name,
        managerName: teamRow.managerName || null,
        logoImageUrl: teamRow.logoImageUrl || null,
        coverImageUrl: teamRow.coverImageUrl || null,
        year: teamRow.year || 2026,
        captainId: teamRow.captainId || null,
      },
      players: sortedPlayers,
    });
  } catch (err: unknown) {
    console.error("Failed to fetch LIFF players directory:", err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "選手名鑑の取得に失敗しました" },
      500
    );
  }
});

/**
 * ✏️ 選手名鑑プロフィール更新API (POST /players/:playerId/profile)
 * - 選手本人（`players.userId`一致）・紐付け済み保護者（`parent_child_relations`）・指導者/管理者が更新可能
 * - `背番号`・`正式登録名`・`主将設定` は公式スコアブック整合性保護のため指導者/管理者のみ変更可能
 */
app.post("/players/:playerId/profile", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const playerId = c.req.param("playerId");

  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      userId?: string | null;
      userName?: string | null;
      // 指導者・管理者限定項目
      name?: string;
      uniformNumber?: string;
      isCaptain?: boolean;
      joinedAt?: string | number | null;
      // 本人・保護者・指導者共通項目
      nameKana?: string | null;
      nickname?: string | null;
      registeredPrimaryPosition?: string | null;
      registeredSubPositions?: string[];
      throws?: string | null;
      bats?: string | null;
      height?: number | string | null;
      weight?: number | string | null;
      notes?: string | null;
      profileDetails?: Partial<PlayerProfileDetails> | null;
    };

    const teamId = (body.teamId || c.req.query("teamId") || "").trim();

    const cleanNameKana =
      typeof body.nameKana === "string" && body.nameKana.trim()
        ? body.nameKana.trim().slice(0, 50)
        : null;
    const cleanNickname =
      typeof body.nickname === "string" && body.nickname.trim()
        ? body.nickname.trim().slice(0, 24)
        : null;
    const cleanPrimaryPos = normalizeCanonicalPositionCode(body.registeredPrimaryPosition);

    const rawSubs = Array.isArray(body.registeredSubPositions)
      ? body.registeredSubPositions
      : [];
    const subSet = new Set<string>();
    const cleanSubPositions: string[] = [];
    for (const s of rawSubs) {
      const code = normalizeCanonicalPositionCode(s);
      if (code && code !== cleanPrimaryPos && !subSet.has(code)) {
        subSet.add(code);
        cleanSubPositions.push(code);
        if (cleanSubPositions.length >= 5) break;
      }
    }

    const cleanThrows =
      body.throws === "R" || body.throws === "L" ? body.throws : null;
    const cleanBats =
      body.bats === "R" || body.bats === "L" || body.bats === "B"
        ? body.bats
        : null;

    const parseBoundedInt = (
      val: number | string | null | undefined,
      min: number,
      max: number
    ): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const num = typeof val === "number" ? val : Number(String(val).trim());
      if (!Number.isFinite(num)) return null;
      const rounded = Math.round(num);
      return rounded >= min && rounded <= max ? rounded : null;
    };

    const cleanHeight = parseBoundedInt(body.height, 90, 230);
    const cleanWeight = parseBoundedInt(body.weight, 15, 160);
    const cleanNotes =
      typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim().slice(0, 200)
        : null;
    const cleanDetails = parsePlayerProfileDetails(body.profileDetails);

    if (!teamId || teamId === "demo-team" || playerId.startsWith("demo-")) {
      const demoName =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 40)
          : undefined;
      const demoUniform =
        typeof body.uniformNumber === "string" && body.uniformNumber.trim()
          ? body.uniformNumber.trim().replace(/^#/, "").slice(0, 6)
          : undefined;
      const demoJoined =
        body.joinedAt !== undefined
          ? parseDateInputToUnixSeconds(body.joinedAt).unixSeconds
          : undefined;

      return c.json({
        success: true,
        isDemo: true,
        playerId,
        updated: {
          ...(demoName ? { name: demoName } : {}),
          ...(demoUniform ? { uniformNumber: demoUniform } : {}),
          ...(typeof body.isCaptain === "boolean" ? { isCaptain: body.isCaptain } : {}),
          ...(demoJoined !== undefined ? { joinedAt: demoJoined } : {}),
          nameKana: cleanNameKana,
          nickname: cleanNickname,
          registeredPrimaryPosition: cleanPrimaryPos,
          registeredSubPositions: cleanSubPositions,
          throws: cleanThrows,
          bats: cleanBats,
          height: cleanHeight,
          weight: cleanDetails.hideWeight ? null : cleanWeight,
          editableWeight: cleanWeight,
          notes: cleanNotes,
          profileDetails: cleanDetails,
        },
      });
    }

    const [teamRow, existingPlayer] = await Promise.all([
      db
        .select({
          id: teams.id,
          captainId: teams.captainId,
          createdBy: teams.createdBy,
          organizationId: teams.organizationId,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          id: players.id,
          teamId: players.teamId,
          name: players.name,
          uniformNumber: players.uniformNumber,
          userId: players.userId,
          joinedAt: players.joinedAt,
          profileDetails: players.profileDetails,
        })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId)))
        .get(),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
    }
    if (!existingPlayer) {
      return c.json({ success: false, error: "対象の選手が見つかりません" }, 404);
    }

    const perm = await resolveCallerPlayerEditPermissions(c, db, {
      teamId,
      userId: body.userId || c.req.query("userId"),
      userName: body.userName || c.req.query("userName"),
      createdBy: teamRow.createdBy,
      organizationId: teamRow.organizationId,
    });

    const isSelf = Boolean(
      existingPlayer.userId && perm.searchUserIds.includes(existingPlayer.userId)
    );
    const isLinkedChild = perm.linkedChildIds.has(playerId);

    if (!perm.canManagePlayers && !isSelf && !isLinkedChild) {
      return c.json(
        {
          success: false,
          error:
            "この選手のプロフィールを編集する権限がありません（ご本人・紐付け保護者・指導者のみ編集できます）",
        },
        403
      );
    }

    const existingJoinedSeconds =
      existingPlayer.joinedAt instanceof Date
        ? Math.floor(existingPlayer.joinedAt.getTime() / 1000)
        : typeof existingPlayer.joinedAt === "number"
        ? existingPlayer.joinedAt
        : null;

    let nextName = existingPlayer.name;
    let nextUniform = existingPlayer.uniformNumber;
    let nextCaptainId = teamRow.captainId || null;
    let shouldUpdateTeamCaptain = false;
    let nextJoinedSeconds: number | null = existingJoinedSeconds;
    let nextJoinedDate: Date | null =
      existingJoinedSeconds !== null ? new Date(existingJoinedSeconds * 1000) : null;
    let nextJoinedDateKey: string | null = null;

    if (perm.canManagePlayers) {
      if (typeof body.name === "string" && body.name.trim()) {
        nextName = body.name.trim().slice(0, 40);
      }
      if (typeof body.uniformNumber === "string" && body.uniformNumber.trim()) {
        const cleanedNum = body.uniformNumber.trim().replace(/^#/, "").slice(0, 6);
        if (cleanedNum) nextUniform = cleanedNum;
      }
      if (typeof body.isCaptain === "boolean") {
        if (body.isCaptain && teamRow.captainId !== playerId) {
          nextCaptainId = playerId;
          shouldUpdateTeamCaptain = true;
        } else if (!body.isCaptain && teamRow.captainId === playerId) {
          nextCaptainId = null;
          shouldUpdateTeamCaptain = true;
        }
      }
      if (body.joinedAt !== undefined) {
        const parsedJoin = parseDateInputToUnixSeconds(body.joinedAt);
        nextJoinedSeconds = parsedJoin.unixSeconds;
        nextJoinedDateKey = parsedJoin.dateKey;
        nextJoinedDate =
          parsedJoin.unixSeconds !== null ? new Date(parsedJoin.unixSeconds * 1000) : null;
      }
    }

    // 写真専用APIで更新された背景プレー写真URLがプロフィール保存で消えないよう既存DB値を優先保護
    const existingDetails = parsePlayerProfileDetails(existingPlayer.profileDetails);
    const mergedDetails: PlayerProfileDetails = {
      ...cleanDetails,
      actionImageUrl:
        body.profileDetails &&
        Object.prototype.hasOwnProperty.call(body.profileDetails, "actionImageUrl") &&
        body.profileDetails.actionImageUrl !== undefined
          ? cleanDetails.actionImageUrl
          : existingDetails.actionImageUrl,
    };

    await db
      .update(players)
      .set({
        name: nextName,
        nameKana: cleanNameKana,
        uniformNumber: nextUniform,
        nickname: cleanNickname,
        primaryPosition: cleanPrimaryPos,
        subPositions: cleanSubPositions,
        throws: cleanThrows,
        bats: cleanBats,
        height: cleanHeight,
        weight: cleanWeight,
        notes: cleanNotes,
        profileDetails: JSON.stringify(mergedDetails),
        joinedAt: nextJoinedDate,
      })
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

    if (shouldUpdateTeamCaptain) {
      await db
        .update(teams)
        .set({ captainId: nextCaptainId })
        .where(eq(teams.id, teamId));
    }

    let cleanedPastMatchesCount = 0;
    if (nextJoinedDateKey) {
      cleanedPastMatchesCount = await cleanupPreJoinMatchAttendance(
        c.env.DB,
        teamId,
        playerId,
        nextJoinedDateKey
      );
    }

    return c.json({
      success: true,
      isDemo: false,
      playerId,
      captainId: nextCaptainId,
      cleanedPastMatchesCount,
      updated: {
        name: nextName,
        nameKana: cleanNameKana,
        uniformNumber: nextUniform,
        nickname: cleanNickname,
        registeredPrimaryPosition: cleanPrimaryPos,
        registeredSubPositions: cleanSubPositions,
        throws: cleanThrows,
        bats: cleanBats,
        height: cleanHeight,
        weight: mergedDetails.hideWeight ? null : cleanWeight,
        editableWeight: cleanWeight,
        notes: cleanNotes,
        profileDetails: mergedDetails,
        isCaptain: nextCaptainId === playerId,
        joinedAt: nextJoinedSeconds,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to update player profile:", err);
    return c.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "選手プロフィールの保存に失敗しました",
      },
      500
    );
  }
});

/**
 * 🩹 選手の在籍・コンディション状態＆期間履歴更新API (POST /players/:playerId/condition)
 * 指導者・管理者限定で「通常 / 一部制限あり / リハビリ・調整中 / 休部中」、期間（いつから〜いつまで/未定）、非公開メモを管理する
 */
app.post("/players/:playerId/condition", async (c) => {
  await ensurePlayerConditionPeriodsTable(c.env.DB);
  const db = drizzle(c.env.DB);
  const playerId = c.req.param("playerId");

  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      userId?: string | null;
      userName?: string | null;
      action?: "save_status" | "save_period" | "delete_period";
      conditionStatus?: string;
      conditionNote?: string | null;
      periodId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      returnDate?: string | null;
    };

    const teamId = (body.teamId || c.req.query("teamId") || "").trim();
    const action = body.action || "save_status";
    const nextStatus = normalizePlayerConditionStatus(body.conditionStatus);
    const rawNote = typeof body.conditionNote === "string" ? body.conditionNote.trim() : "";
    const nextNote = rawNote ? rawNote.slice(0, 160) : null;
    const todayKey = getTodayJstDateKey();

    if (!teamId || teamId === "demo-team" || playerId.startsWith("demo-")) {
      return c.json({
        success: true,
        isDemo: true,
        playerId,
        conditionStatus: nextStatus,
        conditionNote: nextNote,
      });
    }

    const [teamRow, existingPlayer, existingPeriods] = await Promise.all([
      db
        .select({
          id: teams.id,
          createdBy: teams.createdBy,
          organizationId: teams.organizationId,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          id: players.id,
          teamId: players.teamId,
          conditionNote: players.conditionNote,
        })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId)))
        .get(),
      loadSinglePlayerConditionPeriods(c.env.DB, teamId, playerId),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
    }
    if (!existingPlayer) {
      return c.json({ success: false, error: "対象の選手が見つかりません" }, 404);
    }

    const canManagePlayers = await resolveCanManageTeamPlayers(c, db, {
      teamId,
      userId: body.userId || c.req.query("userId"),
      userName: body.userName || c.req.query("userName"),
      createdBy: teamRow.createdBy,
      organizationId: teamRow.organizationId,
    });

    if (!canManagePlayers) {
      return c.json(
        {
          success: false,
          error: "在籍・コンディション設定を変更する権限がありません（指導者・管理者限定）",
        },
        403
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);

    if (action === "delete_period") {
      const targetPeriodId = (body.periodId || "").trim();
      if (!targetPeriodId) {
        return c.json({ success: false, error: "削除対象の期間IDが指定されていません" }, 400);
      }
      await c.env.DB.prepare(
        `DELETE FROM player_condition_periods WHERE id = ? AND team_id = ? AND player_id = ?`
      )
        .bind(targetPeriodId, teamId, playerId)
        .run();
    } else if (action === "save_period") {
      if (!isNonActiveConditionStatus(nextStatus)) {
        return c.json(
          { success: false, error: "期間履歴には一部制限・リハビリ・休部のいずれかを指定してください" },
          400
        );
      }
      const sDate = normalizeIsoDateKey(body.startDate);
      if (!sDate) {
        return c.json({ success: false, error: "開始日（いつから）を入力してください" }, 400);
      }
      const eDate = body.endDate ? normalizeIsoDateKey(body.endDate) : null;
      if (body.endDate && !eDate) {
        return c.json({ success: false, error: "終了日の形式が正しくありません" }, 400);
      }
      if (eDate && eDate < sDate) {
        return c.json({ success: false, error: "終了日は開始日以降の日付を指定してください" }, 400);
      }

      const editId = (body.periodId || "").trim();
      const hasExisting = editId && existingPeriods.some((p) => p.id === editId);
      if (hasExisting) {
        await c.env.DB.prepare(
          `UPDATE player_condition_periods
           SET status = ?, start_date = ?, end_date = ?, private_note = ?, updated_at = ?
           WHERE id = ? AND team_id = ? AND player_id = ?`
        )
          .bind(nextStatus, sDate, eDate, nextNote, nowSec, editId, teamId, playerId)
          .run();
      } else {
        const newId = crypto.randomUUID();
        await c.env.DB.prepare(
          `INSERT INTO player_condition_periods
           (id, team_id, player_id, status, start_date, end_date, private_note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(newId, teamId, playerId, nextStatus, sDate, eDate, nextNote, nowSec, nowSec)
          .run();
      }
    } else {
      // action === "save_status"
      if (nextStatus === "active") {
        // 通常（出場可）への復帰：現在有効な期間があれば終了日を自動クローズして過去履歴として保持する
        const returnDateKey = normalizeIsoDateKey(body.returnDate) || todayKey;
        const closeEndKey = shiftIsoDateKeyByDays(returnDateKey, -1);
        const ongoingPeriods = existingPeriods.filter(
          (p) => p.startDate <= todayKey && (!p.endDate || todayKey <= p.endDate)
        );
        for (const op of ongoingPeriods) {
          if (op.startDate === todayKey && returnDateKey <= todayKey) {
            // 当日誤操作で作成して即座に通常へ戻した場合は不要な当日ゴミ履歴を残さず削除
            await c.env.DB.prepare(
              `DELETE FROM player_condition_periods WHERE id = ? AND team_id = ? AND player_id = ?`
            )
              .bind(op.id, teamId, playerId)
              .run();
          } else {
            const safeEnd = closeEndKey < op.startDate ? op.startDate : closeEndKey;
            await c.env.DB.prepare(
              `UPDATE player_condition_periods SET end_date = ?, updated_at = ? WHERE id = ? AND team_id = ? AND player_id = ?`
            )
              .bind(safeEnd, nowSec, op.id, teamId, playerId)
              .run();
          }
        }
      } else {
        const sDate = normalizeIsoDateKey(body.startDate) || todayKey;
        const eDate = body.endDate ? normalizeIsoDateKey(body.endDate) : null;
        if (eDate && eDate < sDate) {
          return c.json({ success: false, error: "終了日は開始日以降の日付を指定してください" }, 400);
        }

        const explicitPeriodId = (body.periodId || "").trim();
        const matchingById = explicitPeriodId
          ? existingPeriods.find((p) => p.id === explicitPeriodId)
          : undefined;
        const ongoing = existingPeriods.find(
          (p) => p.startDate <= todayKey && (!p.endDate || todayKey <= p.endDate)
        );

        if (matchingById) {
          await c.env.DB.prepare(
            `UPDATE player_condition_periods
             SET status = ?, start_date = ?, end_date = ?, private_note = ?, updated_at = ?
             WHERE id = ? AND team_id = ? AND player_id = ?`
          )
            .bind(nextStatus, sDate, eDate, nextNote, nowSec, matchingById.id, teamId, playerId)
            .run();
        } else if (ongoing) {
          if (ongoing.status === nextStatus || ongoing.startDate >= sDate) {
            await c.env.DB.prepare(
              `UPDATE player_condition_periods
               SET status = ?, start_date = ?, end_date = ?, private_note = ?, updated_at = ?
               WHERE id = ? AND team_id = ? AND player_id = ?`
            )
              .bind(nextStatus, sDate, eDate, nextNote, nowSec, ongoing.id, teamId, playerId)
              .run();
          } else {
            // 例：リハビリ（10/1〜）から一部制限（11/10〜）へ段階移行した場合、前期間を前日で閉じて新期間を追加
            const prevCloseEnd = shiftIsoDateKeyByDays(sDate, -1);
            await c.env.DB.batch([
              c.env.DB.prepare(
                `UPDATE player_condition_periods SET end_date = ?, updated_at = ? WHERE id = ? AND team_id = ? AND player_id = ?`
              ).bind(
                prevCloseEnd < ongoing.startDate ? ongoing.startDate : prevCloseEnd,
                nowSec,
                ongoing.id,
                teamId,
                playerId
              ),
              c.env.DB.prepare(
                `INSERT INTO player_condition_periods
                 (id, team_id, player_id, status, start_date, end_date, private_note, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                crypto.randomUUID(),
                teamId,
                playerId,
                nextStatus,
                sDate,
                eDate,
                nextNote,
                nowSec,
                nowSec
              ),
            ]);
          }
        } else {
          await c.env.DB.prepare(
            `INSERT INTO player_condition_periods
             (id, team_id, player_id, status, start_date, end_date, private_note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              teamId,
              playerId,
              nextStatus,
              sDate,
              eDate,
              nextNote,
              nowSec,
              nowSec
            )
            .run();
        }
      }
    }

    const updatedPeriods = await loadSinglePlayerConditionPeriods(c.env.DB, teamId, playerId);
    const effectiveToday = resolveEffectivePlayerConditionOnDate({
      conditionPeriods: updatedPeriods,
      fallbackStatus: action === "save_status" && nextStatus === "active" ? "active" : undefined,
      fallbackNote: action === "save_status" && nextStatus === "active" ? nextNote : null,
      dateKey: todayKey,
      todayKey,
    });

    const syncedStatus = effectiveToday.status;
    const syncedNote =
      syncedStatus !== "active"
        ? effectiveToday.note
        : action === "save_status"
        ? nextNote
        : existingPlayer.conditionNote || null;

    await Promise.all([
      db
        .update(players)
        .set({
          conditionStatus: syncedStatus,
          conditionNote: syncedNote,
        })
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId))),
      cleanupLeavePeriodsMatchAttendance(c.env.DB, teamId, playerId, updatedPeriods),
    ]);

    const maskedPeriods = maskConditionPeriodsForViewer(updatedPeriods, true);
    const activeConditionPeriod = effectiveToday.period
      ? maskConditionPeriodsForViewer([effectiveToday.period], true)[0] || null
      : null;
    const upcomingRaw = findUpcomingPlayerConditionPeriod(updatedPeriods, todayKey);
    const upcomingConditionPeriod = upcomingRaw
      ? maskConditionPeriodsForViewer([upcomingRaw], true)[0] || null
      : null;

    return c.json({
      success: true,
      isDemo: false,
      playerId,
      conditionStatus: syncedStatus,
      conditionNote: syncedNote,
      conditionPeriods: maskedPeriods,
      activeConditionPeriod,
      upcomingConditionPeriod,
    });
  } catch (err: unknown) {
    console.error("Failed to update player condition:", err);
    return c.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "在籍・コンディション状態の保存に失敗しました",
      },
      500
    );
  }
});

/**
 * 📷 選手プロフィール写真（正面写真 `portrait` / 背景プレー写真 `action`）の撮影・アップロード保存API (POST /players/:playerId/photo)
 */
app.post("/players/:playerId/photo", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const playerId = c.req.param("playerId");

  try {
    let file: File | null = null;
    let teamId = c.req.query("teamId") || "";
    let photoKind: "portrait" | "action" =
      c.req.query("kind") === "action" ? "action" : "portrait";
    let userId = c.req.query("userId") || "";
    let userName = c.req.query("userName") || "";

    try {
      const formData = await c.req.formData();
      const rawFile = formData.get("file");
      if (rawFile && typeof rawFile !== "string") {
        file = rawFile as File;
      }
      const rawTeamId = formData.get("teamId");
      if (typeof rawTeamId === "string" && rawTeamId.trim()) {
        teamId = rawTeamId.trim();
      }
      const rawKind = formData.get("kind");
      if (rawKind === "action") {
        photoKind = "action";
      }
      const rawUserId = formData.get("userId");
      if (typeof rawUserId === "string" && rawUserId.trim()) {
        userId = rawUserId.trim();
      }
      const rawUserName = formData.get("userName");
      if (typeof rawUserName === "string" && rawUserName.trim()) {
        userName = rawUserName.trim();
      }
    } catch {
      const body = await c.req.parseBody();
      const rawFile = body["file"];
      if (rawFile && typeof rawFile !== "string") {
        file = rawFile as File;
      }
      const rawTeamId = body["teamId"];
      if (typeof rawTeamId === "string" && rawTeamId.trim()) {
        teamId = rawTeamId.trim();
      }
      if (body["kind"] === "action") {
        photoKind = "action";
      }
      const rawUserId = body["userId"];
      if (typeof rawUserId === "string" && rawUserId.trim()) {
        userId = rawUserId.trim();
      }
      const rawUserName = body["userName"];
      if (typeof rawUserName === "string" && rawUserName.trim()) {
        userName = rawUserName.trim();
      }
    }

    if (!file || !file.name) {
      return c.json({ success: false, error: "写真ファイルが選択されていません" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const mimeType = file.type || "image/jpeg";

    const toDataUrl = (): string => {
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const sub = bytes.subarray(i, i + chunkSize);
        for (let j = 0; j < sub.length; j++) {
          binary += String.fromCharCode(sub[j]);
        }
      }
      return `data:${mimeType};base64,${btoa(binary)}`;
    };

    // デモモードではDBを更新せずプレビュー用DataURLを即時返却
    if (!teamId || teamId === "demo-team" || playerId.startsWith("demo-")) {
      const demoDataUrl = toDataUrl();
      return c.json({
        success: true,
        isDemo: true,
        playerId,
        kind: photoKind,
        ...(photoKind === "action"
          ? { actionImageUrl: demoDataUrl }
          : { profileImageUrl: demoDataUrl }),
      });
    }

    const [teamRow, existingPlayer] = await Promise.all([
      db
        .select({
          id: teams.id,
          createdBy: teams.createdBy,
          organizationId: teams.organizationId,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          id: players.id,
          teamId: players.teamId,
          userId: players.userId,
          profileImageUrl: players.profileImageUrl,
          profileDetails: players.profileDetails,
        })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId)))
        .get(),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
    }
    if (!existingPlayer) {
      return c.json({ success: false, error: "対象の選手が見つかりません" }, 404);
    }

    const perm = await resolveCallerPlayerEditPermissions(c, db, {
      teamId,
      userId: userId || null,
      userName: userName || null,
      createdBy: teamRow.createdBy,
      organizationId: teamRow.organizationId,
    });
    const isSelf = Boolean(
      existingPlayer.userId && perm.searchUserIds.includes(existingPlayer.userId)
    );
    const isLinkedChild = perm.linkedChildIds.has(playerId);

    if (!perm.canManagePlayers && !isSelf && !isLinkedChild) {
      return c.json(
        {
          success: false,
          error:
            "この選手の写真を変更する権限がありません（ご本人・紐付け保護者・指導者のみ設定できます）",
        },
        403
      );
    }

    const existingDetails = parsePlayerProfileDetails(existingPlayer.profileDetails);
    const prevUrl =
      photoKind === "action"
        ? existingDetails.actionImageUrl || ""
        : existingPlayer.profileImageUrl || "";

    let imageUrl = "";
    if (c.env.BUCKET) {
      // 既存のR2選手写真がある場合は容量節約のためクリーンアップ
      const prefix = "/api/images/";
      if (prevUrl.startsWith("/api/images/players/")) {
        const oldR2Key = prevUrl.slice(prefix.length);
        await c.env.BUCKET.delete(oldR2Key).catch(() => {});
      }

      const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = rawExt.replace(/[^a-z0-9]/g, "") || "jpg";
      const safePlayerKey = playerId.replace(/[^a-zA-Z0-9_-]/g, "");
      const safeTeamKey = teamId.replace(/[^a-zA-Z0-9_-]/g, "");
      const suffix = photoKind === "action" ? `-action-${Date.now()}` : `-${Date.now()}`;
      const objectKey = `players/${safeTeamKey}/${safePlayerKey}${suffix}.${safeExt}`;

      await c.env.BUCKET.put(objectKey, arrayBuffer, {
        httpMetadata: { contentType: mimeType },
      });
      imageUrl = `/api/images/${objectKey}`;
    } else {
      imageUrl = toDataUrl();
    }

    if (photoKind === "action") {
      const nextDetails: PlayerProfileDetails = {
        ...existingDetails,
        actionImageUrl: imageUrl,
      };
      await db
        .update(players)
        .set({ profileDetails: JSON.stringify(nextDetails) })
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

      return c.json({
        success: true,
        isDemo: false,
        playerId,
        kind: "action",
        actionImageUrl: imageUrl,
      });
    }

    await db
      .update(players)
      .set({ profileImageUrl: imageUrl })
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

    return c.json({
      success: true,
      isDemo: false,
      playerId,
      kind: "portrait",
      profileImageUrl: imageUrl,
    });
  } catch (err: unknown) {
    console.error("Failed to upload player photo:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "選手写真の保存に失敗しました",
      },
      500
    );
  }
});

/**
 * 🗑️ 選手プロフィール写真（正面写真 `portrait` / 背景プレー写真 `action`）の削除API (DELETE /players/:playerId/photo)
 */
app.delete("/players/:playerId/photo", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const playerId = c.req.param("playerId");
  const teamId = c.req.query("teamId") || "";
  const photoKind: "portrait" | "action" =
    c.req.query("kind") === "action" ? "action" : "portrait";
  const userId = c.req.query("userId") || null;
  const userName = c.req.query("userName") || null;

  try {
    if (!teamId || teamId === "demo-team" || playerId.startsWith("demo-")) {
      return c.json({
        success: true,
        isDemo: true,
        playerId,
        kind: photoKind,
        ...(photoKind === "action"
          ? { actionImageUrl: null }
          : { profileImageUrl: null }),
      });
    }

    const [teamRow, existingPlayer] = await Promise.all([
      db
        .select({
          id: teams.id,
          createdBy: teams.createdBy,
          organizationId: teams.organizationId,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({
          id: players.id,
          userId: players.userId,
          profileImageUrl: players.profileImageUrl,
          profileDetails: players.profileDetails,
        })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId)))
        .get(),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
    }
    if (!existingPlayer) {
      return c.json({ success: false, error: "対象の選手が見つかりません" }, 404);
    }

    const perm = await resolveCallerPlayerEditPermissions(c, db, {
      teamId,
      userId,
      userName,
      createdBy: teamRow.createdBy,
      organizationId: teamRow.organizationId,
    });
    const isSelf = Boolean(
      existingPlayer.userId && perm.searchUserIds.includes(existingPlayer.userId)
    );
    const isLinkedChild = perm.linkedChildIds.has(playerId);

    if (!perm.canManagePlayers && !isSelf && !isLinkedChild) {
      return c.json(
        {
          success: false,
          error:
            "この選手の写真を削除する権限がありません（ご本人・紐付け保護者・指導者のみ削除できます）",
        },
        403
      );
    }

    if (photoKind === "action") {
      const existingDetails = parsePlayerProfileDetails(existingPlayer.profileDetails);
      if (
        c.env.BUCKET &&
        existingDetails.actionImageUrl?.startsWith("/api/images/players/")
      ) {
        const oldR2Key = existingDetails.actionImageUrl.slice("/api/images/".length);
        await c.env.BUCKET.delete(oldR2Key).catch(() => {});
      }
      const nextDetails: PlayerProfileDetails = {
        ...existingDetails,
        actionImageUrl: null,
      };
      await db
        .update(players)
        .set({ profileDetails: JSON.stringify(nextDetails) })
        .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

      return c.json({
        success: true,
        isDemo: false,
        playerId,
        kind: "action",
        actionImageUrl: null,
      });
    }

    if (c.env.BUCKET && existingPlayer.profileImageUrl?.startsWith("/api/images/players/")) {
      const oldR2Key = existingPlayer.profileImageUrl.slice("/api/images/".length);
      await c.env.BUCKET.delete(oldR2Key).catch(() => {});
    }

    await db
      .update(players)
      .set({ profileImageUrl: null })
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

    return c.json({
      success: true,
      isDemo: false,
      playerId,
      kind: "portrait",
      profileImageUrl: null,
    });
  } catch (err: unknown) {
    console.error("Failed to delete player photo:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "選手写真の削除に失敗しました",
      },
      500
    );
  }
});

/**
 * 🏆 大会一覧取得API (GET /tournaments)
 * LIFF内の試合基本情報編集画面などからセッションCookie不要で登録済み大会候補を取得
 */
app.get("/tournaments", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        tournaments: [
          { id: "demo-trn-1", name: "川崎市秋季大会", season: "2026", category: "other" },
          { id: "demo-trn-2", name: "高津区少年野球大会", season: "2026", category: "other" },
          { id: "demo-trn-3", name: "多摩川親善交流リーグ", season: "2026", category: "other" },
        ],
      });
    }

    const rows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        season: tournaments.season,
        category: tournaments.category,
      })
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt))
      .all();

    return c.json({
      success: true,
      isDemo: false,
      tournaments: rows,
    });
  } catch (err: unknown) {
    console.error("Failed to fetch LIFF tournaments:", err);
    return c.json({
      success: true,
      isDemo: false,
      tournaments: [],
    });
  }
});

/**
 * 🛡️ チームロゴ画像のアップロード・更新API (POST /teams/:teamId/logo)
 * LIFF内のチーム設定画面からセッションCookie不要で `organizations.logoImageUrl` + R2 を安全に更新する
 */
app.post("/teams/:teamId/logo", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = (c.req.param("teamId") || "").trim();

  try {
    const body = (await c.req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      clear?: boolean;
    };

    if (!teamId || teamId === "demo-team") {
      if (body.clear) {
        return c.json({
          success: true,
          isDemo: true,
          teamId: "demo-team",
          logoImageUrl: null,
        });
      }
      const rawData = (body.imageBase64 || "").trim();
      if (!rawData) {
        return c.json({ success: false, error: "ロゴ画像データがありません" }, 400);
      }
      const safeMime = (body.mimeType || "image/png").trim() || "image/png";
      const dataUrl = rawData.startsWith("data:")
        ? rawData
        : `data:${safeMime};base64,${rawData}`;
      return c.json({
        success: true,
        isDemo: true,
        teamId: "demo-team",
        logoImageUrl: dataUrl,
      });
    }

    const teamObj = await db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
        logoImageUrl: organizations.logoImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!teamObj) {
      return c.json({ success: false, error: "対象のチームが見つかりません" }, 404);
    }

    let orgId = teamObj.organizationId;
    if (!orgId) {
      orgId = crypto.randomUUID();
      await db.insert(organizations).values({
        id: orgId,
        name: teamObj.name,
        category: "other",
      });
      await db
        .update(teams)
        .set({ organizationId: orgId })
        .where(eq(teams.id, teamObj.id));
    }

    const cleanupOldLogoInR2 = async () => {
      const prevUrl = teamObj.logoImageUrl || "";
      if (c.env.BUCKET && prevUrl.startsWith("/api/images/teams/")) {
        const oldR2Key = prevUrl.slice("/api/images/".length);
        await c.env.BUCKET.delete(oldR2Key).catch(() => {});
      }
    };

    if (body.clear) {
      await cleanupOldLogoInR2();
      await db
        .update(organizations)
        .set({ logoImageUrl: null })
        .where(eq(organizations.id, orgId));

      return c.json({
        success: true,
        isDemo: false,
        teamId: teamObj.id,
        logoImageUrl: null,
      });
    }

    const rawBase64 = (body.imageBase64 || "").trim();
    if (!rawBase64) {
      return c.json({ success: false, error: "ロゴ画像データがありません" }, 400);
    }

    const cleanBase64 = rawBase64.includes(",")
      ? (rawBase64.split(",")[1] || "").trim()
      : rawBase64;
    const binaryStr = atob(cleanBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    if (bytes.byteLength === 0 || bytes.byteLength > 2_400_000) {
      return c.json(
        {
          success: false,
          error: "画像サイズが大きすぎます（2.4MB以下の画像をお選びください）",
        },
        400
      );
    }

    const rawMime = (body.mimeType || "image/png").toLowerCase();
    const safeMimeType =
      rawMime === "image/svg+xml"
        ? "image/svg+xml"
        : rawMime === "image/webp"
          ? "image/webp"
          : rawMime === "image/jpeg" || rawMime === "image/jpg"
            ? "image/jpeg"
            : "image/png";
    const ext =
      safeMimeType === "image/svg+xml"
        ? "svg"
        : safeMimeType === "image/webp"
          ? "webp"
          : safeMimeType === "image/jpeg"
            ? "jpg"
            : "png";

    let nextLogoUrl: string;
    if (c.env.BUCKET) {
      const safeOrgKey = orgId.replace(/[^a-zA-Z0-9_-]/g, "");
      const r2Key = `teams/logo-${safeOrgKey}-${Date.now()}.${ext}`;
      const arrayBuf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      await c.env.BUCKET.put(r2Key, arrayBuf, {
        httpMetadata: { contentType: safeMimeType },
      });
      await cleanupOldLogoInR2();
      nextLogoUrl = `/api/images/${r2Key}`;
    } else {
      nextLogoUrl = `data:${safeMimeType};base64,${cleanBase64}`;
    }

    await db
      .update(organizations)
      .set({ logoImageUrl: nextLogoUrl })
      .where(eq(organizations.id, orgId));

    return c.json({
      success: true,
      isDemo: false,
      teamId: teamObj.id,
      logoImageUrl: nextLogoUrl,
    });
  } catch (err: unknown) {
    console.error("Failed to upload team logo:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "チームロゴの保存に失敗しました",
      },
      500
    );
  }
});

/**
 * 🗑️ チームロゴ画像の削除API (DELETE /teams/:teamId/logo)
 */
app.delete("/teams/:teamId/logo", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = (c.req.param("teamId") || "").trim();

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        teamId: "demo-team",
        logoImageUrl: null,
      });
    }

    const teamObj = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
        logoImageUrl: organizations.logoImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!teamObj) {
      return c.json({ success: false, error: "対象のチームが見つかりません" }, 404);
    }

    if (c.env.BUCKET && teamObj.logoImageUrl?.startsWith("/api/images/teams/")) {
      const oldR2Key = teamObj.logoImageUrl.slice("/api/images/".length);
      await c.env.BUCKET.delete(oldR2Key).catch(() => {});
    }

    if (teamObj.organizationId) {
      await db
        .update(organizations)
        .set({ logoImageUrl: null })
        .where(eq(organizations.id, teamObj.organizationId));
    }

    return c.json({
      success: true,
      isDemo: false,
      teamId: teamObj.id,
      logoImageUrl: null,
    });
  } catch (err: unknown) {
    console.error("Failed to delete team logo:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "チームロゴの削除に失敗しました",
      },
      500
    );
  }
});

/**
 * 🏟️ チームヘッダー背景画像（カバー写真）のアップロード・更新API (POST /teams/:teamId/cover)
 * 指導者・管理者限定で `organizations.coverImageUrl` + R2 を安全に更新する
 */
app.post("/teams/:teamId/cover", async (c) => {
  await ensureAllSchemasOnce(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = (c.req.param("teamId") || "").trim();

  try {
    let file: File | null = null;
    let userId = c.req.query("userId") || "";
    let userName = c.req.query("userName") || "";
    let jsonImageBase64 = "";
    let jsonMimeType = "image/jpeg";
    let clearFlag = false;

    const contentType = (c.req.header("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const body = (await c.req.json()) as {
        imageBase64?: string;
        mimeType?: string;
        clear?: boolean;
        userId?: string;
        userName?: string;
      };
      jsonImageBase64 = (body.imageBase64 || "").trim();
      if (body.mimeType) jsonMimeType = body.mimeType.trim();
      if (body.clear) clearFlag = true;
      if (body.userId) userId = body.userId.trim();
      if (body.userName) userName = body.userName.trim();
    } else {
      try {
        const formData = await c.req.formData();
        const rawFile = formData.get("file");
        if (rawFile && typeof rawFile !== "string") {
          file = rawFile as File;
        }
        const rawUid = formData.get("userId");
        if (typeof rawUid === "string" && rawUid.trim()) {
          userId = rawUid.trim();
        }
        const rawUname = formData.get("userName");
        if (typeof rawUname === "string" && rawUname.trim()) {
          userName = rawUname.trim();
        }
      } catch {
        const body = await c.req.parseBody();
        const rawFile = body["file"];
        if (rawFile && typeof rawFile !== "string") {
          file = rawFile as File;
        }
      }
    }

    const bytesToDataUrl = (bytes: Uint8Array, mime: string): string => {
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const sub = bytes.subarray(i, i + chunkSize);
        for (let j = 0; j < sub.length; j++) {
          binary += String.fromCharCode(sub[j]);
        }
      }
      return `data:${mime};base64,${btoa(binary)}`;
    };

    if (!teamId || teamId === "demo-team") {
      if (clearFlag) {
        return c.json({
          success: true,
          isDemo: true,
          teamId: "demo-team",
          coverImageUrl: null,
        });
      }
      if (file) {
        const buf = await file.arrayBuffer();
        const mime = file.type || "image/jpeg";
        return c.json({
          success: true,
          isDemo: true,
          teamId: "demo-team",
          coverImageUrl: bytesToDataUrl(new Uint8Array(buf), mime),
        });
      }
      if (!jsonImageBase64) {
        return c.json({ success: false, error: "背景画像データがありません" }, 400);
      }
      const dataUrl = jsonImageBase64.startsWith("data:")
        ? jsonImageBase64
        : `data:${jsonMimeType};base64,${jsonImageBase64}`;
      return c.json({
        success: true,
        isDemo: true,
        teamId: "demo-team",
        coverImageUrl: dataUrl,
      });
    }

    const teamObj = await db
      .select({
        id: teams.id,
        name: teams.name,
        createdBy: teams.createdBy,
        organizationId: teams.organizationId,
        coverImageUrl: organizations.coverImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!teamObj) {
      return c.json({ success: false, error: "対象のチームが見つかりません" }, 404);
    }

    const canManage = await resolveCanManageTeamPlayers(c, db, {
      teamId,
      userId: userId || null,
      userName: userName || null,
      createdBy: teamObj.createdBy,
      organizationId: teamObj.organizationId,
    });
    if (!canManage) {
      return c.json(
        {
          success: false,
          error:
            "チームのヘッダー背景画像を変更する権限がありません（指導者・管理者のみ設定できます）",
        },
        403
      );
    }

    let orgId = teamObj.organizationId;
    if (!orgId) {
      orgId = crypto.randomUUID();
      await db.insert(organizations).values({
        id: orgId,
        name: teamObj.name,
        category: "other",
      });
      await db
        .update(teams)
        .set({ organizationId: orgId })
        .where(eq(teams.id, teamObj.id));
    }

    const cleanupOldCoverInR2 = async () => {
      const prevUrl = teamObj.coverImageUrl || "";
      if (c.env.BUCKET && prevUrl.startsWith("/api/images/teams/cover-")) {
        const oldR2Key = prevUrl.slice("/api/images/".length);
        await c.env.BUCKET.delete(oldR2Key).catch(() => {});
      }
    };

    if (clearFlag) {
      await cleanupOldCoverInR2();
      await db
        .update(organizations)
        .set({ coverImageUrl: null })
        .where(eq(organizations.id, orgId));

      return c.json({
        success: true,
        isDemo: false,
        teamId: teamObj.id,
        coverImageUrl: null,
      });
    }

    let bytes: Uint8Array;
    let rawMime = "image/jpeg";

    if (file) {
      const arrayBuf = await file.arrayBuffer();
      bytes = new Uint8Array(arrayBuf);
      rawMime = (file.type || "image/jpeg").toLowerCase();
    } else if (jsonImageBase64) {
      const cleanBase64 = jsonImageBase64.includes(",")
        ? (jsonImageBase64.split(",")[1] || "").trim()
        : jsonImageBase64;
      const binaryStr = atob(cleanBase64);
      bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      rawMime = jsonMimeType.toLowerCase();
    } else {
      return c.json({ success: false, error: "背景画像ファイルが選択されていません" }, 400);
    }

    if (bytes.byteLength === 0 || bytes.byteLength > 3_500_000) {
      return c.json(
        {
          success: false,
          error: "画像サイズが大きすぎます（3.5MB以下の画像をお選びください）",
        },
        400
      );
    }

    const safeMimeType =
      rawMime === "image/webp"
        ? "image/webp"
        : rawMime === "image/png"
          ? "image/png"
          : "image/jpeg";
    const ext =
      safeMimeType === "image/webp"
        ? "webp"
        : safeMimeType === "image/png"
          ? "png"
          : "jpg";

    let nextCoverUrl: string;
    if (c.env.BUCKET) {
      const safeOrgKey = orgId.replace(/[^a-zA-Z0-9_-]/g, "");
      const r2Key = `teams/cover-${safeOrgKey}-${Date.now()}.${ext}`;
      const arrayBuf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      await c.env.BUCKET.put(r2Key, arrayBuf, {
        httpMetadata: { contentType: safeMimeType },
      });
      await cleanupOldCoverInR2();
      nextCoverUrl = `/api/images/${r2Key}`;
    } else {
      nextCoverUrl = bytesToDataUrl(bytes, safeMimeType);
    }

    await db
      .update(organizations)
      .set({ coverImageUrl: nextCoverUrl })
      .where(eq(organizations.id, orgId));

    return c.json({
      success: true,
      isDemo: false,
      teamId: teamObj.id,
      coverImageUrl: nextCoverUrl,
    });
  } catch (err: unknown) {
    console.error("Failed to upload team cover image:", err);
    return c.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "チーム背景画像の保存に失敗しました",
      },
      500
    );
  }
});

/**
 * 🗑️ チームヘッダー背景画像（カバー写真）の削除API (DELETE /teams/:teamId/cover)
 */
app.delete("/teams/:teamId/cover", async (c) => {
  await ensureAllSchemasOnce(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = (c.req.param("teamId") || "").trim();
  const userId = c.req.query("userId") || null;
  const userName = c.req.query("userName") || null;

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        teamId: "demo-team",
        coverImageUrl: null,
      });
    }

    const teamObj = await db
      .select({
        id: teams.id,
        createdBy: teams.createdBy,
        organizationId: teams.organizationId,
        coverImageUrl: organizations.coverImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!teamObj) {
      return c.json({ success: false, error: "対象のチームが見つかりません" }, 404);
    }

    const canManage = await resolveCanManageTeamPlayers(c, db, {
      teamId,
      userId,
      userName,
      createdBy: teamObj.createdBy,
      organizationId: teamObj.organizationId,
    });
    if (!canManage) {
      return c.json(
        {
          success: false,
          error:
            "チームのヘッダー背景画像を削除する権限がありません（指導者・管理者のみ削除できます）",
        },
        403
      );
    }

    if (
      c.env.BUCKET &&
      teamObj.coverImageUrl?.startsWith("/api/images/teams/cover-")
    ) {
      const oldR2Key = teamObj.coverImageUrl.slice("/api/images/".length);
      await c.env.BUCKET.delete(oldR2Key).catch(() => {});
    }

    if (teamObj.organizationId) {
      await db
        .update(organizations)
        .set({ coverImageUrl: null })
        .where(eq(organizations.id, teamObj.organizationId));
    }

    return c.json({
      success: true,
      isDemo: false,
      teamId: teamObj.id,
      coverImageUrl: null,
    });
  } catch (err: unknown) {
    console.error("Failed to delete team cover image:", err);
    return c.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "チーム背景画像の削除に失敗しました",
      },
      500
    );
  }
});

export default app;
