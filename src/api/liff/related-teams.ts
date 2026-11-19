// filepath: src/api/liff/related-teams.ts
import { Hono } from "hono";
import { and, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  matches,
  organizations,
  relatedTeams,
  teams,
  tournaments,
} from "@/db/schema";
import {
  parseOrganizationProfileDetails,
  resolveTeamCategoryOption,
} from "@/lib/liff/team-profile-schema";
import { normalizeHttpUrlInput } from "@/lib/liff/team-links-schema";
import {
  MAX_RELATED_TEAM_AREA_LENGTH,
  MAX_RELATED_TEAM_DESC_LENGTH,
  MAX_RELATED_TEAM_GROUND_LENGTH,
  MAX_RELATED_TEAM_LEAGUE_LENGTH,
  MAX_RELATED_TEAM_NAME_LENGTH,
  MAX_RELATED_TEAM_SHORT_NAME_LENGTH,
  createRelatedTeamLinkId,
  extractOpponentMatchKeys,
  getRelatedTeamLinkKindDefaultLabel,
  getRelationShortLabel,
  inferRelatedTeamLinkKind,
  isPlaceholderOpponentName,
  isSafePublicFetchUrl,
  normalizeOpponentMatchKey,
  normalizeRelationType,
  parseRelatedTeamLinksJson,
  serializeRelatedTeamLinksJson,
  stripSquadSuffixFromMatchKey,
  validateAndNormalizeRelatedTeamLinks,
  type AiDiscoveredTeamCandidate,
  type RelatedTeamAiLookupResult,
  type RelatedTeamAiSourceLink,
  type RelatedTeamItem,
  type RelatedTeamLinkItem,
  type RelatedTeamMatchStats,
  type RelatedTeamRelationType,
  type UnregisteredOpponentItem,
} from "@/lib/liff/related-teams-schema";
import {
  resolveCallerTeamAccess,
  verifyScopedRecordOwnership,
} from "@/lib/team-access";
import { validateSafeHttpUrl } from "@/lib/utils";
import type { WorkerEnv } from "@/types/api";

const liffRelatedTeamsRouter = new Hono<{ Bindings: WorkerEnv }>();

const DEMO_RELATED_TEAMS: RelatedTeamItem[] = [
  {
    id: "demo-rt-1",
    name: "高津タイガース",
    shortName: "高津T",
    leagueName: "川崎市学童軟式野球連盟",
    relationType: "league_member",
    relationLabel: "同連盟・協会",
    teamCategory: "学童軟式",
    area: "神奈川県川崎市高津区",
    homeGround: "多摩川緑地高津少年野球場",
    websiteUrl: "https://www.jsbb.or.jp/",
    links: [
      {
        id: "demo-rt-1-ig",
        kind: "instagram",
        label: "Instagram",
        url: "https://www.instagram.com/",
      },
      {
        id: "demo-rt-1-blog",
        kind: "blog",
        label: "部員募集・紹介",
        url: "https://sposuru.com/",
      },
    ],
    description: "春季・秋季市大会で毎年上位に進出する強豪クラブ。年2〜3回練習試合でも交流あり。",
    scope: "organization",
    scopeLabel: "チーム全体",
    isFavorite: true,
    priority: 10,
    matchStats: {
      totalFinished: 3,
      wins: 2,
      losses: 1,
      draws: 0,
      scheduledCount: 1,
      lastMatchDate: "2026-10-12",
      lastScoreSummary: "5-3 (○)",
    },
  },
  {
    id: "demo-rt-2",
    name: "中原イーグルス",
    shortName: "中原E",
    leagueName: "川崎市学童軟式野球連盟",
    relationType: "league_member",
    relationLabel: "同連盟・協会",
    teamCategory: "学童軟式",
    area: "神奈川県川崎市中原区",
    homeGround: "等々力運動広場",
    websiteUrl: "https://www.city.kawasaki.jp/",
    links: [
      {
        id: "demo-rt-2-yt",
        kind: "youtube",
        label: "試合ハイライト",
        url: "https://www.youtube.com/",
      },
    ],
    description: "走塁と堅守が特徴の同連盟所属チーム。合同練習の実績あり。",
    scope: "organization",
    scopeLabel: "チーム全体",
    isFavorite: false,
    priority: 5,
    matchStats: {
      totalFinished: 2,
      wins: 1,
      losses: 0,
      draws: 1,
      scheduledCount: 0,
      lastMatchDate: "2026-09-18",
      lastScoreSummary: "4-4 (△)",
    },
  },
  {
    id: "demo-rt-3",
    name: "多摩リバーサイドベアーズ",
    shortName: "多摩B",
    leagueName: "多摩区少年野球連盟",
    relationType: "league_member",
    relationLabel: "同連盟・協会",
    teamCategory: "学童軟式",
    area: "神奈川県川崎市多摩区",
    homeGround: "菅少年野球場",
    websiteUrl: "",
    links: [
      {
        id: "demo-rt-3-ig",
        kind: "instagram",
        label: "Instagram",
        url: "https://www.instagram.com/",
      },
    ],
    description: "区大会・新人戦でよく対戦する近隣クラブ。",
    scope: "organization",
    scopeLabel: "チーム全体",
    isFavorite: true,
    priority: 8,
    matchStats: {
      totalFinished: 4,
      wins: 3,
      losses: 1,
      draws: 0,
      scheduledCount: 0,
      lastMatchDate: "2026-11-03",
      lastScoreSummary: "7-2 (○)",
    },
  },
  {
    id: "demo-rt-4",
    name: "世田谷サウスウインズ",
    shortName: "世田谷SW",
    leagueName: "練習試合・広域交流",
    relationType: "practice_partner",
    relationLabel: "練習試合・交流",
    teamCategory: "学童軟式",
    area: "東京都世田谷区",
    homeGround: "二子玉川緑地運動場",
    websiteUrl: "",
    links: [
      {
        id: "demo-rt-4-ig",
        kind: "instagram",
        label: "公式Instagram",
        url: "https://www.instagram.com/",
      },
      {
        id: "demo-rt-4-map",
        kind: "map",
        label: "二子玉川緑地マップ",
        url: "https://maps.google.com/?q=二子玉川緑地運動場",
      },
    ],
    description: "多摩川対岸の定期練習試合パートナー。遠征時は河川敷駐車場を事前予約。",
    scope: "team",
    scopeLabel: "Aチーム",
    isFavorite: false,
    priority: 0,
    matchStats: {
      totalFinished: 1,
      wins: 0,
      losses: 1,
      draws: 0,
      scheduledCount: 0,
      lastMatchDate: "2026-08-24",
      lastScoreSummary: "2-6 (●)",
    },
  },
];

const DEMO_UNREGISTERED_OPPONENTS: UnregisteredOpponentItem[] = [
  {
    opponentName: "宮前フェニックス",
    totalFinished: 2,
    wins: 1,
    losses: 1,
    draws: 0,
    scheduledCount: 0,
    lastMatchDate: "2026-10-25",
  },
  {
    opponentName: "麻生チャレンジャーズ",
    totalFinished: 1,
    wins: 1,
    losses: 0,
    draws: 0,
    scheduledCount: 1,
    lastMatchDate: "2026-09-06",
  },
];

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
}

interface WebModelAttemptSpec {
  model: string;
  useGoogleSearch: boolean;
  thinkingMode:
    | { type: "budget"; budget: number }
    | { type: "level"; level: "LOW" | "MEDIUM" | "HIGH" }
    | { type: "none" };
  timeoutMs: number;
}

const WEB_SEARCH_MODEL_ATTEMPTS: ReadonlyArray<WebModelAttemptSpec> = [
  {
    model: "gemini-2.5-flash",
    useGoogleSearch: true,
    thinkingMode: { type: "budget", budget: 1024 },
    timeoutMs: 24_000,
  },
  {
    model: "gemini-flash-lite-latest",
    useGoogleSearch: true,
    thinkingMode: { type: "none" },
    timeoutMs: 18_000,
  },
  {
    model: "gemini-2.5-flash-lite",
    useGoogleSearch: true,
    thinkingMode: { type: "budget", budget: 1024 },
    timeoutMs: 20_000,
  },
  {
    model: "gemini-4-hydrogen",
    useGoogleSearch: true,
    thinkingMode: { type: "level", level: "MEDIUM" },
    timeoutMs: 20_000,
  },
  {
    model: "gemini-3.1-flash-lite-preview",
    useGoogleSearch: true,
    thinkingMode: { type: "level", level: "LOW" },
    timeoutMs: 20_000,
  },
  // Google Search クォータ上限到達時の構造化推論フォールバック帯
  {
    model: "gemini-4-hydrogen",
    useGoogleSearch: false,
    thinkingMode: { type: "level", level: "MEDIUM" },
    timeoutMs: 16_000,
  },
  {
    model: "gemini-3.8-flash",
    useGoogleSearch: false,
    thinkingMode: { type: "level", level: "LOW" },
    timeoutMs: 14_000,
  },
  {
    model: "gemini-flash-lite-latest",
    useGoogleSearch: false,
    thinkingMode: { type: "none" },
    timeoutMs: 12_000,
  },
  {
    model: "gemini-2.5-flash-lite",
    useGoogleSearch: false,
    thinkingMode: { type: "budget", budget: 512 },
    timeoutMs: 13_000,
  },
  {
    model: "gemini-3.1-flash-lite-preview",
    useGoogleSearch: false,
    thinkingMode: { type: "level", level: "LOW" },
    timeoutMs: 13_000,
  },
];

