// filepath: src/lib/r2-cleanup.ts
import { purgeR2EdgeCacheKeys } from "@/lib/r2-edge-cache";

/**
 * 🧹 R2 オブジェクトストレージ 孤立ファイル防止・安全クリーンアップヘルパー
 * - アプリ内配信パス（`/api/documents/files/...`・`/api/images/...`）から正規 R2 キーを安全に逆引き
 * - パストラバーサル（`..`）や外部URL（`https://...`）は一切削除対象にしない
 */

export function extractR2KeyFromAppUrl(
  rawUrl: string | null | undefined
): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\")) {
    return null;
  }

  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  const qIdx = pathname.indexOf("?");
  if (qIdx >= 0) {
    pathname = pathname.slice(0, qIdx);
  }
  const hashIdx = pathname.indexOf("#");
  if (hashIdx >= 0) {
    pathname = pathname.slice(0, hashIdx);
  }

  if (pathname.startsWith("/api/documents/files/")) {
    const rel = pathname.slice("/api/documents/files/".length).replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return null;
    return `documents/${rel}`;
  }

  if (pathname.startsWith("/api/images/")) {
    const rel = pathname.slice("/api/images/".length).replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return null;
    return rel;
  }

  return null;
}

export async function deleteR2UrlsSafely(
  bucket: R2Bucket | null | undefined,
  urls: ReadonlyArray<string | null | undefined>
): Promise<number> {
  if (!bucket || urls.length === 0) return 0;

  const uniqueKeys = new Set<string>();
  for (const u of urls) {
    const key = extractR2KeyFromAppUrl(u);
    if (key) uniqueKeys.add(key);
  }
  if (uniqueKeys.size === 0) return 0;

  const keys = Array.from(uniqueKeys);
  const CHUNK_SIZE = 500;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    try {
      await bucket.delete(chunk);
      deleted += chunk.length;
    } catch {
      // 個別フォールバックで他キーの削除漏れを防ぐ
      for (const k of chunk) {
        try {
          await bucket.delete(k);
          deleted += 1;
        } catch {
          // ignore single missing/locked key
        }
      }
    }
  }
  await purgeR2EdgeCacheKeys(keys);
  return deleted;
}
