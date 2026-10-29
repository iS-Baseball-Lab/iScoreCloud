// filepath: src/api/liff/scorebook.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureMatchLineupColumns } from "@/lib/db-helper";
import { harmonizeOcrFieldingAndLabel } from "@/lib/liff/scorebook-fielding";
import {
  getCellQuadInStructure,
  quadToBoundingBox,
  resolveStructureGridCorners,
  sanitizeGridCorners,
  syncStructureBoxesFromCorners,
} from "@/lib/liff/scorebook-grid";
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
  type ScorebookGridCorners,
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
  ymin?: number;
  ymax?: number;
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
  lineupRightX?: number;
  gridCorners?: {
    tl?: number[];
    tr?: number[];
    br?: number[];
    bl?: number[];
  };
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
  inning?: number | string;
  i?: number | string;
  columnIndex?: number | string;
  c?: number | string;
  battingOrder?: number | string;
  bo?: number | string;
  batterName?: string;
  b?: string;
  pitcherName?: string;
  pt?: string;
  /** 1マス内3ゾーン（左BSO欄・中央アウト記号・本一塁線・右下打球記号）の視覚観察メモ */
  obs?: string;
  /** ダイヤモンド右下辺（本塁→1塁）に手書きの実線・赤線が引かれているか（true=1塁到達出塁, false=点線のまま未出塁） */
  b1?: boolean;
  resultCode?: string;
  rc?: string;
  resultLabel?: string;
  rl?: string;
  battedDirection?: string;
  dir?: string;
  rbi?: number | string;
  outsInPlay?: number | string;
  o?: number | string;
  endingOuts?: number | string;
  eo?: number | string;
  runsInPlay?: number | string;
  ru?: number | string;
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

function toFiniteInt(
  val: number | string | undefined | null,
  fallback?: number
): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
  }
  return fallback;
}

interface RawGeminiChunkResponse {
  atBats?: RawGeminiAtBat[];
  ab?: RawGeminiAtBat[];
}

type GeminiCallMode = "structure" | "chunk";

