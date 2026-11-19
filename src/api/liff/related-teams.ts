// filepath: src/api/liff/related-teams.ts
import { Hono } from "hono";
import { and, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  matches,
  organizations,
  relatedTeams,
  teams,
} from "@/db/schema";
import {
  parseOrganizationProfileDetails,
  resolveTeamCategoryOption,
} from "@/lib/liff/team-profile-schema";
import {
  MAX_LINKS_PER_RELATED_TEAM,
  MAX_RELATED_TEAM_AREA_LENGTH,
  MAX_RELATED_TEAM_DESC_LENGTH,
  MAX_RELATED_TEAM_GROUND_LENGTH,
  MAX_RELATED_TEAM_LEAGUE_LENGTH,
  MAX_RELATED_TEAM_NAME_LENGTH,
  MAX_RELATED_TEAM_SHORT_NAME_LENGTH,
  createRelatedTeamLinkId,
  extractCanonicalSnsIdentity,
  extractOpponentMatchKeys,
  getRelatedTeamLinkKindDefaultLabel,
  getRelationShortLabel,
  hasSoft404HtmlSignature,
  inferRelatedTeamLinkKind,
  isPlaceholderOpponentName,
  isPlatformOfficialSnsAccount,
  isSafePublicFetchUrl,
  isSuspiciousGenericSnsHandle,
  isUselessAiTeamUrl,
  normalizeOpponentMatchKey,
  normalizeRelatedTeamLinkUrlInput,
  normalizeRelationType,
  parseOrSalvageAiJsonObject,
  parseRelatedTeamLinksJson,
  serializeRelatedTeamLinksJson,
  stripSquadSuffixFromMatchKey,
  validateAndNormalizeRelatedTeamLinks,
  type AiDiscoveredTeamCandidate,
  type RelatedTeamAiLookupResult,
  type RelatedTeamAiSourceLink,
  type RelatedTeamItem,
  type RelatedTeamLinkItem,
  type RelatedTeamLinkKind,
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
    webSearchQueries?: string[];
    searchEntryPoint?: unknown;
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

interface VerifiedUrlOutcome {
  verifiedUrl: string | null;
  discoveredSnsLinks: RelatedTeamLinkItem[];
}

const LIVE_URL_VERIFY_CACHE = new Map<
  string,
  {
    expiresAt: number;
    verifiedUrl: string | null;
    discoveredSnsLinks: RelatedTeamLinkItem[];
  }
>();

const VERIFIER_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function normalizeComparableUrlKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path.toLowerCase()}${u.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function isBotWalledSnsHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return (
      host === "instagram.com" ||
      host === "www.instagram.com" ||
      host === "m.instagram.com" ||
      host === "instagr.am" ||
      host === "x.com" ||
      host === "www.x.com" ||
      host === "twitter.com" ||
      host === "www.twitter.com" ||
      host === "mobile.twitter.com" ||
      host === "facebook.com" ||
      host === "www.facebook.com" ||
      host === "m.facebook.com" ||
      host === "fb.com" ||
      host === "threads.net" ||
      host === "www.threads.net" ||
      host === "tiktok.com" ||
      host === "www.tiktok.com" ||
      host === "line.me" ||
      host === "page.line.me" ||
      host === "lin.ee"
    );
  } catch {
    return false;
  }
}

function sanitizeAiUrl(
  rawUrl: unknown,
  kindHint?: RelatedTeamLinkKind
): string {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  const normalized = normalizeRelatedTeamLinkUrlInput(trimmed, kindHint);
  if (isUselessAiTeamUrl(normalized)) return "";
  const check = isSafePublicFetchUrl(normalized);
  if (!check.ok || !check.url) return "";
  if (isUselessAiTeamUrl(check.url)) return "";
  if (isSuspiciousGenericSnsHandle(check.url)) return "";
  return check.url;
}

function sanitizeAiLinks(
  rawLinks: unknown,
  primaryWebsiteUrl: string
): RelatedTeamLinkItem[] {
  if (!Array.isArray(rawLinks)) return [];
  const out: RelatedTeamLinkItem[] = [];
  const seenUrls = new Set<string>();
  const seenIdentities = new Set<string>();
  if (primaryWebsiteUrl) {
    seenUrls.add(normalizeComparableUrlKey(primaryWebsiteUrl));
    const webIdentity = extractCanonicalSnsIdentity(primaryWebsiteUrl);
    if (webIdentity) seenIdentities.add(webIdentity);
  }

  for (const item of rawLinks) {
    if (out.length >= 10) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const rawLabel = cleanAiString(rec.label, 60);
    const rawKindStr = cleanAiString(rec.kind, 24).toLowerCase();
    const labelInferred = inferRelatedTeamLinkKind("", rawLabel);
    const kindHint: RelatedTeamLinkKind | undefined =
      rawKindStr === "instagram" ||
      rawKindStr === "youtube" ||
      rawKindStr === "x" ||
      rawKindStr === "line" ||
      rawKindStr === "facebook" ||
      rawKindStr === "blog" ||
      rawKindStr === "map" ||
      rawKindStr === "official"
        ? rawKindStr
        : labelInferred !== "other"
          ? labelInferred
          : undefined;

    const cleanUrl = sanitizeAiUrl(rec.url, kindHint);
    if (!cleanUrl) continue;

    const urlKey = normalizeComparableUrlKey(cleanUrl);
    const snsId = extractCanonicalSnsIdentity(cleanUrl);
    if (seenUrls.has(urlKey) || (snsId && seenIdentities.has(snsId))) {
      continue;
    }
    seenUrls.add(urlKey);
    if (snsId) seenIdentities.add(snsId);

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

async function runWithConcurrencyLimit<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= items.length) break;
        results[idx] = await worker(items[idx]);
      }
    }
  );

  await Promise.all(runners);
  return results;
}

function unwrapGoogleUrlQueryIfPresent(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (
      (host === "www.google.com" ||
        host === "google.com" ||
        host === "www.google.co.jp") &&
      parsed.pathname === "/url"
    ) {
      const target =
        parsed.searchParams.get("q") || parsed.searchParams.get("url") || "";
      if (target) return target.trim();
    }
  } catch {
    // keep original
  }
  return rawUrl;
}

/**
 * Gemini Google Search Grounding の内部リダイレクトURL (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`)
 * から実URLへ展開する（Locationヘッダー読取 ＋ 多段リダイレクト follow フォールバック対応）
 */
