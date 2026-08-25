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

  // LIFF ID の優先順位: 引数 > URLクエリ > localStorage > 環境変数
  const urlParams = new URLSearchParams(window.location.search);
  const queryLiffId = urlParams.get("liffId");
  const storedLiffId = localStorage.getItem("iscore_liff_id");
  const targetLiffId = liffId || queryLiffId || storedLiffId || process.env.NEXT_PUBLIC_LIFF_ID;

  if (queryLiffId) {
    localStorage.setItem("iscore_liff_id", queryLiffId);
  }

  if (!targetLiffId) {
    console.warn("⚠️ LIFF ID is not configured (NEXT_PUBLIC_LIFF_ID, url ?liffId=, or localStorage). Running in mock fallback mode.");
    return { liff: null, isMock: true, reason: "LIFF_ID_NOT_CONFIGURED" };
  }

  try {
    const liff = (await import("@line/liff")).default;
    await liff.init({ liffId: targetLiffId });
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
 * ログイン中ユーザーのLINEプロフィールを取得する
 */
export async function getLiffProfile(): Promise<LiffUserProfile | null> {
  if (!liffInstance) return null;

  try {
    if (!liffInstance.isLoggedIn()) {
      return null;
    }
    const profile = await liffInstance.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    };
  } catch (error) {
    console.error("❌ Failed to get LIFF profile:", error);
    return null;
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
