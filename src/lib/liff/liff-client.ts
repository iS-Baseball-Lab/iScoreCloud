// filepath: src/lib/liff/liff-client.ts
import type { Liff } from "@line/liff";
import { detectIsIPadDevice } from "@/lib/line-miniapp";

export interface LiffUserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export type LiffShareMessages = Parameters<Liff["shareTargetPicker"]>[0];

const LIFF_CONFIG_TIMEOUT_MS = 6_000;
const LIFF_INIT_TIMEOUT_MS = 10_000;
const LIFF_PROFILE_TIMEOUT_MS = 6_000;

let liffInstance: Liff | null = null;
let initializedLiffId: string | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(new Error(`${label}_TIMEOUT`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timerId);
        resolve(val);
      },
      (err: unknown) => {
        clearTimeout(timerId);
        reject(err);
      }
    );
  });
}

/**
 * LIFF SDKを初期化する（二重初期化防止およびモバイル回線スタック防止タイムアウト付き）
 */
export async function initLiff(
  liffId?: string
): Promise<{ liff: Liff | null; isMock: boolean; reason?: string }> {
  if (typeof window === "undefined") {
    return { liff: null, isMock: true, reason: "SSR" };
  }

  // 1. LIFF ID の優先順位: 引数 > URLクエリ > localStorage > 環境変数
  const urlParams = new URLSearchParams(window.location.search);
  const queryLiffId = urlParams.get("liffId");
  const storedLiffId = localStorage.getItem("iscore_liff_id");
  let targetLiffId =
    liffId || queryLiffId || storedLiffId || process.env.NEXT_PUBLIC_LIFF_ID;

  if (queryLiffId) {
    localStorage.setItem("iscore_liff_id", queryLiffId);
  }

  // すでに同一 LIFF ID で初期化完了済みの場合は再 init せず即返却
  if (liffInstance && targetLiffId && initializedLiffId === targetLiffId) {
    return { liff: liffInstance, isMock: false };
  }

  // 2. まだ LIFF ID が未確定の場合、Cloudflare Workers API (/api/liff/config) から自動フェッチ（セッション中1回のみ）
  if (!targetLiffId) {
    const checkedNoLiff = sessionStorage.getItem("iscore_liff_id_empty");
    if (!checkedNoLiff) {
      const controller = new AbortController();
      const timerId = setTimeout(() => {
        try {
          controller.abort();
        } catch {}
      }, LIFF_CONFIG_TIMEOUT_MS);
      try {
        const configRes = await fetch("/api/liff/config", {
          signal: controller.signal,
        });
        if (configRes.ok) {
          const configData = (await configRes.json()) as {
            success?: boolean;
            liffId?: string;
          };
          if (configData.liffId) {
            targetLiffId = configData.liffId;
            localStorage.setItem("iscore_liff_id", configData.liffId);
          } else {
            sessionStorage.setItem("iscore_liff_id_empty", "1");
          }
        }
      } catch {
        // ignore fetch error
      } finally {
        clearTimeout(timerId);
      }
    }
  }

  if (!targetLiffId) {
    console.warn("⚠️ LIFF ID is not configured. Running in mock fallback mode.");
    return { liff: null, isMock: true, reason: "LIFF_ID_NOT_CONFIGURED" };
  }

  if (liffInstance && initializedLiffId === targetLiffId) {
    return { liff: liffInstance, isMock: false };
  }

  try {
    const liff = (await withTimeout(
      import("@line/liff"),
      LIFF_INIT_TIMEOUT_MS,
      "LIFF_IMPORT"
    )).default;
    const isLineClientUa = /Line\//i.test(navigator.userAgent);
    const isIPadDevice = detectIsIPadDevice();
    const hasLiffOAuthParams =
      urlParams.has("code") ||
      urlParams.has("liff.state") ||
      urlParams.has("liffClientId");
    const hasWebHandoffUser = Boolean(localStorage.getItem("iscore_user_id"));
    // iPad版LINEアプリ内ブラウザはLINEミニアプリ非対応のため、初回ロード時の強制OAuthリダイレクトを抑止して案内を表示可能にする
    const shouldAutoLoginExternal =
      isIPadDevice && isLineClientUa
        ? hasLiffOAuthParams
        : isLineClientUa || hasLiffOAuthParams || !hasWebHandoffUser;

    await withTimeout(
      (async () => {
        await liff.init({
          liffId: targetLiffId,
          // Web版セッション（Google / LINE / Microsoft）から引き継いだ外部ブラウザ閲覧時は強制OAuthリダイレクトを抑止
          withLoginOnExternalBrowser: shouldAutoLoginExternal,
        });
        // 🌟 LIFF SDKの内部初期化・セッション準備を確実に待機
        await liff.ready;
      })(),
      LIFF_INIT_TIMEOUT_MS,
      "LIFF_INIT"
    );

    liffInstance = liff;
    initializedLiffId = targetLiffId;
    return { liff, isMock: false };
  } catch (error: unknown) {
    console.error("❌ Failed to initialize LIFF SDK:", error);
    const reason =
      error instanceof Error ? error.message : "LIFF_INIT_ERROR";
    return { liff: null, isMock: true, reason };
  }
}

