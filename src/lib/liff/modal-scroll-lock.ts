// filepath: src/lib/liff/modal-scroll-lock.ts
"use client";

/**
 * 🛡️ アプリ共通 モーダル背面スクロール完全ロックガード
 * - `createPortal(..., document.body)` で描画される全モーダル・ボトムシート・ピッカー・全画面ビューアを自動検知し、
 *   表示中は背面ページ（`window` および 1画面コックピット内の内部スクロール領域）が指操作・ホイールで一切スクロールしないよう保護する。
 * - iOS `WKWebView` / Mobile Safari 特有の「固定要素（背景・ヘッダー・フッター・短尺モーダル）上のドラッグによる背面スクロール」および
 *   「モーダル内スクロール領域の上端・下端到達時のスクロール連鎖（ラバーバンド貫通）」を、`{ passive: false }` の `touchmove` / `wheel` 境界判定と
 *   CSS `overscroll-behavior` の併用で完全に遮断する。
 * - 通常閲覧時（モーダル非表示時）は `{ passive: false }` リスナーを完全に解除し、GPUコンポジタのネイティブスクロール性能と省電力性を100%維持する。
 */

export interface ScrollAxisMetrics {
  scrollOffset: number;
  clientSize: number;
  scrollSize: number;
  isOverflowScrollable: boolean;
}

export interface ScrollableElementMetrics {
  x: ScrollAxisMetrics;
  y: ScrollAxisMetrics;
}

export interface ModalScrollDecisionInput {
  /** 操作対象が最前面のアクティブモーダル内にあるか */
  isInsideTopModal: boolean;
  /** `<input type="range">` や `[data-allow-touch-move="true"]` などネイティブドラッグを許可する要素か */
  isNativeDragControl: boolean;
  /** X方向のスクロール増分（正 = 右へスクロール / 指は左移動、負 = 左へスクロール / 指は右移動） */
  scrollDeltaX: number;
  /** Y方向のスクロール増分（正 = 下へスクロール / 指は上移動、負 = 上へスクロール / 指は下移動） */
  scrollDeltaY: number;
  /** `touchstart` からの累計移動距離 X（微小な初期親指ブレ補正用） */
  totalDx?: number;
  /** `touchstart` からの累計移動距離 Y（微小な初期親指ブレ補正用） */
  totalDy?: number;
  /** タッチ対象から最前面モーダルルートまでのスクロール可能要素リスト（内側 ➔ 外側の順） */
  scrollableAncestors: ReadonlyArray<ScrollableElementMetrics>;
}

interface ModalCandidateEntry {
  element: HTMLElement;
  rootZIndex: number;
  innerZIndex: number;
  domOrder: number;
}

interface SavedDocumentScrollStyle {
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  htmlOverscrollBehavior: string;
}

interface ActiveTouchSession {
  identifier: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

const IGNORED_PORTAL_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "NOSCRIPT",
  "TEMPLATE",
  "NEXT-ROUTE-ANNOUNCER",
]);

const TEXT_SCROLLABLE_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "tel",
  "password",
  "number",
]);

const MODAL_DESCENDANT_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .fixed.inset-0, [data-modal-scroll-lock="true"]';

const MODAL_OPEN_DATA_ATTR = "data-iscore-modal-open";

let isModalScrollLockInstalled = false;
let isDocumentLocked = false;
let activeListenersAttached = false;
let activeTopModal: HTMLElement | null = null;
let savedDocumentStyle: SavedDocumentScrollStyle | null = null;
let activeTouchSession: ActiveTouchSession | null = null;
let syncScheduled = false;

let bodyChildObserver: MutationObserver | null = null;
let portalSubtreeObserver: MutationObserver | null = null;

/**
 * CSS `overflow-x` / `overflow-y` の計算値がスクロール可能な指定か判定する
 */
export function isScrollableOverflowValue(overflowValue: string): boolean {
  return (
    overflowValue === "auto" ||
    overflowValue === "scroll" ||
    overflowValue === "overlay"
  );
}

/**
 * 指定軸のメトリクスに基づき、`scrollDelta` 方向へ1px以上スクロール余地が残っているか判定する
 * - 高DPI端末や文字サイズ変更（`compact` / `ultra`）時のサブピクセル丸め誤差を吸収するため境界許容値を設ける
 */