const MODEL_COOLDOWN = new Map<string, number>();

interface CachedAiResponse<TPayload> {
  expiresAt: number;
  payload: TPayload;
}

const DISCOVER_CACHE = new Map<
  string,
  CachedAiResponse<{
    success: true;
    model: string;
    grounded: boolean;
    sourcePageFetched: boolean;
    leagueTitle: string;
    summaryNote: string;
    candidates: AiDiscoveredTeamCandidate[];
    sources: RelatedTeamAiSourceLink[];
  }>
>();
const INFLIGHT_DISCOVER = new Map<
  string,
  Promise<
    CachedAiResponse<{
      success: true;
      model: string;
      grounded: boolean;
      sourcePageFetched: boolean;
      leagueTitle: string;
      summaryNote: string;
      candidates: AiDiscoveredTeamCandidate[];
      sources: RelatedTeamAiSourceLink[];
    }>["payload"]
  >
>();

const LOOKUP_CACHE = new Map<
  string,
  CachedAiResponse<{
    success: true;
    model: string;
    grounded: boolean;
    candidate: RelatedTeamAiLookupResult;
  }>
>();
const INFLIGHT_LOOKUP = new Map<
  string,
  Promise<
    CachedAiResponse<{
      success: true;
      model: string;
      grounded: boolean;
      candidate: RelatedTeamAiLookupResult;
    }>["payload"]
  >
>();

function cleanAiString(val: unknown, maxLen = 200): string {
  if (typeof val !== "string") return "";
  const trimmed = val
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (
    !trimmed ||
    trimmed === "不明" ||
    trimmed === "情報なし" ||
    trimmed === "未確認" ||
    trimmed === "なし" ||
    trimmed === "記載なし" ||
    trimmed === "公式情報なし" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return "";
  }
  return trimmed.slice(0, maxLen);
}

function isDummyOrPlaceholderUrl(rawUrl: string): boolean {
  const lower = rawUrl.trim().toLowerCase();
  if (!lower) return true;
  return (
    lower.includes("example.com") ||
    lower.includes("example.jp") ||
    lower.includes("example.org") ||
    lower.includes("sample.jp") ||
    lower.includes("sample.com") ||
    lower.includes("xxxx") ||
    lower.includes("your-team") ||
    lower.includes("dummy")
  );
}

function sanitizeAiUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed || isDummyOrPlaceholderUrl(trimmed)) return "";
  const normalized = normalizeHttpUrlInput(trimmed);
  const check = validateSafeHttpUrl(normalized, { allowEmpty: false });
  if (!check.ok || !check.url) return "";
  return check.url;
}

function sanitizeAiLinks(
  rawLinks: unknown,
  primaryWebsiteUrl: string
): RelatedTeamLinkItem[] {
  if (!Array.isArray(rawLinks)) return [];
  const out: RelatedTeamLinkItem[] = [];
  const seenUrls = new Set<string>();
  if (primaryWebsiteUrl) {
    seenUrls.add(primaryWebsiteUrl.toLowerCase());
  }

  for (const item of rawLinks) {
    if (out.length >= 8) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const cleanUrl = sanitizeAiUrl(rec.url);
    if (!cleanUrl) continue;

    const urlKey = cleanUrl.toLowerCase();
    if (seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);

    const rawLabel = cleanAiString(rec.label, 60);
    const kind = inferRelatedTeamLinkKind(cleanUrl, rawLabel);
    const label = rawLabel || getRelatedTeamLinkKindDefaultLabel(kind);

    out.push({
      id: createRelatedTeamLinkId(),
      kind,
      label,
      url: cleanUrl,
    });
  }
  return out;
}

function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();

  const startIdx = candidate.indexOf("{");
  const endIdx = candidate.lastIndexOf("}");
  if (startIdx < 0 || endIdx <= startIdx) return null;

  const slice = candidate.slice(startIdx, endIdx + 1);
  try {
    const parsed: unknown = JSON.parse(slice);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse failure
  }
  return null;
}