interface GeminiModelAttemptConfig {
  model: string;
  /** HTTP接続〜最初のSSEチャンク（思考チャンクまたは本文チャンク）到達までの最大待機ミリ秒 */
  firstResponseTimeoutMs: number;
  /** 思考開始後、非思考の本文JSONテキストが出始めるまでの最大待機ミリ秒 */
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
 * - 廃止・無料枠ゼロ・404のモデル（旧2.5系 / 3.5-flash / gemini-flash-latest / gemini-3.8-flash-lite）を完全排除
 * - 実稼働確認済みの独立クォータ枠＆サービングプールを順に試行:
 *   1. gemini-3.8-flash (最新フラッグシップFlash・MEDIUM思考で高速高精度)
 *   2. gemini-3.6-flash (安定ワークホースFlash・独立クォータ枠)
 *   3. gemini-3.5-flash-lite (高速・大容量クォータ枠)
 *   4. gemini-3.1-flash-lite (3.1系独立クォータ枠)
 *   5. gemini-flash-lite-latest (最新Lite動的エイリアス安全網)
 */
function getGeminiModelConfigs(
  mode: GeminiCallMode
): readonly GeminiModelAttemptConfig[] {
  const isDeepChunk = mode === "chunk";
  return [
    {
      model: "gemini-3.8-flash",
      firstResponseTimeoutMs: isDeepChunk ? 42_000 : 40_000,
      firstTextTimeoutMs: isDeepChunk ? 70_000 : 56_000,
      thinkingMode: isDeepChunk ? "level_high" : "level_medium",
      backoffBeforeMs: 0,
    },
    {
      model: "gemini-3.6-flash",
      firstResponseTimeoutMs: isDeepChunk ? 40_000 : 38_000,
      firstTextTimeoutMs: isDeepChunk ? 66_000 : 54_000,
      thinkingMode: isDeepChunk ? "level_high" : "level_medium",
      backoffBeforeMs: 250,
    },
    {
      model: "gemini-3.5-flash-lite",
      firstResponseTimeoutMs: 34_000,
      firstTextTimeoutMs: isDeepChunk ? 50_000 : 46_000,
      thinkingMode: "level_medium",
      backoffBeforeMs: 250,
    },
    {
      model: "gemini-3.1-flash-lite",
      firstResponseTimeoutMs: 32_000,
      firstTextTimeoutMs: isDeepChunk ? 48_000 : 44_000,
      thinkingMode: "level_medium",
      backoffBeforeMs: 250,
    },
    {
      model: "gemini-flash-lite-latest",
      firstResponseTimeoutMs: 28_000,
      firstTextTimeoutMs: 40_000,
      thinkingMode: "level_low",
      backoffBeforeMs: 300,
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
      "・画像1: 外周4辺に『0〜1000の座標目盛りルーラー』（上下辺＝水色X座標、左右辺＝緑色Y座標）が付いたスコアブック片面全体画像（※lineupRightX・各打順行のymin/ymax・各イニング列のxmin/xmaxは、推測ではなく必ずこの外周ルーラーの目盛り数値を直接読み取って出力してください！）",
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
   - **先発と途中交代・守備位置変更（substitutions）の完全抽出**:
     - 各打順枠が上下2〜3段に分かれている場合、**一番上の段が先発選手（starter）**です。
     - 2段目・3段目に別の選手名が手書きされている場合は substitutions 配列に追加し、シート1全体の打席グリッド内の交代線（波線・二重線・斜線・『PH』『PR』表記）があるイニング列から出場イニング（inningEntered: 1以上の整数）、種別（"PH"=代打, "PR"=代走, "DEF"=守備交代）、および交代後の守備位置（position: "1"〜"9" または "D"）を特定してください。
     - **🔥重要（スタメン野手のマウンド登板・守備位置変更）**: 草野球・学童野球では新しい控え選手が出るのではなく、スタメン選手の守備位置欄が『6→1』『8/1』『投』のように途中イニングから変更（特に "1"=投手への継投変更！）されるケースが多発します。守備位置欄に複数の守備番号や矢印がある場合も、必ずその選手名で substitutions に {"inningEntered":交代回,"subType":"DEF","name":"その選手名","uniformNumber":"背番号","position":"変更後の守備番号"} を追加してください！空欄の段は出力しないでください。
   - **🔥外周ルーラー直読による精密グリッド座標（lineupRightX, ymin, ymax）の抽出**:
     - 画像1の外周4辺には **0〜1000 の目盛りルーラー** が付いています。直感で推測せず、**印刷された罫線が外周ルーラーにぶつかる目盛り数値**を直接読み取ってください！
     - **lineupRightX**: 左側の「選手氏名欄」と「1回」の打席列を隔てる縦罫線の上下端ルーラーX値（日本のスコアブックでは選手氏名欄まで含めると通常 **250〜400** 前後になります。背番号欄の手前で切らず、必ず『1回』の列の左端縦線のX目盛りを読んでください！）。
     - **batters[].ymin / ymax**: 画像1の左右端ルーラー（緑色目盛り）を見て、1番打者〜最終打者の各打順枠を区切る水平罫線の正確な Y目盛り値（上端 ymin、下端 ymax）を出力してください（隣接する打順の ymax と次の ymin は同じ水平罫線の値になります）。

2. **登板投手（pitchers）の敵味方検証と「投手交代（継投）」の高精度抽出**:
   - このシートの打者たちに対して投げた**守備側チームのピッチャー**を登板順（order: 1, 2, 3...）に漏れなく抽出してください。
   - **⚠️スコアブック様式による投手欄の取り違え防止（超重要）**:
     下部/右下の投手欄に書かれた投手名が、**このページの打順（batters）にいる選手（特に先発 position:"1" や途中 position:"1" の選手）と同一人物である場合、それは攻撃チーム自身の投手成績欄なので、相手投手として pitchers に入れてはいけません！** その場合は打席グリッド内の相手投手メモを探すか、無ければ pitchers: [] を返してください（反対側シートから自動補完されます）。
   - **🔥投手交代のイニング換算ルール（超重要・誤読頻発ポイント）**:
     1) 投手成績欄が複数行ある場合、1行目が先発（order:1）、2行目が2番手（order:2）、3行目が3番手（order:3）です。全行を漏れなく読み取ってください！
     2) 投手成績欄の「投球回数（回）」に書かれた数字（例: 1人目 "4"、2人目 "2"、3人目 "1"）は**「投げたイニング数（期間）」であり、終了イニング番号ではありません！** 必ず上から累積計算し、「1人目: fromInning:1, toInning:4」「2人目: fromInning:5, toInning:6」「3人目: fromInning:7, toInning:7」のように変換してください！
     3) 「3回 1/3」と「2回 2/3」のように端数（1/3, 2/3）がある場合や、画像1の打席グリッド内でイニング途中の打席間に**横波線（〜〜）・二重横線（══）・赤横線**の投手交代線がある場合は、交代が発生したイニングを両方の投手に含めて「1人目: fromInning:1, toInning:4」「2人目: fromInning:4, toInning:6」のように交代回を重ねて出力してください！

3. **イニング構造・複数列（2列・3列以上）・原本の傾き4隅座標（gridCorners）・手書き数値の三重照合**:
   - 各縦列の**最上部に印字・手書きされているイニング見出し番号（1, 2, 3...）**を必ず確認してください（拡大画像の上段参照）。
   - **🔥1イニング2列・3列以上（columnCount: 2, 3, 4...）の厳密判定**:
     - 打者一巡（10〜18打席）すると右隣の2列目へ、猛攻で二巡（19〜27打席）するとさらに3列目へ同じイニングが折り返して記録されます（列最上部の見出し番号が同じ回に書き直されている、または1列目で3アウト『③』やローマ数字『Ⅲ』になる前に下端・一巡して右隣列へ続いている状態）。また「9番の下端まで行ったら1番からすぐ2列目の上端へ移る書き方」でも2列使用になります。
     - **野球の数学検算**: 通常の9人打順・3アウト交代回では、**7点以上（7得点＋3アウト＝最低10打席）なら必ず columnCount: 2 以上**、**16点以上なら必ず columnCount: 3 以上**になります！該当する回は右隣の2列目・3列目まで同じイニングが続いていないか必ず確認し、1つのイニング要素にまとめて正確な **columnCount（2, 3, 4...）** を出力してください（後続のイニング番号が絶対にズレないよう見出し番号と照合すること）。
   - 試合が行われていない空白のイニング列（最終回より右側の空列や、右端の打数・安打集計列）は絶対に出力しないでください。
   - **手書き数字（得点 runs / 安打 hits）の厳密照合**:
     各回の得点（runs）は、①上部スコアボードの数字、②各列最下部の得点計、③その回のマス内の本塁生還印（●や赤塗りダイヤ）の個数の**3箇所を突き合わせて完全一致**させてください（"0" と "6"、"1" と "7"、"2" と "3"、バツ印 "×"＝後攻サヨナラ/コールド等の見間違いに注意）。
   - **🔥原本の傾き・台形歪みに対応する打席グリッド外枠4隅（gridCorners）の直読**:
     スマホ撮影で原本が少し斜めに傾いていたり台形に歪んでいる場合でも1マスを正確に切り抜けるよう、画像1の外周ルーラー（0〜1000）から「打席グリッド全体（横は1回の左端罫線〜最終プレイ回の最終列右端罫線、縦は1番打者の上端罫線〜最終打順の下端罫線）」の**実際の印刷交点4隅 [x, y]** を gridCorners に出力してください:
     - tl: 左上交点 [x, y]（1回左端 × 1番上端）
     - tr: 右上交点 [x, y]（最終プレイ回右端 × 1番上端 ※原本が右上がり/右下がりなら tl と tr の y が異なる値になります）
     - br: 右下交点 [x, y]（最終プレイ回右端 × 最終打順下端）
     - bl: 左下交点 [x, y]（1回左端 × 最終打順下端 ※台形歪みがあれば tl と bl の x が異なる値になります）
   - **各イニング列のルーラー座標 (ymin, xmin, ymax, xmax)**:
     画像1の上下端Xルーラーと左右端Yルーラーを読み取り、**1回の xmin は必ず lineupRightX と一致**させ、隣り合うイニングの xmax と次イニングの xmin が正確に同じ縦罫線の目盛り値を指すように出力してください（ymin は1番打者の上端、ymax は最終打者の下端）。

【出力JSONフォーマット（以下の厳密なキー構造のJSONオブジェクトのみを返してください）】
{"lineupRightX":320,"gridCorners":{"tl":[320,205],"tr":[815,205],"br":[815,808],"bl":[320,808]},"batters":[{"battingOrder":1,"name":"選手名","uniformNumber":"10","position":"6","ymin":205,"ymax":272,"substitutions":[{"inningEntered":5,"subType":"PH","name":"交代選手名","uniformNumber":"24","position":"7"}]}],"pitchers":[{"order":1,"name":"先発投手名","uniformNumber":"18","fromInning":1,"toInning":4},{"order":2,"name":"救援投手名","uniformNumber":"11","fromInning":5,"toInning":7}],"innings":[{"inning":1,"columnCount":1,"runs":0,"hits":1,"ymin":205,"xmin":320,"ymax":808,"xmax":376}],"totalRuns":0,"totalHits":1,"totalErrors":0}
※余分な説明文やMarkdownコードブロックは一切付けず、1行のコンパクトなJSON文字列のみを出力してください。`;

    const raw = await callGeminiStructuredJson<RawGeminiStructureResponse>(
      apiKey,
      prompt,
      imageParts,
      "structure"
    );

    const rawLineupRightX =
      typeof raw.lineupRightX === "number" &&
      raw.lineupRightX >= 140 &&
      raw.lineupRightX <= 460
        ? Math.round(raw.lineupRightX)
        : undefined;

    const maxInningFromSheet =
      (raw.innings || []).reduce((mx, cur) => Math.max(mx, cur.inning || 1), 0) ||
      match.innings ||
      7;

    // 打順データの正規化＆自チーム選手名鑑自動リンク
    const rawBatters = Array.isArray(raw.batters) ? raw.batters : [];
    const normalizedBatters: ScorebookBatterSlot[] = rawBatters.map((b, idx) => {
      const order = b.battingOrder || idx + 1;
      const normPos = normalizePositionCode(b.position);
      const rawUniform = (b.uniformNumber || "").trim();
      const matched = isMyTeamBatting
        ? matchRosterPlayer(b.name, rawUniform, roster)
        : null;

      // 背番号欄が空欄のときに守備位置番号(1〜9)を誤転記するケースの防止
      const cleanedUniform =
        !matched &&
        rawUniform === normPos &&
        /^[1-9]$/.test(rawUniform) &&
        rawBatters.every(
          (other) =>
            !other.uniformNumber ||
            other.uniformNumber.trim() === normalizePositionCode(other.position)
        )
          ? ""
          : rawUniform;

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

      const rowBox =
        typeof b.ymin === "number" &&
        typeof b.ymax === "number" &&
        b.ymax > b.ymin + 12
          ? sanitizeBox(b.ymin, 0, b.ymax, rawLineupRightX ?? 210)
          : undefined;

      return {
        battingOrder: order,
        name: matched ? matched.name : (b.name || "").trim(),
        uniformNumber: matched ? matched.uniformNumber : cleanedUniform,
        position:
          normPos ||
          (matched?.primaryPosition
            ? normalizePositionCode(matched.primaryPosition)
            : ""),
        playerId: matched ? matched.id : null,
        substitutions: subs,
        rowBox,
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

    // 攻撃チーム自身の投手（先発 position==="1" または途中交代 position==="1"）を相手投手として誤抽出していないかチェック
    // ※同姓の別選手が相手チームにいるケースを守るため、背番号が両方あり異なる場合は除外しない
    const ownBattingSidePitchers = [
      ...normalizedBatters
        .filter((b) => b.position === "1" && b.name.trim() !== "")
        .map((b) => ({
          cleanName: b.name.replace(/\s+/g, ""),
          uniform: b.uniformNumber.trim(),
        })),
      ...normalizedBatters.flatMap((b) =>
        b.substitutions
          .filter((s) => s.position === "1" && s.name.trim() !== "")
          .map((s) => ({
            cleanName: s.name.replace(/\s+/g, ""),
            uniform: s.uniformNumber.trim(),
          }))
      ),
    ];

    const rawPitchers = (Array.isArray(raw.pitchers) ? raw.pitchers : []).filter(
      (p) => {
        const cleanPName = (p.name || "").replace(/\s+/g, "");
        if (!cleanPName) return false;
        const pUniform = (p.uniformNumber || "").trim();
        const isSameAsOwnPitcher = ownBattingSidePitchers.some(
          (own) =>
            own.cleanName === cleanPName &&
            (!own.uniform || !pUniform || own.uniform === pUniform)
        );
        if (isSameAsOwnPitcher) {
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

    const initialPitchers: ScorebookPitcherStint[] =
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

    const normalizedPitchers = normalizePitcherStints(
      initialPitchers,
      maxInningFromSheet
    );

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

    const baseInnings: ScorebookInningMeta[] =
      inningMergeMap.size > 0
        ? Array.from(inningMergeMap.values()).sort((a, b) => a.inning - b.inning)
        : Array.from({ length: Math.min(7, match.innings || 7) }, (_, i) => ({
            inning: i + 1,
            columnCount: 1,
            runs: scoreboardHintScores[i] ?? 0,
            hits: 0,
          }));

    const regularizedGrid = regularizeSheetGridGeometry(
      normalizedBatters,
      baseInnings,
      rawLineupRightX
    );

    const calculatedRuns = regularizedGrid.innings.reduce(
      (acc, cur) => acc + cur.runs,
      0
    );
    const calculatedHits = regularizedGrid.innings.reduce(
      (acc, cur) => acc + cur.hits,
      0
    );

    const baseStructure: ScorebookSheetStructure = {
      isTop: body.isTop,
      isMyTeamBatting,
      batters: regularizedGrid.batters,
      pitchers: normalizedPitchers,
      innings: regularizedGrid.innings,
      totalRuns: calculatedRuns,
      totalHits: raw.totalHits ?? calculatedHits,
      totalErrors: Math.max(0, raw.totalErrors ?? 0),
      lineupRightX: regularizedGrid.lineupRightX,
    };

    const rectCorners = resolveStructureGridCorners(baseStructure);
    const rawCorners = sanitizeGridCorners(raw.gridCorners);
    let initialCorners: ScorebookGridCorners = rectCorners;

    if (
      rawCorners &&
      rawCorners.tl[0] >= 155 &&
      rawCorners.tl[0] <= 485 &&
      rawCorners.bl[0] >= 155 &&
      rawCorners.bl[0] <= 485 &&
      rawCorners.tr[0] >= rawCorners.tl[0] + 150 &&
      rawCorners.br[0] >= rawCorners.bl[0] + 150 &&
      rawCorners.tl[1] >= 35 &&
      rawCorners.tl[1] <= 400 &&
      rawCorners.tr[1] >= 35 &&
      rawCorners.tr[1] <= 400 &&
      rawCorners.bl[1] >= rawCorners.tl[1] + 200 &&
      rawCorners.br[1] >= rawCorners.tr[1] + 200
    ) {
      // 選手欄への食い込み防止ガードを維持しつつ、原本の傾き(dy)・台形歪み(dx)成分を保持する
      const safeLeftMidX = Math.max(
        rectCorners.tl[0],
        Math.round((rawCorners.tl[0] + rawCorners.bl[0]) / 2)
      );
      const halfSkewLeftX = Math.max(
        -45,
        Math.min(45, (rawCorners.bl[0] - rawCorners.tl[0]) / 2)
      );
      initialCorners = {
        tl: [Math.round(safeLeftMidX - halfSkewLeftX), rawCorners.tl[1]],
        tr: [rawCorners.tr[0], rawCorners.tr[1]],
        br: [rawCorners.br[0], rawCorners.br[1]],
        bl: [Math.round(safeLeftMidX + halfSkewLeftX), rawCorners.bl[1]],
      };
    }

    const structure = syncStructureBoxesFromCorners(
      baseStructure,
      initialCorners
    );

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
      "・画像1: 外周4辺に0〜1000目盛りルーラーが付いたスコアブック片面全体画像（全体の列・投手交代波線・前後イニングとの文脈確認用）",
    ];

    const hasMultiColTarget = sortedTargets.some((innNum) => {
      const m = body.structure.innings.find((x) => x.inning === innNum);
      return (m?.columnCount ?? 1) >= 2;
    });

    if (body.focusCropBase64) {
      imageParts.push({
        inlineData: {
          mimeType: body.focusCropMimeType || "image/jpeg",
          data: body.focusCropBase64,
        },
      });
      stage2ImageGuide.push(
        `・画像${imageParts.length}: 【🔥最優先で精読！ ${sortedTargets.join(
          "・"
        )}回専用・歪み補正済みデュアルビュー画像】左端に「イニング見出し〜1番〜9番〜下段得点欄までの連続1列ストリップ（どの打順が記入済みでどの打順が白紙空欄か・3アウト直下の終了斜線『／』『∟』・投手交代波線を一目で確認用）」、中央〜右側に「1番〜最終打順を上から下へ自然な縦1列で並べた1マス独立大判セル（各行左に青い打順バッジ『1番 〇〇』〜『9番 〇〇』付き）」を配置しています！${
          hasMultiColTarget
            ? "2列以上を使用する回は各打順ごとに [c:1]（1列目）・[c:2]（2列目）・[c:3]（3列目）として分離表示しています！"
            : ""
        }必ず左端の連続ストリップで「実際に手書き記録がある打順範囲」を特定したうえで、右側の各拡大セルでBSO投球記号・中央アウト記号・進塁実線・右下守備番号を1画ずつ精読してください！`
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
          ? `⚠️打者一巡以上のため【${meta.columnCount}列（c:1〜c:${meta.columnCount}）】使用！画像2の [c:1]〜[c:${meta.columnCount}] を時系列順に全て読み取り、各打席の列番号 c (1〜${meta.columnCount}) を正確に出力すること！`
          : "1列使用 (c:1)";
      const boxNote = meta.columnBox
        ? ` (画像1での列座標目安 ymin:${meta.columnBox[0]}, xmin:${meta.columnBox[1]}, ymax:${meta.columnBox[2]}, xmax:${meta.columnBox[3]})`
        : "";
      return `・${innNum}回${sideLabel}: 確定得点=${meta.runs}点, 安打目安=${meta.hits}本, ${colNote}${boxNote}`;
    });

    const multiColumnRuleBlock = hasMultiColTarget
      ? `
【🔥超重要 1.2: 1イニング2列・3列以上（打者一巡・二巡）の完全読取ルール】
- 対象イニングに【複数列（c:1, c:2, c:3...）】を使用する回が含まれています！画像2では各サブ列が左から **[c:1]（1列目）➔ [c:2]（2列目）➔ [c:3]（3列目）** として独立表示されています。
- 日本のスコアブックには以下の2通りの折り返し記法があります（どちらの記法でも白紙の空欄マスは絶対に出力せず、手書き記録があるマスだけを実際の打順時系列で出力してください）:
  1) **一巡充填式（標準）**: 先頭打者（例: 4番）から [c:1] を下へ進み、9番の次は同じ [c:1] の1番〜3番へ戻って9枠を埋め、10人目の打者（4番の2巡目）から [c:2] の4番の行へ移る（さらに19人目は [c:3] へ移る）。
  2) **9番下端折り返し式**: 先頭打者（例: 4番）から [c:1] の9番まで進んだら、次の1番打者からはすぐ右隣の [c:2] の1番の行へ移る（この場合 [c:1] の1番〜3番は白紙空欄になり、4番の2巡目は空いていた [c:2] の4番の行に書かれる）。
