// filepath: src/lib/line-miniapp.ts
export interface LineMiniAppConfigResponse {
  success?: boolean;
  liffId?: string;
  miniAppUrl?: string;
}

export interface LineMiniAppConfig {
  liffId: string;
  miniAppUrl: string;
}

export interface WebToLiffHandoffPayload {
  teamId?: string | null;
  teamName?: string | null;
  userId?: string | null;
  userName?: string | null;
  avatarUrl?: string | null;
}

export interface LineMiniAppTargets {
  /** Next.js App Router 内のミニアプリ画面ルート（例: `/liff?teamId=...`） */
  internalHref: string;
  /** スマホOSのUniversal Link / App LinkでLINEアプリを直接起動するURL（LIFF ID設定時のみ） */
  externalLineUrl: string | null;
  /** 共有・ブラウザアクセス用の完全URL（例: `https://iscorecloud.com/liff?teamId=...`） */
  shareableWebUrl: string;
  /** スマホカメラ / LINE QRリーダー読み取り用の最適ターゲットURL */
  qrTargetUrl: string;
  /** LINEトークのQRコードリーダーまたはLINEアプリを起動する補助URL */
  lineQrScannerUrl: string;
}

let cachedConfig: LineMiniAppConfig | null = null;
let inflightConfigPromise: Promise<LineMiniAppConfig> | null = null;

function resolveAppOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://iscorecloud.com";
  return configured.replace(/\/+$/, "");
}

export function getCachedLineMiniAppConfig(): LineMiniAppConfig {
  if (cachedConfig) return cachedConfig;

  if (typeof window !== "undefined") {
    const storedLiffId =
      localStorage.getItem("iscore_liff_id") ||
      process.env.NEXT_PUBLIC_LIFF_ID ||
      "";
    const storedMiniAppUrl =
      localStorage.getItem("iscore_line_miniapp_url") ||
      process.env.NEXT_PUBLIC_LINE_MINIAPP_URL ||
      "";
    if (storedLiffId || storedMiniAppUrl) {
      return {
        liffId: storedLiffId.trim(),
        miniAppUrl: storedMiniAppUrl.trim(),
      };
    }
  }

  return {
    liffId: (process.env.NEXT_PUBLIC_LIFF_ID || "").trim(),
    miniAppUrl: (process.env.NEXT_PUBLIC_LINE_MINIAPP_URL || "").trim(),
  };
}

export async function resolveLineMiniAppConfig(): Promise<LineMiniAppConfig> {
  if (cachedConfig) return cachedConfig;

  const initial = getCachedLineMiniAppConfig();
  if (initial.liffId || initial.miniAppUrl) {
    cachedConfig = initial;
    return initial;
  }

  if (typeof window === "undefined") {
    return initial;
  }

  if (sessionStorage.getItem("iscore_line_miniapp_config_checked") === "1") {
    cachedConfig = initial;
    return initial;
  }

  if (!inflightConfigPromise) {
    inflightConfigPromise = fetch("/api/liff/config")
      .then(async (res): Promise<LineMiniAppConfig> => {
        if (!res.ok) return initial;
        const json = (await res.json()) as LineMiniAppConfigResponse;
        const resolved: LineMiniAppConfig = {
          liffId: (json.liffId || "").trim(),
          miniAppUrl: (json.miniAppUrl || "").trim(),
        };
        if (resolved.liffId) {
          localStorage.setItem("iscore_liff_id", resolved.liffId);
        }
        if (resolved.miniAppUrl) {
          localStorage.setItem("iscore_line_miniapp_url", resolved.miniAppUrl);
        }
        sessionStorage.setItem("iscore_line_miniapp_config_checked", "1");
        cachedConfig = resolved;
        return resolved;
      })
      .catch(() => initial)
      .finally(() => {
        inflightConfigPromise = null;
      });
  }

  return inflightConfigPromise;
}

export function detectIsMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Web版でログイン中・選択中のチームとユーザー情報を localStorage へ同期し、
 * `/liff` 起動時に 0ms で同一チーム・同一アカウントを引き継げるようにする
 */
export function persistWebToLiffHandoff(payload: WebToLiffHandoffPayload): void {
  if (typeof window === "undefined") return;

  const cleanTeamId = payload.teamId?.trim();
  const cleanTeamName = payload.teamName?.trim();
  if (cleanTeamId) {
    localStorage.setItem("iscore_selectedTeamId", cleanTeamId);
    if (cleanTeamId !== "demo-team") {
      localStorage.setItem("iscore_isDemo", "false");
    }
  }
  if (cleanTeamName) {
    localStorage.setItem("iscore_selectedTeamName", cleanTeamName);
  }

  const cleanUserId = payload.userId?.trim();
  const cleanUserName = payload.userName?.trim();
  if (cleanUserId) {
    localStorage.setItem("iscore_user_id", cleanUserId);
  }
  if (cleanUserName) {
    localStorage.setItem("iscore_user_name", cleanUserName);
  }
  if (payload.avatarUrl && payload.avatarUrl.trim()) {
    localStorage.setItem("iscore_user_avatar", payload.avatarUrl.trim());
  }
}

export function buildLineMiniAppTargets(params: {
  config: LineMiniAppConfig;
  teamId?: string | null;
  subPath?: string;
}): LineMiniAppTargets {
  const { config, teamId, subPath } = params;
  const normalizedSubPath =
    subPath && subPath.startsWith("/") ? subPath : subPath ? `/${subPath}` : "";

  const search = new URLSearchParams();
  const cleanTeamId = teamId?.trim();
  if (cleanTeamId) {
    search.set("teamId", cleanTeamId);
  }
  const querySuffix = search.toString() ? `?${search.toString()}` : "";

  const internalHref = `/liff${normalizedSubPath}${querySuffix}`;
  const origin = resolveAppOrigin();
  const shareableWebUrl = `${origin}${internalHref}`;

  let externalLineUrl: string | null = null;
  if (config.miniAppUrl) {
    const baseMini = config.miniAppUrl.replace(/\/+$/, "");
    externalLineUrl = `${baseMini}${normalizedSubPath}${querySuffix}`;
  } else if (config.liffId) {
    externalLineUrl = `https://liff.line.me/${config.liffId}${normalizedSubPath}${querySuffix}`;
  }

  return {
    internalHref,
    externalLineUrl,
    shareableWebUrl,
    qrTargetUrl: externalLineUrl || shareableWebUrl,
    lineQrScannerUrl: "https://line.me/R/nv/QRCodeReader",
  };
}

