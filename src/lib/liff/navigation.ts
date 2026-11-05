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
  wasAlreadyOnTarget: boolean;
  savedTargetState: Record<string, unknown> | null;
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

function persistEpoch(epoch: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(NAV_EPOCH_STORAGE_KEY, String(epoch));
  } catch {
    // sessionStorage が制限されている環境ではメモリ上のみで管理
  }
}

function bumpEpoch(): number {
  currentEpoch += 1;
  persistEpoch(currentEpoch);
  return currentEpoch;
}

function writeRawHistoryReplace(
  baseState: Record<string, unknown> | null | undefined,
  url?: string
): void {
  if (typeof window === "undefined") return;
  const stamped: IScoreHistoryMeta = {
    ...(baseState || {}),
    __iscoreSession: sessionId,
    __iscoreEpoch: currentEpoch,
    __iscoreDepth: currentDepth,
  };
  if (typeof url === "string") {
    History.prototype.replaceState.call(window.history, stamped, "", url);
  } else {
    History.prototype.replaceState.call(window.history, stamped, "");
  }
}

/**
 * LIFF アプリ内のセッション遷移階層（depth）と世代（epoch）を追跡し、
 * トップページ（/liff）遷移時の履歴巻き戻し・進む履歴の無効化を制御するトラッカーを初期化する
 */
export function installLiffHistoryTracker(): void {
  if (typeof window === "undefined" || isTrackerInstalled) return;
  isTrackerInstalled = true;

  try {
    const storedSession = sessionStorage.getItem(NAV_SESSION_STORAGE_KEY);
    if (storedSession) {
      sessionId = storedSession;
      currentEpoch =
        Number(sessionStorage.getItem(NAV_EPOCH_STORAGE_KEY) || "0") || 0;
    } else {
      sessionId = `s_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      currentEpoch = 0;
      sessionStorage.setItem(NAV_SESSION_STORAGE_KEY, sessionId);
      sessionStorage.setItem(NAV_EPOCH_STORAGE_KEY, "0");
    }
  } catch {
    sessionId = `s_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    currentEpoch = 0;
  }

  const initialRaw =
    window.history.state && typeof window.history.state === "object"
      ? (window.history.state as IScoreHistoryMeta)
      : null;

  if (
    initialRaw &&
    initialRaw.__iscoreSession === sessionId &&
    typeof initialRaw.__iscoreDepth === "number"
  ) {
    currentDepth = Math.max(0, initialRaw.__iscoreDepth);
  } else {
    currentDepth = 0;
  }

  writeRawHistoryReplace(initialRaw ?? {});

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
    // 1. 無効化済みの「進む（Forward）」履歴からルートへ引き戻した直後の着地イベントを吸収
    if (isBouncingStaleForward) {
      isBouncingStaleForward = false;
      currentDepth = 0;
      event.stopImmediatePropagation();
      return;
    }

    // 2. トップページ（/liff）への履歴クリア付き巻き戻し完了時
    if (pendingRootReset) {
      const job = pendingRootReset;
      pendingRootReset = null;
      clearTimeout(job.timerId);

      currentDepth = 0;
      bumpEpoch();
      event.stopImmediatePropagation();

      if (job.wasAlreadyOnTarget && job.savedTargetState) {
        writeRawHistoryReplace(job.savedTargetState, job.targetHref);
        job.router.replace(job.targetHref, { scroll: true });
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      } else {
        const landedState =
          window.history.state && typeof window.history.state === "object"
            ? (window.history.state as Record<string, unknown>)
            : {};
        writeRawHistoryReplace(landedState, job.targetHref);
        job.router.replace(job.targetHref, { scroll: true });
      }
      return;
    }

    // 3. 通常のブラウザ戻る／進む操作
    const st =
      event.state && typeof event.state === "object"
        ? (event.state as IScoreHistoryMeta)
        : null;

    if (st && st.__iscoreSession === sessionId) {
      // クリア済み世代（過去チームの画面など）への「進む」操作をブロックしてルートに留める
      if (
        typeof st.__iscoreEpoch === "number" &&
        st.__iscoreEpoch < currentEpoch
      ) {
        const staleSteps =
          typeof st.__iscoreDepth === "number" && st.__iscoreDepth > 0
            ? st.__iscoreDepth
            : 1;
        event.stopImmediatePropagation();
        isBouncingStaleForward = true;
        window.history.go(-staleSteps);
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
  const activeState =
    window.history.state && typeof window.history.state === "object"
      ? (window.history.state as Record<string, unknown>)
      : {};
  writeRawHistoryReplace(activeState);
}

/**
 * アプリ内の遷移履歴をすべて巻き戻してクリアし、トップページ（/liff）へ強制遷移する
 */
export function navigateToLiffRoot(
  router: LiffRouterLike,
  currentPathname?: string | null
): void {
  if (typeof window === "undefined") {
    router.replace(LIFF_ROOT_HREF, { scroll: true });
    return;
  }

  installLiffHistoryTracker();

  if (pendingRootReset) {
    clearTimeout(pendingRootReset.timerId);
    pendingRootReset = null;
  }

  const delta = currentDepth;
  const wasAlreadyOnTarget = currentPathname === LIFF_ROOT_HREF;

  if (delta > 0) {
    const savedTargetState =
      wasAlreadyOnTarget &&
      window.history.state &&
      typeof window.history.state === "object"
        ? { ...(window.history.state as Record<string, unknown>) }
        : null;

    const timerId = setTimeout(() => {
      if (!pendingRootReset) return;
      const fallbackJob = pendingRootReset;
      pendingRootReset = null;
      currentDepth = 0;
      bumpEpoch();
      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? (window.history.state as Record<string, unknown>)
          : {};
      writeRawHistoryReplace(
        fallbackJob.savedTargetState ?? currentState,
        fallbackJob.targetHref
      );
      fallbackJob.router.replace(fallbackJob.targetHref, { scroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }, 200);

    pendingRootReset = {
      router,
      targetHref: LIFF_ROOT_HREF,
      wasAlreadyOnTarget,
      savedTargetState,
      timerId,
    };

    window.history.go(-delta);
    return;
  }

  // すでにルート階層（depth === 0）にいる場合：履歴を増やさず置換＆進む履歴も無効化
  currentDepth = 0;
  bumpEpoch();
  const activeState =
    window.history.state && typeof window.history.state === "object"
      ? (window.history.state as Record<string, unknown>)
      : {};
  writeRawHistoryReplace(activeState, LIFF_ROOT_HREF);
  router.replace(LIFF_ROOT_HREF, { scroll: true });
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

