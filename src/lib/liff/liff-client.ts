// filepath: src/lib/liff/liff-client.ts
import type { Liff } from "@line/liff";
import { detectIsIPadDevice, getCachedLineMiniAppConfig } from "@/lib/line-miniapp";

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

export interface LiffPageShareOptions {
  title: string;
  text: string;
  url?: string;
  pathname?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  liff?: Liff | null;
}

export type LiffShareOutcome = "shared" | "cancelled" | "opened_line_url";

const TRANSIENT_LIFF_QUERY_KEYS = new Set([
  "code",
  "state",
  "liffClientId",
  "liffRedirectUri",
  "liff.state",
  "join",
  "invite",
  "error",
  "error_description",
]);

function resolveShareAppOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://iscorecloud.com";
  return configured.replace(/\/+$/, "");
}

/**
 * 現在のLIFFページへの直起動URL（`https://miniapp.line.me/...` / `https://liff.line.me/{liffId}/...`）を同期生成する
 * ※ iOS WKWebView / Safari の Transient User Activation を維持するため、ネットワーク待機なしで即座に解決する
 */
export function buildShareableLiffPageUrl(options: {
  explicitUrl?: string;
  pathname?: string | null;
  teamId?: string | null;
}): string {
  const trimmedExplicit = options.explicitUrl?.trim() || "";
  if (trimmedExplicit.startsWith("https://")) {
    return trimmedExplicit;
  }

  const config = getCachedLineMiniAppConfig();
  const origin = resolveShareAppOrigin();
  const rawPath = (options.pathname || "/liff").trim() || "/liff";
  const subPath =
    rawPath === "/liff"
      ? ""
      : rawPath.startsWith("/liff/")
      ? rawPath.slice("/liff".length)
      : rawPath.startsWith("/")
      ? rawPath
      : `/${rawPath}`;

  const cleanSearch = new URLSearchParams();
  if (typeof window !== "undefined") {
    try {
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.forEach((val, key) => {
        if (!TRANSIENT_LIFF_QUERY_KEYS.has(key) && val.trim()) {
          cleanSearch.set(key, val);
        }
      });
    } catch {
      // ignore query parse errors
    }
  }

  const cleanTeamId = options.teamId?.trim() || "";
  if (cleanTeamId && cleanTeamId !== "demo-team" && !cleanSearch.has("teamId")) {
    cleanSearch.set("teamId", cleanTeamId);
  }

  const querySuffix = cleanSearch.toString() ? `?${cleanSearch.toString()}` : "";

  if (config.miniAppUrl) {
    return `${config.miniAppUrl.replace(/\/+$/, "")}${subPath}${querySuffix}`;
  }
  if (config.liffId) {
    return `https://liff.line.me/${config.liffId}${subPath}${querySuffix}`;
  }
  return `${origin}/liff${subPath}${querySuffix}`;
}

