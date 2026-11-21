// filepath: src/lib/liff/calendar-month-bg.ts
import { getJapaneseHolidayName } from "@/lib/liff/japanese-holidays";

export interface CalendarMonthPhotoMeltAsset {
  /** 1〜12 の月番号 */
  month: number;
  /** public/ 配下の静的 WebP パス（960×640・3:2 ノートリミング） */
  src: string;
  /** object-position クラス（aspect-[3/2] コンテナと 1:1 対応し上部切れを防止する object-top） */
  objectPosition: string;
  /** 季節テーマ名（テスト・管理参照用） */
  seasonTheme: string;
}

/**
 * 月間カレンダー（1月〜12月）用の季節×野球グラウンド専用WebPマップ（全12種・960×640 / 3:2）
 * 上空・季節モチーフ（桜・入道雲・紅葉・富士山等）の頭切れゼロとグラウンド全体の視認性を両立
 */
export const CALENDAR_MONTH_PHOTO_MELT_ASSETS: readonly CalendarMonthPhotoMeltAsset[] = [
  {
    month: 1,
    src: "/calendar-bg-01.webp",
    objectPosition: "object-top",
    seasonTheme: "新春・初日の出と朝霜の河川敷グラウンド",
  },
  {
    month: 2,
    src: "/calendar-bg-02.webp",
    objectPosition: "object-top",
    seasonTheme: "紅白梅と早春の野球場",
  },
  {
    month: 3,
    src: "/calendar-bg-03.webp",
    objectPosition: "object-top",
    seasonTheme: "菜の花咲く春の河川敷グラウンド",
  },
  {
    month: 4,
    src: "/calendar-bg-04.webp",
    objectPosition: "object-top",
    seasonTheme: "満開の桜並木と黒土の野球場",
  },
  {
    month: 5,
    src: "/calendar-bg-05.webp",
    objectPosition: "object-top",
    seasonTheme: "新緑と五月晴れのスタジアム",
  },
  {
    month: 6,
    src: "/calendar-bg-06.webp",
    objectPosition: "object-top",
    seasonTheme: "紫陽花と梅雨の晴れ間・虹のグラウンド",
  },
  {
    month: 7,
    src: "/calendar-bg-07.webp",
    objectPosition: "object-top",
    seasonTheme: "ひまわり咲く初夏の野球場と青空",
  },
  {
    month: 8,
    src: "/calendar-bg-08.webp",
    objectPosition: "object-top",
    seasonTheme: "真夏の入道雲と熱闘スタジアム",
  },
  {
    month: 9,
    src: "/calendar-bg-09.webp",
    objectPosition: "object-top",
    seasonTheme: "うろこ雲とコスモス揺れる秋晴れの球場",
  },
  {
    month: 10,
    src: "/calendar-bg-10.webp",
    objectPosition: "object-top",
    seasonTheme: "黄金色のススキと夕焼けの河川敷球場",
  },
  {
    month: 11,
    src: "/calendar-bg-11.webp",
    objectPosition: "object-top",
    seasonTheme: "紅葉とイチョウ並木の秋色スタジアム",
  },
  {
    month: 12,
    src: "/calendar-bg-12.webp",
    objectPosition: "object-top",
    seasonTheme: "雪化粧の冬空スタジアム",
  },
] as const;

/**
 * 任意の数値から 1〜12 の月番号へ安全に正規化する
 * （0 = 前年12月、13 = 翌年1月 などの月送り演算値にも対応）
 */
export function normalizeCalendarMonthNumber(month: number): number {
  if (!Number.isFinite(month)) {
    return 1;
  }
  const intMonth = Math.trunc(month);
  return ((((intMonth - 1) % 12) + 12) % 12) + 1;
}

/**
 * 指定された月（1〜12）に対応する季節背景フォト染み込みアセットを解決する
 */
export function resolveCalendarMonthPhotoMelt(
  month: number
): CalendarMonthPhotoMeltAsset {
  const normalized = normalizeCalendarMonthNumber(month);
  return (
    CALENDAR_MONTH_PHOTO_MELT_ASSETS[normalized - 1] ??
    CALENDAR_MONTH_PHOTO_MELT_ASSETS[0]
  );
}

/**
 * 前月・翌月ボタン操作時のチラつき（0ms切替）を防ぐための前後月アセットを返す
 */
