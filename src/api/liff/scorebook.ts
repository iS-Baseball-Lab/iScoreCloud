// filepath: src/api/liff/scorebook.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureMatchLineupColumns } from "@/lib/db-helper";
import {
  defaultGenericDirection,
  harmonizeOcrFieldingAndLabel,
} from "@/lib/liff/scorebook-fielding";
import {
  formatBaseJa,
  materializeSheetRunnerAdvances,
} from "@/lib/liff/scorebook-runners";
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
  isRunnerOnlyInningEnd,
  matchRosterPlayer,
  normalizePositionCode,
  reconcileSheetExcessOutsDeterministically,
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
  type ExcessOutInningSpec,
  type ImportScopeMode,
  type MissingOrderGapSpec,
  type NormalizedBox,
  type ResolvedMissingAtBatItem,
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

const {
  matches,
  tournaments,
  matchLineups,
  teams,
  players,
  atBats,
  pitches,
  baseAdvances,
  playLogs,
  matchScorebookSnapshots,
} = schema;

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
 * チーム共通「スコア記号早見表」のインメモリキャッシュ（5分TTL）。
 * 1試合14イニングの連続・並列チャンク解析時に毎回D1クエリ＋R2画像取得＋Base64変換が走る無駄を排除する。
 */
const LEGEND_PART_CACHE = new Map<
  string,
  { expiresAt: number; part: GeminiInlineDataPart | null }
>();

/**
 * Gemini 3 マルチプール・フェイルオーバールーティング:
 * - 廃止・無料枠ゼロ・404のモデル（旧2.5系 / 3.5-flash / gemini-flash-latest / gemini-3.8-flash-lite）を完全排除
 * - Stage 2 (chunk) は歪み補正＆にじみ分解ズーム付き画像単体＋thinkingMode: "level_medium" により、
 *   手書きの「くっつき文字・にじみ」を1画ずつ論理分解する高精度推論と 1イニング10〜17秒の高速応答を両立する
 */