function openExternalLineShareUrl(lineShareUrl: string): void {
  if (typeof window === "undefined") return;
  const popup = window.open(lineShareUrl, "_blank", "noopener,noreferrer");
  if (!popup && typeof document !== "undefined") {
    const anchor = document.createElement("a");
    anchor.href = lineShareUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}

/**
 * 各ページの共有ボタンから LINEの「送信先を選択」モーダル（`shareTargetPicker`）を起動する共通ヘルパー
 * - 「LINEでメンバーを招待する」（`/liff/admin`）と同一の方式で Flex カード送信 -> テキスト送信 -> `https://line.me/R/msg/text/` フォールバックを実行
 * - `isInClient` に限定せず `liff.isApiAvailable("shareTargetPicker")` を直接判定し、モーダルをキャンセルした際は二重起動しない
 */
export async function shareLiffPageViaLine(
  options: LiffPageShareOptions
): Promise<LiffShareOutcome> {
  const cleanTitle = options.title.trim() || "iScoreCloud LINEミニアプリ";
  const cleanText = options.text.trim();
  const teamLabel = options.teamName?.trim() || "";

  const targetUrl = buildShareableLiffPageUrl({
    explicitUrl: options.url,
    pathname: options.pathname,
    teamId: options.teamId,
  });

  const clippedTextForFallback =
    cleanText.length > 1000 ? `${cleanText.slice(0, 1000)}…` : cleanText;
  const fullText = `⚾ ${cleanTitle}${
    clippedTextForFallback ? `\n${clippedTextForFallback}` : ""
  }\n\n📲 ミニアプリで開く:\n${targetUrl}`;

  let activeLiff: Liff | null = options.liff || liffInstance;
  if (!activeLiff) {
    const initialized = await initLiff();
    activeLiff = initialized.liff;
  }

  try {
    if (activeLiff && activeLiff.isApiAvailable("shareTargetPicker")) {
      if (targetUrl.startsWith("https://") && targetUrl.length <= 950) {
        try {
          const flexBodyPreview =
            cleanText.length > 300 ? `${cleanText.slice(0, 300)}…` : cleanText;

          const bodyContents: Array<{
            type: "text";
            text: string;
            weight?: "bold" | "regular";
            size?: "md" | "sm" | "xs" | "xxs";
            color?: string;
            wrap?: boolean;
          }> = [
            {
              type: "text",
              text: cleanTitle.slice(0, 120),
              weight: "bold",
              size: "md",
              color: "#0f172a",
              wrap: true,
            },
          ];

          if (flexBodyPreview) {
            bodyContents.push({
              type: "text",
              text: flexBodyPreview,
              size: "xs",
              color: "#475569",
              wrap: true,
            });
          }

          const flexMessages: LiffShareMessages = [
            {
              type: "flex",
              altText: `⚾ ${cleanTitle}`.slice(0, 380),
              contents: {
                type: "bubble",
                size: "mega",
                header: {
                  type: "box",
                  layout: "horizontal",
                  spacing: "md",
                  alignItems: "center",
                  backgroundColor: "#0f172a",
                  paddingAll: "14px",
                  contents: [
                    {
                      type: "image",
                      url: "https://iscorecloud.com/liff-logo.png",
                      size: "38px",
                      aspectRatio: "1:1",
                      aspectMode: "fit",
                      flex: 0,
                    },
                    {
                      type: "box",
                      layout: "vertical",
                      flex: 1,
                      contents: [
                        {
                          type: "text",
                          text: "iScoreCloud LINEミニアプリ",
                          weight: "bold",
                          size: "sm",
                          color: "#f8fafc",
                        },
                        {
                          type: "text",
                          text: (teamLabel || "チームページ共有").slice(0, 60),
                          size: "xxs",
                          color: "#94a3b8",
                          wrap: true,
                        },
                      ],
                    },
                  ],
                },
                body: {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  paddingAll: "16px",
                  backgroundColor: "#ffffff",
                  contents: bodyContents,
                },
                footer: {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  paddingAll: "14px",
                  backgroundColor: "#ffffff",
                  contents: [
                    {
                      type: "button",
                      style: "primary",
                      color: "#06C755",
                      height: "sm",
                      action: {
                        type: "uri",
                        label: "ミニアプリでページを開く",
                        uri: targetUrl,
                      },
                    },
                  ],
                },
              },
            },
          ];

          const flexRes = await activeLiff.shareTargetPicker(flexMessages);
          return flexRes ? "shared" : "cancelled";
        } catch {
          // Flex送信非対応環境ではテキスト版の shareTargetPicker へ自動フォールバック
        }
      }

      const textRes = await activeLiff.shareTargetPicker([
        {
          type: "text",
          text: fullText.slice(0, 4500),
        },
      ]);
      return textRes ? "shared" : "cancelled";
    }
  } catch (err) {
    console.warn("shareTargetPicker fallback to LINE URL scheme:", err);
  }

  openExternalLineShareUrl(
    `https://line.me/R/msg/text/?${encodeURIComponent(fullText)}`
  );
  return "opened_line_url";
}
