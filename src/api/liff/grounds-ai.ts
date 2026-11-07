// filepath: src/api/liff/grounds-ai.ts
import { Hono } from "hono";
import type { WorkerEnv } from "@/types/api";

const liffGroundsAiRouter = new Hono<{ Bindings: WorkerEnv }>();

export type GroundVenueCategory = "stadium" | "home" | "school" | "indoor";

export type GroundVenueSurface =
  | "土 (クレー)"
  | "人工芝"
  | "天然芝"
  | "土 (内野) / 天然芝 (外野)"
  | "その他";

export interface GroundAiSourceLink {
  title: string;
  url: string;
}

export interface GroundAiLookupResult {
  name: string;
  shortName: string;
  category: GroundVenueCategory;
  surface: GroundVenueSurface;
  address: string;
  mapUrl: string;
  parkingInfo: string;
  spikeRule: string;
  notes: string;
  confidence: "high" | "medium" | "low";
  summaryNote: string;
  sources: GroundAiSourceLink[];
}

interface GroundAiLookupRequestBody {
  name?: string;
  areaHint?: string;
  currentCategory?: string;
  teamId?: string;
}

interface GeminiGeneratePart {
  text?: string;
  thought?: boolean;
}

interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GeminiGenerateCandidate {
  content?: {
    parts?: GeminiGeneratePart[];
  };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
  };
}

interface GeminiGenerateResponse {
  candidates?: GeminiGenerateCandidate[];
  error?: {
    message?: string;
    code?: number;
  };
}

interface RawAiGroundPayload {
  name?: unknown;
  shortName?: unknown;
  category?: unknown;
  surface?: unknown;
  address?: unknown;
  parkingInfo?: unknown;
  spikeRule?: unknown;
  notes?: unknown;
  confidence?: unknown;
  summaryNote?: unknown;
}

interface ModelAttemptSpec {
  model: string;
  useGoogleSearch: boolean;
  thinkingZero?: boolean;
  timeoutMs: number;
}

const MODEL_ATTEMPTS: ReadonlyArray<ModelAttemptSpec> = [
  { model: "gemini-2.5-flash", useGoogleSearch: true, thinkingZero: true, timeoutMs: 11_000 },
  { model: "gemini-flash-lite-latest", useGoogleSearch: true, timeoutMs: 9_000 },
  { model: "gemini-2.5-flash", useGoogleSearch: false, thinkingZero: true, timeoutMs: 9_000 },
  { model: "gemini-flash-lite-latest", useGoogleSearch: false, timeoutMs: 8_000 },
];

const MODEL_COOLDOWN = new Map<string, number>();

const VALID_CATEGORIES = new Set<GroundVenueCategory>([
  "stadium",
  "home",
  "school",
  "indoor",
]);

const VALID_SURFACES = new Set<GroundVenueSurface>([
  "土 (クレー)",
  "人工芝",
  "天然芝",
  "土 (内野) / 天然芝 (外野)",
  "その他",
]);

function cleanString(val: unknown, maxLen = 300): string {
  if (typeof val !== "string") return "";
  const trimmed = val.replace(/\r\n/g, "\n").trim();
  if (
    !trimmed ||
    trimmed === "不明" ||
    trimmed === "情報なし" ||
    trimmed === "未確認" ||
    trimmed === "なし（不明）" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return "";
  }
  return trimmed.slice(0, maxLen);
}

function normalizeCategory(
  raw: unknown,
  fallbackName: string,
  currentCategory?: string
): GroundVenueCategory {
  if (currentCategory === "home") return "home";
  if (typeof raw === "string") {
    const c = raw.trim().toLowerCase() as GroundVenueCategory;
    if (VALID_CATEGORIES.has(c)) return c;
  }
  if (/小学校|中学校|高校|高等学校|大学|学園|校庭/.test(fallbackName)) {
    return "school";
  }
  if (/室内|インドア|ドーム|練習場|バッティング/.test(fallbackName)) {
    return "indoor";
  }
  return "stadium";
}

function normalizeSurface(raw: unknown): GroundVenueSurface {
  if (typeof raw !== "string") return "土 (クレー)";
  const s = raw.trim();
  if (VALID_SURFACES.has(s as GroundVenueSurface)) {
    return s as GroundVenueSurface;
  }
  const hasArtificial = /人工芝/.test(s);
  const hasNatural = /天然芝|芝/.test(s) && !hasArtificial;
  const hasDirt = /土|クレー|黒土|真砂土/.test(s);

  if (hasDirt && hasNatural) return "土 (内野) / 天然芝 (外野)";
  if (hasArtificial) return "人工芝";
  if (hasNatural) return "天然芝";
  if (hasDirt) return "土 (クレー)";
  return "土 (クレー)";
}