async function unwrapSingleGroundingUri(rawUri: string): Promise<string | null> {
  const trimmed = unwrapGoogleUrlQueryIfPresent(rawUri.trim());
  if (!trimmed) return null;

  if (!trimmed.includes("vertexaisearch.cloud.google.com/grounding-api-redirect")) {
    const check = isSafePublicFetchUrl(trimmed);
    return check.ok && check.url && !isUselessAiTeamUrl(check.url)
      ? check.url
      : null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(trimmed, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": VERIFIER_BROWSER_UA,
      },
    });
    await res.body?.cancel().catch(() => undefined);
    const loc = (res.headers.get("location") || "").trim();
    if (loc) {
      const resolved = unwrapGoogleUrlQueryIfPresent(
        new URL(loc, trimmed).toString()
      );
      const check = isSafePublicFetchUrl(resolved);
      if (check.ok && check.url && !isUselessAiTeamUrl(check.url)) {
        return check.url;
      }
    }

    // Location ヘッダーが無い（または中間リダイレクトの）場合は follow で最終到達URLを取得しストリーム即破棄
    const followRes = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": VERIFIER_BROWSER_UA,
      },
    });
    await followRes.body?.cancel().catch(() => undefined);
    const followedUrl = unwrapGoogleUrlQueryIfPresent(
      (followRes.url || "").trim()
    );
    const followCheck = isSafePublicFetchUrl(followedUrl);
    if (
      followCheck.ok &&
      followCheck.url &&
      !isUselessAiTeamUrl(followCheck.url)
    ) {
      return followCheck.url;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function extractAndUnwrapGroundingSources(
  chunks: ReadonlyArray<GeminiGroundingChunk>
): Promise<{
  sources: RelatedTeamAiSourceLink[];
  allGroundedUrls: string[];
}> {
  const limited = chunks.slice(0, 30);
  const unwrappedList = await runWithConcurrencyLimit(
    limited,
    10,
    async (chunk) => {
      const uri = (chunk.web?.uri || "").trim();
      if (!uri) return null;
      const finalUrl = await unwrapSingleGroundingUri(uri);
      if (!finalUrl) return null;
      const title =
        (chunk.web?.title || "").trim() || new URL(finalUrl).hostname;
      return {
        title: title.slice(0, 100),
        url: finalUrl,
      };
    }
  );

  const sources: RelatedTeamAiSourceLink[] = [];
  const allGroundedUrls: string[] = [];
  const seen = new Set<string>();

  for (const item of unwrappedList) {
    if (!item) continue;
    allGroundedUrls.push(item.url);
    const key = normalizeComparableUrlKey(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    if (sources.length < 10) {
      sources.push(item);
    }
  }

  return { sources, allGroundedUrls };
}

/**
 * レスポンスボディを先頭 `maxBytes` 分だけストリーム読取し、残りを即時キャンセルしてメモリと時間を節約する
 */
async function readBoundedResponseBytes(
  res: Response,
  maxBytes = 32_768
): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const needed = maxBytes - total;
      if (value.byteLength > needed) {
        chunks.push(value.subarray(0, needed));
        total += needed;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const ch of chunks) {
    merged.set(ch, offset);
    offset += ch.byteLength;
  }
  return merged;
}

function decodeHtmlBytesAutoCharset(
  bytes: Uint8Array,
  contentTypeHeader: string
): string {
  if (bytes.byteLength === 0) return "";
  const asciiPreview = new TextDecoder("latin1").decode(
    bytes.subarray(0, Math.min(bytes.byteLength, 2048))
  );
  const charsetHint = `${contentTypeHeader} ${asciiPreview}`.toLowerCase();
  let encoding: "utf-8" | "shift-jis" | "euc-jp" = "utf-8";
  if (
    charsetHint.includes("shift_jis") ||
    charsetHint.includes("shift-jis") ||
    charsetHint.includes("x-sjis") ||
    charsetHint.includes("windows-31j")
  ) {
    encoding = "shift-jis";
  } else if (charsetHint.includes("euc-jp")) {
    encoding = "euc-jp";
  }
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * 実在確認できたチーム公式HP / 紹介ブログのHTML内から、そのチームが掲載している公式SNSリンク
 * （Instagram / YouTubeチャンネル / X / LINE公式 / Facebook）を自動抽出する（ポータル運営アカウントは除外）
 */
function extractTeamSnsLinksFromHtml(
  htmlSnippet: string,
  basePageUrl: string
): RelatedTeamLinkItem[] {
  if (!htmlSnippet) return [];
  const results: RelatedTeamLinkItem[] = [];
  const seenIdentities = new Set<string>();
  const hrefRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"'#\s]+)["'][^>]*>/gi;

  let match: RegExpExecArray | null = null;
  while ((match = hrefRegex.exec(htmlSnippet)) !== null) {
    if (results.length >= 5) break;
    const rawHref = (match[1] || "")
      .replace(/&amp;/gi, "&")
      .trim();
    if (
      !rawHref ||
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:")
    ) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawHref, basePageUrl).toString();
    } catch {
      continue;
    }

    const clean = sanitizeAiUrl(resolvedUrl);
    if (!clean) continue;
    if (isPlatformOfficialSnsAccount(clean)) continue;

    const kind = inferRelatedTeamLinkKind(clean);
    if (
      kind !== "instagram" &&
      kind !== "youtube" &&
      kind !== "x" &&
      kind !== "line" &&
      kind !== "facebook"
    ) {
      continue;
    }

    // YouTube は個別埋め込み動画へのリンク誤抽出を避け、公式チャンネルURL (`/@...`, `/channel/...`, `/c/...`, `/user/...`) のみを自動抽出
    if (kind === "youtube" && !extractCanonicalSnsIdentity(clean)) {
      continue;
    }

    const dedupeKey =
      extractCanonicalSnsIdentity(clean) || normalizeComparableUrlKey(clean);
    if (seenIdentities.has(dedupeKey)) continue;
    seenIdentities.add(dedupeKey);

    results.push({
      id: createRelatedTeamLinkId(),
      kind,
      label: getRelatedTeamLinkKindDefaultLabel(kind),
      url: clean,
    });
  }

  return results;
}

/**
 * 単一URLに対して実在HTTP応答・リダイレクト先健全性・ソフト404判定・旧式HTTPサイト自動フォールバックを行い、
 * 同時に公式HP内のSNSリンクも自動抽出する
 */
