// filepath: src/lib/liff/schedule-default-times.ts

/**
 * ⏰ 予定スケジューラー（活動日作成時）のチーム共通デフォルト時間設定
 * - 午前（AM）の開始・終了時刻（初期値: 08:00 - 12:00）
 * - 午後（PM）の季節別・対象月別 開始・終了時刻
 *   - 通常期・夏時間（初期値: 4月〜10月）: 12:00 - 18:00
 *   - 冬時間・日没短縮期（初期値: 11月〜3月）: 12:00 - 16:00
 * - 1〜12月の月選択（範囲プリセット＋月別トグルの排他制御）に対応
 */

export interface TeamScheduleDefaultTimes {
  amStart: string;
  amEnd: string;
  /** 第1期間（夏時間・通常期）に属する月番号（1〜12）。残りの月は自動的に第2期間（冬時間）となる */
  summerMonths: number[];
  summerPmStart: string;
  summerPmEnd: string;
  winterPmStart: string;
  winterPmEnd: string;
}

export const DEFAULT_TEAM_SCHEDULE_TIMES: TeamScheduleDefaultTimes = {
  amStart: "08:00",
  amEnd: "12:00",
  summerMonths: [4, 5, 6, 7, 8, 9, 10],
  summerPmStart: "12:00",
  summerPmEnd: "18:00",
  winterPmStart: "12:00",
  winterPmEnd: "16:00",
};

const VALID_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function sanitizeTime(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (VALID_TIME_RE.test(trimmed)) return trimmed;
    const shortMatch = trimmed.match(/^(\d):([0-5]\d)$/);
    if (shortMatch) {
      return `0${shortMatch[1]}:${shortMatch[2]}`;
    }
  }
  return fallback;
}

function sanitizeMonths(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const valid = Array.from(
    new Set(
      value
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
    )
  ).sort((a, b) => a - b);
  return valid;
}

export function normalizeTeamScheduleDefaultTimes(
  raw: unknown
): TeamScheduleDefaultTimes {
  if (!raw) return { ...DEFAULT_TEAM_SCHEDULE_TIMES, summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths] };
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw) as unknown;
      if (obj && typeof obj === "object") {
        parsed = obj as Record<string, unknown>;
      }
    } catch {
      return { ...DEFAULT_TEAM_SCHEDULE_TIMES, summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths] };
    }
  } else if (typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  }

  if (!parsed) {
    return { ...DEFAULT_TEAM_SCHEDULE_TIMES, summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths] };
  }

  const hasExplicitMonths = Array.isArray(parsed.summerMonths);
  return {
    amStart: sanitizeTime(parsed.amStart, DEFAULT_TEAM_SCHEDULE_TIMES.amStart),
    amEnd: sanitizeTime(parsed.amEnd, DEFAULT_TEAM_SCHEDULE_TIMES.amEnd),
    summerMonths: hasExplicitMonths
      ? sanitizeMonths(parsed.summerMonths, DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths)
      : [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths],
    summerPmStart: sanitizeTime(parsed.summerPmStart, DEFAULT_TEAM_SCHEDULE_TIMES.summerPmStart),
    summerPmEnd: sanitizeTime(parsed.summerPmEnd, DEFAULT_TEAM_SCHEDULE_TIMES.summerPmEnd),
    winterPmStart: sanitizeTime(parsed.winterPmStart, DEFAULT_TEAM_SCHEDULE_TIMES.winterPmStart),
    winterPmEnd: sanitizeTime(parsed.winterPmEnd, DEFAULT_TEAM_SCHEDULE_TIMES.winterPmEnd),
  };
}

/**
 * 開始月〜終了月（例: 4月〜10月、または年跨ぎ 11月〜3月）から月配列を生成する
 */
