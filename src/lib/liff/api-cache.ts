// filepath: src/lib/liff/api-cache.ts

/**
 * ⚡ LIFF 爆速表示エンジン（3層SWRキャッシュ: L1 Memory + L2 sessionStorage + L3 localStorage 永続スナップショット）
 * - 画面遷移時はもちろん、LINEミニアプリを一度閉じて開き直したコールド起動時でも **1フレーム目（0ms）で即時返却** しスピナーをゼロにする。
 * - 指が触れた瞬間（`onPointerDown`）の先行プリフェッチ（`warmupLiffEndpointForHref` / `warmupLiffMatchDetail`）に対応。
 * - 同一URLへの同時フェッチ（LiffProvider と各ページの重複呼び出し等）を 1 本の通信に統合する。
 * - POST / PUT / PATCH / DELETE 実行時は自動で L1/L2/L3 全キャッシュを即時破棄し、更新結果を確実に反映する。
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
const DEFAULT_FRESH_MS = 15_000; // 15秒以内は完全フレッシュ扱い
const FAST_RETURN_STALE_MS = 90_000; // 90秒以内は window.fetch でも 0ms 即返却しつつ裏で再検証
const MAX_STALE_MS = 10 * 60_000; // L1/L2 セッション内は10分保持
const MAX_PERSISTENT_STALE_MS = 24 * 60 * 60_000; // L3 永続スナップショットは24時間保持（コールド起動0ms描画用）
const MAX_PERSISTENT_ENTRIES = 22;
const MAX_PERSISTENT_BYTES = 120_000;

const PERSISTENT_ELIGIBLE_PREFIXES = [
  "/api/liff/hub",
  "/api/liff/schedule",
  "/api/liff/matches",
  "/api/liff/carpool",
  "/api/liff/stats",
  "/api/liff/players",
  "/api/liff/grounds",
  "/api/liff/rules",
  "/api/liff/documents",
  "/api/liff/faqs",
  "/api/liff/links",
  "/api/liff/attendance-matrix",
  "/api/liff/my-family",
];

export const LIFF_CACHE_INVALIDATED_EVENT = "iscore:liff-cache-invalidated";

const memoryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();
const inflightRawRequests = new Map<string, Promise<RawFetchSnapshot>>();

let nativeFetchRef: typeof fetch | null = null;
let isGlobalFastFetchInstalled = false;
let hasPurgedLegacyCache = false;
let cacheMutationEpoch = 0;
let lastCacheInvalidatedAt = 0;

export function getLastLiffCacheInvalidatedAt(): number {
  return lastCacheInvalidatedAt;
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
    return trimmed && !IGNORED_CLIENT_USER_IDS.has(trimmed) ? trimmed : "";
  } catch {
    return "";
  }
}

function getActiveClientUserName(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem("iscore_user_name") || "").trim();
  } catch {
    return "";
  }
}

function extractPathFromCacheKey(key: string): string {
  const sepIdx = key.indexOf("::");
  return sepIdx >= 0 ? key.slice(sepIdx + 2) : key;
}

function shouldAttachClientAuthHeaders(rawUrl: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(rawUrl, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    if (!u.pathname.startsWith("/api/")) return false;
    if (
      u.pathname.startsWith("/api/auth/") ||
      u.pathname.startsWith("/api/images/")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
  if (!uid && !uName) {
    return { nextInput: input, nextInit: init };
  }
  try {
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
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
      return mem as CacheEntry<T>;
    }
    memoryCache.delete(key);
  }

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (parsed && typeof parsed.updatedAt === "number" && now - parsed.updatedAt <= MAX_STALE_MS) {
          memoryCache.set(key, parsed);
          return parsed;
        }
        sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
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

function writeToCache<T>(key: string, data: T): void {
  purgeLegacySessionCache();
  if (!shouldPersistResponseToCache(key, data)) {
    memoryCache.delete(key);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
        localStorage.removeItem(PERSISTENT_CACHE_PREFIX + key);
      } catch {}
    }
    return;
  }

  const entry: CacheEntry<T> = { data, updatedAt: Date.now() };
  memoryCache.set(key, entry);

  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify(entry);
      // 250KB超の巨大レスポンスはメモリキャッシュのみに保持し sessionStorage 圧迫を防ぐ
      if (serialized.length < 250_000) {
        sessionStorage.setItem(SESSION_CACHE_PREFIX + key, serialized);
      }
      // 主要画面の軽量レスポンス（120KB以下）は L3 localStorage にも保存し、次回LINE起動時の 0ms 表示を実現
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

/**
 * 重複排除付きのネットワーク JSON フェッチ（成功時キャッシュ更新・常にネイティブ fetch を使用）
 */
