// filepath: src/lib/liff/api-cache.ts

/**
 * ⚡ LIFF 爆速表示エンジン（Stale-While-Revalidate + リクエスト重複排除 + sessionStorage 永続化）
 * - 画面遷移時、メモリまたは sessionStorage にキャッシュがあれば **0ms で即時返却** しスピナーをゼロにする。
 * - 同一URLへの同時フェッチ（LiffProvider と各ページの重複呼び出し等）を 1 本の通信に統合する。
 * - POST / PUT / PATCH / DELETE 実行時は自動でキャッシュを即時破棄し、更新結果を確実に反映する。
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

const LEGACY_SESSION_CACHE_PREFIX = "iscore_swr_v1:";
const SESSION_CACHE_PREFIX = "iscore_swr_v2:";
const DEFAULT_FRESH_MS = 15_000; // 15秒以内は完全フレッシュ扱い
const MAX_STALE_MS = 10 * 60_000; // 10分以内は即座に描画しつつ裏で再検証

const memoryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();
const inflightRawRequests = new Map<string, Promise<RawFetchSnapshot>>();

let nativeFetchRef: typeof fetch | null = null;
let isGlobalFastFetchInstalled = false;
let hasPurgedLegacyCache = false;

function purgeLegacySessionCache(): void {
  if (hasPurgedLegacyCache || typeof window === "undefined") return;
  hasPurgedLegacyCache = true;
  try {
    const obsoleteKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(LEGACY_SESSION_CACHE_PREFIX)) {
        obsoleteKeys.push(k);
      }
    }
    for (const k of obsoleteKeys) {
      sessionStorage.removeItem(k);
    }
  } catch {
    // ignore storage access errors
  }
}

function shouldPersistResponseToCache(key: string, data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const record = data as Record<string, unknown>;
  if (record.success === false) return false;

  // 認証ユーザー指定ありで権限（memberId / playerIds）が未解決のレスポンスはキャッシュ固定化させない（承認・統合直後の権限ロック防止）
  const hasIdentityQuery =
    (key.includes("userId=") && !key.includes("userId=&")) ||
    (key.includes("userName=") && !key.includes("userName=&"));

  if (hasIdentityQuery && key.startsWith("/api/liff/attendance-matrix")) {
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

  if (hasIdentityQuery && key.startsWith("/api/liff/my-family")) {
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
    pathname.startsWith("/api/seed")
  ) {
    return false;
  }
  return true;
}

function normalizeCacheKey(rawUrl: string): string | null {
  if (typeof window === "undefined") return rawUrl;
  try {
    const u = new URL(rawUrl, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    if (!shouldCacheApiPath(u.pathname)) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function readFromCache<T>(key: string): CacheEntry<T> | null {
  const mem = memoryCache.get(key);
  if (mem) {
    if (Date.now() - mem.updatedAt <= MAX_STALE_MS) {
      return mem as CacheEntry<T>;
    }
    memoryCache.delete(key);
  }

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (
          parsed &&
          typeof parsed.updatedAt === "number" &&
          Date.now() - parsed.updatedAt <= MAX_STALE_MS
        ) {
          memoryCache.set(key, parsed);
          return parsed;
        }
        sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      }
    } catch {
      // ignore storage quota / parse errors
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
 * 同期的にキャッシュ済みデータを取得する（初期 state への 0ms ハイドレーション用）
 */
export function peekLiffApiCache<T>(url: string): T | null {
  const key = normalizeCacheKey(url) || url;
  const entry = readFromCache<T>(key);
  return entry ? entry.data : null;
}

/**
 * 重複排除付きのネットワーク JSON フェッチ（成功時キャッシュ更新・常にネイティブ fetch を使用）
 */
export async function fetchLiffJsonFresh<T>(url: string): Promise<T> {
  const key = normalizeCacheKey(url) || url;
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const baseFetch = getNativeFetch();
  const reqPromise = (async () => {
    try {
      const res = await baseFetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as T;
      writeToCache(key, json);
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
    const cached = readFromCache<T>(key);
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
  if (!prefixOrSubstring) {
    memoryCache.clear();
    if (typeof window !== "undefined") {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          sessionStorage.removeItem(k);
        }
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
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SESSION_CACHE_PREFIX) && k.includes(prefixOrSubstring)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        sessionStorage.removeItem(k);
      }
    } catch {}
  }
}

/**
 * 🚀 全LIFFページの `fetch('/api/...')` を自動的に SWR 即時応答＋同時リクエスト統合化するアクセラレータ
 * - 各ページ個別の `{ cache: "no-store" }` 指定があっても、メモリ/セッションキャッシュがあれば 0ms で即返却し裏で最新化
 * - POST / PUT / PATCH / DELETE 通信が発生した瞬間に全キャッシュを自動破棄するため古いデータが残らない
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

    const cacheKey = normalizeCacheKey(rawUrl);

    // 対象外のURL（外部URL・認証API・画像バイナリ等）はそのままネイティブ fetch へ委譲
    if (!cacheKey) {
      return baseFetch(input, init);
    }

    // 更新系リクエスト（POST / PUT / PATCH / DELETE）は実行直後にキャッシュを全クリアして最新状態を保証
    if (method !== "GET") {
      invalidateLiffApiCache();
      try {
        const res = await baseFetch(input, init);
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

    // GET リクエスト：キャッシュヒット時は 0ms で Response を即返却し、古ければ裏で再検証
    const cached = !bypassCache ? readFromCache<unknown>(cacheKey) : null;
    if (cached) {
      const age = Date.now() - cached.updatedAt;
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

    // キャッシュミス時：同一 URL への同時リクエストを 1 本に統合
    let pending = inflightRawRequests.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        try {
          const res = await baseFetch(input, init);
          const contentType = res.headers.get("content-type") || "";
          const bodyText = await res.text();

          if (res.ok && contentType.includes("application/json")) {
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

/**
 * アイドル時に主要画面の API データを段階的プリフェッチし、初回タブ切替すら体感 0ms にする
 */
export function prefetchLiffCoreEndpoints(params: {
  teamId: string;
  userId?: string;
  userName?: string;
}): void {
  if (typeof window === "undefined" || !params.teamId) return;

  const uid = params.userId && params.userId !== "cached-user" ? params.userId : "";
  const uName = encodeURIComponent(params.userName || "");
  const cachedMemberId = localStorage.getItem(`iscore_member_id_${params.teamId}`) || "";

  const urls = [
    `/api/liff/schedule?teamId=${params.teamId}&userId=${uid}&userName=${uName}`,
    `/api/liff/matches?teamId=${params.teamId}`,
  ];

  // 出欠マトリクスはユーザーID確定後（またはデモ時）のみプリフェッチし、未認証状態の誤キャッシュを防止
  if (uid || params.teamId === "demo-team") {
    const matrixQs = new URLSearchParams({
      teamId: params.teamId,
      userId: uid,
      userName: params.userName || "",
    });
    if (cachedMemberId) matrixQs.set("memberId", cachedMemberId);
    urls.push(`/api/liff/attendance-matrix?${matrixQs.toString()}`);
  }

  urls.forEach((url, index) => {
    setTimeout(() => {
      const key = normalizeCacheKey(url) || url;
      if (!readFromCache(key) && !inflightRequests.has(key) && !inflightRawRequests.has(key)) {
        void fetchLiffJsonFresh(key).catch(() => {});
      }
    }, 450 + index * 250);
  });
}
