// filepath: src/lib/liff/navigation.ts
"use client";

import type React from "react";

export interface LiffRouterLike {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
  back: () => void;
}

interface IScoreHistoryMeta {
  __iscoreSession?: string;
  __iscoreEpoch?: number;
  __iscoreDepth?: number;
  [key: string]: unknown;
}

interface PendingRootResetJob {
  router: LiffRouterLike;
  targetHref: string;
  timerId: ReturnType<typeof setTimeout>;
}

const NAV_SESSION_STORAGE_KEY = "iscore_liff_nav_session_v1";
const NAV_EPOCH_STORAGE_KEY = "iscore_liff_nav_epoch_v1";
const LIFF_ROOT_HREF = "/liff";

let isTrackerInstalled = false;
let sessionId = "";
let currentEpoch = 0;
let currentDepth = 0;
let pendingRootReset: PendingRootResetJob | null = null;
let isBouncingStaleForward = false;
let bounceSafetyTimerId: ReturnType<typeof setTimeout> | null = null;
let lastKnownRouter: LiffRouterLike | null = null;

function createSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function persistSessionMeta(nextSessionId: string, epoch: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(NAV_SESSION_STORAGE_KEY, nextSessionId);
    sessionStorage.setItem(NAV_EPOCH_STORAGE_KEY, String(epoch));
  } catch {
    // sessionStorage が制限されている環境ではメモリ上のみで管理
  }
}

function bumpEpoch(): number {
  currentEpoch += 1;
  persistSessionMeta(sessionId, currentEpoch);
  return currentEpoch;
}

/**
 * ⚠️ 超重要: Next.js 16 App Router の内部 Flight ツリー（`__NA` / `__PRIVATE_NEXTJS_INTERNALS_TREE`）と
 * `window.location` の不整合によるクライアントルーターフリーズを防ぐため、
 * 生の `replaceState` では URL 引数を書き換えず、現在の `history.state` へのメタデータ刻印のみを行う。
 */
function stampCurrentHistoryState(
  baseState?: Record<string, unknown> | null
): void {
  if (typeof window === "undefined") return;
  const source =
    baseState ??
    (window.history.state && typeof window.history.state === "object"
      ? (window.history.state as Record<string, unknown>)
      : {});
  const stamped: IScoreHistoryMeta = {
    ...source,
    __iscoreSession: sessionId,
    __iscoreEpoch: currentEpoch,
    __iscoreDepth: currentDepth,
  };
  try {
    History.prototype.replaceState.call(window.history, stamped, "");
  } catch {
    // ignore history replace errors in restricted WebViews
  }
}

function clearBounceState(): void {
  isBouncingStaleForward = false;
  if (bounceSafetyTimerId !== null) {
    clearTimeout(bounceSafetyTimerId);
    bounceSafetyTimerId = null;
  }
}

/**
 * LIFF アプリ内のセッション遷移階層（depth）と世代（epoch）を追跡し、
 * トップページ（/liff）遷移時の履歴巻き戻し・進む履歴の無効化を制御するトラッカーを初期化する
 */
export function installLiffHistoryTracker(): void {
  if (typeof window === "undefined" || isTrackerInstalled) return;
  isTrackerInstalled = true;

  const initialRaw =
    window.history.state && typeof window.history.state === "object"
      ? (window.history.state as IScoreHistoryMeta)
      : null;

  try {
    const storedSession = sessionStorage.getItem(NAV_SESSION_STORAGE_KEY);
    // LINE ミニアプリを「×」で閉じて開き直した場合、WebView プロセス上の sessionStorage は残存するが
    // 新規ドキュメントの `history.state` には `__iscoreSession` が無いため、新セッションとしてクリーンに開始する。
    // （同一タブ内の F5 リロード時は `initialRaw.__iscoreSession === storedSession` が成立するため継続される）
    if (
      storedSession &&
      initialRaw &&
      initialRaw.__iscoreSession === storedSession
    ) {
      sessionId = storedSession;
      currentEpoch =
        Number(sessionStorage.getItem(NAV_EPOCH_STORAGE_KEY) || "0") || 0;
      currentDepth =
        typeof initialRaw.__iscoreDepth === "number"
          ? Math.max(0, initialRaw.__iscoreDepth)
          : 0;
    } else {
      sessionId = createSessionId();
      currentEpoch = 0;
      currentDepth = 0;
      persistSessionMeta(sessionId, 0);
    }
  } catch {
    sessionId = createSessionId();
    currentEpoch = 0;
    currentDepth = 0;
  }

  stampCurrentHistoryState(initialRaw ?? {});

  const prevPushState = window.history.pushState.bind(window.history);
  const prevReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedIscorePushState(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    currentDepth += 1;
    const baseObj =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const stamped: IScoreHistoryMeta = {
      ...baseObj,
      __iscoreSession: sessionId,
      __iscoreEpoch: currentEpoch,
      __iscoreDepth: currentDepth,
    };
    prevPushState(stamped, unused, url);
  };

  window.history.replaceState = function patchedIscoreReplaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    const baseObj =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const stamped: IScoreHistoryMeta = {
      ...baseObj,
      __iscoreSession: sessionId,
      __iscoreEpoch: currentEpoch,
      __iscoreDepth: currentDepth,
    };
    prevReplaceState(stamped, unused, url);
  };

  const onCapturePopState = (event: PopStateEvent): void => {
    // 1. 無効化済みの「進む（Forward）」履歴からルートへ引き戻した直後の着地イベントを処理
    if (isBouncingStaleForward) {
      clearBounceState();
      currentDepth = 0;
      stampCurrentHistoryState();
      event.stopImmediatePropagation();
      return;
    }

    // 2. トップページ（/liff）への履歴クリア付き巻き戻し完了時
    // Next.js App Router 自身の popstate ハンドラは止めず（状態ツリーの不整合を防止）、
    // 着地先が `/liff` 以外だった場合（ディープリンク起動時など）のみ次ティックで `router.replace("/liff")` を実行する。
    if (pendingRootReset) {
      const job = pendingRootReset;
      pendingRootReset = null;
      clearTimeout(job.timerId);

      currentDepth = 0;
      bumpEpoch();
      stampCurrentHistoryState();

      const landedPathname = window.location.pathname;
      if (landedPathname !== job.targetHref) {
        setTimeout(() => {
          job.router.replace(job.targetHref, { scroll: true });
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }, 0);
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
      return;
    }

    // 3. 通常のブラウザ戻る／進む操作
    const st =
      event.state && typeof event.state === "object"
        ? (event.state as IScoreHistoryMeta)
        : null;

    if (st && st.__iscoreSession === sessionId) {
      // クリア済み世代（過去チームの画面など）への「進む」操作をブロックして1つ前のルートに引き戻す
      if (
        typeof st.__iscoreEpoch === "number" &&
        st.__iscoreEpoch < currentEpoch
      ) {
        event.stopImmediatePropagation();
        clearBounceState();
        isBouncingStaleForward = true;
        // 万一 WebView 側で `history.go(-1)` が no-op になってもフラグが永久固定されないようセーフティタイマーを設定
        bounceSafetyTimerId = setTimeout(() => {
          if (!isBouncingStaleForward) return;
          clearBounceState();
          currentDepth = 0;
          stampCurrentHistoryState();
          if (
            window.location.pathname !== LIFF_ROOT_HREF &&
            lastKnownRouter
          ) {
            lastKnownRouter.replace(LIFF_ROOT_HREF, { scroll: true });
          }
        }, 200);
        window.history.go(-1);
        return;
      }

      currentDepth =
        typeof st.__iscoreDepth === "number"
          ? Math.max(0, st.__iscoreDepth)
          : 0;
    }
  };

  window.addEventListener("popstate", onCapturePopState, true);
}

