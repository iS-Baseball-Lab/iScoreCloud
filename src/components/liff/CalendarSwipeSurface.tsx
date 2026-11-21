// filepath: src/components/liff/CalendarSwipeSurface.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import {
  detectCalendarSwipeAxis,
  fromCalendarMonthSerial,
  resolveCalendarFlickDirection,
  toCalendarMonthSerial,
  type CalendarSwipeAxis,
} from "@/lib/liff/calendar-month-bg";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const CENTER_TRANSFORM = "translate3d(-100%, 0, 0)";
const NEXT_PANE_TRANSFORM = "translate3d(-200%, 0, 0)";
const PREV_PANE_TRANSFORM = "translate3d(0%, 0, 0)";
const GLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export interface CalendarPaneRenderContext {
  year: number;
  /** 0〜11 */
  monthIndex: number;
  /** 1〜12 */
  monthNumber: number;
  serial: number;
  isActivePane: boolean;
}

export interface CalendarSwipeSurfaceProps {
  /** 表示中の年（例: 2026） */
  year: number;
  /** 表示中の月インデックス（0〜11） */
  monthIndex: number;
  /** 前月へ移動（右方向フリック時） */
  onPrevMonth: () => void;
  /** 翌月へ移動（左方向フリック時） */
  onNextMonth: () => void;
  className?: string;
  children: (pane: CalendarPaneRenderContext) => React.ReactNode;
}

/**
 * 月間カレンダー共通の 3ペイン GPU カルーセル型・横フリック月切替サーフェス
 * - `[前月(0%) | 当月(-100%) | 翌月(-200%)]` の `w-full shrink-0` 3ペインを `key={serial}` で常時保持
 * - Tailwind v4 の個別 `translate` プロパティ（`-translate-x-*`）は `style.transform` と二重加算されて1ペイン分ズレるため使用せず、
 *   CSS `transform` のみ（初期クラス `[transform:translate3d(-100%,0,0)]` ＆ `style.transform`）で統一制御する
 */