export function canScrollAlongAxis(
  metrics: ScrollAxisMetrics,
  scrollDelta: number
): boolean {
  if (!metrics.isOverflowScrollable) return false;
  if (metrics.scrollSize - metrics.clientSize <= 1) return false;

  if (scrollDelta > 0) {
    return metrics.scrollOffset + metrics.clientSize < metrics.scrollSize - 1;
  }
  if (scrollDelta < 0) {
    return metrics.scrollOffset > 0.5;
  }
  return false;
}

/**
 * モーダル表示中のタッチ移動／ホイール操作について、ブラウザ標準スクロールを許可するか（`true`）
 * `event.preventDefault()` で遮断するか（`false`）を決定する純粋関数
 */
export function decideModalScrollAllowance(
  input: ModalScrollDecisionInput
): boolean {
  if (!input.isInsideTopModal) {
    return false;
  }

  if (input.isNativeDragControl) {
    return true;
  }

  const hasAnyY = input.scrollableAncestors.some(
    (a) => a.y.isOverflowScrollable && a.y.scrollSize - a.y.clientSize > 1
  );
  const hasAnyX = input.scrollableAncestors.some(
    (a) => a.x.isOverflowScrollable && a.x.scrollSize - a.x.clientSize > 1
  );

  // 背景オーバーレイ・A-3ヘッダー・下部フッター・内容が収まっている短尺モーダル上のドラッグは即遮断
  if (!hasAnyY && !hasAnyX) {
    return false;
  }

  const absX = Math.abs(input.scrollDeltaX);
  const absY = Math.abs(input.scrollDeltaY);

  if (absX === 0 && absY === 0) {
    return true;
  }

  if (absX > absY) {
    if (
      hasAnyX &&
      input.scrollableAncestors.some((a) =>
        canScrollAlongAxis(a.x, input.scrollDeltaX)
      )
    ) {
      return true;
    }

    // 縦スクロール開始直後の親指の微小な横ブレ（< 10px）で縦スクロールが引っかからないよう保護
    const totalDist = Math.hypot(
      input.totalDx ?? input.scrollDeltaX,
      input.totalDy ?? input.scrollDeltaY
    );
    if (hasAnyY && absY > 0 && totalDist < 10) {
      return input.scrollableAncestors.some((a) =>
        canScrollAlongAxis(a.y, input.scrollDeltaY)
      );
    }
    if (hasAnyY && !hasAnyX && absY === 0 && totalDist < 6) {
      return true;
    }

    return false;
  }

  if (hasAnyY) {
    return input.scrollableAncestors.some((a) =>
      canScrollAlongAxis(a.y, input.scrollDeltaY)
    );
  }

  return false;
}

