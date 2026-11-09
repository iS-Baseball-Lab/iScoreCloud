// filepath: src/lib/liff/runtime-recovery.ts
"use client";

/**
 * 🛡️ LIFF WebView 自己修復ランタイムガード
 * 1. デプロイ更新直後に LINE の WebView メモリキャッシュ上に古い HTML シェルが残っていた場合、
 *    旧 `/_next/static/` チャンク 404（ChunkLoadError / 動的 import 失敗）を検知してループ防止付きで自動再読込する。
 * 2. Radix DropdownMenu / Dialog のアンマウント競合等により `document.body.style.pointerEvents = "none"` が
 *    孤立残留して画面タップ不能になる現象を自動検知・即時解除する。
 * 3. LINE トーク画面との往復（`visibilitychange`）・BFCache 復帰（`pageshow`）・電波回復（`online`）を
 *    `LIFF_WEBVIEW_RESUMED_EVENT` として配信し、一時的な通信瞬断で失敗した画像やアイコンを自動復旧させる。
 */

export const LIFF_WEBVIEW_RESUMED_EVENT = "iscore:webview-resumed";

const CHUNK_RECOVERY_STORAGE_KEY = "iscore_chunk_recovery_at_v1";
const CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

let isRuntimeRecoveryInstalled = false;

function isChunkOrAssetLoadFailureMessage(rawMessage: string): boolean {
  if (!rawMessage) return false;
  const msg = rawMessage.toLowerCase();
  return (
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("unable to preload css") ||
    (msg.includes("/_next/static/") && msg.includes("404"))
  );
}

function extractReasonText(reason: unknown): string {
  if (!reason) return "";
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }
  if (typeof reason === "object") {
    const rec = reason as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    const message = typeof rec.message === "string" ? rec.message : "";
    return `${name} ${message}`.trim();
  }
  return "";
}

function attemptDeploySkewReload(): void {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // オフライン状態での無限リロードは行わない
    return;
  }

  const now = Date.now();
  try {
    const prevRaw = sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY);
    const prevAt = prevRaw ? Number(prevRaw) : 0;
    if (prevAt > 0 && now - prevAt < CHUNK_RECOVERY_COOLDOWN_MS) {
      return;
    }
    sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now));
  } catch {
    // sessionStorage 利用不可時は1回のみ再読込を試行
  }

  try {
    window.location.reload();
  } catch {
    // ignore reload errors
  }
}

/**
 * 開いている Radix ポータル層が存在しないにもかかわらず `document.body.style.pointerEvents === "none"` 等が
 * 残留している場合、ロックを安全に解除して画面フリーズを防止する
 */
export function releaseOrphanedBodyLocks(): void {
  if (typeof document === "undefined" || !document.body) return;

  const hasOpenRadixLayer = Boolean(
    document.querySelector(
      '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
    )
  );

  if (!hasOpenRadixLayer) {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
    if (
      document.body.hasAttribute("data-scroll-locked") &&
      !document.querySelector('[role="dialog"], [role="alertdialog"]')
    ) {
      document.body.removeAttribute("data-scroll-locked");
      if (document.body.style.overflow === "hidden") {
        document.body.style.overflow = "";
      }
    }
  }
}

function notifyWebViewResumed(): void {
  if (typeof window === "undefined") return;
  releaseOrphanedBodyLocks();
  try {
    window.dispatchEvent(new CustomEvent(LIFF_WEBVIEW_RESUMED_EVENT));
  } catch {
    // ignore dispatch errors
  }
}

export function installLiffRuntimeRecovery(): void {
  if (typeof window === "undefined" || isRuntimeRecoveryInstalled) return;
  isRuntimeRecoveryInstalled = true;

  // 1. `<script src="/_next/static/...">` / `<link href="/_next/static/...">` 読込エラーおよび未捕捉 ChunkLoadError を検知
  window.addEventListener(
    "error",
    (event: Event) => {
      const target = event.target;
      if (target && target !== window && target instanceof HTMLElement) {
        if (target instanceof HTMLScriptElement) {
          const src = target.src || "";
          if (src.includes("/_next/static/")) {
            attemptDeploySkewReload();
            return;
          }
        }
        if (
          target instanceof HTMLLinkElement &&
          target.rel === "stylesheet" &&
          (target.href || "").includes("/_next/static/")
        ) {
          attemptDeploySkewReload();
          return;
        }
      }

      if (event instanceof ErrorEvent) {
        const combined = `${event.message || ""} ${extractReasonText(event.error)}`;
        if (isChunkOrAssetLoadFailureMessage(combined)) {
          attemptDeploySkewReload();
        }
      }
    },
    true
  );

  // 2. `next/dynamic` やクライアントルーター遷移時の動的 import() 404 Rejection を検知
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reasonText = extractReasonText(event.reason);
    if (isChunkOrAssetLoadFailureMessage(reasonText)) {
      event.preventDefault();
      attemptDeploySkewReload();
    }
  });

  // 3. バックグラウンド復帰・BFCache復帰・オンライン復帰時のロック解放＆画像再試行通知
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      notifyWebViewResumed();
    }
  });

  window.addEventListener("pageshow", (event: PageTransitionEvent) => {
    if (event.persisted) {
      notifyWebViewResumed();
    } else {
      releaseOrphanedBodyLocks();
    }
  });

  window.addEventListener("online", () => {
    notifyWebViewResumed();
  });

  window.addEventListener("popstate", () => {
    setTimeout(releaseOrphanedBodyLocks, 80);
  });
}