- **絶対厳守**: 必ず **先頭打者からスタートして打順が1つずつ循環（...8番➔9番➔1番➔2番...）する野球の時系列順** で出力し（上から1番〜9番の順になぞらないこと！）、その打席が書かれていた列に応じて **"c": 1, "c": 2, "c": 3** を正確に設定してください！3アウト目（③ または Ⅲ）が出るまで [c:2]・[c:3] の打席を絶対に落とさないでください！`
      : "";

    const leadOffConstraint =
      sortedTargets[0] === 1
        ? `\n🔥【先頭打者と白紙マス除外の鉄則】1回${sideLabel}の最初の打者は必ず【1番打者】のマスからスタートします！1番から下へ順に見て、3アウト目（③ または Ⅲ）が出た打者で読取をピタリと終了し、それより下の白紙マスやイニング終了斜線（／・∟）は絶対に出力しないでください！`
        : body.expectedLeadOffOrder
        ? `\n📌【先頭打者の目安と白紙マス除外の絶対原則】前イニング終了順からの計算では【${body.expectedLeadOffOrder}番打者】付近が${sortedTargets[0]}回${sideLabel}の先頭打者の目安ですが、**最優先すべき絶対の根拠は「マス内に実際の手書き記録があるか」**です！印刷された点線ダイヤモンドと薄いBSO枠線しか無い【白紙（空欄）マス】は絶対に打席として出力しないでください！画像2左端の「連続列全体ストリップ」と右側の拡大セルを照合し、実際に手書き記録がある連続した打席ブロック（Ⅰ→Ⅱ→Ⅲ または ①→②→③ の計3アウト分）だけを正確に抽出してください。`
        : `\n📌【白紙マス除外の絶対原則】印刷された点線ダイヤモンドと薄いBSO枠線しか無い【白紙（空欄）マス】は絶対に出力せず、実際に手書き記録がある連続した打席マス（計3アウト分）だけを抽出してください。`;

    const legendConstraint = legendImageIndex > 0
      ? `\n🔥【最優先: 添付画像${legendImageIndex}「チームのスコア記号早見表」】安打・アウト・投球記号・バントファウル・1塁牽制/2塁牽制/3塁牽制の書き方は画像${legendImageIndex}の定義を最優先で厳密に適用してください。`
      : "";

    const exampleInn = sortedTargets[0] || 1;
    const examplePitcher =
      body.structure.pitchers.find(
        (p) => exampleInn >= p.fromInning && exampleInn <= p.toInning
      )?.name ||
      body.structure.pitchers[0]?.name ||
      "相手投手";
    const exampleLeadBo =
      exampleInn === 1 ? 1 : Math.max(1, body.expectedLeadOffOrder || 1);
    const lineupLen = Math.max(9, body.structure.batters.length);
    const exampleNextBo = (exampleLeadBo % lineupLen) + 1;

    const prompt = `あなたは日本の早稲田式・成美堂式・リトルシニア/高校野球式スコアブックを1画・1球・守備番号1桁まで完璧に読み解くプロ公式記録員AIです。
以下の添付画像を照合し、**【${sortedTargets.join("回, ")}回（${sideLabel}）】で実際に行われた打席のみ** を時系列順に全打席・全投球・全進塁漏れなく抽出してください。
（※イニング番号 **"i" には必ず対象の回番号（${sortedTargets.join(" または ")}）** を設定し、対象外のイニングや白紙の空欄マスは絶対に出力しないでください！）

【添付画像の構成】
${stage2ImageGuide.join("\n")}
${legendConstraint}${leadOffConstraint}

【確定済みの打順・途中交代リスト（この名前を厳密に使用すること）】
${lineupSpecLines.join("\n")}

【確定済みの相手登板投手リスト】
${pitcherSpecLines.join("\n")}

【対象イニングの確定スコア＆列情報（必ずこの得点数・列数・3アウト交代と整合させること）】
${targetInningMetaLines.join("\n")}

【🔥最重要 0: 「0打席イニングの絶対禁止」と「白紙マス・チェンジ切り線の完全除外」（イニングチェンジ精度の要！）】
1. **試合が行われたイニングで打席0件（ab: []）は野球規則上あり得ません！**:
   必ず対象列の1番〜9番を見渡し、手書き筆跡が入っている打席（最低3アウト分、サヨナラ回を除く）を漏れなく抽出してください。
2. **白紙（空欄）マスの抽出は絶対禁止！**:
   同じ列の中で「印刷された点線ダイヤモンドと薄いBSO枠線だけがある白紙マス」と「鉛筆や赤ペンで投球・進塁線・アウト数字・守備番号が書かれた記入済みマス」を必ず比較してください。手書き記録の無い白紙マスには架空のプレーを絶対に作らないでください！
3. **3アウトチェンジ（Ⅰ→Ⅱ→Ⅲ または ①→②→③）と「イニング終了切り線」の厳密識別**:
   - 1イニングは先頭打者から打順が1つずつ下へ進み（9番の次は同じ列の上端1番へ戻る場合あり）、**合計3アウト（Ⅲ または ③）に達した瞬間にイニング終了（チェンジ）**です！
   - 3アウト目のマスの右下隅、または**3アウト目の直下の空欄マスに斜め1本で引かれた斜線『／』『＼』やカギ線『∟』は「ここまででこのイニング終了」を表す区切り印**です！この切り線だけのマスを絶対に4人目の打席や単打として出力しないでください！

【🔥最重要 1: 左ゾーン（BSO投球記号欄）の1球順序（p）超高精度読取ルール】
1. **印刷された水平区切り線をボール『ー』と誤認するな！**:
   左端のBSO細枠には、最初から2〜3段に分ける**薄い水平の印刷線（左右の縦枠線まで隙間なく真っ直ぐ貫通する線）**が全マス共通で印刷されています（白紙マスと見比べれば一目瞭然です）。これをボール『ー』と数えるのは絶対厳禁です！
2. **手書き投球記号の2大記法に完全対応せよ**:
   - **記法A（縦積み記号式・主流）**: 小枠の区切りに関係なく、上から下へ1球ごとに手書き記号を並べる方式（1つの小枠内に2〜3球入ることも多い）:
     ・『○』（中が白い丸）＝ **見逃しストライク "S"** （※輪郭が丸なら100% "S"！三角△のファウルや黒丸●と混同しないこと）
     ・『●』（中まで黒く塗り潰した丸）または BSO枠内の斜線『／』＝ **空振りストライク "W"**
     ・『ー』（左右の枠線に触れない短い浮いた横棒）または『・』（小さい点）＝ **ボール "B"**
     ・『△』『▽』『レ』『V』（角がある白抜き三角・チェック）＝ **ファウル "F"**
     ・『▲』『▼』（黒塗り三角・二重三角・線入り△）＝ **バントファウル "BF"**
   - **記法B（BS段別・球数番号式）**: B段とS段に分けて『1, 2, 3, 4...』と球数番号を書く方式の場合は、番号順（1➔2➔3...）に "B" / "S" / "F" を時系列復元すること。
3. **最終球とカウントの絶対整合チェック**:
   - **ゴロ・フライ・ライナー・犠打・犠飛・失策・野選・併殺**: バットに当たった最終球はBSO欄に書かれません！BSO欄の手書き球を読んだ末尾に **必ず "X" を1つ追加**してください（初球打ちならBSO欄は空なので **["X"]** の1球のみ！架空のBやSを足さないこと）。
   - **安打（単打・二塁打・三塁打・本塁打）**: BSO欄の手書き球を読んだ末尾に **必ず "H" を1つ追加**してください（初球安打なら **["H"]**）。
   - **三振（rc: "strikeout"）**: BSO欄に3ストライク目まで全て書かれます（"X" は付けない）。最後のストライク記号が『○』なら末尾 "S"（見逃し三振）、『●』や『／』なら末尾 "W"（空振り三振）、2S後の『▲』なら末尾 "BF"（スリーバント失敗）。
   - **四球（rc: "walk"）**: BSO欄のボール "B" が合計4球になります（"X" は付けない）。死球は末尾 "D"。

【🔥最重要 2: 中央ダイヤモンド（出塁実線 b1 ＆ アウトカウント ①②③ / ⅠⅡⅢ）】
- **中央の『Ⅰ・Ⅱ・Ⅲ』（上下横棒付きのローマ数字 1・2・3）および『①・②・③』（丸数字）はアウトカウント（eo: 1, 2, 3）**です！これを守備位置番号（1=投, 2=捕, 3=一）と絶対に混同しないでください！
- ダイヤモンド右下辺（本塁→1塁）に手書きの実線・赤線があれば **"b1": true（出塁）**、印刷点線のままなら **"b1": false（未出塁＝打者アウト）** と判定してください（※"b1": true で一度出塁した走者が後続打席で盗塁死・封殺等になった場合も中央に Ⅰ/Ⅱ/Ⅲ・①/②/③ が書かれますが、その打席自体は o: 0 の出塁です）。

【🔥最重要 3: インプレー結果（rc）と守備位置番号（1〜9: dir）の徹底判別ルール】
守備番号の定義: **1=投, 2=捕, 3=一, 4=二, 5=三, 6=遊, 7=左, 8=中, 9=右**
1. **ゴロ・封殺・併殺（rc: "groundout" / "double_play"）の数字精読**:
   - ハイフン繋ぎの送球番号（例: **6-3**=遊ゴロ, **4-3**=二ゴロ, **5-3**=三ゴロ, **1-3**=投ゴロ, **2-3**=捕ゴロ, **3-1**=一ゴロ投カバー、封殺 **6-4 / 4-6 / 5-4 / 5-2**、併殺 **6-4-3 / 4-6-3 / 5-4-3 / 1-6-3**）または一塁無補殺の単独 **『3』『〜3』** はゴロです！
   - **⚠️手書き数字の見分けと野球理論チェック**:
     ・**『4』**(角張った十字/三角) vs **『6』**(下部に丸いループ) vs **『5』**(上が水平横棒) vs **『1』**(縦1本線) vs **『2』**(上丸＋下水平線) を1画ずつ拡大確認せよ！
     ・野球では内野ゴロ一塁送球は **6-3, 4-3, 5-3, 1-3, 2-3** が圧倒的多数であり、外野からの **7-3, 8-3, 9-3（外野ゴロ）は滅多に起きません**。『6-3』を『9-3』や『8-3』、『4-3』を『7-3』と誤読しないよう字形を慎重に確認してください！
2. **フライ・邪飛・ライナー（rc: "flyout" / "sac_fly" / "infield_fly"）**:
   - 守備番号の上や左上に**山なり曲線・傘マーク『⌒』『︵』**がある記号（**︵1〜︵9**、例: **︵4**=二飛, **︵6**=遊飛, **︵7**=左飛, **︵8**=中飛, **︵9**=右飛, **︵3**=一飛, **︵5**=三飛, **︵2**=捕飛）は100%フライ（rc: "flyout", dir: "4"〜"9"）です！
   - また本塁→1塁が点線（b1: false）で送球ハイフンが無く外野番号 **『7』『8』『9』** が単独で書かれている場合も外野フライ（左飛・中飛・右飛）です。
   - **ファウルフライ（邪飛）**: 『︵2F』『(2)』『△2』『3F』『5F』等 ➔ rc: "flyout", dir: "2F" / "3F" / "5F", rl: "捕邪飛" / "一邪飛" / "三邪飛"。
   - **ライナー（直球）**: 直線バー『￣』『L』（例: 『6￣』『6L』『4L』『4-』※右に送球先数字無し）➔ rc: "flyout", dir: "6L" / "4L", rl: "遊直" / "二直"。
3. **安打（rc: "single" | "double" | "triple" | "home_run"）の打球方向（dir）**:
   - 本塁→1塁が太い実線・赤線（b1: true）で、1塁線上の斜線『/』=単打、2塁まで実線＋『//』=二塁打、3塁まで実線＋『///』=三塁打、本塁一周実線または『HR』『////』=本塁打。
   - **守備方向の読み方（数字記法と打球線記法の両対応）**:
     ① 数字が書かれている場合: **7**(左), **8**(中), **9**(右), **7-8**(左中間), **8-9**(右中間), **6**(遊内安), **5**(三内安), **4**(二内安) をそのまま dir に設定。
     ② 早稲田式の打球方向線（本塁からダイヤモンド外へ伸びる線＋先端の点『・』や山『⌒』）で書かれている場合: ダイヤモンドの向きに合わせて **左上（三遊間〜レフト側）="7"**、**真上（二塁ベース上〜センター側）="8"**、**右上（一二塁間〜ライト側）="9"**、**左斜め上中間="7-8"**、**右斜め上中間="8-9"** と正確に判定してください（左上7と右上9を絶対に逆にしないこと）！