function getGeminiModelConfigs(
  mode: GeminiCallMode
): readonly GeminiModelAttemptConfig[] {
  const isDeepChunk = mode === "chunk";
  return [
    {
      model: "gemini-3.8-flash",
      firstResponseTimeoutMs: isDeepChunk ? 24_000 : 34_000,
      firstTextTimeoutMs: isDeepChunk ? 38_000 : 50_000,
      thinkingMode: "level_medium",
      backoffBeforeMs: 0,
    },
    {
      model: "gemini-3.6-flash",
      firstResponseTimeoutMs: isDeepChunk ? 22_000 : 32_000,
      firstTextTimeoutMs: isDeepChunk ? 36_000 : 48_000,
      thinkingMode: "level_medium",
      backoffBeforeMs: 150,
    },
    {
      model: "gemini-3.5-flash-lite",
      firstResponseTimeoutMs: isDeepChunk ? 19_000 : 28_000,
      firstTextTimeoutMs: isDeepChunk ? 30_000 : 42_000,
      thinkingMode: "level_medium",
      backoffBeforeMs: 150,
    },
    {
      model: "gemini-3.1-flash-lite",
      firstResponseTimeoutMs: isDeepChunk ? 15_000 : 26_000,
      firstTextTimeoutMs: isDeepChunk ? 24_000 : 40_000,
      thinkingMode: isDeepChunk ? "level_low" : "level_medium",
      backoffBeforeMs: 150,
    },
    {
      model: "gemini-flash-lite-latest",
      firstResponseTimeoutMs: isDeepChunk ? 14_000 : 24_000,
      firstTextTimeoutMs: isDeepChunk ? 22_000 : 36_000,
      thinkingMode: "level_low",
      backoffBeforeMs: 200,
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
      LEGEND_PART_CACHE.delete(targetTeam.id);

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
    LEGEND_PART_CACHE.delete(targetTeam.id);

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
  imageBase64?: string;
  mimeType?: string;
  focusCropBase64?: string;
  focusCropMimeType?: string;
  structure: ScorebookSheetStructure;
  targetInnings: number[];
  expectedLeadOffOrder?: number;
  nextInningLeadOffOrder?: number;
  legendBase64?: string;
  legendMimeType?: string;
  skipModels?: string[];
}

liffScorebookRouter.post("/analyze-inning-chunk", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, error: "GEMINI_API_KEY が設定されていません" }, 500);
  }

  const db = drizzle(c.env.DB, { schema });
  const reqStartMs = Date.now();
  const cooledModels: string[] = [];

  try {
    const body = (await c.req.json()) as AnalyzeInningChunkPayload;
    if (
      (!body.focusCropBase64 && !body.imageBase64) ||
      !body.structure ||
      !Array.isArray(body.targetInnings) ||
      body.targetInnings.length === 0
    ) {
      return c.json({ success: false, error: "解析パラメータが不足しています" }, 400);
    }

    const sideLabel = body.isTop ? "表（先攻）" : "裏（後攻）";
    const sortedTargets = [...body.targetInnings].sort((a, b) => a - b);

    const hasMultiColTarget = sortedTargets.some((innNum) => {
      const m = body.structure.innings.find((x) => x.inning === innNum);
      return (m?.columnCount ?? 1) >= 2;
    });

    const imageParts: GeminiContentPart[] = [];
    const stage2ImageGuide: string[] = [];
    let focusImgLabel = "画像1";

    // focusCropBase64 がある場合は、巨大な全体シート画像を送らず高精細デュアルビュー画像のみを送ることで、
    // Visionトークン量と通信ペイロードを半減させて解析速度を劇的に高め、隣接イニングの視覚混入も防ぐ
    if (body.focusCropBase64) {
      imageParts.push({
        inlineData: {
          mimeType: body.focusCropMimeType || "image/jpeg",
          data: body.focusCropBase64,
        },
      });
      focusImgLabel = `画像${imageParts.length}`;
      stage2ImageGuide.push(
        `・${focusImgLabel}: 【🔥最優先で精読！ ${sortedTargets.join(
          "・"
        )}回専用・歪み補正＆にじみ分解トリプルビュー画像】左端に「イニング見出し〜1番〜9番〜下段得点欄までの連続1列ストリップ（どの打順が記入済みでどの打順が白紙空欄か・3アウト直下の終了斜線『／』『∟』・投手交代波線を一目で確認用）」、中央〜右側に「1番〜最終打順を上から下へ並べた各打席行」を配置しています！さらに各打順行のマスは、左から **[全体マス] ➔ [BSO拡大（にじみ分解済）] ➔ [中央・右下拡大（にじみ分解済）]** の3パネルが横並びになっています（※同じ横1行にあるこの3パネルは「同じ1打席の部分拡大」であり、絶対に複数打席として重複出力しないこと！）。${
          hasMultiColTarget
            ? "2列以上を使用する回はサブ列グループごとに [c:1]（1列目）・[c:2]（2列目）・[c:3]（3列目）として分離表示しています！"
            : ""
        }必ず左端の連続ストリップで「実際に手書き記録がある打順範囲」を特定したうえで、右側の [BSO拡大] と [中央・右下拡大] を使ってくっついた文字やにじんだ筆跡を1画ずつ分解精読してください！`
      );
    } else if (body.imageBase64) {
      imageParts.push({
        inlineData: {
          mimeType: body.mimeType || "image/jpeg",
          data: body.imageBase64,
        },
      });
      focusImgLabel = `画像${imageParts.length}`;
      stage2ImageGuide.push(
        `・${focusImgLabel}: 外周4辺に0〜1000目盛りルーラーが付いたスコアブック片面全体画像`
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
          ? `⚠️打者一巡以上のため【${meta.columnCount}列（c:1〜c:${meta.columnCount}）】使用！${focusImgLabel}の [c:1]〜[c:${meta.columnCount}] を時系列順に全て読み取り、各打席の列番号 c (1〜${meta.columnCount}) を正確に出力すること！`
          : "1列使用 (c:1)";
      const boxNote =
        !body.focusCropBase64 && meta.columnBox
          ? ` (列座標目安 ymin:${meta.columnBox[0]}, xmin:${meta.columnBox[1]}, ymax:${meta.columnBox[2]}, xmax:${meta.columnBox[3]})`
          : "";
      return `・${innNum}回${sideLabel}: 確定得点=${meta.runs}点, 安打目安=${meta.hits}本, ${colNote}${boxNote}`;
    });

    const multiColumnRuleBlock = hasMultiColTarget
      ? `
【🔥超重要 1.2: 1イニング2列・3列以上（打者一巡・二巡）の完全読取ルール】
- 対象イニングに【複数列（c:1, c:2, c:3...）】を使用する回が含まれています！${focusImgLabel}では各サブ列が左から **[c:1]（1列目）➔ [c:2]（2列目）➔ [c:3]（3列目）** として独立表示されています。
- 日本のスコアブックには以下の2通りの折り返し記法があります（どちらの記法でも白紙の空欄マスは絶対に出力せず、手書き記録があるマスだけを実際の打順時系列で出力してください）:
  1) **一巡充填式（標準）**: 先頭打者（例: 4番）から [c:1] を下へ進み、9番の次は同じ [c:1] の1番〜3番へ戻って9枠を埋め、10人目の打者（4番の2巡目）から [c:2] の4番の行へ移る（さらに19人目は [c:3] へ移る）。
  2) **9番下端折り返し式**: 先頭打者（例: 4番）から [c:1] の9番まで進んだら、次の1番打者からはすぐ右隣の [c:2] の1番の行へ移る（この場合 [c:1] の1番〜3番は白紙空欄になり、4番の2巡目は空いていた [c:2] の4番の行に書かれる）。
- **絶対厳守**: 必ず **先頭打者からスタートして打順が1つずつ循環（...8番➔9番➔1番➔2番...）する野球の時系列順** で出力し（上から1番〜9番の順になぞらないこと！）、その打席が書かれていた列に応じて **"c": 1, "c": 2, "c": 3** を正確に設定してください！3アウト目（③ または Ⅲ）が出るまで [c:2]・[c:3] の打席を絶対に落とさないでください！`
      : "";

    const lineupLen = Math.max(9, body.structure.batters.length);

    const leadOffConstraint =
      sortedTargets[0] === 1
        ? `\n🔥【先頭打者と最終打者（封殺・走塁死含む）の鉄則】1回${sideLabel}の最初の打者は必ず【1番打者】からスタートします！1番から1人ずつ打順を飛ばさず（1番→2番→3番→4番→5番...）下へ読み進め、**イニング終了斜線（／・∟）または白紙空欄の直前にある「実際に手書き記録がある最後の打者」まで漏れなく出力**してください！（※注意：4番打者が出塁した後に5番打者の遊ゴロ封殺6-4・野選FC・盗塁死等で3アウトチェンジになった場合、3アウト目の『Ⅲ』『③』は先行走者である4番の中央に書かれ、その直下の5番のマスに最終打席の投球・打球記号が書かれます！4番に『Ⅲ』があるからといって直下の5番の記入済み打席を絶対に切り捨てないでください！）`
        : body.expectedLeadOffOrder
        ? `\n📌【先頭打者の目安・打者一巡（9人全員記入）列の回転順・白紙マス除外の絶対原則】前イニング終了打順からの連続則（前のイニングの次の番号、または盗塁死・牽制死等の走塁死終了時は同一番号）では【${body.expectedLeadOffOrder}番打者】が${sortedTargets[0]}回${sideLabel}の先頭打者です！\n- **⚠️特に1イニング9人全員のマスが埋まっている場合（打者一巡）**: シート上端の「1番」から機械的に 1→2→...→9 と並べるのは絶対厳禁です！必ず先頭打者（目安: ${body.expectedLeadOffOrder}番）から下へ読み進め、9番の下端に達したら上端の1番（2列目折り返しまたは同一列上段）へ繋がり、3アウト目（『Ⅲ』『③』）の最終打者で終わる時系列順に出力してください。\n- 印刷された点線ダイヤモンドと薄いBSO枠線しか無い【白紙（空欄）マス】は絶対に出力せず、途中の打順を1人も飛ばさず連続した手書き打席ブロック（計3アウト分）を正確に抽出してください。`
        : `\n📌【連続打順・打者一巡列の回転順・白紙マス除外の絶対原則】印刷された点線ダイヤモンドと薄いBSO枠線しか無い【白紙（空欄）マス】は絶対に出力せず、実際に手書き記録がある連続した打席マス（途中の打順飛び無し・計3アウト分）だけを抽出してください。もし1イニング9人全員が埋まっている列では、シート上端の1番からではなく「Ⅰ→Ⅱ→Ⅲのアウト順が成立し、3アウト目の打者で終わる真の先頭打者」から9番→1番へ循環する時系列順で出力してください。`;

    const tailOrderConstraint =
      sortedTargets.length === 1 &&
      typeof body.nextInningLeadOffOrder === "number" &&
      body.nextInningLeadOffOrder >= 1
        ? (() => {
            const expectedTailOrder =
              ((body.nextInningLeadOffOrder - 2 + lineupLen) % lineupLen) + 1;
            return `\n🔥【次イニング先頭打順との境界整合制約】次イニング（${
              sortedTargets[0] + 1
            }回${sideLabel}）の先頭打者は【${
              body.nextInningLeadOffOrder
            }番】であることが確定しています！したがってこの${
              sortedTargets[0]
            }回${sideLabel}は原則として【${expectedTailOrder}番打者】の打席完了でチェンジ（または【${
              body.nextInningLeadOffOrder
            }番打者】の打席途中の走塁死でチェンジ）しています。${expectedTailOrder}番のマスに封殺（6-4/4-6/FC等）や投球・打球記録がある場合は絶対に落とさず出力してください！`;
          })()
        : "";

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
    const exampleNextBo = (exampleLeadBo % lineupLen) + 1;

    const prompt = `あなたは日本の早稲田式・成美堂式・リトルシニア/高校野球式スコアブックを1画・1球・守備番号1桁まで完璧に読み解くプロ公式記録員AIです。
以下の添付画像を照合し、**【${sortedTargets.join("回, ")}回（${sideLabel}）】で実際に行われた打席のみ** を時系列順に全打席・全投球・全進塁漏れなく抽出してください。
（※イニング番号 **"i" には必ず対象の回番号（${sortedTargets.join(" または ")}）** を設定し、対象外のイニングや白紙の空欄マスは絶対に出力しないでください！）

【添付画像の構成】
${stage2ImageGuide.join("\n")}
${legendConstraint}${leadOffConstraint}${tailOrderConstraint}

【確定済みの打順・途中交代リスト（この名前を厳密に使用すること）】
${lineupSpecLines.join("\n")}

【確定済みの相手登板投手リスト】
${pitcherSpecLines.join("\n")}

【対象イニングの確定スコア＆列情報（必ずこの得点数・列数・3アウト交代と整合させること）】
${targetInningMetaLines.join("\n")}

【🔥最重要 0: 「0打席イニングの禁止」「打順飛びの禁止」「封殺3アウト時の最終打者保持＆切り線除外」】
1. **試合が行われたイニングで打席0件（ab: []）およびイニング途中の打順飛び（例: 1番→2番→4番）は野球規則上あり得ません！**:
   必ず対象列の先頭打者から1人ずつ順番に（...8番→9番→1番→2番...）手書き筆跡が入っている全ての打席を漏れなく抽出してください。
2. **白紙（空欄）マスの抽出は絶対禁止！**:
   同じ列の中で「印刷された点線ダイヤモンドと薄いBSO枠線だけがある白紙マス」と「鉛筆や赤ペンで投球・進塁線・アウト数字・守備番号が書かれた記入済みマス」を必ず比較してください。手書き記録の無い白紙マスには架空のプレーを絶対に作らないでください！
3. **⚠️最頻出の打順抜け防止：封殺・野選・盗塁死で3アウト目『Ⅲ』『③』が先行走者のマスにある場合の最終打者保持！**:
   - 早稲田式・成美堂式では、たとえば4番打者が出塁した後に**5番打者が遊ゴロ二塁封殺（6-4・4-6・FC）を打った場合や5番打席中に4番走者が盗塁死・牽制死した場合、3アウト目の『Ⅲ』（または『③』）はアウトになった走者である「4番」の中央ダイヤモンドに書かれ、実際のイニング最終打者である「5番」のマス（4番のすぐ下）には投球記号と『6-4』『FC』等の打球記録（または打席途中記号）が書かれます**！
   - したがって、「4番の中央に『Ⅲ』が見えたから4番で読取を打ち切る」のは重大な誤りです！**必ずその1つ下のマス（5番）も確認し、投球記号・進塁実線・守備番号などの手書きプレー記録があれば、4番は出塁（o: 0）、5番こそがこのイニングの最終打者（封殺 rc: "fc", o: 1, eo: 3 等）として必ず5番まで出力**してください！
   - 一方で、**投球記号も守備番号も一切無く、斜め1本で引かれたイニング終了斜線『／』『＼』やカギ線『∟』だけがあるマス**は区切り印ですので、打席として出力しないでください！

【🔥最重要 1: 左ゾーン（BSO投球記号欄）の1球順序（p）完全抽出 — 「["X"]/["H"]のみの投球欠落」絶対防止！】
1. **⚠️最頻出ミス警告：手書きの投球記号があるのに ["X"] や ["H"] の1球だけに省略する「投球読み飛ばし」は絶対厳禁！**:
   - 各打順行のすぐ右横に、左BSO欄を約2倍に拡大＆鉛筆濃色化した **『[BSO投球拡大]』パネル** を配置しています。
   - **必ず「同じ列の白紙（未記入）マスの[BSO投球拡大]」と見比べてください**。白紙マスには無かった手書きの鉛筆点『・』・短い横棒『ー』『-』・丸『○』『●』・斜線『／』・三角『△』・数字『1,2,3...』が1つでもあれば、それは100%投球記録です！1球も漏らさず obs の 左: と p 配列の両方に抽出してください。
   - 初球打ち（["X"] または ["H"] の1球のみ）にしてよいのは、[BSO投球拡大] が白紙マスと同じく手書き筆跡ゼロのときだけです（1イニングの大半が初球打ちになることは滅多にありません）。
2. **印刷仕切り線と手書きボールの正確な見分け方**:
   - 白紙マスにも全行共通で存在する「左右の縦枠線まで隙間なく真っ直ぐ貫通する極細の水平印刷線」だけは枠線なので数えません。それ以外の **左右の枠線に触れない短い横棒『ー』『-』、枠線から浮いた横線、小さい点『・』** はすべて手書きの **ボール "B"** です！
3. **日本のスコアブック3大BSO記法と「にじみ・くっつき」分解則**:
   - **記法A（縦積み記号式・早稲田式）**: 上から下へ1球ごとに手書き記号を並べる方式（1つの小枠内に2〜3球密接して入ることも多い）:
     ・『○』（中が白い丸）＝ **見逃しストライク "S"** （※にじみで線が太くなっても中心にわずかでも白い抜け・明るい芯が見えれば100%『○』＝"S"！真っ黒塗り潰し『●』＝"W" と区別）
     ・『●』（中まで完全に黒塗りの丸）または BSO枠内の斜線『／』『×』＝ **空振りストライク "W"**
     ・『ー』『-』（短い横棒）または『・』（鉛筆の点）＝ **ボール "B"**
     ・『△』『▽』『レ』『V』（角がある白抜き三角・チェック）＝ **ファウル "F"** （※中に少しでも隙間があれば "F"！2S後のインプレーや後続球がある△は100% "F"）
     ・『▲』『▼』（中まで黒塗りの三角）＝ **バントファウル "BF"**
     ・縦に詰めて書かれた『○』『ー』『△』が上下接触したり印刷横線と『△』が重なって『ム』『A』『4』に見えても、[BSO投球拡大]で接触点を切り離し上から1球ずつ分解すること！
   - **記法B（BS段別・球数番号式・成美堂式/市販スコアブック）**: B（ボール）段とS（ストライク）段に **『1, 2, 3, 4...』と球数番号を書く方式**（例: B段に「1, 3」、S段に「2」、ファウルに「4」や「④」）の場合は、**番号順（1➔2➔3➔4...）に ["B", "S", "B", "F", ...] と全球を時系列復元**し、obs にも 左:B1,S2,B3,F4 と明記すること！
   - **記法C（B枠・S枠への印付け式・学童/草野球簡易式）**: B小枠・S小枠に番号ではなく『●』『○』『／』『ー』『・』『レ』等の印が書かれている場合も、記入されたB数・S数・F数の分だけ必ず "B", "S", "W", "F" を漏れなく出力すること。
4. **最終球とカウントの整合ルール（obs と p を完全一致させよ！）**:
   - obs に書いた左BSO観察記号（例: 左:ー,○,△ や 左:B1,S2,F3）と p の投球配列（例: ["B","S","F","X"]）は必ず1球単位で一致させてください。
   - **ゴロ・フライ・ライナー・犠打・犠飛・失策・野選・併殺**: バットに当たった最終球はBSO欄に書かれません。BSO欄の手書き球を読んだ末尾に **必ず "X" を1つ追加**（BSO欄が完全白紙の初球打ちのときのみ ["X"]）。
   - **安打（単打・二塁打・三塁打・本塁打）**: BSO欄の手書き球を読んだ末尾に **必ず "H" を1つ追加**（BSO欄が完全白紙の初球安打のときのみ ["H"]）。
   - **三振（rc: "strikeout"）**: BSO欄に3ストライク目まで全て書かれます（"X" は付けない）。最終記号が『○』なら末尾 "S"、『●』や『／』なら末尾 "W"、2S後の『▲』なら末尾 "BF"。
   - **四球（rc: "walk"）**: ボール "B" が合計4球（"X" は付けない）。死球は手書き球の末尾に "D"。

【🔥最重要 2: 中央ダイヤモンド（出塁実線 b1 ＆ アウトカウント ①②③ / ⅠⅡⅢ のにじみ判別 ＆ 3アウト上限の絶対厳守）】
- **中央の『Ⅰ・Ⅱ・Ⅲ』（上下横棒付きのローマ数字 1・2・3）および『①・②・③』（丸数字）はイニング累積アウトカウント（eo: 1, 2, 3）**です！ペンのにじみや点線ダイヤモンドとの接触で『Ⅰ』がカタカナの『エ』、『Ⅱ』が『日』、『Ⅲ』が『目』『田』のように見えても、必ずアウトカウント（eo: 1, 2, 3）として読み取り、守備位置番号（1=投, 2=捕, 3=一）と絶対に混同しないでください！
- **⚠️超重要：「o（その打席で増えたアウト数）」と「eo（その時点の累積アウト数）」を絶対に混同するな！**:
  ・2アウト目（Ⅱ・②）や3アウト目（Ⅲ・③）の三振・ゴロ・フライ・犠打・封殺は、**その打席で増えたアウト数 "o" は必ず 1** です（"eo": 2 や "eo": 3 であっても、"o": 2 や "o": 3 と書くのは絶対厳禁！"o": 2 になるのは併殺打のみです）！
  ・**1イニング内の全打席の "o" の合計は（最終裏サヨナラ回を除き）必ずピタリ【3】になります（4アウト以上になることは野球規則上100%あり得ません）！**
- ダイヤモンド右下辺（本塁→1塁）に手書きの実線・赤線があれば **"b1": true（出塁）**、印刷点線のままなら **"b1": false（未出塁＝打者アウト）** と[中央・右下拡大]パネルで確実に判定してください（※"b1": true で一度出塁した走者が後続打席で盗塁死・封殺等になった場合も中央に Ⅰ/Ⅱ/Ⅲ・①/②/③ が書かれますが、**その出塁打席自体の "o" は必ず 0** であり、アウトは実際に盗塁死・封殺が起きた後続打者の打席側でのみ 1 回だけ計上してください！両方への二重計上は絶対厳禁です）。

【🔥最重要 3: インプレー結果（rc）・守備位置番号（1〜9: dir）と「手書きくっつき字形」の徹底分解ルール】
守備番号の定義: **1=投, 2=捕, 3=一, 4=二, 5=三, 6=遊, 7=左, 8=中, 9=右**
1. **⚠️最頻出ミス防止：フライ傘マーク『︵』『⌒』と数字の接触・合体字形を確実に分解せよ！**:
   - 手書きではフライを表す山なり曲線『︵』『⌒』が、直下の守備数字（1〜9）の上端にくっついて1文字のように書かれることが非常に多いです！
   - 特に **『︵』＋『4』（二飛）が接触すると『傘』『全』『B』『A』『8』『9』のような合体字形** に見えます（同様に『︵』＋『6』＝遊飛、『︵』＋『8』＝中飛、『︵』＋『3』＝一飛、『︵』＋『5』＝三飛、『︵』＋『7』＝左飛、『︵』＋『9』＝右飛）。
   - **[中央・右下拡大]で上部に山なりアーチ曲線『︵』が見え、下に数字の脚があり、本塁→1塁が破線（b1: false）で中央にアウト数字があるマスは100%フライアウト（rc: "flyout", dir: "4"〜"9"）です！絶対に英字『B』（四球 walk）と誤読しないでください！**
2. **ゴロ・封殺・併殺（rc: "groundout" / "double_play"）の連綿（一筆書き接触）分解**:
   - ハイフン繋ぎの送球番号（例: **6-3**=遊ゴロ, **4-3**=二ゴロ, **5-3**=三ゴロ, **1-3**=投ゴロ, **2-3**=捕ゴロ, **3-1**=一ゴロ投カバー、封殺 **6-4 / 4-6 / 5-4 / 5-2**、併殺 **6-4-3 / 4-6-3 / 5-4-3 / 1-6-3**）または一塁無補殺の単独 **『3』『〜3』** はゴロです！
   - 手書きでは左の数字・ハイフン『-』・右の数字がペンを離さず繋がって（連綿で）書かれることが多いため、[中央・右下拡大]でハイフン位置を切り離して左右の数字を特定してください。
   - **⚠️にじんだ手書き数字（1〜9）の字形見分けと野球理論チェック**:
     ・**『4』**(角張った縦横交差で下に縦脚が突き出る) vs **『6』**(上から左へ降りて下半分が丸ループ) vs **『5』**(上端に水平横棒＋下丸み) vs **『8』**(上下2つの閉じた輪) vs **『1』**(縦1本線) vs **『2』**(上丸＋下水平線) を[中央・右下拡大]で1画ずつ確認せよ！
     ・野球では内野ゴロ一塁送球は **6-3, 4-3, 5-3, 1-3, 2-3** が圧倒的多数であり、外野からの **7-3, 8-3, 9-3（外野ゴロ）は滅多に起きません**。『6-3』を『9-3』や『8-3』、『4-3』を『7-3』と誤読しないよう字形を慎重に確認してください！
3. **フライ・邪飛・ライナー（rc: "flyout" / "sac_fly" / "infield_fly"）**:
   - 傘マーク付き **︵1〜︵9** は 100% フライ（rc: "flyout", dir: "1"〜"9"）。本塁→1塁が点線（b1: false）で送球ハイフンが無く外野番号 **『7』『8』『9』** が単独で書かれている場合も外野フライ（左飛・中飛・右飛）です。
   - **ファウルフライ（邪飛）**: 『︵2F』『(2)』『△2』『3F』『5F』等 ➔ rc: "flyout", dir: "2F" / "3F" / "5F", rl: "捕邪飛" / "一邪飛" / "三邪飛"。
   - **ライナー（直球）**: 直線バー『￣』『L』（例: 『6￣』『6L』『4L』『4-』※右に送球先数字無し）➔ rc: "flyout", dir: "6L" / "4L", rl: "遊直" / "二直"。
4. **安打（rc: "single" | "double" | "triple" | "home_run"）の打球方向（dir）**:
   - 本塁→1塁が太い実線・赤線（b1: true）で、1塁線上の斜線『/』=単打、2塁まで実線＋『//』=二塁打、3塁まで実線＋『///』=三塁打、本塁一周実線または『HR』『////』=本塁打。
   - **守備方向の読み方（数字記法と打球線記法の両対応）**:
     ① 数字が書かれている場合: **7**(左), **8**(中), **9**(右), **7-8**(左中間), **8-9**(右中間), **6**(遊内安), **5**(三内安), **4**(二内安) をそのまま dir に設定（※b1: true かつ中央アウト無しの 7/8/9 はフライではなく安打です！）。
     ② 早稲田式の打球方向線（本塁からダイヤモンド外へ伸びる線＋先端の点『・』や山『⌒』）で書かれている場合: ダイヤモンドの向きに合わせて **左上（三遊間〜レフト側）="7"**、**真上（二塁ベース上〜センター側）="8"**、**右上（一二塁間〜ライト側）="9"**、**左斜め上中間="7-8"**、**右斜め上中間="8-9"** と正確に判定してください（左上7と右上9を絶対に逆にしないこと）！
5. **犠打・失策・野選・四死球・その他**:
   - 四角『□』やダイヤ『◇』で囲まれた送球番号（例: **[1-3], ◇1-3, ◇5-4**）➔ **rc: "sac_bunt"**, dir: "1-3" 等。三塁走者生還の外野飛球 ➔ **rc: "sac_fly"**。
   - 捕球失策 **『E6』『E4』『E5』** ➔ **rc: "error"**, dir: "E6" 等（b1: true, o: 0）。内野ゴロ等の悪送球 **『4E-3』『6E-3』『5E-3』『6E-4』** や送球先なし悪送球 **『4E』『6E』** ➔ **rc: "error"**, dir: "4E-3" / "4E" 等（b1: true, o: 0、絶対にゴロアウト groundout と混同しないこと！）。送球先落球 **『6-3E』『6-E3』** ➔ **rc: "error"**, dir: "6-3E"。野選 **『FC』『FC6-2』『FC5-2』『FC4-6』『O.B.』** ➔ **rc: "fc"**, dir: "FC6-2" / "FC6" 等。
   - 四球は**本塁→1塁が実線（b1: true）かつBSOにボール4球かつ右下英字『B』**のときのみ ➔ **rc: "walk"**。死球『D』『HBP』➔ **rc: "hit_by_pitch"**。敬遠 ➔ **rc: "intentional_walk"**。
   - 振り逃げアウト『K 2-3』➔ **rc: "dropped_third_strike_out"**, o: 1。振り逃げ出塁『K-E2』➔ **rc: "dropped_third_strike"**, o: 0。
   - 打席途中に走者が盗塁死・牽制死等で3アウトチェンジになった未完了マスのみ ➔ **rc: "other"**, rl: "打席途中断（走塁死チェンジ）", o: 1（白紙マスには絶対に使わないこと！）。

【超重要 4: 投手交代波線・進塁（a）・早稲田式の「●（個人得点）」と得点（ru）・打点（rbi）の厳密分離・確信度（cf）】
- 回途中の継投がある場合は横波線『〜〜』や二重線『══』の前後で正しい投手名を pt に設定してください。${multiColumnRuleBlock}
- 進塁 a には盗塁(m:"steal")・盗塁死(m:"caught_stealing",io:true)・牽制死(m:"pickoff_out",io:true)・牽制悪送球(m:"pickoff_error")・暴投(m:"wp")・捕逸(m:"pb")・ボーク(m:"balk")・送球間(m:"throw_advance")・走塁死(m:"out_on_base",io:true)・打撃進塁(m:"hit"/"sac"/"fc"/"error"/"walk")を記録し、凡退無進塁は a:[]。
- **「●（個人得点）」と打席得点（ru）・打点（rbi）の厳密区別（最重要！）**:
  1. 早稲田式・成美堂式では、出塁した走者（例: 1番の四球や単打）が**後続打者の打撃で本塁生還した際、その出塁走者のマス中央に黒丸『●』（や◎・赤丸）とダイヤモンド1周線が書かれます**。これをその出塁打席自身の得点・打点にしてはいけません！無走者時の四球・単打・失策や、満塁でない四死球では **必ず ru: 0, rbi: 0** とし、進塁 a にも t:"HP" を入れず出塁塁（t:"1B" 等）までに留めてください。
  2. **"ru"（その打席で本塁生還した人数）と t:"HP", io:false の進塁は「その得点が実際に入った後続打者の打席」にのみ計上**し、イニング内の全打席の ru 合計が確定得点と完全一致するようにしてください。
  3. **打点（rbi）の公認野球規則**: 満塁以外の四死球・打撃妨害は **必ず rbi: 0**（満塁押し出しのみ rbi: 1）。失策（rc:"error"）・併殺打（rc:"double_play"）・三振/振り逃げ・暴投(m:"wp")/捕逸(m:"pb")/ボーク(m:"balk")/盗塁での生還は、得点（ru >= 1）が入っても **必ず rbi: 0** としてください！
- **確信度 cf の基準**: 手書き特有の多少のにじみ・接触があっても、拡大パネルやイニング内のアウト推移（1死→2死→3死）・カウント整合からプレー内容が論理的に判読できる場合は **"cf":"h" または "cf":"m"** とし、インク潰れ等で本当に判読不能なマスのみ **"cf":"l"** としてください。
- 投球コード p は "B"|"S"|"W"|"BS"|"F"|"BF"|"P1"|"P2"|"P3"|"BK"|"H"|"X"|"D" のみ使用。

【出力JSONフォーマット（改行無しのコンパクトJSONのみ返却。"i" には必ず対象イニング番号 ${exampleInn} を入れること！）】
{"ab":[{"i":${exampleInn},"c":1,"bo":${exampleLeadBo},"pt":"${examplePitcher}","obs":"左:○,ー,△/中:Ⅰ/本一:破線/右下:︵4","b1":false,"p":["S","B","F","X"],"eo":1,"o":1,"dir":"4","rc":"flyout","rl":"二飛","rbi":0,"ru":0,"a":[],"cf":"h","box":[205,320,272,376]},{"i":${exampleInn},"c":1,"bo":${exampleNextBo},"pt":"${examplePitcher}","obs":"左:ー,●/中:無/本一:実線/右下:8","b1":true,"p":["B","W","H"],"eo":1,"o":0,"dir":"8","rc":"single","rl":"中前安打","rbi":0,"ru":0,"a":[{"rn":"選手名","f":"BAT","t":"1B","m":"hit","io":false,"pn":3}],"cf":"h","box":[272,320,339,376]}]}
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
        validateChunkOutput,
        {
          maxBudgetMs: 60_000,
          skipModels: body.skipModels,
          cooledModelsOut: cooledModels,
        }
      );
      normalizedRawItems = normalizeChunkRawItems(
        rawChunk.ab || rawChunk.atBats || [],
        sortedTargets
      );
    } catch (primaryErr) {
      if (!mustHaveAtBats) {
        normalizedRawItems = [];
      } else {
        const primaryMsg =
          primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const elapsedSoFar = Date.now() - reqStartMs;
        // 0打席の検証NGかつリクエスト開始から36秒以内の場合のみ短時間の救済再試行を行い、
        // Cloudflareの100秒プロキシタイムアウト(HTML 503/524)到達を100%防止する
        if (primaryMsg.includes("検証NG") && elapsedSoFar < 36_000) {
          const rescuePrompt = `${prompt}\n\n⚠️【緊急再確認】前回の読取で${sortedTargets.join(
            "・"
          )}回${sideLabel}の有効打席が0件になりましたが、試合が行われたイニングで打席0件は絶対にあり得ません！${focusImgLabel}の1番〜${lineupLen}番の各マスをもう一度確認し、手書き記録がある打席マス（最低3アウト分）を必ず "i": ${exampleInn} として全て出力してください！`;
          try {
            const rescueChunk =
              await callGeminiStructuredJson<RawGeminiChunkResponse>(
                apiKey,
                rescuePrompt,
                imageParts,
                "chunk",
                validateChunkOutput,
                {
                  maxBudgetMs: Math.max(12_000, 68_000 - elapsedSoFar),
                  skipModels: body.skipModels,
                  cooledModelsOut: cooledModels,
                }
              );
            normalizedRawItems = normalizeChunkRawItems(
              rescueChunk.ab || rescueChunk.atBats || [],
              sortedTargets
            );
          } catch {
            throw primaryErr;
          }
        } else {
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
          cooledModels,
        },
        422
      );
    }

    const rawList = orderAndAssignColumnsForChunk(
      normalizedRawItems,
      sortedTargets,
      body.structure,
      body.expectedLeadOffOrder,
      body.nextInningLeadOffOrder
    );

    let currentTrackingInning = -1;
    let runningInningOuts = 0;
    let activeBases: Record<"1B" | "2B" | "3B", boolean> = {
      "1B": false,
      "2B": false,
      "3B": false,
    };

    const rawMappedAtBats: ScorebookV2AtBat[] = rawList.map((ab) => {
      const inning = toFiniteInt(ab.i ?? ab.inning, sortedTargets[0]) || sortedTargets[0];
      if (inning !== currentTrackingInning) {
        currentTrackingInning = inning;
        runningInningOuts = 0;
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

      const reconciled = reconcileRawAtBatEvidence(
        ab,
        activeBases,
        runningInningOuts
      );
      const rawResultCode = reconciled.rawResultCode;
      const rawResultLabel = reconciled.rawResultLabel;
      const rawDir = reconciled.rawDir;
      let resultCode = inferCanonicalResultCode(
        rawResultCode,
        rawResultLabel || rawDir
      );
      if (
        ab.b1 === true &&
        resultCode === "groundout" &&
        /^[1-6]-[2456]$/.test((rawDir || "").trim())
      ) {
        resultCode = "fc";
      }

      const rawAdvances = reconciled.rawAdvances;
      let advances: ScorebookV2Advance[] = rawAdvances.map((adv) => {
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

      // 【数学的自己補正 1】累積アウト数字(Ⅱ=2/Ⅲ=3)の混入防止・無走者/2死からの併殺不可・後続打席走塁死の二重計上排除
      const activeRunnersCount =
        (activeBases["1B"] ? 1 : 0) +
        (activeBases["2B"] ? 1 : 0) +
        (activeBases["3B"] ? 1 : 0);

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

      if (isSafeBatterReach && advances.length > 0) {
        advances = advances.filter((adv) => {
          if (!adv.isOut || adv.from === "BAT") return true;
          const occupiedBefore = activeBases[adv.from];
          if (
            !occupiedBefore &&
            (adv.method === "caught_stealing" ||
              adv.method === "pickoff_out" ||
              adv.method === "fc" ||
              adv.method === "appeal_out")
          ) {
            return false;
          }
          if (
            (resultCode === "walk" ||
              resultCode === "intentional_walk" ||
              resultCode === "hit_by_pitch" ||
              resultCode === "interference") &&
            !occupiedBefore
          ) {
            return false;
          }
          return true;
        });
      }

      if (
        resultCode === "double_play" &&
        (activeRunnersCount === 0 || runningInningOuts >= 2)
      ) {
        resultCode = /[FL]$|飛|直|ライナー/i.test(
          `${rawDir || ""} ${rawResultLabel || ""}`
        )
          ? "flyout"
          : "groundout";
      }

      const harmonizedFielding = harmonizeOcrFieldingAndLabel(
        resultCode,
        rawDir,
        rawResultLabel
      );

      const rawOutsVal = Math.max(0, Math.min(3, reconciled.outsInPlay));
      const occupiedBaseRunnerOuts = Math.min(
        activeRunnersCount,
        advances.filter(
          (a) => a.isOut && a.from !== "BAT" && activeBases[a.from]
        ).length
      );
      const batterOverrunOut = advances.some(
        (a) =>
          a.isOut &&
          (a.from === "BAT" || !activeBases[a.from as "1B" | "2B" | "3B"]) &&
          (a.method === "hit" || a.method === "out_on_base")
      )
        ? 1
        : 0;

      const isDefiniteBatterOut =
        resultCode === "groundout" ||
        resultCode === "flyout" ||
        resultCode === "infield_fly" ||
        resultCode === "strikeout" ||
        resultCode === "dropped_third_strike_out" ||
        resultCode === "sac_bunt" ||
        resultCode === "sac_fly" ||
        resultCode === "interference_out";

      let outsVal = rawOutsVal;
      if (resultCode === "triple_play") {
        outsVal = Math.max(
          1,
          Math.min(3 - runningInningOuts, 1 + activeRunnersCount)
        );
      } else if (resultCode === "double_play") {
        outsVal = 2;
      } else if (isDefiniteBatterOut) {
        outsVal = Math.min(3, 1 + occupiedBaseRunnerOuts);
      } else if (isSafeBatterReach) {
        outsVal = Math.min(2, occupiedBaseRunnerOuts + batterOverrunOut);
      } else if (resultCode === "fc") {
        outsVal = rawOutsVal >= 1 || occupiedBaseRunnerOuts >= 1 ? 1 : 0;
      } else if (resultCode === "other") {
        outsVal =
          occupiedBaseRunnerOuts > 0
            ? Math.min(2, occupiedBaseRunnerOuts)
            : rawOutsVal > 0
            ? 1
            : 0;
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
      runningInningOuts = Math.min(3, runningInningOuts + outsVal);
      const effectiveEndingOuts = Math.max(
        runningInningOuts,
        Math.min(3, reconciled.endingOuts)
      );

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
        endingOuts: effectiveEndingOuts,
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

    // 3アウト到達後のイニング終了切り線マス・余剰空欄ノイズ・3アウト超過矛盾を除去し、正確なイニング交代境界と次回先頭打順を保証する
    const trimmedAtBats = sanitizeMappedInningAtBats(
      rawMappedAtBats,
      sortedTargets,
      body.structure
    );
    const mappedAtBats = reconcileSheetExcessOutsDeterministically(
      trimmedAtBats,
      body.structure
    ).atBats;

    // 次のチャンクの先頭打順を計算
    const lineupCycle = Math.max(9, body.structure.batters.length);
    let nextLeadOffOrder = body.expectedLeadOffOrder || 1;
    if (mappedAtBats.length > 0) {
      const lastAb = mappedAtBats[mappedAtBats.length - 1];
      const endedByRunnerOutOnly = isRunnerOnlyInningEnd(lastAb);
      nextLeadOffOrder = endedByRunnerOutOnly
        ? lastAb.battingOrder
        : (lastAb.battingOrder % lineupCycle) + 1;
    }

    return c.json({
      success: true,
      atBats: mappedAtBats,
      nextLeadOffOrder,
      cooledModels,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      { success: false, error: `イニング解析エラー: ${msg}`, cooledModels },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4-B. 打順の抜け・飛びピンポイント視覚照合＆自動補完エンドポイント
// （例: 1回表が 1→2→3→4 で終わり2回表が 6番から始まっている場合、「1回・5番マス」と「2回・5番マス」を横並び拡大照合し、
//  実際に手書き記録がある側を特定して 5番打者の1球履歴・打席結果を正確に復元する）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface ReconcileMissingAtBatsPayload {
  teamId: string;
  matchId: string;
  isTop: boolean;
  comparisonCropBase64: string;
  comparisonCropMimeType?: string;
  structure: ScorebookSheetStructure;
  gaps: MissingOrderGapSpec[];
  legendBase64?: string;
  legendMimeType?: string;
  skipModels?: string[];
}

interface RawReconciledMissingItem extends RawGeminiAtBat {
  gid?: string;
  gapId?: string;
}

interface RawReconcileMissingResponse {
  items?: RawReconciledMissingItem[];
  ab?: RawReconciledMissingItem[];
}

liffScorebookRouter.post("/reconcile-missing-atbats", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json(
      { success: false, error: "GEMINI_API_KEY が設定されていません" },
      500
    );
  }

  const db = drizzle(c.env.DB, { schema });
  const cooledModels: string[] = [];

  try {
    const body = (await c.req.json()) as ReconcileMissingAtBatsPayload;
    if (
      !body.comparisonCropBase64 ||
      !body.structure ||
      !Array.isArray(body.gaps) ||
      body.gaps.length === 0
    ) {
      return c.json({ success: true, resolved: [], cooledModels });
    }

    const sideLabel = body.isTop ? "表（先攻）" : "裏（後攻）";
    const imageParts: GeminiContentPart[] = [
      {
        inlineData: {
          mimeType: body.comparisonCropMimeType || "image/jpeg",
          data: body.comparisonCropBase64,
        },
      },
    ];

    const legendPart = await resolveLegendImagePart(
      c,
      db,
      body.teamId,
      body.legendBase64,
      body.legendMimeType
    );
    let legendNote = "";
    if (legendPart) {
      imageParts.push(legendPart);
      legendNote = `\n・画像2: チーム公式のスコア記号早見表（最優先で参照）`;
    }

    const pitcherSpecLines = body.structure.pitchers.map(
      (p) =>
        `・${p.fromInning}回〜${p.toInning}回: #${p.uniformNumber} ${
          p.name || "投手"
        }`
    );

    const gapSpecLines = body.gaps.map((g) => {
      const candDesc = g.candidates
        .map(
          (cand, idx) =>
            `${idx === 0 ? "候補A" : idx === 1 ? "候補B" : `候補${idx + 1}`}=【"i":${
              cand.inning
            }, "c":${cand.columnIndex}】（${cand.inning}回${sideLabel}の${
              g.battingOrder
            }番マス）`
        )
        .join(" vs ");
      return `・[${g.gapId}] 欠損している打順=${g.battingOrder}番（${g.batterName}） | 照合候補: ${candDesc} | 前後状況: ${g.contextHint}`;
    });

    const firstGap = body.gaps[0];
    const exInning = firstGap.candidates[0]?.inning ?? 1;
    const exCol = firstGap.candidates[0]?.columnIndex ?? 1;
    const exPitcher =
      body.structure.pitchers.find(
        (p) => exInning >= p.fromInning && exInning <= p.toInning
      )?.name ||
      body.structure.pitchers[0]?.name ||
      "相手投手";

    const reconcilePrompt = `あなたは日本の早稲田式・成美堂式・リトルシニア式スコアブックのプロ公式記録員AIです。
