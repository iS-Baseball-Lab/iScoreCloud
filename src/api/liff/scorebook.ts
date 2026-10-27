// filepath: src/api/liff/scorebook.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureMatchLineupColumns } from "@/lib/db-helper";
import {
  computeCountFromPitches,
  inferCanonicalResultCode,
  matchRosterPlayer,
  normalizePositionCode,
  resolveActiveMatchupFromStructure,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
import type { WorkerEnv } from "@/types/api";
import {
  isNonPitchMoundEvent,
  isPickoffPitch,
  type AdvanceMethodCode,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ConfidenceLevel,
  type ImportScopeMode,
  type NormalizedBox,
  type ScorebookBatterSlot,
  type ScorebookInningMeta,
  type ScorebookMatchSummary,
  type ScorebookPitcherStint,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookSubstitution,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
  type ScorebookValidationIssue,
} from "@/types/scorebook-v2";

const liffScorebookRouter = new Hono<{ Bindings: WorkerEnv }>();

const { matches, tournaments, matchLineups, teams, players, atBats, pitches, baseAdvances, playLogs } =
  schema;

interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface GeminiTextPart {
  text: string;
}

type GeminiContentPart = GeminiInlineDataPart | GeminiTextPart;

interface GeminiCandidatePart {
  text?: string;
  thought?: boolean;
}

interface GeminiApiCandidate {
  finishReason?: string;
  content?: {
    parts?: GeminiCandidatePart[];
  };
}

interface GeminiApiResponse {
  candidates?: GeminiApiCandidate[];
  error?: {
    message?: string;
  };
}

interface RawGeminiSubstitution {
  inningEntered?: number;
  subType?: string;
  name?: string;
  uniformNumber?: string;
  position?: string;
}

interface RawGeminiBatter {
  battingOrder?: number;
  name?: string;
  uniformNumber?: string;
  position?: string;
  substitutions?: RawGeminiSubstitution[];
}

interface RawGeminiPitcher {
  order?: number;
  name?: string;
  uniformNumber?: string;
  fromInning?: number;
  toInning?: number;
}

interface RawGeminiInningMeta {
  inning?: number;
  columnCount?: number;
  runs?: number;
  hits?: number;
  ymin?: number;
  xmin?: number;
  ymax?: number;
  xmax?: number;
}

interface RawGeminiStructureResponse {
  batters?: RawGeminiBatter[];
  pitchers?: RawGeminiPitcher[];
  innings?: RawGeminiInningMeta[];
  totalRuns?: number;
  totalHits?: number;
  totalErrors?: number;
}

interface RawGeminiAdvance {
  runnerName?: string;
  rn?: string;
  from?: string;
  f?: string;
  to?: string;
  t?: string;
  method?: string;
  m?: string;
  isOut?: boolean;
  io?: boolean;
  pitchNumber?: number;
  pn?: number;
}

interface RawGeminiAtBat {
  inning?: number;
  i?: number;
  columnIndex?: number;
  c?: number;
  battingOrder?: number;
  bo?: number;
  batterName?: string;
  b?: string;
  pitcherName?: string;
  pt?: string;
  resultCode?: string;
  rc?: string;
  resultLabel?: string;
  rl?: string;
  battedDirection?: string;
  dir?: string;
  rbi?: number;
  outsInPlay?: number;
  o?: number;
  endingOuts?: number;
  eo?: number;
  runsInPlay?: number;
  ru?: number;
  pitches?: string[];
  p?: string[];
  advances?: RawGeminiAdvance[];
  a?: RawGeminiAdvance[];
  confidence?: string;
  cf?: string;
  confidenceReason?: string;
  cr?: string;
  box?: number[];
  ymin?: number;
  xmin?: number;
  ymax?: number;
  xmax?: number;
}

interface RawGeminiChunkResponse {
  atBats?: RawGeminiAtBat[];
  ab?: RawGeminiAtBat[];
}

type GeminiCallMode = "structure" | "chunk";

interface GeminiModelAttemptConfig {
  model: string;
  /** 初動応答（HTTP 200＋最初のSSEチャンク到達）までの最大待機ミリ秒。混雑キュー滞留を素早く見切る */
  firstChunkTimeoutMs: number;
  /** 非思考の本文JSONテキストが出始めるまでの最大待機ミリ秒 */
  firstTextTimeoutMs: number;
  thinkingMode: "level_high" | "level_medium" | "level_low" | "budget" | "none";
  thinkingBudget?: number;
  backoffBeforeMs: number;
}

/**
 * モデル別の短期クールダウン記憶（同一Workerインスタンス内で 404 / 429 / 503 を起こしたモデルを即座にスキップし、
 * 健全な別サービングプールへ0msで直行させることで無駄な待機とRPM消費を防ぐ）
 */
const MODEL_COOLDOWN_UNTIL = new Map<
  string,
  { until: number; status: number }
>();

/**
 * Gemini 3 マルチプール・フェイルオーバールーティング:
 * - 廃止・無料枠ゼロの旧2.5系 / 3.5-flash を排除
 * - 独立したレート制限枠（RPM/RPD）と別サービングプールを持つ現行モデル群を順に試行:
 *   1. gemini-3.8-flash (最新フラッグシップFlash)
 *   2. gemini-3.6-flash (安定ワークホースFlash・別クォータ枠)
 *   3. gemini-3.5-flash-lite (高速・大容量クォータ枠 + 思考レベルHIGH/MEDIUM指定で高精度維持)
 *   4. gemini-3.8-flash-lite (3.8系軽量プール)
 *   5. gemini-3.1-flash-lite (3.1系独立クォータ枠)
 *   6. gemini-flash-lite-latest (最新Lite動的エイリアス枠)
 */
function getGeminiModelConfigs(
  mode: GeminiCallMode
): readonly GeminiModelAttemptConfig[] {
  const isStructure = mode === "structure";
  return [
    {
      model: "gemini-3.8-flash",
      firstChunkTimeoutMs: 16_000,
      firstTextTimeoutMs: 36_000,
      thinkingMode: isStructure ? "level_medium" : "level_low",
      backoffBeforeMs: 0,
    },
    {
      model: "gemini-3.6-flash",
      firstChunkTimeoutMs: 16_000,
      firstTextTimeoutMs: 36_000,
      thinkingMode: isStructure ? "level_medium" : "level_low",
      backoffBeforeMs: 250,
    },
    {
      model: "gemini-3.5-flash-lite",
      firstChunkTimeoutMs: 14_000,
      firstTextTimeoutMs: 32_000,
      thinkingMode: isStructure ? "level_high" : "level_medium",
      backoffBeforeMs: 250,
    },
    {
      model: "gemini-3.8-flash-lite",
      firstChunkTimeoutMs: 14_000,
      firstTextTimeoutMs: 30_000,
      thinkingMode: isStructure ? "level_medium" : "level_low",
      backoffBeforeMs: 250,
    },
    {
      model: "gemini-3.1-flash-lite",
      firstChunkTimeoutMs: 14_000,
      firstTextTimeoutMs: 30_000,
      thinkingMode: isStructure ? "level_medium" : "level_low",
      backoffBeforeMs: 300,
    },
    {
      model: "gemini-flash-lite-latest",
      firstChunkTimeoutMs: 14_000,
      firstTextTimeoutMs: 30_000,
      thinkingMode: isStructure ? "level_medium" : "level_low",
      backoffBeforeMs: 350,
    },
  ];
}

const PITCH_DISPLAY_JA: Record<CanonicalPitchResult, string> = {
  ball: "ボール",
  strike: "見逃しストライク",
  swinging_strike: "空振りストライク",
  bunt_swinging: "バント空振り",
  foul: "ファウル",
  bunt_foul: "バントファウル",
  pickoff_1b: "1塁牽制",
  pickoff_2b: "2塁牽制",
  pickoff_3b: "3塁牽制",
  pickoff: "牽制",
  balk: "ボーク",
  hit: "ヒット（インプレー）",
  in_play: "インプレー",
  hbp: "死球",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 取込コンテキスト取得（チーム選手名鑑・試合一覧・記号早見表）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffScorebookRouter.get("/context", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB, { schema });
  const requestedTeamId = c.req.query("teamId") || "";

  try {
    let targetTeam = requestedTeamId
      ? await db
          .select({
            id: teams.id,
            name: teams.name,
            scorebookLegendUrl: teams.scorebookLegendUrl,
          })
          .from(teams)
          .where(eq(teams.id, requestedTeamId))
          .get()
      : undefined;

    if (!targetTeam) {
      targetTeam = await db
        .select({
          id: teams.id,
          name: teams.name,
          scorebookLegendUrl: teams.scorebookLegendUrl,
        })
        .from(teams)
        .get();
    }

    if (!targetTeam) {
      return c.json({
        success: true,
        isDemo: true,
        team: null,
        roster: [] as ScorebookRosterPlayer[],
        matches: [] as ScorebookMatchSummary[],
      });
    }

    const rosterRows = await db
      .select({
        id: players.id,
        name: players.name,
        nameKana: players.nameKana,
        uniformNumber: players.uniformNumber,
        primaryPosition: players.primaryPosition,
      })
      .from(players)
      .where(eq(players.teamId, targetTeam.id))
      .all();

    const sortedRoster: ScorebookRosterPlayer[] = [...rosterRows].sort((a, b) => {
      const na = parseInt(a.uniformNumber, 10);
      const nb = parseInt(b.uniformNumber, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.uniformNumber.localeCompare(b.uniformNumber);
    });

    const matchRows = await db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
        matchType: matches.matchType,
        tournamentId: matches.tournamentId,
        tournamentName: tournaments.name,
        battingOrder: matches.battingOrder,
        innings: matches.innings,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(eq(matches.teamId, targetTeam.id))
      .orderBy(desc(matches.date), desc(matches.createdAt))
      .all();

    // すでに打席データが入っている試合ID一覧を取得
    const matchIds = matchRows.map((m) => m.id);
    const existingAtBatMatchIds = new Set<string>();
    if (matchIds.length > 0) {
      const abRows = await db
        .select({ matchId: atBats.matchId })
        .from(atBats)
        .where(inArray(atBats.matchId, matchIds))
        .all();
      for (const r of abRows) {
        existingAtBatMatchIds.add(r.matchId);
      }
    }

    const formattedMatches: ScorebookMatchSummary[] = [...matchRows]
      .sort((a, b) =>
        b.date.replace(/\//g, "-").localeCompare(a.date.replace(/\//g, "-"))
      )
      .map((m) => ({
        id: m.id,
        opponent: m.opponent,
        date: m.date,
        matchType: (m.matchType as "official" | "practice" | "exchange") || "practice",
        tournamentName:
          m.tournamentName ||
          (m.tournamentId && !m.tournamentId.includes("-") ? m.tournamentId : null),
        battingOrder: m.battingOrder === "second" ? "second" : "first",
        innings: m.innings || 7,
        status: m.status,
        myScore: m.myScore ?? 0,
        opponentScore: m.opponentScore ?? 0,
        myInningScores: safeParseNumberArray(m.myInningScores),
        opponentInningScores: safeParseNumberArray(m.opponentInningScores),
        hasExistingAtBats: existingAtBatMatchIds.has(m.id),
      }));

    return c.json({
      success: true,
      isDemo: false,
      team: targetTeam,
      roster: sortedRoster,
      matches: formattedMatches,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `コンテキスト取得エラー: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1-B. スコア設定：チーム共通「スコア記号早見表」の登録・更新・削除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface UpdateTeamLegendPayload {
  teamId: string;
  clear?: boolean;
  imageBase64?: string;
  mimeType?: string;
}

liffScorebookRouter.post("/legend", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB, { schema });

  try {
    const body = (await c.req.json()) as UpdateTeamLegendPayload;
    let targetTeam = body.teamId
      ? await db
          .select({
            id: teams.id,
            scorebookLegendUrl: teams.scorebookLegendUrl,
          })
          .from(teams)
          .where(eq(teams.id, body.teamId))
          .get()
      : undefined;

    if (!targetTeam) {
      targetTeam = await db
        .select({
          id: teams.id,
          scorebookLegendUrl: teams.scorebookLegendUrl,
        })
        .from(teams)
        .get();
    }

    if (!targetTeam) {
      return c.json({ success: false, error: "対象チームが見つかりません" }, 404);
    }

    const oldUrl = targetTeam.scorebookLegendUrl || "";
    const oldMarker = `/api/images/teams/legend-${targetTeam.id}-`;

    const cleanupPreviousR2Object = async () => {
      if (c.env.BUCKET && oldUrl.startsWith(oldMarker)) {
        const oldR2Key = oldUrl.slice("/api/images/".length);
        try {
          await c.env.BUCKET.delete(oldR2Key);
        } catch {
          // ignore R2 cleanup error
        }
      }
    };

    if (body.clear) {
      await cleanupPreviousR2Object();
      await db
        .update(teams)
        .set({
          scorebookLegendUrl: null,
        })
        .where(eq(teams.id, targetTeam.id));

      return c.json({
        success: true,
        teamId: targetTeam.id,
        scorebookLegendUrl: null,
      });
    }

    const rawBase64 = (body.imageBase64 || "").trim();
    if (!rawBase64) {
      return c.json({ success: false, error: "早見表の画像データがありません" }, 400);
    }

    const cleanBase64 = rawBase64.includes(",")
      ? (rawBase64.split(",")[1] || "").trim()
      : rawBase64;
    const bytes = base64ToUint8Array(cleanBase64);

    if (bytes.byteLength === 0 || bytes.byteLength > 2_400_000) {
      return c.json(
        {
          success: false,
          error: "画像サイズが大きすぎます（2.4MB以下に圧縮して再度お試しください）",
        },
        400
      );
    }

    const rawMime = (body.mimeType || "image/jpeg").toLowerCase();
    const safeMimeType =
      rawMime === "image/png"
        ? "image/png"
        : rawMime === "image/webp"
        ? "image/webp"
        : "image/jpeg";
    const ext =
      safeMimeType === "image/png"
        ? "png"
        : safeMimeType === "image/webp"
        ? "webp"
        : "jpg";

    let nextLegendUrl: string;
    if (c.env.BUCKET) {
      const r2Key = `teams/legend-${targetTeam.id}-${Date.now()}.${ext}`;
      const arrayBuf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      await c.env.BUCKET.put(r2Key, arrayBuf, {
        httpMetadata: { contentType: safeMimeType },
      });
      await cleanupPreviousR2Object();
      nextLegendUrl = `/api/images/${r2Key}`;
    } else {
      nextLegendUrl = `data:${safeMimeType};base64,${cleanBase64}`;
    }

    await db
      .update(teams)
      .set({
        scorebookLegendUrl: nextLegendUrl,
      })
      .where(eq(teams.id, targetTeam.id));

    return c.json({
      success: true,
      teamId: targetTeam.id,
      scorebookLegendUrl: nextLegendUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `早見表の保存に失敗しました: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. スコア取込画面内でのクイック新規試合枠作成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface QuickCreateMatchPayload {
  teamId: string;
  opponent: string;
  date: string;
  matchType: "official" | "practice" | "exchange";
  tournamentName?: string;
  battingOrder: "first" | "second";
  innings?: number;
}

liffScorebookRouter.post("/create-match", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB, { schema });

  try {
    const body = (await c.req.json()) as QuickCreateMatchPayload;
    if (!body.opponent?.trim()) {
      return c.json({ success: false, error: "対戦相手名を入力してください" }, 400);
    }

    let targetTeam = body.teamId
      ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, body.teamId)).get()
      : undefined;
    if (!targetTeam) {
      targetTeam = await db.select({ id: teams.id }).from(teams).get();
    }
    if (!targetTeam) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    let tournamentId: string | null = null;
    const trimmedTournament = (body.tournamentName || "").trim();
    if (
      (body.matchType === "official" || body.matchType === "exchange") &&
      trimmedTournament
    ) {
      const existing = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(eq(tournaments.name, trimmedTournament))
        .get();
      if (existing) {
        tournamentId = existing.id;
      } else {
        tournamentId = crypto.randomUUID();
        await db.insert(tournaments).values({
          id: tournamentId,
          name: trimmedTournament,
          season: String(new Date().getFullYear()),
          category: "other",
        });
      }
    }

    const matchId = crypto.randomUUID();
    const matchDate = body.date || new Date().toISOString().slice(0, 10);
    const matchInnings = body.innings || 7;
    const battingOrder = body.battingOrder === "second" ? "second" : "first";

    await db.insert(matches).values({
      id: matchId,
      teamId: targetTeam.id,
      tournamentId,
      opponent: body.opponent.trim(),
      date: matchDate,
      matchType: body.matchType || "practice",
      battingOrder,
      innings: matchInnings,
      status: "scheduled",
      myScore: 0,
      opponentScore: 0,
      myInningScores: "[]",
      opponentInningScores: "[]",
    });

    const summary: ScorebookMatchSummary = {
      id: matchId,
      opponent: body.opponent.trim(),
      date: matchDate,
      matchType: body.matchType || "practice",
      tournamentName: trimmedTournament || null,
      battingOrder,
      innings: matchInnings,
      status: "scheduled",
      myScore: 0,
      opponentScore: 0,
      myInningScores: [],
      opponentInningScores: [],
      hasExistingAtBats: false,
    };

    return c.json({ success: true, match: summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `試合枠の作成に失敗しました: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Stage 1: スコアシート骨格スキャン（打順・途中交代・継投・各回得点・列構造）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface AnalyzeStructurePayload {
  teamId: string;
  matchId: string;
  isTop: boolean;
  imageBase64: string;
  mimeType: string;
  lineupCropBase64?: string;
  lineupCropMimeType?: string;
  summaryCropBase64?: string;
  summaryCropMimeType?: string;
  legendBase64?: string;
  legendMimeType?: string;
}

interface SavedJsonLineupEntry {
  order?: number;
  battingOrder?: number;
  name?: string;
  uniformNumber?: string;
  position?: string;
}

function safeParseLineupArray(
  jsonStr: string | null | undefined
): SavedJsonLineupEntry[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is SavedJsonLineupEntry =>
          typeof item === "object" && item !== null
      );
    }
  } catch {
    // ignore invalid json
  }
  return [];
}

liffScorebookRouter.post("/analyze-structure", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, error: "GEMINI_API_KEY が設定されていません" }, 500);
  }

  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB, { schema });

  try {
    const body = (await c.req.json()) as AnalyzeStructurePayload;
    if (!body.imageBase64 || !body.matchId) {
      return c.json({ success: false, error: "画像データと試合IDが必要です" }, 400);
    }

    const match = await db
      .select({
        id: matches.id,
        teamId: matches.teamId,
        opponent: matches.opponent,
        battingOrder: matches.battingOrder,
        innings: matches.innings,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
        myLineup: matches.myLineup,
        opponentLineup: matches.opponentLineup,
      })
      .from(matches)
      .where(eq(matches.id, body.matchId))
      .get();

    if (!match) {
      return c.json({ success: false, error: "対象の試合が見つかりません" }, 404);
    }

    const roster = await db
      .select({
        id: players.id,
        name: players.name,
        nameKana: players.nameKana,
        uniformNumber: players.uniformNumber,
        primaryPosition: players.primaryPosition,
      })
      .from(players)
      .where(eq(players.teamId, match.teamId))
      .all();

    const savedLineups = await db
      .select({
        battingOrder: matchLineups.battingOrder,
        position: matchLineups.position,
        isStarting: matchLineups.isStarting,
        inningEntered: matchLineups.inningEntered,
        playerId: matchLineups.playerId,
        playerName: players.name,
        uniformNumber: players.uniformNumber,
      })
      .from(matchLineups)
      .innerJoin(players, eq(matchLineups.playerId, players.id))
      .where(eq(matchLineups.matchId, match.id))
      .orderBy(asc(matchLineups.battingOrder))
      .all();

    const isMyTeamFirst = match.battingOrder === "first";
    const isMyTeamBatting =
      (body.isTop && isMyTeamFirst) || (!body.isTop && !isMyTeamFirst);

    const rosterHint =
      roster.length > 0
        ? roster
            .map(
              (p) =>
                `#${p.uniformNumber} ${p.name}${p.nameKana ? `(${p.nameKana})` : ""}`
            )
            .join(", ")
        : "未登録";

    const fallbackJsonLineup = safeParseLineupArray(
      isMyTeamBatting ? match.myLineup : match.opponentLineup
    );

    const myStarterHint =
      savedLineups.length > 0
        ? savedLineups
            .filter((l) => l.isStarting)
            .map(
              (l) =>
                `${l.battingOrder}番: #${l.uniformNumber} ${l.playerName}(守備:${l.position})`
            )
            .join(", ")
        : fallbackJsonLineup.length > 0
        ? fallbackJsonLineup
            .map(
              (l, idx) =>
                `${l.order ?? l.battingOrder ?? idx + 1}番: #${l.uniformNumber || ""} ${l.name || ""}(守備:${l.position || ""})`
            )
            .join(", ")
        : "";

    const scoreboardHintScores = isMyTeamBatting
      ? safeParseNumberArray(match.myInningScores)
      : safeParseNumberArray(match.opponentInningScores);

    const hasMeaningfulScoreHint =
      scoreboardHintScores.length > 0 &&
      (scoreboardHintScores.some((r) => r > 0) || scoreboardHintScores.length >= 3);

    const scoreboardHintText = hasMeaningfulScoreHint
      ? `\n📌【試合テーブルに登録済みの各回得点データ（画像と照合してください）】: ${scoreboardHintScores
          .map((r, i) => `${i + 1}回=${r}点`)
          .join(", ")}（計${scoreboardHintScores.reduce((s, r) => s + r, 0)}点）`
      : "";

    const imageParts: GeminiContentPart[] = [
      {
        inlineData: {
          mimeType: body.mimeType || "image/jpeg",
          data: body.imageBase64,
        },
      },
    ];
    const imageDescriptions: string[] = [
      "・画像1: スコアブック片面全体画像（全体のグリッド列構造と 0〜1000 座標の算出基準）",
    ];

    if (body.lineupCropBase64) {
      imageParts.push({
        inlineData: {
          mimeType: body.lineupCropMimeType || "image/jpeg",
          data: body.lineupCropBase64,
        },
      });
      imageDescriptions.push(
        `・画像${imageParts.length}: シート左側の「打順・守備位置・背番号・選手氏名・途中交代欄」の高精細拡大画像（※手書き選手名・背番号・守備位置番号はこの拡大画像を最優先で1文字ずつ精確に読み取ってください！）`
      );
    }

    if (body.summaryCropBase64) {
      imageParts.push({
        inlineData: {
          mimeType: body.summaryCropMimeType || "image/jpeg",
          data: body.summaryCropBase64,
        },
      });
      imageDescriptions.push(
        `・画像${imageParts.length}: 上段が「上部スコアボード＆各列上端のイニング見出し番号」、紺色の境界線より下段が「各イニング列下端の得点/安打合計欄＆投手成績欄」の高精細拡大画像（※イニング見出し番号の列折り返し確認、各回得点、投手名の読み取りに活用してください！）`
      );
    }

    const legendPart = await resolveLegendImagePart(
      c,
      db,
      match.teamId,
      body.legendBase64,
      body.legendMimeType
    );
    if (legendPart) {
      imageParts.push(legendPart);
      imageDescriptions.push(
        `・画像${imageParts.length}: チーム公式のスコア記号早見表`
      );
    }

    const sideText = body.isTop ? "先攻（表の攻撃）" : "後攻（裏の攻撃）";
    const battingTeamContext = isMyTeamBatting
      ? `このシートの攻撃チームは【自チーム】です。拡大画像の手書き氏名と背番号を一字一句丁寧に読み取った上で、一致または類似する選手を以下の自チーム登録選手リストから名寄せしてください（登録リストに無い助っ人選手の場合は手書き文字をそのまま出力し、絶対に別人の名前を無理やり当てはめないでください）。\n自チーム登録選手リスト: [${rosterHint}]${
          myStarterHint ? `\n事前登録スタメン情報: [${myStarterHint}]` : ""
        }\nまた、相手投手の欄（このシートの打者に対して投げた相手チームのピッチャー）は手書き文字・背番号をそのまま読み取ってください。`
      : `このシートの攻撃チームは【対戦相手（${match.opponent}）】です。打者名は拡大画像の手書き文字・背番号を忠実に読み取ってください（絶対に自チーム登録選手の名前を打者欄に当てはめないでください！）。${
          myStarterHint ? `\n事前登録相手打順情報: [${myStarterHint}]` : ""
        }\n一方、このシートの打者に対して投げた登板投手（pitchers）は【自チームの投手】ですので、自チーム登録選手リスト [${rosterHint}] に名寄せしてください。`;

    const prompt = `あなたは日本の野球スコアブック（早稲田式・成美堂式・草野球/少年野球手書きスコア）の構造解析エキスパートです。
添付された画像群（${sideText}シート）を隅々まで観察し、「シート全体の骨格情報（打順・途中交代・登板投手・イニングごとの列構造と得点）」を極めて高い精度で抽出してください。

【添付画像の構成】
${imageDescriptions.join("\n")}

${battingTeamContext}${scoreboardHintText}

【絶対厳守の解析ルール】
1. **打順枠（batters）の高精度抽出**:
   - 左側の拡大画像を見て、1番〜9番（全員打ち制で10番以降が書かれている場合はその最終打順まで漏れなく）の先発選手を抽出してください。
   - **⚠️守備位置欄と背番号欄の取り違え厳禁**:
     - 日本のスコアブックの選手欄は「打順 | 守備位置 | 背番号 | 選手氏名」または「打順 | 選手氏名 | 背番号 | 守備位置」の列構造です。
     - **守備位置（position）** は 1〜9 または DH が1人ずつ割り振られる列です。漢字（投・捕・一・二・三・遊・左・中・右・指）や英語（P,C,1B..DH）で書かれていても、出力時は必ず **"1","2","3","4","5","6","7","8","9","D"** の1文字コードに変換してください（1=投, 2=捕, 3=一, 4=二, 5=三, 6=遊, 7=左, 8=中, 9=右, D=DH）。
     - **背番号（uniformNumber）** は 0〜99 等のユニフォーム番号です。背番号欄が空欄のときに守備位置番号（1〜9）を uniformNumber に入れるミスを絶対にしないでください！空欄なら "" を返してください。
   - **先発と途中交代（substitutions）の分離**:
     - 各打順枠が上下2〜3段に分かれている場合、**一番上の段が先発選手（starter）**です。
     - 2段目・3段目に実際に別の選手名が手書きされている場合のみ substitutions 配列に追加し、シート1全体の打席グリッド内の交代線（波線・二重線・斜線・『PH』『PR』表記）がある列から出場イニング（inningEntered: 1以上の整数）と種別（"PH"=代打, "PR"=代走, "DEF"=守備交代）を特定してください。空欄の段は絶対に出力しないでください。

2. **登板投手（pitchers）の敵味方検証と継投抽出**:
   - このシートの打者たちに対して投げた**守備側チームのピッチャー**を登板順（order: 1, 2...）に抽出してください。
   - **⚠️スコアブック様式による投手欄の取り違え防止（超重要）**:
     スコアブックの製品によっては、ページ下部/右下の投手欄に「相手投手」を書く様式と、「このページの攻撃チーム自身の投手」を書く様式があります。
     下部投手欄に書かれた投手名が、**このページの打順（batters）にいる選手（特に position:"1" の投手）と同一人物である場合、それは攻撃チーム自身の投手成績欄なので、相手投手として pitchers に入れてはいけません！** その場合は打席グリッド内の相手投手メモを探すか、書かれていなければ pitchers: [] を返してください。
   - 複数投手の継投がある場合は、投手欄の投球回数および打席グリッド内の投手交代横線（波線・二重線）の位置から、各投手の担当回（fromInning, toInning）を正確に設定してください。

3. **イニング構造・打者一巡（2列）・各回得点（innings）の三重照合**:
   - 各縦列の**最上部に印字・手書きされているイニング見出し番号（1, 2, 3...）**を必ず確認してください（拡大画像の上段参照）。
   - **🔥打者一巡（columnCount: 2）の厳密判定**:
     1イニングに打者が10人以上立つと、隣の2列目へ折り返して同じイニングが記録されます（2列目の見出し番号が同じ回に書き直されている、または1列目で3アウト③になる前に9人一巡して右隣列へ続いている状態）。
     この場合は必ず1つのイニング要素にまとめて **columnCount: 2** とし、後続のイニング番号が +1 ズレないよう見出し番号と照合してください！
   - 試合が行われていない空白のイニング列（最終回より右側の空列）は出力しないでください。
   - 各回の得点（runs）は、①上部スコアボードの数字、②各列最下部の得点計、③その回のマス内の本塁生還印（●や赤塗りダイヤ）の個数の**3箇所を突き合わせて完全一致**させてください。
   - 各イニング列の座標 (ymin, xmin, ymax, xmax) は必ず **画像1（シート全体画像）に対する 0〜1000 の正規化整数** で出力してください（columnCount:2 の場合は2列分を囲む xmin〜xmax）。

【出力JSONフォーマット（以下の厳密なキー構造のJSONオブジェクトのみを返してください）】
{"batters":[{"battingOrder":1,"name":"選手名","uniformNumber":"10","position":"6","substitutions":[{"inningEntered":5,"subType":"PH","name":"交代選手名","uniformNumber":"24","position":"D"}]}],"pitchers":[{"order":1,"name":"投手名","uniformNumber":"18","fromInning":1,"toInning":7}],"innings":[{"inning":1,"columnCount":1,"runs":0,"hits":1,"ymin":120,"xmin":210,"ymax":880,"xmax":300}],"totalRuns":0,"totalHits":1,"totalErrors":0}
※余分な説明文やMarkdownコードブロックは一切付けず、1行のコンパクトなJSON文字列のみを出力してください。`;

    const raw = await callGeminiStructuredJson<RawGeminiStructureResponse>(
      apiKey,
      prompt,
      imageParts,
      "structure"
    );

    const maxInningFromSheet =
      (raw.innings || []).reduce((mx, cur) => Math.max(mx, cur.inning || 1), 0) ||
      match.innings ||
      7;

    // 打順データの正規化＆自チーム選手名鑑自動リンク
    const rawBatters = Array.isArray(raw.batters) ? raw.batters : [];
    const normalizedBatters: ScorebookBatterSlot[] = rawBatters.map((b, idx) => {
      const order = b.battingOrder || idx + 1;
      const normPos = normalizePositionCode(b.position);
      // もし背番号と守備位置が全く同じ1桁数字で、登録名鑑にその背番号が存在しない場合は守備位置重複転記の可能性をケア
      const rawUniform = (b.uniformNumber || "").trim();
      const matched = isMyTeamBatting
        ? matchRosterPlayer(b.name, rawUniform, roster)
        : null;

      const subs: ScorebookSubstitution[] = (b.substitutions || [])
        .filter((s) => Boolean((s.name || "").trim() || (s.uniformNumber || "").trim()))
        .map((s) => {
          const subMatched = isMyTeamBatting
            ? matchRosterPlayer(s.name, s.uniformNumber, roster)
            : null;
          const normalizedSubType: "PH" | "PR" | "TR" | "DEF" =
            s.subType === "PR"
              ? "PR"
              : s.subType === "TR"
              ? "TR"
              : s.subType === "DEF"
              ? "DEF"
              : "PH";

          return {
            id: crypto.randomUUID(),
            inningEntered: Math.max(1, s.inningEntered || 1),
            subType: normalizedSubType,
            name: subMatched ? subMatched.name : (s.name || "").trim(),
            uniformNumber: subMatched
              ? subMatched.uniformNumber
              : (s.uniformNumber || "").trim(),
            position: normalizePositionCode(s.position),
            playerId: subMatched ? subMatched.id : null,
          };
        });

      return {
        battingOrder: order,
        name: matched ? matched.name : (b.name || "").trim(),
        uniformNumber: matched ? matched.uniformNumber : rawUniform,
        position:
          normPos ||
          (matched?.primaryPosition
            ? normalizePositionCode(matched.primaryPosition)
            : ""),
        playerId: matched ? matched.id : null,
        substitutions: subs,
      };
    });

    // もし9人未満しか返らなかった場合は9番まで枠を補完
    for (let ord = normalizedBatters.length + 1; ord <= 9; ord++) {
      const savedStarter = savedLineups.find(
        (l) => l.battingOrder === ord && l.isStarting
      );
      normalizedBatters.push({
        battingOrder: ord,
        name: isMyTeamBatting && savedStarter ? savedStarter.playerName : "",
        uniformNumber:
          isMyTeamBatting && savedStarter ? savedStarter.uniformNumber : "",
        position:
          isMyTeamBatting && savedStarter
            ? normalizePositionCode(savedStarter.position)
            : "",
        playerId: isMyTeamBatting && savedStarter ? savedStarter.playerId : null,
        substitutions: [],
      });
    }
    normalizedBatters.sort((a, b) => a.battingOrder - b.battingOrder);

    // 攻撃チーム自身の投手（position === "1"）を相手投手として誤抽出していないかチェック
    const ownBattingSidePitcherNames = new Set(
      normalizedBatters
        .filter((b) => b.position === "1" && b.name.trim() !== "")
        .map((b) => b.name.replace(/\s+/g, ""))
    );

    const rawPitchers = (Array.isArray(raw.pitchers) ? raw.pitchers : []).filter(
      (p) => {
        const cleanPName = (p.name || "").replace(/\s+/g, "");
        if (!cleanPName) return false;
        // このシートの打順にいる投手と完全同名なら、攻撃側自身の投手欄を読んだものなので除外
        if (ownBattingSidePitcherNames.has(cleanPName)) {
          return false;
        }
        return true;
      }
    );

    // 相手攻撃シート（＝自チームが守備・登板）で投手欄が空の場合、事前登録スタメンに自チーム先発投手がいれば自動セット
    const savedMyStartingPitcher = !isMyTeamBatting
      ? savedLineups.find(
          (l) => l.isStarting && normalizePositionCode(l.position) === "1"
        )
      : undefined;

    const normalizedPitchers: ScorebookPitcherStint[] =
      rawPitchers.length > 0
        ? rawPitchers.map((p, idx) => {
            const matchedPitcher = !isMyTeamBatting
              ? matchRosterPlayer(p.name, p.uniformNumber, roster)
              : null;
            return {
              id: crypto.randomUUID(),
              order: p.order || idx + 1,
              name: matchedPitcher
                ? matchedPitcher.name
                : (p.name || (isMyTeamBatting ? "相手投手" : "")).trim(),
              uniformNumber: matchedPitcher
                ? matchedPitcher.uniformNumber
                : (p.uniformNumber || "").trim(),
              playerId: matchedPitcher ? matchedPitcher.id : null,
              fromInning: Math.max(1, p.fromInning || 1),
              toInning: Math.max(1, p.toInning || maxInningFromSheet),
            };
          })
        : [
            {
              id: crypto.randomUUID(),
              order: 1,
              name: isMyTeamBatting
                ? "相手投手"
                : savedMyStartingPitcher
                ? savedMyStartingPitcher.playerName
                : "",
              uniformNumber:
                !isMyTeamBatting && savedMyStartingPitcher
                  ? savedMyStartingPitcher.uniformNumber
                  : "",
              playerId:
                !isMyTeamBatting && savedMyStartingPitcher
                  ? savedMyStartingPitcher.playerId
                  : null,
              fromInning: 1,
              toInning: maxInningFromSheet,
            },
          ];

    // 重複イニング番号が返った場合はマージして整列
    const inningMergeMap = new Map<number, ScorebookInningMeta>();
    for (const inn of raw.innings || []) {
      const innNum = inn.inning || 0;
      if (innNum < 1) continue;
      const box = sanitizeBox(inn.ymin, inn.xmin, inn.ymax, inn.xmax);
      const existing = inningMergeMap.get(innNum);
      if (!existing) {
        inningMergeMap.set(innNum, {
          inning: innNum,
          columnCount: Math.max(1, inn.columnCount || 1),
          runs: Math.max(0, inn.runs ?? 0),
          hits: Math.max(0, inn.hits ?? 0),
          columnBox: box,
        });
      } else {
        existing.columnCount += Math.max(1, inn.columnCount || 1);
        existing.runs += Math.max(0, inn.runs ?? 0);
        existing.hits += Math.max(0, inn.hits ?? 0);
        if (existing.columnBox && box) {
          existing.columnBox = [
            Math.min(existing.columnBox[0], box[0]),
            Math.min(existing.columnBox[1], box[1]),
            Math.max(existing.columnBox[2], box[2]),
            Math.max(existing.columnBox[3], box[3]),
          ];
        } else if (box) {
          existing.columnBox = box;
        }
      }
    }

    const normalizedInnings: ScorebookInningMeta[] = Array.from(
      inningMergeMap.values()
    ).sort((a, b) => a.inning - b.inning);

    const calculatedRuns = normalizedInnings.reduce((acc, cur) => acc + cur.runs, 0);
    const calculatedHits = normalizedInnings.reduce((acc, cur) => acc + cur.hits, 0);

    const structure: ScorebookSheetStructure = {
      isTop: body.isTop,
      isMyTeamBatting,
      batters: normalizedBatters,
      pitchers: normalizedPitchers,
      innings:
        normalizedInnings.length > 0
          ? normalizedInnings
          : Array.from({ length: Math.min(7, match.innings || 7) }, (_, i) => ({
              inning: i + 1,
              columnCount: 1,
              runs: scoreboardHintScores[i] ?? 0,
              hits: 0,
            })),
      totalRuns: calculatedRuns,
      totalHits: raw.totalHits ?? calculatedHits,
      totalErrors: Math.max(0, raw.totalErrors ?? 0),
    };

    return c.json({
      success: true,
      structure,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `骨格スキャンエラー: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Stage 2: イニング分割ディープ解析（1球ごとの投球順序・打席結果・進塁・確信度・マス座標）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface AnalyzeInningChunkPayload {
  teamId: string;
  matchId: string;
  isTop: boolean;
  imageBase64: string;
  mimeType: string;
  focusCropBase64?: string;
  focusCropMimeType?: string;
  structure: ScorebookSheetStructure;
  targetInnings: number[];
  expectedLeadOffOrder?: number;
  legendBase64?: string;
  legendMimeType?: string;
}

liffScorebookRouter.post("/analyze-inning-chunk", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, error: "GEMINI_API_KEY が設定されていません" }, 500);
  }

  const db = drizzle(c.env.DB, { schema });

  try {
    const body = (await c.req.json()) as AnalyzeInningChunkPayload;
    if (
      !body.imageBase64 ||
      !body.structure ||
      !Array.isArray(body.targetInnings) ||
      body.targetInnings.length === 0
    ) {
      return c.json({ success: false, error: "解析パラメータが不足しています" }, 400);
    }

    const sideLabel = body.isTop ? "表（先攻）" : "裏（後攻）";
    const sortedTargets = [...body.targetInnings].sort((a, b) => a - b);

    const imageParts: GeminiContentPart[] = [
      {
        inlineData: {
          mimeType: body.mimeType || "image/jpeg",
          data: body.imageBase64,
        },
      },
    ];
    const stage2ImageGuide: string[] = [
      "・画像1: スコアブック片面全体画像（※出力する box 座標 [ymin, xmin, ymax, xmax] は必ずこの画像1全体の 0〜1000 座標系で指定してください）",
    ];

    if (body.focusCropBase64) {
      imageParts.push({
        inlineData: {
          mimeType: body.focusCropMimeType || "image/jpeg",
          data: body.focusCropBase64,
        },
      });
      stage2ImageGuide.push(
        `・画像${imageParts.length}: 【${sortedTargets.join(
          "・"
        )}回専用・水平整列ズーム画像】左側に「打順・選手名欄」、水色の縦線のすぐ右側に「今回抽出対象の ${sortedTargets.join(
          "・"
        )}回 の列付近」を全く同じ行高さで横並び拡大した画像です！左の打順行から真横に視線を動かして対象イニング列のマスを特定し、隣のイニング列の打席を絶対に混ぜないでください！`
      );
    }

    const legendPart = await resolveLegendImagePart(
      c,
      db,
      body.teamId,
      body.legendBase64,
      body.legendMimeType
    );
    let legendImageIndex = 0;
    if (legendPart) {
      imageParts.push(legendPart);
      legendImageIndex = imageParts.length;
      stage2ImageGuide.push(
        `・画像${legendImageIndex}: チーム公式のスコア記号早見表（最優先で参照）`
      );
    }

    // 確定済み打順＆途中交代テキストを構築
    const lineupSpecLines = body.structure.batters.map((b) => {
      const subStr =
        b.substitutions.length > 0
          ? ` ➔ 交代: ${b.substitutions
              .map(
                (s) =>
                  `[${s.inningEntered}回〜 ${s.subType} #${s.uniformNumber} ${s.name}]`
              )
              .join(", ")}`
          : "";
      return `・${b.battingOrder}番: #${b.uniformNumber} ${b.name}${subStr}`;
    });

    const pitcherSpecLines = body.structure.pitchers.map(
      (p) =>
        `・${p.fromInning}回〜${p.toInning}回: #${p.uniformNumber} ${p.name || "投手"}`
    );

    const targetInningMetaLines = sortedTargets.map((innNum) => {
      const meta = body.structure.innings.find((m) => m.inning === innNum);
      if (!meta) return `・${innNum}回${sideLabel}: 1列`;
      const colNote =
        meta.columnCount >= 2
          ? `⚠️打者一巡のため【${meta.columnCount}列】使用（1列目の下端まで行ったら右隣の同イニング2列目の上端・該当打順へ続く！）`
          : "1列使用";
      const boxNote = meta.columnBox
        ? ` (画像1での列座標目安 ymin:${meta.columnBox[0]}, xmin:${meta.columnBox[1]}, ymax:${meta.columnBox[2]}, xmax:${meta.columnBox[3]})`
        : "";
      return `・${innNum}回${sideLabel}: 確定得点=${meta.runs}点, 安打目安=${meta.hits}本, ${colNote}${boxNote}`;
    });

    const leadOffConstraint = body.expectedLeadOffOrder
      ? `\n🔥【絶対制約: 先頭打者】${sortedTargets[0]}回${sideLabel}の最初の打者（先頭打者）は必ず【${body.expectedLeadOffOrder}番打者】の行からスタートします！列最上部のイニング見出し番号「${sortedTargets[0]}」を必ず確認し、隣の列の打席を混入させたり空欄マスを読み飛ばしたりしないでください。`
      : `\n🔥【絶対制約: 先頭打者】1回${sideLabel}の最初の打者は必ず【1番打者】の行からスタートします。列最上部のイニング見出し番号「1」の列だけを読み取り、右隣の2回の列を絶対に1回に混ぜないでください！`;

    const legendConstraint = legendImageIndex > 0
      ? `\n🔥【最優先: 添付画像${legendImageIndex}「チームのスコア記号早見表」】安打・アウト・投球記号・バントファウル・1塁牽制/2塁牽制/3塁牽制の書き方は画像${legendImageIndex}の定義を最優先で厳密に適用してください。`
      : "";

    const prompt = `あなたは日本の早稲田式・成美堂式スコアブックを1球単位まで完璧に読み解くプロ公式記録員AIです。
以下の添付画像を照合し、**【${sortedTargets.join("回, ")}回（${sideLabel}）】の打席のみ** を時系列順に全打席・全投球・全進塁漏れなく抽出してください。
（※列最上部のイニング番号を厳密に確認し、${sortedTargets.join(", ")}回以外のイニングの打席は絶対に出力しないでください！）

【添付画像の構成】
${stage2ImageGuide.join("\n")}
${legendConstraint}${leadOffConstraint}

【確定済みの打順・途中交代リスト（この名前を厳密に使用すること）】
${lineupSpecLines.join("\n")}

【確定済みの相手登板投手リスト】
${pitcherSpecLines.join("\n")}

【対象イニングの確定スコア＆列情報（必ずこの得点数・列数・3アウト交代と整合させること）】
${targetInningMetaLines.join("\n")}

【超重要 1: 列ズレ・イニング混入の完全防止】
- 1つのイニングは先頭打者から打順が1つずつ下へ進み（9番の次は1番へ戻る）、アウト丸数字 ① ➔ ② ➔ ③（3アウトチェンジ）が出た時点でそのイニングは終了です！
- ③（3アウト目）が出た後に、右隣の次イニング列に書かれたマスを同じイニングとして読み続けるミスは絶対にしないでください。

【超重要 2: 1球ごとの投球・牽制・ボーク順序（p）の完全抽出（必須）】
各打席マスの投球記号欄（BSO欄）および各塁周辺の牽制・ボーク記号を拡大画像で1球目から順番に読み取り、以下の短縮コード配列 p で出力してください:
- "B": ボール（『ー』『・』『B欄の●』『B』 ※無走者の打席では牽制やボークは存在しないため横棒『ー』は必ず "B"）
- "S": 見逃しストライク（『○』『見逃しS』）
- "W": 空振りストライク（『●』『／』『空振り』）
- "BS": バント空振り（『／』に点・半黒丸『◐』・『BS』、または早見表のバント空振り記号）
- "F": 通常のファウル（『△』『▽』『V』『レ』『F』などの白抜き三角・チェック記号）
- "BF": バントファウル（『▲』『▼』などの黒塗り三角・二重三角・点や線入り△・『BF』、または早見表のバントファウル記号。2ストライク後の "BF" はスリーバント失敗＝三振）
- "P1": 1塁牽制（早見表の1塁牽制記号、またはBSO欄の1本線付きカギ線『∟』『┬』・『1』『牽1』『一牽』『k1』・1塁ベース角への牽制線）
- "P2": 2塁牽制（早見表の2塁牽制記号、またはBSO欄の2本線付き二重カギ線『∏』『キ』・『2』『牽2』『二牽』『k2』・2塁ベース角への牽制線）
- "P3": 3塁牽制（早見表の3塁牽制記号、またはBSO欄の3本線付き三重カギ線・『3』『牽3』『三牽』『k3』・3塁ベース角への牽制線）
- "BK": ボーク（『BK』・早見表のボーク記号。発生時は走者全員の1個進塁も a に m:"balk" で記録すること）
- "H": 安打になった最終球（単打・二塁打・三塁打・本塁打は末尾を必ず "H" にする）
- "X": 安打以外のインプレー打球（ゴロ・フライ・ライナー・インフィールドフライ・犠打・犠飛・失策・野選・妨害は末尾を "X" にする）
- "D": 死球になった球
※【牽制・ボークと走者の整合ルール】: 牽制球（P1/P2/P3）およびボーク（BK）は走者がいる場面でのみ記録されます（走者1塁のみなら "P1"、2塁のみなら "P2"、3塁のみなら "P3"）。1塁・2塁・3塁の牽制記号の違いと塁上走者の位置の両方を照合して厳密に判別してください。
※申告敬遠（rc: "intentional_walk"）以外の打席は、BSO合計のみ書かれたマスも最終カウントと結果に整合する配列を構成し、空配列にしないでください。

【超重要 3: 打撃結果コード（rc）と日本語表記（rl）の厳密判定】
- 安打とアウトを絶対に混同しないでください！右下の1塁線〜進塁線に実線・赤線・斜線（/ = 単打, // = 二塁打, /// = 三塁打, //// = 本塁打）があり打者自身のアウト丸数字（①②③）が無い場合は安打です。
- 中央『7』『8』『9』等の守備番号＋斜線/赤線 ➔ rc: "single"（または "double"/"triple"/"home_run"）, rl: "左前安打" / "中前安打" 等。
- 『6-3』『4-3』等の送球ハイフン＋①②③ ➔ rc: "groundout"（併殺は "double_play"、三重殺は "triple_play"）, rl: "遊ゴロ (6-3)" 等。
- 『8』『7F』『9飛』『6直』『2邪飛』＋①②③ ➔ rc: "flyout", rl: "中飛" / "遊直" / "捕邪飛" 等。
- 『IF』『IFF』『(IF)』『インフィールドフライ』＋①② ➔ rc: "infield_fly", rl: "インフィールドフライ", o: 1。
- 『K』『SO』または2ストライク後のバントファウル（スリーバント失敗）＋①②③ ➔ rc: "strikeout", rl: "空振り三振" / "見逃し三振" / "スリーバント失敗", o: 1。
- 振り逃げアウト（『K 2-3』『振逃2-3』＋アウト丸数字 ①②③）➔ rc: "dropped_third_strike_out", rl: "振り逃げアウト (K 2-3)", o: 1。
- 振り逃げセーフ出塁（『K』＋WP/PB/E2等で1塁進塁、打者のアウト丸数字なし）➔ rc: "dropped_third_strike", rl: "振り逃げ出塁", o: 0。
- 打撃妨害・インターフェア出塁（『I』『INT』『CI』『打妨』で1塁出塁、o: 0）➔ rc: "interference", rl: "打撃妨害 (INT)", o: 0。
- 守備妨害・インターフェアアウト・反則打球（『INT』『守妨』『反則打球』＋①②③）➔ rc: "interference_out", rl: "守備妨害アウト (INT)", o: 1。
- 四球 ➔ rc: "walk"、敬遠・申告敬遠（『IBB』『敬遠』）➔ rc: "intentional_walk"、死球 ➔ rc: "hit_by_pitch"、犠打（犠打失策・犠打野選で0死の場合も rc は "sac_bunt"）➔ rc: "sac_bunt"、犠飛 ➔ rc: "sac_fly"、失策 ➔ rc: "error"、野選（『FC』『O.B.』）➔ rc: "fc"。
- 打席途中に走者が盗塁死・牽制死・走塁死して3アウトチェンジになった未完了マス ➔ rc: "other", rl: "打席途中断（走塁死チェンジ）", o: 1。

【超重要 4: アウト数（o / eo）と進塁・得点（ru / a）】
- 1イニングの o の合計は（最終回裏のサヨナラ勝ちを除き）必ず 3 です。丸数字 ①②③ から eo (1,2,3) を設定してください。
- 盗塁(m:"steal")・盗塁死(m:"caught_stealing",io:true)・牽制死(m:"pickoff_out",io:true)・牽制悪送球(m:"pickoff_error")・暴投(m:"wp")・捕逸(m:"pb")・ボーク進塁(m:"balk")・送球間進塁『T』(m:"throw_advance")・走塁妨害『OBS』(m:"obstruction")・走者の守備妨害死『INT』(m:"interference_out",io:true)・アピール/離塁死(m:"appeal_out",io:true)・タイブレーク配置走者(m:"tiebreak")・走塁死/挟殺『TO』(m:"out_on_base",io:true)・打撃進塁(m:"hit"/"sac"/"fc"/"error"/"walk")を a に記録してください。進塁が無い凡退等は a:[] としてください。
- 本塁生還は t:"HP", io:false とし、その打席の生還人数を ru に設定（イニング内の ru 合計＝確定得点）。

【超重要 5: マス座標 box と確信度 cf】
- box は画像1（全体画像）上での [ymin, xmin, ymax, xmax]（0〜1000整数4要素配列）。
- cf は "h"(高)・"m"(中)・"l"(低)。迷いがあるマスのみ cf:"l" とし cr に短い理由を記載（通常は cr 省略可）。

【出力JSONフォーマット（改行・インデント無しのコンパクト短縮キーJSONのみを返してください）】
{"ab":[{"i":1,"c":1,"bo":1,"rc":"single","rl":"左前安打","rbi":0,"o":0,"eo":0,"ru":0,"p":["B","S","F","H"],"a":[{"rn":"選手名","f":"BAT","t":"1B","m":"hit","io":false,"pn":4}],"cf":"h","box":[150,210,230,300]}]}
※ rc は必ず "single"|"double"|"triple"|"home_run"|"walk"|"intentional_walk"|"hit_by_pitch"|"interference"|"sac_bunt"|"sac_fly"|"groundout"|"flyout"|"infield_fly"|"strikeout"|"dropped_third_strike_out"|"dropped_third_strike"|"double_play"|"triple_play"|"interference_out"|"error"|"fc"|"other" のいずれかとしてください。`;

    const rawChunk = await callGeminiStructuredJson<RawGeminiChunkResponse>(
      apiKey,
      prompt,
      imageParts,
      "chunk"
    );

    const targetSet = new Set(sortedTargets);
    const rawItems = rawChunk.ab || rawChunk.atBats || [];
    const rawList = rawItems.filter((ab) =>
      targetSet.has((ab.i ?? ab.inning) || 0)
    );

    let currentTrackingInning = -1;
    let activeBases: Record<"1B" | "2B" | "3B", boolean> = {
      "1B": false,
      "2B": false,
      "3B": false,
    };

    const mappedAtBats: ScorebookV2AtBat[] = rawList.map((ab) => {
      const inning = (ab.i ?? ab.inning) || sortedTargets[0];
      if (inning !== currentTrackingInning) {
        currentTrackingInning = inning;
        activeBases = { "1B": false, "2B": false, "3B": false };
      }

      const battingOrder = Math.max(1, (ab.bo ?? ab.battingOrder) || 1);
      const resolved = resolveActiveMatchupFromStructure(
        body.structure,
        inning,
        battingOrder
      );

      const rawResultCode = ab.rc ?? ab.resultCode;
      const rawResultLabel = ab.rl ?? ab.resultLabel;
      const resultCode = inferCanonicalResultCode(rawResultCode, rawResultLabel);

      const rawAdvances = ab.a || ab.advances || [];
      const advances: ScorebookV2Advance[] = rawAdvances.map((adv) => {
        const pnVal = adv.pn ?? adv.pitchNumber;
        return {
          id: crypto.randomUUID(),
          runnerName: (adv.rn ?? adv.runnerName ?? "").trim(),
          from: normalizeFromBase(adv.f ?? adv.from),
          to: normalizeToBase(adv.t ?? adv.to),
          method: normalizeAdvanceMethod(adv.m ?? adv.method),
          isOut: Boolean(adv.io ?? adv.isOut),
          pitchNumber:
            typeof pnVal === "number" && pnVal > 0 ? pnVal : undefined,
        };
      });

      const normalizedPitches = normalizePitchArray(
        ab.p || ab.pitches || [],
        resultCode,
        advances,
        activeBases
      );
      const { balls, strikes } = computeCountFromPitches(normalizedPitches);
      const boxArr = Array.isArray(ab.box) && ab.box.length >= 4 ? ab.box : undefined;
      const cellBox = boxArr
        ? sanitizeBox(boxArr[0], boxArr[1], boxArr[2], boxArr[3])
        : sanitizeBox(ab.ymin, ab.xmin, ab.ymax, ab.xmax);

      const rawConf = (ab.cf ?? ab.confidence ?? "h").toLowerCase();
      const confidence: ConfidenceLevel =
        rawConf === "l" || rawConf === "low"
          ? "low"
          : rawConf === "m" || rawConf === "medium"
          ? "medium"
          : "high";

      // 次打席向けに簡易ランナー位置を更新
      for (const adv of advances) {
        if (adv.from === "1B" || adv.from === "2B" || adv.from === "3B") {
          activeBases[adv.from] = false;
        }
      }
      for (const adv of advances) {
        if (!adv.isOut && (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")) {
          activeBases[adv.to] = true;
        }
      }
      const outsVal = Math.max(0, Math.min(3, ab.o ?? ab.outsInPlay ?? 0));
      if (advances.filter((a) => a.from === "BAT").length === 0 && outsVal === 0) {
        if (
          resultCode === "single" ||
          resultCode === "walk" ||
          resultCode === "intentional_walk" ||
          resultCode === "hit_by_pitch" ||
          resultCode === "interference" ||
          resultCode === "error" ||
          resultCode === "fc" ||
          resultCode === "dropped_third_strike"
        ) {
          activeBases["1B"] = true;
        } else if (resultCode === "double") {
          activeBases["2B"] = true;
        } else if (resultCode === "triple") {
          activeBases["3B"] = true;
        }
      }

      const hpCount = advances.filter((a) => a.to === "HP" && !a.isOut).length;
      const isHr = resultCode === "home_run";
      const rawRunsInPlay = ab.ru ?? ab.runsInPlay ?? 0;
      const effectiveRuns = Math.max(
        rawRunsInPlay,
        hpCount,
        isHr ? 1 : 0
      );

      return {
        id: crypto.randomUUID(),
        inning,
        isTop: body.isTop,
        columnIndex: Math.max(1, (ab.c ?? ab.columnIndex) || 1),
        battingOrder,
        batterName: resolved.batterName || (ab.b ?? ab.batterName ?? "").trim(),
        batterPlayerId: resolved.batterPlayerId,
        pitcherName: resolved.pitcherName || (ab.pt ?? ab.pitcherName ?? "").trim(),
        pitcherPlayerId: resolved.pitcherPlayerId,
        resultCode,
        resultLabel: (rawResultLabel || resultCode).trim(),
        battedDirection: (ab.dir ?? ab.battedDirection ?? "").trim(),
        rbi: Math.max(0, ab.rbi ?? effectiveRuns),
        outsInPlay: Math.max(0, Math.min(3, ab.o ?? ab.outsInPlay ?? 0)),
        endingOuts: Math.max(0, Math.min(3, ab.eo ?? ab.endingOuts ?? 0)),
        runsInPlay: effectiveRuns,
        balls,
        strikes,
        pitches: normalizedPitches,
        advances,
        confidence,
        confidenceReason: (ab.cr ?? ab.confidenceReason ?? "").trim() || undefined,
        cellBox,
      };
    });

    // 次のチャンクの先頭打順を計算
    const lineupCycle = Math.max(9, body.structure.batters.length);
    let nextLeadOffOrder = body.expectedLeadOffOrder || 1;
    if (mappedAtBats.length > 0) {
      const lastAb = mappedAtBats[mappedAtBats.length - 1];
      const endedByRunnerOutOnly =
        lastAb.resultCode === "other" &&
        lastAb.advances.some(
          (a) =>
            a.isOut &&
            (a.method === "caught_stealing" ||
              a.method === "pickoff_out" ||
              a.method === "interference_out" ||
              a.method === "appeal_out" ||
              a.method === "out_on_base")
        );
      nextLeadOffOrder = endedByRunnerOutOnly
        ? lastAb.battingOrder
        : (lastAb.battingOrder % lineupCycle) + 1;
    }

    return c.json({
      success: true,
      atBats: mappedAtBats,
      nextLeadOffOrder,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `イニング解析エラー: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. D1保存エンドポイント（先攻・後攻一括保存 ＆ 片面のみ非破壊マージ保存の両対応！）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface SaveScorebookV2Payload {
  teamId: string;
  matchId: string;
  importScope: ImportScopeMode;
  topStructure?: ScorebookSheetStructure | null;
  bottomStructure?: ScorebookSheetStructure | null;
  topAtBats?: ScorebookV2AtBat[];
  bottomAtBats?: ScorebookV2AtBat[];
}

liffScorebookRouter.post("/save", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB, { schema });

  try {
    const body = (await c.req.json()) as SaveScorebookV2Payload;
    if (!body.matchId) {
      return c.json({ success: false, error: "試合IDが指定されていません" }, 400);
    }

    const match = await db
      .select()
      .from(matches)
      .where(eq(matches.id, body.matchId))
      .get();

    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    const roster = await db
      .select({
        id: players.id,
        name: players.name,
        nameKana: players.nameKana,
        uniformNumber: players.uniformNumber,
        primaryPosition: players.primaryPosition,
      })
      .from(players)
      .where(eq(players.teamId, match.teamId))
      .all();

    const isMyTeamFirst = match.battingOrder === "first";
    const includeTop = body.importScope === "both" || body.importScope === "top_only";
    const includeBottom =
      body.importScope === "both" || body.importScope === "bottom_only";

    const incomingTop = includeTop ? body.topAtBats || [] : [];
    const incomingBottom = includeBottom ? body.bottomAtBats || [] : [];

    // バリデーションメッセージ生成
    const topIssues = includeTop
      ? validateScorebookSheet(incomingTop, body.topStructure)
      : [];
    const bottomIssues = includeBottom
      ? validateScorebookSheet(incomingBottom, body.bottomStructure)
      : [];
    const allIssues: ScorebookValidationIssue[] = [...topIssues, ...bottomIssues];

    // 1. 削除対象の既存データを整理（片面取込の場合は逆側のデータを絶対に消さない！）
    if (body.importScope === "both") {
      const existingAbs = await db
        .select({ id: atBats.id })
        .from(atBats)
        .where(eq(atBats.matchId, match.id))
        .all();
      const abIds = existingAbs.map((r) => r.id);
      if (abIds.length > 0) {
        await deleteByAtBatIdsChunked(db, abIds);
      }
      await db.delete(baseAdvances).where(eq(baseAdvances.matchId, match.id));
      await db.delete(playLogs).where(eq(playLogs.matchId, match.id));
      await db.delete(atBats).where(eq(atBats.matchId, match.id));
    } else {
      const targetIsTop = body.importScope === "top_only";
      const sideAbs = await db
        .select({ id: atBats.id })
        .from(atBats)
        .where(and(eq(atBats.matchId, match.id), eq(atBats.isTop, targetIsTop)))
        .all();
      const sideIds = sideAbs.map((r) => r.id);
      if (sideIds.length > 0) {
        await deleteByAtBatIdsChunked(db, sideIds);
      }
    }

    // 2. 自チームスタメン・途中出場(match_lineups & myLineup)および相手打順(opponentLineup)の反映
    const myStructure = isMyTeamFirst ? body.topStructure : body.bottomStructure;
    const oppStructure = isMyTeamFirst ? body.bottomStructure : body.topStructure;

    if (myStructure && myStructure.batters.length > 0) {
      await db.delete(matchLineups).where(eq(matchLineups.matchId, match.id));

      const lineupInserts: Array<typeof matchLineups.$inferInsert> = [];
      const myLineupJson: Array<{
        order: number;
        playerId: string | null;
        name: string;
        uniformNumber: string;
        position: string;
      }> = [];

      for (const slot of myStructure.batters) {
        const resolvedPlayer =
          (slot.playerId
            ? roster.find((p) => p.id === slot.playerId) || null
            : null) || matchRosterPlayer(slot.name, slot.uniformNumber, roster);

        if (resolvedPlayer) {
          lineupInserts.push({
            id: crypto.randomUUID(),
            matchId: match.id,
            playerId: resolvedPlayer.id,
            battingOrder: slot.battingOrder,
            position: slot.position || resolvedPlayer.primaryPosition || "",
            isStarting: true,
            inningEntered: 1,
          });
        }

        myLineupJson.push({
          order: slot.battingOrder,
          playerId: resolvedPlayer ? resolvedPlayer.id : null,
          name: resolvedPlayer ? resolvedPlayer.name : slot.name,
          uniformNumber: resolvedPlayer
            ? resolvedPlayer.uniformNumber
            : slot.uniformNumber,
          position: slot.position || "",
        });

        for (const sub of slot.substitutions) {
          const resolvedSub =
            (sub.playerId
              ? roster.find((p) => p.id === sub.playerId) || null
              : null) || matchRosterPlayer(sub.name, sub.uniformNumber, roster);
          if (resolvedSub) {
            lineupInserts.push({
              id: crypto.randomUUID(),
              matchId: match.id,
              playerId: resolvedSub.id,
              battingOrder: slot.battingOrder,
              position:
                sub.position ||
                (sub.subType === "PH"
                  ? "P"
                  : sub.subType === "PR"
                  ? "R"
                  : resolvedSub.primaryPosition || ""),
              isStarting: false,
              inningEntered: Math.max(1, sub.inningEntered || 1),
            });
          }
        }
      }

      if (lineupInserts.length > 0) {
        await runBatchChunked(
          db,
          lineupInserts.map((val) => db.insert(matchLineups).values(val))
        );
      }

      await db
        .update(matches)
        .set({ myLineup: JSON.stringify(myLineupJson) })
        .where(eq(matches.id, match.id));
    }

    let updatedOpponentLineup = match.opponentLineup || "[]";
    if (oppStructure && oppStructure.batters.length > 0) {
      const oppJson = oppStructure.batters.map((b) => ({
        order: b.battingOrder,
        position: b.position || "",
        name: b.name || "",
        uniformNumber: b.uniformNumber || "",
      }));
      updatedOpponentLineup = JSON.stringify(oppJson);
    }

    // 3. イニング順（1回表 ➔ 1回裏 ➔ 2回表 ➔ 2回裏 ...）に時系列整列してDB挿入クエリを生成
    //    ※同一イニング内の並び順は Step 3 でユーザーが確認・並び替えた配列順を厳密に維持する
    const combinedIncoming = [...incomingTop, ...incomingBottom].sort((a, b) => {
      if (a.inning !== b.inning) return a.inning - b.inning;
      if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
      return 0;
    });

    const insertQueries: Array<unknown> = [];
    const baseTimestamp = Date.now();
    let seq = 0;

    for (const ab of combinedIncoming) {
      seq += 1;
      const atBatId = crypto.randomUUID();
      const isMyTeamBatting =
        (ab.isTop && isMyTeamFirst) || (!ab.isTop && !isMyTeamFirst);

      const batterPlayerId = isMyTeamBatting
        ? ab.batterPlayerId ||
          matchRosterPlayer(ab.batterName, undefined, roster)?.id ||
          null
        : null;

      const pitcherPlayerId = !isMyTeamBatting
        ? ab.pitcherPlayerId ||
          matchRosterPlayer(ab.pitcherName, undefined, roster)?.id ||
          null
        : null;

      // A. at_bats 挿入（DB統計SQLに100%対応する正規 resultCode を保存！）
      insertQueries.push(
        db.insert(atBats).values({
          id: atBatId,
          matchId: match.id,
          inning: ab.inning,
          isTop: ab.isTop,
          batterId: batterPlayerId,
          pitcherId: pitcherPlayerId,
          result: ab.resultCode,
        })
      );

      // B. 1球ごとの pitches 挿入（牽制球・バントファウルも区別して保存）
      const pitchIdByNum: Record<number, string> = {};
      let ballsBefore = 0;
      let strikesBefore = 0;

      ab.pitches.forEach((pCode, idx) => {
        const pitchNum = idx + 1;
        const pitchId = crypto.randomUUID();
        pitchIdByNum[pitchNum] = pitchId;

        const dbPitchResult =
          pCode === "in_play"
            ? "strike"
            : pCode === "hbp"
            ? "ball"
            : pCode;

        insertQueries.push(
          db.insert(pitches).values({
            id: pitchId,
            atBatId,
            pitchNumber: pitchNum,
            result: dbPitchResult,
            ballsBefore,
            strikesBefore,
          })
        );

        if (pCode === "ball") {
          ballsBefore = Math.min(3, ballsBefore + 1);
        } else if (
          pCode === "strike" ||
          pCode === "swinging_strike" ||
          pCode === "bunt_swinging" ||
          pCode === "bunt_foul"
        ) {
          strikesBefore = Math.min(2, strikesBefore + 1);
        } else if (pCode === "foul" && strikesBefore < 2) {
          strikesBefore += 1;
        }
      });

      // C. base_advances 挿入
      for (const adv of ab.advances) {
        const runnerId = isMyTeamBatting
          ? matchRosterPlayer(adv.runnerName, undefined, roster)?.id || null
          : null;

        const fromBaseNum =
          adv.from === "1B"
            ? 1
            : adv.from === "2B"
            ? 2
            : adv.from === "3B"
            ? 3
            : 0;
        const toBaseNum =
          adv.to === "1B"
            ? 1
            : adv.to === "2B"
            ? 2
            : adv.to === "3B"
            ? 3
            : 4;

        insertQueries.push(
          db.insert(baseAdvances).values({
            id: crypto.randomUUID(),
            matchId: match.id,
            atBatId,
            pitchId: adv.pitchNumber ? pitchIdByNum[adv.pitchNumber] || null : null,
            runnerId,
            fromBase: fromBaseNum,
            toBase: toBaseNum,
            reason: adv.method,
            isOut: adv.isOut,
          })
        );
      }

      // D. play_logs 挿入（タイムライン表示用に日本語表記と1球履歴テキストを格納）
      const inningText = `${ab.inning}回${ab.isTop ? "表" : "裏"}`;
      let realPitchSeq = 0;
      const pitchLines =
        ab.pitches.length > 0
          ? `\n===PITCHES===\n${ab.pitches
              .map((p) => {
                if (isPickoffPitch(p)) {
                  return `牽制: ${PITCH_DISPLAY_JA[p] || p}`;
                }
                if (p === "balk") {
                  return `ボーク: ${PITCH_DISPLAY_JA[p] || p}`;
                }
                realPitchSeq += 1;
                return `${realPitchSeq}球目: ${PITCH_DISPLAY_JA[p] || p}`;
              })
              .join("\n")}`
          : "";

      const countCalc = computeCountFromPitches(ab.pitches);
      const rbiSuffix = ab.rbi > 0 ? `（打点${ab.rbi}）` : "";
      const description = `${ab.battingOrder}番 ${ab.batterName || "打者"}: ${
        ab.resultLabel
      }${rbiSuffix}${pitchLines} [B:${countCalc.balls}, S:${countCalc.strikes}, O:${
        ab.outsInPlay
      }]`;

      const isHit =
        ab.resultCode === "single" ||
        ab.resultCode === "double" ||
        ab.resultCode === "triple" ||
        ab.resultCode === "home_run";
      const resultType = isHit
        ? "hit"
        : ab.runsInPlay > 0
        ? "score"
        : "out";

      const matchedIssue = allIssues.find((iss) => iss.atBatId === ab.id);
      const legacyValidationPayload = matchedIssue
        ? JSON.stringify({
            type: matchedIssue.severity === "error" ? "ERROR" : "WARNING",
            inning: ab.inning,
            isTop: ab.isTop,
            battingOrder: ab.battingOrder,
            message: matchedIssue.message,
          })
        : null;

      insertQueries.push(
        db.insert(playLogs).values({
          id: crypto.randomUUID(),
          matchId: match.id,
          atBatId,
          inningText,
          resultType,
          description,
          validationMessage: legacyValidationPayload,
          createdAt: new Date(baseTimestamp + seq * 1000),
        })
      );
    }

    if (insertQueries.length > 0) {
      await runBatchChunked(db, insertQueries);
    }

    // 4. 試合全体のイニング別スコア・安打数・エラー数を再集計して matches を更新
    //    （片面マージ保存の場合も、既存の反対側スコアを保持して正確に合算！）
    const prevMyScores = safeParseNumberArray(match.myInningScores);
    const prevOppScores = safeParseNumberArray(match.opponentInningScores);

    const maxInning = Math.max(
      1,
      prevMyScores.length,
      prevOppScores.length,
      ...incomingTop.map((a) => a.inning),
      ...incomingBottom.map((a) => a.inning),
      ...(body.topStructure?.innings.map((i) => i.inning) || []),
      ...(body.bottomStructure?.innings.map((i) => i.inning) || [])
    );

    const nextTopScores: number[] = [];
    const nextBottomScores: number[] = [];

    for (let inn = 1; inn <= maxInning; inn++) {
      if (includeTop) {
        const metaRun = body.topStructure?.innings.find((m) => m.inning === inn)?.runs;
        const eventRuns = incomingTop
          .filter((a) => a.inning === inn)
          .reduce((s, a) => s + a.runsInPlay, 0);
        nextTopScores.push(
          incomingTop.some((a) => a.inning === inn)
            ? eventRuns
            : metaRun ?? 0
        );
      } else {
        const preservedTop = isMyTeamFirst
          ? prevMyScores[inn - 1] ?? 0
          : prevOppScores[inn - 1] ?? 0;
        nextTopScores.push(preservedTop);
      }

      if (includeBottom) {
        const metaRun = body.bottomStructure?.innings.find((m) => m.inning === inn)?.runs;
        const eventRuns = incomingBottom
          .filter((a) => a.inning === inn)
          .reduce((s, a) => s + a.runsInPlay, 0);
        nextBottomScores.push(
          incomingBottom.some((a) => a.inning === inn)
            ? eventRuns
            : metaRun ?? 0
        );
      } else {
        const preservedBottom = isMyTeamFirst
          ? prevOppScores[inn - 1] ?? 0
          : prevMyScores[inn - 1] ?? 0;
        nextBottomScores.push(preservedBottom);
      }
    }

    const finalMyInnings = isMyTeamFirst ? nextTopScores : nextBottomScores;
    const finalOppInnings = isMyTeamFirst ? nextBottomScores : nextTopScores;
    const finalMyScore = finalMyInnings.reduce((s, n) => s + n, 0);
    const finalOppScore = finalOppInnings.reduce((s, n) => s + n, 0);

    // 全打席から安打数を再カウント
    const allMatchAtBats = await db
      .select({ isTop: atBats.isTop, result: atBats.result })
      .from(atBats)
      .where(eq(atBats.matchId, match.id))
      .all();

    const hitSet = new Set(["single", "1B", "double", "2B", "triple", "3B", "home_run", "HR"]);
    let topHits = 0;
    let bottomHits = 0;
    for (const r of allMatchAtBats) {
      if (r.result && hitSet.has(r.result)) {
        if (r.isTop) topHits += 1;
        else bottomHits += 1;
      }
    }

    const myHits = isMyTeamFirst ? topHits : bottomHits;
    const opponentHits = isMyTeamFirst ? bottomHits : topHits;

    await db
      .update(matches)
      .set({
        myScore: finalMyScore,
        opponentScore: finalOppScore,
        myInningScores: JSON.stringify(finalMyInnings),
        opponentInningScores: JSON.stringify(finalOppInnings),
        myHits,
        opponentHits,
        opponentLineup: updatedOpponentLineup,
        currentInning: maxInning,
        isBottom: false,
        status: "finished",
        scorebookValidations: JSON.stringify(allIssues),
      })
      .where(eq(matches.id, match.id));

    return c.json({
      success: true,
      summary: {
        matchId: match.id,
        savedAtBatsCount: combinedIncoming.length,
        savedPitchesCount: combinedIncoming.reduce(
          (sum, ab) =>
            sum + ab.pitches.filter((p) => !isNonPitchMoundEvent(p)).length,
          0
        ),
        myScore: finalMyScore,
        opponentScore: finalOppScore,
        myHits,
        opponentHits,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `保存エラー: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部ヘルパー関数群
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callGeminiStructuredJson<T>(
  apiKey: string,
  prompt: string,
  imageParts: GeminiContentPart[],
  mode: GeminiCallMode = "structure"
): Promise<T> {
  const attemptErrors: string[] = [];
  let sawQuota429 = false;
  let sawDemand503 = false;
  const overallStart = Date.now();
  const MAX_TOTAL_BUDGET_MS = 95_000;
  const rawConfigs = getGeminiModelConfigs(mode);

  const nowTs = Date.now();
  const readyConfigs: GeminiModelAttemptConfig[] = [];
  const coolingConfigs: Array<{ cfg: GeminiModelAttemptConfig; until: number }> =
    [];

  for (const cfg of rawConfigs) {
    const cd = MODEL_COOLDOWN_UNTIL.get(cfg.model);
    if (!cd || cd.until <= nowTs) {
      if (cd) MODEL_COOLDOWN_UNTIL.delete(cfg.model);
      readyConfigs.push(cfg);
    } else if (cd.status !== 404) {
      coolingConfigs.push({ cfg, until: cd.until });
    }
  }

  coolingConfigs.sort((a, b) => a.until - b.until);
  // 健全なモデルを最優先し、万一すべてクールダウン中だった場合のみ復帰が近い上位2モデルを試行する
  const orderedConfigs: GeminiModelAttemptConfig[] =
    readyConfigs.length > 0
      ? [
          ...readyConfigs,
          ...coolingConfigs
            .filter((x) => {
              const cd = MODEL_COOLDOWN_UNTIL.get(x.cfg.model);
              return cd?.status === 503;
            })
            .slice(0, 1)
            .map((x) => ({ ...x.cfg, backoffBeforeMs: 1_500 })),
        ]
      : coolingConfigs
          .slice(0, 2)
          .map((x, idx) => ({
            ...x.cfg,
            backoffBeforeMs: idx === 0 ? 1_200 : 2_000,
          }));

  const blockedInThisRequest = new Set<string>();

  for (let attemptIdx = 0; attemptIdx < orderedConfigs.length; attemptIdx++) {
    const cfg = orderedConfigs[attemptIdx];
    if (blockedInThisRequest.has(cfg.model)) {
      continue;
    }

    if (attemptIdx > 0 && cfg.backoffBeforeMs > 0) {
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, cfg.backoffBeforeMs + jitter));
    }

    const remainingBeforeStart =
      MAX_TOTAL_BUDGET_MS - (Date.now() - overallStart);
    if (remainingBeforeStart < 6_000) {
      break;
    }

    const attemptStart = Date.now();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const controller = new AbortController();
    let activeTimer: ReturnType<typeof setTimeout> | undefined;
    let abortReason = "";

    const scheduleWatchdog = (ms: number, reason: string) => {
      if (activeTimer !== undefined) {
        clearTimeout(activeTimer);
      }
      const totalLeft = Math.max(
        1_000,
        MAX_TOTAL_BUDGET_MS - (Date.now() - overallStart)
      );
      const boundedMs = Math.min(ms, totalLeft);
      const isTotalCap = totalLeft < ms;
      activeTimer = setTimeout(() => {
        abortReason = isTotalCap
          ? "全体制限時間到達"
          : `${reason} (${Math.round(boundedMs / 1000)}秒)`;
        controller.abort();
      }, boundedMs);
    };

    scheduleWatchdog(cfg.firstChunkTimeoutMs, "初動待機タイムアウト");

    try {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.05,
        responseMimeType: "application/json",
        mediaResolution: "MEDIA_RESOLUTION_HIGH",
      };
      if (cfg.thinkingMode === "level_high") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "HIGH",
        };
      } else if (cfg.thinkingMode === "level_medium") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "MEDIUM",
        };
      } else if (cfg.thinkingMode === "level_low") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "LOW",
        };
      } else if (cfg.thinkingMode === "budget") {
        generationConfig.thinkingConfig = {
          thinkingBudget: cfg.thinkingBudget ?? 1024,
        };
      }

      let res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }, ...imageParts],
            },
          ],
          generationConfig,
        }),
      });

      // 万一 mediaResolution や thinkingConfig パラメータ仕様差異で 400 が返った場合は非対応項目を除去して即座に同モデル再送
      if (!res.ok && res.status === 400) {
        const firstErrText = await res.text();
        const lowerErr = firstErrText.toLowerCase();
        const isConfigParamIssue =
          lowerErr.includes("thinking") ||
          lowerErr.includes("mediaresolution") ||
          lowerErr.includes("media_resolution");
        if (isConfigParamIssue) {
          scheduleWatchdog(cfg.firstChunkTimeoutMs, "初動待機タイムアウト");
          const fallbackGenConfig: Record<string, unknown> = {
            temperature: 0.05,
            responseMimeType: "application/json",
          };
          if (
            !lowerErr.includes("mediaresolution") &&
            !lowerErr.includes("media_resolution")
          ) {
            fallbackGenConfig.mediaResolution = "MEDIA_RESOLUTION_HIGH";
          }
          res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }, ...imageParts],
                },
              ],
              generationConfig: fallbackGenConfig,
            }),
          });
        } else {
          attemptErrors.push(`[${cfg.model}: リクエスト形式エラー(400)]`);
          blockedInThisRequest.add(cfg.model);
          continue;
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 404) {
          blockedInThisRequest.add(cfg.model);
          MODEL_COOLDOWN_UNTIL.set(cfg.model, {
            until: Date.now() + 60 * 60_000,
            status: 404,
          });
          attemptErrors.push(`[${cfg.model}: 未提供(404)]`);
          continue;
        }

        if (res.status === 429) {
          sawQuota429 = true;
          blockedInThisRequest.add(cfg.model);
          const retryMatch = errText.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
          const parsedSec = retryMatch ? Number(retryMatch[1]) : 0;
          const isDailyOrZero =
            /PerDay|exceeded your current quota/i.test(errText) &&
            parsedSec === 0;
          const cooldownMs = isDailyOrZero
            ? 3 * 60_000
            : Math.min(180_000, Math.max(45_000, parsedSec * 1_000 || 60_000));
          MODEL_COOLDOWN_UNTIL.set(cfg.model, {
            until: Date.now() + cooldownMs,
            status: 429,
          });
          attemptErrors.push(`[${cfg.model}: 利用枠上限(429)]`);
          continue;
        }

        if (res.status >= 500) {
          sawDemand503 = true;
          MODEL_COOLDOWN_UNTIL.set(cfg.model, {
            until: Date.now() + 20_000,
            status: res.status,
          });
          attemptErrors.push(`[${cfg.model}: サーバー混雑(${res.status})]`);
          continue;
        }

        const shortMsg = errText.replace(/\s+/g, " ").slice(0, 90);
        attemptErrors.push(`[${cfg.model}: HTTP ${res.status} ${shortMsg}]`);
        if (res.status === 400 || res.status === 408) {
          continue;
        }
        throw new Error(attemptErrors.join(" / "));
      }

      MODEL_COOLDOWN_UNTIL.delete(cfg.model);

      let sawCandidateChunk = false;
      let sawTextChunk = false;

      const { text, finishReason } = await readGeminiSseResponse(res, {
        onCandidateChunk: () => {
          if (!sawCandidateChunk) {
            sawCandidateChunk = true;
            if (!sawTextChunk) {
              const elapsedAttempt = Date.now() - attemptStart;
              const leftForText = Math.max(
                7_000,
                cfg.firstTextTimeoutMs - elapsedAttempt
              );
              scheduleWatchdog(leftForText, "思考フェーズ超過");
            }
          }
        },
        onTextChunk: () => {
          sawTextChunk = true;
          // 本文トークンが流れている間はチャンク間14秒のアイドル監視のみに切り替え、生成途中の切断を防ぐ
          scheduleWatchdog(14_000, "ストリーム無応答");
        },
      });

      if (!text.trim()) {
        attemptErrors.push(
          `[${cfg.model}] 応答が空でした (finishReason: ${finishReason})`
        );
        continue;
      }

      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```[a-zA-Z0-9]*\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
      }

      try {
        return JSON.parse(cleaned) as T;
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : String(parseErr);
        attemptErrors.push(
          `[${cfg.model}] JSON解析失敗 (${finishReason}): ${msg}`
        );
        continue;
      }
    } catch (err) {
      if (controller.signal.aborted) {
        attemptErrors.push(
          `[${cfg.model}] ${abortReason || "応答タイムアウト"}`
        );
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      attemptErrors.push(`[${cfg.model}] ${msg}`);
      continue;
    } finally {
      if (activeTimer !== undefined) {
        clearTimeout(activeTimer);
      }
    }
  }

  if (sawQuota429 && !sawDemand503) {
    throw new Error(
      `Gemini APIの利用枠上限（429 Quota Exceeded）に達しました。30〜60秒ほど待ってから再度お試しいただくか、Google AI Studioの利用枠（Free Tier / Billing設定）をご確認ください。 ${attemptErrors.join(
        " "
      )}`
    );
  }

  if (sawQuota429 && sawDemand503) {
    throw new Error(
      `AIモデルの一時混雑（503）および一部モデルの利用枠上限（429）が重なりました。30秒ほど置いてからもう一度お試しください。 ${attemptErrors.join(
        " "
      )}`
    );
  }

  throw new Error(
    attemptErrors.join(" / ") ||
      "AIサーバーが一時的に大変混雑しています。数秒置いてもう一度ボタンを押してください。"
  );
}

interface SseStreamCallbacks {
  onCandidateChunk?: () => void;
  onTextChunk?: () => void;
}

async function readGeminiSseResponse(
  res: Response,
  callbacks?: SseStreamCallbacks
): Promise<{ text: string; finishReason: string }> {
  if (!res.body) {
    const raw = await res.text();
    const parsed = parseGeminiRawOrSseText(raw);
    if (parsed.text) {
      callbacks?.onCandidateChunk?.();
      callbacks?.onTextChunk?.();
    }
    return parsed;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let rawAll = "";
  let assembledText = "";
  let finishReason = "UNKNOWN";

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload) as GeminiApiResponse;
      const cand = parsed.candidates?.[0];
      if (cand) {
        callbacks?.onCandidateChunk?.();
      }
      if (cand?.finishReason) {
        finishReason = cand.finishReason;
      }
      const parts = cand?.content?.parts || [];
      for (const p of parts) {
        if (!p.thought && typeof p.text === "string" && p.text.length > 0) {
          assembledText += p.text;
          callbacks?.onTextChunk?.();
        }
      }
    } catch {
      // partial or non-json line ignored
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunkStr = decoder.decode(value, { stream: true });
    rawAll += chunkStr;
    sseBuffer += chunkStr;
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";
    for (const ln of lines) {
      processLine(ln);
    }
  }

  const tail = decoder.decode();
  if (tail) {
    rawAll += tail;
    sseBuffer += tail;
  }
  if (sseBuffer) {
    for (const ln of sseBuffer.split("\n")) {
      processLine(ln);
    }
  }

  if (!assembledText && rawAll.trim().startsWith("{")) {
    return parseGeminiRawOrSseText(rawAll);
  }

  return { text: assembledText, finishReason };
}

function parseGeminiRawOrSseText(
  raw: string
): { text: string; finishReason: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as GeminiApiResponse;
      const cand = parsed.candidates?.[0];
      const text = (cand?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text || "")
        .join("");
      return { text, finishReason: cand?.finishReason || "UNKNOWN" };
    } catch {
      // fall through
    }
  }
  return { text: "", finishReason: "UNKNOWN" };
}

async function resolveLegendImagePart(
  c: { env: WorkerEnv; req: { url: string } },
  db: ReturnType<typeof drizzle>,
  teamId: string,
  overrideBase64?: string,
  overrideMimeType?: string
): Promise<GeminiInlineDataPart | null> {
  if (overrideBase64) {
    return {
      inlineData: {
        mimeType: overrideMimeType || "image/jpeg",
        data: overrideBase64,
      },
    };
  }

  try {
    const team = await db
      .select({ scorebookLegendUrl: teams.scorebookLegendUrl })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const legendUrl = team?.scorebookLegendUrl;
    if (!legendUrl) return null;

    if (legendUrl.startsWith("data:")) {
      const [header, b64] = legendUrl.split(",");
      const mimeMatch = header?.match(/data:(.*?);/);
      if (b64 && b64.length <= 3_200_000) {
        return {
          inlineData: {
            mimeType: mimeMatch ? mimeMatch[1] : "image/png",
            data: b64.trim(),
          },
        };
      }
      return null;
    }

    const marker = "/api/images/";
    const idx = legendUrl.indexOf(marker);
    if (idx !== -1 && c.env.BUCKET) {
      const r2Key = legendUrl.slice(idx + marker.length);
      const obj = await c.env.BUCKET.get(r2Key);
      if (obj) {
        const buf = await obj.arrayBuffer();
        if (buf.byteLength <= 2_500_000) {
          return {
            inlineData: {
              mimeType: obj.httpMetadata?.contentType || "image/png",
              data: arrayBufferToBase64(buf),
            },
          };
        }
        return null;
      }
    }

    const targetUrl = legendUrl.startsWith("/")
      ? `${new URL(c.req.url).origin}${legendUrl}`
      : legendUrl;
    const res = await fetch(targetUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength <= 2_500_000) {
        return {
          inlineData: {
            mimeType: res.headers.get("content-type") || "image/png",
            data: arrayBufferToBase64(buf),
          },
        };
      }
    }
  } catch (err) {
    console.warn("[LiffScorebookV2] Legend load skipped:", err);
  }

  return null;
}

function inferPickoffCodeFromContext(
  advances?: ScorebookV2Advance[],
  activeBases?: Record<"1B" | "2B" | "3B", boolean>
): CanonicalPitchResult {
  const poAdv = advances?.find(
    (a) => a.method === "pickoff_out" || a.method === "pickoff_error"
  );
  if (poAdv) {
    if (poAdv.from === "1B") return "pickoff_1b";
    if (poAdv.from === "2B") return "pickoff_2b";
    if (poAdv.from === "3B") return "pickoff_3b";
  }

  if (activeBases) {
    const occupied: Array<"1B" | "2B" | "3B"> = [];
    if (activeBases["1B"]) occupied.push("1B");
    if (activeBases["2B"]) occupied.push("2B");
    if (activeBases["3B"]) occupied.push("3B");
    if (occupied.length === 1) {
      if (occupied[0] === "1B") return "pickoff_1b";
      if (occupied[0] === "2B") return "pickoff_2b";
      if (occupied[0] === "3B") return "pickoff_3b";
    }
  }

  return "pickoff";
}

function normalizePitchArray(
  rawPitches: string[],
  resultCode: CanonicalAtBatResult,
  advances?: ScorebookV2Advance[],
  activeBases?: Record<"1B" | "2B" | "3B", boolean>
): CanonicalPitchResult[] {
  const mapped: CanonicalPitchResult[] = [];
  const contextualPickoff = inferPickoffCodeFromContext(advances, activeBases);

  for (const raw of rawPitches) {
    const s = (raw || "").trim().toLowerCase();
    if (!s) continue;

    if (
      s === "bunt_foul" ||
      s === "bf" ||
      s === "▲" ||
      s === "▼" ||
      s.includes("バントファウル") ||
      s.includes("バントf") ||
      s.includes("スリーバント")
    ) {
      mapped.push("bunt_foul");
    } else if (
      s === "bunt_swinging" ||
      s === "bs" ||
      s.includes("バント空")
    ) {
      mapped.push("bunt_swinging");
    } else if (
      s === "balk" ||
      s === "bk" ||
      s.includes("ボーク")
    ) {
      mapped.push("balk");
    } else if (
      s === "pickoff_1b" ||
      s === "p1" ||
      s === "k1" ||
      s === "1" ||
      s.includes("1塁牽") ||
      s.includes("１塁牽") ||
      s.includes("一塁牽") ||
      s.includes("牽1") ||
      s.includes("一牽")
    ) {
      mapped.push("pickoff_1b");
    } else if (
      s === "pickoff_2b" ||
      s === "p2" ||
      s === "k2" ||
      s === "2" ||
      s.includes("2塁牽") ||
      s.includes("２塁牽") ||
      s.includes("二塁牽") ||
      s.includes("牽2") ||
      s.includes("二牽")
    ) {
      mapped.push("pickoff_2b");
    } else if (
      s === "pickoff_3b" ||
      s === "p3" ||
      s === "k3" ||
      s === "3" ||
      s.includes("3塁牽") ||
      s.includes("３塁牽") ||
      s.includes("三塁牽") ||
      s.includes("牽3") ||
      s.includes("三牽")
    ) {
      mapped.push("pickoff_3b");
    } else if (s === "pickoff" || s === "p" || s === "k" || s.includes("牽")) {
      mapped.push(contextualPickoff);
    } else if (s === "ball" || s === "b" || s.includes("ボール")) {
      mapped.push("ball");
    } else if (
      s === "swinging_strike" ||
      s === "w" ||
      s.includes("空振") ||
      s.includes("swing")
    ) {
      mapped.push("swinging_strike");
    } else if (
      s === "strike" ||
      s === "s" ||
      s.includes("見逃") ||
      s.includes("ストライク")
    ) {
      mapped.push("strike");
    } else if (s === "foul" || s === "f" || s.includes("ファウル")) {
      mapped.push("foul");
    } else if (s === "hbp" || s === "d" || s.includes("死球")) {
      mapped.push("hbp");
    } else if (
      s === "hit" ||
      s === "h" ||
      s.includes("安") ||
      s.includes("ヒット")
    ) {
      mapped.push("hit");
    } else if (
      s === "in_play" ||
      s === "x" ||
      s.includes("インプレー")
    ) {
      mapped.push("in_play");
    }
  }

  const isHitResult =
    resultCode === "single" ||
    resultCode === "double" ||
    resultCode === "triple" ||
    resultCode === "home_run";
  const isInPlayOutOrReach =
    resultCode === "groundout" ||
    resultCode === "flyout" ||
    resultCode === "infield_fly" ||
    resultCode === "double_play" ||
    resultCode === "triple_play" ||
    resultCode === "sac_bunt" ||
    resultCode === "sac_fly" ||
    resultCode === "interference" ||
    resultCode === "interference_out" ||
    resultCode === "error" ||
    resultCode === "fc";

  // 投球配列が空の場合の最低限の補完、または末尾球の整合性補正
  if (mapped.length === 0) {
    if (resultCode === "intentional_walk") return [];
    if (isHitResult) return ["hit"];
    if (isInPlayOutOrReach) return ["in_play"];
    if (resultCode === "walk") return ["ball", "ball", "ball", "ball"];
    if (resultCode === "hit_by_pitch") return ["hbp"];
    if (
      resultCode === "strikeout" ||
      resultCode === "dropped_third_strike_out" ||
      resultCode === "dropped_third_strike"
    ) {
      return ["strike", "strike", "swinging_strike"];
    }
    if (
      resultCode === "other" &&
      advances?.some(
        (a) => a.method === "pickoff_out" || a.method === "pickoff_error"
      )
    ) {
      return [contextualPickoff];
    }
    if (resultCode === "other" && advances?.some((a) => a.method === "balk")) {
      return ["balk"];
    }
    return [];
  }

  const last = mapped[mapped.length - 1];
  if (isHitResult && last !== "hit") {
    if (last === "in_play") {
      mapped[mapped.length - 1] = "hit";
    } else {
      mapped.push("hit");
    }
  } else if (isInPlayOutOrReach && last !== "in_play" && last !== "hit") {
    mapped.push("in_play");
  }

  return mapped;
}

function normalizeFromBase(raw?: string): "BAT" | "1B" | "2B" | "3B" {
  const u = (raw || "").toUpperCase().trim();
  if (u === "1B" || u === "1") return "1B";
  if (u === "2B" || u === "2") return "2B";
  if (u === "3B" || u === "3") return "3B";
  return "BAT";
}

function normalizeToBase(raw?: string): "1B" | "2B" | "3B" | "HP" {
  const u = (raw || "").toUpperCase().trim();
  if (u === "1B" || u === "1") return "1B";
  if (u === "2B" || u === "2") return "2B";
  if (u === "3B" || u === "3") return "3B";
  return "HP";
}

function normalizeAdvanceMethod(raw?: string): AdvanceMethodCode {
  const s = (raw || "").trim();
  const u = s.toUpperCase();
  if (u === "STEAL" || u === "S" || (s.includes("盗塁") && !s.includes("死"))) {
    return "steal";
  }
  if (u === "CAUGHT_STEALING" || u === "CS" || s.includes("盗塁死")) {
    return "caught_stealing";
  }
  if (u === "PICKOFF_OUT" || u === "PO" || s.includes("牽制死") || s.includes("牽死")) {
    return "pickoff_out";
  }
  if (u === "PICKOFF_ERROR" || s.includes("牽制悪送球")) {
    return "pickoff_error";
  }
  if (u === "WP" || s.includes("暴投")) return "wp";
  if (u === "PB" || s.includes("捕逸") || s.includes("パスボール")) return "pb";
  if (u === "BALK" || u === "BK" || s.includes("ボーク")) return "balk";
  if (u === "OBSTRUCTION" || u === "OBS" || s.includes("走塁妨害") || s.includes("オブストラクション")) {
    return "obstruction";
  }
  if (u === "INTERFERENCE_OUT" || u === "INT" || s.includes("守備妨害") || s.includes("インターフェア")) {
    return "interference_out";
  }
  if (u === "APPEAL_OUT" || s.includes("アピール") || s.includes("離塁") || s.includes("踏み忘れ")) {
    return "appeal_out";
  }
  if (u === "TIEBREAK" || u === "TB" || s.includes("タイブレーク")) {
    return "tiebreak";
  }
  if (u === "THROW_ADVANCE" || u === "T" || u === "(T)" || s.includes("送球間")) {
    return "throw_advance";
  }
  if (u === "WALK" || u === "BB" || s.includes("四球") || s.includes("死球") || s.includes("押出")) {
    return "walk";
  }
  if (u === "ERROR" || u.startsWith("E") || s.includes("失策") || s.includes("エラー")) {
    return "error";
  }
  if (u === "FC" || u === "OB" || u === "O.B." || s.includes("野選")) return "fc";
  if (u === "SAC" || s.includes("犠") || s.includes("タッチアップ")) return "sac";
  if (u === "OUT_ON_BASE" || u === "TO" || s.includes("走塁死") || s.includes("封殺") || s.includes("挟殺")) {
    return "out_on_base";
  }
  if (u === "HIT" || s.includes("安") || s.includes("ヒット") || s.includes("本塁打")) {
    return "hit";
  }
  return "other";
}

function sanitizeBox(
  ymin?: number,
  xmin?: number,
  ymax?: number,
  xmax?: number
): NormalizedBox | undefined {
  if (
    typeof ymin !== "number" ||
    typeof xmin !== "number" ||
    typeof ymax !== "number" ||
    typeof xmax !== "number"
  ) {
    return undefined;
  }
  const y1 = Math.max(0, Math.min(1000, Math.round(ymin)));
  const x1 = Math.max(0, Math.min(1000, Math.round(xmin)));
  const y2 = Math.max(y1 + 10, Math.min(1000, Math.round(ymax)));
  const x2 = Math.max(x1 + 10, Math.min(1000, Math.round(xmax)));
  return [y1, x1, y2, x2];
}

function safeParseNumberArray(jsonStr: string | null | undefined): number[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((v) => (typeof v === "number" ? v : Number(v) || 0));
    }
  } catch {
    // ignore invalid json
  }
  return [];
}

async function deleteByAtBatIdsChunked(
  db: ReturnType<typeof drizzle>,
  atBatIds: string[]
): Promise<void> {
  const idChunkSize = 40;
  for (let i = 0; i < atBatIds.length; i += idChunkSize) {
    const slice = atBatIds.slice(i, i + idChunkSize);
    await db.delete(pitches).where(inArray(pitches.atBatId, slice));
    await db.delete(baseAdvances).where(inArray(baseAdvances.atBatId, slice));
    await db.delete(playLogs).where(inArray(playLogs.atBatId, slice));
    await db.delete(atBats).where(inArray(atBats.id, slice));
  }
}

async function runBatchChunked(
  db: ReturnType<typeof drizzle>,
  queries: Array<unknown>
): Promise<void> {
  const chunkSize = 70;
  for (let i = 0; i < queries.length; i += chunkSize) {
    const chunk = queries.slice(i, i + chunkSize);
    if (chunk.length > 0) {
      await db.batch(chunk as unknown as Parameters<typeof db.batch>[0]);
    }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default liffScorebookRouter;