export function buildContiguousMonths(startMonth: number, endMonth: number): number[] {
  const s = Math.min(12, Math.max(1, Math.trunc(startMonth)));
  const e = Math.min(12, Math.max(1, Math.trunc(endMonth)));
  const result: number[] = [];
  let cur = s;
  for (let guard = 0; guard < 12; guard++) {
    result.push(cur);
    if (cur === e) break;
    cur = cur === 12 ? 1 : cur + 1;
  }
  return result.sort((a, b) => a - b);
}

/**
 * 第1期間（夏時間）に含まれない残りの月（冬時間）を取得する
 */
export function getWinterMonths(summerMonths: ReadonlyArray<number>): number[] {
  const summerSet = new Set(summerMonths);
  const winter: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!summerSet.has(m)) winter.push(m);
  }
  return winter;
}

/**
 * 月集合が連続区間（年跨ぎ含む）であれば { startMonth, endMonth } を返す
 */
export function detectContiguousMonthRange(
  months: ReadonlyArray<number>
): { startMonth: number; endMonth: number } | null {
  const unique = Array.from(new Set(months.filter((m) => m >= 1 && m <= 12))).sort((a, b) => a - b);
  if (unique.length === 0) return null;
  if (unique.length === 12) return { startMonth: 1, endMonth: 12 };
  if (unique.length === 1) return { startMonth: unique[0], endMonth: unique[0] };

  const set = new Set(unique);
  // 直前の月が含まれていない月が連続区間の先頭候補
  const starts: number[] = [];
  for (const m of unique) {
    const prev = m === 1 ? 12 : m - 1;
    if (!set.has(prev)) starts.push(m);
  }
  if (starts.length !== 1) return null;
  const startMonth = starts[0];
  let endMonth = startMonth;
  for (let i = 1; i < unique.length; i++) {
    endMonth = endMonth === 12 ? 1 : endMonth + 1;
  }
  return { startMonth, endMonth };
}

/**
 * 月配列を人間が読みやすい表記（例: "4月〜10月", "11月〜3月", "4・5・9月"）に整形
 */
export function formatMonthSetLabel(months: ReadonlyArray<number>): string {
  const unique = Array.from(new Set(months.filter((m) => m >= 1 && m <= 12))).sort((a, b) => a - b);
  if (unique.length === 0) return "対象月なし";
  if (unique.length === 12) return "通年（1月〜12月）";
  const range = detectContiguousMonthRange(unique);
  if (range) {
    return range.startMonth === range.endMonth
      ? `${range.startMonth}月`
      : `${range.startMonth}月〜${range.endMonth}月`;
  }
  return `${unique.join("・")}月`;
}

export interface ResolvedDateScheduleTimes {
  month: number;
  season: "summer" | "winter";
  seasonLabel: string;
  amStart: string;
  amEnd: string;
  amTimeLabel: string;
  pmStart: string;
  pmEnd: string;
  pmTimeLabel: string;
  startAtIso: string;
  endAtIso: string;
  pmStartAtIso: string;
  pmEndAtIso: string;
}

/**
 * 指定日付（YYYY-MM-DD または Date）に対する午前・午後のデフォルト時間を解決する
 */
