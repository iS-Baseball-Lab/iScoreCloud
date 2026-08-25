// filepath: src/lib/liff/liff-client.ts
import type { Liff } from "@line/liff";

export interface LiffUserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

let liffInstance: Liff | null = null;

/**
 * LIFF SDKを初期化する
 */
export async function initLiff(liffId?: string): Promise<{ liff: Liff | null; isMock: boolean; reason?: string }> {
  if (typeof window === "undefined") {
    return { liff: null, isMock: true, reason: "SSR" };
  }

  // 1. LIFF ID の優先順位: 引数 > URLクエリ > localStorage > 環境変数
  const urlParams = new URLSearchParams(window.location.search);
  const queryLiffId = urlParams.get("liffId");
  const storedLiffId = localStorage.getItem("iscore_liff_id");
  let targetLiffId = liffId || queryLiffId || storedLiffId || process.env.NEXT_PUBLIC_LIFF_ID;

  if (queryLiffId) {
    localStorage.setItem("iscore_liff_id", queryLiffId);
  }

  // 2. まだ LIFF ID が未確定の場合、Cloudflare Workers API (/api/liff/config) から自動フェッチ
  if (!targetLiffId) {
    try {
      const configRes = await fetch("/api/liff/config");
      if (configRes.ok) {
        const configData = (await configRes.json()) as { success?: boolean; liffId?: string };
        if (configData.liffId) {
          targetLiffId = configData.liffId;
          localStorage.setItem("iscore_liff_id", configData.liffId);
        }
      }
    } catch {
      // ignore fetch error
    }
  }

  if (!targetLiffId) {
    console.warn("⚠️ LIFF ID is not configured. Running in mock fallback mode.");
    return { liff: null, isMock: true, reason: "LIFF_ID_NOT_CONFIGURED" };
  }

  try {
    const liff = (await import("@line/liff")).default;
    await liff.init({ 
      liffId: targetLiffId,
      withLoginOnExternalBrowser: true, // 外部ブラウザでもLINEログイン自動連携
    });
    
    // 🌟 LIFF SDKの内部初期化・セッション準備を確実に待機
    await liff.ready;
    liffInstance = liff;
    return { liff, isMock: false };
  } catch (error: any) {
    console.error("❌ Failed to initialize LIFF SDK:", error);
    return { liff: null, isMock: true, reason: error?.message || "LIFF_INIT_ERROR" };
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
 * ログイン中ユーザーのLINEプロフィールを取得する (getProfile + getDecodedIDToken)
 */
export async function getLiffProfile(): Promise<LiffUserProfile | null> {
  if (!liffInstance) return null;

  try {
    await liffInstance.ready;

    if (!liffInstance.isLoggedIn()) {
      return null;
    }

    // 1. getProfile を試行
    try {
      const profile = await liffInstance.getProfile();
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
export async function shareTargetPicker(messages: any[]): Promise<boolean> {
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
