// filepath: src/api/liff/news-generator.ts
import { Hono, type Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { toMatchCalendarKey } from "@/lib/liff/demo-lineup";
import {
  getTodayJstDateKey,
  resolveEffectivePlayerConditionOnDate,
} from "@/lib/liff/player-condition";
import { loadTeamPlayerConditionPeriodsMap } from "@/lib/player-roster-cleanup";
import {
  isAssigneeMatchingIdentity,
  parseMatchDayOpsJson,
  type LiffMyMatchIdentity,
} from "@/lib/liff/match-day-ops";
import {
  DEFAULT_PRACTICE_MATCH_LABEL,
  extractPracticeMatchLabelFromJson,
  extractScoreTeamNameModeFromJson,
} from "@/lib/liff/scorebook-symbol-rules";
import {
  sanitizeLiveReportDocument,
  type LegacyPlayLogRow,
} from "@/lib/liff/live-report-v2";
import { resolveCallerTeamAccess } from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";
import type {
  LiveReportMatchOption,
  LiveReportRosterPlayer,
  LiveReportV2Document,
} from "@/types/live-report-v2";
import type {
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

const liffNewsGeneratorRouter = new Hono<{ Bindings: WorkerEnv }>();

const {
  organizations,
  teams,
  teamMembers,
  user: usersTable,
  players,
  matches,
  tournaments,
  venues,
  matchLineups,
  atBats,
  playLogs,
  matchScorebookSnapshots,
  matchLiveReports,
} = schema;

const IGNORED_GENERIC_NAMES = new Set([
  "ゲスト",
  "ゲストユーザー",
  "メンバー",
  "LINEユーザー",
  "undefined",
  "null",
]);

function safeParseIntArray(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => (typeof n === "number" ? n : Number(n) || 0));
  } catch {
    return [];
  }
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function cleanReporterDisplayName(raw: string): string {
  return raw
    .replace(/\s*(さん|様|パパ|ママ|父|母)\s*$/g, "")
    .trim();
}

function sanitizeOwnerKey(raw: string | null | undefined): string {
  return (raw || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function normalizeSimpleName(raw: string | null | undefined): string {
  return (raw || "")
    .replace(/[\s　()（）【】［］\[\]]+/g, "")
    .replace(/(?:さん|様|コーチ|監督|代表)$/g, "")
    .trim();
}

function extractMatchLineLiveAssignees(matchDayOpsRaw: string | null | undefined): {
  rawAssignees: string[];
  displayAssignees: string[];
} {
  const ops = parseMatchDayOpsJson(matchDayOpsRaw);
  const lineLiveRole = (ops.staffRoles || []).find(
    (r) => r.roleKey === "line_live" || r.roleLabel.includes("速報")
  );
  const rawAssignees = (lineLiveRole?.assignees || [])
    .map((s) => s.trim())
    .filter(Boolean);
  const displayAssignees = rawAssignees
    .map(cleanReporterDisplayName)
    .filter(Boolean);
  return { rawAssignees, displayAssignees };
}

interface CallerReporterContext {
  identity: LiffMyMatchIdentity;
  canManageOrScore: boolean;
}

async function resolveCallerReporterContext(
  c: Context<{ Bindings: WorkerEnv }>,
  db: ReturnType<typeof drizzle>,
  teamId: string
): Promise<CallerReporterContext> {
  const access = await resolveCallerTeamAccess(c);
  const canManageOrScore =
    access.canManageTeamId(teamId) || access.canEditScoreForTeam(teamId);

  const [teamMemberRows, dbUserRows] = await Promise.all([
    db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        name: teamMembers.name,
        status: teamMembers.status,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .all()
      .catch(() => []),
    access.candidateUserIds.length > 0
      ? db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, access.candidateUserIds))
          .all()
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const activeMembers = teamMemberRows.filter(
    (m) =>
      (m.status || "active").toLowerCase() === "active" &&
      (m.role || "").toLowerCase() !== "pending"
  );

  const candidateIdSet = new Set(access.candidateUserIds);
  let matchedMember =
    activeMembers.find((m) => Boolean(m.userId && candidateIdSet.has(m.userId))) ||
    null;

  const grant = access.teamRoles.get(teamId);
  if (!matchedMember && grant?.memberId) {
    matchedMember = activeMembers.find((m) => m.id === grant.memberId) || null;
  }

  const nameCandidates = [
    access.headerUserName,
    access.sessionUser?.name || "",
    ...dbUserRows.map((u) => u.name || ""),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !IGNORED_GENERIC_NAMES.has(s));

  if (!matchedMember && nameCandidates.length > 0) {
    for (const cand of nameCandidates) {
      const normCand = normalizeSimpleName(cand);
      if (normCand.length < 2) continue;
      const exact = activeMembers.find(
        (m) => normalizeSimpleName(m.name) === normCand
      );
      if (exact) {
        matchedMember = exact;
        break;
      }
    }
  }

  const displayName =
    nameCandidates[0] || matchedMember?.name?.trim() || null;

  return {
    identity: {
      memberId: matchedMember?.id || null,
      memberName: matchedMember?.name?.trim() || null,
      displayName,
      childNames: [],
    },
    canManageOrScore,
  };
}

function isCallerAssignedToLineLive(
  rawAssignees: ReadonlyArray<string>,
  identity: LiffMyMatchIdentity
): boolean {
  if (rawAssignees.length === 0) return false;
  return rawAssignees.some((person) =>
    isAssigneeMatchingIdentity(person, identity)
  );
}

export interface ServerMatchBundlePayload {
  matchId: string;
  lineup: Array<{
    order: number;
    position: string;
    playerId: string | null;
    playerName: string;
  }>;
  scorebookSnapshot: {
    topStructure: ScorebookSheetStructure | null;
    bottomStructure: ScorebookSheetStructure | null;
    topAtBats: ScorebookV2AtBat[];
    bottomAtBats: ScorebookV2AtBat[];
  } | null;
  playLogs: LegacyPlayLogRow[];
  cloudDraft: {
    draftId: string;
    report: LiveReportV2Document;
    editorOwnerKey: string | null;
    updatedByName: string | null;
    updatedAt: number;
  } | null;
}

async function loadMatchBundleFromDb(
  db: ReturnType<typeof drizzle>,
  teamId: string,
  matchId: string
): Promise<ServerMatchBundlePayload | null> {
  const matchRow = await db
    .select({
      id: matches.id,
      teamId: matches.teamId,
      myLineup: matches.myLineup,
    })
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)))
    .get();

  if (!matchRow) return null;

  const draftId = `match:${matchId}`;

  const [lineupRows, snapRow, logRows, draftRow] = await Promise.all([
    db
      .select({
        battingOrder: matchLineups.battingOrder,
        position: matchLineups.position,
        isStarting: matchLineups.isStarting,
        playerId: matchLineups.playerId,
        playerName: players.name,
      })
      .from(matchLineups)
      .leftJoin(players, eq(matchLineups.playerId, players.id))
      .where(eq(matchLineups.matchId, matchId))
      .orderBy(asc(matchLineups.battingOrder))
      .all()
      .catch(() => []),
    db
      .select()
      .from(matchScorebookSnapshots)
      .where(eq(matchScorebookSnapshots.matchId, matchId))
      .get()
      .catch(() => undefined),
    db
      .select({
        id: playLogs.id,
        inningText: playLogs.inningText,
        resultType: playLogs.resultType,
        description: playLogs.description,
      })
      .from(playLogs)
      .where(eq(playLogs.matchId, matchId))
      .orderBy(asc(playLogs.createdAt))
      .all()
      .catch(() => []),
    db
      .select()
      .from(matchLiveReports)
      .where(
        and(
          eq(matchLiveReports.id, draftId),
          eq(matchLiveReports.teamId, teamId)
        )
      )
      .get()
      .catch(() => undefined),
  ]);

  const starters = lineupRows.filter((r) => r.isStarting !== false);
  let resolvedLineup: ServerMatchBundlePayload["lineup"] = [];

  if (starters.length > 0) {
    resolvedLineup = starters.map((r) => ({
      order: r.battingOrder,
      position: r.position || "打",
      playerId: r.playerId || null,
      playerName: r.playerName || "",
    }));
  } else if (matchRow.myLineup) {
    const parsedJson = safeParseJson<Array<Record<string, unknown>>>(
      matchRow.myLineup,
      []
    );
    if (Array.isArray(parsedJson) && parsedJson.length > 0) {
      resolvedLineup = parsedJson.map((item, idx) => ({
        order:
          typeof item.battingOrder === "number" ? item.battingOrder : idx + 1,
        position: typeof item.position === "string" ? item.position : "打",
        playerId: typeof item.playerId === "string" ? item.playerId : null,
        playerName:
          typeof item.name === "string"
            ? item.name
            : typeof item.playerName === "string"
            ? item.playerName
            : "",
      }));
    }
  }

  let scorebookSnapshot: ServerMatchBundlePayload["scorebookSnapshot"] = null;
  if (snapRow) {
    const topStructure = safeParseJson<ScorebookSheetStructure | null>(
      snapRow.topStructureJson,
      null
    );
    const bottomStructure = safeParseJson<ScorebookSheetStructure | null>(
      snapRow.bottomStructureJson,
      null
    );
    const topAtBats = safeParseJson<ScorebookV2AtBat[]>(
      snapRow.topAtBatsJson,
      []
    );
    const bottomAtBats = safeParseJson<ScorebookV2AtBat[]>(
      snapRow.bottomAtBatsJson,
      []
    );
    if (topStructure || bottomStructure) {
      scorebookSnapshot = {
        topStructure,
        bottomStructure,
        topAtBats: Array.isArray(topAtBats) ? topAtBats : [],
        bottomAtBats: Array.isArray(bottomAtBats) ? bottomAtBats : [],
      };
    }
  }

  let cloudDraft: ServerMatchBundlePayload["cloudDraft"] = null;
  if (draftRow && draftRow.reportJson) {
    const parsedDoc = sanitizeLiveReportDocument(
      safeParseJson<unknown>(draftRow.reportJson, null)
    );
    if (parsedDoc) {
      cloudDraft = {
        draftId: draftRow.id,
        report: parsedDoc,
        editorOwnerKey: draftRow.editorOwnerKey ?? null,
        updatedByName: draftRow.updatedByName ?? null,
        updatedAt: draftRow.updatedAt,
      };
    }
  }

  return {
    matchId,
    lineup: resolvedLineup,
    scorebookSnapshot,
    playLogs: logRows,
    cloudDraft,
  };
}

