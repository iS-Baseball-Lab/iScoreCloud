// filepath: src/lib/r2-edge-cache.ts

/**
 * ⚡ 認証通過後 R2 エッジキャッシュ ＆ ETag (304 Not Modified) 配信ヘルパー
 *
 * 【セキュリティ不変条件（超重要）】
 * - 本ヘルパーは必ず `createLiffTeamIsolationMiddleware` や `sharedTeamGuard` などの
 *   チーム所属・権限チェックを通過した「後」にのみ呼び出すこと。
 * - Cloudflare Edge Cache（`caches.default`）には Worker 内部専用の合成URLキーで格納し、
 *   クライアント（ブラウザ・外部プロキシ）へ返す HTTP レスポンスには必ず呼び出し元指定の
 *   `Cache-Control: private, ...` を付与して未認証キャッシュ汚染を100%防止する。
 */

const INTERNAL_CACHE_ORIGIN = "https://r2-edge-cache.iscorecloud.internal";
const MAX_EDGE_CACHEABLE_BYTES = 10 * 1024 * 1024; // 10 MiB

interface CloudflareCacheStorage extends CacheStorage {
  readonly default?: Cache;
}

function getEdgeDefaultCache(): Cache | null {
  if (typeof caches === "undefined") return null;
  const storage = caches as CloudflareCacheStorage;
  return storage.default ?? null;
}

export function buildInternalR2EdgeCacheUrl(r2Key: string): string {
  const cleanKey = r2Key.replace(/^\/+/, "");
  const encodedSegments = cleanKey
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${INTERNAL_CACHE_ORIGIN}/${encodedSegments}`;
}

export function matchesIfNoneMatch(
  ifNoneMatchHeader: string | null | undefined,
  etag: string | null | undefined
): boolean {
  if (!ifNoneMatchHeader || !etag) return false;
  const trimmedHeader = ifNoneMatchHeader.trim();
  if (!trimmedHeader) return false;
  if (trimmedHeader === "*") return true;

  const normalizeTag = (tag: string): string =>
    tag.trim().replace(/^W\//i, "").replace(/^"+|"+$/g, "");

  const target = normalizeTag(etag);
  if (!target) return false;

  const candidates = trimmedHeader.split(",");
  for (const candidate of candidates) {
    if (normalizeTag(candidate) === target) {
      return true;
    }
  }
  return false;
}

export interface ServeR2WithEdgeCacheOptions {
  bucket: R2Bucket;
  r2Key: string;
  requestHeaders: Headers;
  executionCtx?: Pick<ExecutionContext, "waitUntil"> | null;
  /** Edge Cache 保存秒数（0 以下の場合は Edge Cache へ保存せず R2 + 304 判定のみ行う） */
  edgeTtlSeconds?: number;
  buildResponseHeaders: (meta: {
    httpEtag: string;
    storedContentType: string;
  }) => Headers;
}

function buildNotModifiedResponse(headers: Headers): Response {
  const notModifiedHeaders = new Headers();
  const etag = headers.get("ETag") || headers.get("etag");
  const cacheControl = headers.get("Cache-Control");
  if (etag) notModifiedHeaders.set("ETag", etag);
  if (cacheControl) notModifiedHeaders.set("Cache-Control", cacheControl);
  notModifiedHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(null, { status: 304, headers: notModifiedHeaders });
}

export async function serveR2WithEdgeCache(
  options: ServeR2WithEdgeCacheOptions
): Promise<Response | null> {
  const {
    bucket,
    r2Key,
    requestHeaders,
    executionCtx,
    edgeTtlSeconds = 86400,
    buildResponseHeaders,
  } = options;

  const ifNoneMatch = requestHeaders.get("if-none-match");
  const edgeCache = edgeTtlSeconds > 0 ? getEdgeDefaultCache() : null;
  const cacheKeyReq = edgeCache
    ? new Request(buildInternalR2EdgeCacheUrl(r2Key), { method: "GET" })
    : null;

  // 1. Cloudflare Edge Cache ヒット確認（R2 往復ゼロ・1〜2ms 即応答）
  if (edgeCache && cacheKeyReq) {
    try {
      const cached = await edgeCache.match(cacheKeyReq);
      if (cached) {
        const cachedEtag = cached.headers.get("ETag") || "";
        const storedContentType =
          cached.headers.get("X-Stored-Content-Type") ||
          cached.headers.get("Content-Type") ||
          "";
        const clientHeaders = buildResponseHeaders({
          httpEtag: cachedEtag,
          storedContentType,
        });

        if (matchesIfNoneMatch(ifNoneMatch, cachedEtag)) {
          await cached.body?.cancel().catch(() => {});
          return buildNotModifiedResponse(clientHeaders);
        }

        return new Response(cached.body, {
          status: 200,
          headers: clientHeaders,
        });
      }
    } catch {
      // Edge Cache 一時障害時はそのまま R2 オリジン取得へフォールバック
    }
  }

  // 2. R2 オブジェクト取得
  const object = await bucket.get(r2Key);
  if (!object) {
    return null;
  }

  const rawMetaHeaders = new Headers();
  object.writeHttpMetadata(rawMetaHeaders);
  const storedContentType = rawMetaHeaders.get("content-type") || "";
  const clientHeaders = buildResponseHeaders({
    httpEtag: object.httpEtag,
    storedContentType,
  });

  // 3. ETag 一致時は本体転送ゼロで 304 Not Modified 応答
  if (matchesIfNoneMatch(ifNoneMatch, object.httpEtag)) {
    await object.body?.cancel().catch(() => {});
    return buildNotModifiedResponse(clientHeaders);
  }

  // 4. キャッシュ対象サイズ以内の場合、非同期で Edge Cache へ格納（レスポンスはブロックしない）
  if (
    edgeCache &&
    cacheKeyReq &&
    object.size > 0 &&
    object.size <= MAX_EDGE_CACHEABLE_BYTES &&
    object.body
  ) {
    try {
      const [clientStream, cacheStream] = object.body.tee();
      const cacheHeaders = new Headers();
      cacheHeaders.set(
        "Content-Type",
        clientHeaders.get("Content-Type") || "application/octet-stream"
      );
      cacheHeaders.set("ETag", object.httpEtag);
      if (storedContentType) {
        cacheHeaders.set("X-Stored-Content-Type", storedContentType);
      }
      cacheHeaders.set("Cache-Control", `public, max-age=${edgeTtlSeconds}`);

      const cachePutPromise = edgeCache
        .put(
          cacheKeyReq,
          new Response(cacheStream, { status: 200, headers: cacheHeaders })
        )
        .catch(() => {});

      if (executionCtx && typeof executionCtx.waitUntil === "function") {
        executionCtx.waitUntil(cachePutPromise);
      } else {
        void cachePutPromise;
      }

      return new Response(clientStream, {
        status: 200,
        headers: clientHeaders,
      });
    } catch {
      // ストリーム分岐失敗時はそのまま生ボディ返却
    }
  }

  return new Response(object.body, {
    status: 200,
    headers: clientHeaders,
  });
}

export async function purgeR2EdgeCacheKeys(
  r2Keys: ReadonlyArray<string>
): Promise<void> {
  const edgeCache = getEdgeDefaultCache();
  if (!edgeCache || r2Keys.length === 0) return;

  await Promise.all(
    r2Keys.map(async (key) => {
      if (!key) return;
      try {
        await edgeCache.delete(
          new Request(buildInternalR2EdgeCacheUrl(key), { method: "GET" })
        );
      } catch {
        // ignore cache eviction error
      }
    })
  );
}
