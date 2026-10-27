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
  resolveActiveMatchupFromStructure,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
import type { WorkerEnv } from "@/types/api";
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ConfidenceLevel,
  ImportScopeMode,
  NormalizedBox,
  ScorebookBatterSlot,
  ScorebookInningMeta,
  ScorebookMatchSummary,
  ScorebookPitcherStint,
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookSubstitution,
  ScorebookV2Advance,
  ScorebookV2AtBat,
  ScorebookValidationIssue,
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

interface GeminiModelAttemptConfig {
  model: string;
  /** 初動応答（HTTP 200＋最初のSSEチャンク到達）までの最大待機ミリ秒。混雑キュー滞留を素早く見切る */
  firstChunkTimeoutMs: number;
  /** 非思考の本文JSONテキストが出始めるまでの最大待機ミリ秒 */
  firstTextTimeoutMs: number;
  thinkingMode: "level_low" | "budget" | "budget_zero" | "none";
  backoffBeforeMs: number;
}

/**
 * 特定モデルの 503 スパイク時に同プールで長時間滞留しないよう、
 * 異なる世代・サービングプール（3.8-flash ➔ 2.5-flash ➔ 2.5-flash-lite ➔ 3.5-flash-lite ➔ 3.5-flash）へ即座にフェイルオーバーする
 */
const GEMINI_MODEL_CONFIGS: readonly GeminiModelAttemptConfig[] = [
  {
    model: "gemini-3.8-flash",
    firstChunkTimeoutMs: 14_000,
    firstTextTimeoutMs: 25_000,
    thinkingMode: "level_low",
    backoffBeforeMs: 0,
  },
  {
    model: "gemini-2.5-flash",
    firstChunkTimeoutMs: 15_000,
    firstTextTimeoutMs: 25_000,
    thinkingMode: "budget",
    backoffBeforeMs: 350,
  },
  {
    model: "gemini-2.5-flash-lite",
    firstChunkTimeoutMs: 13_000,
    firstTextTimeoutMs: 20_000,
    thinkingMode: "budget_zero",
    backoffBeforeMs: 350,
  },
  {
    model: "gemini-3.5-flash-lite",
    firstChunkTimeoutMs: 13_000,
    firstTextTimeoutMs: 22_000,
    thinkingMode: "level_low",
    backoffBeforeMs: 400,
  },
  {
    model: "gemini-3.5-flash",
    firstChunkTimeoutMs: 15_000,
    firstTextTimeoutMs: 25_000,
    thinkingMode: "level_low",
    backoffBeforeMs: 500,
  },
  {
    model: "gemini-3.8-flash",
    firstChunkTimeoutMs: 16_000,
    firstTextTimeoutMs: 26_000,
    thinkingMode: "level_low",
    backoffBeforeMs: 1_400,
  },
];

