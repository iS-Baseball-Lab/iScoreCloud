// filepath: src/lib/liff/japanese-holidays.ts

/**
 * 日本の国民の祝日・振替休日・国民の休日 判定エンジン（内閣府「国民の祝日について」準拠）
 * - 外部ライブラリ依存ゼロ・メモリキャッシュ付きでカレンダー126マス描画時も O(1) で高速応答する
 */

const holidayCache = new Map<string, string | null>();

function toYmdKey(year: number, month1Based: number, day: number): string {
  const m = String(month1Based).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function nthMondayOfMonth(year: number, month1Based: number, nth: number): number {
  const firstDay = new Date(year, month1Based - 1, 1).getDay();
  const firstMonday = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
  return firstMonday + (nth - 1) * 7;
}

/**
 * 国立天文台 略算式による春分日（1980〜2099年対応）
 */
export function calcVernalEquinoxDay(year: number): number {
  return Math.floor(
    20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
  );
}

/**
 * 国立天文台 略算式による秋分日（1980〜2099年対応）
 */
export function calcAutumnalEquinoxDay(year: number): number {
  return Math.floor(
    23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
  );
}

/**
 * 振替休日・国民の休日を除く「本来の国民の祝日（および皇室慶弔特例休日）」名称を返す
 */
function resolveBaseJapaneseHolidayName(
  year: number,
  month: number,
  day: number
): string | null {
  switch (month) {
    case 1: {
      if (day === 1) return "元日";
      const comingOfAgeDay = year >= 2000 ? nthMondayOfMonth(year, 1, 2) : 15;
      if (day === comingOfAgeDay) return "成人の日";
      return null;
    }
    case 2: {
      if (day === 11) return "建国記念の日";
      if (year >= 2020 && day === 23) return "天皇誕生日";
      if (year === 1989 && day === 24) return "大喪の礼";
      return null;
    }
    case 3: {
      if (day === calcVernalEquinoxDay(year)) return "春分の日";
      return null;
    }
    case 4: {
      if (day === 29) {
        if (year >= 2007) return "昭和の日";
        if (year >= 1989) return "みどりの日";
        return "天皇誕生日";
      }
      return null;
    }
    case 5: {
      if (year === 2019 && day === 1) return "天皇の即位の日";
      if (day === 3) return "憲法記念日";
      if (year >= 2007 && day === 4) return "みどりの日";
      if (day === 5) return "こどもの日";
      return null;
    }
    case 6: {
      if (year === 1993 && day === 9) return "結婚の儀";
      return null;
    }
    case 7: {
      if (year === 2020) {
        if (day === 23) return "海の日";
        if (day === 24) return "スポーツの日";
        return null;
      }
      if (year === 2021) {
        if (day === 22) return "海の日";
        if (day === 23) return "スポーツの日";
        return null;
      }
      if (year >= 2003 && day === nthMondayOfMonth(year, 7, 3)) return "海の日";
      if (year >= 1996 && year <= 2002 && day === 20) return "海の日";
      return null;
    }
    case 8: {
      if (year === 2020) return day === 10 ? "山の日" : null;
      if (year === 2021) return day === 8 ? "山の日" : null;
      if (year >= 2016 && day === 11) return "山の日";
      return null;
    }
    case 9: {
      const respectForAgedDay =
        year >= 2003 ? nthMondayOfMonth(year, 9, 3) : 15;
      if (day === respectForAgedDay) return "敬老の日";
      if (day === calcAutumnalEquinoxDay(year)) return "秋分の日";
      return null;
    }
    case 10: {
      if (year === 2019 && day === 22) return "即位礼正殿の儀";
      if (year === 2020 || year === 2021) return null; // 五輪特例により7月へ移動
      if (year >= 2022 && day === nthMondayOfMonth(year, 10, 2)) {
        return "スポーツの日";
      }
      if (year >= 2000 && year <= 2019 && day === nthMondayOfMonth(year, 10, 2)) {
        return "体育の日";
      }
      if (year <= 1999 && day === 10) return "体育の日";
      return null;
    }
    case 11: {
      if (day === 3) return "文化の日";
      if (day === 23) return "勤労感謝の日";
      if (year === 1990 && day === 12) return "即位礼正殿の儀";
      return null;
    }
    case 12: {
      if (year >= 1989 && year <= 2018 && day === 23) return "天皇誕生日";
      return null;
    }
    default:
      return null;
  }
}

/**
 * 指定された Date の日本の祝日名を返す（祝日でない場合は null）
 * - 振替休日（日曜重複時の直後の非祝日平日）および国民の休日（祝日に挟まれた平日）にも対応
 */
export function getJapaneseHolidayName(date: Date): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const cacheKey = toYmdKey(y, m, d);

  if (holidayCache.has(cacheKey)) {
    return holidayCache.get(cacheKey) ?? null;
  }

  const baseName = resolveBaseJapaneseHolidayName(y, m, d);
  if (baseName) {
    holidayCache.set(cacheKey, baseName);
    return baseName;
  }

  const dow = date.getDay();

  // 1. 振替休日判定
  if (dow !== 0) {
    if (yearSupportsMultiDaySubstitute(y)) {
      const cursor = new Date(y, m - 1, d);
      while (true) {
        cursor.setDate(cursor.getDate() - 1);
        const cy = cursor.getFullYear();
        const cm = cursor.getMonth() + 1;
        const cd = cursor.getDate();
        if (!resolveBaseJapaneseHolidayName(cy, cm, cd)) break;
        if (cursor.getDay() === 0) {
          holidayCache.set(cacheKey, "振替休日");
          return "振替休日";
        }
      }
    } else if (y >= 1973 && dow === 1) {
      const prev = new Date(y, m - 1, d - 1);
      if (
        resolveBaseJapaneseHolidayName(
          prev.getFullYear(),
          prev.getMonth() + 1,
          prev.getDate()
        )
      ) {
        holidayCache.set(cacheKey, "振替休日");
        return "振替休日";
      }
    }
  }

  // 2. 国民の休日（前日と翌日がともに「国民の祝日」である平日）
  if (y >= 1986 && dow !== 0) {
    const prev = new Date(y, m - 1, d - 1);
    const next = new Date(y, m - 1, d + 1);
    if (
      resolveBaseJapaneseHolidayName(
        prev.getFullYear(),
        prev.getMonth() + 1,
        prev.getDate()
      ) !== null &&
      resolveBaseJapaneseHolidayName(
        next.getFullYear(),
        next.getMonth() + 1,
        next.getDate()
      ) !== null
    ) {
      holidayCache.set(cacheKey, "国民の休日");
      return "国民の休日";
    }
  }

  holidayCache.set(cacheKey, null);
  return null;
}

function yearSupportsMultiDaySubstitute(year: number): boolean {
  return year >= 2007;
}

/**
 * 指定された Date が日本の祝日（振替休日・国民の休日を含む）かどうかを判定する
 */
export function isJapaneseHoliday(date: Date): boolean {
  return getJapaneseHolidayName(date) !== null;
}

/**
 * `"YYYY-MM-DD"` 等の日付文字列から日本の祝日名を安全に解決する
 */
export function getJapaneseHolidayNameFromDateStr(
  rawDateStr: string | null | undefined
): string | null {
  if (!rawDateStr) return null;
  const match = rawDateStr.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return getJapaneseHolidayName(new Date(y, m - 1, d, 12, 0, 0));
}
