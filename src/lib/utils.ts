// filepath: src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 外部リンク・トーナメント表URLなどの安全な HTTP/HTTPS スキーム検証（javascript: / data: 等による Stored XSS 防止）
 */
export function validateSafeHttpUrl(
  rawUrl: string | null | undefined,
  options?: { allowEmpty?: boolean }
): { ok: true; url: string | null } | { ok: false; error: string } {
  const allowEmpty = options?.allowEmpty ?? true;
  const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!trimmed) {
    return allowEmpty
      ? { ok: true, url: null }
      : { ok: false, error: "URLを入力してください" };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        ok: false,
        error: "URLは https:// または http:// で始まる有効なアドレスを指定してください",
      };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return {
      ok: false,
      error: "URLの形式が正しくありません（https:// から始まるアドレスを入力してください）",
    };
  }
}

/**
 * UI の <a href> 描画時に万一の不正スキーム（javascript: 等）を無害化する純粋ヘルパー
 */
export function sanitizeSafeExternalHref(
  rawUrl: string | null | undefined,
  fallback = "#"
): string {
  const res = validateSafeHttpUrl(rawUrl, { allowEmpty: false });
  return res.ok && res.url ? res.url : fallback;
}
