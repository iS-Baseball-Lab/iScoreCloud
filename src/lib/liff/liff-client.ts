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
export async function initLiff(liffId?: string): Promise<{ liff: Liff | null; isMock: boolean }> {
  const targetLiffId = liffId || process.env.NEXT_PUBLIC_LIFF_ID;

  if (!targetLiffId) {
    console.warn("⚠️ NEXT_PUBLIC_LIFF_ID is not configured. Running in fallback mode.");
    return { liff: null, isMock: true };
  }

  if (typeof window === "undefined") {
    return { liff: null, isMock: true };
  }

  try {
    const liff = (await import("@line/liff")).default;
    await liff.init({ liffId: targetLiffId });
    liffInstance = liff;
    return { liff, isMock: false };
  } catch (error) {
    console.error("❌ Failed to initialize LIFF SDK:", error);
    return { liff: null, isMock: true };
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
