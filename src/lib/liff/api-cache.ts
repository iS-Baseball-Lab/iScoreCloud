// filepath: src/lib/liff/api-cache.ts
import {
  resolveActiveLiffAccessTokenFromSdk,
  resolveActiveLiffUserIdFromSdk,
  resolveActiveLiffUserNameFromSdk,
  waitForInitialLiffSdkReady,
} from "@/lib/liff/liff-client";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";

/**
 * ⚡ LIFF 爆速表示＆自己修復エンジン（3層SWRキャッシュ + Last-Known-Good Stale-If-Error + 自動リトライ）
 * - 画面遷移時はもちろん、LINEミニアプリを一度閉じて開き直したコールド起動時でも **1フレーム目（0ms）で即時返却** しスピナーをゼロにする。
 * - 指が触れた瞬間（`onPointerDown`）の先行プリフェッチ（`warmupLiffEndpointForHref` / `warmupLiffMatchDetail`）に対応。
 * - 同一URLへの同時フェッチ（LiffProvider と各ページの重複呼び出し等）を 1 本の通信に統合する。
 * - 長時間利用後のモバイル回線切替（4G/5G・Wi-Fi）や LINE トーク画面往復時のハーフオープン通信ハングを検知し、
 *   プリバックグラウンド滞留通信の即時破棄・自動リトライ（`cache: "reload"`）・通信断時の Stale-If-Error フォールバックで「データがありません」誤表示を根絶する。
 * - POST / PUT / PATCH / DELETE 実行時は自動で L1/L2/L3 全キャッシュを破棄し、最新状態を確実に反映する（403 権限外時は Last-Known-Good も完全消去）。
 */

interface CacheEntry<T = unknown> {
  data: T;
  updatedAt: number;
}

interface RawFetchSnapshot {
  status: number;
  statusText: string;
  contentType: string;
  bodyText: string;
  isForbiddenResponse?: boolean;
  isTransientFailure?: boolean;
}

interface TrackedInflightEntry<T> {
  promise: Promise<T>;
  controller: AbortController;
  startedAt: number;
}

const LEGACY_SESSION_CACHE_PREFIXES = [
  "iscore_swr_v1:",
  "iscore_swr_v2:",
  "iscore_swr_v3:",
] as const;
const LEGACY_PERSISTENT_CACHE_PREFIXES = [
  "iscore_swr_l3_v1:",
  "iscore_swr_l3_v2:",
] as const;
const SESSION_CACHE_PREFIX = "iscore_swr_v4:";
const PERSISTENT_CACHE_PREFIX = "iscore_swr_l3_v3:";
const DEFAULT_FRESH_MS = 30_000; // 30秒以内は完全フレッシュ扱い
const FAST_RETURN_STALE_MS = 120_000; // 120秒以内は window.fetch でも 0ms 即返却しつつ裏で再検証
const MAX_STALE_MS = 30 * 60_000; // L1/L2 セッション内は30分保持（従来の10分境界によるキャッシュ一斉消失を解消）
const MAX_PERSISTENT_STALE_MS = 24 * 60 * 60_000; // L3 永続スナップショットおよび Stale-If-Error 救済上限は24時間
const MAX_PERSISTENT_ENTRIES = 45;
const MAX_PERSISTENT_BYTES = 260_000;
const MAX_LAST_KNOWN_GOOD_ENTRIES = 120;

const FOREGROUND_ATTEMPT_TIMEOUT_MS = 9_500; // 初回試行の待機上限（ハーフオープン接続を早期切断してリトライへ移行）
const FOREGROUND_GET_TIMEOUT_MS = 11_000; // リトライ試行の最大待機時間
const WARMUP_GET_TIMEOUT_MS = 8_000; // 先行プリフェッチ通信の最大待機時間
const MUTATION_JSON_TIMEOUT_MS = 22_000; // 更新系通信のハング防止タイムアウト（コネクション枠枯渇を防止）
const MUTATION_UPLOAD_TIMEOUT_MS = 60_000; // 画像・PDFアップロード系の最大待機時間
const AI_REQUEST_TIMEOUT_MS = 65_000; // AI調査・解析系（大規模連盟一括収集・URL実在検証を含む）の最大待機時間
const RESUME_ZOMBIE_THRESHOLD_MS = 4_500; // バックグラウンド復帰時に強制解除する滞留通信の閾値
const AUTO_RETRY_BACKOFF_MS = 220;

const PERSISTENT_ELIGIBLE_PREFIXES = [
  "/api/liff/hub",
  "/api/liff/schedule",
  "/api/liff/matches",
  "/api/liff/carpool",
  "/api/liff/stats",
  "/api/liff/players",
  "/api/liff/team-info",
  "/api/liff/grounds",
  "/api/liff/rules",
  "/api/liff/documents",
  "/api/liff/gallery",
  "/api/liff/faqs",
  "/api/liff/links",
  "/api/liff/related-teams",
  "/api/liff/attendance-matrix",
  "/api/liff/my-family",
  "/api/liff/admin",
  "/api/liff/match-ops-context",
  "/api/liff/scorebook/",
  "/api/matches/",
  "/api/teams/",
];

export const LIFF_CACHE_INVALIDATED_EVENT = "iscore:liff-cache-invalidated";

const memoryCache = new Map<string, CacheEntry>();
const lastKnownGoodCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, TrackedInflightEntry<unknown>>();
const inflightRawRequests = new Map<string, TrackedInflightEntry<RawFetchSnapshot>>();

let nativeFetchRef: typeof fetch | null = null;
let isGlobalFastFetchInstalled = false;
let hasPurgedLegacyCache = false;
let cacheMutationEpoch = 0;
let lastCacheInvalidatedAt = 0;
let lastDocumentHiddenAt = 0;

let prefetchQueue: string[] = [];
let prefetchGeneration = 0;
let isPrefetchWorkerRunning = false;

export function getLastLiffCacheInvalidatedAt(): number {
  return lastCacheInvalidatedAt;
}

function createTimedSignal(
  timeoutMs: number,
  upstreamSignal?: AbortSignal | null
): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timerId = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // ignore abort errors
    }
  }, timeoutMs);

  const onUpstreamAbort = () => {
    try {
      controller.abort();
    } catch {
      // ignore abort errors
    }
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      clearTimeout(timerId);
      onUpstreamAbort();
    } else {
      upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timerId);
    if (upstreamSignal) {
      upstreamSignal.removeEventListener("abort", onUpstreamAbort);
    }
  };

  return { controller, cleanup };
}

function abortZombieInflightRequests(
  forceAllOlderThanMs = RESUME_ZOMBIE_THRESHOLD_MS,
  abortStartedBeforeTimestamp = 0
): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(inflightRequests.entries())) {
    const startedBeforeSuspend =
      abortStartedBeforeTimestamp > 0 && entry.startedAt <= abortStartedBeforeTimestamp;
    if (startedBeforeSuspend || now - entry.startedAt >= forceAllOlderThanMs) {
      try {
        entry.controller.abort();
      } catch {}
      inflightRequests.delete(key);
    }
  }
  for (const [key, entry] of Array.from(inflightRawRequests.entries())) {
    const startedBeforeSuspend =
      abortStartedBeforeTimestamp > 0 && entry.startedAt <= abortStartedBeforeTimestamp;
    if (startedBeforeSuspend || now - entry.startedAt >= forceAllOlderThanMs) {
      try {
        entry.controller.abort();
      } catch {}
      inflightRawRequests.delete(key);
    }
  }
}