async function verifyLivePublicTeamUrl(
  rawUrl: string,
  options: {
    trustedUrlKeys: ReadonlySet<string>;
    trustedSnsIdentities: ReadonlySet<string>;
    allowSearchBackedSns: boolean;
  }
): Promise<VerifiedUrlOutcome> {
  const cleanUrl = sanitizeAiUrl(rawUrl);
  if (!cleanUrl) {
    return { verifiedUrl: null, discoveredSnsLinks: [] };
  }

  const urlKey = normalizeComparableUrlKey(cleanUrl);
  const snsIdentity = extractCanonicalSnsIdentity(cleanUrl);
  const isEvidenceBacked =
    options.trustedUrlKeys.has(urlKey) ||
    Boolean(snsIdentity && options.trustedSnsIdentities.has(snsIdentity));

  // Google Maps 検索・地点リンクは有効な形式であれば即時許可
  if (inferRelatedTeamLinkKind(cleanUrl) === "map") {
    return { verifiedUrl: cleanUrl, discoveredSnsLinks: [] };
  }

  // Instagram / X / Facebook / LINE 等のデータセンターIPからのGETでログイン画面へ強制転送されるSNSドメイン:
  // サーバーからの直接 fetch を行うと `/accounts/login/` 転送により正常なURLまで誤除外されるため fetch せず、
  // プレースホルダー・不正パス検査を通過し、かつ一次情報またはGoogle検索ツール経由で検出されたURLはそのまま採用する
  if (isBotWalledSnsHost(cleanUrl)) {
    if (isSuspiciousGenericSnsHandle(cleanUrl)) {
      return { verifiedUrl: null, discoveredSnsLinks: [] };
    }
    if (isEvidenceBacked || options.allowSearchBackedSns) {
      return { verifiedUrl: cleanUrl, discoveredSnsLinks: [] };
    }
    return { verifiedUrl: null, discoveredSnsLinks: [] };
  }

  const cached = LIVE_URL_VERIFY_CACHE.get(cleanUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      verifiedUrl: cached.verifiedUrl,
      discoveredSnsLinks: cached.discoveredSnsLinks,
    };
  }

  const cacheResult = (
    verifiedUrl: string | null,
    discoveredSnsLinks: RelatedTeamLinkItem[] = []
  ): VerifiedUrlOutcome => {
    if (LIVE_URL_VERIFY_CACHE.size >= 450) {
      const oldest = LIVE_URL_VERIFY_CACHE.keys().next().value;
      if (oldest) LIVE_URL_VERIFY_CACHE.delete(oldest);
    }
    LIVE_URL_VERIFY_CACHE.set(cleanUrl, {
      expiresAt: Date.now() + 15 * 60_000,
      verifiedUrl,
      discoveredSnsLinks,
    });
    return { verifiedUrl, discoveredSnsLinks };
  };

  const tryFetchWebPage = async (
    targetUrl: string,
    timeoutMs: number
  ): Promise<
    | { status: "ok"; verifiedUrl: string; discoveredSnsLinks: RelatedTeamLinkItem[] }
    | { status: "dead" }
    | { status: "network_error" }
  > => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // 老舗レンタルサーバー (sakura / fc2 / ikz 等) で 416 エラーを起こさないよう Range ヘッダーは付与しない
      const res = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": VERIFIER_BROWSER_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        },
      });

      const finalUrl = (res.url || targetUrl).trim();
      const postRedirectSafe = isSafePublicFetchUrl(finalUrl);
      if (!postRedirectSafe.ok || !postRedirectSafe.url) {
        await res.body?.cancel().catch(() => undefined);
        return { status: "dead" };
      }

      // 削除済みポータルページがポータルサイト自体のトップページや /404 へ転送された場合を遮断
      if (isUselessAiTeamUrl(postRedirectSafe.url)) {
        await res.body?.cancel().catch(() => undefined);
        return { status: "dead" };
      }

      if (
        res.status === 400 ||
        res.status === 404 ||
        res.status === 410 ||
        res.status === 451
      ) {
        await res.body?.cancel().catch(() => undefined);
        return { status: "dead" };
      }

      if (res.status >= 500) {
        await res.body?.cancel().catch(() => undefined);
        // Cloudflare SSL/TLS Handshake Error (525/526) 等は http:// フォールバック対象にする
        return targetUrl.startsWith("https://")
          ? { status: "network_error" }
          : { status: "dead" };
      }

      if (res.status === 403 || res.status === 429) {
        await res.body?.cancel().catch(() => undefined);
        // Wix / Ameblo / Note / 自治体・学校サイト等のデータセンターWAF応答は Google検索・一次情報裏付け時に許可
        const finalKey = normalizeComparableUrlKey(postRedirectSafe.url);
        if (
          isEvidenceBacked ||
          options.allowSearchBackedSns ||
          options.trustedUrlKeys.has(finalKey)
        ) {
          return {
            status: "ok",
            verifiedUrl: postRedirectSafe.url,
            discoveredSnsLinks: [],
          };
        }
        return { status: "dead" };
      }

      if (res.status < 200 || res.status >= 400) {
        await res.body?.cancel().catch(() => undefined);
        return { status: "dead" };
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (
        !contentType ||
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml")
      ) {
        const previewBytes = await readBoundedResponseBytes(res, 32_768);
        const snippet = decodeHtmlBytesAutoCharset(previewBytes, contentType);

        if (hasSoft404HtmlSignature(snippet)) {
          return { status: "dead" };
        }

        const lowerSnippet = snippet.toLowerCase();
        if (
          inferRelatedTeamLinkKind(postRedirectSafe.url) === "youtube" &&
          (lowerSnippet.includes("this channel does not exist") ||
            lowerSnippet.includes("このチャンネルは存在しません"))
        ) {
          return { status: "dead" };
        }

        const discoveredSnsLinks =
          inferRelatedTeamLinkKind(postRedirectSafe.url) === "youtube"
            ? []
            : extractTeamSnsLinksFromHtml(snippet, postRedirectSafe.url);

        return {
          status: "ok",
          verifiedUrl: postRedirectSafe.url,
          discoveredSnsLinks,
        };
      }

      await res.body?.cancel().catch(() => undefined);
      return {
        status: "ok",
        verifiedUrl: postRedirectSafe.url,
        discoveredSnsLinks: [],
      };
    } catch {
      return { status: "network_error" };
    } finally {
      clearTimeout(timer);
    }
  };

  const primaryAttempt = await tryFetchWebPage(cleanUrl, 4_800);
  if (primaryAttempt.status === "ok") {
    return cacheResult(
      primaryAttempt.verifiedUrl,
      primaryAttempt.discoveredSnsLinks
    );
  }
  if (primaryAttempt.status === "dead") {
    return cacheResult(null);
  }

  // 日本のアマチュア野球・少年野球サイトに多い `http://` 専用サーバー（AIが `https://` で出力してTLS失敗するケース）を自動救済
  if (cleanUrl.startsWith("https://")) {
    const httpFallbackUrl = `http://${cleanUrl.slice("https://".length)}`;
    const httpCheck = isSafePublicFetchUrl(httpFallbackUrl);
    if (httpCheck.ok && httpCheck.url) {
      const fallbackAttempt = await tryFetchWebPage(httpCheck.url, 3_600);
      if (fallbackAttempt.status === "ok") {
        return cacheResult(
          fallbackAttempt.verifiedUrl,
          fallbackAttempt.discoveredSnsLinks
        );
      }
    }
  }

  return cacheResult(null);
}