骨格確定済みの打順（1番〜${Math.max(
      9,
      body.structure.batters.length
    )}番）でイニング解析結果を検算したところ、以下の打順が抜けて（飛んで）いることが数学的に判明しました。
添付画像1には、欠損項目 [${body.gaps
      .map((g) => g.gapId)
      .join(", ")}] ごとに横1段ずつ、候補となるマスを **[全体マス | BSO拡大 | 中央・右下拡大]** の高精細トリプルビューで並べています。${legendNote}

【検証対象の欠損打順リスト（全${body.gaps.length}件すべて必ず出力すること）】
${gapSpecLines.join("\n")}

【相手登板投手リスト】
${pitcherSpecLines.join("\n")}

【🔥最優先の照合・抽出ルール】
1. **候補A vs 候補B がある項目（イニング境界の打順抜け、例: 1回4番終了→2回6番開始で5番抜け）の判定方法**:
   - 野球の打順は絶対に飛ばないため、抜けている打者は **「候補A（前イニングの最終打者）」または「候補B（次イニングの先頭打者）」のどちらか一方に100%必ず手書き記録が存在**します！
   - 候補Aと候補Bを見比べ、**実際に手書きの投球記号・進塁実線・守備番号・アウト記号が書かれている側のイニング番号 "i" と列番号 "c" を採用**してください！
   - ⚠️**切り線・封殺の見分け方**:
     ・片方が「印刷点線だけの白紙」または「斜め1本のイニング終了切り線『／』『∟』のみ（投球記号も守備番号も無し）」であれば、もう片方の手書き記録がある側が正解です！
     ・前イニングの4番で走者3アウト『Ⅲ』が書かれ、候補A（前イニング5番マス）に遊ゴロ封殺『6-4』『4-6』『FC』等の手書き記録があり、その下または右下隅に切り線『／』がある場合は、**候補A（前イニング末尾）が正解（封殺チェンジ rc:"fc", o:1, eo:3 等）**です！
2. **1マス内の記号読取ルール（投球記号の読み飛ばし厳禁！）**:
   - 左BSO拡大: 『○』（中が白い丸）="S"、『●』（黒塗り丸）/『／』="W"、『ー』『-』（短い横棒）/『・』（点）="B"、『△』（白三角）="F"、『▲』（黒三角）="BF"、B段・S段の球数番号『1,2,3...』も番号順に "B"/"S"/"F" として漏れなく全抽出（手書き球があるのに ["X"]/["H"] のみに省略するのは厳禁！）。インプレー打球なら末尾に "X"（安打なら "H"）を付与。
   - 中央・右下拡大: 傘マーク接触『︵4』〜『︵9』はフライアウト（rc:"flyout", dir:"4"〜"9"、四球Bと誤読厳禁！）、送球ハイフン『6-3』『4-3』『5-3』はゴロ（rc:"groundout"）、悪送球『4E-3』『6E-3』『4E』や捕球失策『E4』『E6』は失策（rc:"error", dir:"4E-3"/"E4", o:0）、二塁・三塁封殺『6-4』『4-6』『5-4』『FC』（本塁→1塁実線 b1:true）は野選封殺（rc:"fc", o:1）、本一実線＋外野7/8/9は単打（rc:"single", o:0）、『K』/3ストライクは三振（rc:"strikeout", o:1）、ボール4球＋右下『B』＋本一実線は四球（rc:"walk", o:0）。
   - 万一、打席途中に先行走者が盗塁死・牽制死してチェンジとなり次イニング先頭で打ち直しになった痕跡がある場合のみ、候補B（完了した打席側）を優先採用してください。

【出力JSONフォーマット（改行無しのコンパクトJSONのみ返却。items配列に全${
      body.gaps.length
    }件の "gid" を漏れなく出力！）】
{"items":[{"gid":"${firstGap.gapId}","i":${exInning},"c":${exCol},"bo":${
      firstGap.battingOrder
    },"pt":"${exPitcher}","obs":"左:ー,○/中:無/本一:実線/右下:6-4","b1":true,"p":["B","S","X"],"eo":3,"o":1,"dir":"6-4","rc":"fc","rl":"遊ゴロ野選","rbi":0,"ru":0,"a":[],"cf":"h"}]}`;

    const validateReconcileOutput = (
      parsed: RawReconcileMissingResponse
    ): string | null => {
      const arr = parsed.items || parsed.ab || [];
      if (!Array.isArray(arr) || arr.length === 0) {
        return "欠損打席の照合結果が0件です";
      }
      return null;
    };

    const rawResp =
      await callGeminiStructuredJson<RawReconcileMissingResponse>(
        apiKey,
        reconcilePrompt,
        imageParts,
        "chunk",
        validateReconcileOutput,
        {
          maxBudgetMs: 48_000,
          skipModels: body.skipModels,
          cooledModelsOut: cooledModels,
        }
      );

    const rawItems = rawResp.items || rawResp.ab || [];
    const resolved: ResolvedMissingAtBatItem[] = [];

    for (let idx = 0; idx < body.gaps.length; idx++) {
      const gap = body.gaps[idx];
      const matchedRaw =
        rawItems.find(
          (it) =>
            (it.gid || it.gapId || "").trim().toUpperCase() ===
            gap.gapId.toUpperCase()
        ) ||
        (body.gaps.length === 1
          ? rawItems[0]
          : rawItems.find(
              (it) => toFiniteInt(it.bo ?? it.battingOrder) === gap.battingOrder
            ));

      if (!matchedRaw) continue;

      const parsedInn = toFiniteInt(matchedRaw.i ?? matchedRaw.inning);
      const validCand =
        gap.candidates.find((cand) => cand.inning === parsedInn) ||
        gap.candidates[0];
      if (!validCand) continue;

      const inning = validCand.inning;
      const colIndex = Math.max(
        1,
        toFiniteInt(matchedRaw.c ?? matchedRaw.columnIndex, validCand.columnIndex) ||
          validCand.columnIndex
      );
      const battingOrder = gap.battingOrder;
      const ocrPitcherHint = (
        matchedRaw.pt ??
        matchedRaw.pitcherName ??
        ""
      ).trim();

      const matchup = resolveActiveMatchupFromStructure(
        body.structure,
        inning,
        battingOrder,
        ocrPitcherHint
      );

      const priorOutsEstimate =
        gap.kind === "lead_off_1st" ||
        (gap.kind === "inter_inning" && inning === gap.nextInning)
          ? 0
          : gap.kind === "inter_inning" && inning === gap.prevInning
          ? 2
          : 1;
      const runnerMaybeOnBase = priorOutsEstimate > 0;

      const reconciled = reconcileRawAtBatEvidence(
        matchedRaw,
        {
          "1B": runnerMaybeOnBase,
          "2B": false,
          "3B": false,
        },
        priorOutsEstimate
      );

      let resultCode = inferCanonicalResultCode(
        reconciled.rawResultCode,
        reconciled.rawResultLabel || reconciled.rawDir
      );

      // 本塁→1塁が実線(b1: true)で二塁/三塁/本塁への封殺送球（6-4, 4-6, 5-4, 5-2 等）の場合は野選・封殺(fc, 1アウト)として確定
      const cleanDir = (reconciled.rawDir || "").trim();
      if (
        matchedRaw.b1 === true &&
        resultCode === "groundout" &&
        /^[1-6]-[2456]$/.test(cleanDir)
      ) {
        resultCode = "fc";
      }

      const harmonizedFielding = harmonizeOcrFieldingAndLabel(
        resultCode,
        reconciled.rawDir,
        reconciled.rawResultLabel
      );

      const advances: ScorebookV2Advance[] = reconciled.rawAdvances.map(
        (adv) => {
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
        }
      );

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
        resultCode === "sac_bunt" ||
        resultCode === "sac_fly" ||
        resultCode === "interference_out";

      let outsVal = rawOutsVal;
      if (resultCode === "triple_play") {
        outsVal = Math.max(1, 3 - priorOutsEstimate);
      } else if (resultCode === "double_play") {
        outsVal = priorOutsEstimate >= 2 ? 1 : 2;
      } else if (isDefiniteBatterOut) {
        outsVal = Math.min(3, 1 + Math.min(1, runnerOutsInPlay));
      } else if (isSafeBatterReach) {
        outsVal = batterOutInAdvances ? 1 : 0;
      } else if (resultCode === "fc") {
        outsVal =
          rawOutsVal >= 1 ||
          runnerOutsInPlay >= 1 ||
          (gap.kind === "inter_inning" && inning === gap.prevInning)
            ? 1
            : 0;
      } else if (resultCode === "other") {
        outsVal = runnerOutsInPlay > 0 || rawOutsVal > 0 ? 1 : 0;
      }

      const normalizedPitches = normalizePitchArray(
        reconciled.rawPitches,
        resultCode,
        advances,
        { "1B": runnerMaybeOnBase, "2B": false, "3B": false }
      );
      const { balls, strikes } = computeCountFromPitches(normalizedPitches);

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
            undefined,
            inningMeta?.columnBox,
            inningMeta?.columnCount ?? 1,
            colIndex,
            batterRowBox
          );

      const rawConf = (
        matchedRaw.cf ??
        matchedRaw.confidence ??
        "h"
      ).toLowerCase();
      const confidence: ConfidenceLevel =
        rawConf === "l" || rawConf === "low"
          ? "low"
          : rawConf === "m" || rawConf === "medium"
          ? "medium"
          : "high";

      const isHr = resultCode === "home_run";
      const sanitizedGapAdvances = advances.map((adv) => {
        if (
          !isHr &&
          adv.from === "BAT" &&
          !adv.isOut &&
          adv.to === "HP" &&
          adv.method !== "error"
        ) {
          const fallbackTo =
            resultCode === "triple"
              ? "3B"
              : resultCode === "double"
              ? "2B"
              : "1B";
          return { ...adv, to: fallbackTo as "1B" | "2B" | "3B" };
        }
        return adv;
      });
      const hpCount = sanitizedGapAdvances.filter(
        (a) => a.to === "HP" && !a.isOut
      ).length;
      const rawRunsInPlay =
        toFiniteInt(matchedRaw.ru ?? matchedRaw.runsInPlay, 0) || 0;
      const effectiveRuns = Math.max(rawRunsInPlay, hpCount, isHr ? 1 : 0);
      const parsedRbi = toFiniteInt(matchedRaw.rbi);
      const isZeroRbiGapResult =
        resultCode === "error" ||
        resultCode === "double_play" ||
        resultCode === "triple_play" ||
        resultCode === "strikeout" ||
        resultCode === "dropped_third_strike" ||
        resultCode === "dropped_third_strike_out" ||
        resultCode === "interference_out" ||
        resultCode === "other";
      const isAwardedFirstGap =
        resultCode === "walk" ||
        resultCode === "intentional_walk" ||
        resultCode === "hit_by_pitch" ||
        resultCode === "interference";
      const safeGapRbi = isZeroRbiGapResult
        ? 0
        : isAwardedFirstGap
        ? Math.min(1, Math.max(0, parsedRbi ?? 0))
        : Math.min(effectiveRuns, Math.max(0, parsedRbi ?? effectiveRuns));

      resolved.push({
        gapId: gap.gapId,
        atBat: {
          id: crypto.randomUUID(),
          inning,
          isTop: body.isTop,
          columnIndex: colIndex,
          battingOrder,
          batterName: matchup.batterName || gap.batterName,
          batterPlayerId: matchup.batterPlayerId,
          pitcherName: matchup.pitcherName || ocrPitcherHint,
          pitcherPlayerId: matchup.pitcherPlayerId,
          resultCode,
          resultLabel: harmonizedFielding.resultLabel,
          battedDirection: harmonizedFielding.battedDirection,
          rbi: safeGapRbi,
          outsInPlay: outsVal,
          endingOuts: Math.min(
            3,
            Math.max(priorOutsEstimate + outsVal, reconciled.endingOuts)
          ),
          runsInPlay: effectiveRuns,
          balls,
          strikes,
          pitches: normalizedPitches,
          advances: sanitizedGapAdvances,
          confidence,
          confidenceReason:
            (
              matchedRaw.cr ??
              matchedRaw.confidenceReason ??
              ""
            ).trim() || undefined,
          cellBox,
        },
      });
    }

    return c.json({
      success: true,
      resolved,
      cooledModels,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
      return c.json(
      {
        success: false,
        error: `打順抜け自動補正エラー: ${msg}`,
        cooledModels,
      },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4-C. 1イニング「3アウト超過（4アウト・5アウト等）」ピンポイント視覚再検算エンドポイント
// （4打席すべてが凡退アウトと誤読され計4アウトになっているイニング等について、
//  当該イニングの全候補マスを横並びトリプルビューで比較精読し、「どのマスが実は出塁（o:0）または末尾切り線除外（drop:true）か」を特定して必ず合計3アウトに収束させる）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface ReconcileInningOutsPayload {
  teamId: string;
  matchId: string;
  isTop: boolean;
  cropBase64: string;
  cropMimeType?: string;
  structure: ScorebookSheetStructure;
  spec: ExcessOutInningSpec;
  legendBase64?: string;
  legendMimeType?: string;
  skipModels?: string[];
}

interface RawReconciledInningOutItem extends RawGeminiAtBat {
  sk?: string;
  slotKey?: string;
  drop?: boolean;
}

interface RawReconcileInningOutsResponse {
  items?: RawReconciledInningOutItem[];
  ab?: RawReconciledInningOutItem[];
}

liffScorebookRouter.post("/reconcile-inning-outs", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json(
      { success: false, error: "GEMINI_API_KEY が設定されていません" },
      500
    );
  }

  const db = drizzle(c.env.DB, { schema });
  const cooledModels: string[] = [];

  try {
    const body = (await c.req.json()) as ReconcileInningOutsPayload;
    if (
      !body.cropBase64 ||
      !body.structure ||
      !body.spec ||
      !Array.isArray(body.spec.batters) ||
      body.spec.batters.length === 0
    ) {
      return c.json({ success: true, atBats: [], cooledModels });
    }

    const { spec } = body;
    const sideLabel = body.isTop ? "表（先攻）" : "裏（後攻）";
    const lineupLen = Math.max(9, body.structure.batters.length);

    const imageParts: GeminiContentPart[] = [
      {
        inlineData: {
          mimeType: body.cropMimeType || "image/jpeg",
          data: body.cropBase64,
        },
      },
    ];

    const legendPart = await resolveLegendImagePart(
      c,
      db,
      body.teamId,
      body.legendBase64,
      body.legendMimeType
    );
    let legendNote = "";
    if (legendPart) {
      imageParts.push(legendPart);
      legendNote = `\n・画像2: チーム公式のスコア記号早見表（最優先で参照）`;
    }

    const pitcherSpecLines = body.structure.pitchers.map(
      (p) =>
        `・${p.fromInning}回〜${p.toInning}回: #${p.uniformNumber} ${
          p.name || "投手"
        }`
    );

    const batterRowsDesc = spec.batters.map(
      (b) =>
        `・[${b.slotKey}] ${b.battingOrder}番 ${b.batterName}（列 c:${b.columnIndex}） | 現在の仮読取: ${b.currentResultLabel}（dir:"${b.currentDirection}", o:${b.currentOutsInPlay}）`
    );

    const boundaryNote =
      typeof spec.nextInningLeadOffOrder === "number"
        ? `次イニング（${spec.inning + 1}回${sideLabel}）の先頭打者は【${
            spec.nextInningLeadOffOrder
          }番】であることが確定しています（＝この${spec.inning}回は原則【${
            ((spec.nextInningLeadOffOrder - 2 + lineupLen) % lineupLen) + 1
          }番】で完了しています）。`
        : `この${spec.inning}回${sideLabel}の先頭打者は【${spec.expectedLeadOffOrder}番】目安です。`;

    const exPitcher =
      body.structure.pitchers.find(
        (p) => spec.inning >= p.fromInning && spec.inning <= p.toInning
      )?.name ||
      body.structure.pitchers[0]?.name ||
      "相手投手";
    const firstB = spec.batters[0];

    const prompt = `あなたは日本の早稲田式・成美堂式・リトルシニア式スコアブックのプロ公式記録員AIです。
