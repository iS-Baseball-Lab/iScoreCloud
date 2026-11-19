// filepath: src/lib/liff/external-link.ts
import type { Liff } from "@line/liff";
import { getLiffInstance } from "@/lib/liff/liff-client";

export interface AnchorExternalClassificationInput {
  rawHref: string;
  currentOrigin: string;
  targetAttr?: string | null;
  hasDownloadAttr?: boolean;
  disableIntercept?: boolean;
}

export interface AnchorExternalClassificationResult {
  shouldOpenInDefaultBrowser: boolean;
  resolvedUrl: string;
}

const NON_HTTP_PREFIX_PATTERN = /^(mailto:|tel:|sms:|javascript:|blob:|data:|about:)/i;

let isExternalLinkInterceptorInstalled = false;

/**
 * LINEプラットフォーム自身の起動・共有アクションURL（`line://`, `liff.line.me`, `miniapp.line.me`,
 * `line.me/R/...`, `lin.ee`, `access.line.me`）かどうかを判定する。
 * これらはLINEアプリ内で直接処理すべきリンクのため、OSデフォルトブラウザ強制起動（`external: true`）の対象から除外する。
 */
export function isLinePlatformActionUrl(
  rawHref: string,
  baseOrigin = "https://iscorecloud.com"
): boolean {
  const trimmed = rawHref.trim();
  if (!trimmed) return false;
  if (/^line:/i.test(trimmed)) return true;
  if (NON_HTTP_PREFIX_PATTERN.test(trimmed) || trimmed.startsWith("#")) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, baseOrigin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "liff.line.me" ||
      host.endsWith(".liff.line.me") ||
      host === "miniapp.line.me" ||
      host.endsWith(".miniapp.line.me") ||
      host === "access.line.me" ||
      host === "lin.ee"
    ) {
      return true;
    }
    if ((host === "line.me" || host === "www.line.me") && parsed.pathname.startsWith("/R/")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * LINEアプリ内ブラウザ（LIFF WebView / トーク内WebView）の User-Agent かどうかを判定する
 */
export function isLineWebViewUserAgent(userAgent?: string): boolean {
  const ua =
    typeof userAgent === "string"
      ? userAgent
      : typeof navigator !== "undefined"
      ? navigator.userAgent || ""
      : "";
  return /\bLine\//i.test(ua);
}

/**
 * LINEアプリ内ブラウザ（非LIFF SDK環境）向けに `openExternalBrowser=1` クエリを安全に付与する
 */
export function appendLineExternalBrowserParam(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("openExternalBrowser", "1");
    return parsed.toString();
  } catch {
    const sep = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${sep}openExternalBrowser=1`;
  }
}

/**
 * URLから冗長な `openExternalBrowser` クエリパラメータを除去して正規化する
 */
export function stripLineExternalBrowserParam(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has("openExternalBrowser")) {
      parsed.searchParams.delete("openExternalBrowser");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * `<a>` 要素のクリック遷移先が「OSのデフォルトブラウザで開くべき外部リンク（または `target="_blank"` 資料URL）」か判定する
 * - 外部オリジン（Google Maps / YouTube / Instagram / 大会サイト / 連盟HP 等）はすべて対象
 * - 同一オリジンであっても `target="_blank"` または `openExternalBrowser=1` が明示された PDF・画像直リンク（配布資料・チームルールの「ブラウザで開く」「直接開く」）は対象
 * - `<a download>`・アプリ内通常遷移（`/liff/*`, `/terms`, `/privacy`）・`mailto:`/`tel:`・LINE共有URL（`line.me/R/...` 等）は対象外
 */
export function classifyAnchorExternalNavigation(
  input: AnchorExternalClassificationInput
): AnchorExternalClassificationResult {
  const trimmed = input.rawHref.trim();
  if (
    !trimmed ||
    input.disableIntercept ||
    input.hasDownloadAttr ||
    trimmed.startsWith("#") ||
    NON_HTTP_PREFIX_PATTERN.test(trimmed) ||
    /^line:/i.test(trimmed)
  ) {
    return { shouldOpenInDefaultBrowser: false, resolvedUrl: "" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, input.currentOrigin);
  } catch {
    return { shouldOpenInDefaultBrowser: false, resolvedUrl: "" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { shouldOpenInDefaultBrowser: false, resolvedUrl: "" };
  }

  if (isLinePlatformActionUrl(parsed.toString(), input.currentOrigin)) {
    return { shouldOpenInDefaultBrowser: false, resolvedUrl: parsed.toString() };
  }

  const isCrossOrigin = parsed.origin !== input.currentOrigin;
  const isExplicitExternalOpen =
    (input.targetAttr || "").toLowerCase() === "_blank" ||
    parsed.searchParams.get("openExternalBrowser") === "1";

  if (!isCrossOrigin && !isExplicitExternalOpen) {
    return { shouldOpenInDefaultBrowser: false, resolvedUrl: parsed.toString() };
  }

  return {
    shouldOpenInDefaultBrowser: true,
    resolvedUrl: stripLineExternalBrowserParam(parsed.toString()),
  };
}

function openViaPopupOrAnchor(targetUrl: string): void {
  if (typeof window === "undefined") return;
  const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
  if (!popup && typeof document !== "undefined" && document.body) {
    const tempAnchor = document.createElement("a");
    tempAnchor.href = targetUrl;
    tempAnchor.target = "_blank";
    tempAnchor.rel = "noopener noreferrer";
    tempAnchor.dataset.noExternalIntercept = "true";
    tempAnchor.style.display = "none";
    document.body.appendChild(tempAnchor);
    tempAnchor.click();
    document.body.removeChild(tempAnchor);
  }
}

/**
 * 任意の外部URL（またはPDF等の外部ブラウザ表示対象URL）をOSのデフォルトブラウザ（iOS: Safari / Android: Chrome等）で開く
 * 1. LINEミニアプリ（LIFFクライアント）内: `liff.openWindow({ url, external: true })` でOS標準ブラウザを直接起動
 * 2. LINEアプリ内汎用ブラウザ（LIFF未初期化・iPad版LINE等）: `openExternalBrowser=1` を付与してOS標準ブラウザへハンドオフ
 * 3. 一般ブラウザ（Safari / Chrome / PC）: 新規タブ（`_blank` + `noopener,noreferrer`）で起動
 */
export function openExternalUrlInDefaultBrowser(
  rawUrl: string,
  options?: { liff?: Liff | null }
): boolean {
  if (typeof window === "undefined") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || NON_HTTP_PREFIX_PATTERN.test(trimmed)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, window.location.origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (isLinePlatformActionUrl(parsed.toString(), window.location.origin)) {
    openViaPopupOrAnchor(parsed.toString());
    return true;
  }

  const cleanUrl = stripLineExternalBrowserParam(parsed.toString());
  const activeLiff = options?.liff ?? getLiffInstance();

  if (activeLiff && activeLiff.isInClient()) {
    try {
      activeLiff.openWindow({
        url: cleanUrl,
        external: true,
      });
      return true;
    } catch (err) {
      console.warn("liff.openWindow({ external: true }) failed, falling back:", err);
    }
  }

  if (isLineWebViewUserAgent()) {
    openViaPopupOrAnchor(appendLineExternalBrowserParam(cleanUrl));
    return true;
  }

  openViaPopupOrAnchor(cleanUrl);
  return true;
}

/**
 * アプリ全体の `<a>` クリックをキャプチャフェーズで監視し、外部リンクをすべてOSのデフォルトブラウザで開くグローバルガード
 * - `createPortal(..., document.body)` 内のモーダルで `e.stopPropagation()` が呼ばれても確実に捕捉するため `capture: true` で登録
 * - `event.stopPropagation()` は呼ばず `event.preventDefault()` のみ行うため、モーダル内のクリック閉じ防止ハンドラー等には一切干渉しない
 */
export function installGlobalExternalLinkInterceptor(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (isExternalLinkInterceptorInstalled) return;
  isExternalLinkInterceptorInstalled = true;

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const rawTarget = event.target;
      const element =
        rawTarget instanceof Element
          ? rawTarget
          : rawTarget instanceof Node
          ? rawTarget.parentElement
          : null;
      if (!element) return;

      const anchor = element.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href") || "";
      const classification = classifyAnchorExternalNavigation({
        rawHref,
        currentOrigin: window.location.origin,
        targetAttr: anchor.getAttribute("target"),
        hasDownloadAttr: anchor.hasAttribute("download"),
        disableIntercept: anchor.dataset.noExternalIntercept === "true",
      });

      if (!classification.shouldOpenInDefaultBrowser) {
        return;
      }

      const activeLiff = getLiffInstance();
      const inLiffClient = Boolean(activeLiff && activeLiff.isInClient());
      const inLineWebView = inLiffClient || isLineWebViewUserAgent();

      if (inLineWebView) {
        event.preventDefault();
        openExternalUrlInDefaultBrowser(classification.resolvedUrl, {
          liff: activeLiff,
        });
        return;
      }

      // すでにOSデフォルトブラウザ（Safari / Chrome / PC等）で閲覧中の場合はネイティブ新規タブ遷移を保証
      if (anchor.getAttribute("target") !== "_blank") {
        anchor.setAttribute("target", "_blank");
      }
      const existingRel = anchor.getAttribute("rel") || "";
      if (!existingRel.includes("noopener") || !existingRel.includes("noreferrer")) {
        anchor.setAttribute("rel", "noopener noreferrer");
      }
    },
    true
  );
}
