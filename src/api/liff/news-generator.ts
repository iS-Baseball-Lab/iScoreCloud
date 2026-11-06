// filepath: src/api/liff/news-generator.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { normalizePlayerConditionStatus } from "@/lib/liff/player-condition";
import { parseMatchDayOpsJson } from "@/lib/liff/match-day-ops";
import {
  DEFAULT_PRACTICE_MATCH_LABEL,
  extractPracticeMatchLabelFromJson,
  extractScoreTeamNameModeFromJson,
} from "@/lib/liff/scorebook-symbol-rules";
import {
  mergeLiveReportDocuments,
  sanitizeLiveReportDocument,
  type LegacyPlayLogRow,
} from "@/lib/liff/live-report-v2";
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

// 1. 初期コンテキスト一括取得（チーム設定・試合リスト・現役選手名簿・選択中試合データ）
liffNewsGeneratorRouter.get("/context", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const matchId = (c.req.query("matchId") || "").trim();

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
        matches: [],
        players: [],
        matchBundle: null,
        freeCloudDraft: null,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const [teamRow, rawMatchRows, rawPlayerRows, teamDraftRows] =
      await Promise.all([
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

    const draftMatchIdSet = new Set<string>();
    let freeCloudDraft: {
      draftId: string;
      report: LiveReportV2Document;
      updatedByName: string | null;
      updatedAt: number;
    } | null = null;

    const freeDraftId = `team:${teamId}:free`;
    for (const dr of teamDraftRows) {
      if (dr.matchId) draftMatchIdSet.add(dr.matchId);
      if (dr.id === freeDraftId && dr.reportJson) {
        const parsed = sanitizeLiveReportDocument(
          safeParseJson<unknown>(dr.reportJson, null)
        );
        if (parsed) {
          freeCloudDraft = {
            draftId: dr.id,
            report: parsed,
            updatedByName: dr.updatedByName ?? null,
            updatedAt: dr.updatedAt,
          };
        }
      }
    }

    const formattedMatches: Array<
      LiveReportMatchOption & { hasCloudDraft: boolean }
    > = rawMatchRows.map((m) => {
      const ops = parseMatchDayOpsJson(m.matchDayOps);
      const lineLiveRole = (ops.staffRoles || []).find(
        (r) => r.roleKey === "line_live" || r.roleLabel.includes("速報")
      );
      const lineLiveAssignees = (lineLiveRole?.assignees || [])
        .map(cleanReporterDisplayName)
        .filter(Boolean);

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
        lineLiveAssignees,
        hasCloudDraft: draftMatchIdSet.has(m.id),
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

    const activePlayers: LiveReportRosterPlayer[] = rawPlayerRows
      .filter((p) => {
        if (p.isActive === false) return false;
        const cond = normalizePlayerConditionStatus(p.conditionStatus);
        return cond !== "on_leave";
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
      matches: formattedMatches,
      players: activePlayers,
      matchBundle,
      freeCloudDraft,
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

// 3. クラウド下書き単体取得（担当者引き継ぎ・バックグラウンド共同編集ポーリング用）
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

// 4. クラウド下書き保存（3-Way自動マージ付き共同編集保存）
interface SaveDraftRequestBody {
  teamId?: string;
  draftId?: string;
  matchId?: string | null;
  report?: unknown;
  baseUpdatedAt?: number | null;
  baseReport?: unknown;
  forceOverwrite?: boolean;
  updatedByName?: string | null;
}

liffNewsGeneratorRouter.put("/draft", async (c) => {
  try {
    const body = (await c.req.json()) as SaveDraftRequestBody;
    const teamId = (body.teamId || "").trim();
    const draftId = (body.draftId || "").trim();
    if (!teamId || !draftId) {
      return c.json({ success: false, error: "teamId と draftId が必要です" }, 400);
    }
    if (teamId === "demo-team") {
      return c.json({
        success: true,
        merged: false,
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

    let finalDoc: LiveReportV2Document = sanitized;
    let merged = false;

    if (existingRow && existingRow.reportJson && !body.forceOverwrite) {
      const clientBaseTs =
        typeof body.baseUpdatedAt === "number" && Number.isFinite(body.baseUpdatedAt)
          ? body.baseUpdatedAt
          : null;

      if (clientBaseTs === null || existingRow.updatedAt !== clientBaseTs) {
        const remoteDoc = sanitizeLiveReportDocument(
          safeParseJson<unknown>(existingRow.reportJson, null)
        );
        const baseDoc = body.baseReport
          ? sanitizeLiveReportDocument(body.baseReport)
          : null;

        if (remoteDoc) {
          finalDoc = mergeLiveReportDocuments({
            base: baseDoc,
            remote: remoteDoc,
            local: sanitized,
            clientSideCursorFollow: false,
          });
          merged = true;
        }
      }
    }

    const now = existingRow
      ? Math.max(Date.now(), existingRow.updatedAt + 1)
      : Date.now();
    const matchIdVal =
      body.matchId && body.matchId.trim().length > 0
        ? body.matchId.trim()
        : null;
    const updatedBy =
      body.updatedByName && body.updatedByName.trim().length > 0
        ? body.updatedByName.trim()
        : null;
    const reportJsonStr = JSON.stringify(finalDoc);

    await db
      .insert(matchLiveReports)
      .values({
        id: draftId,
        teamId,
        matchId: matchIdVal,
        reportJson: reportJsonStr,
        updatedByName: updatedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: matchLiveReports.id,
        set: {
          teamId,
          matchId: matchIdVal,
          reportJson: reportJsonStr,
          updatedByName: updatedBy,
          updatedAt: now,
        },
      });

    return c.json({
      success: true,
      merged,
      report: finalDoc,
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

// 5. クラウド下書き削除（リセット用）
liffNewsGeneratorRouter.delete("/draft", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const draftId = (c.req.query("draftId") || "").trim();
    if (!teamId || !draftId || teamId === "demo-team") {
      return c.json({ success: true });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);
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