function normalizeConfidence(raw: unknown): "high" | "medium" | "low" {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function extractFirstJsonObject(rawText: string): RawAiGroundPayload | null {
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(firstBrace, i + 1);
        try {
          const parsed = JSON.parse(candidate) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as RawAiGroundPayload;
          }
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractGroundingSources(
  candidate: GeminiGenerateCandidate | undefined
): GroundAiSourceLink[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const seenUrls = new Set<string>();
  const links: GroundAiSourceLink[] = [];

  for (const ch of chunks) {
    const uri = typeof ch?.web?.uri === "string" ? ch.web.uri.trim() : "";
    if (!uri || !/^https?:\/\//i.test(uri) || seenUrls.has(uri)) continue;
    seenUrls.add(uri);
    const rawTitle =
      typeof ch?.web?.title === "string" && ch.web.title.trim()
        ? ch.web.title.trim()
        : new URL(uri).hostname;
    links.push({
      title: rawTitle.slice(0, 80),
      url: uri,
    });
    if (links.length >= 4) break;
  }

  return links;
}

function buildGoogleMapsSearchUrl(name: string, address: string): string {
  const query = address ? `${name} ${address}` : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query.trim()
  )}`;
}

function buildLookupPrompt(inputName: string, areaHint: string, currentCategory?: string): string {
  const areaLine = areaHint
    ? `- 地域・市区町村のヒント: ${areaHint}`
    : `- 地域・市区町村のヒント: 指定なし（施設名から日本国内の該当野球場・学校・スポーツ施設を特定してください）`;
  const catLine =
    currentCategory === "home"
      ? `- 現在の登録分類: home（本拠地・ホーム）`
      : "";

  return [
    "あなたは日本の少年野球・中学硬式野球・草野球チームの運営を支援する、球場・スポーツ施設リサーチの専門家です。",
    "Google検索を用いて、指定された野球場・グラウンド・学校・室内練習場の自治体公式ページ、公園協会案内、施設利用ガイド等を調査し、正確な施設情報をJSON形式で抽出してください。",
    "",
    "【調査対象の施設】",
    `- 入力された施設・球場名: ${inputName}`,
    areaLine,
    catLine,
    "",
    "【厳守ルール（ハルシネーション絶対禁止）】",
    "1. Web検索や公式情報で裏付けが取れた事実のみを記載してください。確認できない項目（特にスパイク規定や駐車場台数など）を推測・創作することは絶対に禁止です。不明な項目は必ず空文字 \"\" にしてください。",
    "2. 同名の球場（例: 市民球場、緑地野球場など）が全国に複数あり地域ヒントが無い場合は、最も代表的または野球利用が多い施設を選び、summaryNote に「〇〇県〇〇市の施設として取得しました（別の地域の場合は地域ヒントを入力して再取得してください）」と明記してください。",
    "3. surface は必ず次の5択のいずれか完全一致で出力してください:",
    '   - "土 (クレー)"',
    '   - "人工芝"',
    '   - "天然芝"',
    '   - "土 (内野) / 天然芝 (外野)"',
    '   - "その他"',
    '4. category は "stadium"（公営球場・公園・河川敷・専用球場）, "school"（小中高大の学校グラウンド）, "indoor"（室内練習場・ドーム）, "home" のいずれか1つにしてください。',
    "5. shortName は予定表や試合カードの小さなバッジに収まる 4〜10文字程度のわかりやすい略称にしてください。",
    "6. 出力は説明文やマークダウンを含めず、以下のキーを持つ純粋なJSONオブジェクト1つのみを返してください:",
    "{",
    '  "name": "正式な施設・球場名",',
    '  "shortName": "短い略称",',
    '  "category": "stadium | school | indoor | home",',
    '  "surface": "5択のいずれか",',
    '  "address": "都道府県からの所在地（不明なら空文字）",',
    '  "parkingInfo": "駐車場の有無・駐車場名・収容台数・料金目安など公式確認できた情報（不明なら空文字）",',
    '  "spikeRule": "金具スパイク可否・ポイントスパイク指定・室内履き指定など公式確認できた規定（不明なら空文字）",',
    '  "notes": "トイレ・水道・更衣室・屋根付きスタンド・自販機・禁煙等の確認できた設備や注意点（不明なら空文字）",',
    '  "confidence": "high | medium | low",',
    '  "summaryNote": "特定した自治体名や同名施設に関する1行補足メモ"',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * POST /api/liff/grounds/ai-lookup
 * 球場・施設名（＋地域ヒント）から Google Search Grounding 付き Gemini で施設情報を取得する
 */
liffGroundsAiRouter.post("/", async (c) => {
  let body: GroundAiLookupRequestBody;
  try {
    body = await c.req.json<GroundAiLookupRequestBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const inputName = typeof body.name === "string" ? body.name.trim() : "";
  const areaHint = typeof body.areaHint === "string" ? body.areaHint.trim() : "";
  const currentCategory =
    typeof body.currentCategory === "string" ? body.currentCategory.trim() : undefined;

  if (!inputName) {
    return c.json(
      { success: false, error: "施設・球場名を入力してからAI取得を実行してください" },
      400
    );
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json(
      {
        success: false,
        error: "AI検索用のAPIキー（GEMINI_API_KEY）がサーバーに設定されていません",
      },
      503
    );
  }

  const prompt = buildLookupPrompt(inputName, areaHint, currentCategory);
  const overallStart = Date.now();
  const MAX_BUDGET_MS = 32_000;
  let lastErrorMsg = "AIからの応答を取得できませんでした";
  let skipGoogleSearch = false;

  for (const spec of MODEL_ATTEMPTS) {
    if (spec.useGoogleSearch && skipGoogleSearch) continue;

    const remainingMs = MAX_BUDGET_MS - (Date.now() - overallStart);
    if (remainingMs < 3_000) break;

    const cooldownKey = `${spec.model}:${spec.useGoogleSearch ? "gs" : "plain"}`;
    const cooldownUntil = MODEL_COOLDOWN.get(cooldownKey) || 0;
    if (Date.now() < cooldownUntil) continue;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(spec.timeoutMs, remainingMs)
    );

    try {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.1,
      };
      if (!spec.useGoogleSearch) {
        generationConfig.responseMimeType = "application/json";
      }
      if (spec.thinkingZero) {
        generationConfig.thinkingConfig = {
          thinkingBudget: 0,
        };
      }

      const requestPayload: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      };

      if (spec.useGoogleSearch) {
        requestPayload.tools = [{ google_search: {} }];
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 404 || res.status === 429 || res.status === 503) {
          MODEL_COOLDOWN.set(cooldownKey, Date.now() + 45_000);
        }
        if (spec.useGoogleSearch && (res.status === 429 || res.status === 403)) {
          skipGoogleSearch = true;
        }
        lastErrorMsg = `AI検索エラー (${res.status})`;
        console.warn(`[grounds-ai] ${spec.model} failed (${res.status}):`, errText.slice(0, 200));
        continue;
      }

      const data = (await res.json()) as GeminiGenerateResponse;
      const firstCandidate = data.candidates?.[0];
      const parts = firstCandidate?.content?.parts || [];
      const combinedText = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text || "")
        .join("\n")
        .trim();

      const extracted = extractFirstJsonObject(combinedText);
      if (!extracted) {
        lastErrorMsg = "AI応答の解析に失敗しました";
        continue;
      }

      const resolvedName = cleanString(extracted.name, 120) || inputName;
      const resolvedShortName =
        cleanString(extracted.shortName, 40) || resolvedName.slice(0, 10);
      const resolvedCategory = normalizeCategory(
        extracted.category,
        resolvedName,
        currentCategory
      );
      const resolvedSurface = normalizeSurface(extracted.surface);
      const resolvedAddress = cleanString(extracted.address, 160);
      const resolvedParking = cleanString(extracted.parkingInfo, 260);
      const resolvedSpikeRule = cleanString(extracted.spikeRule, 200);
      const resolvedNotes = cleanString(extracted.notes, 320);
      const resolvedConfidence = normalizeConfidence(extracted.confidence);
      const resolvedSummary = cleanString(extracted.summaryNote, 180);
      const sources = extractGroundingSources(firstCandidate);

      const candidateResult: GroundAiLookupResult = {
        name: resolvedName,
        shortName: resolvedShortName,
        category: resolvedCategory,
        surface: resolvedSurface,
        address: resolvedAddress,
        mapUrl: buildGoogleMapsSearchUrl(resolvedName, resolvedAddress),
        parkingInfo: resolvedParking,
        spikeRule: resolvedSpikeRule,
        notes: resolvedNotes,
        confidence: resolvedConfidence,
        summaryNote: resolvedSummary,
        sources,
      };

      return c.json({
        success: true,
        model: spec.model,
        grounded: spec.useGoogleSearch && sources.length > 0,
        candidate: candidateResult,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastErrorMsg = isAbort
        ? "施設情報の検索がタイムアウトしました。もう一度お試しください"
        : err instanceof Error
          ? err.message
          : "施設情報の取得中にエラーが発生しました";
      console.warn(`[grounds-ai] ${spec.model} exception:`, lastErrorMsg);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return c.json(
    {
      success: false,
      error: lastErrorMsg || "施設情報を取得できませんでした。施設名や地域ヒントを確認してください。",
    },
    502
  );
});

export default liffGroundsAiRouter;