// 1. 初期コンテキスト一括取得（チーム設定・試合リスト・担当者照合・現役選手名簿・選択中試合データ）
liffNewsGeneratorRouter.get("/context", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const matchId = (c.req.query("matchId") || "").trim();
    const safeOwnerKey = sanitizeOwnerKey(c.req.query("ownerKey"));

    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        team: {
          id: "demo-team",
          orgName: "iScore ドリームス",
          teamName: "体験デモチーム",
          scoreTeamNameMode: "organization",
          practiceMatchLabel: DEFAULT_PRACTICE_MATCH_LABEL,
        },
        callerReporter: {
          memberName: null,
          displayName: null,
          canManageOrScore: true,
        },
        matches: [],
        players: [],
        matchBundle: null,
        freeCloudDraft: null,
        personalFreeDrafts: [],
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const [
      callerCtx,
      teamRow,
      rawMatchRows,
      rawPlayerRows,
      teamDraftRows,
    ] = await Promise.all([
      resolveCallerReporterContext(c, db, teamId),
      db
        .select({
          id: teams.id,
          teamName: teams.name,
          orgName: organizations.name,
          scorebookSymbolRules: teams.scorebookSymbolRules,
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
          status: matches.status,
          battingOrder: matches.battingOrder,
          innings: matches.innings,
          myScore: matches.myScore,
          opponentScore: matches.opponentScore,
          myInningScores: matches.myInningScores,
          opponentInningScores: matches.opponentInningScores,
          myLineup: matches.myLineup,
          matchDayOps: matches.matchDayOps,
          tournamentName: tournaments.name,
          venueName: venues.name,
          venueShortName: venues.shortName,
          surfaceDetails: matches.surfaceDetails,
        })
        .from(matches)
        .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
        .leftJoin(venues, eq(matches.venueId, venues.id))
        .where(eq(matches.teamId, teamId))
        .orderBy(desc(matches.date))
        .limit(80)
        .all(),
      db
        .select({
          id: players.id,
          name: players.name,
          uniformNumber: players.uniformNumber,
          mainPosition: players.primaryPosition,
          isActive: players.isActive,
          conditionStatus: players.conditionStatus,
        })
        .from(players)
        .where(eq(players.teamId, teamId))
        .all(),
      db
        .select({
          id: matchLiveReports.id,
          matchId: matchLiveReports.matchId,
          reportJson: matchLiveReports.reportJson,
          editorOwnerKey: matchLiveReports.editorOwnerKey,
          updatedByName: matchLiveReports.updatedByName,
          updatedAt: matchLiveReports.updatedAt,
        })
        .from(matchLiveReports)
        .where(eq(matchLiveReports.teamId, teamId))
        .all()
        .catch(() => []),
    ]);

    const matchIds = rawMatchRows.map((m) => m.id);
    const snapMatchIdSet = new Set<string>();
    const lineupMatchIdSet = new Set<string>();

    if (matchIds.length > 0) {
      const [snapRows, lineupDistinctRows, atBatDistinctRows] =
        await Promise.all([
          db
            .select({ matchId: matchScorebookSnapshots.matchId })
            .from(matchScorebookSnapshots)
            .where(inArray(matchScorebookSnapshots.matchId, matchIds))
            .all()
            .catch(() => []),
          db
            .selectDistinct({ matchId: matchLineups.matchId })
            .from(matchLineups)
            .where(inArray(matchLineups.matchId, matchIds))
            .all()
            .catch(() => []),
          db
            .selectDistinct({ matchId: atBats.matchId })
            .from(atBats)
            .where(inArray(atBats.matchId, matchIds))
            .all()
            .catch(() => []),
        ]);

      for (const s of snapRows) snapMatchIdSet.add(s.matchId);
      for (const a of atBatDistinctRows) snapMatchIdSet.add(a.matchId);
      for (const l of lineupDistinctRows) lineupMatchIdSet.add(l.matchId);
    }

    const matchDraftMetaByMatchId = new Map<
      string,
      {
        editorOwnerKey: string | null;
        updatedByName: string | null;
        updatedAt: number;
      }
    >();
    const personalFreePrefix = safeOwnerKey
      ? `free:${teamId}:u:${safeOwnerKey}:`
      : "";
    const personalFreeDrafts: Array<{
      draftId: string;
      freeId: string;
      report: LiveReportV2Document;
      updatedByName: string | null;
      updatedAt: number;
    }> = [];

    for (const dr of teamDraftRows) {
      if (dr.matchId && dr.id === `match:${dr.matchId}`) {
        matchDraftMetaByMatchId.set(dr.matchId, {
          editorOwnerKey: dr.editorOwnerKey ?? null,
          updatedByName: dr.updatedByName ?? null,
          updatedAt: dr.updatedAt,
        });
      }
      if (
        personalFreePrefix &&
        dr.id.startsWith(personalFreePrefix) &&
        dr.reportJson
      ) {
        const freeId = dr.id.slice(personalFreePrefix.length);
        const parsed = sanitizeLiveReportDocument(
          safeParseJson<unknown>(dr.reportJson, null)
        );
        if (freeId && parsed) {
          personalFreeDrafts.push({
            draftId: dr.id,
            freeId,
            report: parsed,
            updatedByName: dr.updatedByName ?? null,
            updatedAt: dr.updatedAt,
          });
        }
      }
    }
    personalFreeDrafts.sort((a, b) => b.updatedAt - a.updatedAt);

    const formattedMatches: Array<
      LiveReportMatchOption & { hasCloudDraft: boolean }
    > = rawMatchRows.map((m) => {
      const { rawAssignees, displayAssignees } = extractMatchLineLiveAssignees(
        m.matchDayOps
      );
      const isMyLineLiveAssigned = isCallerAssignedToLineLive(
        rawAssignees,
        callerCtx.identity
      );
      const draftMeta = matchDraftMetaByMatchId.get(m.id) || null;

      const hasJsonLineup =
        Boolean(m.myLineup) &&
        m.myLineup !== "[]" &&
        safeParseJson<unknown[]>(m.myLineup, []).length > 0;

      const baseVenue = m.venueShortName || m.venueName || null;
      const fullVenue =
        baseVenue && m.surfaceDetails
          ? `${baseVenue} (${m.surfaceDetails})`
          : baseVenue || m.surfaceDetails || null;

      return {
        id: m.id,
        date: m.date,
        opponent: m.opponent,
        matchType: m.matchType,
        status: m.status,
        battingOrder: m.battingOrder === "second" ? "second" : "first",
        innings: m.innings || 7,
        myScore: m.myScore || 0,
        opponentScore: m.opponentScore || 0,
        myInningScores: safeParseIntArray(m.myInningScores),
        opponentInningScores: safeParseIntArray(m.opponentInningScores),
        tournamentName: m.tournamentName || null,
        venueName: fullVenue,
        venueShortName: m.venueShortName || m.venueName || null,
        hasScorebook: snapMatchIdSet.has(m.id),
        hasLineup: lineupMatchIdSet.has(m.id) || hasJsonLineup,
        lineLiveAssignees: displayAssignees,
        isMyLineLiveAssigned,
        editorOwnerKey: draftMeta?.editorOwnerKey ?? null,
        editorName: draftMeta?.updatedByName ?? null,
        editorUpdatedAt: draftMeta?.updatedAt ?? null,
        hasCloudDraft: Boolean(draftMeta),
      };
    });

    // 進行中(live) ➔ 予定(scheduled: 直近順) ➔ 終了(finished: 新しい順) で現場で選びやすい順に整列
    formattedMatches.sort((a, b) => {
      const rank = (st: string) =>
        st === "live" ? 0 : st === "scheduled" ? 1 : st === "finished" ? 2 : 3;
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      if (a.status === "scheduled" && b.status === "scheduled") {
        return a.date.localeCompare(b.date);
      }
      return b.date.localeCompare(a.date);
    });

    const periodsByPlayerId = await loadTeamPlayerConditionPeriodsMap(
      c.env.DB,
      teamId
    );
    const todayKey = getTodayJstDateKey();
    const targetMatchOption = matchId
      ? formattedMatches.find((m) => m.id === matchId)
      : formattedMatches[0];
    const targetMatchDateKey =
      toMatchCalendarKey(targetMatchOption?.date) || todayKey;

    const activePlayers: LiveReportRosterPlayer[] = rawPlayerRows
      .filter((p) => {
        if (p.isActive === false) return false;
        const eff = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: periodsByPlayerId.get(p.id) || [],
          fallbackStatus: p.conditionStatus,
          dateKey: targetMatchDateKey,
          todayKey,
        });
        return eff.status !== "on_leave";
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        uniformNumber: p.uniformNumber || "",
        mainPosition: p.mainPosition || null,
      }))
      .sort((a, b) => {
        const na = parseInt(a.uniformNumber, 10);
        const nb = parseInt(b.uniformNumber, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.uniformNumber.localeCompare(b.uniformNumber);
      });

    const matchBundle = matchId
      ? await loadMatchBundleFromDb(db, teamId, matchId)
      : null;

    const scoreTeamNameMode = extractScoreTeamNameModeFromJson(
      teamRow?.scorebookSymbolRules
    );
    const practiceMatchLabel = extractPracticeMatchLabelFromJson(
      teamRow?.scorebookSymbolRules
    );

    return c.json({
      success: true,
      isDemo: false,
      team: {
        id: teamId,
        orgName: teamRow?.orgName || "",
        teamName: teamRow?.teamName || "",
        scoreTeamNameMode,
        practiceMatchLabel,
      },
      callerReporter: {
        memberName: callerCtx.identity.memberName,
        displayName: callerCtx.identity.displayName,
        canManageOrScore: callerCtx.canManageOrScore,
      },
      matches: formattedMatches,
      players: activePlayers,
      matchBundle,
      freeCloudDraft: null,
      personalFreeDrafts,
    });
  } catch (error) {
    console.error("[GET /api/liff/news-generator/context] Error:", error);
    return c.json(
      { success: false, error: "速報データの初期取得に失敗しました" },
      500
    );
  }
});