export function resolveDefaultScheduleTimesForDate(
  config: TeamScheduleDefaultTimes | null | undefined,
  dateOrDateStr: Date | string
): ResolvedDateScheduleTimes {
  const cfg = config ? normalizeTeamScheduleDefaultTimes(config) : DEFAULT_TEAM_SCHEDULE_TIMES;

  let dateStr = "";
  let month = 4;
  if (typeof dateOrDateStr === "string") {
    const m = dateOrDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      dateStr = `${m[1]}-${m[2]}-${m[3]}`;
      month = Number(m[2]);
    } else {
      const d = new Date(dateOrDateStr);
      const y = d.getFullYear();
      const mo = d.getMonth() + 1;
      const day = d.getDate();
      dateStr = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      month = mo;
    }
  } else {
    const y = dateOrDateStr.getFullYear();
    const mo = dateOrDateStr.getMonth() + 1;
    const day = dateOrDateStr.getDate();
    dateStr = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    month = mo;
  }

  const isSummer = cfg.summerMonths.includes(month);
  const pmStart = isSummer ? cfg.summerPmStart : cfg.winterPmStart;
  const pmEnd = isSummer ? cfg.summerPmEnd : cfg.winterPmEnd;

  return {
    month,
    season: isSummer ? "summer" : "winter",
    seasonLabel: isSummer ? "通常・夏時間" : "冬時間",
    amStart: cfg.amStart,
    amEnd: cfg.amEnd,
    amTimeLabel: `${cfg.amStart}〜${cfg.amEnd}`,
    pmStart,
    pmEnd,
    pmTimeLabel: `${pmStart}〜${pmEnd}`,
    startAtIso: `${dateStr}T${cfg.amStart}:00`,
    endAtIso: `${dateStr}T${cfg.amEnd}:00`,
    pmStartAtIso: `${dateStr}T${pmStart}:00`,
    pmEndAtIso: `${dateStr}T${pmEnd}:00`,
  };
}

/**
 * "08:00〜12:00" や "08:00 - 12:00" から開始・終了の HH:MM ペアを抽出する
 */
export function parseTimeRangeLabel(
  label: string | null | undefined,
  fallbackStart: string,
  fallbackEnd: string
): { start: string; end: string } {
  if (!label) return { start: fallbackStart, end: fallbackEnd };
  const matches = label.match(/(\d{1,2}:\d{2})/g);
  if (!matches || matches.length === 0) {
    return { start: fallbackStart, end: fallbackEnd };
  }
  const start = sanitizeTime(matches[0], fallbackStart);
  const end = matches[1] ? sanitizeTime(matches[1], fallbackEnd) : fallbackEnd;
  return { start, end };
}

/**
 * ISO文字列（"2026-11-08T08:00:00.000Z" 等）または Date からタイムゾーンずれ無しで HH:MM を抽出する
 */
export function extractRawTimeHHMM(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    const isoMatch = val.match(/T(\d{2}:\d{2})/);
    if (isoMatch) return isoMatch[1];
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const iso = val.toISOString();
    const m = iso.match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
  }
  return null;
}

/**
 * 時刻選択用のオプション一覧（05:30 〜 21:30 の30分刻み）
 */
export const SCHEDULE_TIME_OPTIONS: Array<{ value: string; label: string }> = (() => {
  const list: Array<{ value: string; label: string }> = [];
  for (let h = 5; h <= 21; h++) {
    for (const min of [0, 30]) {
      if (h === 5 && min === 0) continue;
      const hh = String(h).padStart(2, "0");
      const mm = String(min).padStart(2, "0");
      const v = `${hh}:${mm}`;
      list.push({ value: v, label: v });
    }
  }
  return list;
})();

const STORAGE_KEY_PREFIX = "iscore_schedule_default_times_v1_";

export function loadCachedTeamScheduleDefaultTimes(teamId?: string | null): TeamScheduleDefaultTimes {
  if (typeof window === "undefined" || !teamId) {
    return { ...DEFAULT_TEAM_SCHEDULE_TIMES, summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths] };
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${teamId}`);
    if (!raw) {
      return { ...DEFAULT_TEAM_SCHEDULE_TIMES, summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths] };
    }
    return normalizeTeamScheduleDefaultTimes(raw);
  } catch {
    return { ...DEFAULT_TEAM_SCHEDULE_TIMES, summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths] };
  }
}

export function saveCachedTeamScheduleDefaultTimes(
  teamId: string | null | undefined,
  config: TeamScheduleDefaultTimes
): void {
  if (typeof window === "undefined" || !teamId) return;
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${teamId}`,
      JSON.stringify(normalizeTeamScheduleDefaultTimes(config))
    );
  } catch {
    // ignore storage quota errors
  }
}