function buildTrustedLinkProvenance(
  evidenceUrls: ReadonlyArray<string>
): {
  trustedUrlKeys: Set<string>;
  trustedSnsIdentities: Set<string>;
} {
  const trustedUrlKeys = new Set<string>();
  const trustedSnsIdentities = new Set<string>();

  for (const raw of evidenceUrls) {
    const clean = sanitizeAiUrl(raw);
    if (!clean) continue;
    trustedUrlKeys.add(normalizeComparableUrlKey(clean));
    const snsId = extractCanonicalSnsIdentity(clean);
    if (snsId) {
      trustedSnsIdentities.add(snsId);
    }
  }

  return { trustedUrlKeys, trustedSnsIdentities };
}

/**
 * 候補リスト内の全URLを一括並列検証し、実在確認できたリンク＋公式HP内から発見したSNSリンクを統合して返す
 */
async function filterVerifiedLinksForCandidates<
  T extends { websiteUrl: string; links: RelatedTeamLinkItem[] },
>(
  items: T[],
  options: {
    evidenceUrls: ReadonlyArray<string>;
    isSearchOrPageBacked: boolean;
    allowSearchBackedSns: boolean;
  }
): Promise<T[]> {
  if (items.length === 0) return items;

  // Web検索ツールも指定ページ取得も使われなかった純粋推論フォールバック時のみ、記憶ハルシネーションURL混入を防ぐため全URLをクリア
  if (!options.isSearchOrPageBacked) {
    return items.map((item) => ({
      ...item,
      websiteUrl: "",
      links: [],
    }));
  }

  const { trustedUrlKeys, trustedSnsIdentities } = buildTrustedLinkProvenance(
    options.evidenceUrls
  );

  const uniqueUrlsSet = new Set<string>();
  for (const item of items) {
    if (item.websiteUrl) uniqueUrlsSet.add(item.websiteUrl);
    for (const lk of item.links) {
      if (lk.url) uniqueUrlsSet.add(lk.url);
    }
  }

  const uniqueUrls = Array.from(uniqueUrlsSet).slice(0, 90);
  if (uniqueUrls.length === 0) return items;

  const verifiedMap = new Map<string, VerifiedUrlOutcome>();
  const startedAt = Date.now();

  await runWithConcurrencyLimit(uniqueUrls, 12, async (u) => {
    if (Date.now() - startedAt > 10_500) {
      const clean = sanitizeAiUrl(u);
      if (!clean) {
        verifiedMap.set(u, { verifiedUrl: null, discoveredSnsLinks: [] });
        return;
      }
      const key = normalizeComparableUrlKey(clean);
      const snsId = extractCanonicalSnsIdentity(clean);
      const backed =
        trustedUrlKeys.has(key) ||
        Boolean(snsId && trustedSnsIdentities.has(snsId)) ||
        (isBotWalledSnsHost(clean) && options.allowSearchBackedSns);
      verifiedMap.set(u, {
        verifiedUrl: backed ? clean : null,
        discoveredSnsLinks: [],
      });
      return;
    }
    const outcome = await verifyLivePublicTeamUrl(u, {
      trustedUrlKeys,
      trustedSnsIdentities,
      allowSearchBackedSns: options.allowSearchBackedSns,
    });
    verifiedMap.set(u, outcome);
  });

  return items.map((item) => {
    const webOutcome = item.websiteUrl
      ? verifiedMap.get(item.websiteUrl)
      : undefined;
    let nextWebsite = webOutcome?.verifiedUrl ?? null;

    const seenKeys = new Set<string>();
    const seenSnsIds = new Set<string>();
    const registerSeen = (url: string) => {
      seenKeys.add(normalizeComparableUrlKey(url));
      const sid = extractCanonicalSnsIdentity(url);
      if (sid) seenSnsIds.add(sid);
    };

    if (nextWebsite) {
      registerSeen(nextWebsite);
    }

    const nextLinks: RelatedTeamLinkItem[] = [];
    const pushUniqueLink = (candidateLink: RelatedTeamLinkItem) => {
      if (nextLinks.length >= MAX_LINKS_PER_RELATED_TEAM) return;
      const compKey = normalizeComparableUrlKey(candidateLink.url);
      const sid = extractCanonicalSnsIdentity(candidateLink.url);
      if (seenKeys.has(compKey) || (sid && seenSnsIds.has(sid))) {
        return;
      }
      registerSeen(candidateLink.url);
      nextLinks.push(candidateLink);
    };

    const discoveredFromPages: RelatedTeamLinkItem[] = [
      ...(webOutcome?.discoveredSnsLinks || []),
    ];

    for (const lk of item.links) {
      const lkOutcome = verifiedMap.get(lk.url);
      const resolvedUrl = lkOutcome?.verifiedUrl ?? null;
      if (!resolvedUrl) continue;
      if (lkOutcome?.discoveredSnsLinks?.length) {
        discoveredFromPages.push(...lkOutcome.discoveredSnsLinks);
      }

      const updatedKind =
        lk.kind === "other"
          ? inferRelatedTeamLinkKind(resolvedUrl, lk.label)
          : lk.kind;
      pushUniqueLink({
        ...lk,
        kind: updatedKind,
        url: resolvedUrl,
      });
    }

    // 公式HPや紹介ブログのHTML内から直接発見された公式SNSリンク（Instagram / YouTube / X / LINE / Facebook）を自動補完
    for (const extraSns of discoveredFromPages) {
      pushUniqueLink(extraSns);
    }

    // AIがInstagram/YouTube/X/LINE/FacebookのURLを websiteUrl に入れた場合は、公式ブランドカラーボタンで表示されるよう SNS links 側へ移す
    if (nextWebsite) {
      const webKind = inferRelatedTeamLinkKind(nextWebsite);
      if (
        webKind === "instagram" ||
        webKind === "youtube" ||
        webKind === "x" ||
        webKind === "line" ||
        webKind === "facebook"
      ) {
        nextLinks.unshift({
          id: createRelatedTeamLinkId(),
          kind: webKind,
          label: getRelatedTeamLinkKindDefaultLabel(webKind),
          url: nextWebsite,
        });
        nextWebsite = null;
      }
    }

    // メインの websiteUrl が空で、サブリンク側に有効な official サイトがあれば昇格させる
    if (!nextWebsite) {
      const officialIdx = nextLinks.findIndex((lk) => lk.kind === "official");
      if (officialIdx >= 0) {
        nextWebsite = nextLinks[officialIdx].url;
        nextLinks.splice(officialIdx, 1);
      }
    }

    return {
      ...item,
      websiteUrl: nextWebsite || "",
      links: nextLinks.slice(0, MAX_LINKS_PER_RELATED_TEAM),
    };
  });
}