/**
 * 現在のLIFFアプリ内スタックの深さ（0 = ルート階層でアプリ内戻る履歴なし）を返す
 */
export function getLiffHistoryDepth(): number {
  installLiffHistoryTracker();
  return currentDepth;
}

/**
 * LIFFアプリ内の前の画面へ安全に router.back() できるかを判定する
 */
export function canGoBackInLiff(): boolean {
  return getLiffHistoryDepth() > 0;
}

/**
 * 現在トップページへの履歴巻き戻し処理が進行中かどうかを返す
 */
export function isPendingLiffRootReset(): boolean {
  return pendingRootReset !== null;
}

/**
 * トップページ着地時に残存している「進む（Forward）」側の履歴世代を無効化する
 */
export function invalidateLiffForwardHistory(): void {
  if (typeof window === "undefined") return;
  installLiffHistoryTracker();
  currentDepth = 0;
  bumpEpoch();
  stampCurrentHistoryState();
}

/**
 * アプリ内の遷移履歴をすべて巻き戻してクリアし、トップページ（/liff）へ強制遷移する
 */
export function navigateToLiffRoot(
  router: LiffRouterLike,
  currentPathname?: string | null
): void {
  lastKnownRouter = router;

  if (typeof window === "undefined") {
    router.replace(LIFF_ROOT_HREF, { scroll: true });
    return;
  }

  installLiffHistoryTracker();
  clearBounceState();

  if (pendingRootReset) {
    clearTimeout(pendingRootReset.timerId);
    pendingRootReset = null;
  }

  const delta = currentDepth;

  if (delta > 0) {
    const timerId = setTimeout(() => {
      if (!pendingRootReset) return;
      const fallbackJob = pendingRootReset;
      pendingRootReset = null;
      currentDepth = 0;
      bumpEpoch();
      stampCurrentHistoryState();
      if (window.location.pathname !== fallbackJob.targetHref) {
        fallbackJob.router.replace(fallbackJob.targetHref, { scroll: true });
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }, 180);

    pendingRootReset = {
      router,
      targetHref: LIFF_ROOT_HREF,
      timerId,
    };

    window.history.go(-delta);
    return;
  }

  // すでにルート階層（depth === 0）にいる場合：
  // 既に `/liff` 上にいるなら不要な Flight 再フェッチ（`router.replace`）を発火させず 0ms で履歴世代のみ無効化する
  currentDepth = 0;
  bumpEpoch();
  stampCurrentHistoryState();

  const effectivePathname = currentPathname ?? window.location.pathname;
  if (effectivePathname !== LIFF_ROOT_HREF) {
    router.replace(LIFF_ROOT_HREF, { scroll: true });
  }
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

/**
 * `<Link href="/liff">` の onClick ハンドラ用ヘルパー（通常タップ時に履歴クリア付きトップ遷移を実行）
 */
export function handleLiffRootLinkClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  router: LiffRouterLike,
  currentPathname?: string | null,
  beforeNavigate?: () => void
): void {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  ) {
    return;
  }
  e.preventDefault();
  beforeNavigate?.();
  navigateToLiffRoot(router, currentPathname);
}