export function getAdjacentCalendarMonthPhotoMelts(
  month: number
): readonly [CalendarMonthPhotoMeltAsset, CalendarMonthPhotoMeltAsset] {
  const normalized = normalizeCalendarMonthNumber(month);
  return [
    resolveCalendarMonthPhotoMelt(normalized - 1),
    resolveCalendarMonthPhotoMelt(normalized + 1),
  ] as const;
}

export type CalendarSwipeAxis = "undecided" | "horizontal" | "vertical";
export type CalendarSwipeDirection = "prev" | "next" | "none";

/**
 * スマート・スワイプ制御：縦スクロールと横フリックを厳格に分離判定する
 * - 8px 未満の微細移動は未確定（タップ操作を阻害しない）
 * - 横移動量が縦移動量の 1.15 倍を超える明確な横操作のみ horizontal と判定し、それ以外は縦スクロール優先とする
 */
export function detectCalendarSwipeAxis(
  dx: number,
  dy: number
): CalendarSwipeAxis {
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
    return "undecided";
  }
  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    return "horizontal";
  }
  return "vertical";
}

export interface ResolveCalendarFlickDirectionParams {
  totalDx: number;
  elapsedMs: number;
  containerWidth: number;
}

/**
 * 横スワイプ／フリック完了時の月切替方向を判定する
 * - 左方向（totalDx < 0）: 翌月（"next"）
 * - 右方向（totalDx > 0）: 前月（"prev"）
 * - 閾値未満の微小ドラッグは "none"（元の月へスプリング復帰）
 */
export function resolveCalendarFlickDirection({
  totalDx,
  elapsedMs,
  containerWidth,
}: ResolveCalendarFlickDirectionParams): CalendarSwipeDirection {
  const safeWidth = Math.max(180, containerWidth || 360);
  const distanceThreshold = Math.min(54, safeWidth * 0.15);
  const safeElapsed = Math.max(1, elapsedMs);
  const velocity = Math.abs(totalDx) / safeElapsed;
  const isFastFlick = Math.abs(totalDx) >= 24 && velocity >= 0.28;

  if (totalDx <= -distanceThreshold || (totalDx < 0 && isFastFlick)) {
    return "next";
  }
  if (totalDx >= distanceThreshold || (totalDx > 0 && isFastFlick)) {
    return "prev";
  }
  return "none";
}

/**
 * 年と月インデックス（0〜11）から通算月シリアル値を算出する
 */
export function toCalendarMonthSerial(year: number, monthIndex: number): number {
  return year * 12 + monthIndex;
}

/**
 * 通算月シリアル値から年・月インデックス（0〜11）・月番号（1〜12）を復元する
 */
export function fromCalendarMonthSerial(serial: number): {
  year: number;
  monthIndex: number;
  monthNumber: number;
} {
  const year = Math.floor(serial / 12);
  const monthIndex = ((serial % 12) + 12) % 12;
  return {
    year,
    monthIndex,
    monthNumber: monthIndex + 1,
  };
}

export interface CalendarGridDayCell {
  date: Date;
  /** YYYY-MM-DD */
  dateStr: string;
  isCurrentMonth: boolean;
  /** 日本の祝日名（平日・通常土日の場合は null） */
  holidayName: string | null;
  /** 日本の祝日（振替休日・国民の休日を含む）フラグ */
  isHoliday: boolean;
}

function toYmdString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createCalendarGridCell(
  date: Date,
  isCurrentMonth: boolean
): CalendarGridDayCell {
  const holidayName = getJapaneseHolidayName(date);
  return {
    date,
    dateStr: toYmdString(date),
    isCurrentMonth,
    holidayName,
    isHoliday: holidayName !== null,
  };
}

/**
 * 指定された年・月インデックス（0〜11）の42マス（日曜始まり6週分）日付配列を生成する
 */
export function buildCalendarMonthGridDays(
  year: number,
  monthIndex: number
): CalendarGridDayCell[] {
  const days: CalendarGridDayCell[] = [];
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const prevMonthLastDate = new Date(year, monthIndex, 0).getDate();

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, monthIndex - 1, prevMonthLastDate - i);
    days.push(createCalendarGridCell(d, false));
  }

  const currentMonthLastDate = new Date(year, monthIndex + 1, 0).getDate();
  for (let i = 1; i <= currentMonthLastDate; i++) {
    const d = new Date(year, monthIndex, i);
    days.push(createCalendarGridCell(d, true));
  }

  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    const d = new Date(year, monthIndex + 1, i);
    days.push(createCalendarGridCell(d, false));
  }

  return days;
}



