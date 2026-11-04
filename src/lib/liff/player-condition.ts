// filepath: src/lib/liff/player-condition.ts

export type PlayerConditionStatus = "active" | "restricted" | "rehab" | "on_leave";

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
    staffHint: "出欠・スタメン起用可（投球NG・打撃のみ等の注意バッジを表示）",
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
    staffHint: "出欠表・配車帯同は対象のまま、スタメン誤起用をブロック",
    notePlaceholder: "例：腰椎分離症リハビリ中（別メニュー・ベンチサポートのみ・12月復帰予定）",
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
      "現在一時休部中です（通算成績・成長記録はそのまま保持され、出欠回答・スタメン編成からは自動除外されます）。",
    staffHint: "名簿末尾へ自動配置し、出欠未回答カウント・スタメン候補から自動除外",
    notePlaceholder: "例：ご家庭・受験準備の事情により2月末まで一時休部（監督了承済）",
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
      { conditionStatus?: unknown; conditionNote?: unknown; updatedAt?: unknown }
    >;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, DemoPlayerConditionOverride> = {};
    for (const [playerId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      result[playerId] = {
        conditionStatus: normalizePlayerConditionStatus(entry.conditionStatus),
        conditionNote:
          typeof entry.conditionNote === "string" && entry.conditionNote.trim()
            ? entry.conditionNote.trim()
            : null,
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
  conditionNote: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadDemoPlayerConditionOverrides();
    const trimmedNote =
      typeof conditionNote === "string" && conditionNote.trim()
        ? conditionNote.trim().slice(0, 160)
        : null;
    if (conditionStatus === "active" && !trimmedNote) {
      delete current[playerId];
    } else {
      current[playerId] = {
        conditionStatus,
        conditionNote: trimmedNote,
        updatedAt: new Date().toISOString(),
      };
    }
    window.localStorage.setItem(DEMO_CONDITION_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore storage errors
  }
}