const NAV_NOISE_ANCHOR_PATTERNS = [
  /^(?:top|home|トップ|トップページ|ホーム|メニュー|menu)$/i,
  /^(?:お知らせ|新着情報|ニュース|news|更新履歴)$/i,
  /^(?:大会結果|試合結果|試合日程|スケジュール|日程表|トーナメント表)$/i,
  /^(?:お問い合わせ|連絡先|プライバシーポリシー|個人情報|サイトマップ|ログイン|管理画面|規約|会則|審判部)$/i,
];

function isNavigationNoiseAnchor(label: string): boolean {
  const clean = label.trim();
  if (!clean || clean.length < 2) return true;
  return NAV_NOISE_ANCHOR_PATTERNS.some((re) => re.test(clean));
}

/**
 * 連盟公式サイトの加盟チーム一覧ページ等を安全に取得し、文字コード自動判定＋テキスト・リンク抽出を行う
 * （50〜70チーム規模の大規模連盟サイト・画像バナーリンク `<img alt>` にも対応）
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
  const timer = setTimeout(() => controller.abort(), 7_500);
  try {
    const res = await fetch(safeCheck.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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
    const limitedBytes = new Uint8Array(buf.slice(0, 380_000));

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
    const finalUrlKey = normalizeComparableUrlKey(finalUrl);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch
      ? titleMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120)
      : "";

    // ページ内の <a href="...">テキスト / <img alt="..."></a> を最大180件抽出（ナビゲーションノイズ除外）
    const extractedLinks: Array<{ label: string; url: string }> = [];
    const seenLinkKeys = new Set<string>();
    const anchorRegex = /<a\b([^>]*)href\s*=\s*["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null = null;
    while ((match = anchorRegex.exec(html)) !== null) {
      if (extractedLinks.length >= 180) break;
      const attrsBefore = match[1] || "";
      const rawHref = (match[2] || "").trim();
      const attrsAfter = match[3] || "";
      const rawAnchorHtml = match[4] || "";

      if (
        !rawHref ||
        rawHref.startsWith("javascript:") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:")
      ) {
        continue;
      }

      let anchorText = rawAnchorHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();

      // バナー画像のみのリンク (<img alt="〇〇少年野球部">) からチーム名を救出
      if (!anchorText) {
        const imgAltMatch = rawAnchorHtml.match(/\balt\s*=\s*["']([^"']+)["']/i);
        const titleAttrMatch = `${attrsBefore} ${attrsAfter}`.match(
          /\btitle\s*=\s*["']([^"']+)["']/i
        );
        anchorText = (imgAltMatch?.[1] || titleAttrMatch?.[1] || "")
          .replace(/\s+/g, " ")
          .trim();
      }
      anchorText = anchorText.slice(0, 80);

      if (isNavigationNoiseAnchor(anchorText)) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, finalUrl).toString();
        const urlValid = validateSafeHttpUrl(resolved, { allowEmpty: false });
        if (!urlValid.ok || !urlValid.url) continue;
        if (isUselessAiTeamUrl(urlValid.url)) continue;

        const compUrlKey = normalizeComparableUrlKey(urlValid.url);
        if (compUrlKey === finalUrlKey) continue;

        const dedupeKey = `${anchorText}::${compUrlKey}`;
        if (seenLinkKeys.has(dedupeKey)) continue;
        seenLinkKeys.add(dedupeKey);

        extractedLinks.push({ label: anchorText, url: urlValid.url });
      } catch {
        // ignore invalid relative url
      }
    }

    // <img alt="..."> のテキストも本文抜粋に残るように変換してからタグ除去
    const textSnippet = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi, " $1 ")
      .replace(/<\/(?:tr|li|p|div|h1|h2|h3|h4|td|th|br|dt|dd)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 24_000);

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
  fastBulkMode?: boolean;
  maxBudgetMs?: number;
}): Promise<
  | {
      ok: true;
      model: string;
      usedSearchTool: boolean;
      grounded: boolean;
      json: Record<string, unknown>;
      sources: RelatedTeamAiSourceLink[];
      allGroundedUrls: string[];
    }
  | { ok: false; status: 429 | 502; error: string }
> {
  const {
    apiKey,
    basePrompt,
    preferPlainJsonFirst = false,
    fastBulkMode = false,
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
    const cfg: Record<string, unknown> = {
      // 50〜60チームの一括JSON出力でも途中でトークン上限切れしないよう 8192 トークンを確保
      maxOutputTokens: 8192,
    };
    if (!isGemini4) {
      cfg.temperature = 0.1;
    }
    if (!spec.useGoogleSearch) {
      cfg.responseMimeType = "application/json";
    }
    if (withThinking) {
      if (spec.thinkingMode.type === "budget" && !isGemini4) {
        cfg.thinkingConfig = {
          thinkingBudget: fastBulkMode
            ? Math.min(spec.thinkingMode.budget, 512)
            : spec.thinkingMode.budget,
        };
      } else if (spec.thinkingMode.type === "level") {
        cfg.thinkingConfig = {
          thinkingLevel: fastBulkMode ? "LOW" : spec.thinkingMode.level,
        };
      }
    }
    return cfg;
  };

  for (const spec of WEB_SEARCH_MODEL_ATTEMPTS) {
    if (spec.useGoogleSearch && skipGoogleSearchTool) continue;

    const remainingMs = maxBudgetMs - (Date.now() - overallStart);
    if (remainingMs < 4_500) break;

    const modelDeadUntil = MODEL_COOLDOWN.get(`model:${spec.model}`) || 0;
    const slotCooldownKey = `${spec.model}:${spec.useGoogleSearch ? "gs" : "plain"}`;
    const slotCooldownUntil = MODEL_COOLDOWN.get(slotCooldownKey) || 0;
    if (Date.now() < modelDeadUntil || Date.now() < slotCooldownUntil) {
      continue;
    }

    // 大規模連盟の一括抽出時は検索＋大量JSON生成に十分な時間を確保する
    const effectiveSpecTimeout =
      fastBulkMode && spec.useGoogleSearch
        ? Math.max(spec.timeoutMs, 34_000)
        : spec.timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(effectiveSpecTimeout, remainingMs)
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
          // 別モデルの google_search プールは生きているため slotCooldownKey のみクールダウンし後続検索モデルへフェイルオーバー
          MODEL_COOLDOWN.set(
            slotCooldownKey,
            Date.now() + (isDailyExhausted ? 15 * 60_000 : 40_000)
          );
        } else if (res.status === 503) {
          MODEL_COOLDOWN.set(slotCooldownKey, Date.now() + 30_000);
        } else if (spec.useGoogleSearch && res.status === 403) {
          MODEL_COOLDOWN.set(slotCooldownKey, Date.now() + 30 * 60_000);
          if (lowerErr.includes("google_search")) {
            skipGoogleSearchTool = true;
          }
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

      // 万一 60+ チームの大量出力で末尾が途切れた場合でも、完結している全チーム配列要素を自動救出する
      const extracted = parseOrSalvageAiJsonObject(combinedText);
      if (!extracted) {
        lastErrorMsg = "AI応答データの解析に失敗しました";
        continue;
      }

      const groundingMeta = firstCandidate?.groundingMetadata;
      const webChunks = groundingMeta?.groundingChunks || [];
      const { sources, allGroundedUrls } =
        await extractAndUnwrapGroundingSources(webChunks);
      const hasSearchMetadata =
        webChunks.length > 0 ||
        (groundingMeta?.webSearchQueries?.length ?? 0) > 0 ||
        Boolean(groundingMeta?.searchEntryPoint);

      return {
        ok: true,
        model: spec.model,
        usedSearchTool: spec.useGoogleSearch,
        grounded: spec.useGoogleSearch && (hasSearchMetadata || true),
        json: extracted,
        sources,
        allGroundedUrls,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastErrorMsg = isAbort
        ? "AI検索がタイムアウトしました。支部・区単位に分けるか、連盟HPの加盟チーム一覧URLを指定して再度お試しください"
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
        areaHint: "",
        leagueSuggestions: [
          "川崎市学童軟式野球連盟",
          "多摩区少年野球連盟",
          "練習試合・広域交流",
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

  const [orgRow, relatedRows] = await Promise.all([
    orgId
      ? db
          .select({
            id: organizations.id,
            name: organizations.name,
            shortName: organizations.shortName,
            category: organizations.category,
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
  ]);

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

  // 連盟・グループ候補リスト（登録済み関連チームのグループ名のみを採用し、大会主催企業等は含めない）
  const suggestionSet = new Set<string>();
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
      areaHint: "",
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

  const rawWebsite = normalizeRelatedTeamLinkUrlInput(body.websiteUrl || "");
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
 * AI一括収集や過去の試合相手リストからの一括登録
 * （既に登録済みの同名チームに公式HP・SNSリンクや未設定プロフィールがある場合は安全にマージ補完する）
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
  if (rawItems.length > 120) {
    return c.json(
      { success: false, error: "一度に一括登録できるのは最大120チームまでです" },
      400
    );
  }

  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      createdCount: rawItems.length,
      updatedCount: 0,
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
    .select({
      id: relatedTeams.id,
      name: relatedTeams.name,
      shortName: relatedTeams.shortName,
      leagueName: relatedTeams.leagueName,
      area: relatedTeams.area,
      homeGround: relatedTeams.homeGround,
      websiteUrl: relatedTeams.websiteUrl,
      linksJson: relatedTeams.linksJson,
      description: relatedTeams.description,
    })
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

  const existingByKey = new Map<string, (typeof existingRows)[number]>();
  const seenKeys = new Set<string>();
  for (const ex of existingRows) {
    const k = normalizeOpponentMatchKey(ex.name);
    if (k && !existingByKey.has(k)) {
      existingByKey.set(k, ex);
    }
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
  let updatedCount = 0;
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

    const rawWeb = normalizeRelatedTeamLinkUrlInput(item.websiteUrl || "");
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
    const incomingShortName = (item.shortName || "")
      .trim()
      .slice(0, MAX_RELATED_TEAM_SHORT_NAME_LENGTH);
    const incomingArea = (item.area || "")
      .trim()
      .slice(0, MAX_RELATED_TEAM_AREA_LENGTH);
    const incomingHomeGround = (item.homeGround || "")
      .trim()
      .slice(0, MAX_RELATED_TEAM_GROUND_LENGTH);
    const incomingDescription = (item.description || "")
      .trim()
      .slice(0, MAX_RELATED_TEAM_DESC_LENGTH);

    const existing = existingByKey.get(normKey);
    if (existing) {
      // 既存チームへの公式HP・SNSリンクおよび空欄プロフィールの安全なマージ更新
      const existingWeb = (existing.websiteUrl || "").trim();
      const existingLinks = parseRelatedTeamLinksJson(existing.linksJson);
      const mergedLinks: RelatedTeamLinkItem[] = [...existingLinks];
      const knownUrlKeys = new Set<string>();
      const knownSnsIds = new Set<string>();

      const recordSeen = (u: string) => {
        if (!u) return;
        knownUrlKeys.add(normalizeComparableUrlKey(u));
        const sid = extractCanonicalSnsIdentity(u);
        if (sid) knownSnsIds.add(sid);
      };

      if (existingWeb) recordSeen(existingWeb);
      for (const lk of existingLinks) recordSeen(lk.url);

      let nextWebUrl = existingWeb || null;
      let linksChanged = false;

      if (safeWebUrl) {
        if (!nextWebUrl) {
          nextWebUrl = safeWebUrl;
          recordSeen(safeWebUrl);
        } else if (
          !knownUrlKeys.has(normalizeComparableUrlKey(safeWebUrl)) &&
          mergedLinks.length < MAX_LINKS_PER_RELATED_TEAM
        ) {
          const extraKind = inferRelatedTeamLinkKind(safeWebUrl);
          const extraSid = extractCanonicalSnsIdentity(safeWebUrl);
          if (!extraSid || !knownSnsIds.has(extraSid)) {
            recordSeen(safeWebUrl);
            mergedLinks.push({
              id: createRelatedTeamLinkId(),
              kind: extraKind,
              label: getRelatedTeamLinkKindDefaultLabel(extraKind),
              url: safeWebUrl,
            });
            linksChanged = true;
          }
        }
      }

      for (const lk of safeLinks) {
        if (mergedLinks.length >= MAX_LINKS_PER_RELATED_TEAM) break;
        const compKey = normalizeComparableUrlKey(lk.url);
        const sid = extractCanonicalSnsIdentity(lk.url);
        if (knownUrlKeys.has(compKey) || (sid && knownSnsIds.has(sid))) {
          continue;
        }
        recordSeen(lk.url);
        mergedLinks.push(lk);
        linksChanged = true;
      }

      const patch: Partial<typeof relatedTeams.$inferInsert> = {};
      let hasChanges = false;

      if ((nextWebUrl || null) !== (existingWeb || null)) {
        patch.websiteUrl = nextWebUrl;
        hasChanges = true;
      }
      if (linksChanged) {
        patch.linksJson = serializeRelatedTeamLinksJson(mergedLinks);
        hasChanges = true;
      }
      if (!existing.shortName && incomingShortName) {
        patch.shortName = incomingShortName;
        hasChanges = true;
      }
      if (!existing.leagueName && leagueName) {
        patch.leagueName = leagueName;
        hasChanges = true;
      }
      if (!existing.area && incomingArea) {
        patch.area = incomingArea;
        hasChanges = true;
      }
      if (!existing.homeGround && incomingHomeGround) {
        patch.homeGround = incomingHomeGround;
        hasChanges = true;
      }
      if (!existing.description && incomingDescription) {
        patch.description = incomingDescription;
        hasChanges = true;
      }

      if (hasChanges) {
        patch.updatedAt = now;
        await db
          .update(relatedTeams)
          .set(patch)
          .where(eq(relatedTeams.id, existing.id));
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }
      continue;
    }

    rowsToInsert.push({
      id: crypto.randomUUID(),
      organizationId: effectiveScope === "organization" ? orgId : null,
      teamId: effectiveScope === "team" ? teamId : orgId ? null : teamId,
      name,
      shortName: incomingShortName || null,
      leagueName: leagueName || null,
      relationType,
      teamCategory: (item.teamCategory || "").trim().slice(0, 40) || null,
      area: incomingArea || null,
      homeGround: incomingHomeGround || null,
      websiteUrl: safeWebUrl,
      linksJson: serializeRelatedTeamLinksJson(safeLinks),
      description: incomingDescription || null,
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
    updatedCount,
    skippedCount,
  });
});

interface BulkDeleteRelatedTeamsBody {
  teamId?: string;
  ids?: unknown;
}

/**
 * POST /api/liff/related-teams/bulk-delete
 * 所属連盟・グループ単位（またはグループ内の選択チーム）を一括削除（試合スコア記録自体は削除されない）
 */