4. **犠打・失策・野選・四死球・その他**:
   - 四角『□』やダイヤ『◇』で囲まれた送球番号（例: **[1-3], ◇1-3, ◇5-4**）➔ **rc: "sac_bunt"**, dir: "1-3" 等。三塁走者生還の外野飛球 ➔ **rc: "sac_fly"**。
   - 失策 **『E6』『6E』『E5』** ➔ **rc: "error"**, dir: "E6" 等（b1: true, o: 0）。野選 **『FC』『O.B.』** ➔ **rc: "fc"**, dir: "FC6" 等。
   - 四球は本塁→1塁実線＋右下英字『B』➔ **rc: "walk"**。死球『D』『HBP』➔ **rc: "hit_by_pitch"**。敬遠 ➔ **rc: "intentional_walk"**。
   - 振り逃げアウト『K 2-3』➔ **rc: "dropped_third_strike_out"**, o: 1。振り逃げ出塁『K-E2』➔ **rc: "dropped_third_strike"**, o: 0。
   - 打席途中に走者が盗塁死・牽制死等で3アウトチェンジになった未完了マスのみ ➔ **rc: "other"**, rl: "打席途中断（走塁死チェンジ）", o: 1（白紙マスには絶対に使わないこと！）。

【超重要 4: 投手交代波線・進塁（a）・得点（ru）・座標（box）】
- 回途中の継投がある場合は横波線『〜〜』や二重線『══』の前後で正しい投手名を pt に設定してください。${multiColumnRuleBlock}
- 進塁 a には盗塁(m:"steal")・盗塁死(m:"caught_stealing",io:true)・牽制死(m:"pickoff_out",io:true)・牽制悪送球(m:"pickoff_error")・暴投(m:"wp")・捕逸(m:"pb")・ボーク(m:"balk")・送球間(m:"throw_advance")・走塁死(m:"out_on_base",io:true)・打撃進塁(m:"hit"/"sac"/"fc"/"error"/"walk")を記録し、凡退無進塁は a:[]。本塁生還は t:"HP", io:false で ru に生還人数を設定（イニング合計 ru ＝ 確定得点）。
- 投球コード p は "B"|"S"|"W"|"BS"|"F"|"BF"|"P1"|"P2"|"P3"|"BK"|"H"|"X"|"D" のみ使用。