function parseEffectiveZIndex(rawZIndex: string): number {
  if (!rawZIndex || rawZIndex === "auto") return 0;
  const parsed = Number.parseInt(rawZIndex, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isExplicitDialogLikeElement(el: HTMLElement): boolean {
  if (el.dataset.modalScrollLock === "true") return true;
  const role = el.getAttribute("role");
  if (role === "dialog" || role === "alertdialog") return true;
  if (el.getAttribute("aria-modal") === "true") return true;
  return false;
}

function isFullViewportFixedOverlay(el: HTMLElement): boolean {
  if (
    el.classList.contains("fixed") &&
    el.classList.contains("inset-0")
  ) {
    return true;
  }
  if (typeof window === "undefined") return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 0 || vh <= 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= vw - 4 && rect.height >= vh - 4;
}

function isElementVisuallyHidden(
  el: HTMLElement,
  computed: CSSStyleDeclaration
): boolean {
  if (el.hidden) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  if (el.getAttribute("data-state") === "closed") return true;
  if (computed.display === "none" || computed.visibility === "hidden") {
    return true;
  }
  return false;
}

function isAppPageRootElement(el: HTMLElement): boolean {
  if (el.dataset.iscoreAppRoot === "true") return true;
  if (el.tagName === "MAIN") return true;
  return el.querySelector("main") !== null;
}

function isNotificationContainerElement(el: HTMLElement): boolean {
  if (el.hasAttribute("data-sonner-toaster")) return true;
  const ariaLabel = el.getAttribute("aria-label") || "";
  if (ariaLabel.startsWith("Notifications")) return true;
  return el.querySelector("[data-sonner-toaster]") !== null;
}

/**
 * 現在 `document.body` 直下にマウントされているアクティブなモーダル候補を走査し、
 * CSSスタッキング順序に従って最前面（Topmost）のモーダル要素を返す
 */
export function resolveTopmostActiveModal(
  doc: Document = document
): HTMLElement | null {
  if (!doc.body) return null;

  const candidates: ModalCandidateEntry[] = [];
  let domCounter = 0;

  const bodyChildren = doc.body.children;
  for (let i = 0; i < bodyChildren.length; i += 1) {
    const child = bodyChildren[i];
    if (!(child instanceof HTMLElement)) continue;
    if (IGNORED_PORTAL_TAGS.has(child.tagName)) continue;
    if (child.dataset.modalScrollLock === "false") continue;
    if (isAppPageRootElement(child)) continue;
    if (isNotificationContainerElement(child)) continue;

    const rootStyle = window.getComputedStyle(child);
    if (isElementVisuallyHidden(child, rootStyle)) continue;

    const rootIsFixed = rootStyle.position === "fixed";
    const rootZ = parseEffectiveZIndex(rootStyle.zIndex);
    const rootExplicit = isExplicitDialogLikeElement(child);
    const rootFullViewport = rootIsFixed && isFullViewportFixedOverlay(child);

    if (rootIsFixed && rootStyle.pointerEvents !== "none") {
      if (rootExplicit || (rootFullViewport && rootZ >= 50)) {
        candidates.push({
          element: child,
          rootZIndex: rootZ,
          innerZIndex: 0,
          domOrder: ++domCounter,
        });
      }
    }

    // ポータルラッパー内部のスタックされた別モーダル（例: 早見表モーダル内のフルスクリーンPNGプレビューや Radix DialogContent）を検査
    const descendants = child.querySelectorAll(MODAL_DESCENDANT_SELECTOR);
    let hasInteractiveFixedBackdropChild = false;

    for (let j = 0; j < descendants.length; j += 1) {
      const sub = descendants[j];
      if (!(sub instanceof HTMLElement)) continue;
      if (sub.dataset.modalScrollLock === "false") continue;

      const subStyle = window.getComputedStyle(sub);
      if (isElementVisuallyHidden(sub, subStyle)) continue;
      if (subStyle.position !== "fixed") continue;
      if (subStyle.pointerEvents === "none") continue;

      const subZ = parseEffectiveZIndex(subStyle.zIndex);
      const subExplicit = isExplicitDialogLikeElement(sub);
      const subFullViewport = isFullViewportFixedOverlay(sub);

      if (sub.children.length === 0) {
        if (subFullViewport) {
          hasInteractiveFixedBackdropChild = true;
          // Radix DialogOverlay 等の単独背景レイヤーが存在する場合も背面ロックを有効化
          if (!rootIsFixed && subZ >= 50) {
            candidates.push({
              element: sub,
              rootZIndex: subZ,
              innerZIndex: 0,
              domOrder: ++domCounter,
            });
          }
        }
        continue;
      }

      if (subExplicit || (subFullViewport && subZ >= 50)) {
        const effectiveRootZ = rootIsFixed && rootZ > 0 ? rootZ : subZ;
        candidates.push({
          element: sub,
          rootZIndex: effectiveRootZ,
          innerZIndex: subZ,
          domOrder: ++domCounter,
        });
      }
    }

    // 外枠が `fixed inset-0 pointer-events-none` で内部に有効な全面背景と兄弟メニューを持つ構造（FlickPadButton pinned時等）
    if (
      rootIsFixed &&
      rootStyle.pointerEvents === "none" &&
      rootFullViewport &&
      rootZ >= 50 &&
      hasInteractiveFixedBackdropChild
    ) {
      candidates.push({
        element: child,
        rootZIndex: rootZ,
        innerZIndex: 0,
        domOrder: ++domCounter,
      });
    }
  }

  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const cur = candidates[i];
    if (cur.rootZIndex !== best.rootZIndex) {
      if (cur.rootZIndex > best.rootZIndex) best = cur;
      continue;
    }
    if (cur.innerZIndex !== best.innerZIndex) {
      if (cur.innerZIndex > best.innerZIndex) best = cur;
      continue;
    }
    if (cur.domOrder > best.domOrder) {
      best = cur;
    }
  }

  return best.element;
}

function resolveEventTargetElement(
  rawTarget: EventTarget | null,
  clientX?: number,
  clientY?: number
): Element | null {
  const candidate =
    rawTarget instanceof Element
      ? rawTarget
      : rawTarget instanceof Node
      ? rawTarget.parentElement
      : null;

  if (candidate && candidate.isConnected) {
    return candidate;
  }

  // タッチ中に React の再レンダーで元のターゲットノードが差し替わった場合は座標から現在要素を復元
  if (
    typeof clientX === "number" &&
    typeof clientY === "number" &&
    typeof document !== "undefined" &&
    typeof document.elementFromPoint === "function"
  ) {
    return document.elementFromPoint(clientX, clientY);
  }

  return candidate;
}

function isNativeTouchDragElement(
  target: Element,
  topModal: HTMLElement
): boolean {
  if (target instanceof HTMLInputElement && target.type === "range") {
    return true;
  }
  const rangeInput = target.closest('input[type="range"]');
  if (rangeInput && topModal.contains(rangeInput)) {
    return true;
  }
  const explicitAllow = target.closest('[data-allow-touch-move="true"]');
  if (explicitAllow && topModal.contains(explicitAllow)) {
    return true;
  }
  return false;
}

function collectModalScrollContext(
  target: Element | null,
  topModal: HTMLElement
): {
  isInsideTopModal: boolean;
  isNativeDragControl: boolean;
  scrollableAncestors: ScrollableElementMetrics[];
} {
  if (!target || !topModal.contains(target)) {
    return {
      isInsideTopModal: false,
      isNativeDragControl: false,
      scrollableAncestors: [],
    };
  }

  if (isNativeTouchDragElement(target, topModal)) {
    return {
      isInsideTopModal: true,
      isNativeDragControl: true,
      scrollableAncestors: [],
    };
  }

  const scrollableAncestors: ScrollableElementMetrics[] = [];
  let curr: Element | null = target;

  while (curr && topModal.contains(curr)) {
    // SVG内部要素（`<svg>`, `<g>`, `<path>`, `<rect>`, `<text>` 等）はスキップして親のHTMLスクロール枠まで確実に辿る
    if (curr instanceof HTMLElement) {
      if (
        curr instanceof HTMLInputElement &&
        TEXT_SCROLLABLE_INPUT_TYPES.has(curr.type) &&
        document.activeElement === curr &&
        curr.scrollWidth - curr.clientWidth > 1
      ) {
        scrollableAncestors.push({
          x: {
            scrollOffset: curr.scrollLeft,
            clientSize: curr.clientWidth,
            scrollSize: curr.scrollWidth,
            isOverflowScrollable: true,
          },
          y: {
            scrollOffset: 0,
            clientSize: curr.clientHeight,
            scrollSize: curr.clientHeight,
            isOverflowScrollable: false,
          },
        });
      } else {
        const style = window.getComputedStyle(curr);
        const isYScrollable =
          isScrollableOverflowValue(style.overflowY) &&
          curr.scrollHeight - curr.clientHeight > 1;
        const isXScrollable =
          isScrollableOverflowValue(style.overflowX) &&
          curr.scrollWidth - curr.clientWidth > 1;

        if (isYScrollable || isXScrollable) {
          scrollableAncestors.push({
            x: {
              scrollOffset: curr.scrollLeft,
              clientSize: curr.clientWidth,
              scrollSize: curr.scrollWidth,
              isOverflowScrollable: isXScrollable,
            },
            y: {
              scrollOffset: curr.scrollTop,
              clientSize: curr.clientHeight,
              scrollSize: curr.scrollHeight,
              isOverflowScrollable: isYScrollable,
            },
          });
        }
      }
    }

    if (curr === topModal) break;
    curr = curr.parentElement;
  }

  return {
    isInsideTopModal: true,
    isNativeDragControl: false,
    scrollableAncestors,
  };
}

function handleDocumentTouchStart(event: TouchEvent): void {
  activeTopModal = resolveTopmostActiveModal(document);
  if (!activeTopModal) {
    activeTouchSession = null;
    scheduleModalScrollLockSync();
    return;
  }

  if (event.touches.length === 1) {
    const t = event.touches[0];
    activeTouchSession = {
      identifier: t.identifier,
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastY: t.clientY,
    };
  } else {
    activeTouchSession = null;
  }
}

function handleDocumentTouchMove(event: TouchEvent): void {
  const topModal = activeTopModal?.isConnected
    ? activeTopModal
    : resolveTopmostActiveModal(document);
  activeTopModal = topModal;

  if (!topModal) {
    scheduleModalScrollLockSync();
    return;
  }

  // 2本指以上のジェスチャー：モーダル内のスクロール／明示許可領域外であれば背面スクロールを遮断
  if (event.touches.length !== 1) {
    const firstTouch = event.touches[0];
    const target = resolveEventTargetElement(
      event.target,
      firstTouch?.clientX,
      firstTouch?.clientY
    );
    const ctx = collectModalScrollContext(target, topModal);
    const hasScrollableArea =
      ctx.isNativeDragControl || ctx.scrollableAncestors.length > 0;
    if (!ctx.isInsideTopModal || !hasScrollableArea) {
      if (event.cancelable) {
        event.preventDefault();
      }
    }
    return;
  }

  const touch = event.touches[0];
  if (
    !activeTouchSession ||
    activeTouchSession.identifier !== touch.identifier
  ) {
    activeTouchSession = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
    };
  }

  const frameDx = touch.clientX - activeTouchSession.lastX;
  const frameDy = touch.clientY - activeTouchSession.lastY;
  const totalDx = touch.clientX - activeTouchSession.startX;
  const totalDy = touch.clientY - activeTouchSession.startY;

  if (Math.abs(frameDx) >= 0.5 || Math.abs(frameDy) >= 0.5) {
    activeTouchSession.lastX = touch.clientX;
    activeTouchSession.lastY = touch.clientY;
  }

  const target = resolveEventTargetElement(
    event.target,
    touch.clientX,
    touch.clientY
  );
  const ctx = collectModalScrollContext(target, topModal);

  const shouldAllow = decideModalScrollAllowance({
    isInsideTopModal: ctx.isInsideTopModal,
    isNativeDragControl: ctx.isNativeDragControl,
    scrollDeltaX: -frameDx,
    scrollDeltaY: -frameDy,
    totalDx,
    totalDy,
    scrollableAncestors: ctx.scrollableAncestors,
  });

  if (!shouldAllow && event.cancelable) {
    event.preventDefault();
  }
}

