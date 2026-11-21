// filepath: src/components/liff/CalendarMonthPhotoMelt.tsx
"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  getAdjacentCalendarMonthPhotoMelts,
  resolveCalendarMonthPhotoMelt,
} from "@/lib/liff/calendar-month-bg";

const preloadedCalendarSources = new Set<string>();

const CALENDAR_PHOTO_MELT_MASK =
  "linear-gradient(to bottom, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.88) 36%, rgba(0,0,0,0.22) 60%, rgba(0,0,0,0.05) 82%, rgba(0,0,0,0) 100%)";

export interface CalendarMonthPhotoMeltProps {
  /** 表示中の月（1〜12） */
  month: number;
  /** カレンダー種別に応じた高さバリアント */
  variant?: "default" | "compact";
  /** 初回ファーストビュー表示時は eager 指定可 */
  eager?: boolean;
  className?: string;
}

/**
 * 月間カレンダーの A-3 上帯ダークキャップ直下に配置する季節フォト背景染み込みレイヤー
 * - 上部で月別の野球場×季節風景を見せ、曜日〜日付グリッド上部へ mask-image で段階透過して bg-card へ溶け込ませる
 * - 前月・翌月のWebPをバックグラウンドで先読みし、月切り替え時の空白チラつきをゼロにする
 */
export function CalendarMonthPhotoMelt({
  month,
  variant = "default",
  eager = false,
  className,
}: CalendarMonthPhotoMeltProps) {
  const asset = resolveCalendarMonthPhotoMelt(month);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const neighbors = getAdjacentCalendarMonthPhotoMelts(month);
    for (const item of neighbors) {
      if (preloadedCalendarSources.has(item.src)) continue;
      preloadedCalendarSources.add(item.src);
      const img = new window.Image();
      img.decoding = "async";
      img.src = item.src;
    }
  }, [month]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 top-0 pointer-events-none select-none overflow-hidden",
        variant === "compact" ? "h-42 sm:h-48" : "h-46 sm:h-52",
        className
      )}
    >
      <img
        src={asset.src}
        alt=""
        width={960}
        height={640}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={{
          WebkitMaskImage: CALENDAR_PHOTO_MELT_MASK,
          maskImage: CALENDAR_PHOTO_MELT_MASK,
        }}
        className={cn("w-full h-full object-cover", asset.objectPosition)}
      />
    </div>
  );
}