【出力JSONフォーマット（改行無しのコンパクトJSONのみ返却。"i" には必ず対象イニング番号 ${exampleInn} を入れること！）】
{"ab":[{"i":${exampleInn},"c":1,"bo":${exampleLeadBo},"pt":"${examplePitcher}","obs":"左:○,ー/中:Ⅰ/本一:破線/右下:6-3","b1":false,"p":["S","B","X"],"eo":1,"o":1,"dir":"6-3","rc":"groundout","rl":"遊ゴロ (6-3)","rbi":0,"ru":0,"a":[],"cf":"h","box":[205,320,272,376]},{"i":${exampleInn},"c":1,"bo":${exampleNextBo},"pt":"${examplePitcher}","obs":"左:ー,●/中:無/本一:実線/右下:8","b1":true,"p":["B","W","H"],"eo":1,"o":0,"dir":"8","rc":"single","rl":"中前安打","rbi":0,"ru":0,"a":[{"rn":"選手名","f":"BAT","t":"1B","m":"hit","io":false,"pn":3}],"cf":"h","box":[272,320,339,376]}]}
※ rc は必ず "single"|"double"|"triple"|"home_run"|"walk"|"intentional_walk"|"hit_by_pitch"|"interference"|"sac_bunt"|"sac_fly"|"groundout"|"flyout"|"infield_fly"|"strikeout"|"dropped_third_strike_out"|"dropped_third_strike"|"double_play"|"triple_play"|"interference_out"|"error"|"fc"|"other" のいずれかとしてください。`;

    const maxStructInning = Math.max(
      1,
      ...body.structure.innings.map((m) => m.inning)
    );
    const isPotentiallySkippedFinalBottom =
      !body.isTop &&
      sortedTargets.every((innNum) => {
        const meta = body.structure.innings.find((m) => m.inning === innNum);
        return (
          innNum === maxStructInning &&
          innNum >= 3 &&
          (meta?.runs ?? 0) === 0 &&
          (meta?.hits ?? 0) === 0 &&
          (meta?.columnCount ?? 1) <= 1
        );
      });
    const mustHaveAtBats = !isPotentiallySkippedFinalBottom;

    const validateChunkOutput = (
      parsed: RawGeminiChunkResponse
    ): string | null => {
      const normalized = normalizeChunkRawItems(
        parsed.ab || parsed.atBats || [],
        sortedTargets
      );
      if (mustHaveAtBats && normalized.length === 0) {
        return `${sortedTargets.join("・")}回${sideLabel}の打席抽出結果が0件です`;
      }
      return null;
    };

    let normalizedRawItems: RawGeminiAtBat[] = [];
    try {
      const rawChunk = await callGeminiStructuredJson<RawGeminiChunkResponse>(
        apiKey,
        prompt,
        imageParts,
        "chunk",
        validateChunkOutput
      );
      normalizedRawItems = normalizeChunkRawItems(
        rawChunk.ab || rawChunk.atBats || [],
        sortedTargets
      );
    } catch (primaryErr) {
      if (!mustHaveAtBats) {
        normalizedRawItems = [];
      } else {
        // 万一プライマリプロンプトで0打席等の検証エラーになった場合、救済プロンプトで1回再試行
        const rescuePrompt = `${prompt}\n\n⚠️【緊急再確認】前回の読取で${sortedTargets.join(
          "・"
        )}回${sideLabel}の有効打席が0件になりましたが、試合が行われたイニングで打席0件は絶対にあり得ません！画像2の1番〜${lineupLen}番の各マスをもう一度確認し、手書き記録がある打席マス（最低3アウト分）を必ず "i": ${exampleInn} として全て出力してください！`;
        try {
          const rescueChunk =
            await callGeminiStructuredJson<RawGeminiChunkResponse>(
              apiKey,
              rescuePrompt,
              imageParts,
              "chunk",
              validateChunkOutput
            );
          normalizedRawItems = normalizeChunkRawItems(
            rescueChunk.ab || rescueChunk.atBats || [],
            sortedTargets
          );
        } catch {
          throw primaryErr;
        }
      }
    }

    if (mustHaveAtBats && normalizedRawItems.length === 0) {
      return c.json(
        {
          success: false,
          error: `${sortedTargets.join(
            "・"
          )}回${sideLabel}の打席を検出できませんでした（0打席防止ガード）。自動リトライまたはマス位置を確認してください。`,
        },
        422
      );
    }

    const rawList = orderAndAssignColumnsForChunk(
      normalizedRawItems,
      sortedTargets,
      body.structure,
      body.expectedLeadOffOrder
    );

    let currentTrackingInning = -1;
    let activeBases: Record<"1B" | "2B" | "3B", boolean> = {
      "1B": false,
      "2B": false,
      "3B": false,
    };

    const rawMappedAtBats: ScorebookV2AtBat[] = rawList.map((ab) => {
      const inning = toFiniteInt(ab.i ?? ab.inning, sortedTargets[0]) || sortedTargets[0];
      if (inning !== currentTrackingInning) {
        currentTrackingInning = inning;
        activeBases = { "1B": false, "2B": false, "3B": false };
      }

      const battingOrder = Math.max(
        1,
        toFiniteInt(ab.bo ?? ab.battingOrder, 1) || 1
      );
      const colIndex = Math.max(
        1,
        toFiniteInt(ab.c ?? ab.columnIndex, 1) || 1
      );
      const ocrPitcherHint = (ab.pt ?? ab.pitcherName ?? "").trim();
      const resolved = resolveActiveMatchupFromStructure(
        body.structure,
        inning,
        battingOrder,
        ocrPitcherHint
      );

      const reconciled = reconcileRawAtBatEvidence(ab, activeBases);
      const rawResultCode = reconciled.rawResultCode;
      const rawResultLabel = reconciled.rawResultLabel;
      const rawDir = reconciled.rawDir;
      const resultCode = inferCanonicalResultCode(
        rawResultCode,
        rawResultLabel || rawDir
      );
      const harmonizedFielding = harmonizeOcrFieldingAndLabel(
        resultCode,
        rawDir,
        rawResultLabel
      );

      const rawAdvances = reconciled.rawAdvances;
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

      // 【数学的自己補正 1】打席結果コードと走塁死(advances.isOut)から outsInPlay の矛盾を自動補正
      const rawOutsVal = Math.max(0, Math.min(3, reconciled.outsInPlay));
      const runnerOutsInPlay = advances.filter(
        (a) => a.isOut && a.from !== "BAT"
      ).length;
      const batterOutInAdvances = advances.some(
        (a) => a.isOut && a.from === "BAT"
      );

      const isSafeBatterReach =
        resultCode === "single" ||
        resultCode === "double" ||
        resultCode === "triple" ||
        resultCode === "home_run" ||
        resultCode === "walk" ||
        resultCode === "intentional_walk" ||
        resultCode === "hit_by_pitch" ||
        resultCode === "interference" ||
        resultCode === "dropped_third_strike" ||
        resultCode === "error";

      const isDefiniteBatterOut =
        resultCode === "groundout" ||
        resultCode === "flyout" ||
        resultCode === "infield_fly" ||
        resultCode === "strikeout" ||
        resultCode === "dropped_third_strike_out" ||
        resultCode === "sac_fly" ||
        resultCode === "interference_out";

      let outsVal = rawOutsVal;
      if (resultCode === "triple_play") {
        outsVal = 3;
      } else if (resultCode === "double_play") {
        outsVal = Math.max(2, rawOutsVal);
      } else if (isDefiniteBatterOut) {
        outsVal = Math.min(3, Math.max(1 + runnerOutsInPlay, rawOutsVal || 1));
      } else if (isSafeBatterReach) {
        // 出塁後に後続打席で盗塁死等した丸数字①②③・ローマ数字ⅠⅡⅢを当該打席のアウトと誤認するケースを排除
        outsVal = Math.min(
          3,
          runnerOutsInPlay + (batterOutInAdvances ? 1 : 0)
        );
      }

      const normalizedPitches = normalizePitchArray(
        reconciled.rawPitches,
        resultCode,
        advances,
        activeBases
      );
      const { balls, strikes } = computeCountFromPitches(normalizedPitches);

      // 【数学的自己補正 2】確定済みグリッドの列座標(columnBox × columnIndex)と打順行座標(rowBox)の直積交差から 1マスを厳密算出
      const boxArr = Array.isArray(ab.box) && ab.box.length >= 4 ? ab.box : undefined;
      const rawCellBox = boxArr
        ? sanitizeBox(boxArr[0], boxArr[1], boxArr[2], boxArr[3])
        : sanitizeBox(ab.ymin, ab.xmin, ab.ymax, ab.xmax);

      const inningMeta = body.structure.innings.find((m) => m.inning === inning);
      const batterRowBox = body.structure.batters.find(
        (b) => b.battingOrder === battingOrder
      )?.rowBox;

      const skewedQuad = getCellQuadInStructure(
        body.structure,
        inning,
        colIndex,
        battingOrder,
        0
      );
      const cellBox = skewedQuad
        ? quadToBoundingBox(skewedQuad)
        : computeCartesianCellBox(
            rawCellBox,
            inningMeta?.columnBox,
            inningMeta?.columnCount ?? 1,
            colIndex,
            batterRowBox
          );

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
      const rawRunsInPlay = toFiniteInt(ab.ru ?? ab.runsInPlay, 0) || 0;
      const effectiveRuns = Math.max(
        rawRunsInPlay,
        hpCount,
        isHr ? 1 : 0
      );
      const parsedRbi = toFiniteInt(ab.rbi);

      return {
        id: crypto.randomUUID(),
        inning,
        isTop: body.isTop,
        columnIndex: colIndex,
        battingOrder,
        batterName: resolved.batterName || (ab.b ?? ab.batterName ?? "").trim(),
        batterPlayerId: resolved.batterPlayerId,
        pitcherName: resolved.pitcherName || (ab.pt ?? ab.pitcherName ?? "").trim(),
        pitcherPlayerId: resolved.pitcherPlayerId,
        resultCode,
        resultLabel: harmonizedFielding.resultLabel,
        battedDirection: harmonizedFielding.battedDirection,
        rbi: Math.max(0, parsedRbi ?? effectiveRuns),
        outsInPlay: outsVal,
        endingOuts: Math.max(0, Math.min(3, reconciled.endingOuts)),
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

    // 3アウト到達後のイニング終了切り線マス・余剰空欄ノイズを除去し、正確なイニング交代境界と次回先頭打順を保証する
    const mappedAtBats = sanitizeMappedInningAtBats(
      rawMappedAtBats,
      sortedTargets,
      body.structure
    );

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
      ? validateScorebookSheet(incomingTop, body.topStructure, true)
      : [];
    const bottomIssues = includeBottom
      ? validateScorebookSheet(incomingBottom, body.bottomStructure, false)
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
      const cleanDirTag = (ab.battedDirection || "").trim();
      const dirSuffix =
        cleanDirTag && !ab.resultLabel.includes(cleanDirTag)
          ? ` (${cleanDirTag})`
          : "";
      const rbiSuffix = ab.rbi > 0 ? `（打点${ab.rbi}）` : "";
      const description = `${ab.battingOrder}番 ${ab.batterName || "打者"}: ${
        ab.resultLabel
      }${dirSuffix}${rbiSuffix}${pitchLines} [B:${countCalc.balls}, S:${
        countCalc.strikes
      }, O:${ab.outsInPlay}]`;

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

    // 守備側エラー数の再集計（表の攻撃での失策出塁/失策進塁＝裏チームのエラー）
    const countOpponentSideErrorsOnAtBats = (
      sideAtBats: ScorebookV2AtBat[]
    ): number => {
      let errs = 0;
      for (const ab of sideAtBats) {
        if (ab.resultCode === "error") errs += 1;
        for (const adv of ab.advances) {
          if (
            adv.method === "pickoff_error" ||
            (adv.method === "error" &&
              !(ab.resultCode === "error" && adv.from === "BAT"))
          ) {
            errs += 1;
          }
        }
      }
      return errs;
    };

    const topOffenseInducedErrors = includeTop
      ? Math.max(
          countOpponentSideErrorsOnAtBats(incomingTop),
          body.topStructure?.totalErrors ?? 0
        )
      : isMyTeamFirst
      ? match.opponentErrors ?? 0
      : match.myErrors ?? 0;

    const bottomOffenseInducedErrors = includeBottom
      ? Math.max(
          countOpponentSideErrorsOnAtBats(incomingBottom),
          body.bottomStructure?.totalErrors ?? 0
        )
      : isMyTeamFirst
      ? match.myErrors ?? 0
      : match.opponentErrors ?? 0;

    const myErrors = isMyTeamFirst
      ? bottomOffenseInducedErrors
      : topOffenseInducedErrors;
    const opponentErrors = isMyTeamFirst
      ? topOffenseInducedErrors
      : bottomOffenseInducedErrors;

    await db
      .update(matches)
      .set({
        myScore: finalMyScore,
        opponentScore: finalOppScore,
        myInningScores: JSON.stringify(finalMyInnings),
        opponentInningScores: JSON.stringify(finalOppInnings),
        myHits,
        opponentHits,
        myErrors,
        opponentErrors,
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
  mode: GeminiCallMode = "structure",
  validateResult?: (parsed: T) => string | null
): Promise<T> {
  const attemptErrors: string[] = [];
  let quota429Count = 0;
  let demand503Count = 0;
  let timeoutCount = 0;
  const overallStart = Date.now();
  // Cloudflare Workers / モバイルブラウザの100秒HTTPタイムアウトより手前で確実にJSON応答を完結させる
  const MAX_TOTAL_BUDGET_MS = 94_000;
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
    if (remainingBeforeStart < 8_000) {
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

    scheduleWatchdog(cfg.firstResponseTimeoutMs, "応答待機タイムアウト");

    try {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.05,
        responseMimeType: "application/json",
        mediaResolution: "MEDIA_RESOLUTION_HIGH",
      };
      // includeThoughts: true を付与することで、Geminiが推論中にもSSE思考チャンクを即時ストリーム配信し、
      // 画像プリフィル＋思考フェーズ中の無通信による誤タイムアウトを構造的に排除する
      if (cfg.thinkingMode === "level_high") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "HIGH",
          includeThoughts: true,
        };
      } else if (cfg.thinkingMode === "level_medium") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "MEDIUM",
          includeThoughts: true,
        };
      } else if (cfg.thinkingMode === "level_low") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "LOW",
          includeThoughts: true,
        };
      } else if (cfg.thinkingMode === "budget") {
        generationConfig.thinkingConfig = {
          thinkingBudget: cfg.thinkingBudget ?? 1024,
          includeThoughts: true,
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

      // 万一 mediaResolution / thinkingLevel 等のパラメータ仕様差異で 400 が返った場合でも、
      // 思考モード（thinkingConfig）を丸ごと消去せず、原因パラメータのみピンポイントで降格・除去して推論精度を維持する
      if (!res.ok && res.status === 400) {
        const firstErrText = await res.text();
        const lowerErr = firstErrText.toLowerCase();
        const hasMediaIssue =
          lowerErr.includes("mediaresolution") ||
          lowerErr.includes("media_resolution");
        const hasThinkingLevelIssue =
          lowerErr.includes("thinkinglevel") ||
          lowerErr.includes("thinking_level");
        const hasIncludeThoughtsIssue =
          lowerErr.includes("includethoughts") ||
          lowerErr.includes("include_thoughts");
        const hasAnyThinkingIssue =
          hasThinkingLevelIssue ||
          hasIncludeThoughtsIssue ||
          lowerErr.includes("thinking");

        if (hasMediaIssue || hasAnyThinkingIssue) {
          scheduleWatchdog(cfg.firstResponseTimeoutMs, "応答待機タイムアウト");
          const fallbackGenConfig: Record<string, unknown> = {
            temperature: 0.05,
            responseMimeType: "application/json",
          };
          if (!hasMediaIssue) {
            fallbackGenConfig.mediaResolution = "MEDIA_RESOLUTION_HIGH";
          }
          if (!hasAnyThinkingIssue && generationConfig.thinkingConfig) {
            // mediaResolution のみが非対応だった場合は thinkingConfig を100%そのまま保持！
            fallbackGenConfig.thinkingConfig = generationConfig.thinkingConfig;
          } else if (hasThinkingLevelIssue && !hasIncludeThoughtsIssue) {
            // thinkingLevel 非対応モデル（budget方式モデル）には thinkingBudget で深い推論を維持！
            fallbackGenConfig.thinkingConfig = {
              thinkingBudget: mode === "chunk" ? 6144 : 3072,
              includeThoughts: true,
            };
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

          // それでもまだ 400 の場合のみ最小構成で最終リトライ
          if (!res.ok && res.status === 400 && fallbackGenConfig.thinkingConfig) {
            await res.text();
            scheduleWatchdog(cfg.firstResponseTimeoutMs, "応答待機タイムアウト");
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
                generationConfig: {
                  temperature: 0.05,
                  responseMimeType: "application/json",
                },
              }),
            });
          }
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
          quota429Count += 1;
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
          demand503Count += 1;
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

      let sawTextChunk = false;

      // HTTP 200 接続完了時点で思考フェーズ上限タイマーへ移行
      const initialLeftForText = Math.max(
        10_000,
        cfg.firstTextTimeoutMs - (Date.now() - attemptStart)
      );
      scheduleWatchdog(initialLeftForText, "思考フェーズタイムアウト");

      const refreshThinkingWatchdog = () => {
        if (sawTextChunk) return;
        const elapsedAttempt = Date.now() - attemptStart;
        const leftForText = Math.max(
          6_000,
          cfg.firstTextTimeoutMs - elapsedAttempt
        );
        const nextWait = Math.min(22_000, leftForText);
        const reason =
          leftForText <= 22_000
            ? "思考フェーズ上限到達"
            : "思考ストリーム無応答";
        scheduleWatchdog(nextWait, reason);
      };

      const { text, finishReason } = await readGeminiSseResponse(res, {
        onCandidateChunk: refreshThinkingWatchdog,
        onThoughtChunk: refreshThinkingWatchdog,
        onTextChunk: () => {
          sawTextChunk = true;
          // 本文トークンが流れている間はチャンク間20秒のアイドル監視のみに切り替え、生成途中の切断を防ぐ
          scheduleWatchdog(20_000, "ストリーム無応答");
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
        const parsedObj = JSON.parse(cleaned) as T;
        if (validateResult) {
          const validationError = validateResult(parsedObj);
          if (validationError) {
            attemptErrors.push(`[${cfg.model}] 検証NG: ${validationError}`);
            continue;
          }
        }
        return parsedObj;
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
        timeoutCount += 1;
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

  if (quota429Count > 0 && timeoutCount === 0 && demand503Count === 0) {
    throw new Error(
      `Gemini APIの利用枠上限（429 Quota Exceeded）に達しました。30〜60秒ほど待ってから再度お試しいただくか、Google AI Studioの利用枠（Free Tier / Billing設定）をご確認ください。 ${attemptErrors.join(
        " "
      )}`
    );
  }

  if (timeoutCount > 0) {
    throw new Error(
      `AIモデルの画像解析が時間内に完了しませんでした。数秒置いてもう一度ボタンを押してください。 ${attemptErrors.join(
        " "
      )}`
    );
  }

  if (quota429Count > 0 && demand503Count > 0) {
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
  onThoughtChunk?: () => void;
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
        if (p.thought) {
          callbacks?.onThoughtChunk?.();
        } else if (typeof p.text === "string" && p.text.length > 0) {
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

interface ReconciledAtBatEvidence {
  rawResultCode?: string;
  rawResultLabel?: string;
  rawDir?: string;
  outsInPlay: number;
  endingOuts: number;
  rawPitches: string[];
  rawAdvances: RawGeminiAdvance[];
}

/**
 * 白紙（空欄）マスやイニング終了の切り線（／・＼・∟）のみを誤って "other" 等として出力した要素を除外しつつ、
 * 1イニング単独リクエスト時にモデルが "i": 1（例示のコピー）・文字列 "3"・"i" 省略で返した場合でも
 * 全件消滅（0打席化）しないよう安全に正規化する。
 */
function normalizeChunkRawItems(
  rawItems: RawGeminiAtBat[],
  sortedTargets: number[]
): RawGeminiAtBat[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  const nonBlankItems = rawItems.filter((ab) => {
    const obs = (ab.obs || "").trim();
    const rc = (ab.rc ?? ab.resultCode ?? "").trim().toLowerCase();
    const rl = (ab.rl ?? ab.resultLabel ?? "").trim();
    const dir = (ab.dir ?? ab.battedDirection ?? "").trim();
    const rawP = ab.p || ab.pitches || [];
    const rawA = ab.a || ab.advances || [];
    const outs = toFiniteInt(ab.o ?? ab.outsInPlay, 0) || 0;
    const runs = toFiniteInt(ab.ru ?? ab.runsInPlay, 0) || 0;

    // 明示的に白紙・空欄・チェンジ切り線と記述されている行を除外
    if (
      /^(?:白紙|空欄|空白|未記入|記入なし|斜線のみ|切り線|区切り線|チェンジ斜線)$/i.test(
        rl
      )
    ) {
      return false;
    }
    if (
      (!rc || rc === "other") &&
      /白紙|空欄|空白マス|未記入|記入なし|切り線のみ|斜線のみ/.test(
        `${obs} ${rl}`
      ) &&
      rawA.length === 0 &&
      outs === 0 &&
      runs === 0
    ) {
      return false;
    }

    // rc が空または "other" で、投球・進塁・アウト・得点・守備記号のすべてが空のダミー空行を除外
    if (
      (!rc || rc === "other") &&
      !dir &&
      rawP.length === 0 &&
      rawA.length === 0 &&
      outs === 0 &&
      runs === 0
    ) {
      return false;
    }

    return true;
  });

  if (nonBlankItems.length === 0) return [];

  const targetSet = new Set(sortedTargets);

  if (sortedTargets.length === 1) {
    const onlyInn = sortedTargets[0];
    const hasExactTarget = nonBlankItems.some(
      (ab) => toFiniteInt(ab.i ?? ab.inning) === onlyInn
    );
    const hasNeighborLeak = nonBlankItems.some((ab) => {
      const parsed = toFiniteInt(ab.i ?? ab.inning);
      return (
        parsed !== undefined &&
        parsed !== onlyInn &&
        (parsed === onlyInn - 1 || parsed === onlyInn + 1) &&
        !(onlyInn !== 1 && parsed === 1 && !hasExactTarget)
      );
    });

    const selected =
      hasExactTarget && hasNeighborLeak
        ? nonBlankItems.filter((ab) => {
            const parsed = toFiniteInt(ab.i ?? ab.inning);
            return parsed === undefined || parsed === onlyInn;
          })
        : nonBlankItems;

    return selected.map((ab) => ({
      ...ab,
      i: onlyInn,
      inning: onlyInn,
    }));
  }

  const matched = nonBlankItems
    .map((ab) => {
      const parsed = toFiniteInt(ab.i ?? ab.inning);
      return { ab, parsed };
    })
    .filter(
      (entry) => entry.parsed !== undefined && targetSet.has(entry.parsed)
    )
    .map((entry) => ({
      ...entry.ab,
      i: entry.parsed,
      inning: entry.parsed,
    }));

  if (matched.length > 0) {
    return matched;
  }

  // 複数イニングチャンクですべて i が未設定だった場合のフェイルセーフ
  const allMissingInn = nonBlankItems.every(
    (ab) => toFiniteInt(ab.i ?? ab.inning) === undefined
  );
  if (allMissingInn && sortedTargets.length > 0) {
    return nonBlankItems.map((ab) => ({
      ...ab,
      i: sortedTargets[0],
      inning: sortedTargets[0],
    }));
  }

  return [];
}

/**
 * 1イニング内で3アウトチェンジ（Ⅲ / ③）が完了した直後のマスにある「イニング終了切り線（／・∟）」や白紙マスが
 * 余剰打席として末尾に混入した場合にトリミングし、イニング交代境界と次イニング先頭打順のズレを防ぐ。
 */
function sanitizeMappedInningAtBats(
  items: ScorebookV2AtBat[],
  sortedTargets: number[],
  structure: ScorebookSheetStructure
): ScorebookV2AtBat[] {
  const output: ScorebookV2AtBat[] = [];

  for (const inn of sortedTargets) {
    const innList = items.filter((a) => a.inning === inn);
    if (innList.length === 0) continue;

    const meta = structure.innings.find((m) => m.inning === inn);
    const confirmedRuns = meta?.runs ?? 0;

    let cumOuts = 0;
    let cumRuns = 0;
    let threeOutIndex = -1;

    for (let idx = 0; idx < innList.length; idx++) {
      cumOuts += Math.max(0, innList[idx].outsInPlay);
      cumRuns += Math.max(0, innList[idx].runsInPlay);
      if (threeOutIndex === -1 && cumOuts >= 3) {
        threeOutIndex = idx;
      }
    }

    if (threeOutIndex !== -1 && threeOutIndex < innList.length - 1) {
      const thirdOutAb = innList[threeOutIndex];
      const runsAtThreeOuts = innList
        .slice(0, threeOutIndex + 1)
        .reduce((sum, x) => sum + Math.max(0, x.runsInPlay), 0);
      const outsAtThreeOuts = innList
        .slice(0, threeOutIndex + 1)
        .reduce((sum, x) => sum + Math.max(0, x.outsInPlay), 0);
      const trailing = innList.slice(threeOutIndex + 1);

      const thirdOutHasExplicitThreeMark =
        thirdOutAb.endingOuts === 3 && thirdOutAb.outsInPlay >= 1;
      const scoreAlreadyMatchesAtThreeOuts =
        outsAtThreeOuts === 3 && runsAtThreeOuts === confirmedRuns;
      const trailingArePhantomOrZeroOut = trailing.every(
        (t) =>
          (t.outsInPlay === 0 && t.runsInPlay === 0) ||
          (t.resultCode === "other" && t.runsInPlay === 0)
      );

      if (
        (thirdOutHasExplicitThreeMark &&
          (trailingArePhantomOrZeroOut || scoreAlreadyMatchesAtThreeOuts)) ||
        (scoreAlreadyMatchesAtThreeOuts && trailingArePhantomOrZeroOut)
      ) {
        output.push(...innList.slice(0, threeOutIndex + 1));
        continue;
      }
    }

    output.push(...innList);
  }

  return output;
}

function extractPitchesFromObsLeftZone(obs: string): string[] {
  const m = obs.match(
    /左(?:BSO)?\s*[:：]\s*(.*?)(?=\s*\/\s*(?:中|中央|本一|右下|打球)|$)/i
  );
  if (!m) return [];
  const zone = m[1].trim();
  if (!zone || zone === "無" || zone === "なし" || zone === "空") return [];

  const tokens: string[] = [];
  for (const ch of Array.from(zone)) {
    if (ch === "○" || ch === "◯" || ch === "〇") {
      tokens.push("S");
    } else if (ch === "●" || ch === "／") {
      tokens.push("W");
    } else if (ch === "ー" || ch === "－" || ch === "・") {
      tokens.push("B");
    } else if (ch === "△" || ch === "▽" || ch === "レ") {
      tokens.push("F");
    } else if (ch === "▲" || ch === "▼") {
      tokens.push("BF");
    }
  }
  return tokens;
}

/**
 * Stage 2 の視覚観察フィールド（obs / b1）と構造化フィールド（rc / dir / eo / o / p / a）の論理整合を検証する。
 * ※安打・失策・野選・死球などの正当な出塁を b1 のみでフライアウトへ強制上書きする破壊的変換は行わず、
 *   1) 無走者でアウト記号＋明確な守備アウト記号があるのに四球（walk）と誤出力されたケース
 *   2) 明確な送球ハイフン番号（6-3, 4-3, 5-3, 1-3, 2-3, 3-1）なのにフライになっているケース
 *   3) 傘マーク（⌒,︵）や外野単独番号（7, 8, 9）の打者アウトなのにゴロになっているケース
 * のみを野球規則に沿って非破壊で補正する。
 */
function reconcileRawAtBatEvidence(
  ab: RawGeminiAtBat,
  activeBases: Record<"1B" | "2B" | "3B", boolean>
): ReconciledAtBatEvidence {
  const obs = (ab.obs || "").trim();
  let rawResultCode = (ab.rc ?? ab.resultCode)?.trim();
  let rawResultLabel = (ab.rl ?? ab.resultLabel)?.trim();
  let rawDir = (ab.dir ?? ab.battedDirection)?.trim();
  let outsInPlay = Math.max(
    0,
    Math.min(3, toFiniteInt(ab.o ?? ab.outsInPlay, 0) || 0)
  );
  let endingOuts = Math.max(
    0,
    Math.min(3, toFiniteInt(ab.eo ?? ab.endingOuts, 0) || 0)
  );
  let rawPitches = [...(ab.p || ab.pitches || [])];
  let rawAdvances = [...(ab.a || ab.advances || [])];

  // 1. 中央ゾーンのローマ数字（Ⅰ・Ⅱ・Ⅲ）および丸数字（①・②・③）から endingOuts を補完
  if (endingOuts === 0 && obs) {
    const centerMatch = obs.match(/(?:中|中央)\s*[:：]\s*([^/]+)/);
    const centerText = centerMatch ? centerMatch[1].trim() : "";
    if (/[Ⅲ③]|III/.test(centerText)) {
      endingOuts = 3;
    } else if (/[Ⅱ②]|II/.test(centerText)) {
      endingOuts = 2;
    } else if (/[Ⅰ①]|(?<![A-Za-z])I(?![A-Za-z])/.test(centerText)) {
      endingOuts = 1;
    }
  }

  // 2. 本塁→1塁線の実線有無（b1）の復元
  let effectiveB1: boolean | undefined =
    typeof ab.b1 === "boolean" ? ab.b1 : undefined;
  if (effectiveB1 === undefined && obs) {
    if (/本一\s*[:：]?\s*(?:破線|点線|無|なし|未)/.test(obs)) {
      effectiveB1 = false;
    } else if (/本一\s*[:：]?\s*(?:実線|赤線|有|あり|到達)/.test(obs)) {
      effectiveB1 = true;
    }
  }

  // 右下ゾーン観察テキストの抽出（dir が未入力のときのみ補完）
  const rbMatch = obs.match(/(?:右下|打球)\s*[:：]\s*([^/]+)/);
  const rbText = rbMatch ? rbMatch[1].trim() : "";
  if (
    !rawDir &&
    rbText &&
    rbText !== "無" &&
    rbText !== "なし" &&
    !/^(?:B|BB|四球|D|死球|K|SO|三振)$/i.test(rbText)
  ) {
    const cleanedRb = rbText.replace(/\(.*?\)|（.*?）/g, "").trim();
    if (cleanedRb) {
      rawDir = cleanedRb;
    }
  }

  const prelimCode = inferCanonicalResultCode(
    rawResultCode,
    rawResultLabel || rawDir
  );

  const hasAnyActiveRunner =
    activeBases["1B"] || activeBases["2B"] || activeBases["3B"];
  const combinedHint = `${rawDir || ""} ${rawResultLabel || ""} ${rbText}`.trim();
  const hasExplicitOutPlaySymbol =
    /[1-9]-[1-9]/.test(combinedHint) ||
    /[⌒︵︶∩^]\s*[1-9]/.test(combinedHint) ||
    /^[1-9][FL]$/i.test(rawDir || "") ||
    /\b(?:K|SO)\b|三振|飛|フライ|ライナー|ゴロ/i.test(combinedHint);

  // 3-A. 無走者・本一破線・中央アウト記号あり・明確なアウト打球記号ありなのに "walk" になっている場合のみアウトへ補正
  const isWalkMisreadAsOut =
    prelimCode === "walk" &&
    effectiveB1 === false &&
    endingOuts >= 1 &&
    !hasAnyActiveRunner &&
    hasExplicitOutPlaySymbol;

  if (isWalkMisreadAsOut) {
    if (/[1-9]-[1-9]-[1-9]/.test(combinedHint)) {
      rawResultCode = "double_play";
      outsInPlay = Math.max(2, outsInPlay);
    } else if (/[1-9]-[1-9]/.test(combinedHint)) {
      rawResultCode = "groundout";
      outsInPlay = Math.max(1, outsInPlay);
    } else if (/\b(?:K|SO)\b|三振/i.test(combinedHint)) {
      rawResultCode = "strikeout";
      outsInPlay = Math.max(1, outsInPlay);
    } else {
      rawResultCode = "flyout";
      outsInPlay = Math.max(1, outsInPlay);
    }

    if (rawResultLabel && /四球/.test(rawResultLabel)) {
      rawResultLabel = "";
    }

    rawAdvances = rawAdvances.filter((adv) => {
      const f = normalizeFromBase(adv.f ?? adv.from);
      const isOut = Boolean(adv.io ?? adv.isOut);
      return !(f === "BAT" && !isOut);
    });

    if (rawPitches.length === 0) {
      const obsPitches = extractPitchesFromObsLeftZone(obs);
      if (obsPitches.length > 0) {
        rawPitches =
          rawResultCode === "strikeout" ? obsPitches : [...obsPitches, "X"];
      }
    }
  } else {
    // 3-B. ゴロ vs フライの野球物理整合（守備記号と結果コードの食い違いを非破壊補正）
    const normDir = (rawDir || "")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/([1-9])\s*[－ー―‐→⇒]\s*([1-9])/g, "$1-$2")
      .trim();

    if (
      prelimCode === "flyout" &&
      /^[1-6]-[1-6]$/.test(normDir) &&
      !/犠|直|ライナー|併殺/.test(rawResultLabel || "")
    ) {
      // 6-3, 4-3, 5-3, 1-3, 2-3, 3-1 等の内野2連送球1死はゴロ・封殺
      rawResultCode = "groundout";
      if (rawResultLabel && /飛|フライ/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
    } else if (
      prelimCode === "groundout" &&
      (/^[⌒︵︶∩^]\s*[1-9]/.test(normDir) ||
        /^[789][FL]?$/i.test(normDir) ||
        /^[1-9][FL]$/i.test(normDir)) &&
      !/ゴロ|封/.test(rawResultLabel || "")
    ) {
      // 傘マーク付き、邪飛(F)・ライナー(L)、または送球無しの外野単独捕球(7, 8, 9)はフライ・ライナー
      rawResultCode = "flyout";
      if (rawResultLabel && /ゴロ/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
    }

    // 投球配列が空のときのみ obs の左BSO観察メモから補完（既存の投球配列は上書きしない）
    if (rawPitches.length === 0 && obs) {
      const obsPitches = extractPitchesFromObsLeftZone(obs);
      if (obsPitches.length > 0) {
        rawPitches = obsPitches;
      }
    }
  }

  return {
    rawResultCode,
    rawResultLabel,
    rawDir,
    outsInPlay,
    endingOuts,
    rawPitches,
    rawAdvances,
  };
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
      s === "◐" ||
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
    } else if (
      s === "ball" ||
      s === "b" ||
      s === "ー" ||
      s === "－" ||
      s === "-" ||
      s === "・" ||
      s.includes("ボール")
    ) {
      mapped.push("ball");
    } else if (
      s === "swinging_strike" ||
      s === "w" ||
      s === "●" ||
      s === "／" ||
      s.includes("空振") ||
      s.includes("swing")
    ) {
      mapped.push("swinging_strike");
    } else if (
      s === "strike" ||
      s === "s" ||
      s === "○" ||
      s === "◯" ||
      s === "〇" ||
      s.includes("見逃") ||
      s.includes("ストライク")
    ) {
      mapped.push("strike");
    } else if (
      s === "foul" ||
      s === "f" ||
      s === "△" ||
      s === "▽" ||
      s === "レ" ||
      s.includes("ファウル")
    ) {
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

  // インプレー結果（安打・ゴロ・フライ等）の前に印刷横罫線の誤読等でボールが4球以上入っている場合は3球上限に正規化
  if (isHitResult || isInPlayOutOrReach) {
    let ballSeen = 0;
    let pureStrikeSeen = 0;
    const sanitizedPreInPlay: CanonicalPitchResult[] = [];
    for (let idx = 0; idx < mapped.length; idx++) {
      const p = mapped[idx];
      if (p === "ball") {
        if (ballSeen >= 3) continue;
        ballSeen += 1;
      } else if (
        p === "strike" ||
        p === "swinging_strike" ||
        p === "bunt_swinging"
      ) {
        if (pureStrikeSeen >= 2) continue;
        pureStrikeSeen += 1;
      }
      sanitizedPreInPlay.push(p);
    }
    mapped.length = 0;
    mapped.push(...sanitizedPreInPlay);
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

/**
 * Stage 1 の登板投手リストを正規化する:
 * - スコアブック下部の「投球回数（例: 4回, 2回, 1回）」をそのまま終了回（1〜4, 1〜2, 1〜1）として返してしまった場合に累積イニング範囲（1〜4, 5〜6, 7〜7）へ自動変換
 * - 先発の toInning が未指定で最終回になっており 2番手以降の fromInning が途中回を指している場合の重複/空白補正
 * - 回途中の投手交代（例: 1〜4回 と 4〜7回 の同一回オーバーラップ）はそのまま保持
 */
function normalizePitcherStints(
  stints: ScorebookPitcherStint[],
  maxInning: number
): ScorebookPitcherStint[] {
  const safeMax = Math.max(1, maxInning);
  if (stints.length === 0) return [];

  const sorted = [...stints]
    .sort((a, b) => a.order - b.order)
    .map((p, idx) => ({
      ...p,
      order: idx + 1,
      fromInning: Math.max(1, Math.round(p.fromInning || 1)),
      toInning: Math.max(1, Math.round(p.toInning || safeMax)),
    }));

  if (sorted.length === 1) {
    return [
      {
        ...sorted[0],
        fromInning: 1,
        toInning: Math.max(sorted[0].toInning, safeMax),
      },
    ];
  }

  // パターン1: 2番手以降もすべて fromInning === 1 かつ先発が 2回以上 ➔ 「投球回数（期間）」をそのまま出力したケース
  const looksLikeDurationMode =
    sorted[0].fromInning === 1 &&
    sorted[0].toInning >= 2 &&
    sorted.slice(1).every((p) => p.fromInning === 1);

  if (looksLikeDurationMode) {
    const durations = sorted.map((p) => Math.max(1, p.toInning));
    let cursor = 1;
    return sorted.map((p, idx) => {
      const dur = durations[idx];
      const remainingDur = durations
        .slice(idx + 1)
        .reduce((acc, v) => acc + v, 0);
      const from = Math.min(safeMax, cursor);
      const isLast = idx === sorted.length - 1;
      const to = isLast
        ? Math.max(from, safeMax)
        : Math.min(safeMax, from + dur - 1);
      // 残り投球回数と合算して最終回を超える場合はイニング途中交代（1/3, 2/3）のため同一回を重ねる
      cursor =
        to + remainingDur > safeMax ? to : Math.min(safeMax, to + 1);
      return {
        ...p,
        fromInning: from,
        toInning: Math.max(from, to),
      };
    });
  }

  // パターン2: 通常のイニング番号指定の単調性＆空白ギャップ補正
  const result = sorted.map((p) => ({ ...p }));
  result[0].fromInning = 1;

  for (let i = 0; i < result.length - 1; i++) {
    const cur = result[i];
    const nxt = result[i + 1];
    nxt.fromInning = Math.max(cur.fromInning, Math.min(safeMax, nxt.fromInning));

    if (cur.toInning >= safeMax && nxt.fromInning > cur.fromInning) {
      // 前の投手の終了回が未確定(最終回デフォルト)だった場合は次投手の開始直前回に合わせる
      cur.toInning = Math.max(cur.fromInning, nxt.fromInning - 1);
    } else if (cur.toInning > nxt.fromInning) {
      // 逆転している場合は交代発生回で揃える
      cur.toInning = nxt.fromInning;
    } else if (cur.toInning < nxt.fromInning - 1) {
      // 担当投手が不在の空白イニングを作らないよう前の投手の終了回を繋ぐ
      cur.toInning = nxt.fromInning - 1;
    }
    cur.toInning = Math.max(cur.fromInning, cur.toInning);
  }

  const last = result[result.length - 1];
  last.toInning = Math.max(last.fromInning, last.toInning, safeMax);

  return result;
}

function medianOfNumbers(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 印刷されたスコアブック罫線の等間隔性（全打順行が等高・全イニング物理列が等幅・隣接境界が完全一致）を利用し、
 * Stage 1 の生座標から「選手欄への食い込み」と「上下左右の隣接マス映り込み」を数学的にゼロへ正則化する。
 */
function regularizeSheetGridGeometry(
  batters: ScorebookBatterSlot[],
  innings: ScorebookInningMeta[],
  rawLineupRightX?: number
): {
  batters: ScorebookBatterSlot[];
  innings: ScorebookInningMeta[];
  lineupRightX: number;
} {
  const validRawLR =
    typeof rawLineupRightX === "number" &&
    rawLineupRightX >= 165 &&
    rawLineupRightX <= 480
      ? rawLineupRightX
      : undefined;

  const firstInn = innings[0];
  const firstColX1 =
    firstInn &&
    firstInn.inning === 1 &&
    firstInn.columnBox &&
    firstInn.columnBox[1] >= 165 &&
    firstInn.columnBox[1] <= 480
      ? firstInn.columnBox[1]
      : undefined;

  let leftX = 310;
  if (validRawLR !== undefined && firstColX1 !== undefined) {
    if (Math.abs(validRawLR - firstColX1) <= 22) {
      leftX = Math.round((validRawLR + firstColX1) / 2);
    } else if (
      Math.min(validRawLR, firstColX1) < 245 &&
      Math.max(validRawLR, firstColX1) >= 245
    ) {
      // 日本のスコアブックは打順・守備・背番号・選手名まで含めると X>=245 になるため選手欄食い込み側を棄却
      leftX = Math.max(validRawLR, firstColX1);
    } else {
      leftX = Math.round((validRawLR + firstColX1) / 2);
    }
  } else if (validRawLR !== undefined) {
    leftX = validRawLR;
  } else if (firstColX1 !== undefined) {
    leftX = firstColX1;
  }

  const B = batters.length;
  const K = innings.length;

  // --- Y方向（1番〜最終打順の水平罫線）の正則化 ---
  const validRows = batters
    .map((b, idx) => ({ idx, box: b.rowBox }))
    .filter(
      (r): r is { idx: number; box: NormalizedBox } =>
        Boolean(
          r.box &&
            r.box[0] >= 40 &&
            r.box[2] <= 965 &&
            r.box[2] - r.box[0] >= 26 &&
            r.box[2] - r.box[0] <= 135
        )
    );

  const validColYs = innings
    .map((m) => m.columnBox)
    .filter((box): box is NormalizedBox =>
      Boolean(
        box &&
          box[0] >= 40 &&
          box[2] <= 965 &&
          box[2] - box[0] >= Math.max(220, Math.max(1, B) * 26)
      )
    );

  const rowHeightSamples: number[] = [
    ...validRows.map((r) => r.box[2] - r.box[0]),
    ...(B > 0 ? validColYs.map((box) => (box[2] - box[0]) / B) : []),
  ];
  let fittedRowH = medianOfNumbers(rowHeightSamples, 66);

  if (validRows.length >= 2) {
    const firstR = validRows[0];
    const lastR = validRows[validRows.length - 1];
    if (lastR.idx - firstR.idx >= 3) {
      const spanH =
        (lastR.box[2] - firstR.box[0]) / (lastR.idx - firstR.idx + 1);
      if (spanH >= 32 && spanH <= 120) {
        fittedRowH = spanH;
      }
    }
  }

  const topEstimates: number[] = [
    ...validRows.map((r) => r.box[0] - r.idx * fittedRowH),
    ...validRows.map((r) => r.box[2] - (r.idx + 1) * fittedRowH),
    ...validColYs.map((box) => box[0]),
  ];
  const topY = Math.max(
    45,
    Math.min(360, Math.round(medianOfNumbers(topEstimates, 165)))
  );
  const bottomY =
    B > 0
      ? Math.max(
          topY + B * 28,
          Math.min(965, Math.round(topY + B * fittedRowH))
        )
      : Math.min(920, Math.round(topY + 9 * fittedRowH));

  const yBorders: number[] = new Array(B + 1);
  if (B > 0) {
    const effRowH = (bottomY - topY) / B;
    yBorders[0] = topY;
    yBorders[B] = bottomY;
    for (let i = 1; i < B; i++) {
      const idealY = topY + effRowH * i;
      const prevBot = batters[i - 1].rowBox?.[2];
      const nextTop = batters[i].rowBox?.[0];
      let candidateY = idealY;
      if (
        prevBot !== undefined &&
        nextTop !== undefined &&
        Math.abs(prevBot - nextTop) <= 22
      ) {
        candidateY = (prevBot + nextTop) / 2;
      }
      const clampedY = Math.max(
        idealY - effRowH * 0.14,
        Math.min(idealY + effRowH * 0.14, candidateY)
      );
      yBorders[i] = Math.max(yBorders[i - 1] + 24, Math.round(clampedY));
    }
  }

  const regularizedBatters: ScorebookBatterSlot[] = batters.map((b, idx) => ({
    ...b,
    rowBox: sanitizeBox(yBorders[idx], 0, yBorders[idx + 1], leftX),
  }));

  if (K === 0) {
    return {
      batters: regularizedBatters,
      innings: [],
      lineupRightX: leftX,
    };
  }

  // --- X方向（1回〜最終回の縦罫線）の正則化 ---
  const weights = innings.map((m) => Math.max(1, m.columnCount || 1));
  const totalCols = weights.reduce((acc, w) => acc + w, 0);

  const unitWidthSamples: number[] = [];
  for (const m of innings) {
    if (
      m.columnBox &&
      m.columnBox[1] >= 150 &&
      m.columnBox[3] <= 975 &&
      m.columnBox[3] > m.columnBox[1] + 20
    ) {
      const uW =
        (m.columnBox[3] - m.columnBox[1]) / Math.max(1, m.columnCount || 1);
      if (uW >= 24 && uW <= 135) {
        unitWidthSamples.push(uW);
      }
    }
  }

  const fallbackUnitW = Math.max(
    36,
    Math.min(82, (865 - leftX) / Math.max(7, totalCols))
  );
  const medianUnitW = medianOfNumbers(unitWidthSamples, fallbackUnitW);

  const gridStartX =
    firstInn.inning > 1 &&
    firstInn.columnBox &&
    firstInn.columnBox[1] >= leftX + 20
      ? firstInn.columnBox[1]
      : leftX;

  const expectedEndX = Math.min(
    965,
    Math.round(gridStartX + totalCols * medianUnitW)
  );
  const lastRawBox = innings[K - 1].columnBox;
  let gridEndX = expectedEndX;
  if (
    lastRawBox &&
    lastRawBox[3] > gridStartX + totalCols * 22 &&
    lastRawBox[3] <= 970
  ) {
    const rawAvgUnitW = (lastRawBox[3] - gridStartX) / totalCols;
    if (
      rawAvgUnitW >= medianUnitW * 0.78 &&
      rawAvgUnitW <= medianUnitW * 1.25
    ) {
      gridEndX = lastRawBox[3];
    }
  }
  gridEndX = Math.max(gridStartX + totalCols * 24, Math.min(970, gridEndX));

  const cumW: number[] = [0];
  for (let k = 0; k < K; k++) {
    cumW.push(cumW[k] + weights[k]);
  }

  const effUnitW = (gridEndX - gridStartX) / totalCols;
  const xBorders: number[] = new Array(K + 1);
  xBorders[0] = gridStartX;
  xBorders[K] = gridEndX;

  for (let k = 1; k < K; k++) {
    const idealX = gridStartX + effUnitW * cumW[k];
    const prevRight = innings[k - 1].columnBox?.[3];
    const nextLeft = innings[k].columnBox?.[1];
    let candidateX = idealX;
    if (
      prevRight !== undefined &&
      nextLeft !== undefined &&
      Math.abs(prevRight - nextLeft) <= 26
    ) {
      candidateX = (prevRight + nextLeft) / 2;
    } else if (
      prevRight !== undefined &&
      Math.abs(prevRight - idealX) <= effUnitW * 0.24
    ) {
      candidateX = prevRight;
    } else if (
      nextLeft !== undefined &&
      Math.abs(nextLeft - idealX) <= effUnitW * 0.24
    ) {
      candidateX = nextLeft;
    }

    const clampedX = Math.max(
      idealX - effUnitW * 0.18,
      Math.min(idealX + effUnitW * 0.18, candidateX)
    );
    xBorders[k] = Math.max(
      xBorders[k - 1] + weights[k - 1] * 20,
      Math.round(clampedX)
    );
  }

  const regularizedInnings: ScorebookInningMeta[] = innings.map((m, k) => ({
    ...m,
    columnBox: sanitizeBox(topY, xBorders[k], bottomY, xBorders[k + 1]),
  }));

  return {
    batters: regularizedBatters,
    innings: regularizedInnings,
    lineupRightX: leftX,
  };
}

/**
 * 1イニング2列・3列以上（打者一巡・二巡）や 9番➔1番の折り返しがあるイニングにおいて、
 * AIが「行の上から順（1番〜9番）」に出力してしまったり列番号 c をすべて 1 にしてしまった場合でも、
 * 野球の打順循環則と2通りの折り返し記法（一巡充填式／9番下端折り返し式）から
 * 時系列順と正確なサブ列番号 (c: 1, 2, 3...) を数学的に復元する。
 */
function orderAndAssignColumnsForChunk(
  rawItems: RawGeminiAtBat[],
  sortedTargets: number[],
  structure: ScorebookSheetStructure,
  initialExpectedLeadOff?: number
): RawGeminiAtBat[] {
  const B = Math.max(9, structure.batters.length);
  let runningLeadOff: number | undefined =
    initialExpectedLeadOff && initialExpectedLeadOff >= 1 && initialExpectedLeadOff <= B
      ? initialExpectedLeadOff
      : sortedTargets[0] === 1
      ? 1
      : undefined;

  const output: RawGeminiAtBat[] = [];

  for (const inn of sortedTargets) {
    const innItems = rawItems.filter(
      (ab) => (toFiniteInt(ab.i ?? ab.inning, sortedTargets[0]) || sortedTargets[0]) === inn
    );
    if (innItems.length === 0) {
      continue;
    }

    const meta = structure.innings.find((m) => m.inning === inn);
    const metaCols = Math.max(1, meta?.columnCount ?? 1);

    // 同一打順内では左の列（c昇順）➔ 出現順が必ず1打席目(lap=0), 2打席目(lap=1), 3打席目(lap=2)...となる
    const byBo = new Map<
      number,
      Array<{ raw: RawGeminiAtBat; bo: number; rawCol: number; origIdx: number }>
    >();
    innItems.forEach((raw, origIdx) => {
      const bo = Math.max(
        1,
        Math.min(B, toFiniteInt(raw.bo ?? raw.battingOrder, 1) || 1)
      );
      const rawCol = Math.max(
        1,
        toFiniteInt(raw.c ?? raw.columnIndex, 1) || 1
      );
      const arr = byBo.get(bo) || [];
      arr.push({ raw, bo, rawCol, origIdx });
      byBo.set(bo, arr);
    });

    const tagged: Array<{
      raw: RawGeminiAtBat;
      bo: number;
      rawCol: number;
      origIdx: number;
      lap: number;
    }> = [];
    const counts = new Array<number>(B + 1).fill(0);
    let maxLap = 0;

    for (let bo = 1; bo <= B; bo++) {
      const list = byBo.get(bo) || [];
      list.sort((a, b) =>
        a.rawCol !== b.rawCol ? a.rawCol - b.rawCol : a.origIdx - b.origIdx
      );
      counts[bo] = list.length;
      list.forEach((entry, lap) => {
        if (lap > maxLap) maxLap = lap;
        tagged.push({ ...entry, lap });
      });
    }

    const minCount = Math.min(...counts.slice(1));
    const maxCount = Math.max(...counts.slice(1));
    const wrappedAround =
      (counts[B] > 0 && counts[1] > 0) ||
      innItems.length > B ||
      maxCount >= 2;

    if (!wrappedAround) {
      // 9番➔1番を跨がない通常イニングは打順の昇順がそのまま時系列順
      tagged.sort((a, b) =>
        a.bo !== b.bo ? a.bo - b.bo : a.origIdx - b.origIdx
      );
    } else {
      // 循環カウント段差（前の打順より登場回数が1回増える境界＝その回の真の先頭打者）を検出
      const stepUpCandidates: number[] = [];
      for (let bo = 1; bo <= B; bo++) {
        const prevBo = bo === 1 ? B : bo - 1;
        if (counts[prevBo] < counts[bo]) {
          stepUpCandidates.push(bo);
        }
      }

      let effectiveLeadOff = 1;
      if (runningLeadOff !== undefined) {
        if (
          minCount === maxCount ||
          stepUpCandidates.includes(runningLeadOff)
        ) {
          effectiveLeadOff = runningLeadOff;
        } else if (stepUpCandidates.length === 1) {
          effectiveLeadOff = stepUpCandidates[0];
        } else {
          effectiveLeadOff = runningLeadOff;
        }
      } else if (stepUpCandidates.length === 1) {
        effectiveLeadOff = stepUpCandidates[0];
      } else {
        // ちょうど9人または18人で counts が全員同数の場合:
        // 「9番下端折り返し式」なら 1番が c>=2 で先頭打者が c=1 になる境界が存在する
        let colStepCandidate: number | undefined;
        for (let bo = 2; bo <= B; bo++) {
          const prevFirst = byBo.get(bo - 1)?.[0];
          const curFirst = byBo.get(bo)?.[0];
          if (prevFirst && curFirst && prevFirst.rawCol > curFirst.rawCol) {
            colStepCandidate = bo;
            break;
          }
        }
        effectiveLeadOff =
          colStepCandidate ??
          Math.max(
            1,
            Math.min(
              B,
              toFiniteInt(innItems[0].bo ?? innItems[0].battingOrder, 1) || 1
            )
          );
      }

      tagged.sort((a, b) => {
        const keyA = a.lap * B + ((a.bo - effectiveLeadOff + B) % B);
        const keyB = b.lap * B + ((b.bo - effectiveLeadOff + B) % B);
        return keyA !== keyB ? keyA - keyB : a.origIdx - b.origIdx;
      });
    }

    // サブ列番号 c (1, 2, 3...) の単調性＆周回下限 (c >= lap + 1) を保証
    const maxAllowedCols = Math.max(metaCols, maxLap + 1);
    let prevCol = 1;
    for (const item of tagged) {
      const minRequiredCol = item.lap + 1;
      const clampedRawCol = Math.max(1, Math.min(maxAllowedCols, item.rawCol));
      const assignedCol = Math.min(
        maxAllowedCols,
        Math.max(prevCol, minRequiredCol, clampedRawCol)
      );
      prevCol = assignedCol;
      output.push({
        ...item.raw,
        i: inn,
        inning: inn,
        bo: item.bo,
        battingOrder: item.bo,
        c: assignedCol,
        columnIndex: assignedCol,
      });
    }

    // 同一チャンク内の次イニング向けに先頭打順を更新
    const lastEntry = tagged[tagged.length - 1];
    if (lastEntry) {
      const lastRc = (lastEntry.raw.rc ?? lastEntry.raw.resultCode ?? "").trim();
      const rawAdvs = lastEntry.raw.a || lastEntry.raw.advances || [];
      const endedByRunnerOutOnly =
        lastRc === "other" &&
        rawAdvs.some((adv) => Boolean(adv.io ?? adv.isOut));
      runningLeadOff = endedByRunnerOutOnly
        ? lastEntry.bo
        : (lastEntry.bo % B) + 1;
    }
  }

  return output;
}

/**
 * 確定済みの「イニング列（打者一巡時は columnIndex に応じた部分列）× 打順行」の直積交差から
 * 1マスの正確な領域 [ymin, xmin, ymax, xmax] を決定論的に算出する。
 */
function computeCartesianCellBox(
  rawCellBox: NormalizedBox | undefined,
  inningColBox: NormalizedBox | undefined,
  inningColumnCount: number,
  columnIndex: number,
  batterRowBox: NormalizedBox | undefined
): NormalizedBox | undefined {
  if (inningColBox && batterRowBox) {
    const [, colX1, , colX2] = inningColBox;
    const [rowY1, , rowY2] = batterRowBox;
    const totalSubCols = Math.max(1, inningColumnCount || 1);
    const safeSubIdx = Math.max(1, Math.min(totalSubCols, columnIndex || 1));
    const subW = (colX2 - colX1) / totalSubCols;
    const subX1 = Math.round(colX1 + (safeSubIdx - 1) * subW);
    const subX2 = Math.round(colX1 + safeSubIdx * subW);
    return sanitizeBox(rowY1, subX1, rowY2, subX2);
  }

  if (!rawCellBox) {
    return undefined;
  }

  let [y1, x1, y2, x2] = rawCellBox;
  if (inningColBox) {
    x1 = inningColBox[1];
    x2 = inningColBox[3];
  }
  if (batterRowBox) {
    y1 = batterRowBox[0];
    y2 = batterRowBox[2];
  }
  return sanitizeBox(y1, x1, y2, x2);
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