function handleDocumentTouchEnd(event: TouchEvent): void {
  if (event.touches.length === 0) {
    activeTouchSession = null;
  } else if (event.touches.length === 1) {
    const remaining = event.touches[0];
    activeTouchSession = {
      identifier: remaining.identifier,
      startX: remaining.clientX,
      startY: remaining.clientY,
      lastX: remaining.clientX,
      lastY: remaining.clientY,
    };
  }
}

function handleDocumentWheel(event: WheelEvent): void {
  if (event.ctrlKey) return;

  const topModal = activeTopModal?.isConnected
    ? activeTopModal
    : resolveTopmostActiveModal(document);
  activeTopModal = topModal;

  if (!topModal) {
    scheduleModalScrollLockSync();
    return;
  }

  const target = resolveEventTargetElement(
    event.target,
    event.clientX,
    event.clientY
  );
  const ctx = collectModalScrollContext(target, topModal);

  const shouldAllow = decideModalScrollAllowance({
    isInsideTopModal: ctx.isInsideTopModal,
    isNativeDragControl: ctx.isNativeDragControl,
    scrollDeltaX: event.deltaX,
    scrollDeltaY: event.deltaY,
    scrollableAncestors: ctx.scrollableAncestors,
  });

  if (!shouldAllow && event.cancelable) {
    event.preventDefault();
  }
}