// 2. 試合切り替え時の個別バンドル取得
liffNewsGeneratorRouter.get("/match-bundle", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const matchId = (c.req.query("matchId") || "").trim();
    if (!teamId || !matchId || teamId === "demo-team") {
      return c.json({ success: true, matchBundle: null });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);
    const matchBundle = await loadMatchBundleFromDb(db, teamId, matchId);

    return c.json({ success: true, matchBundle });
  } catch (error) {
    console.error("[GET /api/liff/news-generator/match-bundle] Error:", error);
    return c.json(
      { success: false, error: "試合詳細データの取得に失敗しました" },
      500
    );
  }
});

// 3. クラウド下書き単体取得（閲覧モードのリアルタイム参照・担当者引き継ぎ検知ポーリング用）
liffNewsGeneratorRouter.get("/draft", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const draftId = (c.req.query("draftId") || "").trim();
    const sinceUpdatedAtRaw = Number(c.req.query("sinceUpdatedAt") || "0");
    const sinceUpdatedAt =
      Number.isFinite(sinceUpdatedAtRaw) && sinceUpdatedAtRaw > 0
        ? sinceUpdatedAtRaw
        : 0;

    if (!teamId || !draftId || teamId === "demo-team") {
      return c.json({ success: true, cloudDraft: null });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    // 軽量バージョンチェック（未変更時は reportJson を読み込まず即座に返却）
    if (sinceUpdatedAt > 0) {
      const metaRow = await db
        .select({
          id: matchLiveReports.id,
          editorOwnerKey: matchLiveReports.editorOwnerKey,
          updatedByName: matchLiveReports.updatedByName,
          updatedAt: matchLiveReports.updatedAt,
        })
        .from(matchLiveReports)
        .where(
          and(
            eq(matchLiveReports.id, draftId),
            eq(matchLiveReports.teamId, teamId)
          )
        )
        .get();

      if (!metaRow) {
        return c.json({ success: true, cloudDraft: null });
      }

      if (metaRow.updatedAt <= sinceUpdatedAt) {
        return c.json({
          success: true,
          unchanged: true,
          editorOwnerKey: metaRow.editorOwnerKey ?? null,
          updatedAt: metaRow.updatedAt,
          updatedByName: metaRow.updatedByName ?? null,
        });
      }
    }

    const row = await db
      .select()
      .from(matchLiveReports)
      .where(
        and(
          eq(matchLiveReports.id, draftId),
          eq(matchLiveReports.teamId, teamId)
        )
      )
      .get();

    if (!row || !row.reportJson) {
      return c.json({ success: true, cloudDraft: null });
    }

    const parsed = sanitizeLiveReportDocument(
      safeParseJson<unknown>(row.reportJson, null)
    );
    if (!parsed) {
      return c.json({ success: true, cloudDraft: null });
    }

    return c.json({
      success: true,
      unchanged: false,
      cloudDraft: {
        draftId: row.id,
        report: parsed,
        editorOwnerKey: row.editorOwnerKey ?? null,
        updatedByName: row.updatedByName ?? null,
        updatedAt: row.updatedAt,
      },
    });
  } catch (error) {
    console.error("[GET /api/liff/news-generator/draft] Error:", error);
    return c.json(
      { success: false, error: "クラウド下書きの取得に失敗しました" },
      500
    );
  }
});