function purgeLegacySessionCache(): void {
  if (hasPurgedLegacyCache || typeof window === "undefined") return;
  hasPurgedLegacyCache = true;
  try {
    const obsoleteSessionKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && LEGACY_SESSION_CACHE_PREFIXES.some((prefix) => k.startsWith(prefix))) {
        obsoleteSessionKeys.push(k);
      }
    }
    for (const k of obsoleteSessionKeys) {
      sessionStorage.removeItem(k);
    }

    const obsoletePersistentKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && LEGACY_PERSISTENT_CACHE_PREFIXES.some((prefix) => k.startsWith(prefix))) {
        obsoletePersistentKeys.push(k);
      }
    }
    for (const k of obsoletePersistentKeys) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore storage access errors
  }
}

const IGNORED_CLIENT_USER_IDS = new Set([
  "cached-user",
  "mock-user-12345",
  "undefined",
  "null",
]);

function getActiveClientUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw =
      localStorage.getItem("iscore_user_id") ||
      localStorage.getItem("iscore_userId") ||
      "";
    const trimmed = raw.trim();
    if (trimmed && !IGNORED_CLIENT_USER_IDS.has(trimmed)) {
      return trimmed;
    }
  } catch {
    // fall through to SDK recovery
  }
  const sdkUid = resolveActiveLiffUserIdFromSdk();
  return sdkUid && !IGNORED_CLIENT_USER_IDS.has(sdkUid) ? sdkUid : "";
}

function getActiveClientUserName(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = (localStorage.getItem("iscore_user_name") || "").trim();
    if (stored) return stored;
  } catch {
    // fall through to SDK recovery
  }
  return resolveActiveLiffUserNameFromSdk();
}

function extractPathFromCacheKey(key: string): string {
  const sepIdx = key.indexOf("::");
  return sepIdx >= 0 ? key.slice(sepIdx + 2) : key;
}

function isSameOriginApiRequestUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  if (rawUrl.startsWith("/api/")) return true;
  if (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) return false;
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(rawUrl, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function shouldAttachClientAuthHeaders(rawUrl: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(rawUrl, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    if (!u.pathname.startsWith("/api/")) return false;
    if (
      u.pathname.startsWith("/api/auth/") ||
      u.pathname.startsWith("/api/images/") ||
      u.pathname.startsWith("/api/liff/gallery/media/")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const LIFF_SESSION_PROOF_STORAGE_KEY = "iscore_liff_session_v1";

interface StoredLiffSessionProofRecord {
  userId: string;
  token: string;
  savedAt: number;
}

function decodeProofPayloadPreview(
  token: string
): { uid?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as { uid?: unknown; exp?: unknown };
    return {
      uid: typeof parsed.uid === "string" ? parsed.uid : undefined,
      exp: typeof parsed.exp === "number" ? parsed.exp : undefined,
    };
  } catch {
    return null;
  }
}

export function clearStoredLiffSessionProof(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LIFF_SESSION_PROOF_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function saveStoredLiffSessionProof(userId: string, token: string): void {
  if (typeof window === "undefined") return;
  const cleanToken = token.trim();
  if (!cleanToken) return;
  const preview = decodeProofPayloadPreview(cleanToken);
  const resolvedUid = (preview?.uid || userId || "").trim();
  if (!resolvedUid) return;
  try {
    const record: StoredLiffSessionProofRecord = {
      userId: resolvedUid,
      token: cleanToken,
      savedAt: Date.now(),
    };
    localStorage.setItem(LIFF_SESSION_PROOF_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage quota errors
  }
}

export function getStoredLiffSessionProof(expectedUserId?: string): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(LIFF_SESSION_PROOF_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Partial<StoredLiffSessionProofRecord>;
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const storedUid = typeof parsed.userId === "string" ? parsed.userId.trim() : "";
    if (!token || !storedUid) return "";

    const cleanExpected = (expectedUserId || "").trim();
    if (
      cleanExpected &&
      !IGNORED_CLIENT_USER_IDS.has(cleanExpected) &&
      storedUid !== cleanExpected
    ) {
      return "";
    }

    const preview = decodeProofPayloadPreview(token);
    if (!preview || !preview.exp) {
      localStorage.removeItem(LIFF_SESSION_PROOF_STORAGE_KEY);
      return "";
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (preview.exp <= nowSec + 60) {
      localStorage.removeItem(LIFF_SESSION_PROOF_STORAGE_KEY);
      return "";
    }
    if (preview.uid && preview.uid !== storedUid) {
      localStorage.removeItem(LIFF_SESSION_PROOF_STORAGE_KEY);
      return "";
    }
    return token;
  } catch {
    return "";
  }
}

export function hasStoredLiffSessionProof(expectedUserId?: string): boolean {
  return Boolean(getStoredLiffSessionProof(expectedUserId));
}

function captureLiffSessionProofFromResponse(res: Response): void {
  try {
    if (res.headers.get("x-liff-auth-invalid") === "1" || res.status === 401) {
      clearStoredLiffSessionProof();
      return;
    }
    const issued = res.headers.get("x-liff-session-token")?.trim() || "";
    if (issued) {
      saveStoredLiffSessionProof(getActiveClientUserId(), issued);
    }
  } catch {
    // ignore header access errors
  }
}

async function ensureClientAuthReadyIfNeeded(rawUrl: string): Promise<void> {
  if (!shouldAttachClientAuthHeaders(rawUrl)) return;
  const uid = getActiveClientUserId();
  if (!uid) return;
  if (hasStoredLiffSessionProof(uid)) return;
  if (resolveActiveLiffAccessTokenFromSdk()) return;
  await waitForInitialLiffSdkReady(2_200);
}

function withSameOriginApiAuthHeaders(
  rawUrl: string,
  input: RequestInfo | URL,
  init?: RequestInit
): { nextInput: RequestInfo | URL; nextInit: RequestInit | undefined } {
  if (!shouldAttachClientAuthHeaders(rawUrl)) {
    return { nextInput: input, nextInit: init };
  }
  const uid = getActiveClientUserId();
  const uName = getActiveClientUserName();
  const sessionProof = getStoredLiffSessionProof(uid || undefined);
  const accessToken = !sessionProof ? resolveActiveLiffAccessTokenFromSdk() : "";

  if (!uid && !uName && !sessionProof && !accessToken) {
    return { nextInput: input, nextInit: init };
  }
  try {
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
    if (sessionProof && !headers.has("x-liff-session-token")) {
      headers.set("X-Liff-Session-Token", sessionProof);
    }
    if (
      accessToken &&
      /^[\x20-\x7E]+$/.test(accessToken) &&
      !headers.has("x-liff-access-token")
    ) {
      headers.set("X-Liff-Access-Token", accessToken);
    }
    if (uid && /^[\x20-\x7E]+$/.test(uid) && !headers.has("x-liff-user-id")) {
      headers.set("X-Liff-User-Id", uid);
    }
    if (uName && !headers.has("x-liff-user-name")) {
      headers.set("X-Liff-User-Name", encodeURIComponent(uName));
    }
    return {
      nextInput: input,
      nextInit: { ...init, headers },
    };
  } catch {
    return { nextInput: input, nextInit: init };
  }
}

function isPersistentEligibleKey(key: string): boolean {
  const pathPart = extractPathFromCacheKey(key);
  return PERSISTENT_ELIGIBLE_PREFIXES.some((prefix) => pathPart.startsWith(prefix));
}

function recordLastKnownGood(key: string, entry: CacheEntry): void {
  lastKnownGoodCache.delete(key);
  lastKnownGoodCache.set(key, entry);
  if (lastKnownGoodCache.size > MAX_LAST_KNOWN_GOOD_ENTRIES) {
    const oldestKey = lastKnownGoodCache.keys().next().value;
    if (oldestKey) {
      lastKnownGoodCache.delete(oldestKey);
    }
  }
}

function purgeForbiddenCacheKey(key: string): void {
  memoryCache.delete(key);
  lastKnownGoodCache.delete(key);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      localStorage.removeItem(PERSISTENT_CACHE_PREFIX + key);
    } catch {}
  }
}

function prunePersistentCacheIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    const entries: Array<{ storageKey: string; updatedAt: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PERSISTENT_CACHE_PREFIX)) continue;
      let updatedAt = 0;
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw) as { updatedAt?: number };
          updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
        }
      } catch {
        updatedAt = 0;
      }
      entries.push({ storageKey: k, updatedAt });
    }

    if (entries.length <= MAX_PERSISTENT_ENTRIES) return;
    entries.sort((a, b) => a.updatedAt - b.updatedAt);
    const removeCount = entries.length - MAX_PERSISTENT_ENTRIES;
    for (let i = 0; i < removeCount; i++) {
      localStorage.removeItem(entries[i].storageKey);
    }
  } catch {
    // ignore storage access errors
  }
}