function attachActiveModalEventListeners(): void {
  if (activeListenersAttached || typeof document === "undefined") return;
  activeListenersAttached = true;

  document.addEventListener("touchstart", handleDocumentTouchStart, {
    capture: true,
    passive: true,
  });
  document.addEventListener("touchmove", handleDocumentTouchMove, {
    capture: true,
    passive: false,
  });
  document.addEventListener("touchend", handleDocumentTouchEnd, {
    capture: true,
    passive: true,
  });
  document.addEventListener("touchcancel", handleDocumentTouchEnd, {
    capture: true,
    passive: true,
  });
  document.addEventListener("wheel", handleDocumentWheel, {
    capture: true,
    passive: false,
  });
}

function detachActiveModalEventListeners(): void {
  if (!activeListenersAttached || typeof document === "undefined") return;
  activeListenersAttached = false;
  activeTouchSession = null;

  document.removeEventListener("touchstart", handleDocumentTouchStart, true);
  document.removeEventListener("touchmove", handleDocumentTouchMove, true);
  document.removeEventListener("touchend", handleDocumentTouchEnd, true);
  document.removeEventListener("touchcancel", handleDocumentTouchEnd, true);
  document.removeEventListener("wheel", handleDocumentWheel, true);
}

function applyDocumentScrollLock(): void {
  if (isDocumentLocked || typeof document === "undefined" || !document.body) {
    return;
  }

  const html = document.documentElement;
  const body = document.body;

  savedDocumentStyle = {
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
  };

  // PCブラウザ等で従来型スクロールバーが存在する場合のみ横幅ガタつきを補正（モバイルのオーバーレイバーは 0px）
  const scrollbarWidth =
    typeof window !== "undefined" ? window.innerWidth - html.clientWidth : 0;
  if (scrollbarWidth > 0 && typeof window !== "undefined") {
    const currentPaddingRight =
      Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
  }

  html.setAttribute(MODAL_OPEN_DATA_ATTR, "true");
  body.setAttribute(MODAL_OPEN_DATA_ATTR, "true");
  html.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";

  isDocumentLocked = true;
}

