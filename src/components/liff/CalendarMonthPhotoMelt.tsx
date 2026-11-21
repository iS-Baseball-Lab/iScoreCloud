// filepath: src/components/liff/CalendarMonthPhotoMelt.tsx
"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  CALENDAR_MONTH_PHOTO_MELT_ASSETS,
  resolveCalendarMonthPhotoMelt,
} from "@/lib/liff/calendar-month-bg";

/**
 * デコード済み HTMLImageElement をモジュールスコープで保持し、
 * GC によるデコード済みビットマップ破棄（月切替時の白フラッシュ・再デコードちらつき）を完全に防止する
 */
const retainedCalendarImages = new Map<string, HTMLImageElement>();
let warmAllScheduled = false;

const CALENDAR_PHOTO_ASSET_REVISION = "3";

export function withCalendarAssetRevision(src: string): string {
  return `${src}?v=${CALENDAR_PHOTO_ASSET_REVISION}`;
}

function warmDecodedCalendarImage(rawSrc: string): void {
  if (typeof window === "undefined") return;
  const url = withCalendarAssetRevision(rawSrc);
  if (retainedCalendarImages.has(url)) return;
  const img = new window.Image();
  img.decoding = "sync";
  img.src = url;
  retainedCalendarImages.set(url, img);
  if (typeof img.decode === "function") {
    void img.decode().catch(() => {
      // キャッシュ読込失敗時は標準描画へフォールバック
    });
  }
}

const CALENDAR_PHOTO_MELT_MASK =
  "linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.90) 60%, rgba(0,0,0,0.30) 71%, rgba(0,0,0,0.09) 83%, rgba(0,0,0,0.02) 93%, rgba(0,0,0,0) 100%)";

export interface CalendarMonthPhotoMeltProps {
  /** 表示中の月（1〜12） */
  month: number;
  /** カレンダー種別に応じたバリアント（互換保持） */
  variant?: "default" | "compact";
  /** 互換プロパティ（3ペイン常時即応のため常に eager + sync デコードを使用） */
  eager?: boolean;
  className?: string;
}

/**
 * 月間カレンダーの A-3 上帯ダークキャップ直下に配置する季節フォト背景染み込みレイヤー
 * - 元画像と完全同一の `aspect-[3/2]` で描画し、上空・木々・入道雲の頭切れゼロとグラウンド全体の視認性を両立
 * - `loading="eager"` ＆ `decoding="sync"` と永続デコード済み Image キャッシュにより、フリック時のちらつきを完全排除
 */
export function CalendarMonthPhotoMelt({
  month,
  className,
}: CalendarMonthPhotoMeltProps) {
  const asset = resolveCalendarMonthPhotoMelt(month);
  const versionedSrc = withCalendarAssetRevision(asset.src);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 当月および前後2ヶ月を即座にデコード保持（高速連続フリック対応）
    for (const offset of [0, -1, 1, -2, 2]) {
      const target = resolveCalendarMonthPhotoMelt(month + offset);
      warmDecodedCalendarImage(target.src);
    }

    // アイドル時に残り全月分も事前デコードして年間フリックを完全無遅延化
    if (!warmAllScheduled) {
      warmAllScheduled = true;
      const timer = window.setTimeout(() => {
        for (const item of CALENDAR_MONTH_PHOTO_MELT_ASSETS) {
          warmDecodedCalendarImage(item.src);
        }
      }, 450);
      return () => {
        window.clearTimeout(timer);
      };
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
        loading="eager"
        decoding="sync"
        draggable={false}
        style={{
          WebkitMaskImage: CALENDAR_PHOTO_MELT_MASK,
          maskImage: CALENDAR_PHOTO_MELT_MASK,
        }}
        className={cn("w-full h-full object-cover", asset.objectPosition)}
      />
    </div>
  );
}