function shouldPersistResponseToCache(key: string, data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const record = data as Record<string, unknown>;
  if (record.success === false || record.isForbidden === true) return false;

  const pathPart = extractPathFromCacheKey(key);

  // 認証ユーザー指定ありで権限（memberId / playerIds）が未解決のレスポンスはキャッシュ固定化させない（承認・統合直後の権限ロック防止）
  const hasIdentityQuery =
    Boolean(getActiveClientUserId()) ||
    (pathPart.includes("userId=") && !pathPart.includes("userId=&")) ||
    (pathPart.includes("userName=") && !pathPart.includes("userName=&"));

  if (
    hasIdentityQuery &&
    pathPart.startsWith("/api/liff/hub") &&
    record.authVerified === false
  ) {
    return false;
  }

  if (hasIdentityQuery && pathPart.startsWith("/api/liff/attendance-matrix")) {
    const myInfo = record.myInfo as
      | { memberId?: string | null; memberIds?: string[]; playerIds?: string[]; isITAdmin?: boolean }
      | undefined;
    const hasResolvedIdentity = Boolean(
      myInfo?.memberId ||
        (Array.isArray(myInfo?.memberIds) && myInfo.memberIds.length > 0) ||
        (Array.isArray(myInfo?.playerIds) && myInfo.playerIds.length > 0) ||
        myInfo?.isITAdmin
    );
    if (!hasResolvedIdentity) return false;
  }

  if (hasIdentityQuery && pathPart.startsWith("/api/liff/my-family")) {
    const hasMember = Boolean(record.memberId);
    const children = record.children;
    const hasChildren = Array.isArray(children) && children.length > 0;
    if (!hasMember && !hasChildren) return false;
  }

  return true;
}

function getNativeFetch(): typeof fetch {
  if (nativeFetchRef) return nativeFetchRef;
  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    nativeFetchRef = window.fetch.bind(window);
    return nativeFetchRef;
  }
  return fetch;
}

function shouldCacheApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/images/") ||
    pathname.startsWith("/api/liff/gallery/media/") ||
    (pathname.startsWith("/api/liff/gallery/") &&
      (pathname.endsWith("/photos") || pathname.endsWith("/original"))) ||
    pathname.startsWith("/api/seed") ||
    pathname.startsWith("/api/liff/carpool-convoy")
  ) {
    return false;
  }
  return true;
}