現在、【${spec.inning}回${sideLabel}】の読取結果で合計アウト数が【${spec.currentTotalOuts}アウト（3アウト超過）】という野球規則上あり得ない矛盾が発生しています。
添付画像1には、この${spec.inning}回${sideLabel}の候補マス [${spec.batters
      .map((b) => b.slotKey)
      .join(", ")}] を上から順に **[全体マス | BSO拡大 | 中央・右下拡大]** の高精細トリプルビューで並べています。${legendNote}

【対象イニングの確定前提条件】
・イニング: ${spec.inning}回${sideLabel}（確定得点 = ${spec.confirmedRuns}点）
・打順境界条件: ${boundaryNote}
・相手登板投手: ${pitcherSpecLines.join(" / ")}

【再検算対象のマス一覧（現在 合計${spec.currentTotalOuts}アウト ➔ 必ず合計 3 アウトへ修正せよ！）】
${batterRowsDesc.join("\n")}

【🔥3アウト超過が起きた原因の特定と厳密修正ルール】
1. **残す打席（drop: false）の全 "o" 合計は必ずピタリ【3】にすること！（4以上は絶対不可）**
2. **パターンA（全マスが実在する打席で、うち1〜2マスが実は「出塁 o: 0」だったケース）**:
   - たとえば4人の打者（例: 1番〜4番）がこのイニングに打席に立って次イニングが5番から始まっている場合、4人全員の打席が実在（drop: false）し、**4人のうち1人は必ず出塁（"o": 0）**しています！
   - 各マスの **[中央・右下拡大]** をよく見比べ、以下の「出塁しているマス（"b1": true, "o": 0）」を見つけ出してください:
     ・本塁→1塁が太い実線/赤線で、右下に斜線『/』や守備番号『7』『8』『9』『6』等がある **単打（rc:"single", o:0）**・二塁打・三塁打
     ・本塁→1塁が実線で、左BSOにボール4球・右下に『B』『D』がある **四球（rc:"walk", o:0）・死球（rc:"hit_by_pitch", o:0）**
     ・右下に『E6』『E4』『4E-3』『6E-3』『4E』等がある **失策・悪送球出塁（rc:"error", dir:"4E-3"等, o:0）**、または『K』でも本塁→1塁が実線の **振り逃げ出塁（rc:"dropped_third_strike", o:0）**
     ・**先行走者の封殺・盗塁死の二重計上**: 出塁した打者の中央に後続打席での封殺・盗塁死『Ⅰ/Ⅱ/Ⅲ』が書かれている場合、**その出塁打者自身は "o": 0** であり、後続の封殺打者（6-4/4-6/FC等）側のみを **"o": 1** としてください！
3. **パターンB（3アウト目『Ⅲ』『③』完了直後のマスが「イニング終了切り線 ／・∟」または「白紙空欄」または「次イニング重複」だったケース）**:
   - 先行する打席で既に『Ⅰ → Ⅱ → Ⅲ（または ① → ② → ③）』の3アウトが完了しており、末尾のマスには投球記号も守備番号も無く斜線『／』『∟』だけがある（または白紙）場合は、その末尾マスの **"drop": true** にして除外してください！
4. **"o" と "eo" の厳密区別・早稲田式「●（個人得点）」の分離・左BSO拡大の全球保持**:
   - "o" はその1打席で増えたアウト数（出塁=0, 単一アウト=1, 併殺打のみ=2）です。2死目・3死目の単一アウトで "o": 2 や "o": 3 と書くのは絶対厳禁です！
   - 出塁した打者（先頭四球や無走者安打など）の中央に後続打席での生還『●』があっても、その出塁打席は **ru: 0, rbi: 0** とし、実際に生還させた後続打者の打席にのみ ru を計上してください（満塁以外の四死球や失策・併殺・暴投生還は必ず rbi: 0）。
   - 各マスの **[BSO拡大]** にある手書き投球記号（○/●/ー/・/△ や球数番号 1,2,3...）も省略せず obs と p に全件出力してください。