function releaseDocumentScrollLock(): void {
  if (!isDocumentLocked || typeof document === "undefined" || !document.body) {
    return;
  }

  const html = document.documentElement;
  const body = document.body;

  html.removeAttribute(MODAL_OPEN_DATA_ATTR);
  body.removeAttribute(MODAL_OPEN_DATA_ATTR);

  if (savedDocumentStyle) {
    body.style.overflow = savedDocumentStyle.bodyOverflow;
    body.style.overscrollBehavior = savedDocumentStyle.bodyOverscrollBehavior;
    body.style.paddingRight = savedDocumentStyle.bodyPaddingRight;
    html.style.overscrollBehavior = savedDocumentStyle.htmlOverscrollBehavior;
    savedDocumentStyle = null;
  } else {
    if (body.style.overflow === "hidden") body.style.overflow = "";
    if (body.style.overscrollBehavior === "none") {
      body.style.overscrollBehavior = "";
    }
    body.style.paddingRight = "";
    if (html.style.overscrollBehavior === "none") {
      html.style.overscrollBehavior = "";
    }
  }

  isDocumentLocked = false;
}

function refreshPortalSubtreeObserver(): void {
  if (!portalSubtreeObserver || typeof document === "undefined" || !document.body) {
    return;
  }

  portalSubtreeObserver.disconnect();

  const bodyChildren = document.body.children;
  for (let i = 0; i < bodyChildren.length; i += 1) {
    const child = bodyChildren[i];
    if (!(child instanceof HTMLElement)) continue;
    if (IGNORED_PORTAL_TAGS.has(child.tagName)) continue;
    if (isAppPageRootElement(child)) continue;
    if (isNotificationContainerElement(child)) continue;

    portalSubtreeObserver.observe(child, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "data-state",
        "data-modal-scroll-lock",
      ],
    });
  }
}

/**
 * 現在のDOM状態と背面スクロールロック状態を即時同期する
 * - 画面遷移後（`popstate`）・WebView復帰時（`visibilitychange`）・エラー境界復旧時にも呼び出し可能
 */
export function syncModalScrollLockState(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!document.body) return;

  const topModal = resolveTopmostActiveModal(document);
  activeTopModal = topModal;

  if (topModal) {
    applyDocumentScrollLock();
    attachActiveModalEventListeners();
  } else {
    detachActiveModalEventListeners();
    releaseDocumentScrollLock();
  }
}

function scheduleModalScrollLockSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;

  const flush = () => {
    syncScheduled = false;
    syncModalScrollLockState();
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(flush);
  } else {
    Promise.resolve().then(flush);
  }
}

function startObservingBodyPortals(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (bodyChildObserver) return;

  portalSubtreeObserver = new MutationObserver(() => {
    scheduleModalScrollLockSync();
  });

  bodyChildObserver = new MutationObserver(() => {
    refreshPortalSubtreeObserver();
    scheduleModalScrollLockSync();
  });

  bodyChildObserver.observe(document.body, {
    childList: true,
    subtree: false,
  });

  refreshPortalSubtreeObserver();
  syncModalScrollLockState();
}

/**
 * アプリ全体のモーダル背面スクロールロックを1度だけインストールする
 */
export function installGlobalModalScrollLock(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (isModalScrollLockInstalled) return;
  isModalScrollLockInstalled = true;

  if (document.body) {
    startObservingBodyPortals();
  } else {
    document.addEventListener("DOMContentLoaded", startObservingBodyPortals, {
      once: true,
    });
  }
}