function extractGroundingWebSources(
  chunks: ReadonlyArray<GeminiGroundingChunk>
): RelatedTeamAiSourceLink[] {
  const out: RelatedTeamAiSourceLink[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri = (chunk.web?.uri || "").trim();
    if (!uri) continue;
    const check = validateSafeHttpUrl(uri, { allowEmpty: false });
    if (!check.ok || !check.url) continue;
    const key = check.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const title = (chunk.web?.title || "").trim() || new URL(check.url).hostname;
    out.push({
      title: title.slice(0, 100),
      url: check.url,
    });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * 連盟公式サイトの加盟チーム一覧ページ等を安全に取得し、文字コード自動判定＋テキスト・リンク抽出を行う
 */
async function fetchPublicLeaguePageDigest(rawUrl: string): Promise<
  | {
      ok: true;
      finalUrl: string;
      pageTitle: string;
      textSnippet: string;
      extractedLinks: Array<{ label: string; url: string }>;
    }
  | { ok: false; error: string }
> {
  const safeCheck = isSafePublicFetchUrl(rawUrl);
  if (!safeCheck.ok || !safeCheck.url) {
    return {
      ok: false,
      error: safeCheck.error || "指定されたURLは取得できません",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_500);
  try {
    const res = await fetch(safeCheck.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; iScoreCloud-TeamDirectory/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });

    const postRedirectCheck = isSafePublicFetchUrl(res.url || safeCheck.url);
    if (!postRedirectCheck.ok || !postRedirectCheck.url) {
      return {
        ok: false,
        error: "リダイレクト先のURLが安全基準を満たしていません",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `指定ページの取得に失敗しました (HTTP ${res.status})`,
      };
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      return {
        ok: false,
        error: "HTML形式のWebページURLを指定してください（PDFや画像URLは対象外です）",
      };
    }

    const buf = await res.arrayBuffer();
    const limitedBytes = new Uint8Array(buf.slice(0, 260_000));

    // Shift_JIS / EUC-JP の老舗連盟サイトにも対応
    const asciiPreview = new TextDecoder("latin1").decode(
      limitedBytes.slice(0, 2048)
    );
    const charsetHint = `${contentType} ${asciiPreview}`.toLowerCase();
    let encoding: "utf-8" | "shift-jis" | "euc-jp" = "utf-8";
    if (
      charsetHint.includes("shift_jis") ||
      charsetHint.includes("shift-jis") ||
      charsetHint.includes("x-sjis") ||
      charsetHint.includes("csWindows31J".toLowerCase())
    ) {
      encoding = "shift-jis";
    } else if (charsetHint.includes("euc-jp")) {
      encoding = "euc-jp";
    }

    let html = "";
    try {
      html = new TextDecoder(encoding).decode(limitedBytes);
    } catch {
      html = new TextDecoder("utf-8").decode(limitedBytes);
    }

    const finalUrl = postRedirectCheck.url;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch
      ? titleMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120)
      : "";

    // ページ内の <a href="...">テキスト</a> を最大90件抽出
    const extractedLinks: Array<{ label: string; url: string }> = [];
    const seenLinkKeys = new Set<string>();
    const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null = null;
    while ((match = anchorRegex.exec(html)) !== null) {
      if (extractedLinks.length >= 90) break;
      const rawHref = match[1].trim();
      const rawAnchorHtml = match[2];
      const anchorText = rawAnchorHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

      if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, finalUrl).toString();
        const urlValid = validateSafeHttpUrl(resolved, { allowEmpty: false });
        if (!urlValid.ok || !urlValid.url) continue;
        const key = `${anchorText}::${urlValid.url.toLowerCase()}`;
        if (seenLinkKeys.has(key)) continue;
        seenLinkKeys.add(key);

        if (anchorText) {
          extractedLinks.push({ label: anchorText, url: urlValid.url });
        }
      } catch {
        // ignore invalid relative url
      }
    }

    const textSnippet = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(?:tr|li|p|div|h1|h2|h3|h4|td|th|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 14_000);

    return {
      ok: true,
      finalUrl,
      pageTitle,
      textSnippet,
      extractedLinks,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: isAbort
        ? "指定ページの読み込みがタイムアウトしました"
        : "指定ページの取得中に通信エラーが発生しました",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function executeGeminiJsonPrompt(params: {
  apiKey: string;
  basePrompt: string;
  preferPlainJsonFirst?: boolean;
  maxBudgetMs?: number;
}): Promise<
  | {
      ok: true;
      model: string;
      grounded: boolean;
      json: Record<string, unknown>;
      sources: RelatedTeamAiSourceLink[];
    }
  | { ok: false; status: 429 | 502; error: string }
> {
  const {
    apiKey,
    basePrompt,
    preferPlainJsonFirst = false,
    maxBudgetMs = 45_000,
  } = params;
  const overallStart = Date.now();
  let skipGoogleSearchTool = preferPlainJsonFirst;
  let sawRateLimit429 = false;
  let lastErrorMsg = "AIからの応答を取得できませんでした";

  const buildGenerationConfig = (
    spec: WebModelAttemptSpec,
    withThinking: boolean
  ): Record<string, unknown> => {
    const isGemini4 = spec.model.startsWith("gemini-4");
    const cfg: Record<string, unknown> = {};
    if (!isGemini4) {
      cfg.temperature = 0.1;
    }
    if (!spec.useGoogleSearch) {
      cfg.responseMimeType = "application/json";
    }
    if (withThinking) {
      if (spec.thinkingMode.type === "budget" && !isGemini4) {
        cfg.thinkingConfig = {
          thinkingBudget: spec.thinkingMode.budget,
        };
      } else if (spec.thinkingMode.type === "level") {
        cfg.thinkingConfig = {
          thinkingLevel: spec.thinkingMode.level,
        };
      }
    }
    return cfg;
  };

  for (const spec of WEB_SEARCH_MODEL_ATTEMPTS) {
    if (spec.useGoogleSearch && skipGoogleSearchTool) continue;

    const remainingMs = maxBudgetMs - (Date.now() - overallStart);
    if (remainingMs < 4_000) break;

    const modelDeadUntil = MODEL_COOLDOWN.get(`model:${spec.model}`) || 0;
    const slotCooldownKey = `${spec.model}:${spec.useGoogleSearch ? "gs" : "plain"}`;
    const slotCooldownUntil = MODEL_COOLDOWN.get(slotCooldownKey) || 0;
    if (Date.now() < modelDeadUntil || Date.now() < slotCooldownUntil) {
      continue;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(spec.timeoutMs, remainingMs)
    );

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:generateContent?key=${apiKey}`;

      const sendRequest = async (withThinking: boolean): Promise<Response> => {
        const payload: Record<string, unknown> = {
          contents: [
            {
              role: "user",
              parts: [{ text: basePrompt }],
            },
          ],
          generationConfig: buildGenerationConfig(spec, withThinking),
        };
        if (spec.useGoogleSearch) {
          payload.tools = [{ google_search: {} }];
        }
        return fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(payload),
        });
      };

      let res = await sendRequest(spec.thinkingMode.type !== "none");

      if (!res.ok && res.status === 400 && spec.thinkingMode.type !== "none") {
        const firstErr = await res.text().catch(() => "");
        if (firstErr.toLowerCase().includes("thinking")) {
          res = await sendRequest(false);
        } else {
          MODEL_COOLDOWN.set(slotCooldownKey, Date.now() + 15 * 60_000);
          continue;
        }
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const lowerErr = errText.toLowerCase();

        if (res.status === 404) {
          MODEL_COOLDOWN.set(`model:${spec.model}`, Date.now() + 30 * 60_000);
        } else if (res.status === 429) {
          sawRateLimit429 = true;
          const isDailyExhausted =
            lowerErr.includes("perday") ||
            lowerErr.includes("per_day") ||
            lowerErr.includes("limit: 0");
          MODEL_COOLDOWN.set(
            slotCooldownKey,
            Date.now() + (isDailyExhausted ? 15 * 60_000 : 40_000)
          );
          if (
            spec.useGoogleSearch &&
            (lowerErr.includes("search_grounding") ||
              lowerErr.includes("google_search"))
          ) {
            skipGoogleSearchTool = true;
          }
        } else if (res.status === 503) {
          MODEL_COOLDOWN.set(slotCooldownKey, Date.now() + 30_000);
        } else if (spec.useGoogleSearch && res.status === 403) {
          MODEL_COOLDOWN.set(slotCooldownKey, Date.now() + 30 * 60_000);
          skipGoogleSearchTool = true;
        }

        lastErrorMsg =
          res.status === 429
            ? "AI検索の利用上限（短時間のアクセス集中）に達しました。少し待ってから再度お試しください"
            : `AI検索エラー (${res.status})`;
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
        lastErrorMsg = "AI応答データの解析に失敗しました";
        continue;
      }

      const webChunks =
        firstCandidate?.groundingMetadata?.groundingChunks || [];
      const sources = extractGroundingWebSources(webChunks);

      return {
        ok: true,
        model: spec.model,
        grounded: spec.useGoogleSearch && webChunks.length > 0,
        json: extracted,
        sources,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastErrorMsg = isAbort
        ? "AI検索がタイムアウトしました。条件を絞って再度お試しください"
        : err instanceof Error
          ? err.message
          : "AI検索中にエラーが発生しました";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    ok: false,
    status: sawRateLimit429 ? 429 : 502,
    error: lastErrorMsg,
  };
}

/**
 * GET /api/liff/related-teams?teamId=...
 */
liffRelatedTeamsRouter.get("/", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();

  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      teams: DEMO_RELATED_TEAMS,
      unregisteredOpponents: DEMO_UNREGISTERED_OPPONENTS,
      context: {
        orgName: "川崎中央デモクラブ",
        squadName: "Aチーム",
        categoryLabel: "学童野球（軟式）",
        areaHint: "神奈川県川崎市",
        leagueSuggestions: [
          "川崎市学童軟式野球連盟",
          "多摩区少年野球連盟",
          "春季親善リーグ",
        ],
      },
    });
  }

  const db = drizzle(c.env.DB);

  const [teamRow, matchRows] = await Promise.all([
    db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
        homeGround: teams.homeGround,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get(),
    db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
      })
      .from(matches)
      .where(eq(matches.teamId, teamId))
      .all(),
  ]);

  if (!teamRow) {
    return c.json({ success: false, error: "指定されたチームが見つかりません" }, 404);
  }

  const orgId = teamRow.organizationId;

  const [orgRow, relatedRows, tournamentRows] = await Promise.all([
    orgId
      ? db
          .select({
            id: organizations.id,
            name: organizations.name,
            shortName: organizations.shortName,
            category: organizations.category,
            profileJson: organizations.profileJson,
          })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .get()
      : Promise.resolve(undefined),
    db
      .select()
      .from(relatedTeams)
      .where(
        orgId
          ? or(
              eq(relatedTeams.teamId, teamId),
              and(
                eq(relatedTeams.organizationId, orgId),
                eq(relatedTeams.scope, "organization")
              )
            )
          : eq(relatedTeams.teamId, teamId)
      )
      .all(),
    db
      .select({
        name: tournaments.name,
        organizer: tournaments.organizer,
      })
      .from(tournaments)
      .where(
        orgId
          ? or(
              eq(tournaments.teamId, teamId),
              eq(tournaments.organizationId, orgId)
            )
          : eq(tournaments.teamId, teamId)
      )
      .all()
      .catch(() => []),
  ]);

  const orgProfile = parseOrganizationProfileDetails(orgRow?.profileJson);
  const categoryOption = resolveTeamCategoryOption(orgRow?.category);

  // 自クラブ自身の名前（誤って未登録対戦相手に出さないように除外）
  const ownNameKeys = new Set<string>();
  for (const ownCandidate of [
    orgRow?.name,
    orgRow?.shortName,
    teamRow.name,
  ]) {
    for (const k of extractOpponentMatchKeys(ownCandidate)) {
      ownNameKeys.add(k);
    }
  }

  // 登録済み関連チームの検索キーマップを構築（完全一致優先 ➔ 編成サフィックス除去キー）
  const exactKeyToRelatedId = new Map<string, string>();
  const strippedKeyToRelatedId = new Map<string, string>();
  for (const row of relatedRows) {
    const exactMain = normalizeOpponentMatchKey(row.name);
    if (exactMain && !exactKeyToRelatedId.has(exactMain)) {
      exactKeyToRelatedId.set(exactMain, row.id);
    }
    const exactShort = normalizeOpponentMatchKey(row.shortName);
    if (exactShort && exactShort.length >= 3 && !exactKeyToRelatedId.has(exactShort)) {
      exactKeyToRelatedId.set(exactShort, row.id);
    }
    const stripped = stripSquadSuffixFromMatchKey(row.name);
    if (stripped && !strippedKeyToRelatedId.has(stripped)) {
      strippedKeyToRelatedId.set(stripped, row.id);
    }
  }

  // 日付降順でソートして通算戦績＆直近試合スコアを集計
  const sortedMatches = [...matchRows].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  const statsByRelatedId = new Map<string, RelatedTeamMatchStats>();
  const unregisteredMap = new Map<string, UnregisteredOpponentItem>();

  for (const m of sortedMatches) {
    const rawOpponent = (m.opponent || "").trim();
    if (isPlaceholderOpponentName(rawOpponent)) continue;

    const exactKey = normalizeOpponentMatchKey(rawOpponent);
    const strippedKey = stripSquadSuffixFromMatchKey(rawOpponent);
    if (ownNameKeys.has(exactKey) || (strippedKey && ownNameKeys.has(strippedKey))) {
      continue;
    }

    const matchedRelatedId =
      exactKeyToRelatedId.get(exactKey) ||
      (strippedKey ? exactKeyToRelatedId.get(strippedKey) : undefined) ||
      (strippedKey ? strippedKeyToRelatedId.get(strippedKey) : undefined);

    const isFinished = m.status === "finished";
    const isScheduledOrLive = m.status === "scheduled" || m.status === "live";

    if (matchedRelatedId) {
      let bucket = statsByRelatedId.get(matchedRelatedId);
      if (!bucket) {
        bucket = {
          totalFinished: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          scheduledCount: 0,
          lastMatchDate: null,
          lastScoreSummary: null,
        };
        statsByRelatedId.set(matchedRelatedId, bucket);
      }

      if (isFinished) {
        bucket.totalFinished += 1;
        if (m.myScore > m.opponentScore) {
          bucket.wins += 1;
        } else if (m.myScore < m.opponentScore) {
          bucket.losses += 1;
        } else {
          bucket.draws += 1;
        }
        if (!bucket.lastMatchDate) {
          const mark =
            m.myScore > m.opponentScore
              ? "○"
              : m.myScore < m.opponentScore
                ? "●"
                : "△";
          bucket.lastMatchDate = m.date || null;
          bucket.lastScoreSummary = `${m.myScore}-${m.opponentScore} (${mark})`;
        }
      } else if (isScheduledOrLive) {
        bucket.scheduledCount += 1;
      }
    } else if (isFinished || isScheduledOrLive) {
      const groupKey = strippedKey || exactKey;
      if (!groupKey) continue;

      let unreg = unregisteredMap.get(groupKey);
      if (!unreg) {
        // 表示名は「vs 」等を除去したきれいな名称を採用
        const cleanDisplayName = rawOpponent
          .replace(/^(?:vs\.?|対)\s+/i, "")
          .trim();
        unreg = {
          opponentName: cleanDisplayName,
          totalFinished: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          scheduledCount: 0,
          lastMatchDate: null,
        };
        unregisteredMap.set(groupKey, unreg);
      }

      if (isFinished) {
        unreg.totalFinished += 1;
        if (m.myScore > m.opponentScore) {
          unreg.wins += 1;
        } else if (m.myScore < m.opponentScore) {
          unreg.losses += 1;
        } else {
          unreg.draws += 1;
        }
        if (!unreg.lastMatchDate) {
          unreg.lastMatchDate = m.date || null;
        }
      } else if (isScheduledOrLive) {
        unreg.scheduledCount += 1;
        if (!unreg.lastMatchDate) {
          unreg.lastMatchDate = m.date || null;
        }
      }
    }
  }

  // 連盟・グループ候補リストを生成
  const suggestionSet = new Set<string>();
  for (const lg of orgProfile.affiliatedLeagues) {
    if (lg.trim()) suggestionSet.add(lg.trim());
  }
  for (const tr of tournamentRows) {
    if (tr.organizer && tr.organizer.trim()) {
      suggestionSet.add(tr.organizer.trim());
    }
  }
  for (const rt of relatedRows) {
    if (rt.leagueName && rt.leagueName.trim()) {
      suggestionSet.add(rt.leagueName.trim());
    }
  }

  const squadLabel = teamRow.name || "編成";
  const formattedTeams: RelatedTeamItem[] = relatedRows
    .map((row) => {
      const relType = normalizeRelationType(row.relationType);
      const stats = statsByRelatedId.get(row.id) || null;
      const safeMainUrlCheck = row.websiteUrl
        ? validateSafeHttpUrl(row.websiteUrl, { allowEmpty: true })
        : { ok: true as const, url: "" };

      return {
        id: row.id,
        name: row.name,
        shortName: row.shortName || "",
        leagueName: row.leagueName || "",
        relationType: relType,
        relationLabel: getRelationShortLabel(relType),
        teamCategory: row.teamCategory || "",
        area: row.area || "",
        homeGround: row.homeGround || "",
        websiteUrl: safeMainUrlCheck.ok ? safeMainUrlCheck.url || "" : "",
        links: parseRelatedTeamLinksJson(row.linksJson),
        description: row.description || "",
        scope: row.scope === "team" ? ("team" as const) : ("organization" as const),
        scopeLabel: row.scope === "team" ? squadLabel : "チーム全体",
        isFavorite: Boolean(row.isFavorite),
        priority: row.priority ?? 0,
        matchStats:
          stats && (stats.totalFinished > 0 || stats.scheduledCount > 0)
            ? stats
            : null,
      };
    })
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      const matchDiff =
        (b.matchStats?.totalFinished || 0) - (a.matchStats?.totalFinished || 0);
      if (matchDiff !== 0) return matchDiff;
      const leagueCmp = (a.leagueName || "ん").localeCompare(
        b.leagueName || "ん",
        "ja"
      );
      if (leagueCmp !== 0) return leagueCmp;
      return a.name.localeCompare(b.name, "ja");
    });

  const unregisteredOpponents = Array.from(unregisteredMap.values())
    .sort((a, b) => {
      const totalDiff =
        b.totalFinished +
        b.scheduledCount -
        (a.totalFinished + a.scheduledCount);
      if (totalDiff !== 0) return totalDiff;
      return (b.lastMatchDate || "").localeCompare(a.lastMatchDate || "");
    })
    .slice(0, 40);

  return c.json({
    success: true,
    teams: formattedTeams,
    unregisteredOpponents,
    context: {
      orgName: orgRow?.name || teamRow.name,
      squadName: squadLabel,
      categoryLabel:
        categoryOption.value !== "other" ? categoryOption.shortLabel : "",
      areaHint: orgProfile.activityArea || teamRow.homeGround || "",
      leagueSuggestions: Array.from(suggestionSet).slice(0, 15),
    },
  });
});

interface CreateOrUpdateRelatedTeamBody {
  teamId?: string;
  name?: string;
  shortName?: string;
  leagueName?: string;
  relationType?: string;
  teamCategory?: string;
  area?: string;
  homeGround?: string;
  websiteUrl?: string;
  links?: unknown;
  description?: string;
  scope?: "organization" | "team";
  isFavorite?: boolean;
  priority?: number;
}

/**
 * POST /api/liff/related-teams
 */
liffRelatedTeamsRouter.post("/", async (c) => {
  let body: CreateOrUpdateRelatedTeamBody;
  try {
    body = await c.req.json<CreateOrUpdateRelatedTeamBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const teamId = (body.teamId || "").trim();
  const name = (body.name || "").trim().slice(0, MAX_RELATED_TEAM_NAME_LENGTH);
  if (!name) {
    return c.json({ success: false, error: "チーム名を入力してください" }, 400);
  }

  const rawWebsite = normalizeHttpUrlInput(body.websiteUrl || "");
  const websiteCheck = validateSafeHttpUrl(rawWebsite, { allowEmpty: true });
  if (!websiteCheck.ok) {
    return c.json({ success: false, error: `公式サイトURL: ${websiteCheck.error}` }, 400);
  }

  const linksCheck = validateAndNormalizeRelatedTeamLinks(body.links);
  if (!linksCheck.ok) {
    return c.json({ success: false, error: linksCheck.error }, 400);
  }

  const shortName = (body.shortName || "")
    .trim()
    .slice(0, MAX_RELATED_TEAM_SHORT_NAME_LENGTH);
  const leagueName = (body.leagueName || "")
    .trim()
    .slice(0, MAX_RELATED_TEAM_LEAGUE_LENGTH);
  const relationType = normalizeRelationType(body.relationType);
  const teamCategory = (body.teamCategory || "").trim().slice(0, 40);
  const area = (body.area || "").trim().slice(0, MAX_RELATED_TEAM_AREA_LENGTH);
  const homeGround = (body.homeGround || "")
    .trim()
    .slice(0, MAX_RELATED_TEAM_GROUND_LENGTH);
  const description = (body.description || "")
    .trim()
    .slice(0, MAX_RELATED_TEAM_DESC_LENGTH);
  const scope: "organization" | "team" =
    body.scope === "team" ? "team" : "organization";
  const isFavorite = Boolean(body.isFavorite);
  const priority =
    typeof body.priority === "number" && Number.isFinite(body.priority)
      ? Math.max(-100, Math.min(1000, Math.trunc(body.priority)))
      : 0;

  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      id: `demo-rt-${Date.now()}`,
    });
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canMutateTeamData(teamId)) {
    return c.json({ success: false, error: "変更権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const teamRow = await db
    .select({ id: teams.id, organizationId: teams.organizationId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .get();

  if (!teamRow) {
    return c.json({ success: false, error: "対象チームが見つかりません" }, 404);
  }

  const effectiveScope: "organization" | "team" =
    scope === "organization" && teamRow.organizationId ? "organization" : "team";

  const newId = crypto.randomUUID();
  const now = new Date();

  await db.insert(relatedTeams).values({
    id: newId,
    organizationId:
      effectiveScope === "organization" ? teamRow.organizationId : null,
    teamId: effectiveScope === "team" ? teamId : teamRow.organizationId ? null : teamId,
    name,
    shortName: shortName || null,
    leagueName: leagueName || null,
    relationType,
    teamCategory: teamCategory || null,
    area: area || null,
    homeGround: homeGround || null,
    websiteUrl: websiteCheck.url || null,
    linksJson: serializeRelatedTeamLinksJson(linksCheck.links),
    description: description || null,
    scope: effectiveScope,
    isFavorite,
    priority,
    createdById: access.primaryUserId || null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ success: true, id: newId });
});

interface BulkCreateRelatedTeamsBody {
  teamId?: string;
  scope?: "organization" | "team";
  defaultLeagueName?: string;
  defaultRelationType?: string;
  items?: Array<{
    name?: string;
    shortName?: string;
    leagueName?: string;
    relationType?: string;
    teamCategory?: string;
    area?: string;
    homeGround?: string;
    websiteUrl?: string;
    links?: unknown;
    description?: string;
  }>;
}

/**
 * POST /api/liff/related-teams/bulk
 * AI一括収集や過去の試合相手リストからの一括登録（重複チーム名は自動スキップ）
 */
liffRelatedTeamsRouter.post("/bulk", async (c) => {
  let body: BulkCreateRelatedTeamsBody;
  try {
    body = await c.req.json<BulkCreateRelatedTeamsBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const teamId = (body.teamId || "").trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return c.json(
      { success: false, error: "登録するチームを1件以上選択してください" },
      400
    );
  }
  if (rawItems.length > 60) {
    return c.json(
      { success: false, error: "一度に一括登録できるのは最大60チームまでです" },
      400
    );
  }

  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      createdCount: rawItems.length,
      skippedCount: 0,
    });
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canMutateTeamData(teamId)) {
    return c.json({ success: false, error: "変更権限がありません" }, 403);
  }

  const db = drizzle(c.env.DB);
  const teamRow = await db
    .select({ id: teams.id, organizationId: teams.organizationId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .get();

  if (!teamRow) {
    return c.json({ success: false, error: "対象チームが見つかりません" }, 404);
  }

  const orgId = teamRow.organizationId;
  const existingRows = await db
    .select({ name: relatedTeams.name, shortName: relatedTeams.shortName })
    .from(relatedTeams)
    .where(
      orgId
        ? or(
            eq(relatedTeams.teamId, teamId),
            eq(relatedTeams.organizationId, orgId)
          )
        : eq(relatedTeams.teamId, teamId)
    )
    .all();

  const seenKeys = new Set<string>();
  for (const ex of existingRows) {
    const k = normalizeOpponentMatchKey(ex.name);
    if (k) seenKeys.add(k);
  }

  const requestedScope: "organization" | "team" =
    body.scope === "team" ? "team" : "organization";
  const effectiveScope: "organization" | "team" =
    requestedScope === "organization" && orgId ? "organization" : "team";
  const defaultLeague = (body.defaultLeagueName || "")
    .trim()
    .slice(0, MAX_RELATED_TEAM_LEAGUE_LENGTH);
  const defaultRelType = normalizeRelationType(body.defaultRelationType);

  const now = new Date();
  const rowsToInsert: Array<typeof relatedTeams.$inferInsert> = [];
  let skippedCount = 0;

  for (const item of rawItems) {
    const name = (item?.name || "").trim().slice(0, MAX_RELATED_TEAM_NAME_LENGTH);
    if (!name) continue;

    const normKey = normalizeOpponentMatchKey(name);
    if (!normKey || seenKeys.has(normKey)) {
      skippedCount += 1;
      continue;
    }
    seenKeys.add(normKey);

    const rawWeb = normalizeHttpUrlInput(item.websiteUrl || "");
    const webCheck = validateSafeHttpUrl(rawWeb, { allowEmpty: true });
    const safeWebUrl = webCheck.ok ? webCheck.url || null : null;

    const linksCheck = validateAndNormalizeRelatedTeamLinks(item.links);
    const safeLinks = linksCheck.ok ? linksCheck.links : [];

    const leagueName = (item.leagueName || defaultLeague)
      .trim()
      .slice(0, MAX_RELATED_TEAM_LEAGUE_LENGTH);
    const relationType = item.relationType
      ? normalizeRelationType(item.relationType, defaultRelType)
      : defaultRelType;

    rowsToInsert.push({
      id: crypto.randomUUID(),
      organizationId: effectiveScope === "organization" ? orgId : null,
      teamId: effectiveScope === "team" ? teamId : orgId ? null : teamId,
      name,
      shortName:
        (item.shortName || "")
          .trim()
          .slice(0, MAX_RELATED_TEAM_SHORT_NAME_LENGTH) || null,
      leagueName: leagueName || null,
      relationType,
      teamCategory: (item.teamCategory || "").trim().slice(0, 40) || null,
      area:
        (item.area || "").trim().slice(0, MAX_RELATED_TEAM_AREA_LENGTH) || null,
      homeGround:
        (item.homeGround || "")
          .trim()
          .slice(0, MAX_RELATED_TEAM_GROUND_LENGTH) || null,
      websiteUrl: safeWebUrl,
      linksJson: serializeRelatedTeamLinksJson(safeLinks),
      description:
        (item.description || "")
          .trim()
          .slice(0, MAX_RELATED_TEAM_DESC_LENGTH) || null,
      scope: effectiveScope,
      isFavorite: false,
      priority: 0,
      createdById: access.primaryUserId || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // D1 の SQLite バインド変数上限（100パラメータ）を確実に下回るよう4行ずつチャンク挿入（17列×4=68変数）
  const CHUNK_SIZE = 4;
  for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
    await db.insert(relatedTeams).values(chunk);
  }

  return c.json({
    success: true,
    createdCount: rowsToInsert.length,
    skippedCount,
  });
});

/**
 * PUT /api/liff/related-teams/:id
 */
liffRelatedTeamsRouter.put("/:id", async (c) => {
  const id = (c.req.param("id") || "").trim();
  if (!id) {
    return c.json({ success: false, error: "IDが指定されていません" }, 400);
  }

  let body: CreateOrUpdateRelatedTeamBody;
  try {
    body = await c.req.json<CreateOrUpdateRelatedTeamBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const teamId = (body.teamId || "").trim();

  if (teamId === "demo-team" || id.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true });
  }

  const access = await resolveCallerTeamAccess(c);
  const db = drizzle(c.env.DB);

  const canOwn = await verifyScopedRecordOwnership(
    db,
    access,
    "related_team",
    id,
    teamId || undefined
  );
  if (!canOwn || (teamId && !access.canMutateTeamData(teamId))) {
    return c.json({ success: false, error: "このデータへの変更権限がありません" }, 403);
  }

  const existing = await db
    .select()
    .from(relatedTeams)
    .where(eq(relatedTeams.id, id))
    .get();
  if (!existing) {
    return c.json({ success: false, error: "対象の関連チームが見つかりません" }, 404);
  }

  const updateFields: Partial<typeof relatedTeams.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    const name = body.name.trim().slice(0, MAX_RELATED_TEAM_NAME_LENGTH);
    if (!name) {
      return c.json({ success: false, error: "チーム名を入力してください" }, 400);
    }
    updateFields.name = name;
  }

  if (body.shortName !== undefined) {
    updateFields.shortName =
      body.shortName.trim().slice(0, MAX_RELATED_TEAM_SHORT_NAME_LENGTH) || null;
  }

  if (body.leagueName !== undefined) {
    updateFields.leagueName =
      body.leagueName.trim().slice(0, MAX_RELATED_TEAM_LEAGUE_LENGTH) || null;
  }

  if (body.relationType !== undefined) {
    updateFields.relationType = normalizeRelationType(body.relationType);
  }

  if (body.teamCategory !== undefined) {
    updateFields.teamCategory = body.teamCategory.trim().slice(0, 40) || null;
  }

  if (body.area !== undefined) {
    updateFields.area =
      body.area.trim().slice(0, MAX_RELATED_TEAM_AREA_LENGTH) || null;
  }

  if (body.homeGround !== undefined) {
    updateFields.homeGround =
      body.homeGround.trim().slice(0, MAX_RELATED_TEAM_GROUND_LENGTH) || null;
  }

  if (body.websiteUrl !== undefined) {
    const rawWebsite = normalizeHttpUrlInput(body.websiteUrl);
    const websiteCheck = validateSafeHttpUrl(rawWebsite, { allowEmpty: true });
    if (!websiteCheck.ok) {
      return c.json(
        { success: false, error: `公式サイトURL: ${websiteCheck.error}` },
        400
      );
    }
    updateFields.websiteUrl = websiteCheck.url || null;
  }

  if (body.links !== undefined) {
    const linksCheck = validateAndNormalizeRelatedTeamLinks(body.links);
    if (!linksCheck.ok) {
      return c.json({ success: false, error: linksCheck.error }, 400);
    }
    updateFields.linksJson = serializeRelatedTeamLinksJson(linksCheck.links);
  }

  if (body.description !== undefined) {
    updateFields.description =
      body.description.trim().slice(0, MAX_RELATED_TEAM_DESC_LENGTH) || null;
  }

  if (body.isFavorite !== undefined) {
    updateFields.isFavorite = Boolean(body.isFavorite);
  }

  if (
    body.priority !== undefined &&
    typeof body.priority === "number" &&
    Number.isFinite(body.priority)
  ) {
    updateFields.priority = Math.max(-100, Math.min(1000, Math.trunc(body.priority)));
  }

  if (body.scope !== undefined && teamId) {
    const teamRow = await db
      .select({ organizationId: teams.organizationId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();
    if (teamRow) {
      const nextScope: "organization" | "team" =
        body.scope === "organization" && teamRow.organizationId
          ? "organization"
          : "team";
      updateFields.scope = nextScope;
      updateFields.organizationId =
        nextScope === "organization" ? teamRow.organizationId : null;
      updateFields.teamId =
        nextScope === "team" ? teamId : teamRow.organizationId ? null : teamId;
    }
  }

  await db
    .update(relatedTeams)
    .set(updateFields)
    .where(eq(relatedTeams.id, id));

  return c.json({ success: true });
});

/**
 * DELETE /api/liff/related-teams/:id?teamId=...
 */
liffRelatedTeamsRouter.delete("/:id", async (c) => {
  const id = (c.req.param("id") || "").trim();
  const teamId = (c.req.query("teamId") || "").trim();

  if (!id) {
    return c.json({ success: false, error: "IDが指定されていません" }, 400);
  }

  if (teamId === "demo-team" || id.startsWith("demo-")) {
    return c.json({ success: true, isDemo: true });
  }

  const access = await resolveCallerTeamAccess(c);
  const db = drizzle(c.env.DB);

  const canOwn = await verifyScopedRecordOwnership(
    db,
    access,
    "related_team",
    id,
    teamId || undefined
  );
  if (!canOwn || (teamId && !access.canMutateTeamData(teamId))) {
    return c.json({ success: false, error: "削除権限がありません" }, 403);
  }

  await db.delete(relatedTeams).where(eq(relatedTeams.id, id));
  return c.json({ success: true });
});

interface AiDiscoverRequestBody {
  teamId?: string;
  query?: string;
  sourceUrl?: string;
  areaHint?: string;
  categoryHint?: string;
}

/**
 * POST /api/liff/related-teams/ai-discover
 * 連盟名・大会名・地域名 または 連盟の加盟チーム一覧URL から関連チームを一括AI調査
 */
liffRelatedTeamsRouter.post("/ai-discover", async (c) => {
  let body: AiDiscoverRequestBody;
  try {
    body = await c.req.json<AiDiscoverRequestBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const teamId = (body.teamId || "").trim();
  const query = (body.query || "").trim().slice(0, 120);
  const sourceUrl = (body.sourceUrl || "").trim();
  const areaHint = (body.areaHint || "").trim().slice(0, 80);
  const categoryHint = (body.categoryHint || "").trim().slice(0, 60);

  if (!query && !sourceUrl) {
    return c.json(
      {
        success: false,
        error: "調査したい「連盟・大会・地域名」または「一覧ページのURL」を入力してください",
      },
      400
    );
  }

  if (!teamId || teamId === "demo-team") {
    return c.json(
      {
        success: false,
        error:
          "デモモードではAI自動収集を実行できません。チームに参加または作成してからご利用ください",
      },
      403
    );
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated || !access.canMutateTeamData(teamId)) {
    return c.json(
      {
        success: false,
        error: "AIチーム収集を利用するには編集権限のあるメンバーでログインが必要です",
      },
      403
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

  const db = drizzle(c.env.DB);
  const teamRow = await db
    .select({
      id: teams.id,
      name: teams.name,
      organizationId: teams.organizationId,
      homeGround: teams.homeGround,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .get();

  if (!teamRow) {
    return c.json({ success: false, error: "対象チームが見つかりません" }, 404);
  }

  const orgId = teamRow.organizationId;
  const [orgRow, existingRelated] = await Promise.all([
    orgId
      ? db
          .select({
            name: organizations.name,
            shortName: organizations.shortName,
            category: organizations.category,
            profileJson: organizations.profileJson,
          })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .get()
      : Promise.resolve(undefined),
    db
      .select({ name: relatedTeams.name, shortName: relatedTeams.shortName })
      .from(relatedTeams)
      .where(
        orgId
          ? or(
              eq(relatedTeams.teamId, teamId),
              eq(relatedTeams.organizationId, orgId)
            )
          : eq(relatedTeams.teamId, teamId)
      )
      .all(),
  ]);

  const existingKeys = new Set<string>();
  for (const row of existingRelated) {
    const k = normalizeOpponentMatchKey(row.name);
    if (k) existingKeys.add(k);
  }
  const ownKeys = new Set<string>();
  for (const n of [orgRow?.name, orgRow?.shortName, teamRow.name]) {
    const k = normalizeOpponentMatchKey(n);
    if (k) ownKeys.add(k);
  }

  const orgProfile = parseOrganizationProfileDetails(orgRow?.profileJson);
  const catOpt = resolveTeamCategoryOption(orgRow?.category);
  const effectiveCategory =
    categoryHint || (catOpt.value !== "other" ? catOpt.label : "");
  const effectiveArea =
    areaHint || orgProfile.activityArea || teamRow.homeGround || "";

  let pageDigest:
    | {
        finalUrl: string;
        pageTitle: string;
        textSnippet: string;
        extractedLinks: Array<{ label: string; url: string }>;
      }
    | null = null;

  if (sourceUrl) {
    const fetched = await fetchPublicLeaguePageDigest(sourceUrl);
    if (!fetched.ok) {
      return c.json({ success: false, error: fetched.error }, 400);
    }
    pageDigest = {
      finalUrl: fetched.finalUrl,
      pageTitle: fetched.pageTitle,
      textSnippet: fetched.textSnippet,
      extractedLinks: fetched.extractedLinks,
    };
  }

  const cacheKey = [
    query.toLowerCase(),
    pageDigest?.finalUrl.toLowerCase() || "",
    effectiveArea.toLowerCase(),
    effectiveCategory.toLowerCase(),
  ].join("::");

  const applyRegistrationFlags = (
    items: ReadonlyArray<AiDiscoveredTeamCandidate>
  ): AiDiscoveredTeamCandidate[] =>
    items
      .filter((item) => !ownKeys.has(normalizeOpponentMatchKey(item.name)))
      .map((item) => ({
        ...item,
        alreadyRegistered: existingKeys.has(normalizeOpponentMatchKey(item.name)),
      }));

  const cached = DISCOVER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json({
      ...cached.payload,
      candidates: applyRegistrationFlags(cached.payload.candidates),
    });
  }

  const inflight = INFLIGHT_DISCOVER.get(cacheKey);
  if (inflight) {
    try {
      const shared = await inflight;
      return c.json({
        ...shared,
        candidates: applyRegistrationFlags(shared.candidates),
      });
    } catch {
      // fall through
    }
  }

  const runDiscoverFlow = async () => {
    const contextLines: string[] = [];
    if (query) {
      contextLines.push(`- 調査対象の連盟・団体・大会・キーワード: ${query}`);
    }
    if (effectiveArea) {
      contextLines.push(`- 活動地域ヒント: ${effectiveArea}`);
    }
    if (effectiveCategory) {
      contextLines.push(`- 競技カテゴリヒント: ${effectiveCategory}`);
    }
    if (orgRow?.name) {
      contextLines.push(`- 自クラブ名（出力から除外）: ${orgRow.name}`);
    }

    const pageSectionLines: string[] = [];
    if (pageDigest) {
      pageSectionLines.push(
        "",
        "【ユーザー指定ページの直接取得データ（最優先の一次情報）】",
        `- 取得元URL: ${pageDigest.finalUrl}`,
        `- ページタイトル: ${pageDigest.pageTitle || "なし"}`
      );
      if (pageDigest.extractedLinks.length > 0) {
        pageSectionLines.push(
          "- ページ内から抽出された実在リンク一覧:",
          ...pageDigest.extractedLinks
            .slice(0, 75)
            .map((lk) => `  * [${lk.label}] -> ${lk.url}`)
        );
      }
      if (pageDigest.textSnippet) {
        pageSectionLines.push(
          "- ページ本文テキスト抜粋:",
          pageDigest.textSnippet
        );
      }
    }

    const prompt = [
      "あなたは日本の野球（学童軟式・中学軟式/硬式・ボーイズ・シニア・ヤング・高校・大学・草野球）の連盟・加盟チーム調査の専門アシスタントです。",
      pageDigest
        ? "提供された公式Webページ内容（および必要に応じたGoogle検索）から、加盟・参加している実在の野球チーム一覧を正確に抽出し、JSONで返してください。"
        : "Google検索を用いて、指定された野球連盟・協会・大会・地域に加盟または所属している実在の野球チーム一覧を調査し、JSONで返してください。",
      "",
      "【調査コンテキスト】",
      ...contextLines,
      ...pageSectionLines,
      "",
      "【厳守ルール（ハルシネーション絶対禁止）】",
      "1. 実在が裏付けられたチームのみを出力してください。架空のチーム名（「〇〇ベアーズ」「サンプルズ」等の推測生成）は絶対に混ぜないでください。",
      "2. URLの厳格ルール: `websiteUrl`（公式サイト・代表紹介ページ）および `links`（Instagram / YouTube / X / LINE / Facebook / ブログ・部員募集ページ）には、Web検索結果または指定ページ内の実在リンクで【明確に確認できた実在URLのみ】を設定してください。URLを推測・創作することは絶対禁止です（未確認の場合は空文字 \"\" または空配列 [] にしてください）。",
      "3. 最大30チームまで抽出し、各チームの活動エリア（市区町村や小学校区等）や主な拠点グラウンドが分かる場合は簡潔に記載してください。",
      "4. 出力は説明文やマークダウンを含めず、以下の純粋なJSONオブジェクト1つのみを返してください:",
      "{",
      '  "leagueTitle": "特定された正式な連盟・団体・グループ名（例: 〇〇市学童軟式野球連盟）",',
      '  "summaryNote": "調査元の根拠・抽出件数の1行要約",',
      '  "candidates": [',
      "    {",
      '      "name": "正式チーム名",',
      '      "shortName": "略称（4〜8文字程度、不明なら空文字）",',
      '      "leagueName": "所属連盟・ブロック名",',
      '      "area": "活動地域（例: 〇〇県〇〇市〇〇区、不明なら空文字）",',
      '      "homeGround": "主な練習拠点・小学校・球場名（不明なら空文字）",',
      '      "description": "チームの特徴・学年構成・所属支部などの簡潔な1行メモ（不明なら空文字）",',
      '      "websiteUrl": "確認できた公式サイトURL（未確認なら空文字）",',
      '      "links": [',
      '        { "label": "Instagram", "url": "確認できた実在URL" }',
      "      ],",
      '      "confidence": "high | medium | low"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const aiRes = await executeGeminiJsonPrompt({
      apiKey,
      basePrompt: prompt,
      // 指定ページ本文で十分なリンクとテキストが取れている場合でも、Google検索で各チームのInstagram/公式HPが補完できるよう検索優先で実行
      preferPlainJsonFirst: false,
      maxBudgetMs: 44_000,
    });

    if (!aiRes.ok) {
      return aiRes;
    }

    const resolvedLeagueTitle =
      cleanAiString(aiRes.json.leagueTitle, MAX_RELATED_TEAM_LEAGUE_LENGTH) ||
      query ||
      pageDigest?.pageTitle ||
      "関連チーム";
    const summaryNote = cleanAiString(aiRes.json.summaryNote, 200);

    const rawCandidates = Array.isArray(aiRes.json.candidates)
      ? aiRes.json.candidates
      : [];
    const candidates: AiDiscoveredTeamCandidate[] = [];
    const seenCandidateKeys = new Set<string>();

    for (let i = 0; i < rawCandidates.length; i += 1) {
      if (candidates.length >= 35) break;
      const entry = rawCandidates[i];
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;

      const name = cleanAiString(rec.name, MAX_RELATED_TEAM_NAME_LENGTH);
      if (!name) continue;

      const normKey = normalizeOpponentMatchKey(name);
      if (!normKey || seenCandidateKeys.has(normKey)) continue;
      seenCandidateKeys.add(normKey);

      const websiteUrl = sanitizeAiUrl(rec.websiteUrl);
      const links = sanitizeAiLinks(rec.links, websiteUrl);
      const rawConf = cleanAiString(rec.confidence, 12).toLowerCase();
      const confidence: "high" | "medium" | "low" =
        rawConf === "high" || rawConf === "low" ? rawConf : "medium";

      candidates.push({
        tempId: `cand_${i + 1}_${Date.now().toString(36)}`,
        name,
        shortName: cleanAiString(
          rec.shortName,
          MAX_RELATED_TEAM_SHORT_NAME_LENGTH
        ),
        leagueName:
          cleanAiString(rec.leagueName, MAX_RELATED_TEAM_LEAGUE_LENGTH) ||
          resolvedLeagueTitle,
        relationType: "league_member" as RelatedTeamRelationType,
        area: cleanAiString(rec.area, MAX_RELATED_TEAM_AREA_LENGTH),
        homeGround: cleanAiString(
          rec.homeGround,
          MAX_RELATED_TEAM_GROUND_LENGTH
        ),
        description: cleanAiString(
          rec.description,
          MAX_RELATED_TEAM_DESC_LENGTH
        ),
        websiteUrl,
        links,
        confidence,
        alreadyRegistered: false,
      });
    }

    const mergedSources: RelatedTeamAiSourceLink[] = [];
    if (pageDigest) {
      mergedSources.push({
        title: pageDigest.pageTitle || new URL(pageDigest.finalUrl).hostname,
        url: pageDigest.finalUrl,
      });
    }
    for (const src of aiRes.sources) {
      if (
        !mergedSources.some(
          (s) => s.url.toLowerCase() === src.url.toLowerCase()
        )
      ) {
        mergedSources.push(src);
      }
    }

    const payload = {
      success: true as const,
      model: aiRes.model,
      grounded: aiRes.grounded || Boolean(pageDigest),
      sourcePageFetched: Boolean(pageDigest),
      leagueTitle: resolvedLeagueTitle,
      summaryNote,
      candidates,
      sources: mergedSources.slice(0, 8),
    };

    if (candidates.length > 0) {
      if (DISCOVER_CACHE.size >= 60) {
        const oldest = DISCOVER_CACHE.keys().next().value;
        if (oldest) DISCOVER_CACHE.delete(oldest);
      }
      DISCOVER_CACHE.set(cacheKey, {
        expiresAt: Date.now() + 20 * 60_000,
        payload,
      });
    }

    return { ok: true as const, payload };
  };

  const execPromise = runDiscoverFlow();
  const sharedPromise = execPromise.then((r) => {
    if (!r.ok) throw new Error(r.error);
    return r.payload;
  });
  INFLIGHT_DISCOVER.set(cacheKey, sharedPromise);
  sharedPromise.catch(() => undefined);

  try {
    const outcome = await execPromise;
    if (!outcome.ok) {
      return c.json({ success: false, error: outcome.error }, outcome.status);
    }
    return c.json({
      ...outcome.payload,
      candidates: applyRegistrationFlags(outcome.payload.candidates),
    });
  } finally {
    INFLIGHT_DISCOVER.delete(cacheKey);
  }
});

interface AiLookupSingleBody {
  teamId?: string;
  name?: string;
  leagueHint?: string;
  areaHint?: string;
  categoryHint?: string;
}

/**
 * POST /api/liff/related-teams/ai-lookup
 * 単一チームの公式サイト・Instagram・活動拠点・所属連盟をAI検索で自動補完
 */
liffRelatedTeamsRouter.post("/ai-lookup", async (c) => {
  let body: AiLookupSingleBody;
  try {
    body = await c.req.json<AiLookupSingleBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const teamId = (body.teamId || "").trim();
  const inputName = (body.name || "").trim().slice(0, MAX_RELATED_TEAM_NAME_LENGTH);
  const leagueHint = (body.leagueHint || "").trim().slice(0, 80);
  const areaHint = (body.areaHint || "").trim().slice(0, 80);
  const categoryHint = (body.categoryHint || "").trim().slice(0, 60);

  if (!inputName) {
    return c.json(
      { success: false, error: "チーム名を入力してからAI検索を実行してください" },
      400
    );
  }

  if (!teamId || teamId === "demo-team") {
    return c.json(
      {
        success: false,
        error:
          "デモモードではAI自動取得を実行できません。チームに参加または作成してからご利用ください",
      },
      403
    );
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated || !access.canMutateTeamData(teamId)) {
    return c.json(
      {
        success: false,
        error: "AI検索を利用するには編集権限のあるメンバーでログインが必要です",
      },
      403
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

  const db = drizzle(c.env.DB);
  const teamRow = await db
    .select({
      organizationId: teams.organizationId,
      homeGround: teams.homeGround,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .get();

  const orgRow = teamRow?.organizationId
    ? await db
        .select({
          category: organizations.category,
          profileJson: organizations.profileJson,
        })
        .from(organizations)
        .where(eq(organizations.id, teamRow.organizationId))
        .get()
    : undefined;

  const orgProfile = parseOrganizationProfileDetails(orgRow?.profileJson);
  const catOpt = resolveTeamCategoryOption(orgRow?.category);

  const effectiveArea =
    areaHint || orgProfile.activityArea || teamRow?.homeGround || "";
  const effectiveLeague =
    leagueHint || (orgProfile.affiliatedLeagues[0] ?? "");
  const effectiveCategory =
    categoryHint || (catOpt.value !== "other" ? catOpt.label : "");

  const cacheKey = [
    inputName.toLowerCase(),
    effectiveLeague.toLowerCase(),
    effectiveArea.toLowerCase(),
    effectiveCategory.toLowerCase(),
  ].join("::");

  const cached = LOOKUP_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.payload);
  }

  const inflight = INFLIGHT_LOOKUP.get(cacheKey);
  if (inflight) {
    try {
      const shared = await inflight;
      return c.json(shared);
    } catch {
      // fall through
    }
  }

  const runSingleLookup = async () => {
    const contextLines = [`- 調査対象のチーム名: ${inputName}`];
    if (effectiveArea) {
      contextLines.push(
        `- 活動地域ヒント（同名チームが他県にある場合の優先地域）: ${effectiveArea}`
      );
    }
    if (effectiveLeague) {
      contextLines.push(`- 関連連盟ヒント: ${effectiveLeague}`);
    }
    if (effectiveCategory) {
      contextLines.push(`- 競技種別ヒント: ${effectiveCategory}`);
    }

    const prompt = [
      "あなたは日本の野球チーム（学童・少年野球・中学硬式/軟式・高校・大学・草野球）の公式情報リサーチ専門官です。",
      "Google検索を用いて、指定された野球チームの公式ホームページ、Instagram・YouTube・X（旧Twitter）・Facebook・部員募集ブログ、所属連盟、活動地域、主な練習拠点を調査し、JSONで返してください。",
      "",
      "【調査対象】",
      ...contextLines,
      "",
      "【厳守ルール（URLハルシネーション絶対禁止）】",
      "1. 同名のチームが全国に複数ある場合は、地域ヒント・連盟ヒント・競技種別ヒントに合致するチームの情報のみを採用し、別地域の同名チームの情報を混ぜないでください。",
      "2. `websiteUrl` および `links` には、Google検索で実在が確認できたURLのみを記載してください。URLの推測・創作は絶対禁止です（見つからない場合は空文字 \"\" または空配列 [] にしてください）。",
      "3. 出力は説明文やマークダウンを含めず、以下の純粋なJSONオブジェクト1つのみを返してください:",
      "{",
      '  "name": "正式なチーム名",',
      '  "shortName": "スコアボード等向けの4〜8文字の略称",',
      '  "leagueName": "所属連盟・協会名（不明なら空文字）",',
      '  "area": "活動地域・市区町村（例: 神奈川県川崎市高津区、不明なら空文字）",',
      '  "homeGround": "主な練習拠点・ホームグラウンド・小学校名（不明なら空文字）",',
      '  "description": "創部・活動方針・対象学年・特徴などの簡潔な紹介文（120文字以内、不明なら空文字）",',
      '  "websiteUrl": "公式サイト・チーム代表ページの実在URL（未確認なら空文字）",',
      '  "links": [',
      '    { "label": "Instagram", "url": "確認できた実在URL" }',
      "  ],",
      '  "confidence": "high | medium | low",',
      '  "summaryNote": "特定したチーム・情報源の1行要約"',
      "}",
    ].join("\n");

    const aiRes = await executeGeminiJsonPrompt({
      apiKey,
      basePrompt: prompt,
      maxBudgetMs: 40_000,
    });

    if (!aiRes.ok) {
      return aiRes;
    }

    const websiteUrl = sanitizeAiUrl(aiRes.json.websiteUrl);
    const links = sanitizeAiLinks(aiRes.json.links, websiteUrl);
    const rawConf = cleanAiString(aiRes.json.confidence, 12).toLowerCase();
    const confidence: "high" | "medium" | "low" =
      rawConf === "high" || rawConf === "low" ? rawConf : "medium";

    const candidate: RelatedTeamAiLookupResult = {
      name:
        cleanAiString(aiRes.json.name, MAX_RELATED_TEAM_NAME_LENGTH) ||
        inputName,
      shortName: cleanAiString(
        aiRes.json.shortName,
        MAX_RELATED_TEAM_SHORT_NAME_LENGTH
      ),
      leagueName: cleanAiString(
        aiRes.json.leagueName,
        MAX_RELATED_TEAM_LEAGUE_LENGTH
      ),
      area: cleanAiString(aiRes.json.area, MAX_RELATED_TEAM_AREA_LENGTH),
      homeGround: cleanAiString(
        aiRes.json.homeGround,
        MAX_RELATED_TEAM_GROUND_LENGTH
      ),
      description: cleanAiString(
        aiRes.json.description,
        MAX_RELATED_TEAM_DESC_LENGTH
      ),
      websiteUrl,
      links,
      confidence,
      summaryNote: cleanAiString(aiRes.json.summaryNote, 200),
      sources: aiRes.sources,
    };

    const payload = {
      success: true as const,
      model: aiRes.model,
      grounded: aiRes.grounded,
      candidate,
    };

    if (LOOKUP_CACHE.size >= 80) {
      const oldest = LOOKUP_CACHE.keys().next().value;
      if (oldest) LOOKUP_CACHE.delete(oldest);
    }
    LOOKUP_CACHE.set(cacheKey, {
      expiresAt: Date.now() + 20 * 60_000,
      payload,
    });

    return { ok: true as const, payload };
  };

  const execPromise = runSingleLookup();
  const sharedPromise = execPromise.then((r) => {
    if (!r.ok) throw new Error(r.error);
    return r.payload;
  });
  INFLIGHT_LOOKUP.set(cacheKey, sharedPromise);
  sharedPromise.catch(() => undefined);

  try {
    const outcome = await execPromise;
    if (!outcome.ok) {
      return c.json({ success: false, error: outcome.error }, outcome.status);
    }
    return c.json(outcome.payload);
  } finally {
    INFLIGHT_LOOKUP.delete(cacheKey);
  }
});

export default liffRelatedTeamsRouter;