const PITCH_DISPLAY_JA: Record<CanonicalPitchResult, string> = {
  ball: "ボール",
  strike: "見逃しストライク",
  swinging_strike: "空振りストライク",
  foul: "ファウル",
  pickoff: "牽制",
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
  legendBase64?: string;
  legendMimeType?: string;
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

    const myStarterHint =
      savedLineups.length > 0
        ? savedLineups
            .filter((l) => l.isStarting)
            .map((l) => `${l.battingOrder}番: #${l.uniformNumber} ${l.playerName}(守備:${l.position})`)
            .join(", ")
        : "";

    const scoreboardHintScores = isMyTeamBatting
      ? safeParseNumberArray(match.myInningScores)
      : safeParseNumberArray(match.opponentInningScores);

    const scoreboardHintText =
      scoreboardHintScores.length > 0
        ? `\n参考（事前登録済みの各回得点）: ${scoreboardHintScores
            .map((r, i) => `${i + 1}回=${r}点`)
            .join(", ")}`
        : "";

    const imageParts: GeminiContentPart[] = [
      {
        inlineData: {
          mimeType: body.mimeType || "image/jpeg",
          data: body.imageBase64,
        },
      },
    ];

    const legendPart = await resolveLegendImagePart(
      c,
      db,
      match.teamId,
      body.legendBase64,
      body.legendMimeType
    );
    if (legendPart) {
      imageParts.push(legendPart);
    }

    const sideText = body.isTop ? "先攻（表の攻撃）" : "後攻（裏の攻撃）";
    const battingTeamContext = isMyTeamBatting
      ? `このシートの攻撃チームは【自チーム】です。打者名は必ず画像の手書き文字と背番号を読み取った上で、可能な限り以下の自チーム登録選手リストに名寄せしてください。\n自チーム登録選手リスト: [${rosterHint}]${
          myStarterHint ? `\n事前登録スタメン: [${myStarterHint}]` : ""
        }\nまた、相手投手の欄（このシートに対して投げた相手チームのピッチャー）は画像の手書き文字/背番号をそのまま読み取ってください。`
      : `このシートの攻撃チームは【対戦相手（${match.opponent}）】です。打者名は画像の手書き文字・背番号を読み取ってください（絶対に自チームの選手名を当てはめないでください）。\n一方、このシートに対して投げた登板投手（pitchers）は【自チームの投手】ですので、自チーム登録選手リスト [${rosterHint}] に名寄せしてください。`;

    const prompt = `あなたは日本の野球スコアブック（早稲田式・成美堂式・草野球/学童野球手書きスコア）の構造解析エキスパートです。
添付されたスコアブックの片面画像（${sideText}シート）から、まず「シート全体の骨格情報（打順・途中交代・登板投手・イニングごとの列構造と得点）」のみを精確に抽出してください。

${battingTeamContext}${scoreboardHintText}

【厳守ルール】
1. **打順枠（batters）**:
   - 1番〜9番（全員打ち制で10番以降が書かれている場合は10番以降もすべて）の先発選手の「打順(battingOrder)」「背番号(uniformNumber)」「選手名(name)」「先発守備位置番号(position: 1〜9 または DH)」を抽出してください。
   - 同じ打順枠の2段目・3段目に途中出場の選手（代打PH・代走PR・守備交代DEF）が書かれている場合、マス内の交代波線・二重線・斜線の位置と照合して「何回の攻撃または守備から出場したか(inningEntered)」を特定し、substitutions 配列にすべて格納してください。
2. **登板投手（pitchers）**:
   - このシートの打者たちに対して投げた相手側のピッチャー（先発および継投した救援投手）を登板順に抽出してください。
   - スコアブック下部や右側の投手成績欄、および打席マス間の投手交代線（横波線や二重線）を確認し、各投手が「何回から何回まで投げたか（fromInning, toInning）」を設定してください。投手欄が空欄で1人しかいない場合は order:1, fromInning:1, toInning:最終回 としてください。
3. **イニング構造と各回得点（innings）**:
   - 実際に試合が行われたイニング（1回〜最終回、空欄の回は除く）のみを抽出してください。
   - **打者一巡の列折り返し検出（超重要）**: 1イニングで打者が10人以上打席に立ち、2列を使って記録されている回は columnCount: 2 としてください（通常は columnCount: 1）。
   - 各イニングの上部スコア欄・下部計欄・およびマス内の本塁生還印（●や赤丸）を突き合わせ、その回の正確な得点数(runs)と安打数(hits)を出力してください。
   - 各イニング列の全体領域を 0〜1000 の正規化座標 (ymin, xmin, ymax, xmax) で出力してください。

【出力JSONフォーマット（以下の厳密なキー構造のJSONオブジェクトのみを返してください）】
{
  "batters": [
    {
      "battingOrder": 1,
      "name": "選手名",
      "uniformNumber": "10",
      "position": "6",
      "substitutions": [
        {
          "inningEntered": 5,
          "subType": "PH",
          "name": "交代選手名",
          "uniformNumber": "24",
          "position": "P"
        }
      ]
    }
  ],
  "pitchers": [
    {
      "order": 1,
      "name": "投手名",
      "uniformNumber": "18",
      "fromInning": 1,
      "toInning": 7
    }
  ],
  "innings": [
    {
      "inning": 1,
      "columnCount": 1,
      "runs": 0,
      "hits": 1,
      "ymin": 120,
      "xmin": 210,
      "ymax": 880,
      "xmax": 300
    }
  ],
  "totalRuns": 0,
  "totalHits": 1,
  "totalErrors": 0
}
※余分な改行・空白インデントを省いた1行のコンパクトなJSON文字列で高速に出力してください。`;

    const raw = await callGeminiStructuredJson<RawGeminiStructureResponse>(
      apiKey,
      prompt,
      imageParts,
      256
    );

    const maxInningFromSheet =
      (raw.innings || []).reduce((mx, cur) => Math.max(mx, cur.inning || 1), 0) ||
      match.innings ||
      7;

    // 打順データの正規化＆自チーム選手名鑑自動リンク
    const rawBatters = Array.isArray(raw.batters) ? raw.batters : [];
    const normalizedBatters: ScorebookBatterSlot[] = rawBatters.map((b, idx) => {
      const order = b.battingOrder || idx + 1;
      const matched = isMyTeamBatting
        ? matchRosterPlayer(b.name, b.uniformNumber, roster)
        : null;

      const subs: ScorebookSubstitution[] = (b.substitutions || []).map((s) => {
        const subMatched = isMyTeamBatting
          ? matchRosterPlayer(s.name, s.uniformNumber, roster)
          : null;
        const normalizedSubType: "PH" | "PR" | "DEF" =
          s.subType === "PR" ? "PR" : s.subType === "DEF" ? "DEF" : "PH";

        return {
          id: crypto.randomUUID(),
          inningEntered: Math.max(1, s.inningEntered || 1),
          subType: normalizedSubType,
          name: subMatched ? subMatched.name : (s.name || "").trim(),
          uniformNumber: subMatched
            ? subMatched.uniformNumber
            : (s.uniformNumber || "").trim(),
          position: (s.position || "").trim(),
          playerId: subMatched ? subMatched.id : null,
        };
      });

      return {
        battingOrder: order,
        name: matched ? matched.name : (b.name || "").trim(),
        uniformNumber: matched
          ? matched.uniformNumber
          : (b.uniformNumber || "").trim(),
        position: (b.position || "").trim(),
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
        position: isMyTeamBatting && savedStarter ? savedStarter.position : "",
        playerId: isMyTeamBatting && savedStarter ? savedStarter.playerId : null,
        substitutions: [],
      });
    }
    normalizedBatters.sort((a, b) => a.battingOrder - b.battingOrder);

    // 投手データの正規化（相手攻撃シートの場合は自チーム投手に名寄せ）
    const rawPitchers = Array.isArray(raw.pitchers) ? raw.pitchers : [];
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
              name: isMyTeamBatting ? "相手投手" : "",
              uniformNumber: "",
              playerId: null,
              fromInning: 1,
              toInning: maxInningFromSheet,
            },
          ];

    const normalizedInnings: ScorebookInningMeta[] = (raw.innings || [])
      .filter((inn) => (inn.inning || 0) >= 1)
      .sort((a, b) => (a.inning || 1) - (b.inning || 1))
      .map((inn) => {
        const box = sanitizeBox(inn.ymin, inn.xmin, inn.ymax, inn.xmax);
        return {
          inning: inn.inning || 1,
          columnCount: Math.max(1, inn.columnCount || 1),
          runs: Math.max(0, inn.runs ?? 0),
          hits: Math.max(0, inn.hits ?? 0),
          columnBox: box,
        };
      });

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
      totalRuns: raw.totalRuns ?? calculatedRuns,
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

    const imageParts: GeminiContentPart[] = [
      {
        inlineData: {
          mimeType: body.mimeType || "image/jpeg",
          data: body.imageBase64,
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
    const hasLegend = Boolean(legendPart);
    if (legendPart) {
      imageParts.push(legendPart);
    }

    const sideLabel = body.isTop ? "表（先攻）" : "裏（後攻）";
    const sortedTargets = [...body.targetInnings].sort((a, b) => a - b);

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
        ? ` (列の目安座標 ymin:${meta.columnBox[0]}, xmin:${meta.columnBox[1]}, ymax:${meta.columnBox[2]}, xmax:${meta.columnBox[3]})`
        : "";
      return `・${innNum}回${sideLabel}: 確定得点=${meta.runs}点, 安打目安=${meta.hits}本, ${colNote}${boxNote}`;
    });

    const leadOffConstraint = body.expectedLeadOffOrder
      ? `\n🔥【絶対制約: 先頭打者】${sortedTargets[0]}回${sideLabel}の最初の打者（先頭打者）は必ず【${body.expectedLeadOffOrder}番打者】の行からスタートします！空欄マスを読み飛ばして別の打順から始めないでください。`
      : `\n🔥【絶対制約: 先頭打者】1回${sideLabel}の最初の打者は必ず【1番打者】の行からスタートします。`;

    const legendConstraint = hasLegend
      ? `\n🔥【最優先: 添付画像2「チームのスコア記号早見表」】画像2はチーム公式の記号早見表です。安打・アウト・投球記号・牽制等の書き方は画像2の定義を最優先で適用してください。`
      : "";

    const prompt = `あなたは日本の早稲田式・成美堂式スコアブックを1球単位まで完璧に読み解くプロ公式記録員AIです。
添付されたスコアブック画像（画像1）のうち、**【${sortedTargets.join("回, ")}回（${sideLabel}）】の打席のみ** に全神経を集中して、時系列順に全打席・全投球・全進塁を抽出してください。
（※${sortedTargets.join(", ")}回以外のイニングは絶対に出力しないでください！）
${legendConstraint}${leadOffConstraint}

【確定済みの打順・途中交代リスト（この名前を厳密に使用すること）】
${lineupSpecLines.join("\n")}

【確定済みの相手登板投手リスト】
${pitcherSpecLines.join("\n")}

【対象イニングの確定スコア＆列情報（必ずこの得点数・列数と整合させること）】
${targetInningMetaLines.join("\n")}

【超重要 1: 1球ごとの投球順序（p）の完全抽出（必須）】
各打席マスの投球記号欄（BSO欄）を1球目から最後の一球まで順番に読み取り、以下の1文字短縮コード配列 p で出力してください:
- "B": ボール（『ー』『・』『B欄の●』『B』）
- "S": 見逃しストライク（『○』『見逃しS』）
- "W": 空振りストライク（『●』『／』『空振り』）
- "F": ファウル（『V』『△』『レ』『F』、バントファウル含む）
- "P": 牽制球（『牽』『k』『1』『塁への牽制線』）
- "H": 安打になった最終球（単打・二塁打・三塁打・本塁打は末尾を必ず "H" にする）
- "X": 安打以外のインプレー打球（ゴロ・フライ・ライナー・犠打・犠飛・失策・野選は末尾を必ず "X" にする）
- "D": 死球になった球
※BSO合計のみ書かれたマスも最終カウントと結果に整合する配列を構成し、絶対に空配列にしないでください。

【超重要 2: 打撃結果コード（rc）と日本語表記（rl）の厳密判定】
- 安打とアウトを絶対に混同しないでください！右下の1塁線〜進塁線に実線・赤線・斜線（/ = 単打, // = 二塁打, /// = 三塁打, //// = 本塁打）があり打者自身のアウト丸数字（①②③）が無い場合は安打です。
- 中央『7』『8』『9』等の守備番号＋斜線/赤線 ➔ rc: "single"（または "double"/"triple"/"home_run"）, rl: "左前安打" / "中前安打" 等。
- 『6-3』『4-3』等の送球ハイフン＋①②③ ➔ rc: "groundout"（併殺は "double_play"）, rl: "遊ゴロ (6-3)" 等。
- 『8』『7F』『9飛』『6直』＋①②③ ➔ rc: "flyout", rl: "中飛" / "遊直" 等。
- 『K』『SO』＋①②③ ➔ rc: "strikeout", rl: "空振り三振" / "見逃し三振"（振り逃げ出塁は rc: "dropped_third_strike"）。
- 四球 ➔ rc: "walk", 死球 ➔ rc: "hit_by_pitch", 犠打 ➔ rc: "sac_bunt", 犠飛 ➔ rc: "sac_fly", 失策 ➔ rc: "error", 野選 ➔ rc: "fc"。
- 打席途中に走者が盗塁死・牽制死して3アウトチェンジになった未完了マス ➔ rc: "other", rl: "打席途中断（走塁死チェンジ）", o: 1。

【超重要 3: アウト数（o / eo）と進塁・得点（ru / a）】
- 1イニングの o の合計は（サヨナラ勝ちを除き）必ず 3 です。丸数字 ①②③ から eo (1,2,3) を設定してください。
- 盗塁(m:"steal")・盗塁死(m:"caught_stealing",io:true)・牽制死(m:"pickoff_out",io:true)・暴投(m:"wp")・捕逸(m:"pb")・打撃進塁(m:"hit"/"sac"/"fc"/"error")を a に記録してください。進塁が無い凡退等は a:[] としてください。
- 本塁生還は t:"HP", io:false とし、その打席の生還人数を ru に設定（イニング内の ru 合計＝確定得点）。

【超重要 4: マス座標 box と確信度 cf】
- box は [ymin, xmin, ymax, xmax]（0〜1000整数4要素配列）。
- cf は "h"(高)・"m"(中)・"l"(低)。迷いがあるマスのみ cf:"l" とし cr に短い理由を記載（通常は cr 省略可）。

【出力JSONフォーマット（高速応答のため改行・インデント無しのコンパクト短縮キーJSONのみを返してください）】
{"ab":[{"i":1,"c":1,"bo":1,"rc":"single","rl":"左前安打","rbi":0,"o":0,"eo":0,"ru":0,"p":["B","S","F","H"],"a":[{"rn":"選手名","f":"BAT","t":"1B","m":"hit","io":false,"pn":4}],"cf":"h","box":[150,210,230,300]}]}
※ rc は必ず "single"|"double"|"triple"|"home_run"|"walk"|"hit_by_pitch"|"strikeout"|"dropped_third_strike"|"groundout"|"flyout"|"double_play"|"sac_bunt"|"sac_fly"|"error"|"fc"|"other" のいずれかとしてください。`;

    const rawChunk = await callGeminiStructuredJson<RawGeminiChunkResponse>(
      apiKey,
      prompt,
      imageParts,
      256
    );

    const targetSet = new Set(sortedTargets);
    const rawItems = rawChunk.ab || rawChunk.atBats || [];
    const rawList = rawItems.filter((ab) =>
      targetSet.has((ab.i ?? ab.inning) || 0)
    );

    const mappedAtBats: ScorebookV2AtBat[] = rawList.map((ab) => {
      const inning = (ab.i ?? ab.inning) || sortedTargets[0];
      const battingOrder = Math.max(1, (ab.bo ?? ab.battingOrder) || 1);
      const resolved = resolveActiveMatchupFromStructure(
        body.structure,
        inning,
        battingOrder
      );

      const rawResultCode = ab.rc ?? ab.resultCode;
      const rawResultLabel = ab.rl ?? ab.resultLabel;
      const resultCode = inferCanonicalResultCode(rawResultCode, rawResultLabel);
      const normalizedPitches = normalizePitchArray(
        ab.p || ab.pitches || [],
        resultCode
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
            (a.method === "caught_stealing" || a.method === "pickoff_out")
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

      // B. 1球ごとの pitches 挿入
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
            : pCode === "pickoff"
            ? "ball"
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
        } else if (pCode === "strike" || pCode === "swinging_strike") {
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
      const pitchLines =
        ab.pitches.length > 0
          ? `\n===PITCHES===\n${ab.pitches
              .map((p, idx) => `${idx + 1}球目: ${PITCH_DISPLAY_JA[p] || p}`)
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
          (sum, ab) => sum + ab.pitches.length,
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
  thinkingBudget = 256
): Promise<T> {
  const attemptErrors: string[] = [];
  const overallStart = Date.now();
  const MAX_TOTAL_BUDGET_MS = 88_000;

  for (const cfg of GEMINI_MODEL_CONFIGS) {
    if (cfg.backoffBeforeMs > 0) {
      const jitter = Math.floor(Math.random() * 300);
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
        temperature: 0.1,
        responseMimeType: "application/json",
      };
      if (cfg.thinkingMode === "level_low") {
        generationConfig.thinkingConfig = {
          thinkingLevel: "LOW",
        };
      } else if (cfg.thinkingMode === "budget") {
        generationConfig.thinkingConfig = {
          thinkingBudget,
        };
      } else if (cfg.thinkingMode === "budget_zero") {
        generationConfig.thinkingConfig = {
          thinkingBudget: 0,
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

      // 万一 thinkingConfig パラメータ仕様差異で 400 が返った場合は即座に thinkingConfig なしで同モデル再送
      if (!res.ok && res.status === 400 && cfg.thinkingMode !== "none") {
        const firstErrText = await res.text();
        if (firstErrText.toLowerCase().includes("thinking")) {
          scheduleWatchdog(cfg.firstChunkTimeoutMs, "初動待機タイムアウト");
          const fallbackGenConfig: Record<string, unknown> = {
            temperature: 0.1,
            responseMimeType: "application/json",
          };
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
          const errSummary = `[${cfg.model}] HTTP 400: ${firstErrText.slice(0, 140)}`;
          attemptErrors.push(errSummary);
          continue;
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        const errSummary = `[${cfg.model}] HTTP ${res.status}: ${errText.slice(0, 140)}`;
        attemptErrors.push(errSummary);
        if (
          res.status === 400 ||
          res.status === 404 ||
          res.status === 408 ||
          res.status === 429 ||
          res.status >= 500
        ) {
          continue;
        }
        throw new Error(attemptErrors.join(" / "));
      }

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
      if (b64 && b64.length <= 1_600_000) {
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
        if (buf.byteLength <= 1_200_000) {
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
      if (buf.byteLength <= 1_200_000) {
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

function normalizePitchArray(
  rawPitches: string[],
  resultCode: CanonicalAtBatResult
): CanonicalPitchResult[] {
  const mapped: CanonicalPitchResult[] = [];

  for (const raw of rawPitches) {
    const s = (raw || "").trim().toLowerCase();
    if (!s) continue;

    if (s === "ball" || s === "b" || s.includes("ボール")) {
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
    } else if (s === "pickoff" || s === "p" || s.includes("牽")) {
      mapped.push("pickoff");
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
    resultCode === "double_play" ||
    resultCode === "sac_bunt" ||
    resultCode === "sac_fly" ||
    resultCode === "error" ||
    resultCode === "fc";

  // 投球配列が空の場合の最低限の補完、または末尾球の整合性補正
  if (mapped.length === 0) {
    if (isHitResult) return ["hit"];
    if (isInPlayOutOrReach) return ["in_play"];
    if (resultCode === "walk") return ["ball", "ball", "ball", "ball"];
    if (resultCode === "hit_by_pitch") return ["hbp"];
    if (resultCode === "strikeout" || resultCode === "dropped_third_strike") {
      return ["strike", "strike", "swinging_strike"];
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
  if (u === "STEAL" || u === "S" || s.includes("盗塁") && !s.includes("死")) {
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
  if (u === "WALK" || u === "BB" || s.includes("四球") || s.includes("死球") || s.includes("押出")) {
    return "walk";
  }
  if (u === "ERROR" || u.startsWith("E") || s.includes("失策") || s.includes("エラー")) {
    return "error";
  }
  if (u === "FC" || s.includes("野選")) return "fc";
  if (u === "SAC" || s.includes("犠")) return "sac";
  if (u === "OUT_ON_BASE" || s.includes("走塁死") || s.includes("封殺")) {
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

export default liffScorebookRouter;