liffRelatedTeamsRouter.post("/bulk-delete", async (c) => {
  let body: BulkDeleteRelatedTeamsBody;
  try {
    body = await c.req.json<BulkDeleteRelatedTeamsBody>();
  } catch {
    return c.json({ success: false, error: "リクエスト形式が不正です" }, 400);
  }

  const teamId = (body.teamId || "").trim();
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const uniqueIds = Array.from(
    new Set(
      rawIds
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );

  if (uniqueIds.length === 0) {
    return c.json(
      { success: false, error: "削除するチームを1件以上選択してください" },
      400
    );
  }
  if (uniqueIds.length > 200) {
    return c.json(
      { success: false, error: "一度に一括削除できるのは最大200チームまでです" },
      400
    );
  }

  if (
    teamId === "demo-team" ||
    uniqueIds.every((id) => id.startsWith("demo-"))
  ) {
    return c.json({
      success: true,
      isDemo: true,
      deletedCount: uniqueIds.length,
    });
  }

  if (!teamId) {
    return c.json({ success: false, error: "teamIdが必要です" }, 400);
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canMutateTeamData(teamId)) {
    return c.json({ success: false, error: "削除権限がありません" }, 403);
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
  const dbIds = uniqueIds.filter((id) => !id.startsWith("demo-"));
  const ownershipCondition = orgId
    ? or(
        eq(relatedTeams.teamId, teamId),
        eq(relatedTeams.organizationId, orgId)
      )
    : eq(relatedTeams.teamId, teamId);

  // D1 の SQLite バインド変数上限（100パラメータ）を下回るよう 50件ずつチャンク削除
  const CHUNK_SIZE = 50;
  for (let i = 0; i < dbIds.length; i += CHUNK_SIZE) {
    const chunk = dbIds.slice(i, i + CHUNK_SIZE);
    await db
      .delete(relatedTeams)
      .where(and(inArray(relatedTeams.id, chunk), ownershipCondition));
  }

  return c.json({
    success: true,
    deletedCount: uniqueIds.length,
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
    const rawWebsite = normalizeRelatedTeamLinkUrlInput(body.websiteUrl);
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
          })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .get()
      : Promise.resolve(undefined),
    db
      .select({
        name: relatedTeams.name,
        shortName: relatedTeams.shortName,
        websiteUrl: relatedTeams.websiteUrl,
        linksJson: relatedTeams.linksJson,
      })
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
  const existingWithLinksKeys = new Set<string>();
  for (const row of existingRelated) {
    const k = normalizeOpponentMatchKey(row.name);
    if (k) {
      existingKeys.add(k);
      const hasLinks =
        Boolean(row.websiteUrl && row.websiteUrl.trim()) ||
        parseRelatedTeamLinksJson(row.linksJson).length > 0;
      if (hasLinks) {
        existingWithLinksKeys.add(k);
      }
    }
  }
  const ownKeys = new Set<string>();
  for (const n of [orgRow?.name, orgRow?.shortName, teamRow.name]) {
    const k = normalizeOpponentMatchKey(n);
    if (k) ownKeys.add(k);
  }

  const catOpt = resolveTeamCategoryOption(orgRow?.category);
  const effectiveCategory =
    categoryHint || (catOpt.value !== "other" ? catOpt.label : "");
  const effectiveArea = areaHint;

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
    "v2",
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
      .map((item) => {
        const normKey = normalizeOpponentMatchKey(item.name);
        return {
          ...item,
          alreadyRegistered: existingKeys.has(normKey),
          hasExistingLinks: existingWithLinksKeys.has(normKey),
        };
      });

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
          "- ページ内から抽出された実在リンク一覧（各チームの公式HP・紹介ページ・SNSがあれば積極的に紐付けてください）:",
          ...pageDigest.extractedLinks
            .slice(0, 160)
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
        ? "提供された公式Webページ内容およびGoogle検索を活用し、加盟・参加している実在の野球チーム一覧と、確認できた各チームの公式HP・SNSリンクを漏れなく正確に抽出し、JSONで返してください。"
        : "Google検索を用いて、指定された野球連盟・協会・大会・地域に加盟または所属している実在の野球チーム一覧と、確認できた各チームの公式HP・SNSリンクを調査し、JSONで返してください。",
      "",
      "【調査コンテキスト】",
      ...contextLines,
      ...pageSectionLines,
      "",
      "【厳守ルール（公式HP・SNSの積極収集と推測URL絶対禁止の両立）】",
      "1. 実在が裏付けられたチームのみを出力してください。架空のチーム名（「〇〇ベアーズ」「サンプルズ」等の推測生成）は絶対に混ぜないでください。",
      "2. 公式HP・SNSリンクの収集ルール: 指定ページ内のリンク一覧またはGoogle検索結果で、そのチーム固有の公式サイト（独自ドメイン・89dream・ikz・sposuru・teams.one・Wix・Jimdo・Ameba Ownd等）や公式SNS（Instagram・YouTubeチャンネル・X・LINE公式・Facebook・公式ブログ）が確認できた場合は、省略せず積極的に `websiteUrl` と `links` に出力してください。一方で、検索結果に存在しないのにチーム名のローマ字等から `https://www.instagram.com/xxx/` や `https://xxx.89dream.jp/` などのURLを推測・創作することは絶対禁止です（未確認のチームは空文字 \"\" / 空配列 [] にしてください）。",
      "3. 大規模連盟対応（最大60チーム）: チーム数が多い連盟でも途中で省略せず最大60チームまで抽出してください。大量チーム出力時のトークン切れを防ぐため、各チームの `description` は40文字以内の簡潔なメモ（不明なら空文字 \"\"）にしてください。",
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
      '      "description": "所属支部・対象学年などの簡潔メモ（40文字以内、不明なら空文字）",',
      '      "websiteUrl": "実在確認済みの公式サイトURL（未確認なら空文字）",',
      '      "links": [',
      '        { "label": "Instagram", "url": "実在確認済みのURL" }',
      "      ],",
      '      "confidence": "high | medium | low"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const aiRes = await executeGeminiJsonPrompt({
      apiKey,
      basePrompt: prompt,
      preferPlainJsonFirst: false,
      fastBulkMode: true,
      maxBudgetMs: 52_000,
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
    const rawParsedCandidates: AiDiscoveredTeamCandidate[] = [];
    const seenCandidateKeys = new Set<string>();

    for (let i = 0; i < rawCandidates.length; i += 1) {
      if (rawParsedCandidates.length >= 65) break;
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

      rawParsedCandidates.push({
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

    // 抽出された全URLについてライブHTTP疎通・ソフト404・旧式httpフォールバック・公式HP内SNS自動抽出を実行
    const discoverEvidenceUrls: string[] = [
      ...(pageDigest ? pageDigest.extractedLinks.map((lk) => lk.url) : []),
      ...aiRes.allGroundedUrls,
    ];
    const isSearchOrPageBacked = aiRes.usedSearchTool || Boolean(pageDigest);
    const candidates = await filterVerifiedLinksForCandidates(
      rawParsedCandidates,
      {
        evidenceUrls: discoverEvidenceUrls,
        isSearchOrPageBacked,
        allowSearchBackedSns: isSearchOrPageBacked,
      }
    );

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
      grounded: isSearchOrPageBacked,
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
 * 単一チームの公式サイト・Instagram・YouTube・X・LINE公式・活動拠点・所属連盟をAI検索で自動補完
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

  const effectiveArea = areaHint || orgProfile.activityArea || "";
  const effectiveLeague = leagueHint;
  const effectiveCategory =
    categoryHint || (catOpt.value !== "other" ? catOpt.label : "");

  const cacheKey = [
    "v2",
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
      "Google検索を用いて、指定された野球チームの公式ホームページ（独自HP・89dream・ikz・sposuru・teams.one・Wix・Jimdo・Ameba Ownd等）と、公式SNS（Instagram・YouTubeチャンネル・X（旧Twitter）・Facebook・LINE公式・公式ブログ/部員募集ページ）、所属連盟、活動地域、主な練習拠点を徹底調査し、JSONで返してください。",
      "",
      "【調査対象】",
      ...contextLines,
      "",
      "【検索・抽出ルール（推測URLは絶対禁止・検索で確認できた公式URLは漏れなく出力）】",
      `1. Google検索では「"${inputName}" 野球」「"${inputName}" Instagram」「"${inputName}" 公式HP」のように地域ヒント・連盟ヒントも組み合わせて検索し、公式HPとInstagram等の公式SNSの両方を丁寧に探してください。`,
      "2. 同名のチームが全国に複数ある場合は、地域ヒント・連盟ヒント・競技種別ヒントに合致するチームの情報のみを採用し、別地域の同名チームの情報を混ぜないでください。",
      "3. `websiteUrl` にはチームの公式サイト（またはポータル上の公式チームページ）を設定し、Instagram・YouTube・X・Facebook・LINE公式・アメブロ等のサブリンクはすべて `links` 配列に出力してください（公式HPが無くInstagramのみ確認できた場合も `websiteUrl` は空文字 \"\" にし、`links` にInstagramを入れてください）。",
      "4. 検索結果で確認できなかったURLをチーム名のローマ字等から推測して作ることは絶対禁止です（未確認なら必ず空文字 \"\" または空配列 [] にしてください）。",
      "5. 出力は説明文やマークダウンを含めず、以下の純粋なJSONオブジェクト1つのみを返してください:",
      "{",
      '  "name": "正式なチーム名",',
      '  "shortName": "スコアボード等向けの4〜8文字の略称",',
      '  "leagueName": "所属連盟・協会名（不明なら空文字）",',
      '  "area": "活動地域・市区町村（例: 〇〇県〇〇市〇〇区、不明なら空文字）",',
      '  "homeGround": "主な練習拠点・ホームグラウンド・小学校名（不明なら空文字）",',
      '  "description": "創部・活動方針・対象学年・特徴などの簡潔な紹介文（120文字以内、不明なら空文字）",',
      '  "websiteUrl": "実在確認済みの公式サイト・代表ページURL（未確認なら空文字）",',
      '  "links": [',
      '    { "label": "Instagram", "url": "https://www.instagram.com/..." }',
      "  ],",
      '  "confidence": "high | medium | low",',
      '  "summaryNote": "特定したチーム・情報源の1行要約"',
      "}",
    ].join("\n");

    const aiRes = await executeGeminiJsonPrompt({
      apiKey,
      basePrompt: prompt,
      maxBudgetMs: 42_000,
    });

    if (!aiRes.ok) {
      return aiRes;
    }

    const websiteUrl = sanitizeAiUrl(aiRes.json.websiteUrl);
    const links = sanitizeAiLinks(aiRes.json.links, websiteUrl);
    const rawConf = cleanAiString(aiRes.json.confidence, 12).toLowerCase();
    const confidence: "high" | "medium" | "low" =
      rawConf === "high" || rawConf === "low" ? rawConf : "medium";

    const rawCandidate: RelatedTeamAiLookupResult = {
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

    // 実在HTTP応答・http://救済・公式HP/ブログHTML内のSNSリンク自動抽出を一括実行
    const [candidate] = await filterVerifiedLinksForCandidates([rawCandidate], {
      evidenceUrls: aiRes.allGroundedUrls,
      isSearchOrPageBacked: aiRes.usedSearchTool,
      allowSearchBackedSns: aiRes.usedSearchTool,
    });

    const payload = {
      success: true as const,
      model: aiRes.model,
      grounded: aiRes.usedSearchTool,
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
