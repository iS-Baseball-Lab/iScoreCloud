// filepath: src/lib/liff/calendar-month-bg.ts

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