【出力JSONフォーマット（改行無しのコンパクトJSONのみ返却。items配列に [${spec.batters
      .map((b) => b.slotKey)
      .join(", ")}] を順番通り出力し、除外行は "drop":true、残す行の "o" 合計は必ず 3 にすること！）】
{"items":[{"sk":"${firstB.slotKey}","drop":false,"c":${firstB.columnIndex},"bo":${firstB.battingOrder},"pt":"${exPitcher}","obs":"左:○,ー/中:Ⅰ/本一:破線/右下:6-3","b1":false,"p":["S","B","X"],"eo":1,"o":1,"dir":"6-3","rc":"groundout","rl":"遊ゴロ","rbi":0,"ru":0,"a":[],"cf":"h"}]}`;

    const validateInningOutsResp = (
      parsed: RawReconcileInningOutsResponse
    ): string | null => {
      const arr = parsed.items || parsed.ab || [];
      if (!Array.isArray(arr) || arr.length === 0) {
        return "3アウト再検算結果が0件です";
      }
      const kept = arr.filter((x) => x.drop !== true);
      if (kept.length === 0) {
        return "全打席がdropされたため無効です";
      }
      return null;
    };

    const rawResp =
      await callGeminiStructuredJson<RawReconcileInningOutsResponse>(
        apiKey,
        prompt,
        imageParts,
        "chunk",
        validateInningOutsResp,
        {
          maxBudgetMs: 48_000,
          skipModels: body.skipModels,
          cooledModelsOut: cooledModels,
        }
      );

    const rawItems = rawResp.items || rawResp.ab || [];
    let runningOuts = 0;
    const activeBases: Record<"1B" | "2B" | "3B", boolean> = {
      "1B": false,
      "2B": false,
      "3B": false,
    };

    const rebuiltRaw: Array<{
      atBat: ScorebookV2AtBat;
      explicitB1?: boolean;
    }> = [];

    for (let idx = 0; idx < spec.batters.length; idx++) {
      const slot = spec.batters[idx];
      const matched =
        rawItems.find(
          (it) =>
            (it.sk || it.slotKey || "").trim().toUpperCase() ===
            slot.slotKey.toUpperCase()
        ) || rawItems[idx];

      if (!matched || matched.drop === true) {
        continue;
      }

      const rlText = (matched.rl ?? matched.resultLabel ?? "").trim();
      if (/^(?:白紙|空欄|空白|未記入|切り線|斜線のみ)$/i.test(rlText)) {
        continue;
      }

      const colIndex = Math.max(
        1,
        toFiniteInt(matched.c ?? matched.columnIndex, slot.columnIndex) ||
          slot.columnIndex
      );
      const battingOrder = slot.battingOrder;
      const ocrPitcherHint = (matched.pt ?? matched.pitcherName ?? "").trim();
      const matchup = resolveActiveMatchupFromStructure(
        body.structure,
        spec.inning,
        battingOrder,
        ocrPitcherHint
      );

      const reconciled = reconcileRawAtBatEvidence(
        matched,
        activeBases,
        runningOuts
      );

      let resultCode = inferCanonicalResultCode(
        reconciled.rawResultCode,
        reconciled.rawResultLabel || reconciled.rawDir
      );
      if (
        matched.b1 === true &&
        resultCode === "groundout" &&
        /^[1-6]-[2456]$/.test((reconciled.rawDir || "").trim())
      ) {
        resultCode = "fc";
      }

      const activeRunnersCount =
        (activeBases["1B"] ? 1 : 0) +
        (activeBases["2B"] ? 1 : 0) +
        (activeBases["3B"] ? 1 : 0);

      if (
        resultCode === "double_play" &&
        (activeRunnersCount === 0 || runningOuts >= 2)
      ) {
        resultCode = /[FL]$|飛|直|ライナー/i.test(
          `${reconciled.rawDir || ""} ${reconciled.rawResultLabel || ""}`
        )
          ? "flyout"
          : "groundout";
      }

      const harmonizedFielding = harmonizeOcrFieldingAndLabel(
        resultCode,
        reconciled.rawDir,
        reconciled.rawResultLabel
      );

      let advances: ScorebookV2Advance[] = reconciled.rawAdvances.map((adv) => {
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

      if (isSafeBatterReach && advances.length > 0) {
        advances = advances.filter(
          (adv) => !adv.isOut || adv.from === "BAT" || activeBases[adv.from]
        );
      }

      const occupiedBaseRunnerOuts = Math.min(
        activeRunnersCount,
        advances.filter(
          (a) => a.isOut && a.from !== "BAT" && activeBases[a.from]
        ).length
      );
      const rawOutsVal = Math.max(0, Math.min(3, reconciled.outsInPlay));

      const isDefiniteBatterOut =
        resultCode === "groundout" ||
        resultCode === "flyout" ||
        resultCode === "infield_fly" ||
        resultCode === "strikeout" ||
        resultCode === "dropped_third_strike_out" ||
        resultCode === "sac_bunt" ||
        resultCode === "sac_fly" ||
        resultCode === "interference_out";

      let outsVal = rawOutsVal;
      if (resultCode === "triple_play") {
        outsVal = Math.max(
          1,
          Math.min(3 - runningOuts, 1 + activeRunnersCount)
        );
      } else if (resultCode === "double_play") {
        outsVal = 2;
      } else if (isDefiniteBatterOut) {
        outsVal = Math.min(3, 1 + occupiedBaseRunnerOuts);
      } else if (isSafeBatterReach) {
        outsVal = Math.min(2, occupiedBaseRunnerOuts);
      } else if (resultCode === "fc") {
        outsVal = rawOutsVal >= 1 || occupiedBaseRunnerOuts >= 1 ? 1 : 0;
      } else if (resultCode === "other") {
        outsVal =
          occupiedBaseRunnerOuts > 0
            ? Math.min(2, occupiedBaseRunnerOuts)
            : rawOutsVal > 0
            ? 1
            : 0;
      }

      const normalizedPitches = normalizePitchArray(
        reconciled.rawPitches,
        resultCode,
        advances,
        activeBases
      );
      const { balls, strikes } = computeCountFromPitches(normalizedPitches);

      const inningMeta = body.structure.innings.find(
        (m) => m.inning === spec.inning
      );
      const batterRowBox = body.structure.batters.find(
        (b) => b.battingOrder === battingOrder
      )?.rowBox;
      const skewedQuad = getCellQuadInStructure(
        body.structure,
        spec.inning,
        colIndex,
        battingOrder,
        0
      );
      const cellBox = skewedQuad
        ? quadToBoundingBox(skewedQuad)
        : computeCartesianCellBox(
            undefined,
            inningMeta?.columnBox,
            inningMeta?.columnCount ?? 1,
            colIndex,
            batterRowBox
          );

      for (const adv of advances) {
        if (adv.from === "1B" || adv.from === "2B" || adv.from === "3B") {
          activeBases[adv.from] = false;
        }
      }
      for (const adv of advances) {
        if (
          !adv.isOut &&
          (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")
        ) {
          activeBases[adv.to] = true;
        }
      }
      if (
        advances.filter((a) => a.from === "BAT").length === 0 &&
        outsVal === 0
      ) {
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
      const rawRunsInPlay =
        toFiniteInt(matched.ru ?? matched.runsInPlay, 0) || 0;
      const effectiveRuns = Math.max(rawRunsInPlay, hpCount, isHr ? 1 : 0);
      const parsedRbi = toFiniteInt(matched.rbi);

      runningOuts = Math.min(3, runningOuts + outsVal);
      const rawConf = (matched.cf ?? matched.confidence ?? "h").toLowerCase();
      const confidence: ConfidenceLevel =
        rawConf === "l" || rawConf === "low"
          ? "low"
          : rawConf === "m" || rawConf === "medium"
          ? "medium"
          : "high";

      rebuiltRaw.push({
        explicitB1: matched.b1,
        atBat: {
          id: slot.atBatId || crypto.randomUUID(),
          inning: spec.inning,
          isTop: body.isTop,
          columnIndex: colIndex,
          battingOrder,
          batterName: matchup.batterName || slot.batterName,
          batterPlayerId: matchup.batterPlayerId,
          pitcherName: matchup.pitcherName || ocrPitcherHint,
          pitcherPlayerId: matchup.pitcherPlayerId,
          resultCode,
          resultLabel: harmonizedFielding.resultLabel,
          battedDirection: harmonizedFielding.battedDirection,
          rbi: Math.max(0, parsedRbi ?? effectiveRuns),
          outsInPlay: outsVal,
          endingOuts: runningOuts,
          runsInPlay: effectiveRuns,
          balls,
          strikes,
          pitches: normalizedPitches,
          advances,
          confidence,
          confidenceReason:
            (matched.cr ?? matched.confidenceReason ?? "").trim() || undefined,
          cellBox,
        },
      });
    }

    let finalInningList = reconcileSheetExcessOutsDeterministically(
      rebuiltRaw.map((x) => x.atBat),
      body.structure
    ).atBats;

    // 万一モデルが依然として4アウト以上を返した場合の最終安全弁（b1:true だった行や末尾切り線候補から3アウトへ厳密収束）
    let sumAfter = finalInningList.reduce(
      (s, x) => s + Math.max(0, x.outsInPlay),
      0
    );
    if (sumAfter > 3) {
      // 次イニング先頭打順が既に3アウト目の直後を指しているなら余剰末尾を切り落とす
      if (
        typeof spec.nextInningLeadOffOrder === "number" &&
        finalInningList.length >= 4
      ) {
        let c = 0;
        for (let i = 0; i < finalInningList.length; i++) {
          c += Math.max(0, finalInningList[i].outsInPlay);
          if (
            c === 3 &&
            (finalInningList[i].battingOrder % lineupLen) + 1 ===
              spec.nextInningLeadOffOrder
          ) {
            finalInningList = finalInningList.slice(0, i + 1);
            sumAfter = 3;
            break;
          }
        }
      }

      // それでも4アウト以上（全打席実在）なら b1===true だった打席や fc/other/low確信度打席を出塁(o:0)へ補正し必ず3アウトにする
      const b1TrueIds = new Set(
        rebuiltRaw.filter((r) => r.explicitB1 === true).map((r) => r.atBat.id)
      );
      for (
        let i = 0;
        i < finalInningList.length && sumAfter > 3;
        i++
      ) {
        const ab = finalInningList[i];
        if (b1TrueIds.has(ab.id) && ab.outsInPlay === 1) {
          if (ab.resultCode === "groundout" || ab.resultCode === "flyout") {
            const harm = harmonizeOcrFieldingAndLabel(
              "single",
              ab.battedDirection,
              ""
            );
            ab.resultCode = "single";
            ab.resultLabel = harm.resultLabel;
            ab.confidence = "low";
            ab.confidenceReason = "3アウト上限整合により出塁候補として自動補正";
          }
          ab.outsInPlay = 0;
          sumAfter -= 1;
        }
      }

      // 最終手段として確信度 low/medium の非三振打席を野選/内野安打(o:0)として3アウト上限を死守
      for (
        let i = finalInningList.length - 1;
        i >= 0 && sumAfter > 3;
        i--
      ) {
        const ab = finalInningList[i];
        if (ab.outsInPlay >= 1 && ab.resultCode !== "strikeout") {
          if (ab.outsInPlay >= 2) {
            const harm = harmonizeOcrFieldingAndLabel(
              "groundout",
              ab.battedDirection,
              ""
            );
            ab.resultCode = "groundout";
            ab.resultLabel = harm.resultLabel;
            ab.outsInPlay = 1;
            sumAfter -= 1;
          } else if (i < finalInningList.length - 1) {
            const harm = harmonizeOcrFieldingAndLabel(
              "single",
              ab.battedDirection,
              ""
            );
            ab.resultCode = "single";
            ab.resultLabel = harm.resultLabel;
            ab.outsInPlay = 0;
            ab.confidence = "low";
            ab.confidenceReason = "1イニング3アウト上限に基づき要確認出塁として補正";
            sumAfter -= 1;
          }
        }
      }

      let mono = 0;
      for (const ab of finalInningList) {
        mono = Math.min(3, mono + Math.max(0, ab.outsInPlay));
        ab.endingOuts = mono;
      }
    }

    return c.json({
      success: true,
      atBats: finalInningList,
      cooledModels,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: `3アウト超過自動補正エラー: ${msg}`,
        cooledModels,
      },
      500
    );
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
  topImageBase64?: string;
  topImageMimeType?: string;
  topImageUrl?: string | null;
  bottomImageBase64?: string;
  bottomImageMimeType?: string;
  bottomImageUrl?: string | null;
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

    const incomingTop = includeTop
      ? materializeSheetRunnerAdvances(
          body.topAtBats || [],
          body.topStructure
        )
      : [];
    const incomingBottom = includeBottom
      ? materializeSheetRunnerAdvances(
          body.bottomAtBats || [],
          body.bottomStructure
        )
      : [];

    // バリデーションメッセージ生成
    const topIssues = includeTop
      ? validateScorebookSheet(incomingTop, body.topStructure, true)
      : [];
    const bottomIssues = includeBottom
      ? validateScorebookSheet(incomingBottom, body.bottomStructure, false)
      : [];
    const allIssues: ScorebookValidationIssue[] = [...topIssues, ...bottomIssues];

    // 1. 削除対象の既存データを整理（片面取込の場合は逆側のデータを絶対に消さない！）
    //    ※外部キー制約（base_advances.pitch_id -> pitches.id, play_logs.at_bat_id -> at_bats.id）を遵守し、必ず子テーブルから先に削除する
    if (body.importScope === "both") {
      await db.delete(baseAdvances).where(eq(baseAdvances.matchId, match.id));
      await db.delete(playLogs).where(eq(playLogs.matchId, match.id));
      const existingAbs = await db
        .select({ id: atBats.id })
        .from(atBats)
        .where(eq(atBats.matchId, match.id))
        .all();
      const abIds = existingAbs.map((r) => r.id);
      if (abIds.length > 0) {
        await deleteByAtBatIdsChunked(db, abIds);
      }
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
    const validPlayerIds = new Set(roster.map((p) => p.id));
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
        const safeSlotOrder = Math.max(
          1,
          Math.round(Number(slot.battingOrder) || 1)
        );
        const resolvedPlayer =
          (slot.playerId
            ? roster.find((p) => p.id === slot.playerId) || null
            : null) || matchRosterPlayer(slot.name, slot.uniformNumber, roster);

        if (resolvedPlayer) {
          lineupInserts.push({
            id: crypto.randomUUID(),
            matchId: match.id,
            playerId: resolvedPlayer.id,
            battingOrder: safeSlotOrder,
            position: slot.position || resolvedPlayer.primaryPosition || "",
            isStarting: true,
            inningEntered: 1,
          });
        }

        myLineupJson.push({
          order: safeSlotOrder,
          playerId: resolvedPlayer ? resolvedPlayer.id : null,
          name: resolvedPlayer ? resolvedPlayer.name : slot.name || "",
          uniformNumber: resolvedPlayer
            ? resolvedPlayer.uniformNumber
            : slot.uniformNumber || "",
          position: slot.position || "",
        });

        for (const sub of slot.substitutions || []) {
          const resolvedSub =
            (sub.playerId
              ? roster.find((p) => p.id === sub.playerId) || null
              : null) || matchRosterPlayer(sub.name, sub.uniformNumber, roster);
          if (resolvedSub) {
            lineupInserts.push({
              id: crypto.randomUUID(),
              matchId: match.id,
              playerId: resolvedSub.id,
              battingOrder: safeSlotOrder,
              position:
                sub.position ||
                (sub.subType === "PH"
                  ? "P"
                  : sub.subType === "PR"
                  ? "R"
                  : sub.subType === "TR"
                  ? "TR"
                  : resolvedSub.primaryPosition || ""),
              isStarting: false,
              inningEntered: Math.max(
                1,
                Math.round(Number(sub.inningEntered) || 1)
              ),
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
        order: Math.max(1, Math.round(Number(b.battingOrder) || 1)),
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

    const knownMyPlayerIdByCleanName = new Map<string, string>();
    const registerKnownMyPlayer = (
      rawName: string | undefined,
      candidateId: string | null | undefined
    ) => {
      if (!rawName || !candidateId || !validPlayerIds.has(candidateId)) return;
      const key = rawName.replace(/\s+/g, "").trim();
      if (key) {
        knownMyPlayerIdByCleanName.set(key, candidateId);
      }
    };
    if (myStructure) {
      for (const slot of myStructure.batters) {
        registerKnownMyPlayer(slot.name, slot.playerId);
        for (const sub of slot.substitutions || []) {
          registerKnownMyPlayer(sub.name, sub.playerId);
        }
      }
    }
    for (const abItem of [...incomingTop, ...incomingBottom]) {
      const mySide =
        (abItem.isTop && isMyTeamFirst) || (!abItem.isTop && !isMyTeamFirst);
      if (!mySide) continue;
      registerKnownMyPlayer(abItem.batterName, abItem.batterPlayerId);
      for (const pr of abItem.pinchRunners || []) {
        registerKnownMyPlayer(pr.name, pr.playerId);
      }
    }

    const insertQueries: Array<unknown> = [];
    const baseTimestamp = Date.now();
    let seq = 0;

    for (const ab of combinedIncoming) {
      seq += 1;
      const atBatId = crypto.randomUUID();
      const safeInning = Math.max(1, Math.round(Number(ab.inning) || 1));
      const safeIsTop = Boolean(ab.isTop);
      const safePitches = Array.isArray(ab.pitches) ? ab.pitches : [];
      const safeAdvances = Array.isArray(ab.advances) ? ab.advances : [];
      const safeResultLabel = ab.resultLabel || ab.resultCode || "";
      const eventTimestamp = new Date(baseTimestamp + seq * 1000);
      const isMyTeamBatting =
        (safeIsTop && isMyTeamFirst) || (!safeIsTop && !isMyTeamFirst);

      const verifiedBatterId =
        ab.batterPlayerId && validPlayerIds.has(ab.batterPlayerId)
          ? ab.batterPlayerId
          : null;
      const batterPlayerId = isMyTeamBatting
        ? verifiedBatterId ||
          matchRosterPlayer(ab.batterName, undefined, roster)?.id ||
          null
        : null;

      const verifiedPitcherId =
        ab.pitcherPlayerId && validPlayerIds.has(ab.pitcherPlayerId)
          ? ab.pitcherPlayerId
          : null;
      const pitcherPlayerId = !isMyTeamBatting
        ? verifiedPitcherId ||
          matchRosterPlayer(ab.pitcherName, undefined, roster)?.id ||
          null
        : null;

      // A. at_bats 挿入（DB統計SQLに100%対応する正規 resultCode を保存！）
      insertQueries.push(
        db.insert(atBats).values({
          id: atBatId,
          matchId: match.id,
          inning: safeInning,
          isTop: safeIsTop,
          batterId: batterPlayerId,
          pitcherId: pitcherPlayerId,
          result: ab.resultCode || "other",
          createdAt: eventTimestamp,
        })
      );

      // B. 1球ごとの pitches 挿入（牽制球・バントファウルも区別して保存）
      const pitchIdByNum: Record<number, string> = {};
      let ballsBefore = 0;
      let strikesBefore = 0;

      safePitches.forEach((pCode, idx) => {
        const pitchNum = idx + 1;
        const pitchId = crypto.randomUUID();
        pitchIdByNum[pitchNum] = pitchId;

        const dbPitchResult =
          pCode === "in_play"
            ? "strike"
            : pCode === "hbp"
            ? "ball"
            : pCode || "strike";

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
      for (const adv of safeAdvances) {
        const cleanAdvRunner = (adv.runnerName || "").replace(/\s+/g, "").trim();
        const directRunnerId = cleanAdvRunner
          ? knownMyPlayerIdByCleanName.get(cleanAdvRunner) || null
          : null;
        const runnerId = isMyTeamBatting
          ? directRunnerId ||
            matchRosterPlayer(adv.runnerName, undefined, roster)?.id ||
            null
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
            reason: adv.method || "other",
            isOut: Boolean(adv.isOut),
          })
        );
      }

      // D. play_logs 挿入（タイムライン表示用に日本語表記と1球履歴テキストを格納）
      const inningText = `${safeInning}回${safeIsTop ? "表" : "裏"}`;
      let realPitchSeq = 0;
      const pitchLines =
        safePitches.length > 0
          ? `\n===PITCHES===\n${safePitches
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

      const countCalc = computeCountFromPitches(safePitches);
      const cleanDirTag = (ab.battedDirection || "").trim();
      const dirSuffix =
        cleanDirTag && !safeResultLabel.includes(cleanDirTag)
          ? ` (${cleanDirTag})`
          : "";
      const rbiSuffix =
        ab.rbi > 0
          ? `（打点${ab.rbi}）`
          : ab.runsInPlay > 0
          ? `（得点${ab.runsInPlay}・打点0）`
          : "";
      const runnerMovesText = safeAdvances
        .filter((a) => a.from !== "BAT" && (a.isOut || a.from !== a.to))
        .map((a) => {
          const rLabel = a.runnerName ? a.runnerName : "走者";
          const fJa = formatBaseJa(a.from);
          const tJa = formatBaseJa(a.to);
          return `${rLabel}:${fJa}→${tJa}${
            a.isOut ? "アウト" : a.to === "HP" ? "生還" : ""
          }`;
        });
      const runnerSuffix =
        runnerMovesText.length > 0 ? ` ［${runnerMovesText.join("、")}］` : "";
      const description = `${ab.battingOrder}番 ${ab.batterName || "打者"}: ${safeResultLabel}${dirSuffix}${rbiSuffix}${runnerSuffix}${pitchLines} [B:${countCalc.balls}, S:${
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
            inning: safeInning,
            isTop: safeIsTop,
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
          createdAt: eventTimestamp,
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

    // 5. 保存後もAI再解析なしで Step 2 / Step 3 にそのまま呼び出して修正・再保存できるよう、
    //    スナップショットJSONおよび前処理済みシート画像（R2）を非破壊マージで永続化する
    const existingSnap = await db
      .select()
      .from(matchScorebookSnapshots)
      .where(eq(matchScorebookSnapshots.matchId, match.id))
      .get();

    const uploadOrPreserveSheetImage = async (
      side: "top" | "bottom",
      rawBase64: string | undefined,
      rawMime: string | undefined,
      explicitUrl: string | null | undefined,
      prevUrl: string | null | undefined
    ): Promise<string | null> => {
      const trimmedB64 = (rawBase64 || "").trim();
      if (trimmedB64 && c.env.BUCKET) {
        try {
          const cleanB64 = trimmedB64.includes(",")
            ? (trimmedB64.split(",")[1] || "").trim()
            : trimmedB64;
          const bytes = base64ToUint8Array(cleanB64);
          if (bytes.byteLength > 0 && bytes.byteLength <= 6_000_000) {
            const lowerMime = (rawMime || "image/jpeg").toLowerCase();
            const safeMime =
              lowerMime === "image/png"
                ? "image/png"
                : lowerMime === "image/webp"
                ? "image/webp"
                : "image/jpeg";
            const ext =
              safeMime === "image/png"
                ? "png"
                : safeMime === "image/webp"
                ? "webp"
                : "jpg";
            const r2Key = `scorebooks/${side}-${match.id}-${Date.now()}.${ext}`;
            const arrayBuf = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            ) as ArrayBuffer;
            await c.env.BUCKET.put(r2Key, arrayBuf, {
              httpMetadata: { contentType: safeMime },
            });

            const oldPrefix = `/api/images/scorebooks/${side}-${match.id}-`;
            if (prevUrl && prevUrl.startsWith(oldPrefix)) {
              const oldKey = prevUrl.slice("/api/images/".length);
              await c.env.BUCKET.delete(oldKey).catch(() => {});
            }
            return `/api/images/${r2Key}`;
          }
        } catch {
          // R2保存エラー時もDBの成績保存自体は絶対に失敗させない
        }
      }
      if (explicitUrl && explicitUrl.startsWith("/api/images/")) {
        return explicitUrl;
      }
      return prevUrl || null;
    };

    const nextTopImageUrl = includeTop
      ? await uploadOrPreserveSheetImage(
          "top",
          body.topImageBase64,
          body.topImageMimeType,
          body.topImageUrl,
          existingSnap?.topImageUrl
        )
      : existingSnap?.topImageUrl ?? null;

    const nextBottomImageUrl = includeBottom
      ? await uploadOrPreserveSheetImage(
          "bottom",
          body.bottomImageBase64,
          body.bottomImageMimeType,
          body.bottomImageUrl,
          existingSnap?.bottomImageUrl
        )
      : existingSnap?.bottomImageUrl ?? null;

    const nextTopStructureJson = includeTop
      ? JSON.stringify(body.topStructure ?? null)
      : existingSnap?.topStructureJson ?? null;
    const nextBottomStructureJson = includeBottom
      ? JSON.stringify(body.bottomStructure ?? null)
      : existingSnap?.bottomStructureJson ?? null;
    const nextTopAtBatsJson = includeTop
      ? JSON.stringify(incomingTop)
      : existingSnap?.topAtBatsJson ?? null;
    const nextBottomAtBatsJson = includeBottom
      ? JSON.stringify(incomingBottom)
      : existingSnap?.bottomAtBatsJson ?? null;

    try {
      await db
        .insert(matchScorebookSnapshots)
        .values({
          matchId: match.id,
          topStructureJson: nextTopStructureJson,
          bottomStructureJson: nextBottomStructureJson,
          topAtBatsJson: nextTopAtBatsJson,
          bottomAtBatsJson: nextBottomAtBatsJson,
          topImageUrl: nextTopImageUrl,
          bottomImageUrl: nextBottomImageUrl,
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: matchScorebookSnapshots.matchId,
          set: {
            topStructureJson: nextTopStructureJson,
            bottomStructureJson: nextBottomStructureJson,
            topAtBatsJson: nextTopAtBatsJson,
            bottomAtBatsJson: nextBottomAtBatsJson,
            topImageUrl: nextTopImageUrl,
            bottomImageUrl: nextBottomImageUrl,
            updatedAt: Date.now(),
          },
        });
    } catch (snapErr) {
      console.warn("[LiffScorebookV2] Snapshot upsert skipped:", snapErr);
    }

    return c.json({
      success: true,
      summary: {
        matchId: match.id,
        savedAtBatsCount: combinedIncoming.length,
        savedPitchesCount: combinedIncoming.reduce(
          (sum, ab) =>
            sum +
            (Array.isArray(ab.pitches) ? ab.pitches : []).filter(
              (p) => !isNonPitchMoundEvent(p)
            ).length,
          0
        ),
        myScore: finalMyScore,
        opponentScore: finalOppScore,
        myHits,
        opponentHits,
        topImageUrl: nextTopImageUrl,
        bottomImageUrl: nextBottomImageUrl,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `保存エラー: ${msg}` }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5-B. 保存済みスコアブック呼び出し（あとから再編集モード用 GET /api/liff/scorebook/saved）
//   - match_scorebook_snapshots が存在する場合は4隅座標・切り抜き画像URLも含めて完全無劣化で即座に返却
//   - スナップショット導入前に保存された過去試合についても、at_bats / pitches / base_advances / play_logs / match_lineups から忠実に復元
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface StoredLineupJsonEntry {
  order?: number;
  battingOrder?: number;
  playerId?: string | null;
  name?: string;
  uniformNumber?: string;
  position?: string;
}

function safeParseJsonValue<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function mapDisplayPitchLineToCanonical(rawLine: string): CanonicalPitchResult | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(":");
  const label = (colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : trimmed).trim();
  if (!label) return null;

  for (const [code, ja] of Object.entries(PITCH_DISPLAY_JA) as Array<
    [CanonicalPitchResult, string]
  >) {
    if (label === ja) {
      return code;
    }
  }
  if (label.includes("1塁牽")) return "pickoff_1b";
  if (label.includes("2塁牽")) return "pickoff_2b";
  if (label.includes("3塁牽")) return "pickoff_3b";
  if (label.includes("牽制")) return "pickoff";
  if (label.includes("ボーク")) return "balk";
  if (label.includes("死球")) return "hbp";
  if (label.includes("ヒット")) return "hit";
  if (label.includes("インプレー")) return "in_play";
  if (label.includes("バントファウル")) return "bunt_foul";
  if (label.includes("バント空振り")) return "bunt_swinging";
  if (label.includes("空振り")) return "swinging_strike";
  if (label.includes("見逃し") || label.includes("ストライク")) return "strike";
  if (label.includes("ファウル")) return "foul";
  if (label.includes("ボール")) return "ball";
  return null;
}

liffScorebookRouter.get("/saved", async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB, { schema });
  const matchId = (c.req.query("matchId") || "").trim();

  if (!matchId) {
    return c.json({ success: false, error: "試合IDが指定されていません" }, 400);
  }

  try {
    const match = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .get();

    if (!match) {
      return c.json({ success: false, error: "対象の試合が見つかりません" }, 404);
    }

    const allAbRows = await db
      .select()
      .from(atBats)
      .where(eq(atBats.matchId, match.id))
      .orderBy(asc(atBats.inning), asc(atBats.createdAt))
      .all();

    if (allAbRows.length === 0) {
      return c.json(
        {
          success: false,
          error: "この試合にはまだ保存済みの打席データがありません",
        },
        404
      );
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

    const rosterById = new Map(roster.map((p) => [p.id, p]));
    const isMyTeamFirst = match.battingOrder === "first";

    const snap = await db
      .select()
      .from(matchScorebookSnapshots)
      .where(eq(matchScorebookSnapshots.matchId, match.id))
      .get();

    const topDbAbs = allAbRows.filter((r) => r.isTop);
    const bottomDbAbs = allAbRows.filter((r) => !r.isTop);

    let topStructure =
      topDbAbs.length > 0
        ? safeParseJsonValue<ScorebookSheetStructure>(snap?.topStructureJson)
        : null;
    let bottomStructure =
      bottomDbAbs.length > 0
        ? safeParseJsonValue<ScorebookSheetStructure>(snap?.bottomStructureJson)
        : null;
    let topAtBats =
      topDbAbs.length > 0
        ? (safeParseJsonValue<ScorebookV2AtBat[]>(snap?.topAtBatsJson) || []).map(
            (ab) => ({
              ...ab,
              battedDirection:
                ab.battedDirection || defaultGenericDirection(ab.resultCode),
            })
          )
        : [];
    let bottomAtBats =
      bottomDbAbs.length > 0
        ? (
            safeParseJsonValue<ScorebookV2AtBat[]>(snap?.bottomAtBatsJson) || []
          ).map((ab) => ({
            ...ab,
            battedDirection:
              ab.battedDirection || defaultGenericDirection(ab.resultCode),
          }))
        : [];

    const needReconstructTop =
      topDbAbs.length > 0 && (!topStructure || topAtBats.length === 0);
    const needReconstructBottom =
      bottomDbAbs.length > 0 && (!bottomStructure || bottomAtBats.length === 0);

    // スナップショット未保存の過去データがある場合はリレーショナルテーブル群から完全復元する
    if (needReconstructTop || needReconstructBottom) {
      const abIds = allAbRows.map((r) => r.id);
      const pitchRows: Array<typeof pitches.$inferSelect> = [];
      const advRows: Array<typeof baseAdvances.$inferSelect> = [];
      const logRows: Array<typeof playLogs.$inferSelect> = [];

      for (let i = 0; i < abIds.length; i += 60) {
        const slice = abIds.slice(i, i + 60);
        const [pPart, aPart, lPart] = await Promise.all([
          db
            .select()
            .from(pitches)
            .where(inArray(pitches.atBatId, slice))
            .orderBy(asc(pitches.pitchNumber))
            .all(),
          db
            .select()
            .from(baseAdvances)
            .where(inArray(baseAdvances.atBatId, slice))
            .all(),
          db
            .select()
            .from(playLogs)
            .where(inArray(playLogs.atBatId, slice))
            .all(),
        ]);
        pitchRows.push(...pPart);
        advRows.push(...aPart);
        logRows.push(...lPart);
      }

      const lineupRows = await db
        .select()
        .from(matchLineups)
        .where(eq(matchLineups.matchId, match.id))
        .all();

      const pitchesByAb = new Map<string, Array<typeof pitches.$inferSelect>>();
      for (const pr of pitchRows) {
        const list = pitchesByAb.get(pr.atBatId) || [];
        list.push(pr);
        pitchesByAb.set(pr.atBatId, list);
      }
      const advsByAb = new Map<string, Array<typeof baseAdvances.$inferSelect>>();
      for (const ar of advRows) {
        const list = advsByAb.get(ar.atBatId) || [];
        list.push(ar);
        advsByAb.set(ar.atBatId, list);
      }
      const logByAb = new Map<string, typeof playLogs.$inferSelect>();
      for (const lr of logRows) {
        if (lr.atBatId && !logByAb.has(lr.atBatId)) {
          logByAb.set(lr.atBatId, lr);
        }
      }

      const reconstructSide = (
        isTop: boolean,
        sideDbRows: Array<typeof atBats.$inferSelect>
      ): {
        structure: ScorebookSheetStructure;
        atBats: ScorebookV2AtBat[];
      } => {
        const isMyTeamBatting =
          (isTop && isMyTeamFirst) || (!isTop && !isMyTeamFirst);

        const rawLineupJson = safeParseJsonValue<StoredLineupJsonEntry[]>(
          isMyTeamBatting ? match.myLineup : match.opponentLineup
        );

        const battersByOrder = new Map<number, ScorebookBatterSlot>();
        if (Array.isArray(rawLineupJson)) {
          for (const entry of rawLineupJson) {
            const ord = Number(entry.order ?? entry.battingOrder ?? 0);
            if (ord < 1 || ord > 15) continue;
            const linkedPlayer = entry.playerId
              ? rosterById.get(entry.playerId)
              : undefined;
            battersByOrder.set(ord, {
              battingOrder: ord,
              name: linkedPlayer?.name || (entry.name || "").trim(),
              uniformNumber:
                linkedPlayer?.uniformNumber ||
                (entry.uniformNumber || "").trim(),
              position: normalizePositionCode(
                entry.position || linkedPlayer?.primaryPosition || ""
              ),
              playerId: linkedPlayer?.id || entry.playerId || null,
              substitutions: [],
            });
          }
        }

        if (isMyTeamBatting && lineupRows.length > 0) {
          for (const lr of lineupRows) {
            const ord = lr.battingOrder;
            if (ord < 1 || ord > 15) continue;
            const rp = rosterById.get(lr.playerId);
            if (lr.isStarting) {
              if (!battersByOrder.has(ord)) {
                battersByOrder.set(ord, {
                  battingOrder: ord,
                  name: rp?.name || "",
                  uniformNumber: rp?.uniformNumber || "",
                  position: normalizePositionCode(
                    lr.position || rp?.primaryPosition || ""
                  ),
                  playerId: lr.playerId,
                  substitutions: [],
                });
              }
            } else {
              const slot =
                battersByOrder.get(ord) ||
                ({
                  battingOrder: ord,
                  name: "",
                  uniformNumber: "",
                  position: "",
                  playerId: null,
                  substitutions: [],
                } satisfies ScorebookBatterSlot);
              const subType: ScorebookSubstitution["subType"] =
                lr.position === "P"
                  ? "PH"
                  : lr.position === "R"
                  ? "PR"
                  : lr.position === "TR"
                  ? "TR"
                  : "DEF";
              slot.substitutions.push({
                id: lr.id || crypto.randomUUID(),
                inningEntered: Math.max(1, lr.inningEntered || 1),
                subType,
                name: rp?.name || "",
                uniformNumber: rp?.uniformNumber || "",
                position:
                  subType === "DEF" ? normalizePositionCode(lr.position) : "",
                playerId: lr.playerId,
              });
              battersByOrder.set(ord, slot);
            }
          }
        }

        // 打席ごとの復元
        const rebuiltAtBats: ScorebookV2AtBat[] = [];
        const orderLapByInning = new Map<string, number>();
        let runningInning = -1;
        let runningOuts = 0;
        let fallbackNextOrder = 1;

        for (const dbAb of sideDbRows) {
          if (dbAb.inning !== runningInning) {
            runningInning = dbAb.inning;
            runningOuts = 0;
          }

          const linkedLog = logByAb.get(dbAb.id);
          const dbPitchList = pitchesByAb.get(dbAb.id) || [];
          const dbAdvList = advsByAb.get(dbAb.id) || [];
          const pitchNumberById = new Map<string, number>(
            dbPitchList.map((pr) => [pr.id, pr.pitchNumber])
          );

          let parsedOrder = 0;
          let parsedBatterName = "";
          let parsedLabel = "";
          let parsedDir = "";
          let parsedRbi: number | undefined;
          let parsedOuts: number | undefined;
          const runnerNameByFromBase = new Map<string, string>();
          let parsedPitches: CanonicalPitchResult[] = [];

          if (linkedLog?.description) {
            let workingDesc = linkedLog.description;
            const bsoMatch = workingDesc.match(
              /\s*\[B:(\d+),\s*S:(\d+),\s*O:(\d+)\]\s*$/
            );
            if (bsoMatch) {
              parsedOuts = Number(bsoMatch[3]);
              workingDesc = workingDesc.slice(0, bsoMatch.index).trim();
            }

            const pitchSplit = workingDesc.split("\n===PITCHES===\n");
            const headline = (pitchSplit[0] || "").trim();
            const pitchText = pitchSplit[1] || "";

            if (pitchText) {
              for (const line of pitchText.split("\n")) {
                const mappedCode = mapDisplayPitchLineToCanonical(line);
                if (mappedCode) {
                  parsedPitches.push(mappedCode);
                }
              }
            }

            const headMatch = headline.match(
              /^(\d+)番\s*([^:：]+)[:：]\s*(.*)$/
            );
            let playBody = headline;
            if (headMatch) {
              parsedOrder = Number(headMatch[1]) || 0;
              parsedBatterName = headMatch[2].trim();
              playBody = headMatch[3].trim();
            }

            // ［走者名:1塁→2塁、...］の解析・除去
            const runnerBracketMatch = playBody.match(/\s*［([^］]+)］\s*$/);
            if (runnerBracketMatch) {
              const segs = runnerBracketMatch[1].split("、");
              for (const seg of segs) {
                const rm = seg.match(/^([^:]+):(1塁|2塁|3塁)→/);
                if (rm) {
                  const baseCode =
                    rm[2] === "1塁"
                      ? "1B"
                      : rm[2] === "2塁"
                      ? "2B"
                      : "3B";
                  runnerNameByFromBase.set(baseCode, rm[1].trim());
                }
              }
              playBody = playBody.slice(0, runnerBracketMatch.index).trim();
            }

            // （打点X）の解析・除去
            const rbiMatch = playBody.match(/（打点(\d+)）\s*$/);
            if (rbiMatch) {
              parsedRbi = Number(rbiMatch[1]);
              playBody = playBody.slice(0, rbiMatch.index).trim();
            }

            // (6-3) / (K 2-3) の守備記号解析・除去
            const dirMatch = playBody.match(
              /\s+\(([0-9A-Za-z-]+|K\s+[1-9](?:-[1-9])?)\)\s*$/
            );
            if (dirMatch) {
              parsedDir = dirMatch[1].trim();
              playBody = playBody.slice(0, dirMatch.index).trim();
            }

            parsedLabel = playBody.trim();
          }

          const linkedBatter = dbAb.batterId
            ? rosterById.get(dbAb.batterId)
            : undefined;
          const linkedPitcher = dbAb.pitcherId
            ? rosterById.get(dbAb.pitcherId)
            : undefined;

          if (!parsedOrder && linkedBatter) {
            for (const [ord, slot] of battersByOrder.entries()) {
              if (
                slot.playerId === linkedBatter.id ||
                slot.substitutions.some((s) => s.playerId === linkedBatter.id)
              ) {
                parsedOrder = ord;
                break;
              }
            }
          }
          const battingOrder =
            parsedOrder >= 1 && parsedOrder <= 15
              ? parsedOrder
              : fallbackNextOrder;
          fallbackNextOrder = (battingOrder % 9) + 1;

          const batterName =
            linkedBatter?.name ||
            parsedBatterName ||
            battersByOrder.get(battingOrder)?.name ||
            "";

          if (!battersByOrder.has(battingOrder)) {
            battersByOrder.set(battingOrder, {
              battingOrder,
              name: batterName,
              uniformNumber: linkedBatter?.uniformNumber || "",
              position: normalizePositionCode(
                linkedBatter?.primaryPosition || ""
              ),
              playerId: linkedBatter?.id || dbAb.batterId || null,
              substitutions: [],
            });
          }

          const resultCode = inferCanonicalResultCode(
            dbAb.result || "",
            parsedLabel || parsedDir || dbAb.result || ""
          );
          const harmonized = harmonizeOcrFieldingAndLabel(
            resultCode,
            parsedDir,
            parsedLabel
          );

          if (parsedPitches.length === 0 && dbPitchList.length > 0) {
            const isHitCode =
              resultCode === "single" ||
              resultCode === "double" ||
              resultCode === "triple" ||
              resultCode === "home_run";
            const isNonInPlayCode =
              resultCode === "walk" ||
              resultCode === "intentional_walk" ||
              resultCode === "hit_by_pitch" ||
              resultCode === "strikeout" ||
              resultCode === "dropped_third_strike" ||
              resultCode === "dropped_third_strike_out";

            parsedPitches = dbPitchList.map((pr, idx) => {
              const isLast = idx === dbPitchList.length - 1;
              const raw = pr.result as CanonicalPitchResult;
              if (isLast && resultCode === "hit_by_pitch" && raw === "ball") {
                return "hbp";
              }
              if (isLast && isHitCode && (raw === "hit" || raw === "strike")) {
                return "hit";
              }
              if (isLast && !isNonInPlayCode && !isHitCode && raw === "strike") {
                return "in_play";
              }
              return raw;
            });
          }

          const mappedAdvances: ScorebookV2Advance[] = dbAdvList.map((adv) => {
            const from: ScorebookV2Advance["from"] =
              adv.fromBase === 1
                ? "1B"
                : adv.fromBase === 2
                ? "2B"
                : adv.fromBase === 3
                ? "3B"
                : "BAT";
            const to: ScorebookV2Advance["to"] =
              adv.toBase === 1
                ? "1B"
                : adv.toBase === 2
                ? "2B"
                : adv.toBase === 3
                ? "3B"
                : "HP";
            const rPlayer = adv.runnerId
              ? rosterById.get(adv.runnerId)
              : undefined;
            const resolvedRunnerName =
              rPlayer?.name ||
              runnerNameByFromBase.get(from) ||
              (from === "BAT" ? batterName : "");

            return {
              id: adv.id || crypto.randomUUID(),
              runnerName: resolvedRunnerName,
              from,
              to,
              method: normalizeAdvanceMethod(adv.reason),
              isOut: Boolean(adv.isOut),
              pitchNumber: adv.pitchId
                ? pitchNumberById.get(adv.pitchId)
                : undefined,
            };
          });

          const scoredAdvCount = mappedAdvances.filter(
            (a) => a.to === "HP" && !a.isOut
          ).length;
          const runsInPlay = Math.max(
            scoredAdvCount,
            resultCode === "home_run" && scoredAdvCount === 0 ? 1 : 0
          );
          const defaultOuts =
            resultCode === "triple_play"
              ? 3
              : resultCode === "double_play"
              ? 2
              : resultCode === "groundout" ||
                resultCode === "flyout" ||
                resultCode === "infield_fly" ||
                resultCode === "strikeout" ||
                resultCode === "dropped_third_strike_out" ||
                resultCode === "sac_bunt" ||
                resultCode === "sac_fly" ||
                resultCode === "interference_out"
              ? 1
              : 0;
          const outsInPlay =
            parsedOuts !== undefined ? parsedOuts : defaultOuts;
          runningOuts = Math.min(3, runningOuts + Math.max(0, outsInPlay));

          const lapKey = `${dbAb.inning}-${battingOrder}`;
          const nextColIdx = (orderLapByInning.get(lapKey) || 0) + 1;
          orderLapByInning.set(lapKey, nextColIdx);

          const cnt = computeCountFromPitches(parsedPitches);

          rebuiltAtBats.push({
            id: dbAb.id,
            inning: dbAb.inning,
            isTop,
            columnIndex: nextColIdx,
            battingOrder,
            batterName,
            batterPlayerId: linkedBatter?.id || dbAb.batterId || null,
            pitcherName: linkedPitcher?.name || (isMyTeamBatting ? "相手投手" : ""),
            pitcherPlayerId: linkedPitcher?.id || dbAb.pitcherId || null,
            resultCode,
            resultLabel: harmonized.resultLabel,
            battedDirection: harmonized.battedDirection,
            rbi: parsedRbi !== undefined ? parsedRbi : runsInPlay,
            outsInPlay,
            endingOuts: runningOuts,
            runsInPlay,
            balls: cnt.balls,
            strikes: cnt.strikes,
            pitches: parsedPitches,
            advances: mappedAdvances,
            confidence: "high",
          });
        }

        // 打順1〜9番の空きスロット補完
        const maxOrd = Math.max(9, ...Array.from(battersByOrder.keys()));
        const battersList: ScorebookBatterSlot[] = [];
        for (let ord = 1; ord <= maxOrd; ord++) {
          battersList.push(
            battersByOrder.get(ord) || {
              battingOrder: ord,
              name: "",
              uniformNumber: "",
              position: "",
              playerId: null,
              substitutions: [],
            }
          );
        }

        // 登板投手リレー復元
        const pitchersList: ScorebookPitcherStint[] = [];
        for (const ab of rebuiltAtBats) {
          const pKey = ab.pitcherPlayerId || ab.pitcherName || "相手投手";
          const lastStint = pitchersList[pitchersList.length - 1];
          const lastKey = lastStint
            ? lastStint.playerId || lastStint.name || "相手投手"
            : "";
          if (!lastStint || lastKey !== pKey) {
            const rp = ab.pitcherPlayerId
              ? rosterById.get(ab.pitcherPlayerId)
              : undefined;
            pitchersList.push({
              id: crypto.randomUUID(),
              order: pitchersList.length + 1,
              name: rp?.name || ab.pitcherName || "相手投手",
              uniformNumber: rp?.uniformNumber || "",
              playerId: ab.pitcherPlayerId,
              fromInning: ab.inning,
              toInning: ab.inning,
            });
          } else {
            lastStint.toInning = Math.max(lastStint.toInning, ab.inning);
          }
        }
        if (pitchersList.length === 0) {
          pitchersList.push({
            id: crypto.randomUUID(),
            order: 1,
            name: isMyTeamBatting ? "相手投手" : "",
            uniformNumber: "",
            playerId: null,
            fromInning: 1,
            toInning: match.innings || 7,
          });
        }

        // イニングメタ復元
        const scoreArr = safeParseNumberArray(
          isMyTeamBatting ? match.myInningScores : match.opponentInningScores
        );
        const maxInn = Math.max(
          match.innings || 7,
          scoreArr.length,
          ...rebuiltAtBats.map((a) => a.inning)
        );
        const inningsMeta: ScorebookInningMeta[] = [];
        for (let inn = 1; inn <= maxInn; inn++) {
          const innAbs = rebuiltAtBats.filter((a) => a.inning === inn);
          if (inn > scoreArr.length && innAbs.length === 0) continue;
          const runs =
            innAbs.length > 0
              ? innAbs.reduce((s, a) => s + a.runsInPlay, 0)
              : scoreArr[inn - 1] ?? 0;
          const hits = innAbs.filter(
            (a) =>
              a.resultCode === "single" ||
              a.resultCode === "double" ||
              a.resultCode === "triple" ||
              a.resultCode === "home_run"
          ).length;
          const colCount = Math.max(
            1,
            ...innAbs.map((a) => a.columnIndex || 1)
          );
          inningsMeta.push({
            inning: inn,
            runs,
            hits,
            columnCount: colCount,
          });
        }

        const totalRuns = inningsMeta.reduce((s, m) => s + m.runs, 0);
        const totalHits = inningsMeta.reduce((s, m) => s + m.hits, 0);
        const totalErrors = isMyTeamBatting
          ? match.opponentErrors ?? 0
          : match.myErrors ?? 0;

        return {
          structure: {
            isTop,
            isMyTeamBatting,
            batters: battersList,
            pitchers: pitchersList,
            innings: inningsMeta,
            totalRuns,
            totalHits,
            totalErrors,
          },
          atBats: rebuiltAtBats,
        };
      };

      if (needReconstructTop) {
        const recTop = reconstructSide(true, topDbAbs);
        topStructure = recTop.structure;
        topAtBats = recTop.atBats;
      }
      if (needReconstructBottom) {
        const recBot = reconstructSide(false, bottomDbAbs);
        bottomStructure = recBot.structure;
        bottomAtBats = recBot.atBats;
      }
    }

    const resolvedScope: ImportScopeMode =
      topAtBats.length > 0 && bottomAtBats.length > 0
        ? "both"
        : topAtBats.length > 0
        ? "top_only"
        : "bottom_only";

    return c.json({
      success: true,
      matchId: match.id,
      importScope: resolvedScope,
      topStructure,
      bottomStructure,
      topAtBats,
      bottomAtBats,
      topImageUrl: topAtBats.length > 0 ? snap?.topImageUrl ?? null : null,
      bottomImageUrl:
        bottomAtBats.length > 0 ? snap?.bottomImageUrl ?? null : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      { success: false, error: `保存済みデータの読み込みに失敗しました: ${msg}` },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部ヘルパー関数群
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GeminiCallOptions {
  maxBudgetMs?: number;
  skipModels?: string[];
  cooledModelsOut?: string[];
}

async function callGeminiStructuredJson<T>(
  apiKey: string,
  prompt: string,
  imageParts: GeminiContentPart[],
  mode: GeminiCallMode = "structure",
  validateResult?: (parsed: T) => string | null,
  options?: GeminiCallOptions
): Promise<T> {
  const attemptErrors: string[] = [];
  let quota429Count = 0;
  let demand503Count = 0;
  let timeoutCount = 0;
  const overallStart = Date.now();
  // Cloudflare Workers / モバイルブラウザの100秒プロキシタイムアウトより十分手前で確実にJSON応答を完結させる
  const MAX_TOTAL_BUDGET_MS =
    options?.maxBudgetMs ?? (mode === "chunk" ? 54_000 : 72_000);
  const rawConfigs = getGeminiModelConfigs(mode);
  const clientSkippedSet = new Set(options?.skipModels || []);

  const recordCooledOut = (modelName: string) => {
    if (
      options?.cooledModelsOut &&
      !options.cooledModelsOut.includes(modelName)
    ) {
      options.cooledModelsOut.push(modelName);
    }
  };

  const nowTs = Date.now();
  const readyConfigs: GeminiModelAttemptConfig[] = [];
  const coolingConfigs: Array<{ cfg: GeminiModelAttemptConfig; until: number }> =
    [];

  for (const cfg of rawConfigs) {
    const cd = MODEL_COOLDOWN_UNTIL.get(cfg.model);
    if (cd && cd.until > nowTs) {
      recordCooledOut(cfg.model);
      if (cd.status !== 404) {
        coolingConfigs.push({ cfg, until: cd.until });
      }
      continue;
    }
    if (cd) {
      MODEL_COOLDOWN_UNTIL.delete(cfg.model);
    }
    if (clientSkippedSet.has(cfg.model)) {
      coolingConfigs.push({ cfg, until: nowTs + 30_000 });
      continue;
    }
    readyConfigs.push(cfg);
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
              return !cd || cd.status === 503;
            })
            .slice(0, 1)
            .map((x) => ({ ...x.cfg, backoffBeforeMs: 1_200 })),
        ]
      : coolingConfigs
          .slice(0, 2)
          .map((x, idx) => ({
            ...x.cfg,
            backoffBeforeMs: idx === 0 ? 1_000 : 1_800,
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
            // thinkingLevel 非対応モデル（budget方式モデル）には適切な thinkingBudget で高速・高精度推論を維持！
            fallbackGenConfig.thinkingConfig = {
              thinkingBudget: mode === "chunk" ? 1536 : 2560,
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
          recordCooledOut(cfg.model);
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
          recordCooledOut(cfg.model);
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
          recordCooledOut(cfg.model);
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

  if (teamId) {
    const cached = LEGEND_PART_CACHE.get(teamId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.part;
    }
    if (cached) {
      LEGEND_PART_CACHE.delete(teamId);
    }
  }

  const cacheAndReturn = (
    part: GeminiInlineDataPart | null
  ): GeminiInlineDataPart | null => {
    if (teamId) {
      if (LEGEND_PART_CACHE.size >= 24) {
        const oldestKey = LEGEND_PART_CACHE.keys().next().value;
        if (oldestKey) LEGEND_PART_CACHE.delete(oldestKey);
      }
      LEGEND_PART_CACHE.set(teamId, {
        expiresAt: Date.now() + 5 * 60_000,
        part,
      });
    }
    return part;
  };

  try {
    const team = await db
      .select({ scorebookLegendUrl: teams.scorebookLegendUrl })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const legendUrl = team?.scorebookLegendUrl;
    if (!legendUrl) return cacheAndReturn(null);

    if (legendUrl.startsWith("data:")) {
      const [header, b64] = legendUrl.split(",");
      const mimeMatch = header?.match(/data:(.*?);/);
      if (b64 && b64.length <= 3_200_000) {
        return cacheAndReturn({
          inlineData: {
            mimeType: mimeMatch ? mimeMatch[1] : "image/png",
            data: b64.trim(),
          },
        });
      }
      return cacheAndReturn(null);
    }

    const marker = "/api/images/";
    const idx = legendUrl.indexOf(marker);
    if (idx !== -1 && c.env.BUCKET) {
      const r2Key = legendUrl.slice(idx + marker.length);
      const obj = await c.env.BUCKET.get(r2Key);
      if (obj) {
        const buf = await obj.arrayBuffer();
        if (buf.byteLength <= 2_500_000) {
          return cacheAndReturn({
            inlineData: {
              mimeType: obj.httpMetadata?.contentType || "image/png",
              data: arrayBufferToBase64(buf),
            },
          });
        }
        return cacheAndReturn(null);
      }
    }

    const targetUrl = legendUrl.startsWith("/")
      ? `${new URL(c.req.url).origin}${legendUrl}`
      : legendUrl;
    const res = await fetch(targetUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength <= 2_500_000) {
        return cacheAndReturn({
          inlineData: {
            mimeType: res.headers.get("content-type") || "image/png",
            data: arrayBufferToBase64(buf),
          },
        });
      }
    }
  } catch (err) {
    console.warn("[LiffScorebookV2] Legend load skipped:", err);
  }

  return cacheAndReturn(null);
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
  const lineupCycle = Math.max(9, structure.batters.length);

  const isSafeReachResult = (rc: CanonicalAtBatResult): boolean =>
    rc === "single" ||
    rc === "double" ||
    rc === "triple" ||
    rc === "home_run" ||
    rc === "walk" ||
    rc === "intentional_walk" ||
    rc === "hit_by_pitch" ||
    rc === "interference" ||
    rc === "dropped_third_strike" ||
    rc === "error";

  const hasConcretePlayEvidence = (ab: ScorebookV2AtBat): boolean => {
    const prePlayPitches = ab.pitches.filter(
      (p) => p !== "in_play" && p !== "hit"
    ).length;
    const hasFielding = /[1-9]/.test(ab.battedDirection || "");
    const hasRunnerAdvance = ab.advances.some((a) => a.from !== "BAT");
    if (ab.resultCode === "other" && !hasRunnerAdvance && prePlayPitches === 0) {
      return false;
    }
    return (
      prePlayPitches > 0 ||
      hasFielding ||
      hasRunnerAdvance ||
      ab.runsInPlay > 0 ||
      ab.resultCode === "walk" ||
      ab.resultCode === "intentional_walk" ||
      ab.resultCode === "hit_by_pitch" ||
      ab.resultCode === "strikeout" ||
      ab.resultCode === "fc"
    );
  };

  for (const inn of sortedTargets) {
    const innList = items
      .filter((a) => a.inning === inn)
      .map((a) => ({ ...a }));
    if (innList.length === 0) continue;

    const meta = structure.innings.find((m) => m.inning === inn);
    const confirmedRuns = meta?.runs ?? 0;

    // 2アウト後に最終打者が野選・封殺(fc, 6-4等)で outsInPlay=0 になっていた場合は先行走者封殺の1アウトを補完
    const preLastOuts = innList
      .slice(0, -1)
      .reduce((s, x) => s + Math.max(0, x.outsInPlay), 0);
    const tailAb = innList[innList.length - 1];
    if (
      preLastOuts === 2 &&
      tailAb &&
      tailAb.resultCode === "fc" &&
      tailAb.outsInPlay === 0
    ) {
      tailAb.outsInPlay = 1;
      tailAb.endingOuts = 3;
    }

    let cumOuts = 0;
    let threeOutIndex = -1;

    for (let idx = 0; idx < innList.length; idx++) {
      cumOuts += Math.max(0, innList[idx].outsInPlay);
      if (threeOutIndex === -1 && cumOuts >= 3) {
        threeOutIndex = idx;
      }
    }

    if (threeOutIndex !== -1 && threeOutIndex < innList.length - 1) {
      const head = innList.slice(0, threeOutIndex + 1);
      const thirdOutAb = innList[threeOutIndex];
      const runsAtThreeOuts = head.reduce(
        (sum, x) => sum + Math.max(0, x.runsInPlay),
        0
      );
      const outsAtThreeOuts = head.reduce(
        (sum, x) => sum + Math.max(0, x.outsInPlay),
        0
      );
      const trailing = innList.slice(threeOutIndex + 1);

      // 先行打者に1人も走者出塁が無い（完全な三者凡退など）場合は、4人目以降に封殺や盗塁死が起きる余地が物理的に0なので切り線ノイズ確定
      const anyBaseRunnerExistedInHead = head.some(
        (x) =>
          isSafeReachResult(x.resultCode) ||
          x.resultCode === "fc" ||
          x.outsInPlay === 0 ||
          x.advances.some((a) => !a.isOut && a.to !== "HP")
      );

      let prevBo = thirdOutAb.battingOrder;
      let trailingIsStrictlySequential = true;
      for (const t of trailing) {
        const expectedBo = (prevBo % lineupCycle) + 1;
        if (t.battingOrder !== expectedBo) {
          trailingIsStrictlySequential = false;
          break;
        }
        prevBo = t.battingOrder;
      }

      const trailingArePhantom = trailing.every(
        (t) =>
          !hasConcretePlayEvidence(t) ||
          (t.resultCode === "other" &&
            t.runsInPlay === 0 &&
            !t.advances.some((a) => a.isOut && a.from !== "BAT"))
      );

      // 走者が居た状況で直後の次打順（例: 4番にⅢが書かれ5番が6-4封殺やFC等）に明確な実プレー根拠がある場合は絶対に切り捨てず、重複アウトの方を控除して5番を守る！
      const shouldPreserveRunnerOutContinuation =
        anyBaseRunnerExistedInHead &&
        trailing.length === 1 &&
        trailingIsStrictlySequential &&
        hasConcretePlayEvidence(trailing[0]);

      const thirdOutHasExplicitThreeMark =
        thirdOutAb.endingOuts === 3 && thirdOutAb.outsInPlay >= 1;
      const scoreAlreadyMatchesAtThreeOuts =
        outsAtThreeOuts === 3 && runsAtThreeOuts === confirmedRuns;

      // 打者一巡（9人以上全員に実プレーがある列）や、確定得点に対して未計上の実安打・得点が後続にある場合は切り線ノイズではないため絶対に切り捨てない
      const hasRealBatAroundOrScoringInTrailing =
        !trailingArePhantom &&
        trailingIsStrictlySequential &&
        (innList.length >= lineupCycle ||
          (confirmedRuns > runsAtThreeOuts &&
            trailing.some(
              (t) => t.runsInPlay > 0 || isSafeReachResult(t.resultCode)
            )));

      if (
        !shouldPreserveRunnerOutContinuation &&
        !hasRealBatAroundOrScoringInTrailing &&
        (!anyBaseRunnerExistedInHead ||
          !trailingIsStrictlySequential ||
          trailingArePhantom ||
          (thirdOutHasExplicitThreeMark &&
            trailingArePhantom &&
            scoreAlreadyMatchesAtThreeOuts))
      ) {
        output.push(...head);
        continue;
      }

      // 5番を保持した場合、先行走者マスとの二重アウト計上（合計4アウト等）を3アウトへリバランス
      let totalInnOuts = innList.reduce(
        (s, x) => s + Math.max(0, x.outsInPlay),
        0
      );
      if (totalInnOuts > 3) {
        for (let i = head.length - 1; i >= 0 && totalInnOuts > 3; i--) {
          const cand = innList[i];
          if (
            (isSafeReachResult(cand.resultCode) || cand.resultCode === "fc") &&
            cand.outsInPlay > 0
          ) {
            const deduct = Math.min(cand.outsInPlay, totalInnOuts - 3);
            cand.outsInPlay -= deduct;
            totalInnOuts -= deduct;
          }
        }
        let running = 0;
        for (const item of innList) {
          running = Math.min(3, running + Math.max(0, item.outsInPlay));
          item.endingOuts = running;
        }
      }
    }

    output.push(...innList);
  }

  return output;
}

function extractPitchesFromObsLeftZone(obs: string): string[] {
  const m = obs.match(
    /左(?:BSO|欄|枠)?\s*[:：]\s*(.*?)(?=\s*\/\s*(?:中|中央|本一|右下|打球)|$)/i
  );
  if (!m) return [];
  const zone = m[1]
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .trim();
  if (
    !zone ||
    /^(?:無|なし|空|空欄|白紙|未記入|初球|none|empty|-)$/i.test(zone)
  ) {
    return [];
  }

  // 1. 成美堂式・球数番号記法（例: "B1,S2,B3,F4" や "B:1,3 S:2 F:4" や "1B,2S,3F"）の時系列復元
  const numberedEntries: Array<{ seq: number; code: string }> = [];
  const groupRegex =
    /\b(BF|B|S|W|F)\s*[:：]?\s*([1-9](?:\s*[,、・]\s*[1-9])*)/gi;
  let gm: RegExpExecArray | null = null;
  while ((gm = groupRegex.exec(zone)) !== null) {
    const rawKind = gm[1].toUpperCase();
    const nums = gm[2]
      .split(/[,、・\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 15);
    for (const seq of nums) {
      numberedEntries.push({ seq, code: rawKind });
    }
  }
  if (numberedEntries.length === 0) {
    const revRegex = /\b([1-9])\s*[:：.]?\s*(BF|B|S|W|F)\b/gi;
    let rm: RegExpExecArray | null = null;
    while ((rm = revRegex.exec(zone)) !== null) {
      numberedEntries.push({
        seq: Number(rm[1]),
        code: rm[2].toUpperCase(),
      });
    }
  }
  if (numberedEntries.length >= 2) {
    return numberedEntries
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.code);
  }

  // 2. カンマ・矢印・空白区切りトークン ＆ 縦積み記号1文字ずつのハイブリッド抽出
  const parts = zone.split(/[,、→⇒➡\s]+/).filter(Boolean);
  const tokens: string[] = [];

  for (const part of parts) {
    const up = part.toUpperCase();
    if (up === "B" || part === "ボール") {
      tokens.push("B");
      continue;
    }
    if (up === "S" || part === "見逃し" || part === "ストライク") {
      tokens.push("S");
      continue;
    }
    if (up === "W" || up === "SW" || part === "空振り") {
      tokens.push("W");
      continue;
    }
    if (up === "F" || part === "ファウル" || part === "ファール") {
      tokens.push("F");
      continue;
    }
    if (up === "BF" || part === "バントファウル") {
      tokens.push("BF");
      continue;
    }
    if (up === "P1" || part === "1牽" || part === "一牽") {
      tokens.push("P1");
      continue;
    }
    if (up === "P2" || part === "2牽" || part === "二牽") {
      tokens.push("P2");
      continue;
    }
    if (up === "P3" || part === "3牽" || part === "三牽") {
      tokens.push("P3");
      continue;
    }
    if (up === "BK" || part === "ボーク") {
      tokens.push("BK");
      continue;
    }
    if (up === "B1" || up === "1B") {
      tokens.push("B");
      continue;
    }
    if (up === "S1" || up === "1S") {
      tokens.push("S");
      continue;
    }
    if (up === "F1" || up === "1F") {
      tokens.push("F");
      continue;
    }

    for (const ch of Array.from(part)) {
      if (ch === "○" || ch === "◯" || ch === "〇") {
        tokens.push("S");
      } else if (ch === "●" || ch === "／" || ch === "＼" || ch === "×") {
        tokens.push("W");
      } else if (
        ch === "ー" ||
        ch === "－" ||
        ch === "―" ||
        ch === "‐" ||
        ch === "-" ||
        ch === "・" ||
        ch === "･" ||
        ch === "•" ||
        ch === "∙"
      ) {
        tokens.push("B");
      } else if (
        ch === "△" ||
        ch === "▽" ||
        ch === "◁" ||
        ch === "▷" ||
        ch === "レ" ||
        ch === "✓" ||
        ch === "✔" ||
        ch === "V"
      ) {
        tokens.push("F");
      } else if (ch === "▲" || ch === "▼") {
        tokens.push("BF");
      }
    }
  }
  return tokens;
}

function countPrePlayBallsAndStrikes(tokens: readonly string[]): {
  balls: number;
  pureStrikes: number;
  totalStrikes: number;
} {
  let balls = 0;
  let pureStrikes = 0;
  let totalStrikes = 0;
  for (const raw of tokens) {
    const s = (raw || "").trim().toUpperCase();
    if (s === "B" || s === "BALL") {
      balls += 1;
    } else if (
      s === "S" ||
      s === "W" ||
      s === "BS" ||
      s === "STRIKE" ||
      s === "SWINGING_STRIKE" ||
      s === "BUNT_SWINGING"
    ) {
      pureStrikes += 1;
      totalStrikes = Math.min(3, totalStrikes + 1);
    } else if (s === "BF" || s === "BUNT_FOUL") {
      totalStrikes = Math.min(3, totalStrikes + 1);
    } else if (s === "F" || s === "FOUL") {
      if (totalStrikes < 2) totalStrikes += 1;
    }
  }
  return { balls, pureStrikes, totalStrikes };
}

/**
 * Stage 2 の視覚観察フィールド（obs / b1）と構造化フィールド（rc / dir / eo / o / p / a）の論理整合を検証する。
 * 手書きの「くっつき文字・にじみ」（例: 『︵＋4』が接触して『B』＝四球と誤読されるケース、
 * 『obs』で読めている左BSO記号が『p』で欠落・4ボール化されるケース、本一破線の打者アウトが単打と誤読されるケース等）を
 * 野球規則とイニング内累積アウト数（runningInningOuts）に沿って精密に自己補正する。
 */
function reconcileRawAtBatEvidence(
  ab: RawGeminiAtBat,
  activeBases: Record<"1B" | "2B" | "3B", boolean>,
  runningInningOuts: number
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

  // 1. 中央ゾーンのローマ数字（Ⅰ・Ⅱ・Ⅲ、にじみ字形エ・日・目含む）および丸数字（①・②・③）から endingOuts を補完
  const centerMatch = obs ? obs.match(/(?:中|中央)\s*[:：]\s*([^/]+)/) : null;
  const centerText = centerMatch ? centerMatch[1].trim() : "";
  if (endingOuts === 0 && centerText) {
    if (/[Ⅲ③]|III/.test(centerText)) {
      endingOuts = 3;
    } else if (/[Ⅱ②]|II/.test(centerText)) {
      endingOuts = 2;
    } else if (/[Ⅰ①エ]|(?<![A-Za-z])I(?![A-Za-z])/.test(centerText)) {
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

  // 右下ゾーン観察テキストの抽出（dir が未入力、または守備数字1〜9を含まない記号断片のみのときに補完）
  const rbMatch = obs.match(/(?:右下|打球)\s*[:：]\s*([^/]+)/);
  const rbText = rbMatch ? rbMatch[1].trim() : "";
  if (
    (!rawDir || !/[1-9]/.test(rawDir)) &&
    rbText &&
    rbText !== "無" &&
    rbText !== "なし" &&
    !/^(?:B|BB|四球|D|死球|K|SO|三振)$/i.test(rbText)
  ) {
    const cleanedRb = rbText.replace(/\(.*?\)|（.*?）/g, "").trim();
    if (cleanedRb && (!rawDir || /[1-9]/.test(cleanedRb))) {
      rawDir = cleanedRb;
    }
  }

  const obsPitches = obs ? extractPitchesFromObsLeftZone(obs) : [];
  const obsCount = countPrePlayBallsAndStrikes(obsPitches);

  const prelimCode = inferCanonicalResultCode(
    rawResultCode,
    rawResultLabel || rawDir
  );

  const hasAnyActiveRunner =
    activeBases["1B"] || activeBases["2B"] || activeBases["3B"];
  const hasRunnerOutAdvance = rawAdvances.some((adv) => {
    const f = normalizeFromBase(adv.f ?? adv.from);
    const isOut = Boolean(adv.io ?? adv.isOut);
    return isOut && f !== "BAT";
  });

  const combinedHint = `${rawDir || ""} ${rawResultLabel || ""} ${rbText}`.trim();
  const hasExplicitErrorNotation =
    /\bE[1-9]|[1-9]E(?:\b|\s*[-－ー―‐=＝→⇒])|[-－ー―‐=＝→⇒]\s*(?:E[1-9]|[1-9]E)\b|失策|悪送球|エラー|[投捕一二三遊左中右]失/i.test(
      combinedHint
    );
  const hasExplicitOutPlaySymbol =
    !hasExplicitErrorNotation &&
    (/[1-9]\s*[-－ー=＝→]\s*[1-9]/.test(combinedHint) ||
      /[⌒︵︶∩^傘]\s*[1-9]/.test(combinedHint) ||
      /^[1-9][FL]$/i.test(rawDir || "") ||
      /\b(?:K|SO)\b|三振|飛|フライ|ライナー|ゴロ/i.test(combinedHint));

  const batterClearlyOutByDiamond =
    effectiveB1 === false &&
    !hasRunnerOutAdvance &&
    (endingOuts > runningInningOuts ||
      outsInPlay >= 1 ||
      (!hasAnyActiveRunner && endingOuts >= 1));

  // 3-A. 『︵＋4』等のくっつき字形が『B（四球）』や死球と誤読されたケースの自己補正:
  // 本塁→1塁が破線(b1: false)で明確なアウト打球記号があるか、または本一破線＋中央アウト増加が確認できる場合は絶対に四死球ではない
  const isWalkMisreadAsOut =
    (prelimCode === "walk" || prelimCode === "hit_by_pitch") &&
    effectiveB1 === false &&
    (hasExplicitOutPlaySymbol ||
      (prelimCode === "walk" && batterClearlyOutByDiamond));

  if (isWalkMisreadAsOut) {
    if (/[1-9]\s*[-－ー=＝→]\s*[1-9]\s*[-－ー=＝→]\s*[1-9]/.test(combinedHint)) {
      rawResultCode = "double_play";
      outsInPlay = Math.max(2, outsInPlay);
    } else if (/[1-9]\s*[-－ー=＝→]\s*[1-9]/.test(combinedHint)) {
      rawResultCode = "groundout";
      outsInPlay = Math.max(1, outsInPlay);
    } else if (
      /\b(?:K|SO)\b|三振/i.test(combinedHint) ||
      obsCount.totalStrikes >= 3
    ) {
      rawResultCode = "strikeout";
      outsInPlay = Math.max(1, outsInPlay);
    } else {
      rawResultCode = "flyout";
      outsInPlay = Math.max(1, outsInPlay);
    }

    if (rawResultLabel && /四球|死球|BB/i.test(rawResultLabel)) {
      rawResultLabel = "";
    }
    if (rawDir && /^(?:B|BB|四球|D|死球)$/i.test(rawDir)) {
      rawDir = "";
    }

    rawAdvances = rawAdvances.filter((adv) => {
      const f = normalizeFromBase(adv.f ?? adv.from);
      const isOut = Boolean(adv.io ?? adv.isOut);
      return !(f === "BAT" && !isOut);
    });

    // 四球と誤認した際にモデルが4ボールを捏造・不整合化している場合が多いため、obs の左BSO観察記号を最優先採用
    if (obsPitches.length > 0) {
      rawPitches =
        rawResultCode === "strikeout" ? obsPitches : [...obsPitches, "X"];
    } else if (
      rawResultCode !== "strikeout" &&
      countPrePlayBallsAndStrikes(rawPitches).balls >= 4
    ) {
      rawPitches = ["X"];
    }
  } else {
    const normDir = (rawDir || "")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0)
      )
      .replace(/(E?[1-9]E?)\s*[－ー―‐=＝→⇒]\s*(E?[1-9]E?)/gi, "$1-$2")
      .trim();

    const rawRuns = toFiniteInt(ab.ru ?? ab.runsInPlay, 0) || 0;

    // 3-A2. 『4E-3』『6E-3』『4E』『6-3E』等の失策・悪送球記号があるのにゴロ等と誤出力されたケースの補正
    if (
      prelimCode !== "error" &&
      prelimCode !== "dropped_third_strike" &&
      (/^(?:E[1-9](?:-[1-9])?|[1-9]E(?:-[1-9])?|[1-9]-(?:E[1-9]|[1-9]E))$/i.test(
        normDir
      ) ||
        hasExplicitErrorNotation) &&
      effectiveB1 !== false
    ) {
      rawResultCode = "error";
      if (!hasRunnerOutAdvance) {
        outsInPlay = 0;
      }
      if (rawResultLabel && /ゴロ|飛|フライ|ライナー/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
    } else if (
      // 3-B. 本塁→1塁が破線(b1: false)かつ打者アウトが増えているのに単打("single")と誤出力されたケースの補正
      prelimCode === "single" &&
      batterClearlyOutByDiamond &&
      rawRuns === 0 &&
      !hasExplicitErrorNotation &&
      !/内野安打|強襲|失|エラー|野選|FC/i.test(combinedHint)
    ) {
      if (/^[1-6]-[1-6]$/.test(normDir)) {
        rawResultCode = "groundout";
      } else {
        rawResultCode = "flyout";
      }
      outsInPlay = Math.max(1, outsInPlay);
      if (rawResultLabel && /安打|ヒット/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
      rawAdvances = rawAdvances.filter((adv) => {
        const f = normalizeFromBase(adv.f ?? adv.from);
        const isOut = Boolean(adv.io ?? adv.isOut);
        return !(f === "BAT" && !isOut);
      });
    } else if (
      // 3-C. 本塁→1塁が実線(b1: true)かつ中央アウト無し(中:無, o:0)・傘マーク無しの外野打球(7/8/9/7-8/8-9)がフライと誤出力されたケースの補正
      prelimCode === "flyout" &&
      effectiveB1 === true &&
      outsInPlay === 0 &&
      endingOuts <= runningInningOuts &&
      /^(?:無|なし|空)$/.test(centerText) &&
      !/[⌒︵︶∩^傘]/.test(combinedHint) &&
      /^(?:7|8|9|7-8|8-9)$/.test(normDir) &&
      !/犠|邪|ファウル|直|ライナー|失|エラー|野選|FC/i.test(combinedHint)
    ) {
      rawResultCode = "single";
      if (rawResultLabel && /飛|フライ/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
    } else if (
      // 3-D. ゴロ vs フライの野球物理整合（守備記号と結果コードの食い違いを非破壊補正）
      prelimCode === "flyout" &&
      /^[1-6]-[1-6]$/.test(normDir) &&
      !/犠|直|ライナー|併殺/.test(rawResultLabel || "")
    ) {
      rawResultCode = "groundout";
      if (rawResultLabel && /飛|フライ/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
    } else if (
      prelimCode === "groundout" &&
      (/^[⌒︵︶∩^傘]\s*[1-9]/.test(normDir) ||
        /^[789][FL]?$/i.test(normDir) ||
        /^[1-9][FL]$/i.test(normDir)) &&
      !/ゴロ|封/.test(rawResultLabel || "")
    ) {
      rawResultCode = "flyout";
      if (rawResultLabel && /ゴロ/.test(rawResultLabel)) {
        rawResultLabel = "";
      }
    }

    // 3-E. obs の左BSO観察記号と rawPitches の整合チェック:
    // ① rawPitches が空のとき
    // ② obs に手書き球（例: 左:○,ー,△）があるのに rawPitches が ["X"] / ["H"] だけに省略された、または一部球数が欠落したとき
    // ③ インプレー結果なのに rawPitches が4ボール以上や3ストライク等の不正カウントで obsPitches が正常カウントのとき
    if (obsPitches.length > 0) {
      const preTokens = rawPitches.filter((tok) => {
        const u = (tok || "").trim().toUpperCase();
        return (
          u !== "X" &&
          u !== "H" &&
          u !== "D" &&
          u !== "IN_PLAY" &&
          u !== "HIT" &&
          u !== "HBP"
        );
      });
      const rawPreCount = countPrePlayBallsAndStrikes(preTokens);
      const effectiveCode = inferCanonicalResultCode(
        rawResultCode,
        rawResultLabel || rawDir
      );
      const isInPlayEffective =
        effectiveCode !== "walk" &&
        effectiveCode !== "intentional_walk" &&
        effectiveCode !== "hit_by_pitch" &&
        effectiveCode !== "strikeout" &&
        effectiveCode !== "dropped_third_strike_out" &&
        effectiveCode !== "dropped_third_strike";

      const obsLegalForInPlay =
        isInPlayEffective && obsCount.balls <= 3 && obsCount.pureStrikes <= 2;
      const obsLegalForStrikeout =
        (effectiveCode === "strikeout" ||
          effectiveCode === "dropped_third_strike" ||
          effectiveCode === "dropped_third_strike_out") &&
        obsCount.balls <= 3 &&
        obsCount.totalStrikes === 3;
      const obsLegalForWalk =
        effectiveCode === "walk" &&
        obsCount.balls === 4 &&
        obsCount.pureStrikes <= 2;

      if (
        rawPitches.length === 0 ||
        preTokens.length === 0 ||
        (obsPitches.length > preTokens.length &&
          (obsLegalForInPlay || obsLegalForStrikeout || obsLegalForWalk || effectiveCode === "hit_by_pitch")) ||
        (obsLegalForInPlay &&
          (rawPreCount.balls >= 4 || rawPreCount.pureStrikes >= 3))
      ) {
        const preservedMoundEvents = preTokens.filter((tok) =>
          /^(?:P1|P2|P3|BK|PICKOFF)/i.test((tok || "").trim())
        );
        const obsHasMound = obsPitches.some((tok) =>
          /^(?:P1|P2|P3|BK)$/i.test(tok)
        );
        rawPitches =
          preservedMoundEvents.length > 0 && !obsHasMound
            ? [...obsPitches, ...preservedMoundEvents]
            : obsPitches;
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

  // ペンのにじみで白抜き三角『△』（ファウル）の線が太くなり『▲』（バントファウル）と誤読されたケースの自己補正:
  // 公認野球規則上、2ストライク後のバントファウルはその球で即座にスリーバント失敗（三振 strikeout）となるため、
  // 三振以外の結果や打席途中の球で2ストライク後に bunt_foul が出現した場合は通常の foul に補正する
  {
    let strikeTrack = 0;
    for (let idx = 0; idx < mapped.length; idx++) {
      const p = mapped[idx];
      const isFinalPitch = idx === mapped.length - 1;
      if (
        p === "bunt_foul" &&
        strikeTrack >= 2 &&
        (!isFinalPitch || resultCode !== "strikeout")
      ) {
        mapped[idx] = "foul";
      }
      const cur = mapped[idx];
      if (
        cur === "strike" ||
        cur === "swinging_strike" ||
        cur === "bunt_swinging" ||
        cur === "bunt_foul"
      ) {
        strikeTrack = Math.min(3, strikeTrack + 1);
      } else if (cur === "foul" && strikeTrack < 2) {
        strikeTrack += 1;
      }
    }
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
function estimateRawAtBatOutsForOrdering(raw: RawGeminiAtBat): number {
  const rc = inferCanonicalResultCode(
    raw.rc ?? raw.resultCode,
    raw.rl ?? raw.resultLabel
  );
  if (rc === "triple_play") return 3;
  if (rc === "double_play") return 2;
  if (
    rc === "groundout" ||
    rc === "flyout" ||
    rc === "infield_fly" ||
    rc === "strikeout" ||
    rc === "dropped_third_strike_out" ||
    rc === "sac_bunt" ||
    rc === "sac_fly" ||
    rc === "interference_out"
  ) {
    return 1;
  }
  if (
    rc === "single" ||
    rc === "double" ||
    rc === "triple" ||
    rc === "home_run" ||
    rc === "walk" ||
    rc === "intentional_walk" ||
    rc === "hit_by_pitch" ||
    rc === "interference" ||
    rc === "dropped_third_strike" ||
    rc === "error"
  ) {
    return 0;
  }
  return Math.max(0, Math.min(2, toFiniteInt(raw.o ?? raw.outsInPlay, 0) || 0));
}

function extractRawOutOrdinalMark(raw: RawGeminiAtBat): 1 | 2 | 3 | null {
  const obs = (raw.obs || "").trim();
  if (/Ⅲ|③/.test(obs)) return 3;
  if (/Ⅱ|②/.test(obs)) return 2;
  if (/Ⅰ|①/.test(obs)) return 1;
  const eo = toFiniteInt(raw.eo ?? raw.endingOuts);
  if (eo === 1 || eo === 2 || eo === 3) return eo;
  return null;
}

function isRawRunnerOnlyEnd(raw: RawGeminiAtBat): boolean {
  const rc = inferCanonicalResultCode(
    raw.rc ?? raw.resultCode,
    raw.rl ?? raw.resultLabel
  );
  if (rc !== "other") return false;
  const rl = (raw.rl ?? raw.resultLabel ?? "").trim();
  const rawAdvs = raw.a || raw.advances || [];
  return (
    rawAdvs.some((adv) => Boolean(adv.io ?? adv.isOut)) ||
    /途中断|走塁死|盗塁死|牽制死|アピール/.test(rl)
  );
}

function orderAndAssignColumnsForChunk(
  rawItems: RawGeminiAtBat[],
  sortedTargets: number[],
  structure: ScorebookSheetStructure,
  initialExpectedLeadOff?: number,
  nextChunkLeadOffOrder?: number
): RawGeminiAtBat[] {
  const B = Math.max(9, structure.batters.length);
  const stepOrder = (bo: number): number => (bo % B) + 1;
  const prevOrder = (bo: number): number => ((bo - 2 + B) % B) + 1;

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

    let effectiveLeadOff = 1;

    if (!wrappedAround) {
      // 9番➔1番を跨がない通常イニングは打順の昇順がそのまま時系列順
      tagged.sort((a, b) =>
        a.bo !== b.bo ? a.bo - b.bo : a.origIdx - b.origIdx
      );
      effectiveLeadOff = tagged[0]?.bo ?? 1;
    } else {
      // 循環カウント段差（前の打順より登場回数が1回増える境界＝その回の真の先頭打者）を検出
      const stepUpCandidates: number[] = [];
      for (let bo = 1; bo <= B; bo++) {
        const prevBo = bo === 1 ? B : bo - 1;
        if (counts[prevBo] < counts[bo]) {
          stepUpCandidates.push(bo);
        }
      }

      if (inn === 1) {
        // 1回の先頭打者は野球規則上100%「1番」
        effectiveLeadOff = 1;
      } else if (minCount === maxCount && minCount >= 1) {
        // === 1イニング9人（または18人）全員が同数ずつ埋まっている場合 ===
        // 空欄マスの段差（stepUpCandidates）が存在しないため、
        // ①前イニングからの連続打順（次打順 or 走塁死終了時の同一打順）
        // ②次イニング先頭打順との連続性
        // ③3アウト完了位置 ＆ 中央ローマ数字（Ⅰ→Ⅱ→Ⅲ）の単調性
        // ④9番下端折り返し式のサブ列段差（c: 2 -> 1）
        // を統合採点して真の先頭打者を数学的に特定する
        let colStepCandidate: number | undefined;
        for (let bo = 2; bo <= B; bo++) {
          const prevFirst = byBo.get(bo - 1)?.[0];
          const curFirst = byBo.get(bo)?.[0];
          if (prevFirst && curFirst && prevFirst.rawCol > curFirst.rawCol) {
            colStepCandidate = bo;
            break;
          }
        }

        const firstRawBo = Math.max(
          1,
          Math.min(
            B,
            toFiniteInt(innItems[0].bo ?? innItems[0].battingOrder, 1) || 1
          )
        );
        const validNextChunkLeadOff =
          sortedTargets[sortedTargets.length - 1] === inn &&
          typeof nextChunkLeadOffOrder === "number" &&
          nextChunkLeadOffOrder >= 1 &&
          nextChunkLeadOffOrder <= B
            ? nextChunkLeadOffOrder
            : undefined;

        let bestBo = runningLeadOff ?? colStepCandidate ?? firstRawBo;
        let bestScore = -Infinity;

        for (let candS = 1; candS <= B; candS++) {
          let score = 0;

          const seq: Array<{ raw: RawGeminiAtBat; bo: number }> = [];
          for (let lap = 0; lap <= maxLap; lap++) {
            for (let offset = 0; offset < B; offset++) {
              const bo = ((candS - 1 + offset) % B) + 1;
              const entry = byBo.get(bo)?.[lap];
              if (entry) {
                seq.push({ raw: entry.raw, bo });
              }
            }
          }

          // ① 前イニングからの連続打順（次の番号 or 走塁死終了時の同一番号、および前イニング1人読取漏れ許容）
          if (runningLeadOff !== undefined) {
            if (candS === runningLeadOff) score += 95;
            else if (candS === prevOrder(runningLeadOff)) score += 38;
            else if (candS === stepOrder(runningLeadOff)) score += 28;
            else score -= 35;
          }

          // ② 次イニング先頭打順との連続性（9人攻撃なら次回先頭も原則 candS、走塁死終了なら prevOrder(candS)）
          if (validNextChunkLeadOff !== undefined && seq.length > 0) {
            const tailRaw = seq[seq.length - 1].raw;
            const tailBo = seq[seq.length - 1].bo; // === prevOrder(candS)
            if (isRawRunnerOnlyEnd(tailRaw)) {
              if (tailBo === validNextChunkLeadOff) score += 95;
              else if (candS === validNextChunkLeadOff) score += 40;
            } else {
              if (candS === validNextChunkLeadOff) score += 95;
              else if (tailBo === validNextChunkLeadOff) score += 42;
            }
          }

          // ③ 9番下端折り返し式のサブ列段差（c: 2 -> 1）
          if (colStepCandidate !== undefined && candS === colStepCandidate) {
            score += 80;
          }

          // ④ 3アウト完了位置 ＆ 中央アウト記号（Ⅰ→Ⅱ→Ⅲ）の順序整合
          let cumOuts = 0;
          let battersAfterThreeOuts = 0;
          const outOrdinals: number[] = [];
          for (let i = 0; i < seq.length; i++) {
            if (cumOuts >= 3) {
              battersAfterThreeOuts += 1;
            }
            const estO = estimateRawAtBatOutsForOrdering(seq[i].raw);
            cumOuts += estO;
            if (estO >= 1) {
              const mark = extractRawOutOrdinalMark(seq[i].raw);
              if (mark !== null) {
                outOrdinals.push(mark);
              }
            }
          }

          if (cumOuts >= 3 && seq.length > 0) {
            const tailRaw = seq[seq.length - 1].raw;
            const tailRc = inferCanonicalResultCode(
              tailRaw.rc ?? tailRaw.resultCode,
              tailRaw.rl ?? tailRaw.resultLabel
            );
            const tailMark = extractRawOutOrdinalMark(tailRaw);
            const tailEstO = estimateRawAtBatOutsForOrdering(tailRaw);

            if (battersAfterThreeOuts === 0) {
              score += 100;
              if (tailEstO >= 1 && tailMark === 3) {
                score += 50;
              }
            } else if (
              battersAfterThreeOuts === 1 &&
              (tailRc === "fc" || tailRc === "other" || tailEstO === 0)
            ) {
              score += 50;
              const prevTail = seq.length >= 2 ? seq[seq.length - 2].raw : null;
              if (prevTail && extractRawOutOrdinalMark(prevTail) === 3) {
                score += 35;
              }
            } else {
              score -= 45 * battersAfterThreeOuts;
            }
          }

          if (outOrdinals.length >= 2) {
            let nonDecreasing = true;
            let hasThreeBeforeOneOrTwo = false;
            let seenThree = false;
            for (let i = 0; i < outOrdinals.length; i++) {
              if (i > 0 && outOrdinals[i] < outOrdinals[i - 1]) {
                nonDecreasing = false;
              }
              if (outOrdinals[i] === 3) {
                seenThree = true;
              } else if (seenThree && outOrdinals[i] < 3) {
                hasThreeBeforeOneOrTwo = true;
              }
            }
            if (nonDecreasing) {
              score += 55;
            } else if (hasThreeBeforeOneOrTwo) {
              score -= 80;
            } else {
              score -= 35;
            }
          }

          // ⑤ イニング先頭打者（無死走者なし）として物理的に不自然な結果の減点
          if (seq.length > 0) {
            const leadRc = inferCanonicalResultCode(
              seq[0].raw.rc ?? seq[0].raw.resultCode,
              seq[0].raw.rl ?? seq[0].raw.resultLabel
            );
            if (
              leadRc === "sac_fly" ||
              leadRc === "sac_bunt" ||
              leadRc === "double_play" ||
              leadRc === "triple_play" ||
              leadRc === "infield_fly" ||
              leadRc === "fc"
            ) {
              score -= 25;
            }
          }

          if (candS === firstRawBo) {
            score += 1;
          }

          if (score > bestScore) {
            bestScore = score;
            bestBo = candS;
          }
        }

        effectiveLeadOff = bestBo;
      } else if (runningLeadOff !== undefined) {
        if (stepUpCandidates.includes(runningLeadOff)) {
          effectiveLeadOff = runningLeadOff;
        } else if (stepUpCandidates.length === 1) {
          effectiveLeadOff = stepUpCandidates[0];
        } else {
          effectiveLeadOff = runningLeadOff;
        }
      } else if (stepUpCandidates.length === 1) {
        effectiveLeadOff = stepUpCandidates[0];
      } else {
        effectiveLeadOff = Math.max(
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
    // ※1巡目の9番折り返し前 (lap === 0 && bo >= effectiveLeadOff) は必ず1列目(c=1)になるため誤読c=2による早期シフトを防止
    const maxAllowedCols = Math.max(metaCols, maxLap + 1);
    let prevCol = 1;
    for (const item of tagged) {
      const minRequiredCol = item.lap + 1;
      const isFirstLapBeforeNineWrap =
        item.lap === 0 && item.bo >= effectiveLeadOff;
      const clampedRawCol = isFirstLapBeforeNineWrap
        ? 1
        : Math.max(1, Math.min(maxAllowedCols, item.rawCol));
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
      const endedByRunnerOutOnly = isRawRunnerOnlyEnd(lastEntry.raw);
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
    if (slice.length === 0) continue;
    const pitchSubquery = db
      .select({ id: pitches.id })
      .from(pitches)
      .where(inArray(pitches.atBatId, slice));
    // 外部キー制約（base_advances.pitch_id -> pitches.id, play_logs.at_bat_id -> at_bats.id）を遵守し、必ず子テーブルから順に削除する
    await db.batch([
      db.delete(baseAdvances).where(inArray(baseAdvances.pitchId, pitchSubquery)),
      db.delete(baseAdvances).where(inArray(baseAdvances.atBatId, slice)),
      db.delete(playLogs).where(inArray(playLogs.atBatId, slice)),
      db.delete(pitches).where(inArray(pitches.atBatId, slice)),
      db.delete(atBats).where(inArray(atBats.id, slice)),
    ]);
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