// 3B. 入力担当ロックの明示的な取得・引き継ぎ・解放（共同編集廃止・1名排他制御）
interface EditorLockRequestBody {
  teamId?: string;
  matchId?: string;
  ownerKey?: string;
  editorName?: string | null;
  action?: "claim" | "release";
  takeover?: boolean;
}

liffNewsGeneratorRouter.post("/editor-lock", async (c) => {
  try {
    const body = (await c.req.json()) as EditorLockRequestBody;
    const teamId = (body.teamId || "").trim();
    const matchId = (body.matchId || "").trim();
    const safeOwnerKey = sanitizeOwnerKey(body.ownerKey);
    const action = body.action === "release" ? "release" : "claim";

    if (!teamId || !matchId || !safeOwnerKey) {
      return c.json(
        { success: false, error: "teamId, matchId, ownerKey が必要です" },
        400
      );
    }

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        editorOwnerKey: action === "release" ? null : safeOwnerKey,
        updatedByName: body.editorName || null,
        updatedAt: Date.now(),
        cloudDraft: null,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);
    const draftId = `match:${matchId}`;

    const [callerCtx, matchRow, existingRow] = await Promise.all([
      resolveCallerReporterContext(c, db, teamId),
      db
        .select({ id: matches.id, matchDayOps: matches.matchDayOps })
        .from(matches)
        .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)))
        .get(),
      db
        .select()
        .from(matchLiveReports)
        .where(
          and(
            eq(matchLiveReports.id, draftId),
            eq(matchLiveReports.teamId, teamId)
          )
        )
        .get(),
    ]);

    if (!matchRow) {
      return c.json({ success: false, error: "対象の試合が見つかりません" }, 404);
    }

    if (action === "release") {
      if (
        existingRow &&
        (!existingRow.editorOwnerKey ||
          existingRow.editorOwnerKey === safeOwnerKey ||
          callerCtx.canManageOrScore)
      ) {
        const nextTs = Math.max(Date.now(), existingRow.updatedAt + 1);
        await db
          .update(matchLiveReports)
          .set({
            editorOwnerKey: null,
            updatedAt: nextTs,
          })
          .where(
            and(
              eq(matchLiveReports.id, draftId),
              eq(matchLiveReports.teamId, teamId)
            )
          );
        return c.json({
          success: true,
          editorOwnerKey: null,
          updatedAt: nextTs,
        });
      }
      return c.json({ success: true, editorOwnerKey: existingRow?.editorOwnerKey ?? null });
    }

    // action === "claim"
    const { rawAssignees } = extractMatchLineLiveAssignees(matchRow.matchDayOps);
    const isAssigned = isCallerAssignedToLineLive(
      rawAssignees,
      callerCtx.identity
    );

    if (
      existingRow?.editorOwnerKey &&
      existingRow.editorOwnerKey !== safeOwnerKey &&
      !body.takeover
    ) {
      return c.json(
        {
          success: false,
          conflict: true,
          editorOwnerKey: existingRow.editorOwnerKey,
          updatedByName: existingRow.updatedByName ?? null,
          updatedAt: existingRow.updatedAt,
          error: `${existingRow.updatedByName || "他の担当者"}さんが現在入力中です`,
        },
        409
      );
    }

    if (
      rawAssignees.length > 0 &&
      !isAssigned &&
      !callerCtx.canManageOrScore &&
      !body.takeover
    ) {
      return c.json(
        {
          success: false,
          forbiddenViewerOnly: true,
          error:
            "この試合はLINE速報担当が設定されているため、担当以外は閲覧モードとなります",
        },
        403
      );
    }

    const cleanEditorName =
      (body.editorName || "").trim() ||
      callerCtx.identity.memberName ||
      callerCtx.identity.displayName ||
      existingRow?.updatedByName ||
      null;

    if (existingRow && existingRow.reportJson) {
      const nextTs = Math.max(Date.now(), existingRow.updatedAt + 1);
      await db
        .update(matchLiveReports)
        .set({
          editorOwnerKey: safeOwnerKey,
          updatedByName: cleanEditorName,
          updatedAt: nextTs,
        })
        .where(
          and(
            eq(matchLiveReports.id, draftId),
            eq(matchLiveReports.teamId, teamId)
          )
        );

      const parsedDoc = sanitizeLiveReportDocument(
        safeParseJson<unknown>(existingRow.reportJson, null)
      );

      return c.json({
        success: true,
        editorOwnerKey: safeOwnerKey,
        updatedByName: cleanEditorName,
        updatedAt: nextTs,
        cloudDraft: parsedDoc
          ? {
              draftId: existingRow.id,
              report: parsedDoc,
              editorOwnerKey: safeOwnerKey,
              updatedByName: cleanEditorName,
              updatedAt: nextTs,
            }
          : null,
      });
    }

    return c.json({
      success: true,
      editorOwnerKey: safeOwnerKey,
      updatedByName: cleanEditorName,
      updatedAt: Date.now(),
      cloudDraft: null,
    });
  } catch (error) {
    console.error("[POST /api/liff/news-generator/editor-lock] Error:", error);
    return c.json(
      { success: false, error: "入力担当状態の更新に失敗しました" },
      500
    );
  }
});

