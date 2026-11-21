// filepath: src/components/liff/CalendarSwipeSurface.tsx
"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  detectCalendarSwipeAxis,
  resolveCalendarFlickDirection,
  type CalendarSwipeAxis,
} from "@/lib/liff/calendar-month-bg";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface CalendarSwipeSurfaceProps {
  /** 通算月シリアル（currentYear * 12 + currentMonth） */
  monthSerial: number;
  /** 前月へ移動（右方向フリック時） */
  onPrevMonth: () => void;
  /** 翌月へ移動（左方向フリック時） */
  onNextMonth: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * 月間カレンダー共通の横フリック・スワイプ月切替サーフェス
 * - 縦スクロールと横フリックを厳格に判定し、縦移動時はネイティブスクロールを一切妨げない
 * - 横フリック時は指追従のドラッグフィードバック＋月切替後のスムーズなスライドインを行い、静止時は transform を完全解除する
 * - 横スワイプ直後の誤タップ（日付選択・活動日ON/OFF暴発）を capture フェーズで確実に遮断する
 */
export function CalendarSwipeSurface({
  monthSerial,
  onPrevMonth,
  onNextMonth,
  className,
  children,
}: CalendarSwipeSurfaceProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const prevMonthSerialRef = useRef<number>(monthSerial);

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

  const resetStageStyles = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    el.style.opacity = "";
  }, []);

  const animateBackToRest = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    clearSettleTimer();
    el.style.transition =
      "transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease-out";
    el.style.transform = "translate3d(0, 0, 0)";
    el.style.opacity = "1";
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      resetStageStyles();
    }, 220);
  }, [clearSettleTimer, resetStageStyles]);

  // 月が切り替わった際（横フリック・ヘッダー＜＞ボタン双方）の方向付きスライドイン
  useIsomorphicLayoutEffect(() => {
    const prevSerial = prevMonthSerialRef.current;
    if (prevSerial === monthSerial) return;
    prevMonthSerialRef.current = monthSerial;

    const el = stageRef.current;
    if (!el) return;

    clearSettleTimer();
    const enterSign = monthSerial > prevSerial ? 1 : -1;
    el.style.transition = "none";
    el.style.transform = `translate3d(${enterSign * 38}px, 0, 0)`;
    el.style.opacity = "0.78";

    // 強制リフロー後に定位置へスムーズにスライド
    void el.offsetWidth;
    el.style.transition =
      "transform 210ms cubic-bezier(0.22, 1, 0.36, 1), opacity 170ms ease-out";
    el.style.transform = "translate3d(0, 0, 0)";
    el.style.opacity = "1";

    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      resetStageStyles();
    }, 230);
  }, [monthSerial, clearSettleTimer, resetStageStyles]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const gesture = {
      active: false,
      axis: "undecided" as CalendarSwipeAxis,
      startX: 0,
      startY: 0,
      lastX: 0,
      startTime: 0,
      width: 360,
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (gesture.active && gesture.axis === "horizontal") {
          animateBackToRest();
        }
        gesture.active = false;
        gesture.axis = "undecided";
        return;
      }
      const touch = e.touches[0];
      gesture.active = true;
      gesture.axis = "undecided";
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.lastX = touch.clientX;
      gesture.startTime = performance.now();
      gesture.width = Math.max(180, el.clientWidth || 360);
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
          el.style.transition = "none";
        } else {
          return;
        }
      }

      if (gesture.axis !== "horizontal") return;

      if (e.cancelable) {
        e.preventDefault();
      }

      gesture.lastX = touch.clientX;
      const maxDrag = Math.min(140, gesture.width * 0.42);
      const dampedDx = Math.max(-maxDrag, Math.min(maxDrag, dx * 0.62));
      el.style.transform = `translate3d(${dampedDx.toFixed(1)}px, 0, 0)`;
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

      if (direction === "next") {
        onNextMonthRef.current();
      } else if (direction === "prev") {
        onPrevMonthRef.current();
      } else {
        animateBackToRest();
      }
    };

    const onTouchCancel = () => {
      if (!gesture.active) return;
      const wasHorizontal = gesture.axis === "horizontal";
      gesture.active = false;
      gesture.axis = "undecided";
      if (wasHorizontal) {
        animateBackToRest();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      clearSettleTimer();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [animateBackToRest, clearSettleTimer]);

  const handleClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    []
  );

  return (
    <div className="relative bg-card overflow-hidden touch-pan-y">
      <div
        ref={stageRef}
        onClickCapture={handleClickCapture}
        className={cn("relative", className)}
      >
        {children}
      </div>
    </div>
  );
}