export function CalendarSwipeSurface({
  year,
  monthIndex,
  onPrevMonth,
  onNextMonth,
  className,
  children,
}: CalendarSwipeSurfaceProps) {
  const targetSerial = toCalendarMonthSerial(year, monthIndex);
  const [baseSerial, setBaseSerial] = useState<number>(targetSerial);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickUntilRef = useRef<number>(0);

  const baseSerialRef = useRef<number>(baseSerial);
  const targetSerialRef = useRef<number>(targetSerial);
  const animatingToSerialRef = useRef<number | null>(null);

  baseSerialRef.current = baseSerial;
  targetSerialRef.current = targetSerial;

  const onPrevMonthRef = useRef(onPrevMonth);
  const onNextMonthRef = useRef(onNextMonth);
  onPrevMonthRef.current = onPrevMonth;
  onNextMonthRef.current = onNextMonth;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  // baseSerial 更新時、ブラウザ描画前に 0ms でトラックを中央ペイン（-100%）へ無振動リセット
  useIsomorphicLayoutEffect(() => {
    baseSerialRef.current = baseSerial;
    const track = trackRef.current;
    if (!track) return;
    track.style.transitionProperty = "transform";
    track.style.transitionDuration = "0ms";
    track.style.transform = CENTER_TRANSFORM;
  }, [baseSerial]);

  // ヘッダーの ＜ / ＞ / 今日 ボタン操作による外部からの月変更にも滑らかに追従
  useIsomorphicLayoutEffect(() => {
    if (targetSerial === baseSerial) {
      if (
        animatingToSerialRef.current !== null &&
        animatingToSerialRef.current !== targetSerial
      ) {
        clearSettleTimer();
        animatingToSerialRef.current = null;
        const track = trackRef.current;
        if (track) {
          track.style.transitionProperty = "transform";
          track.style.transitionDuration = "200ms";
          track.style.transitionTimingFunction = GLIDE_EASING;
          track.style.transform = CENTER_TRANSFORM;
        }
      }
      return;
    }

    // 横フリック側で既に該当月へのスライドアニメーションを開始している場合はそのまま継続
    if (animatingToSerialRef.current === targetSerial) {
      return;
    }

    const delta = targetSerial - baseSerial;
    const track = trackRef.current;

    // 1ヶ月分の移動（＜ / ＞ ボタン）は隣ペインへ滑らかにスライドしてから baseSerial を確定
    if (Math.abs(delta) === 1 && animatingToSerialRef.current === null && track) {
      clearSettleTimer();
      animatingToSerialRef.current = targetSerial;
      track.style.transitionProperty = "transform";
      track.style.transitionDuration = "0ms";
      track.style.transform = CENTER_TRANSFORM;
      void track.offsetWidth;

      track.style.transitionDuration = "230ms";
      track.style.transitionTimingFunction = GLIDE_EASING;
      track.style.transform =
        delta > 0 ? NEXT_PANE_TRANSFORM : PREV_PANE_TRANSFORM;

      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        animatingToSerialRef.current = null;
        setBaseSerial(targetSerial);
      }, 240);
      return;
    }

    // 2ヶ月以上のジャンプ（「今日」ボタンや高速連打時）は即座に同期
    clearSettleTimer();
    animatingToSerialRef.current = null;
    setBaseSerial(targetSerial);
  }, [targetSerial, baseSerial, clearSettleTimer]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const gesture = {
      active: false,
      axis: "undecided" as CalendarSwipeAxis,
      startX: 0,
      startY: 0,
      lastX: 0,
      startTime: 0,
      width: 360,
    };

    const animateSnapToCenter = () => {
      const track = trackRef.current;
      if (!track) return;
      track.style.transitionProperty = "transform";
      track.style.transitionDuration = "200ms";
      track.style.transitionTimingFunction = GLIDE_EASING;
      track.style.transform = CENTER_TRANSFORM;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (gesture.active && gesture.axis === "horizontal") {
          animateSnapToCenter();
        }
        gesture.active = false;
        gesture.axis = "undecided";
        return;
      }

      // 前回のスライド完了前に連続フリックした場合は即座に前フレームを確定して次ペインを準備
      if (animatingToSerialRef.current !== null) {
        const pendingSerial = animatingToSerialRef.current;
        clearSettleTimer();
        animatingToSerialRef.current = null;
        flushSync(() => {
          setBaseSerial(pendingSerial);
        });
      }

      const touch = e.touches[0];
      gesture.active = true;
      gesture.axis = "undecided";
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.lastX = touch.clientX;
      gesture.startTime = performance.now();
      gesture.width = Math.max(180, viewport.clientWidth || 360);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!gesture.active || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.axis === "undecided") {
        const detected = detectCalendarSwipeAxis(dx, dy);
        if (detected === "undecided") return;
        gesture.axis = detected;
        if (detected === "horizontal") {
          clearSettleTimer();
          if (trackRef.current) {
            trackRef.current.style.transitionDuration = "0ms";
          }
        } else {
          return;
        }
      }

      if (gesture.axis !== "horizontal") return;

      if (e.cancelable) {
        e.preventDefault();
      }

      gesture.lastX = touch.clientX;
      const clampedDx = Math.max(
        -gesture.width,
        Math.min(gesture.width, dx)
      );
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(calc(-100% + ${clampedDx.toFixed(1)}px), 0, 0)`;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!gesture.active) return;
      const endTouch = e.changedTouches.length > 0 ? e.changedTouches[0] : null;
      const finalX = endTouch ? endTouch.clientX : gesture.lastX;
      const finalY = endTouch ? endTouch.clientY : gesture.startY;
      const totalDx = finalX - gesture.startX;
      const totalDy = finalY - gesture.startY;

      let effectiveAxis = gesture.axis;
      if (effectiveAxis === "undecided" && endTouch) {
        effectiveAxis = detectCalendarSwipeAxis(totalDx, totalDy);
      }

      const wasHorizontal = effectiveAxis === "horizontal";
      const elapsedMs = performance.now() - gesture.startTime;
      const containerWidth = gesture.width;

      gesture.active = false;
      gesture.axis = "undecided";

      if (!wasHorizontal) return;

      suppressClickUntilRef.current = performance.now() + 320;

      const direction = resolveCalendarFlickDirection({
        totalDx,
        elapsedMs,
        containerWidth,
      });

      const track = trackRef.current;
      if (direction === "next") {
        const nextSerial = baseSerialRef.current + 1;
        clearSettleTimer();
        animatingToSerialRef.current = nextSerial;
        if (track) {
          track.style.transitionProperty = "transform";
          track.style.transitionDuration = "220ms";
          track.style.transitionTimingFunction = GLIDE_EASING;
          track.style.transform = NEXT_PANE_TRANSFORM;
        }
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          animatingToSerialRef.current = null;
          setBaseSerial(nextSerial);
        }, 230);
        onNextMonthRef.current();
      } else if (direction === "prev") {
        const prevSerial = baseSerialRef.current - 1;
        clearSettleTimer();
        animatingToSerialRef.current = prevSerial;
        if (track) {
          track.style.transitionProperty = "transform";
          track.style.transitionDuration = "220ms";
          track.style.transitionTimingFunction = GLIDE_EASING;
          track.style.transform = PREV_PANE_TRANSFORM;
        }
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          animatingToSerialRef.current = null;
          setBaseSerial(prevSerial);
        }, 230);
        onPrevMonthRef.current();
      } else {
        animateSnapToCenter();
      }
    };

    const onTouchCancel = () => {
      if (!gesture.active) return;
      const wasHorizontal = gesture.axis === "horizontal";
      gesture.active = false;
      gesture.axis = "undecided";
      if (wasHorizontal) {
        animateSnapToCenter();
      }
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      clearSettleTimer();
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [clearSettleTimer]);

  const handleClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    []
  );

  const paneSerials = [baseSerial - 1, baseSerial, baseSerial + 1] as const;

  return (
    <div
      ref={viewportRef}
      onClickCapture={handleClickCapture}
      className="w-full bg-card overflow-hidden touch-pan-y"
    >
      <div
        ref={trackRef}
        className="flex w-full items-start [transform:translate3d(-100%,0,0)] will-change-transform"
      >
        {paneSerials.map((serial) => {
          const info = fromCalendarMonthSerial(serial);
          const isActivePane = serial === targetSerial;
          return (
            <div
              key={serial}
              aria-hidden={!isActivePane || undefined}
              inert={!isActivePane}
              className={cn(
                "relative w-full shrink-0 bg-card overflow-hidden",
                className
              )}
            >
              {children({
                year: info.year,
                monthIndex: info.monthIndex,
                monthNumber: info.monthNumber,
                serial,
                isActivePane,
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