function normalizeCacheKey(rawUrl: string): string | null {
  if (typeof window === "undefined") return rawUrl;
  const cleanTarget = extractPathFromCacheKey(rawUrl);
  try {
    const u = new URL(cleanTarget, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    if (!shouldCacheApiPath(u.pathname)) return null;
    const userScope = getActiveClientUserId() || "anon";
    return `${userScope}::${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function readFromCache<T>(key: string, allowPersistentL3 = true): CacheEntry<T> | null {
  purgeLegacySessionCache();
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem) {
    const maxAge = allowPersistentL3 && isPersistentEligibleKey(key) ? MAX_PERSISTENT_STALE_MS : MAX_STALE_MS;
    if (now - mem.updatedAt <= maxAge) {
      recordLastKnownGood(key, mem);
      return mem as CacheEntry<T>;
    }
    if (now - mem.updatedAt <= MAX_PERSISTENT_STALE_MS) {
      recordLastKnownGood(key, mem);
    }
    memoryCache.delete(key);
  }

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (parsed && typeof parsed.updatedAt === "number") {
          if (now - parsed.updatedAt <= MAX_STALE_MS) {
            memoryCache.set(key, parsed);
            recordLastKnownGood(key, parsed);
            return parsed;
          }
          if (now - parsed.updatedAt <= MAX_PERSISTENT_STALE_MS) {
            recordLastKnownGood(key, parsed);
          } else {
            sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
          }
        }
      }
    } catch {
      // ignore storage quota / parse errors
    }

    if (allowPersistentL3 && isPersistentEligibleKey(key)) {
      try {
        const rawL3 = localStorage.getItem(PERSISTENT_CACHE_PREFIX + key);
        if (rawL3) {
          const parsedL3 = JSON.parse(rawL3) as CacheEntry<T>;
          if (
            parsedL3 &&
            typeof parsedL3.updatedAt === "number" &&
            now - parsedL3.updatedAt <= MAX_PERSISTENT_STALE_MS
          ) {
            memoryCache.set(key, parsedL3);
            recordLastKnownGood(key, parsedL3);
            return parsedL3;
          }
          localStorage.removeItem(PERSISTENT_CACHE_PREFIX + key);
        }
      } catch {
        // ignore storage quota / parse errors
      }
    }
  }

  return null;
}

/**
 * 通信断・タイムアウト・500系一時障害発生時の最終救済スナップショット（Stale-If-Error、最大24時間）
 * ※ 403 / isForbidden 時は purgeForbiddenCacheKey により即時破棄されているため権限外漏洩は起きない
 */
function readStaleFallbackEntry<T>(key: string): CacheEntry<T> | null {
  const now = Date.now();
  const candidates: CacheEntry<T>[] = [];

  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem && now - mem.updatedAt <= MAX_PERSISTENT_STALE_MS) {
    candidates.push(mem);
  }
  const lkg = lastKnownGoodCache.get(key) as CacheEntry<T> | undefined;
  if (lkg && now - lkg.updatedAt <= MAX_PERSISTENT_STALE_MS) {
    candidates.push(lkg);
  }

  if (typeof window !== "undefined") {
    try {
      const rawSession = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as CacheEntry<T>;
        if (parsed && typeof parsed.updatedAt === "number" && now - parsed.updatedAt <= MAX_PERSISTENT_STALE_MS) {
          candidates.push(parsed);
        }
      }
    } catch {}
    try {
      const rawL3 = localStorage.getItem(PERSISTENT_CACHE_PREFIX + key);
      if (rawL3) {
        const parsedL3 = JSON.parse(rawL3) as CacheEntry<T>;
        if (
          parsedL3 &&
          typeof parsedL3.updatedAt === "number" &&
          now - parsedL3.updatedAt <= MAX_PERSISTENT_STALE_MS
        ) {
          candidates.push(parsedL3);
        }
      }
    } catch {}
  }

  const valid = candidates.filter((c) => shouldPersistResponseToCache(key, c.data));
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.updatedAt - a.updatedAt);
  return valid[0];
}

function writeToCache<T>(key: string, data: T): void {
  purgeLegacySessionCache();
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    if (rec.isForbidden === true) {
      purgeForbiddenCacheKey(key);
      return;
    }
  }
  if (!shouldPersistResponseToCache(key, data)) {
    // 一時エラー（success: false）や未解決状態のレスポンスで既存の正常キャッシュを破壊しない
    return;
  }

  const entry: CacheEntry<T> = { data, updatedAt: Date.now() };
  memoryCache.set(key, entry);
  recordLastKnownGood(key, entry);

  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify(entry);
      // 300KB超の巨大レスポンスはメモリキャッシュのみに保持し sessionStorage 圧迫を防ぐ
      if (serialized.length < 300_000) {
        sessionStorage.setItem(SESSION_CACHE_PREFIX + key, serialized);
      }
      // 主要画面・試合詳細レスポンス（260KB以下）は L3 localStorage にも保存し、次回LINE起動時の 0ms 表示＆通信断耐性を実現
      if (isPersistentEligibleKey(key) && serialized.length <= MAX_PERSISTENT_BYTES) {
        try {
          localStorage.setItem(PERSISTENT_CACHE_PREFIX + key, serialized);
          prunePersistentCacheIfNeeded();
        } catch {
          prunePersistentCacheIfNeeded();
        }
      }
    } catch {
      // ignore storage quota errors
    }
  }
}

/**
 * LiffProvider と LiffHubPage で完全に同一のキャッシュキーを共有するための HUB URL 生成ヘルパー
 */
export function buildLiffHubUrl(params: {
  teamId?: string | null;
  userId?: string | null;
  userName?: string | null;
}): string {
  const qs = new URLSearchParams();
  if (params.teamId) qs.set("teamId", params.teamId);
  if (params.userId && params.userId !== "cached-user") qs.set("userId", params.userId);
  if (params.userName) qs.set("userName", params.userName);
  const str = qs.toString();
  return str ? `/api/liff/hub?${str}` : "/api/liff/hub";
}

/**
 * 同期的にキャッシュ済みデータを取得する（初期 state への 0ms ハイドレーション用・L3 永続層も含む）
 */
export function peekLiffApiCache<T>(url: string): T | null {
  const key = normalizeCacheKey(url) || url;
  const entry = readFromCache<T>(key, true);
  return entry ? entry.data : null;
}

function isTransientHttpStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

async function executeGetSnapshotWithRetry(params: {
  rawUrl: string;
  input: RequestInfo | URL;
  init?: RequestInit;
  cacheKey: string;
  timeoutMs: number;
  startEpoch: number;
  masterAbortSignal: AbortSignal;
  callerSignal?: AbortSignal | null;
  maxAttempts?: number;
}): Promise<RawFetchSnapshot> {
  const baseFetch = getNativeFetch();
  const totalAttempts = params.maxAttempts ?? 2;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const attemptTimeout =
      attempt === 0 && totalAttempts > 1
        ? Math.min(params.timeoutMs, FOREGROUND_ATTEMPT_TIMEOUT_MS)
        : params.timeoutMs;

    const useMasterSignal = attempt === 0 && !params.masterAbortSignal.aborted;
    const { controller: attemptController, cleanup } = createTimedSignal(
      attemptTimeout,
      params.callerSignal || (useMasterSignal ? params.masterAbortSignal : undefined)
    );

    const onMasterAbort = () => {
      try {
        attemptController.abort();
      } catch {}
    };
    if (useMasterSignal && params.callerSignal && params.masterAbortSignal !== params.callerSignal) {
      params.masterAbortSignal.addEventListener("abort", onMasterAbort, { once: true });
    }

    try {
      await ensureClientAuthReadyIfNeeded(params.rawUrl);
      // リトライ時は直前に LIFF SDK 側で解決・自己修復された最新 userId / セッショントークンを再付与し、cache: "reload" でハーフオープン接続を回避
      const { nextInput, nextInit } = withSameOriginApiAuthHeaders(
        params.rawUrl,
        params.input,
        params.init
      );
      const res = await baseFetch(nextInput, {
        ...nextInit,
        cache: attempt === 0 ? "no-store" : "reload",
        signal: attemptController.signal,
      });

      captureLiffSessionProofFromResponse(res);

      if (
        res.status === 401 &&
        attempt + 1 < totalAttempts &&
        Boolean(resolveActiveLiffAccessTokenFromSdk())
      ) {
        await sleepMs(60);
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      const bodyText = await res.text();

      if (res.status === 403) {
        purgeForbiddenCacheKey(params.cacheKey);
        return {
          status: res.status,
          statusText: res.statusText,
          contentType: contentType || "application/json; charset=utf-8",
          bodyText,
          isForbiddenResponse: true,
          isTransientFailure: false,
        };
      }

      let parsedJson: unknown = undefined;
      let hasParsedJson = false;
      let isPayloadForbidden = false;
      let isPayloadExplicitError = false;

      if (contentType.includes("application/json") && bodyText) {
        try {
          parsedJson = JSON.parse(bodyText) as unknown;
          hasParsedJson = true;
          if (parsedJson && typeof parsedJson === "object") {
            const rec = parsedJson as Record<string, unknown>;
            if (rec.isForbidden === true) {
              isPayloadForbidden = true;
            } else if (rec.success === false) {
              isPayloadExplicitError = true;
            }
          }
        } catch {
          hasParsedJson = false;
        }
      }

      if (isPayloadForbidden) {
        purgeForbiddenCacheKey(params.cacheKey);
        return {
          status: res.status,
          statusText: res.statusText,
          contentType: contentType || "application/json; charset=utf-8",
          bodyText,
          isForbiddenResponse: true,
          isTransientFailure: false,
        };
      }

      const transientFailure =
        isTransientHttpStatus(res.status) || (res.ok && isPayloadExplicitError);

      if (!transientFailure) {
        if (res.ok && hasParsedJson && params.startEpoch === cacheMutationEpoch) {
          writeToCache(params.cacheKey, parsedJson);
        }
        return {
          status: res.status,
          statusText: res.statusText,
          contentType: contentType || "application/json; charset=utf-8",
          bodyText,
          isForbiddenResponse: false,
          isTransientFailure: false,
        };
      }

      const isForegroundOrUnknown =
        typeof document === "undefined" || document.visibilityState !== "hidden";
      if (attempt + 1 < totalAttempts && !params.callerSignal?.aborted && isForegroundOrUnknown) {
        await sleepMs(AUTO_RETRY_BACKOFF_MS);
        continue;
      }

      return {
        status: res.status,
        statusText: res.statusText,
        contentType: contentType || "application/json; charset=utf-8",
        bodyText,
        isForbiddenResponse: false,
        isTransientFailure: true,
      };
    } catch (err) {
      if (params.callerSignal?.aborted) {
        throw err;
      }
      const isForegroundOrUnknown =
        typeof document === "undefined" || document.visibilityState !== "hidden";
      if (attempt + 1 < totalAttempts && isForegroundOrUnknown) {
        await sleepMs(params.masterAbortSignal.aborted ? 40 : AUTO_RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    } finally {
      cleanup();
      if (useMasterSignal && params.callerSignal && params.masterAbortSignal !== params.callerSignal) {
        params.masterAbortSignal.removeEventListener("abort", onMasterAbort);
      }
    }
  }

  throw new Error("LIFF_FETCH_RETRY_EXHAUSTED");
}

/**
 * 重複排除・タイムアウト保護・自動リトライ・Stale-If-Error 救済付きのネットワーク JSON フェッチ
 */
export async function fetchLiffJsonFresh<T>(
  urlOrKey: string,
  options?: {
    timeoutMs?: number;
    disableStaleFallback?: boolean;
    maxAttempts?: number;
  }
): Promise<T> {
  const fetchUrl = extractPathFromCacheKey(urlOrKey);
  const key = normalizeCacheKey(fetchUrl) || urlOrKey;

  let tracked = inflightRequests.get(key);
  if (!tracked) {
    const startEpoch = cacheMutationEpoch;
    const timeoutMs = options?.timeoutMs ?? FOREGROUND_GET_TIMEOUT_MS;
    const masterController = new AbortController();

    const networkPromise = (async () => {
      try {
        const snap = await executeGetSnapshotWithRetry({
          rawUrl: fetchUrl,
          input: fetchUrl,
          cacheKey: key,
          timeoutMs,
          startEpoch,
          masterAbortSignal: masterController.signal,
          maxAttempts: options?.maxAttempts ?? 2,
        });
        if (snap.status < 200 || snap.status >= 300) {
          const statusErr = new Error(`HTTP ${snap.status}`) as Error & {
            httpStatus?: number;
            isForbidden?: boolean;
          };
          statusErr.httpStatus = snap.status;
          statusErr.isForbidden = snap.isForbiddenResponse;
          throw statusErr;
        }
        const parsed = JSON.parse(snap.bodyText) as T;
        if (parsed && typeof parsed === "object") {
          const rec = parsed as Record<string, unknown>;
          if (rec.success === false && rec.isForbidden !== true) {
            throw new Error(
              typeof rec.error === "string" ? rec.error : "API_SUCCESS_FALSE"
            );
          }
        }
        return parsed;
      } finally {
        const current = inflightRequests.get(key);
        if (current && current.controller === masterController) {
          inflightRequests.delete(key);
        }
      }
    })();

    tracked = {
      promise: networkPromise,
      controller: masterController,
      startedAt: Date.now(),
    };
    inflightRequests.set(key, tracked);
  }

  try {
    return (await tracked.promise) as T;
  } catch (err) {
    const errObj = err as { httpStatus?: number; isForbidden?: boolean } | null;
    if (
      !options?.disableStaleFallback &&
      errObj?.httpStatus !== 403 &&
      !errObj?.isForbidden
    ) {
      const stale = readStaleFallbackEntry<T>(key);
      if (stale) {
        return stale.data;
      }
    }
    throw err;
  }
}

/**
 * Stale-While-Revalidate で JSON を取得する
 */
export async function fetchLiffJsonSWR<T>(
  url: string,
  options?: {
    freshMs?: number;
    forceRefresh?: boolean;
    onRevalidate?: (freshData: T) => void;
  }
): Promise<T> {
  const key = normalizeCacheKey(url) || url;
  const freshMs = options?.freshMs ?? DEFAULT_FRESH_MS;

  if (!options?.forceRefresh) {
    const cached = readFromCache<T>(key, true);
    if (cached) {
      const age = Date.now() - cached.updatedAt;
      if (age > freshMs) {
        void fetchLiffJsonFresh<T>(key, {
          disableStaleFallback: true,
          maxAttempts: 2,
        })
          .then((freshData) => {
            options?.onRevalidate?.(freshData);
          })
          .catch(() => {});
      }
      return cached.data;
    }
  }

  return fetchLiffJsonFresh<T>(key);
}

/**
 * キャッシュを無効化する（POST / PUT / PATCH / DELETE 実行時に自動または明示呼び出し）
 */
export function invalidateLiffApiCache(
  prefixOrSubstring?: string,
  options?: { clearLastKnownGood?: boolean }
): void {
  cacheMutationEpoch += 1;
  lastCacheInvalidatedAt = Date.now();
  inflightRequests.clear();
  inflightRawRequests.clear();

  if (!prefixOrSubstring) {
    memoryCache.clear();
    if (options?.clearLastKnownGood) {
      lastKnownGoodCache.clear();
    }
    if (typeof window !== "undefined") {
      try {
        const sKeys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(SESSION_CACHE_PREFIX)) sKeys.push(k);
        }
        for (const k of sKeys) sessionStorage.removeItem(k);

        const lKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PERSISTENT_CACHE_PREFIX)) lKeys.push(k);
        }
        for (const k of lKeys) localStorage.removeItem(k);
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent(LIFF_CACHE_INVALIDATED_EVENT));
      } catch {}
    }
    return;
  }

  for (const key of Array.from(memoryCache.keys())) {
    if (key.includes(prefixOrSubstring)) {
      memoryCache.delete(key);
    }
  }
  if (options?.clearLastKnownGood) {
    for (const key of Array.from(lastKnownGoodCache.keys())) {
      if (key.includes(prefixOrSubstring)) {
        lastKnownGoodCache.delete(key);
      }
    }
  }

  if (typeof window !== "undefined") {
    try {
      const sKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SESSION_CACHE_PREFIX) && k.includes(prefixOrSubstring)) {
          sKeys.push(k);
        }
      }
      for (const k of sKeys) sessionStorage.removeItem(k);

      const lKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PERSISTENT_CACHE_PREFIX) && k.includes(prefixOrSubstring)) {
          lKeys.push(k);
        }
      }
      for (const k of lKeys) localStorage.removeItem(k);
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(LIFF_CACHE_INVALIDATED_EVENT));
    } catch {}
  }
}

/**
 * 🚀 全LIFFページの `fetch('/api/...')` を自動的に SWR 即時応答＋同時リクエスト統合＋自動リトライ＋Stale-If-Error 救済化するアクセラレータ
 */
export function installLiffFastFetchCache(): void {
  if (typeof window === "undefined" || isGlobalFastFetchInstalled) return;
  purgeLegacySessionCache();
  const baseFetch = getNativeFetch();
  isGlobalFastFetchInstalled = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      lastDocumentHiddenAt = Date.now();
    } else if (document.visibilityState === "visible") {
      abortZombieInflightRequests(RESUME_ZOMBIE_THRESHOLD_MS, lastDocumentHiddenAt);
    }
  });

  window.addEventListener("pageshow", (event: PageTransitionEvent) => {
    if (event.persisted) {
      abortZombieInflightRequests(0, Date.now());
    }
  });

  window.addEventListener("online", () => {
    abortZombieInflightRequests(2_500, lastDocumentHiddenAt);
  });

  window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, () => {
    abortZombieInflightRequests(RESUME_ZOMBIE_THRESHOLD_MS, lastDocumentHiddenAt);
  });

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    // 1. `/api/*` 以外の通信（Next.js RSC `.txt`・静的チャンク・外部API）は一切触れずにそのままネイティブ fetch へ直渡し
    if (!isSameOriginApiRequestUrl(rawUrl)) {
      return baseFetch(input, init);
    }

    const method = (
      init?.method ||
      (input instanceof Request ? input.method : "GET") ||
      "GET"
    ).toUpperCase();

    const cacheKey = normalizeCacheKey(rawUrl);

    // 2. キャッシュ対象外の `/api/*`（認証API・画像バイナリ・ポーリング専用API等）はヘッダー付与済みでそのまま委譲
    if (!cacheKey) {
      await ensureClientAuthReadyIfNeeded(rawUrl);
      const { nextInput, nextInit } = withSameOriginApiAuthHeaders(rawUrl, input, init);
      const res = await baseFetch(nextInput, nextInit);
      captureLiffSessionProofFromResponse(res);
      if (
        res.status === 401 &&
        !(input instanceof Request) &&
        Boolean(resolveActiveLiffAccessTokenFromSdk())
      ) {
        const retriedAuth = withSameOriginApiAuthHeaders(rawUrl, input, init);
        const retriedRes = await baseFetch(retriedAuth.nextInput, retriedAuth.nextInit);
        captureLiffSessionProofFromResponse(retriedRes);
        return retriedRes;
      }
      return res;
    }

    // 3. 更新系リクエスト（POST / PUT / PATCH / DELETE）：ハング防止タイムアウト保護＋完了時1回のみキャッシュ無効化
    if (method !== "GET") {
      await ensureClientAuthReadyIfNeeded(rawUrl);
      const { nextInput, nextInit } = withSameOriginApiAuthHeaders(rawUrl, input, init);
      const callerMutationSignal =
        init?.signal || (input instanceof Request ? input.signal : null);
      const isAiRequest =
        rawUrl.includes("/ai-discover") ||
        rawUrl.includes("/ai-lookup") ||
        rawUrl.includes("/analyze-inning") ||
        rawUrl.includes("/news-generator");
      const isReadOnlyAiPost =
        rawUrl.includes("/ai-discover") || rawUrl.includes("/ai-lookup");
      const isUploadBody =
        rawUrl.includes("/upload") ||
        rawUrl.includes("/photos") ||
        rawUrl.includes("/logo") ||
        rawUrl.includes("/cover") ||
        (typeof FormData !== "undefined" && init?.body instanceof FormData) ||
        (typeof Blob !== "undefined" && init?.body instanceof Blob);
      const mutationTimeoutMs = isAiRequest
        ? AI_REQUEST_TIMEOUT_MS
        : isUploadBody
          ? MUTATION_UPLOAD_TIMEOUT_MS
          : MUTATION_JSON_TIMEOUT_MS;
      const { controller: mutController, cleanup: cleanupMut } = createTimedSignal(
        mutationTimeoutMs,
        callerMutationSignal
      );
      try {
        let res = await baseFetch(nextInput, {
          ...nextInit,
          signal: mutController.signal,
        });
        captureLiffSessionProofFromResponse(res);
        if (
          res.status === 401 &&
          !(input instanceof Request) &&
          !(typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream) &&
          Boolean(resolveActiveLiffAccessTokenFromSdk())
        ) {
          const retriedAuth = withSameOriginApiAuthHeaders(rawUrl, input, init);
          res = await baseFetch(retriedAuth.nextInput, {
            ...retriedAuth.nextInit,
            signal: mutController.signal,
          });
          captureLiffSessionProofFromResponse(res);
        }
        return res;
      } finally {
        cleanupMut();
        if (!isReadOnlyAiPost) {
          invalidateLiffApiCache();
        }
      }
    }

    // 明示的バイパスヘッダー（手動更新ボタン等）がある場合はキャッシュを読まず最新取得して上書き
    let bypassCache = false;
    if (init?.headers) {
      try {
        const hdrs = new Headers(init.headers);
        bypassCache = hdrs.get("x-iscore-bypass-cache") === "1";
      } catch {}
    }

    // 4. GET リクエスト：直近120秒以内のフレッシュ／準フレッシュキャッシュは 0ms で Response を即返却（30秒超なら裏で再検証）
    // ※ L3 対象エンドポイントは L1 メモリ消失後も L3 から高速読取する
    const cached = !bypassCache ? readFromCache<unknown>(cacheKey, true) : null;
    if (cached) {
      const age = Date.now() - cached.updatedAt;
      if (age <= FAST_RETURN_STALE_MS) {
        if (age > DEFAULT_FRESH_MS) {
          void fetchLiffJsonFresh(cacheKey, {
            timeoutMs: WARMUP_GET_TIMEOUT_MS,
            disableStaleFallback: true,
            maxAttempts: 1,
          }).catch(() => {});
        }
        return new Response(JSON.stringify(cached.data), {
          status: 200,
          statusText: "OK",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-iScore-SWR": "HIT",
          },
        });
      }
    }

    const buildStaleErrorRescueResponse = (): Response | null => {
      if (bypassCache) return null;
      const stale = readStaleFallbackEntry<unknown>(cacheKey);
      if (!stale) return null;
      return new Response(JSON.stringify(stale.data), {
        status: 200,
        statusText: "OK",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-iScore-SWR": "STALE-IF-ERROR",
        },
      });
    };

    // 呼び出し元独自の AbortSignal が既に指定されている場合は共有統合せず個別にタイムアウト＆リトライ保護実行
    const callerSignal =
      init?.signal || (input instanceof Request ? input.signal : null);
    if (callerSignal) {
      const masterController = new AbortController();
      const startEpoch = cacheMutationEpoch;
      try {
        const snap = await executeGetSnapshotWithRetry({
          rawUrl,
          input,
          init,
          cacheKey,
          timeoutMs: FOREGROUND_GET_TIMEOUT_MS,
          startEpoch,
          masterAbortSignal: masterController.signal,
          callerSignal,
          maxAttempts: 2,
        });
        if (snap.isTransientFailure && !snap.isForbiddenResponse) {
          const rescued = buildStaleErrorRescueResponse();
          if (rescued) return rescued;
        }
        return new Response(snap.bodyText, {
          status: snap.status,
          statusText: snap.statusText,
          headers: {
            "Content-Type": snap.contentType,
          },
        });
      } catch (err) {
        if (!callerSignal.aborted) {
          const rescued = buildStaleErrorRescueResponse();
          if (rescued) return rescued;
        }
        throw err;
      }
    }

    // 5. キャッシュミスまたは120秒超の古いスナップショット時：同一 URL への同時リクエストを自動リトライ＆タイムアウト付きで 1 本に統合
    let tracked = inflightRawRequests.get(cacheKey);
    if (!tracked) {
      const startEpoch = cacheMutationEpoch;
      const masterController = new AbortController();
      const pending = (async (): Promise<RawFetchSnapshot> => {
        try {
          return await executeGetSnapshotWithRetry({
            rawUrl,
            input,
            init,
            cacheKey,
            timeoutMs: FOREGROUND_GET_TIMEOUT_MS,
            startEpoch,
            masterAbortSignal: masterController.signal,
            maxAttempts: 2,
          });
        } finally {
          const current = inflightRawRequests.get(cacheKey);
          if (current && current.controller === masterController) {
            inflightRawRequests.delete(cacheKey);
          }
        }
      })();
      tracked = {
        promise: pending,
        controller: masterController,
        startedAt: Date.now(),
      };
      inflightRawRequests.set(cacheKey, tracked);
    }

    try {
      const snap = await tracked.promise;
      if (snap.isTransientFailure && !snap.isForbiddenResponse) {
        const rescued = buildStaleErrorRescueResponse();
        if (rescued) return rescued;
      }
      return new Response(snap.bodyText, {
        status: snap.status,
        statusText: snap.statusText,
        headers: {
          "Content-Type": snap.contentType,
        },
      });
    } catch (err) {
      const rescued = buildStaleErrorRescueResponse();
      if (rescued) return rescued;
      throw err;
    }
  };
}

function triggerWarmupUrl(url: string): void {
  if (typeof document !== "undefined" && document.hidden) return;
  const key = normalizeCacheKey(url) || url;
  const existing = readFromCache(key, false);
  if (existing && Date.now() - existing.updatedAt <= DEFAULT_FRESH_MS) {
    return;
  }
  if (!inflightRequests.has(key) && !inflightRawRequests.has(key)) {
    void fetchLiffJsonFresh(key, {
      timeoutMs: WARMUP_GET_TIMEOUT_MS,
      disableStaleFallback: true,
      maxAttempts: 1,
    }).catch(() => {});
  }
}

/**
 * ⚡ 指が触れた瞬間（`onPointerDown`）に遷移先ルートに対応する API を100ms先回りプリフェッチする
 */
export function warmupLiffEndpointForHref(
  href: string,
  teamIdOverride?: string | null
): void {
  if (typeof window === "undefined" || !href) return;
  const cleanPath = href.split("#")[0].split("?")[0];
  const tid =
    teamIdOverride ||
    localStorage.getItem("iscore_selectedTeamId") ||
    "demo-team";
  const uid =
    localStorage.getItem("iscore_user_id") ||
    localStorage.getItem("iscore_userId") ||
    "";
  const rawName = localStorage.getItem("iscore_user_name") || "";
  const cachedMemberId = localStorage.getItem(`iscore_member_id_${tid}`) || "";

  if (cleanPath === "/liff") {
    triggerWarmupUrl(buildLiffHubUrl({ teamId: tid, userId: uid, userName: rawName }));
    return;
  }
  if (cleanPath === "/liff/schedule") {
    const qs = new URLSearchParams({ teamId: tid, userId: uid, userName: rawName });
    if (cachedMemberId) qs.set("memberId", cachedMemberId);
    triggerWarmupUrl(`/api/liff/schedule?${qs.toString()}`);
    return;
  }
  if (cleanPath === "/liff/schedule/board") {
    const qs = new URLSearchParams({ teamId: tid, userId: uid, userName: rawName });
    if (cachedMemberId) qs.set("memberId", cachedMemberId);
    triggerWarmupUrl(`/api/liff/attendance-matrix?${qs.toString()}`);
    return;
  }
  if (cleanPath === "/liff/matches") {
    triggerWarmupUrl(`/api/liff/matches?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/carpool") {
    triggerWarmupUrl(`/api/liff/carpool?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/stats") {
    triggerWarmupUrl(`/api/liff/stats?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/team") {
    triggerWarmupUrl(`/api/liff/team-info?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/players") {
    const pQs = new URLSearchParams({ teamId: tid });
    if (uid) pQs.set("userId", uid);
    if (rawName) pQs.set("userName", rawName);
    triggerWarmupUrl(`/api/liff/players?${pQs.toString()}`);
    return;
  }
  if (cleanPath === "/liff/players/growth") {
    triggerWarmupUrl(`/api/liff/players/growth?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/grounds") {
    triggerWarmupUrl(`/api/liff/grounds?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/rules") {
    triggerWarmupUrl(`/api/liff/rules?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/documents") {
    triggerWarmupUrl(`/api/liff/documents?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/gallery") {
    triggerWarmupUrl(`/api/liff/gallery?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/faq") {
    triggerWarmupUrl(`/api/liff/faqs?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/links") {
    triggerWarmupUrl(`/api/liff/links?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/related-teams") {
    triggerWarmupUrl(`/api/liff/related-teams?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/baseball-board") {
    const pQs = new URLSearchParams({ teamId: tid });
    if (uid) pQs.set("userId", uid);
    if (rawName) pQs.set("userName", rawName);
    triggerWarmupUrl(`/api/liff/players?${pQs.toString()}`);
    return;
  }
  if (cleanPath === "/liff/admin" || cleanPath === "/liff/admin/roles") {
    const aQs = new URLSearchParams({ teamId: tid });
    if (uid) aQs.set("userId", uid);
    triggerWarmupUrl(`/api/liff/admin/dashboard?${aQs.toString()}`);
    return;
  }
  const adminMgmtSubMap: Record<string, string> = {
    "/liff/admin/teams": "teams",
    "/liff/admin/cars": "cars",
    "/liff/admin/family": "family",
    "/liff/admin/tournaments": "tournaments",
    "/liff/admin/equipments": "equipments",
  };
  const mgmtEndpoint = adminMgmtSubMap[cleanPath];
  if (mgmtEndpoint) {
    triggerWarmupUrl(
      `/api/liff/admin/mgmt/${mgmtEndpoint}?teamId=${encodeURIComponent(tid)}`
    );
  }
}

/**
 * ⚡ 試合カードの「しおり・詳細 / スコア・詳細」ボタンに指が触れた瞬間に試合詳細API群を先行フェッチする
 */
export function warmupLiffMatchDetail(
  matchId: string,
  isScheduledMatch: boolean,
  teamIdOverride?: string | null
): void {
  if (typeof window === "undefined" || !matchId || matchId.startsWith("demo-match-")) {
    return;
  }
  const tid =
    teamIdOverride ||
    localStorage.getItem("iscore_selectedTeamId") ||
    "";
  if (!tid || tid === "demo-team") return;

  const uid =
    localStorage.getItem("iscore_user_id") ||
    localStorage.getItem("iscore_userId") ||
    "";
  const rawName = localStorage.getItem("iscore_user_name") || "";

  triggerWarmupUrl(`/api/matches/${encodeURIComponent(matchId)}`);

  if (isScheduledMatch) {
    const opsQs = new URLSearchParams({ teamId: tid });
    if (uid) opsQs.set("userId", uid);
    if (rawName) opsQs.set("userName", rawName);
    triggerWarmupUrl(`/api/liff/match-ops-context?${opsQs.toString()}`);
  } else {
    triggerWarmupUrl(`/api/matches/${encodeURIComponent(matchId)}/stats`);
    triggerWarmupUrl(
      `/api/liff/scorebook/match-bundle?matchId=${encodeURIComponent(matchId)}&teamId=${encodeURIComponent(tid)}`
    );
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitUntilDocumentVisible(): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onVisible = () => {
      if (!document.hidden) {
        document.removeEventListener("visibilitychange", onVisible);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
  });
}

async function runPolitePrefetchWorker(expectedGen: number): Promise<void> {
  if (isPrefetchWorkerRunning) return;
  isPrefetchWorkerRunning = true;
  try {
    await sleepMs(700);
    while (prefetchQueue.length > 0 && expectedGen === prefetchGeneration) {
      if (typeof document !== "undefined" && document.hidden) {
        await waitUntilDocumentVisible();
        continue;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        break;
      }
      // フォアグラウンドのAPI読込中は帯域・コネクション枠を100%譲る（ヘッダーアイコンや表示中画面の読込を最優先）
      if (inflightRawRequests.size > 0) {
        await sleepMs(250);
        continue;
      }
      const nextUrl = prefetchQueue.shift();
      if (!nextUrl) break;

      const key = normalizeCacheKey(nextUrl) || nextUrl;
      const existing = readFromCache(key, false);
      if (!existing && !inflightRequests.has(key) && !inflightRawRequests.has(key)) {
        await fetchLiffJsonFresh(key, {
          timeoutMs: WARMUP_GET_TIMEOUT_MS,
          disableStaleFallback: true,
          maxAttempts: 1,
        }).catch(() => {});
        await sleepMs(120);
      }
    }
  } finally {
    isPrefetchWorkerRunning = false;
    if (prefetchQueue.length > 0 && expectedGen === prefetchGeneration) {
      void runPolitePrefetchWorker(prefetchGeneration);
    }
  }
}

/**
 * アイドル時に主要画面（＋ボトムナビのカスタム割当画面）の API データを1本ずつ直列プリフェッチし、
 * 画像・アイコンやフォアグラウンド通信のコネクション枠を一切圧迫せずにタブ切替を体感 0ms にする
 */
export function prefetchLiffCoreEndpoints(params: {
  teamId: string;
  userId?: string;
  userName?: string;
}): void {
  if (typeof window === "undefined" || !params.teamId) return;

  const tid = params.teamId;
  const uid = params.userId && params.userId !== "cached-user" ? params.userId : "";
  const rawName = params.userName || "";
  const cachedMemberId = localStorage.getItem(`iscore_member_id_${tid}`) || "";

  const schedParams = new URLSearchParams({
    teamId: tid,
    userId: uid,
    userName: rawName,
  });
  if (cachedMemberId) schedParams.set("memberId", cachedMemberId);

  const urlSet = new Set<string>([
    `/api/liff/schedule?${schedParams.toString()}`,
    `/api/liff/matches?teamId=${encodeURIComponent(tid)}`,
  ]);

  // 活動予定ページ・出欠一覧表の即時表示用（ユーザーID確定後またはデモ時のみ）
  if (uid || tid === "demo-team") {
    urlSet.add(
      `/api/liff/my-family?teamId=${encodeURIComponent(tid)}&userId=${encodeURIComponent(uid)}&userName=${encodeURIComponent(rawName)}`
    );
    const matrixQs = new URLSearchParams({
      teamId: tid,
      userId: uid,
      userName: rawName,
    });
    if (cachedMemberId) matrixQs.set("memberId", cachedMemberId);
    urlSet.add(`/api/liff/attendance-matrix?${matrixQs.toString()}`);
  }

  // ボトムナビの中央3枠にカスタム設定されている画面のAPIも自動プリフェッチ対象に含める
  try {
    const rawNav = localStorage.getItem("iscore-liff-bottom-nav-v1");
    if (rawNav) {
      const parsedNav = JSON.parse(rawNav) as {
        leftId?: string;
        centerId?: string;
        rightId?: string;
      };
      const customSlotIds = [parsedNav.leftId, parsedNav.centerId, parsedNav.rightId];
      for (const slotId of customSlotIds) {
        if (slotId === "carpool") {
          urlSet.add(`/api/liff/carpool?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "stats") {
          urlSet.add(`/api/liff/stats?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "players") {
          const pQs = new URLSearchParams({ teamId: tid });
          if (uid) pQs.set("userId", uid);
          if (rawName) pQs.set("userName", rawName);
          urlSet.add(`/api/liff/players?${pQs.toString()}`);
        } else if (slotId === "grounds") {
          urlSet.add(`/api/liff/grounds?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "rules") {
          urlSet.add(`/api/liff/rules?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "documents") {
          urlSet.add(`/api/liff/documents?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "gallery") {
          urlSet.add(`/api/liff/gallery?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "links") {
          urlSet.add(`/api/liff/links?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "related_teams") {
          urlSet.add(`/api/liff/related-teams?teamId=${encodeURIComponent(tid)}`);
        } else if (slotId === "baseball_board") {
          const pQs = new URLSearchParams({ teamId: tid });
          if (uid) pQs.set("userId", uid);
          if (rawName) pQs.set("userName", rawName);
          urlSet.add(`/api/liff/players?${pQs.toString()}`);
        }
      }
    }
  } catch {
    // ignore storage parse errors
  }

  prefetchGeneration += 1;
  prefetchQueue = Array.from(urlSet);
  void runPolitePrefetchWorker(prefetchGeneration);
}
