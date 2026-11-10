// filepath: src/lib/liff/player-condition.ts

export type PlayerConditionStatus = "active" | "restricted" | "rehab" | "on_leave";
export type NonActiveConditionStatus = "restricted" | "rehab" | "on_leave";

export const PLAYER_CONDITION_STATUS_ORDER: readonly PlayerConditionStatus[] = [
  "active",
  "restricted",
  "rehab",
  "on_leave",
] as const;

export function normalizePlayerConditionStatus(raw: unknown): PlayerConditionStatus {
  if (raw === "restricted" || raw === "rehab" || raw === "on_leave") {
    return raw;
  }
  return "active";
}

export function isNonActiveConditionStatus(raw: unknown): raw is NonActiveConditionStatus {
  return raw === "restricted" || raw === "rehab" || raw === "on_leave";
}

export interface PlayerConditionPeriod {
  id: string;
  playerId: string;
  status: NonActiveConditionStatus;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string | null; // 'YYYY-MM-DD' | null (= 未定)
  privateNote?: string | null; // 指導者・管理者以外はサーバー側で常に null
  updatedAt?: number;
}

export interface ResolvedPlayerCondition {
  status: PlayerConditionStatus;
  period: PlayerConditionPeriod | null;
  note: string | null;
}

export function getTodayJstDateKey(nowMs: number = Date.now()): string {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeIsoDateKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\//g, "-");
  const m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const day = Number.parseInt(m[3], 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftIsoDateKeyByDays(dateKey: string, deltaDays: number): string {
  const norm = normalizeIsoDateKey(dateKey);
  if (!norm) return getTodayJstDateKey();
  const [y, m, d] = norm.split("-").map((v) => Number.parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(dt.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function shiftIsoDateKeyByMonths(dateKey: string, deltaMonths: number): string {
  const norm = normalizeIsoDateKey(dateKey);
  if (!norm) return getTodayJstDateKey();
  const [y, m, d] = norm.split("-").map((v) => Number.parseInt(v, 10));
  const targetMonthIndex = m - 1 + deltaMonths;
  const firstOfTarget = new Date(Date.UTC(y, targetMonthIndex, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTarget);
  const dt = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), clampedDay)
  );
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(dt.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function formatIsoDateSlash(
  raw: string | null | undefined,
  compact: boolean = false
): string {
  const norm = normalizeIsoDateKey(raw);
  if (!norm) return "";
  const [y, m, d] = norm.split("-");
  if (compact) {
    return `${Number.parseInt(m, 10)}/${Number.parseInt(d, 10)}`;
  }
  return `${y}/${m}/${d}`;
}

export function formatConditionPeriodRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  options?: { compact?: boolean }
): string {
  const compact = Boolean(options?.compact);
  const startNorm = normalizeIsoDateKey(startDate);
  const endNorm = normalizeIsoDateKey(endDate);
  if (!startNorm && !endNorm) return "";
  const startLabel = startNorm ? formatIsoDateSlash(startNorm, compact) : "";
  const endLabel = endNorm ? formatIsoDateSlash(endNorm, compact) : "未定";
  if (!startLabel) return compact ? `〜${endLabel}` : `〜 ${endLabel}`;
  return compact ? `${startLabel}〜${endLabel}` : `${startLabel} 〜 ${endLabel}`;
}

export function countConditionPeriodDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  todayKey: string = getTodayJstDateKey()
): { days: number; isOngoing: boolean; isFuture: boolean } {
  const s = normalizeIsoDateKey(startDate);
  if (!s) return { days: 0, isOngoing: false, isFuture: false };
  const e = normalizeIsoDateKey(endDate);
  const today = normalizeIsoDateKey(todayKey) || getTodayJstDateKey();
  const isFuture = s > today;
  const isOngoing = s <= today && (!e || today <= e);
  const calcEnd = e || (s <= today ? today : s);
  const [sy, sm, sd] = s.split("-").map((v) => Number.parseInt(v, 10));
  const [ey, em, ed] = calcEnd.split("-").map((v) => Number.parseInt(v, 10));
  const diffMs = Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd);
  const days = Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
  return { days, isOngoing, isFuture };
}

export function sortPlayerConditionPeriods(
  periods: readonly PlayerConditionPeriod[]
): PlayerConditionPeriod[] {
  return [...periods].sort((a, b) => {
    if (a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate);
    }
    const endA = a.endDate || "9999-12-31";
    const endB = b.endDate || "9999-12-31";
    if (endA !== endB) {
      return endA.localeCompare(endB);
    }
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

export function maskConditionPeriodsForViewer(
  periods: readonly PlayerConditionPeriod[] | null | undefined,
  canViewPrivateNote: boolean
): PlayerConditionPeriod[] {
  if (!periods || periods.length === 0) return [];
  return sortPlayerConditionPeriods(periods).map((p) => ({
    id: p.id,
    playerId: p.playerId,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate ?? null,
    privateNote: canViewPrivateNote ? p.privateNote || null : null,
    updatedAt: p.updatedAt,
  }));
}

/**
 * 指定日（YYYY-MM-DD）における選手の有効なコンディション状態を純粋計算する。
 * - `conditionPeriods` が1件以上ある場合: `startDate <= targetDate <= (endDate ?? ∞)` に該当する期間を採用し、
 *   期間外（休部・故障の開始日より前の過去試合、または復帰日以降の試合・予定）は自動的に `"active"` と判定する。
 * - レガシー互換（`conditionPeriods` 未登録かつ `fallbackStatus !== "active"`）の場合:
 *   過去試合への遡及混入を防ぐため `targetDate >= todayKey`（または `dateKey` 未指定の現在表示）のみ `fallbackStatus` を返し、
 *   `targetDate < todayKey` の過去日は `"active"` として保護する。
 */
export function resolveEffectivePlayerConditionOnDate(params: {
  conditionPeriods?: readonly PlayerConditionPeriod[] | null;
  fallbackStatus?: unknown;
  fallbackNote?: string | null;
  dateKey?: string | null;
  todayKey?: string;
}): ResolvedPlayerCondition {
  const today = normalizeIsoDateKey(params.todayKey) || getTodayJstDateKey();
  const hasExplicitDate = Boolean(params.dateKey && normalizeIsoDateKey(params.dateKey));
  const targetKey = normalizeIsoDateKey(params.dateKey) || today;
  const periods = params.conditionPeriods;

  if (Array.isArray(periods) && periods.length > 0) {
    const matched = periods.filter((p) => {
      const s = normalizeIsoDateKey(p.startDate);
      if (!s || targetKey < s) return false;
      const e = normalizeIsoDateKey(p.endDate);
      if (e && targetKey > e) return false;
      return isNonActiveConditionStatus(p.status);
    });

    if (matched.length > 0) {
      matched.sort((a, b) => {
        if (a.startDate !== b.startDate) {
          return b.startDate.localeCompare(a.startDate);
        }
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
      const best = matched[0];
      return {
        status: best.status,
        period: best,
        note: best.privateNote ?? null,
      };
    }

    return {
      status: "active",
      period: null,
      note: !hasExplicitDate && params.fallbackNote ? params.fallbackNote : null,
    };
  }

  const fallback = normalizePlayerConditionStatus(params.fallbackStatus);
  if (fallback === "active") {
    return {
      status: "active",
      period: null,
      note: !hasExplicitDate ? params.fallbackNote ?? null : null,
    };
  }

  if (!hasExplicitDate || targetKey >= today) {
    return {
      status: fallback,
      period: null,
      note: params.fallbackNote ?? null,
    };
  }

  return {
    status: "active",
    period: null,
    note: null,
  };
}

export function findUpcomingPlayerConditionPeriod(
  periods: readonly PlayerConditionPeriod[] | null | undefined,
  todayKey: string = getTodayJstDateKey()
): PlayerConditionPeriod | null {
  if (!periods || periods.length === 0) return null;
  const today = normalizeIsoDateKey(todayKey) || getTodayJstDateKey();
  const upcoming = periods
    .filter((p) => {
      const s = normalizeIsoDateKey(p.startDate);
      return Boolean(s && s > today && isNonActiveConditionStatus(p.status));
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return upcoming[0] ?? null;
}

export interface PlayerConditionMeta {
  status: PlayerConditionStatus;
  mark: string;
  label: string;
  shortLabel: string;
  matrixTag: string;
  badgeText: string;
  compactBadgeText: string;
  publicSummary: string;
  staffHint: string;
  notePlaceholder: string;
  solidBadgeClass: string;
  softBadgeClass: string;
  bannerClass: string;
  topAccentBarClass: string;
}

export const PLAYER_CONDITION_META: Record<PlayerConditionStatus, PlayerConditionMeta> = {
  active: {
    status: "active",
    mark: "",
    label: "通常（出場可）",
    shortLabel: "通常",
    matrixTag: "",
    badgeText: "出場可",
    compactBadgeText: "出場可",
    publicSummary: "通常通り試合・練習に参加可能です。",
    staffHint: "制限なし（出欠・スタメン編成ともに通常対象）",
    notePlaceholder: "指導者間メモ（任意）",
    solidBadgeClass: "bg-emerald-600 text-white border border-emerald-700",
    softBadgeClass:
      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    bannerClass:
      "bg-emerald-500/10 border border-emerald-500/30 border-l-4 border-l-emerald-600 text-foreground",
    topAccentBarClass: "bg-primary",
  },
  restricted: {
    status: "restricted",
    mark: "⚠️",
    label: "一部制限あり",
    shortLabel: "一部制限",
    matrixTag: "⚠️制限",
    badgeText: "⚠️ 一部制限あり",
    compactBadgeText: "⚠️ 一部制限",
    publicSummary: "一部プレー制限（肩肘ケア等）を設けて活動に参加しています。",
    staffHint: "期間中は出欠・スタメン起用可（投球NG・打撃のみ等の注意バッジを表示）",
    notePlaceholder: "例：右肘ケアのため投球NG（打撃・一塁守備・走塁は可）",
    solidBadgeClass: "bg-amber-400 text-slate-950 border border-amber-500",
    softBadgeClass:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35",
    bannerClass:
      "bg-amber-500/10 border border-amber-500/35 border-l-4 border-l-amber-500 text-foreground",
    topAccentBarClass: "bg-amber-500",
  },
  rehab: {
    status: "rehab",
    mark: "🩹",
    label: "リハビリ・調整中",
    shortLabel: "調整中",
    matrixTag: "🩹調整",
    badgeText: "🩹 リハビリ・調整中",
    compactBadgeText: "🩹 調整中",
    publicSummary:
      "現在コンディション調整・別メニューで復帰に向けて取り組んでいます（試合出場はお休み中）。",
    staffHint: "設定期間中は出欠表・配車帯同は対象のまま、スタメン誤起用をブロック＆成長レポートに記録",
    notePlaceholder: "例：腰椎分離症リハビリ中（別メニュー・ベンチサポートのみ）",
    solidBadgeClass: "bg-rose-600 text-white border border-rose-700",
    softBadgeClass:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/30",
    bannerClass:
      "bg-rose-500/10 border border-rose-500/30 border-l-4 border-l-rose-600 text-foreground",
    topAccentBarClass: "bg-rose-600",
  },
  on_leave: {
    status: "on_leave",
    mark: "⏸",
    label: "休部中",
    shortLabel: "休部中",
    matrixTag: "⏸休部",
    badgeText: "⏸ 休部中",
    compactBadgeText: "⏸ 休部中",
    publicSummary:
      "現在一時休部中です（過去の試合記録・通算成績はそのまま保持され、期間中の出欠はご家族も含めて「休」表示・未回答除外となります）。",
    staffHint: "設定期間のみ本人＆父母を「休」扱い・スタメン除外（期間外の過去試合には一切影響しません）",
    notePlaceholder: "例：ご家庭・受験準備の事情により一時休部（監督了承済）",
    solidBadgeClass: "bg-slate-600 text-white border border-slate-700",
    softBadgeClass:
      "bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30",
    bannerClass:
      "bg-slate-500/12 border border-slate-500/30 border-l-4 border-l-slate-500 text-foreground",
    topAccentBarClass: "bg-slate-400",
  },
};

export function parseUniformSortValue(
  uniformNumber: string | number | null | undefined
): number {
  const cleaned = String(uniformNumber ?? "")
    .replace("#", "")
    .trim();
  if (!cleaned) return 9999;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? 9999 : parsed;
}

export function comparePlayersByConditionAndUniform(
  a: {
    conditionStatus?: unknown;
    uniformNumber?: string | number | null;
    name?: string | null;
  },
  b: {
    conditionStatus?: unknown;
    uniformNumber?: string | number | null;
    name?: string | null;
  }
): number {
  const aIsLeave = normalizePlayerConditionStatus(a.conditionStatus) === "on_leave";
  const bIsLeave = normalizePlayerConditionStatus(b.conditionStatus) === "on_leave";
  if (aIsLeave !== bIsLeave) {
    return aIsLeave ? 1 : -1;
  }

  const numA = parseUniformSortValue(a.uniformNumber);
  const numB = parseUniformSortValue(b.uniformNumber);
  if (numA !== numB) {
    return numA - numB;
  }

  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ja");
}

export interface DemoPlayerConditionOverride {
  conditionStatus: PlayerConditionStatus;
  conditionNote: string | null;
  conditionPeriods: PlayerConditionPeriod[];
  updatedAt: string;
}

const DEMO_CONDITION_STORAGE_KEY = "iscore_demo_player_conditions_v1";

export function loadDemoPlayerConditionOverrides(): Record<
  string,
  DemoPlayerConditionOverride
> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEMO_CONDITION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      {
        conditionStatus?: unknown;
        conditionNote?: unknown;
        conditionPeriods?: unknown;
        updatedAt?: unknown;
      }
    >;
    if (!parsed || typeof parsed !== "object") return {};
    const todayKey = getTodayJstDateKey();
    const result: Record<string, DemoPlayerConditionOverride> = {};
    for (const [playerId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      const rawPeriods = Array.isArray(entry.conditionPeriods)
        ? entry.conditionPeriods
        : [];
      const validPeriods: PlayerConditionPeriod[] = [];
      for (const rp of rawPeriods) {
        if (!rp || typeof rp !== "object") continue;
        const rpo = rp as Record<string, unknown>;
        const st = rpo.status;
        const sDate = normalizeIsoDateKey(rpo.startDate);
        const eDate = rpo.endDate ? normalizeIsoDateKey(rpo.endDate) : null;
        if (!isNonActiveConditionStatus(st) || !sDate) continue;
        validPeriods.push({
          id: typeof rpo.id === "string" && rpo.id ? rpo.id : `demo-cond-${playerId}-${sDate}`,
          playerId,
          status: st,
          startDate: sDate,
          endDate: eDate,
          privateNote:
            typeof rpo.privateNote === "string" && rpo.privateNote.trim()
              ? rpo.privateNote.trim()
              : null,
          updatedAt: typeof rpo.updatedAt === "number" ? rpo.updatedAt : Date.now(),
        });
      }
      const sortedPeriods = sortPlayerConditionPeriods(validPeriods);
      const fallbackNote =
        typeof entry.conditionNote === "string" && entry.conditionNote.trim()
          ? entry.conditionNote.trim()
          : null;
      const resolvedToday = resolveEffectivePlayerConditionOnDate({
        conditionPeriods: sortedPeriods,
        fallbackStatus: entry.conditionStatus,
        fallbackNote,
        dateKey: todayKey,
        todayKey,
      });

      result[playerId] = {
        conditionStatus: resolvedToday.status,
        conditionNote: resolvedToday.note ?? fallbackNote,
        conditionPeriods: sortedPeriods,
        updatedAt:
          typeof entry.updatedAt === "string" ? entry.updatedAt : new Date().toISOString(),
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function saveDemoPlayerConditionOverride(
  playerId: string,
  conditionStatus: PlayerConditionStatus,
  conditionNote: string | null,
  conditionPeriods?: readonly PlayerConditionPeriod[]
): DemoPlayerConditionOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const current = loadDemoPlayerConditionOverrides();
    const existing = current[playerId];
    const trimmedNote =
      typeof conditionNote === "string" && conditionNote.trim()
        ? conditionNote.trim().slice(0, 160)
        : null;
    const todayKey = getTodayJstDateKey();

    let nextPeriods: PlayerConditionPeriod[] = conditionPeriods
      ? sortPlayerConditionPeriods(conditionPeriods)
      : [...(existing?.conditionPeriods || [])];

    if (!conditionPeriods) {
      if (isNonActiveConditionStatus(conditionStatus)) {
        const openIdx = nextPeriods.findIndex(
          (p) => p.startDate <= todayKey && (!p.endDate || todayKey <= p.endDate)
        );
        if (openIdx >= 0) {
          nextPeriods[openIdx] = {
            ...nextPeriods[openIdx],
            status: conditionStatus,
            privateNote: trimmedNote,
            updatedAt: Date.now(),
          };
        } else {
          nextPeriods.push({
            id: `demo-cond-${Date.now()}`,
            playerId,
            status: conditionStatus,
            startDate: todayKey,
            endDate: null,
            privateNote: trimmedNote,
            updatedAt: Date.now(),
          });
        }
      } else {
        const yesterday = shiftIsoDateKeyByDays(todayKey, -1);
        nextPeriods = nextPeriods.map((p) => {
          if (p.startDate <= todayKey && (!p.endDate || todayKey <= p.endDate)) {
            return {
              ...p,
              endDate: p.startDate > yesterday ? p.startDate : yesterday,
              updatedAt: Date.now(),
            };
          }
          return p;
        });
      }
      nextPeriods = sortPlayerConditionPeriods(nextPeriods);
    }

    const resolvedToday = resolveEffectivePlayerConditionOnDate({
      conditionPeriods: nextPeriods,
      fallbackStatus: conditionStatus,
      fallbackNote: trimmedNote,
      dateKey: todayKey,
      todayKey,
    });

    if (resolvedToday.status === "active" && !trimmedNote && nextPeriods.length === 0) {
      delete current[playerId];
      window.localStorage.setItem(DEMO_CONDITION_STORAGE_KEY, JSON.stringify(current));
      return {
        conditionStatus: "active",
        conditionNote: null,
        conditionPeriods: [],
        updatedAt: new Date().toISOString(),
      };
    }

    const savedEntry: DemoPlayerConditionOverride = {
      conditionStatus: resolvedToday.status,
      conditionNote:
        resolvedToday.status !== "active" ? resolvedToday.note ?? trimmedNote : trimmedNote,
      conditionPeriods: nextPeriods,
      updatedAt: new Date().toISOString(),
    };
    current[playerId] = savedEntry;
    window.localStorage.setItem(DEMO_CONDITION_STORAGE_KEY, JSON.stringify(current));
    return savedEntry;
  } catch {
    return null;
  }
}