/**
 * 初期化済みのLIFFインスタンスを取得する
 */
export function getLiffInstance(): Liff | null {
  return liffInstance;
}

/**
 * LINEアプリ内で開かれているかどうかを判定する
 */
export function isInLineClient(): boolean {
  if (!liffInstance) return false;
  return liffInstance.isInClient();
}

/**
 * Android端末のブラウザ / WebView かどうかを判定する
 */
export function isAndroidClientDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * クライアント側のURLクエリパラメータを安全に取得する（静的エクスポート互換）
 */
export function getClientQueryParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

/**
 * ログイン中ユーザーのLINEプロフィールを取得する (getProfile + getDecodedIDToken)
 */
export async function getLiffProfile(): Promise<LiffUserProfile | null> {
  if (!liffInstance) return null;

  try {
    await withTimeout(liffInstance.ready, LIFF_PROFILE_TIMEOUT_MS, "LIFF_READY");

    if (!liffInstance.isLoggedIn()) {
      return null;
    }

    // 1. getProfile を試行（タイムアウト時は即座に ID Token フォールバックへ移行）
    try {
      const profile = await withTimeout(
        liffInstance.getProfile(),
        LIFF_PROFILE_TIMEOUT_MS,
        "LIFF_GET_PROFILE"
      );
      if (profile?.displayName) {
        return {
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
          statusMessage: profile.statusMessage,
        };
      }
    } catch (profileErr) {
      console.warn("liff.getProfile failed, falling back to ID token:", profileErr);
    }

    // 2. ID Token フォールバック
    try {
      const idToken = liffInstance.getDecodedIDToken();
      if (idToken) {
        return {
          userId: idToken.sub || "unknown",
          displayName: idToken.name || "メンバー",
          pictureUrl: idToken.picture,
        };
      }
    } catch (idErr) {
      console.warn("liff.getDecodedIDToken failed:", idErr);
    }

    return null;
  } catch (error) {
    console.error("❌ Failed to get LIFF profile:", error);
    return null;
  }
}

/**
 * LINEログインを実行する
 */
export function loginLiff(): void {
  if (liffInstance && !liffInstance.isLoggedIn()) {
    liffInstance.login({
      redirectUri: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }
}

/**
 * LINEでメッセージやURLをシェアする
 */
export async function shareTargetPicker(
  messages: LiffShareMessages
): Promise<boolean> {
  if (!liffInstance) return false;

  try {
    if (liffInstance.isApiAvailable("shareTargetPicker")) {
      const res = await liffInstance.shareTargetPicker(messages);
      return !!res;
    } else {
      console.warn("shareTargetPicker is not available.");
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to share via LIFF:", error);
    return false;
  }
}