// 4. クラウド下書き保存（共同編集マージを完全廃止し、単一担当者排他保存へ移行）
interface SaveDraftRequestBody {
  teamId?: string;
  draftId?: string;
  matchId?: string | null;
  ownerKey?: string;
  takeoverEditor?: boolean;
  report?: unknown;
  updatedByName?: string | null;
}

liffNewsGeneratorRouter.put("/draft", async (c) => {
  try {
    const body = (await c.req.json()) as SaveDraftRequestBody;
    const teamId = (body.teamId || "").trim();
    const draftId = (body.draftId || "").trim();
    const safeOwnerKey = sanitizeOwnerKey(body.ownerKey);

    if (!teamId || !draftId) {
      return c.json({ success: false, error: "teamId と draftId が必要です" }, 400);
    }
    if (teamId === "demo-team") {
      return c.json({
        success: true,
        merged: false,
        editorOwnerKey: safeOwnerKey || null,
        updatedAt: Date.now(),
        updatedByName: body.updatedByName || null,
      });
    }

    const sanitized = sanitizeLiveReportDocument(body.report);
    if (!sanitized) {
      return c.json({ success: false, error: "不正な速報データ形式です" }, 400);
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const isPersonalFreeDraft = draftId.startsWith("free:");
    const existingRow = await db
      .select()
      .from(matchLiveReports)
      .where(
        and(
          eq(matchLiveReports.id, draftId),
          eq(matchLiveReports.teamId, teamId)
        )
      )
      .get();

    const matchIdVal =
      !isPersonalFreeDraft && body.matchId && body.matchId.trim().length > 0
        ? body.matchId.trim()
        : draftId.startsWith("match:")
        ? draftId.slice("match:".length).trim()
        : null;

    if (!isPersonalFreeDraft) {
      if (!safeOwnerKey) {
        return c.json(
          { success: false, error: "入力担当キー(ownerKey)が必要です" },
          400
        );
      }

      // 他の担当者がロック保持中の場合は上書き・マージせず 409 で厳格遮断
      if (
        existingRow?.editorOwnerKey &&
        existingRow.editorOwnerKey !== safeOwnerKey &&
        !body.takeoverEditor
      ) {
        const remoteDoc = sanitizeLiveReportDocument(
          safeParseJson<unknown>(existingRow.reportJson, null)
        );
        return c.json(
          {
            success: false,
            conflict: true,
            editorOwnerKey: existingRow.editorOwnerKey,
            updatedByName: existingRow.updatedByName ?? null,
            updatedAt: existingRow.updatedAt,
            report: remoteDoc,
            error: `${
              existingRow.updatedByName || "他の担当者"
            }さんが入力担当のため、上書きを防止しました`,
          },
          409
        );
      }

      // 初回ロック取得時、試合にLINE速報担当が登録されていれば担当者・管理者か検証（明示引継時を除く）
      if (
        matchIdVal &&
        !existingRow?.editorOwnerKey &&
        !body.takeoverEditor
      ) {
        const [callerCtx, matchRow] = await Promise.all([
          resolveCallerReporterContext(c, db, teamId),
          db
            .select({ matchDayOps: matches.matchDayOps })
            .from(matches)
            .where(and(eq(matches.id, matchIdVal), eq(matches.teamId, teamId)))
            .get(),
        ]);
        if (matchRow) {
          const { rawAssignees } = extractMatchLineLiveAssignees(
            matchRow.matchDayOps
          );
          const isAssigned = isCallerAssignedToLineLive(
            rawAssignees,
            callerCtx.identity
          );
          if (
            rawAssignees.length > 0 &&
            !isAssigned &&
            !callerCtx.canManageOrScore
          ) {
            return c.json(
              {
                success: false,
                forbiddenViewerOnly: true,
                error: "担当以外のメンバーは閲覧モード（参照専用）となります",
              },
              403
            );
          }
        }
      }
    }

    const now = existingRow
      ? Math.max(Date.now(), existingRow.updatedAt + 1)
      : Date.now();
    const updatedBy =
      body.updatedByName && body.updatedByName.trim().length > 0
        ? body.updatedByName.trim()
        : existingRow?.updatedByName ?? null;
    const nextEditorOwnerKey = isPersonalFreeDraft
      ? safeOwnerKey || null
      : safeOwnerKey;
    const reportJsonStr = JSON.stringify(sanitized);

    await db
      .insert(matchLiveReports)
      .values({
        id: draftId,
        teamId,
        matchId: isPersonalFreeDraft ? null : matchIdVal,
        reportJson: reportJsonStr,
        editorOwnerKey: nextEditorOwnerKey,
        updatedByName: updatedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: matchLiveReports.id,
        set: {
          teamId,
          matchId: isPersonalFreeDraft ? null : matchIdVal,
          reportJson: reportJsonStr,
          editorOwnerKey: nextEditorOwnerKey,
          updatedByName: updatedBy,
          updatedAt: now,
        },
      });

    return c.json({
      success: true,
      merged: false,
      report: sanitized,
      editorOwnerKey: nextEditorOwnerKey,
      updatedAt: now,
      updatedByName: updatedBy,
    });
  } catch (error) {
    console.error("[PUT /api/liff/news-generator/draft] Error:", error);
    return c.json(
      { success: false, error: "クラウド下書きの保存に失敗しました" },
      500
    );
  }
});

// 5. クラウド下書き削除（リセット用 — 試合連動時は入力担当本人または管理者のみ許可）
liffNewsGeneratorRouter.delete("/draft", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const draftId = (c.req.query("draftId") || "").trim();
    const safeOwnerKey = sanitizeOwnerKey(c.req.query("ownerKey"));
    if (!teamId || !draftId || teamId === "demo-team") {
      return c.json({ success: true });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    if (!draftId.startsWith("free:")) {
      const [callerCtx, existingRow] = await Promise.all([
        resolveCallerReporterContext(c, db, teamId),
        db
          .select({
            id: matchLiveReports.id,
            editorOwnerKey: matchLiveReports.editorOwnerKey,
            updatedByName: matchLiveReports.updatedByName,
          })
          .from(matchLiveReports)
          .where(
            and(
              eq(matchLiveReports.id, draftId),
              eq(matchLiveReports.teamId, teamId)
            )
          )
          .get(),
      ]);

      if (
        existingRow?.editorOwnerKey &&
        existingRow.editorOwnerKey !== safeOwnerKey &&
        !callerCtx.canManageOrScore
      ) {
        return c.json(
          {
            success: false,
            conflict: true,
            error: `${
              existingRow.updatedByName || "他の担当者"
            }さんが入力中のため初期化できません`,
          },
          409
        );
      }
    }

    await db
      .delete(matchLiveReports)
      .where(
        and(
          eq(matchLiveReports.id, draftId),
          eq(matchLiveReports.teamId, teamId)
        )
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/liff/news-generator/draft] Error:", error);
    return c.json(
      { success: false, error: "クラウド下書きの削除に失敗しました" },
      500
    );
  }
});

export default liffNewsGeneratorRouter;
