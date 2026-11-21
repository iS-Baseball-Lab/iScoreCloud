// filepath: src/components/liff/CalendarMonthPhotoMelt.tsx
"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  getAdjacentCalendarMonthPhotoMelts,
  resolveCalendarMonthPhotoMelt,
} from "@/lib/liff/calendar-month-bg";

const preloadedCalendarSources = new Set<string>();
const CALENDAR_PHOTO_ASSET_REVISION = "3";

function withCalendarAssetRevision(src: string): string {
  return `${src}?v=${CALENDAR_PHOTO_ASSET_REVISION}`;
}

const CALENDAR_PHOTO_MELT_MASK =
  "linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.90) 60%, rgba(0,0,0,0.30) 71%, rgba(0,0,0,0.09) 83%, rgba(0,0,0,0.02) 93%, rgba(0,0,0,0) 100%)";

export interface CalendarMonthPhotoMeltProps {
  /** 表示中の月（1〜12） */
  month: number;
  /** カレンダー種別に応じたバリアント（互換保持） */
  variant?: "default" | "compact";
  /** 初回ファーストビュー表示時は eager 指定可 */
  eager?: boolean;
  className?: string;
}

/**
 * 月間カレンダーの A-3 上帯ダークキャップ直下に配置する季節フォト背景染み込みレイヤー
 * - 元画像と完全同一の `aspect-[3/2]` で描画することで、上空・木々・入道雲の頭切れゼロ（0pxトリミング）と
 *   外野芝・黒土ダイヤモンド全体の鮮明表示を両立し、下端 71%〜100% で曜日・日付グリッドへ自然に溶け込ませる
 * - 前月・翌月のWebPをバックグラウンドで先読みし、月切り替え時の空白チラつきをゼロにする
 */
export function CalendarMonthPhotoMelt({
  month,
  eager = false,
  className,
}: CalendarMonthPhotoMeltProps) {
  const asset = resolveCalendarMonthPhotoMelt(month);
  const versionedSrc = withCalendarAssetRevision(asset.src);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const neighbors = getAdjacentCalendarMonthPhotoMelts(month);
    for (const item of neighbors) {
      const neighborUrl = withCalendarAssetRevision(item.src);
      if (preloadedCalendarSources.has(neighborUrl)) continue;
      preloadedCalendarSources.add(neighborUrl);
      const img = new window.Image();
      img.decoding = "async";
      img.src = neighborUrl;
    }
  }, [month]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 top-0 w-full aspect-[3/2] pointer-events-none select-none overflow-hidden",
        className
      )}
    >
      <img
        src={versionedSrc}
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