export async function fetchLiffJsonFresh<T>(urlOrKey: string): Promise<T> {
  const fetchUrl = extractPathFromCacheKey(urlOrKey);
  const key = normalizeCacheKey(fetchUrl) || urlOrKey;
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const startEpoch = cacheMutationEpoch;
  const baseFetch = getNativeFetch();
  const reqPromise = (async () => {
    try {
      const { nextInput, nextInit } = withSameOriginApiAuthHeaders(
        fetchUrl,
        fetchUrl,
        { cache: "no-store" }
      );
      const res = await baseFetch(nextInput, nextInit);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as T;
      if (startEpoch === cacheMutationEpoch) {
        writeToCache(key, json);
      }
      return json;
    } finally {
      inflightRequests.delete(key);
    }
  })();

  inflightRequests.set(key, reqPromise);
  return reqPromise;
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
        void fetchLiffJsonFresh<T>(key)
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
export function invalidateLiffApiCache(prefixOrSubstring?: string): void {
  cacheMutationEpoch += 1;
  lastCacheInvalidatedAt = Date.now();
  inflightRequests.clear();
  inflightRawRequests.clear();

  if (!prefixOrSubstring) {
    memoryCache.clear();
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
 * 🚀 全LIFFページの `fetch('/api/...')` を自動的に SWR 即時応答＋同時リクエスト統合化するアクセラレータ
 * - 90秒以内のキャッシュは `window.fetch` でも 0ms で即返却し、15秒超なら裏で静かに再検証する。
 * - 90秒超の L3 永続キャッシュは 1フレーム目の `peekLiffApiCache` で既に画面描画済みのため、`window.fetch` では最新データを取得して画面へ自動反映する。
 * - POST / PUT / PATCH / DELETE 通信が発生した瞬間に L1/L2/L3 全キャッシュを自動破棄するため古いデータが残らない。
 */
export function installLiffFastFetchCache(): void {
  if (typeof window === "undefined" || isGlobalFastFetchInstalled) return;
  purgeLegacySessionCache();
  const baseFetch = getNativeFetch();
  isGlobalFastFetchInstalled = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (
      init?.method ||
      (input instanceof Request ? input.method : "GET") ||
      "GET"
    ).toUpperCase();

    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const { nextInput, nextInit } = withSameOriginApiAuthHeaders(
      rawUrl,
      input,
      init
    );

    const cacheKey = normalizeCacheKey(rawUrl);

    // 対象外のURL（外部URL・認証API・画像バイナリ・ポーリング専用API等）はヘッダー付与済みでそのままネイティブ fetch へ委譲
    if (!cacheKey) {
      return baseFetch(nextInput, nextInit);
    }

    // 更新系リクエスト（POST / PUT / PATCH / DELETE）は実行直後にキャッシュを全クリアして最新状態を保証
    if (method !== "GET") {
      invalidateLiffApiCache();
      try {
        const res = await baseFetch(nextInput, nextInit);
        invalidateLiffApiCache();
        return res;
      } catch (err) {
        invalidateLiffApiCache();
        throw err;
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

    // GET リクエスト：直近90秒以内のキャッシュは 0ms で Response を即返却（15秒超なら裏で再検証）
    const cached = !bypassCache ? readFromCache<unknown>(cacheKey, false) : null;
    if (cached) {
      const age = Date.now() - cached.updatedAt;
      if (age <= FAST_RETURN_STALE_MS) {
        if (age > DEFAULT_FRESH_MS) {
          void fetchLiffJsonFresh(cacheKey).catch(() => {});
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

    // キャッシュミスまたは90秒超の古いスナップショット時：同一 URL への同時リクエストを 1 本に統合して最新取得
    let pending = inflightRawRequests.get(cacheKey);
    if (!pending) {
      const startEpoch = cacheMutationEpoch;
      pending = (async () => {
        try {
          const res = await baseFetch(nextInput, {
            ...nextInit,
            cache: "no-store",
          });
          const contentType = res.headers.get("content-type") || "";
          const bodyText = await res.text();

          if (
            res.ok &&
            contentType.includes("application/json") &&
            startEpoch === cacheMutationEpoch
          ) {
            try {
              const parsed = JSON.parse(bodyText) as unknown;
              writeToCache(cacheKey, parsed);
            } catch {}
          }

          return {
            status: res.status,
            statusText: res.statusText,
            contentType: contentType || "application/json; charset=utf-8",
            bodyText,
          };
        } finally {
          inflightRawRequests.delete(cacheKey);
        }
      })();
      inflightRawRequests.set(cacheKey, pending);
    }

    const snap = await pending;
    return new Response(snap.bodyText, {
      status: snap.status,
      statusText: snap.statusText,
      headers: {
        "Content-Type": snap.contentType,
      },
    });
  };
}

function triggerWarmupUrl(url: string): void {
  const key = normalizeCacheKey(url) || url;
  const existing = readFromCache(key, false);
  if (existing && Date.now() - existing.updatedAt <= DEFAULT_FRESH_MS) {
    return;
  }
  if (!inflightRequests.has(key) && !inflightRawRequests.has(key)) {
    void fetchLiffJsonFresh(key).catch(() => {});
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
  if (cleanPath === "/liff/faq") {
    triggerWarmupUrl(`/api/liff/faqs?teamId=${encodeURIComponent(tid)}`);
    return;
  }
  if (cleanPath === "/liff/links") {
    triggerWarmupUrl(`/api/liff/links?teamId=${encodeURIComponent(tid)}`);
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

/**
 * アイドル時に主要画面（＋ボトムナビのカスタム割当画面）の API データを段階的プリフェッチし、初回タブ切替すら体感 0ms にする
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
        }
      }
    }
  } catch {
    // ignore storage parse errors
  }

  const scheduleIdle = (fn: () => void, delayMs: number) => {
    setTimeout(() => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
          fn,
          { timeout: 1500 }
        );
      } else {
        fn();
      }
    }, delayMs);
  };

  Array.from(urlSet).forEach((url, index) => {
    scheduleIdle(() => {
      const key = normalizeCacheKey(url) || url;
      const existing = readFromCache(key, false);
      if (!existing && !inflightRequests.has(key) && !inflightRawRequests.has(key)) {
        void fetchLiffJsonFresh(key).catch(() => {});
      }
    }, 350 + index * 220);
  });
}
