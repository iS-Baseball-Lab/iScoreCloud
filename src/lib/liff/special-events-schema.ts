// filepath: src/lib/liff/special-events-schema.ts
import {
  buildParentToChildrenMap,
  type RosterParentChildRow,
  type RosterPlayerRow,
  type RosterTeamMemberRow,
} from "@/lib/liff/group-attendance";
import {
  resolveEffectivePlayerConditionOnDate,
  type PlayerConditionPeriod,
} from "@/lib/liff/player-condition";

export type SpecialEventCategory =
  | "party"
  | "ceremony"
  | "recreation"
  | "meeting"
  | "survey"
  | "other";

export type SpecialEventMode = "rsvp" | "date_poll";

export type SpecialEventStatus = "open" | "closed" | "archived";

export type SpecialEventAttendanceStatus = "present" | "absent" | "pending";

export type SpecialEventDateVoteMark = "ok" | "maybe" | "ng";

export type SpecialEventQuestionType = "single" | "multiple" | "text";

export interface SpecialEventCategoryMeta {
  id: SpecialEventCategory;
  label: string;
  shortLabel: string;
  icon: string;
  badgeClass: string;
}

export const SPECIAL_EVENT_CATEGORIES: readonly SpecialEventCategoryMeta[] = [
  {
    id: "party",
    label: "忘年会・懇親会",
    shortLabel: "懇親会",
    icon: "🍻",
    badgeClass:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
  },
  {
    id: "ceremony",
    label: "卒団式・入団式",
    shortLabel: "式典",
    icon: "🌸",
    badgeClass:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  {
    id: "recreation",
    label: "BBQ・親子レク",
    shortLabel: "親子レク",
    icon: "🍖",
    badgeClass:
      "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/30",
  },
  {
    id: "meeting",
    label: "保護者総会・説明会",
    shortLabel: "総会",
    icon: "📋",
    badgeClass:
      "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  {
    id: "survey",
    label: "アンケート・調査",
    shortLabel: "アンケート",
    icon: "🗳️",
    badgeClass: "bg-primary/12 text-primary border-primary/30",
  },
  {
    id: "other",
    label: "その他行事",
    shortLabel: "行事",
    icon: "🎉",
    badgeClass:
      "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/30",
  },
] as const;

export function getSpecialEventCategoryMeta(
  raw: string | null | undefined
): SpecialEventCategoryMeta {
  const found = SPECIAL_EVENT_CATEGORIES.find((c) => c.id === raw);
  return found ?? SPECIAL_EVENT_CATEGORIES[0];
}

export function normalizeSpecialEventCategory(
  raw: unknown
): SpecialEventCategory {
  if (
    typeof raw === "string" &&
    SPECIAL_EVENT_CATEGORIES.some((c) => c.id === raw)
  ) {
    return raw as SpecialEventCategory;
  }
  return "party";
}

export function normalizeSpecialEventMode(raw: unknown): SpecialEventMode {
  return raw === "date_poll" ? "date_poll" : "rsvp";
}

export function normalizeSpecialEventStatus(raw: unknown): SpecialEventStatus {
  if (raw === "closed" || raw === "archived") return raw;
  return "open";
}

export interface SpecialEventFeeTier {
  id: string;
  label: string;
  amount: number;
  targetKind: "adult" | "player" | "companion" | "any";
  enabled: boolean;
}

export const DEFAULT_SPECIAL_EVENT_FEE_TIERS: readonly SpecialEventFeeTier[] = [
  {
    id: "adult",
    label: "大人（保護者・指導者）",
    amount: 4500,
    targetKind: "adult",
    enabled: true,
  },
  {
    id: "player",
    label: "選手（部員本人）",
    amount: 2000,
    targetKind: "player",
    enabled: true,
  },
  {
    id: "junior_high",
    label: "兄弟・家族（中高生）",
    amount: 3000,
    targetKind: "companion",
    enabled: true,
  },
  {
    id: "elementary",
    label: "兄弟・家族（小学生）",
    amount: 2000,
    targetKind: "companion",
    enabled: true,
  },
  {
    id: "preschool_meal",
    label: "未就学児（食事あり）",
    amount: 1000,
    targetKind: "companion",
    enabled: true,
  },
  {
    id: "infant_free",
    label: "乳幼児（席のみ・食事なし）",
    amount: 0,
    targetKind: "companion",
    enabled: true,
  },
] as const;

export const COMPANION_RELATION_PRESETS: readonly string[] = [
  "兄",
  "弟",
  "姉",
  "妹",
  "幼児",
  "祖父母",
  "家族",
] as const;

export interface SpecialEventCandidateDate {
  id: string;
  dateStr: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  note: string;
}

export interface SpecialEventQuestion {
  id: string;
  title: string;
  type: SpecialEventQuestionType;
  options: string[];
  required: boolean;
  placeholder?: string;
}

export interface SpecialEventSurveyPreset {
  id: string;
  chipLabel: string;
  question: Omit<SpecialEventQuestion, "id">;
}

export const SURVEY_QUESTION_PRESETS: readonly SpecialEventSurveyPreset[] = [
  {
    id: "preset_drink",
    chipLabel: "🍺 ドリンク区分",
    question: {
      title: "大人のドリンク区分（飲み放題）",
      type: "single",
      options: [
        "アルコール飲み放題",
        "ソフトドリンク飲み放題",
        "大人2名（アルコール1＋ソフト1）",
        "大人の出席なし",
      ],
      required: true,
    },
  },
  {
    id: "preset_allergy",
    chipLabel: "🍽️ アレルギー・食事配慮",
    question: {
      title: "食物アレルギー・食事の配慮事項（対象者名と内容）",
      type: "text",
      options: [],
      required: false,
      placeholder: "特になければ空欄でOK（例：次郎 エビ・カニ抜き希望）",
    },
  },
  {
    id: "preset_afterparty",
    chipLabel: "🌙 二次会の出欠",
    question: {
      title: "二次会（保護者・指導者向け）の参加希望",
      type: "single",
      options: ["参加する（1名）", "参加する（2名）", "参加しない", "当日相談"],
      required: false,
    },
  },
  {
    id: "preset_helper",
    chipLabel: "🎁 当日係・お手伝い",
    question: {
      title: "当日のお手伝い・係アンケート",
      type: "multiple",
      options: [
        "受付・集金サポート",
        "写真・動画撮影",
        "景品・出し物準備",
        "送迎・配車協力",
        "今回は難しい",
      ],
      required: false,
    },
  },
  {
    id: "preset_transport",
    chipLabel: "🚗 会場への移動手段",
    question: {
      title: "会場への移動手段",
      type: "single",
      options: [
        "徒歩・自転車・公共交通機関",
        "自家用車（駐車場利用希望）",
        "乗り合わせ・送迎を相談したい",
      ],
      required: false,
    },
  },
] as const;

export interface SpecialEventQuickTemplate {
  id: string;
  label: string;
  description: string;
  titlePlaceholder: string;
  category: SpecialEventCategory;
  mode: SpecialEventMode;
  startTime: string;
  endTime: string;
  allowCompanions: boolean;
  useFeeCalculation: boolean;
  feeTiers: SpecialEventFeeTier[];
  questions: SpecialEventQuestion[];
}

export const SPECIAL_EVENT_TEMPLATES: readonly SpecialEventQuickTemplate[] = [
  {
    id: "party_yearend",
    label: "🍻 忘年会・納会セット",
    description: "家族・兄弟の区分別会費＋ドリンク・二次会アンケート付き",
    titlePlaceholder: "2026年 チーム忘年会・納会",
    category: "party",
    mode: "rsvp",
    startTime: "18:00",
    endTime: "20:30",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t })),
    questions: [
      {
        id: "q_drink",
        ...SURVEY_QUESTION_PRESETS[0].question,
      },
      {
        id: "q_afterparty",
        ...SURVEY_QUESTION_PRESETS[2].question,
      },
      {
        id: "q_allergy",
        ...SURVEY_QUESTION_PRESETS[1].question,
      },
    ],
  },
  {
    id: "ceremony_grad",
    label: "🌸 卒団式・謝恩会セット",
    description: "式典・会食の家族人数確認＋アレルギー・係アンケート付き",
    titlePlaceholder: "卒団式・謝恩会のご案内",
    category: "ceremony",
    mode: "rsvp",
    startTime: "11:30",
    endTime: "14:30",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: [
      {
        id: "adult",
        label: "大人（保護者・指導者）",
        amount: 3500,
        targetKind: "adult",
        enabled: true,
      },
      {
        id: "player",
        label: "選手（部員本人）",
        amount: 1500,
        targetKind: "player",
        enabled: true,
      },
      {
        id: "elementary",
        label: "兄弟・家族（小中高生）",
        amount: 1500,
        targetKind: "companion",
        enabled: true,
      },
      {
        id: "preschool_meal",
        label: "未就学児（お子様ランチあり）",
        amount: 800,
        targetKind: "companion",
        enabled: true,
      },
      {
        id: "infant_free",
        label: "乳幼児（席のみ・食事なし）",
        amount: 0,
        targetKind: "companion",
        enabled: true,
      },
    ],
    questions: [
      {
        id: "q_allergy",
        ...SURVEY_QUESTION_PRESETS[1].question,
      },
      {
        id: "q_helper",
        ...SURVEY_QUESTION_PRESETS[3].question,
      },
    ],
  },
  {
    id: "recreation_bbq",
    label: "🍖 親子BBQ・レクセット",
    description: "兄弟・幼児も含めた参加人数集計＋移動・備品協力アンケート",
    titlePlaceholder: "親子BBQ・レクリエーション大会",
    category: "recreation",
    mode: "rsvp",
    startTime: "11:00",
    endTime: "15:00",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: [
      {
        id: "adult",
        label: "大人（保護者・指導者）",
        amount: 2500,
        targetKind: "adult",
        enabled: true,
      },
      {
        id: "player",
        label: "選手（部員本人）",
        amount: 1000,
        targetKind: "player",
        enabled: true,
      },
      {
        id: "elementary",
        label: "兄弟・家族（小中高生）",
        amount: 1000,
        targetKind: "companion",
        enabled: true,
      },
      {
        id: "preschool_meal",
        label: "幼児（食材あり）",
        amount: 500,
        targetKind: "companion",
        enabled: true,
      },
      {
        id: "infant_free",
        label: "乳幼児（無料）",
        amount: 0,
        targetKind: "companion",
        enabled: true,
      },
    ],
    questions: [
      {
        id: "q_transport",
        ...SURVEY_QUESTION_PRESETS[4].question,
      },
      {
        id: "q_bbq_gear",
        title: "持参協力できるアウトドア用品（任意）",
        type: "multiple",
        options: [
          "タープ・テント",
          "大型クーラーボックス",
          "折りたたみテーブル・イス",
          "特になし",
        ],
        required: false,
      },
    ],
  },
  {
    id: "date_poll_party",
    label: "🗳️ 開催日調整アンケート",
    description: "候補日の◯△×を集計し、決定後に1タップで本出欠へ切替可能",
    titlePlaceholder: "忘年会 開催日アンケート",
    category: "party",
    mode: "date_poll",
    startTime: "18:00",
    endTime: "20:30",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t })),
    questions: [
      {
        id: "q_pref",
        title: "ご希望の時間帯・お店ジャンル・ご要望（任意）",
        type: "text",
        options: [],
        required: false,
        placeholder: "例：駅周辺だと助かります、座敷希望 など",
      },
    ],
  },
] as const;

export interface SpecialEventMemberAttendance {
  entityType: "player" | "member" | "self";
  entityId: string;
  name: string;
  roleGroup: "player" | "mother" | "father" | "staff";
  status: SpecialEventAttendanceStatus;
  feeTierId: string;
  note?: string;
}

export interface SpecialEventCompanion {
  id: string;
  name: string;
  relationLabel: string;
  feeTierId: string;
  dietaryNote?: string;
}

export interface SpecialEventDateVote {
  candidateId: string;
  vote: SpecialEventDateVoteMark;
  headcountHint?: number;
}

export type SpecialEventSurveyAnswers = Record<string, string | string[]>;

export interface HouseholdRosterMember {
  entityType: "player" | "member" | "self";
  entityId: string;
  name: string;
  uniformNumber?: string;
  roleGroup: "player" | "mother" | "father" | "staff";
  defaultFeeTierId: "player" | "adult";
  isOnLeave?: boolean;
}

export interface TeamHouseholdUnit {
  householdKey: string;
  householdLabel: string;
  sortCategory: "family" | "staff";
  isAllOnLeave: boolean;
  members: HouseholdRosterMember[];
}

export interface HouseholdResponseView {
  responseId: string | null;
  householdKey: string;
  householdLabel: string;
  sortCategory: "family" | "staff";
  isAllOnLeave: boolean;
  hasResponded: boolean;
  overallState: "attending" | "absent" | "pending";
  memberEntries: SpecialEventMemberAttendance[];
  companions: SpecialEventCompanion[];
  dateVotes: SpecialEventDateVote[];
  surveyAnswers: SpecialEventSurveyAnswers;
  comment: string;
  feePaid: boolean;
  presentMemberCount: number;
  companionCount: number;
  totalHeadcount: number;
  totalFeeAmount: number;
  tierBreakdown: Array<{
    tierId: string;
    label: string;
    unitAmount: number;
    count: number;
    subtotal: number;
  }>;
  updatedByName: string | null;
  updatedAtIso: string | null;
}

export interface CandidateDateVoteSummary {
  id: string;
  dateStr: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  note: string;
  okCount: number;
  maybeCount: number;
  ngCount: number;
  estimatedHeadcount: number;
  okHouseholdLabels: string[];
  maybeHouseholdLabels: string[];
  isTopCandidate: boolean;
}

export interface SurveyQuestionAnswerSummary {
  questionId: string;
  title: string;
  type: SpecialEventQuestionType;
  required: boolean;
  optionCounts: Array<{
    option: string;
    count: number;
    householdLabels: string[];
  }>;
  textAnswers: Array<{
    householdLabel: string;
    text: string;
  }>;
}

export interface SpecialEventTierTotalItem {
  tierId: string;
  label: string;
  unitAmount: number;
  memberCount: number;
  companionCount: number;
  totalCount: number;
  subtotalAmount: number;
}

export interface SpecialEventDietaryNoteItem {
  householdLabel: string;
  personLabel: string;
  note: string;
}

export interface SpecialEventAggregateSummary {
  totalHouseholdCount: number;
  activeTargetHouseholdCount: number;
  respondedHouseholdCount: number;
  attendingHouseholdCount: number;
  absentHouseholdCount: number;
  unansweredHouseholdCount: number;
  presentMemberCount: number;
  companionCount: number;
  totalHeadcount: number;
  expectedFeeTotal: number;
  paidFeeTotal: number;
  paidHouseholdCount: number;
  unpaidAttendingHouseholdCount: number;
  tierTotals: SpecialEventTierTotalItem[];
  candidateSummaries: CandidateDateVoteSummary[];
  questionSummaries: SurveyQuestionAnswerSummary[];
  dietaryNotes: SpecialEventDietaryNoteItem[];
}

export interface SpecialEventDetailItem {
  id: string;
  teamId: string;
  title: string;
  category: SpecialEventCategory;
  mode: SpecialEventMode;
  status: SpecialEventStatus;
  eventDate: string | null;
  eventDateLabel: string | null;
  startTime: string | null;
  endTime: string | null;
  timeRangeLabel: string;
  location: string;
  locationUrl: string;
  deadlineDate: string | null;
  deadlineDateLabel: string | null;
  description: string;
  importantNotice: string;
  allowCompanions: boolean;
  useFeeCalculation: boolean;
  feeTiers: SpecialEventFeeTier[];
  candidateDates: SpecialEventCandidateDate[];
  questions: SpecialEventQuestion[];
  createdByUserId: string | null;
  createdByName: string | null;
  canDelete: boolean;
  myHouseholdResponse: HouseholdResponseView | null;
  households: HouseholdResponseView[];
  summary: SpecialEventAggregateSummary;
}

export interface HubSpecialEventSummary {
  id: string;
  title: string;
  category: SpecialEventCategory;
  mode: SpecialEventMode;
  status: SpecialEventStatus;
  eventDate: string | null;
  eventDateLabel: string | null;
  timeRangeLabel: string;
  location: string;
  deadlineDate: string | null;
  deadlineDateLabel: string | null;
  importantNotice: string;
  totalHeadcount: number;
  presentMemberCount?: number;
  companionCount?: number;
  attendingHouseholdCount?: number;
  absentHouseholdCount?: number;
  unansweredHouseholdCount?: number;
  respondedHouseholdCount: number;
  activeTargetHouseholdCount: number;
  tierTotals?: Array<{
    tierId: string;
    label: string;
    totalCount: number;
  }>;
  topCandidateSummary?: {
    dateLabel: string;
    okCount: number;
    maybeCount: number;
    ngCount: number;
    estimatedHeadcount: number;
  } | null;
  myResponded: boolean;
  myOverallState: "attending" | "absent" | "pending";
  myHeadcount: number;
  myFeeAmount: number;
  useFeeCalculation: boolean;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function formatDateKeyToJaLabel(
  dateStr: string | null | undefined
): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return null;
  const [yStr, mStr, dStr] = dateStr.trim().split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  const w = WEEKDAY_JA[dt.getUTCDay()] || "";
  return `${m}/${d}(${w})`;
}

export function buildSpecialEventTimeRangeLabel(
  startTime?: string | null,
  endTime?: string | null
): string {
  const st = (startTime || "").trim();
  const et = (endTime || "").trim();
  if (st && et) return `${st}〜${et}`;
  if (st) return `${st}〜`;
  if (et) return `〜${et}`;
  return "時間未定";
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof raw === "object") {
    return raw as T;
  }
  return fallback;
}

export function normalizeSpecialEventFeeTiers(
  raw: unknown
): SpecialEventFeeTier[] {
  const parsed = safeParseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t }));
  }

  const out: SpecialEventFeeTier[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < parsed.length && out.length < 12; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const rawId =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 40)
        : `tier_${i + 1}`;
    if (seen.has(rawId)) continue;
    seen.add(rawId);

    const label =
      typeof rec.label === "string" && rec.label.trim()
        ? rec.label.trim().slice(0, 48)
        : `区分${i + 1}`;
    const rawAmount = Number(rec.amount);
    const amount = Number.isFinite(rawAmount)
      ? Math.max(0, Math.min(500_000, Math.round(rawAmount)))
      : 0;
    const rawKind = rec.targetKind;
    const targetKind: SpecialEventFeeTier["targetKind"] =
      rawKind === "adult" ||
      rawKind === "player" ||
      rawKind === "companion" ||
      rawKind === "any"
        ? rawKind
        : "any";
    const enabled = rec.enabled !== false;

    out.push({ id: rawId, label, amount, targetKind, enabled });
  }

  if (out.length === 0) {
    return DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t }));
  }
  return out;
}

export function normalizeCandidateDates(
  raw: unknown
): SpecialEventCandidateDate[] {
  const parsed = safeParseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: SpecialEventCandidateDate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < parsed.length && out.length < 15; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const dateStr =
      typeof rec.dateStr === "string" ? rec.dateStr.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 40)
        : `cand_${dateStr}_${i + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const startTime =
      typeof rec.startTime === "string" && /^\d{1,2}:\d{2}$/.test(rec.startTime.trim())
        ? rec.startTime.trim().padStart(5, "0")
        : "";
    const endTime =
      typeof rec.endTime === "string" && /^\d{1,2}:\d{2}$/.test(rec.endTime.trim())
        ? rec.endTime.trim().padStart(5, "0")
        : "";
    const note =
      typeof rec.note === "string" ? rec.note.trim().slice(0, 80) : "";

    out.push({ id, dateStr, startTime, endTime, note });
  }

  out.sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    return a.startTime.localeCompare(b.startTime);
  });
  return out;
}

export function normalizeSurveyQuestions(
  raw: unknown
): SpecialEventQuestion[] {
  const parsed = safeParseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: SpecialEventQuestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < parsed.length && out.length < 15; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title =
      typeof rec.title === "string" ? rec.title.trim().slice(0, 120) : "";
    if (!title) continue;

    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 40)
        : `q_${i + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const type: SpecialEventQuestionType =
      rec.type === "multiple" || rec.type === "text" ? rec.type : "single";

    const rawOptions = Array.isArray(rec.options) ? rec.options : [];
    const options: string[] = [];
    for (const opt of rawOptions) {
      if (typeof opt === "string") {
        const cleanOpt = opt.trim().slice(0, 80);
        if (cleanOpt && !options.includes(cleanOpt) && options.length < 15) {
          options.push(cleanOpt);
        }
      }
    }

    if ((type === "single" || type === "multiple") && options.length === 0) {
      continue;
    }

    const placeholder =
      typeof rec.placeholder === "string" && rec.placeholder.trim()
        ? rec.placeholder.trim().slice(0, 100)
        : undefined;

    out.push({
      id,
      title,
      type,
      options: type === "text" ? [] : options,
      required: Boolean(rec.required),
      placeholder,
    });
  }

  return out;
}

export function normalizeMemberAttendanceEntries(
  raw: unknown
): SpecialEventMemberAttendance[] {
  const parsed = safeParseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: SpecialEventMemberAttendance[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const entityId =
      typeof rec.entityId === "string" ? rec.entityId.trim() : "";
    if (!entityId) continue;
    const entityType: SpecialEventMemberAttendance["entityType"] =
      rec.entityType === "player" || rec.entityType === "self"
        ? rec.entityType
        : "member";
    const dedupKey = `${entityType}:${entityId}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const name =
      typeof rec.name === "string" && rec.name.trim()
        ? rec.name.trim().slice(0, 60)
        : "メンバー";
    const roleGroup: SpecialEventMemberAttendance["roleGroup"] =
      rec.roleGroup === "player" ||
      rec.roleGroup === "mother" ||
      rec.roleGroup === "father" ||
      rec.roleGroup === "staff"
        ? rec.roleGroup
        : entityType === "player"
        ? "player"
        : "staff";
    const status: SpecialEventAttendanceStatus =
      rec.status === "present" || rec.status === "absent"
        ? rec.status
        : "pending";
    const defaultTier = entityType === "player" ? "player" : "adult";
    const feeTierId =
      typeof rec.feeTierId === "string" && rec.feeTierId.trim()
        ? rec.feeTierId.trim().slice(0, 40)
        : defaultTier;
    const note =
      typeof rec.note === "string" && rec.note.trim()
        ? rec.note.trim().slice(0, 120)
        : undefined;

    out.push({
      entityType,
      entityId,
      name,
      roleGroup,
      status,
      feeTierId,
      note,
    });
  }

  return out;
}

export function normalizeCompanionsList(
  raw: unknown
): SpecialEventCompanion[] {
  const parsed = safeParseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: SpecialEventCompanion[] = [];
  for (let i = 0; i < parsed.length && out.length < 15; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 40)
        : `comp_${i + 1}`;
    const name =
      typeof rec.name === "string" ? rec.name.trim().slice(0, 40) : "";
    const relationLabel =
      typeof rec.relationLabel === "string" && rec.relationLabel.trim()
        ? rec.relationLabel.trim().slice(0, 20)
        : "ご家族";
    const feeTierId =
      typeof rec.feeTierId === "string" && rec.feeTierId.trim()
        ? rec.feeTierId.trim().slice(0, 40)
        : "elementary";
    const dietaryNote =
      typeof rec.dietaryNote === "string" && rec.dietaryNote.trim()
        ? rec.dietaryNote.trim().slice(0, 120)
        : undefined;

    out.push({ id, name, relationLabel, feeTierId, dietaryNote });
  }

  return out;
}

export function normalizeDateVotesList(
  raw: unknown
): SpecialEventDateVote[] {
  const parsed = safeParseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: SpecialEventDateVote[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const candidateId =
      typeof rec.candidateId === "string" ? rec.candidateId.trim() : "";
    if (!candidateId || seen.has(candidateId)) continue;
    seen.add(candidateId);

    const vote: SpecialEventDateVoteMark =
      rec.vote === "ok" || rec.vote === "maybe" || rec.vote === "ng"
        ? rec.vote
        : "ng";
    const rawHint = Number(rec.headcountHint);
    const headcountHint =
      Number.isFinite(rawHint) && rawHint > 0
        ? Math.min(20, Math.round(rawHint))
        : undefined;

    out.push({ candidateId, vote, headcountHint });
  }

  return out;
}

export function normalizeSurveyAnswersMap(
  raw: unknown
): SpecialEventSurveyAnswers {
  const parsed = safeParseJson<Record<string, unknown>>(raw, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const out: SpecialEventSurveyAnswers = {};
  for (const [qId, val] of Object.entries(parsed)) {
    const cleanKey = qId.trim().slice(0, 40);
    if (!cleanKey) continue;
    if (typeof val === "string") {
      const trimmed = val.trim().slice(0, 400);
      if (trimmed) out[cleanKey] = trimmed;
    } else if (Array.isArray(val)) {
      const arr = val
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 15);
      if (arr.length > 0) out[cleanKey] = arr;
    }
  }
  return out;
}

export interface SpecialEventPlayerInput extends RosterPlayerRow {
  uniformNumber?: string | null;
}

function normalizeNameCompact(raw: string | null | undefined): string {
  return (raw || "").replace(/[\s　]+/g, "").trim();
}

function extractFamilyLabelFromPlayerName(
  playerName: string,
  parentNames: readonly string[]
): string {
  const trimmed = playerName.trim();
  const tokens = trimmed.split(/[\s　]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens[0]) {
    return `${tokens[0]} 家`;
  }
  for (const pName of parentNames) {
    const m = normalizeNameCompact(pName).match(
      /^(.+?)(?:お父さん|お母さん|保護者|パパ|ママ|父|母|夫|妻)$/
    );
    if (m?.[1]) {
      return `${m[1]} 家`;
    }
  }
  return trimmed ? `${trimmed} ご家族` : "ご家族";
}

function classifyAdultRoleGroup(
  m: RosterTeamMemberRow,
  hasKids: boolean
): "mother" | "father" | "staff" {
  const name = m.name || "";
  const isMother =
    m.memberType === "mother" ||
    m.role === "mother" ||
    (typeof m.subRoles === "string" &&
      m.subRoles.toLowerCase().includes("mother")) ||
    name.includes("母") ||
    name.includes("ママ") ||
    name.includes("妻") ||
    name.includes("お母さん");

  if (isMother) return "mother";

  const isStaffExplicit =
    m.memberType === "staff" ||
    m.role === "manager" ||
    m.role === "coach" ||
    m.role === "scorer" ||
    m.role === "admin" ||
    name.includes("監督") ||
    name.includes("コーチ") ||
    name.includes("代表");

  if (!hasKids && isStaffExplicit) {
    return "staff";
  }
  return hasKids || m.memberType === "parent" ? "father" : "staff";
}

/**
 * チームの `players`・`team_members`・`parent_child_relations` から
 * 重複のない「世帯（〇〇家）または個人スタッフ」単位のリストを構築する（Union-Find）。
 * ご兄弟で複数名在籍しているご家庭も自動的に1つの「〇〇家」に統合される。
 */
export function buildTeamHouseholdUnits(params: {
  players: readonly SpecialEventPlayerInput[];
  teamMembers: readonly RosterTeamMemberRow[];
  relations: readonly RosterParentChildRow[];
  candidateUserIds?: readonly string[];
  callerUserName?: string | null;
  dateKey?: string | null;
  todayKey?: string;
}): {
  units: TeamHouseholdUnit[];
  myHouseholdKey: string | null;
} {
  const activePlayers = params.players.filter(
    (p) => p.isActive !== false && p.isActive !== 0
  );
  const activeAdults = params.teamMembers.filter(
    (m) => (!m.status || m.status === "active") && m.memberType !== "player"
  );

  const onLeavePlayerIdSet = new Set<string>();
  for (const p of activePlayers) {
    const eff = resolveEffectivePlayerConditionOnDate({
      conditionPeriods: p.conditionPeriods as
        | readonly PlayerConditionPeriod[]
        | undefined,
      fallbackStatus: p.conditionStatus,
      dateKey: params.dateKey,
      todayKey: params.todayKey,
    });
    if (eff.status === "on_leave") {
      onLeavePlayerIdSet.add(p.id);
    }
  }

  const parentToChildrenMap = buildParentToChildrenMap({
    players: activePlayers,
    teamMembers: activeAdults,
    relations: params.relations,
  });

  // Union-Find over nodes `p:${playerId}` and `m:${memberId}`
  const parentNode = new Map<string, string>();
  const ensureNode = (key: string) => {
    if (!parentNode.has(key)) parentNode.set(key, key);
  };
  const findRoot = (key: string): string => {
    let cur = key;
    while (parentNode.get(cur) && parentNode.get(cur) !== cur) {
      cur = parentNode.get(cur)!;
    }
    let walk = key;
    while (parentNode.get(walk) && parentNode.get(walk) !== cur) {
      const next = parentNode.get(walk)!;
      parentNode.set(walk, cur);
      walk = next;
    }
    return cur;
  };
  const unionNodes = (a: string, b: string) => {
    ensureNode(a);
    ensureNode(b);
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) {
      parentNode.set(rb, ra);
    }
  };

  for (const p of activePlayers) {
    ensureNode(`p:${p.id}`);
  }
  for (const m of activeAdults) {
    ensureNode(`m:${m.id}`);
    const childIds = parentToChildrenMap.get(m.id) || [];
    for (const cid of childIds) {
      if (parentNode.has(`p:${cid}`)) {
        unionNodes(`p:${cid}`, `m:${m.id}`);
      }
    }
  }

  const playersById = new Map(activePlayers.map((p) => [p.id, p]));
  const adultsById = new Map(activeAdults.map((m) => [m.id, m]));

  const componentMap = new Map<
    string,
    { playerIds: string[]; memberIds: string[] }
  >();

  for (const p of activePlayers) {
    const r = findRoot(`p:${p.id}`);
    const bucket = componentMap.get(r) || { playerIds: [], memberIds: [] };
    bucket.playerIds.push(p.id);
    componentMap.set(r, bucket);
  }
  for (const m of activeAdults) {
    const r = findRoot(`m:${m.id}`);
    const bucket = componentMap.get(r) || { playerIds: [], memberIds: [] };
    bucket.memberIds.push(m.id);
    componentMap.set(r, bucket);
  }

  const units: TeamHouseholdUnit[] = [];
  const entityToHouseholdKey = new Map<string, string>();

  for (const comp of componentMap.values()) {
    if (comp.playerIds.length > 0) {
      const sortedPlayerIds = [...comp.playerIds].sort();
      const householdKey = `hh_p_${sortedPlayerIds[0]}`;
      const compPlayers = comp.playerIds
        .map((id) => playersById.get(id))
        .filter((x): x is SpecialEventPlayerInput => Boolean(x));
      const compAdults = comp.memberIds
        .map((id) => adultsById.get(id))
        .filter((x): x is RosterTeamMemberRow => Boolean(x));

      const firstPlayerName = compPlayers[0]?.name || "";
      const householdLabel = extractFamilyLabelFromPlayerName(
        firstPlayerName,
        compAdults.map((a) => a.name || "")
      );

      const members: HouseholdRosterMember[] = [];
      for (const p of compPlayers) {
        const isLeave = onLeavePlayerIdSet.has(p.id);
        members.push({
          entityType: "player",
          entityId: p.id,
          name: (p.name || "選手").trim(),
          uniformNumber: p.uniformNumber || undefined,
          roleGroup: "player",
          defaultFeeTierId: "player",
          isOnLeave: isLeave,
        });
        entityToHouseholdKey.set(`player:${p.id}`, householdKey);
      }

      // 母 ➔ 父 ➔ スタッフの順で整列
      const sortedAdults = [...compAdults].sort((a, b) => {
        const ga = classifyAdultRoleGroup(a, true);
        const gb = classifyAdultRoleGroup(b, true);
        const order = { mother: 1, father: 2, staff: 3 };
        return order[ga] - order[gb];
      });

      for (const m of sortedAdults) {
        const roleGroup = classifyAdultRoleGroup(m, true);
        members.push({
          entityType: "member",
          entityId: m.id,
          name: (m.name || "保護者").trim(),
          roleGroup,
          defaultFeeTierId: "adult",
        });
        entityToHouseholdKey.set(`member:${m.id}`, householdKey);
      }

      const isAllOnLeave = compPlayers.every((p) =>
        onLeavePlayerIdSet.has(p.id)
      );

      units.push({
        householdKey,
        householdLabel,
        sortCategory: "family",
        isAllOnLeave,
        members,
      });
    } else if (comp.memberIds.length > 0) {
      for (const mid of comp.memberIds) {
        const m = adultsById.get(mid);
        if (!m) continue;
        const householdKey = `hh_m_${m.id}`;
        const roleGroup = classifyAdultRoleGroup(m, false);
        const label = (m.name || "スタッフ").trim();
        units.push({
          householdKey,
          householdLabel: label,
          sortCategory: roleGroup === "staff" ? "staff" : "family",
          isAllOnLeave: false,
          members: [
            {
              entityType: "member",
              entityId: m.id,
              name: label,
              roleGroup,
              defaultFeeTierId: "adult",
            },
          ],
        });
        entityToHouseholdKey.set(`member:${m.id}`, householdKey);
      }
    }
  }

  // 家族世帯（休部外 ➔ 休部中）➔ 単独スタッフ の順で安定ソート
  units.sort((a, b) => {
    if (a.sortCategory !== b.sortCategory) {
      return a.sortCategory === "family" ? -1 : 1;
    }
    if (a.isAllOnLeave !== b.isAllOnLeave) {
      return a.isAllOnLeave ? 1 : -1;
    }
    return a.householdLabel.localeCompare(b.householdLabel, "ja");
  });

  // ログインユーザーの所属世帯を特定
  let myHouseholdKey: string | null = null;
  const candidateSet = new Set(
    (params.candidateUserIds || []).map((u) => u.trim()).filter(Boolean)
  );

  if (candidateSet.size > 0) {
    for (const m of activeAdults) {
      if (m.userId && candidateSet.has(m.userId)) {
        const found = entityToHouseholdKey.get(`member:${m.id}`);
        if (found) {
          myHouseholdKey = found;
          break;
        }
      }
    }
    if (!myHouseholdKey) {
      for (const p of activePlayers) {
        if (p.userId && candidateSet.has(p.userId)) {
          const found = entityToHouseholdKey.get(`player:${p.id}`);
          if (found) {
            myHouseholdKey = found;
            break;
          }
        }
      }
    }
  }

  const cleanCallerName = normalizeNameCompact(params.callerUserName);
  if (!myHouseholdKey && cleanCallerName) {
    for (const m of activeAdults) {
      if (normalizeNameCompact(m.name) === cleanCallerName) {
        const found = entityToHouseholdKey.get(`member:${m.id}`);
        if (found) {
          myHouseholdKey = found;
          break;
        }
      }
    }
    if (!myHouseholdKey) {
      for (const p of activePlayers) {
        if (normalizeNameCompact(p.name) === cleanCallerName) {
          const found = entityToHouseholdKey.get(`player:${p.id}`);
          if (found) {
            myHouseholdKey = found;
            break;
          }
        }
      }
    }
  }

  // 名簿未登録だが承認済みログインユーザーがいる場合のセルフ世帯フォールバック
  const primaryUid = Array.from(candidateSet)[0] || "";
  if (!myHouseholdKey && primaryUid) {
    const selfKey = `hh_self_${primaryUid}`;
    const selfName = (params.callerUserName || "メンバー").trim() || "メンバー";
    myHouseholdKey = selfKey;
    units.unshift({
      householdKey: selfKey,
      householdLabel: selfName,
      sortCategory: "family",
      isAllOnLeave: false,
      members: [
        {
          entityType: "self",
          entityId: primaryUid,
          name: selfName,
          roleGroup: "staff",
          defaultFeeTierId: "adult",
        },
      ],
    });
  }

  return { units, myHouseholdKey };
}

export interface RawSpecialEventResponseRow {
  id: string;
  specialEventId: string;
  householdKey: string;
  householdLabel: string;
  memberEntriesJson: string | null;
  companionsJson: string | null;
  dateVotesJson: string | null;
  surveyAnswersJson: string | null;
  comment: string | null;
  feePaid: boolean | number | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  updatedAt: Date | number | string | null;
}

function resolveDefaultTierIdForMember(
  defaultKind: "player" | "adult",
  feeTiers: readonly SpecialEventFeeTier[]
): string {
  const exact = feeTiers.find((t) => t.enabled && t.id === defaultKind);
  if (exact) return exact.id;
  const byTarget = feeTiers.find(
    (t) => t.enabled && t.targetKind === defaultKind
  );
  if (byTarget) return byTarget.id;
  return feeTiers.find((t) => t.enabled)?.id || feeTiers[0]?.id || defaultKind;
}

export function computeHouseholdResponseView(params: {
  unit: TeamHouseholdUnit;
  responseRow: RawSpecialEventResponseRow | null;
  mode: SpecialEventMode;
  allowCompanions: boolean;
  useFeeCalculation: boolean;
  feeTiers: readonly SpecialEventFeeTier[];
}): HouseholdResponseView {
  const { unit, responseRow, mode, allowCompanions, useFeeCalculation, feeTiers } =
    params;

  const tierMap = new Map(feeTiers.map((t) => [t.id, t]));
  const savedEntries = responseRow
    ? normalizeMemberAttendanceEntries(responseRow.memberEntriesJson)
    : [];
  const savedByEntity = new Map(
    savedEntries.map((e) => [`${e.entityType}:${e.entityId}`, e])
  );

  const memberEntries: SpecialEventMemberAttendance[] = unit.members.map(
    (m) => {
      const saved = savedByEntity.get(`${m.entityType}:${m.entityId}`);
      const fallbackTierId = resolveDefaultTierIdForMember(
        m.defaultFeeTierId,
        feeTiers
      );
      const resolvedTierId =
        saved && tierMap.has(saved.feeTierId) ? saved.feeTierId : fallbackTierId;
      return {
        entityType: m.entityType,
        entityId: m.entityId,
        name: m.name,
        roleGroup: m.roleGroup,
        status: saved ? saved.status : "pending",
        feeTierId: resolvedTierId,
        note: saved?.note,
      };
    }
  );

  // 保存時に追加されていたメンバーが万一 unit に無い場合も保持
  for (const s of savedEntries) {
    const key = `${s.entityType}:${s.entityId}`;
    const alreadyIn = memberEntries.some(
      (m) => `${m.entityType}:${m.entityId}` === key
    );
    if (!alreadyIn) {
      memberEntries.push(s);
    }
  }

  const rawCompanions =
    responseRow && allowCompanions
      ? normalizeCompanionsList(responseRow.companionsJson)
      : [];
  const dateVotes = responseRow
    ? normalizeDateVotesList(responseRow.dateVotesJson)
    : [];
  const surveyAnswers = responseRow
    ? normalizeSurveyAnswersMap(responseRow.surveyAnswersJson)
    : {};
  const comment = (responseRow?.comment || "").trim();
  const feePaid =
    responseRow?.feePaid === true || responseRow?.feePaid === 1;

  const hasResponded = Boolean(responseRow);
  const presentMembers = memberEntries.filter((m) => m.status === "present");
  const allMembersAbsent =
    memberEntries.length > 0 &&
    memberEntries.every((m) => m.status === "absent");

  // 全登録メンバーが欠席の場合は誤集計防止のため同伴家族をカウント対象外とする
  const effectiveCompanions =
    mode === "rsvp" && !allMembersAbsent ? rawCompanions : [];

  let overallState: "attending" | "absent" | "pending" = "pending";
  if (mode === "date_poll") {
    if (dateVotes.length > 0) {
      const hasAvailable = dateVotes.some(
        (v) => v.vote === "ok" || v.vote === "maybe"
      );
      overallState = hasAvailable ? "attending" : "absent";
    } else if (hasResponded) {
      overallState = "pending";
    }
  } else {
    if (presentMembers.length > 0 || effectiveCompanions.length > 0) {
      overallState = "attending";
    } else if (hasResponded && allMembersAbsent) {
      overallState = "absent";
    } else {
      overallState = "pending";
    }
  }

  const tierCountMap = new Map<string, number>();
  if (mode === "rsvp") {
    for (const pm of presentMembers) {
      tierCountMap.set(pm.feeTierId, (tierCountMap.get(pm.feeTierId) || 0) + 1);
    }
    for (const comp of effectiveCompanions) {
      tierCountMap.set(
        comp.feeTierId,
        (tierCountMap.get(comp.feeTierId) || 0) + 1
      );
    }
  }

  const tierBreakdown: HouseholdResponseView["tierBreakdown"] = [];
  let totalFeeAmount = 0;

  for (const tier of feeTiers) {
    const count = tierCountMap.get(tier.id) || 0;
    if (count <= 0) continue;
    const unitAmount = useFeeCalculation ? tier.amount : 0;
    const subtotal = unitAmount * count;
    totalFeeAmount += subtotal;
    tierBreakdown.push({
      tierId: tier.id,
      label: tier.label,
      unitAmount,
      count,
      subtotal,
    });
  }

  // カスタムIDのフォールバック集計
  for (const [tid, count] of tierCountMap.entries()) {
    if (tierMap.has(tid) || count <= 0) continue;
    tierBreakdown.push({
      tierId: tid,
      label: "その他",
      unitAmount: 0,
      count,
      subtotal: 0,
    });
  }

  let updatedAtIso: string | null = null;
  if (responseRow?.updatedAt != null) {
    const dt =
      responseRow.updatedAt instanceof Date
        ? responseRow.updatedAt
        : typeof responseRow.updatedAt === "number"
        ? new Date(
            responseRow.updatedAt < 1e12
              ? responseRow.updatedAt * 1000
              : responseRow.updatedAt
          )
        : new Date(responseRow.updatedAt);
    if (!Number.isNaN(dt.getTime())) {
      updatedAtIso = dt.toISOString();
    }
  }

  const presentMemberCount = mode === "rsvp" ? presentMembers.length : 0;
  const companionCount = mode === "rsvp" ? effectiveCompanions.length : 0;

  return {
    responseId: responseRow?.id || null,
    householdKey: unit.householdKey,
    householdLabel: responseRow?.householdLabel || unit.householdLabel,
    sortCategory: unit.sortCategory,
    isAllOnLeave: unit.isAllOnLeave,
    hasResponded,
    overallState,
    memberEntries,
    companions: rawCompanions,
    dateVotes,
    surveyAnswers,
    comment,
    feePaid,
    presentMemberCount,
    companionCount,
    totalHeadcount: presentMemberCount + companionCount,
    totalFeeAmount,
    tierBreakdown,
    updatedByName: responseRow?.updatedByName || null,
    updatedAtIso,
  };
}

/**
 * 既存の回答レコード群と現在の世帯マスタを突合して全世帯ビュー＋全体サマリーを算出する。
 * 親子関係が後から追加・変更された場合でも entityId の一致により既存回答を自動引き当てし、
 * マスタ外の孤立回答も欠落させず末尾に保持する。
 */
export function buildSpecialEventHouseholdsAndSummary(params: {
  units: readonly TeamHouseholdUnit[];
  responseRows: readonly RawSpecialEventResponseRow[];
  mode: SpecialEventMode;
  allowCompanions: boolean;
  useFeeCalculation: boolean;
  feeTiers: readonly SpecialEventFeeTier[];
  candidateDates: readonly SpecialEventCandidateDate[];
  questions: readonly SpecialEventQuestion[];
}): {
  households: HouseholdResponseView[];
  summary: SpecialEventAggregateSummary;
} {
  const {
    units,
    responseRows,
    mode,
    allowCompanions,
    useFeeCalculation,
    feeTiers,
    candidateDates,
    questions,
  } = params;

  const unusedRowIds = new Set(responseRows.map((r) => r.id));
  const rowByKey = new Map(responseRows.map((r) => [r.householdKey, r]));

  const parsedEntriesByRowId = new Map<
    string,
    SpecialEventMemberAttendance[]
  >();
  for (const r of responseRows) {
    parsedEntriesByRowId.set(
      r.id,
      normalizeMemberAttendanceEntries(r.memberEntriesJson)
    );
  }

  const households: HouseholdResponseView[] = [];

  for (const unit of units) {
    let matchedRow: RawSpecialEventResponseRow | null =
      rowByKey.get(unit.householdKey) || null;

    if (!matchedRow) {
      const unitEntityKeys = new Set(
        unit.members.map((m) => `${m.entityType}:${m.entityId}`)
      );
      for (const r of responseRows) {
        if (!unusedRowIds.has(r.id)) continue;
        const entries = parsedEntriesByRowId.get(r.id) || [];
        if (
          entries.some((e) =>
            unitEntityKeys.has(`${e.entityType}:${e.entityId}`)
          )
        ) {
          matchedRow = r;
          break;
        }
      }
    }

    if (matchedRow) {
      unusedRowIds.delete(matchedRow.id);
    }

    households.push(
      computeHouseholdResponseView({
        unit,
        responseRow: matchedRow,
        mode,
        allowCompanions,
        useFeeCalculation,
        feeTiers,
      })
    );
  }

  // 万一どの現行世帯にもマッチしなかった回答済みレコードも保護して追加
  for (const r of responseRows) {
    if (!unusedRowIds.has(r.id)) continue;
    const savedEntries = parsedEntriesByRowId.get(r.id) || [];
    const fallbackUnit: TeamHouseholdUnit = {
      householdKey: r.householdKey,
      householdLabel: r.householdLabel || "回答メンバー",
      sortCategory: "family",
      isAllOnLeave: false,
      members: savedEntries.map((e) => ({
        entityType: e.entityType,
        entityId: e.entityId,
        name: e.name,
        roleGroup: e.roleGroup,
        defaultFeeTierId: e.entityType === "player" ? "player" : "adult",
      })),
    };
    households.push(
      computeHouseholdResponseView({
        unit: fallbackUnit,
        responseRow: r,
        mode,
        allowCompanions,
        useFeeCalculation,
        feeTiers,
      })
    );
  }

  // 集計計算
  let activeTargetHouseholdCount = 0;
  let respondedHouseholdCount = 0;
  let attendingHouseholdCount = 0;
  let absentHouseholdCount = 0;
  let unansweredHouseholdCount = 0;
  let presentMemberCount = 0;
  let companionCount = 0;
  let expectedFeeTotal = 0;
  let paidFeeTotal = 0;
  let paidHouseholdCount = 0;
  let unpaidAttendingHouseholdCount = 0;

  const tierMemberCounts = new Map<string, number>();
  const tierCompanionCounts = new Map<string, number>();
  const dietaryNotes: SpecialEventDietaryNoteItem[] = [];

  for (const hh of households) {
    if (!hh.isAllOnLeave || hh.hasResponded) {
      activeTargetHouseholdCount++;
    }
    if (hh.hasResponded) {
      respondedHouseholdCount++;
    } else if (!hh.isAllOnLeave) {
      unansweredHouseholdCount++;
    }

    if (hh.overallState === "attending") {
      attendingHouseholdCount++;
    } else if (hh.overallState === "absent") {
      absentHouseholdCount++;
    }

    presentMemberCount += hh.presentMemberCount;
    companionCount += hh.companionCount;
    expectedFeeTotal += hh.totalFeeAmount;

    if (hh.overallState === "attending" && hh.totalFeeAmount > 0) {
      if (hh.feePaid) {
        paidHouseholdCount++;
        paidFeeTotal += hh.totalFeeAmount;
      } else {
        unpaidAttendingHouseholdCount++;
      }
    } else if (hh.overallState === "attending" && hh.feePaid) {
      paidHouseholdCount++;
    }

    if (mode === "rsvp" && hh.overallState === "attending") {
      for (const m of hh.memberEntries) {
        if (m.status === "present") {
          tierMemberCounts.set(
            m.feeTierId,
            (tierMemberCounts.get(m.feeTierId) || 0) + 1
          );
          if (m.note) {
            dietaryNotes.push({
              householdLabel: hh.householdLabel,
              personLabel: m.name,
              note: m.note,
            });
          }
        }
      }
      for (const comp of hh.companions) {
        tierCompanionCounts.set(
          comp.feeTierId,
          (tierCompanionCounts.get(comp.feeTierId) || 0) + 1
        );
        if (comp.dietaryNote) {
          const compLabel = comp.name
            ? `${comp.name}（${comp.relationLabel}）`
            : comp.relationLabel;
          dietaryNotes.push({
            householdLabel: hh.householdLabel,
            personLabel: compLabel,
            note: comp.dietaryNote,
          });
        }
      }
    }
  }

  const tierTotals: SpecialEventTierTotalItem[] = [];
  for (const tier of feeTiers) {
    const mCnt = tierMemberCounts.get(tier.id) || 0;
    const cCnt = tierCompanionCounts.get(tier.id) || 0;
    const totalCount = mCnt + cCnt;
    if (!tier.enabled && totalCount === 0) continue;
    const unitAmount = useFeeCalculation ? tier.amount : 0;
    tierTotals.push({
      tierId: tier.id,
      label: tier.label,
      unitAmount,
      memberCount: mCnt,
      companionCount: cCnt,
      totalCount,
      subtotalAmount: unitAmount * totalCount,
    });
  }

  // 候補日アンケート集計
  const candidateSummaries: CandidateDateVoteSummary[] = candidateDates.map(
    (cand) => {
      let okCount = 0;
      let maybeCount = 0;
      let ngCount = 0;
      let estimatedHeadcount = 0;
      const okHouseholdLabels: string[] = [];
      const maybeHouseholdLabels: string[] = [];

      for (const hh of households) {
        const found = hh.dateVotes.find((v) => v.candidateId === cand.id);
        if (!found) continue;
        if (found.vote === "ok") {
          okCount++;
          okHouseholdLabels.push(hh.householdLabel);
          estimatedHeadcount +=
            found.headcountHint ?? Math.max(1, hh.memberEntries.length);
        } else if (found.vote === "maybe") {
          maybeCount++;
          maybeHouseholdLabels.push(hh.householdLabel);
          estimatedHeadcount +=
            found.headcountHint ?? Math.max(1, hh.memberEntries.length);
        } else {
          ngCount++;
        }
      }

      return {
        id: cand.id,
        dateStr: cand.dateStr,
        dateLabel: formatDateKeyToJaLabel(cand.dateStr) || cand.dateStr,
        startTime: cand.startTime,
        endTime: cand.endTime,
        note: cand.note,
        okCount,
        maybeCount,
        ngCount,
        estimatedHeadcount,
        okHouseholdLabels,
        maybeHouseholdLabels,
        isTopCandidate: false,
      };
    }
  );

  if (candidateSummaries.length > 0) {
    let bestScore = -1;
    for (const cs of candidateSummaries) {
      const score = cs.okCount * 1000 + cs.maybeCount * 10 + cs.estimatedHeadcount;
      if (cs.okCount + cs.maybeCount > 0 && score > bestScore) {
        bestScore = score;
      }
    }
    if (bestScore > 0) {
      for (const cs of candidateSummaries) {
        const score =
          cs.okCount * 1000 + cs.maybeCount * 10 + cs.estimatedHeadcount;
        if (score === bestScore) {
          cs.isTopCandidate = true;
        }
      }
    }
  }

  // カスタム設問の集計（出席または候補日参加可能、もしくは回答がある全世帯を対象）
  const questionSummaries: SurveyQuestionAnswerSummary[] = questions.map(
    (q) => {
      const optionMap = new Map<string, string[]>();
      for (const opt of q.options) {
        optionMap.set(opt, []);
      }
      const textAnswers: Array<{ householdLabel: string; text: string }> = [];

      for (const hh of households) {
        if (!hh.hasResponded) continue;
        if (mode === "rsvp" && hh.overallState === "absent") continue;
        const ans = hh.surveyAnswers[q.id];
        if (!ans) continue;

        if (q.type === "text") {
          const textVal = Array.isArray(ans) ? ans.join(" / ") : ans;
          if (textVal.trim()) {
            textAnswers.push({
              householdLabel: hh.householdLabel,
              text: textVal.trim(),
            });
          }
        } else {
          const selected = Array.isArray(ans) ? ans : [ans];
          for (const opt of selected) {
            if (!opt) continue;
            const list = optionMap.get(opt) || [];
            list.push(hh.householdLabel);
            optionMap.set(opt, list);
          }
        }
      }

      const optionCounts = Array.from(optionMap.entries()).map(
        ([option, labels]) => ({
          option,
          count: labels.length,
          householdLabels: labels,
        })
      );

      return {
        questionId: q.id,
        title: q.title,
        type: q.type,
        required: q.required,
        optionCounts,
        textAnswers,
      };
    }
  );

  return {
    households,
    summary: {
      totalHouseholdCount: households.length,
      activeTargetHouseholdCount,
      respondedHouseholdCount,
      attendingHouseholdCount,
      absentHouseholdCount,
      unansweredHouseholdCount,
      presentMemberCount,
      companionCount,
      totalHeadcount: presentMemberCount + companionCount,
      expectedFeeTotal,
      paidFeeTotal,
      paidHouseholdCount,
      unpaidAttendingHouseholdCount,
      tierTotals,
      candidateSummaries,
      questionSummaries,
      dietaryNotes,
    },
  };
}

/**
 * 📢 グループLINE向け：イベント案内＆出欠・アンケート回答依頼テキスト生成
 */
export function buildSpecialEventAnnouncementLineText(params: {
  event: SpecialEventDetailItem;
  teamName: string;
  pageUrl?: string;
  includeUnansweredList?: boolean;
}): string {
  const { event, teamName, pageUrl, includeUnansweredList } = params;
  const cat = getSpecialEventCategoryMeta(event.category);
  const lines: string[] = [];

  lines.push(`${cat.icon} 【${teamName}】${event.title}`);
  lines.push("━━━━━━━━━━━━━━");

  if (event.mode === "date_poll") {
    lines.push("🗳️ 現在、開催候補日のご都合アンケートを受付中です！");
    if (event.candidateDates.length > 0) {
      lines.push("");
      lines.push("■ 候補日一覧");
      for (const c of event.candidateDates) {
        const dLabel = formatDateKeyToJaLabel(c.dateStr) || c.dateStr;
        const tLabel = buildSpecialEventTimeRangeLabel(c.startTime, c.endTime);
        lines.push(`・${dLabel} ${tLabel}${c.note ? `（${c.note}）` : ""}`);
      }
    }
  } else {
    const dLabel = event.eventDateLabel || event.eventDate || "日程調整中";
    lines.push(`📅 日時: ${dLabel} ${event.timeRangeLabel}`);
    if (event.location) {
      lines.push(`📍 会場: ${event.location}`);
    }
    if (event.locationUrl) {
      lines.push(`🔗 お店・地図: ${event.locationUrl}`);
    }
  }

  if (event.deadlineDateLabel || event.deadlineDate) {
    lines.push(
      `⏰ 回答期限: ${event.deadlineDateLabel || event.deadlineDate} まで`
    );
  }

  if (event.mode === "rsvp" && event.useFeeCalculation) {
    const activeTiers = event.feeTiers.filter((t) => t.enabled);
    if (activeTiers.length > 0) {
      lines.push("");
      lines.push("💰 会費（区分別）");
      for (const t of activeTiers) {
        lines.push(
          `・${t.label}: ${
            t.amount === 0 ? "無料" : `${t.amount.toLocaleString()}円`
          }`
        );
      }
    }
  }

  if (event.allowCompanions && event.mode === "rsvp") {
    lines.push("");
    lines.push(
      "👨‍👩‍👧‍👦 選手・保護者様に加えて、ご兄弟・幼児などの同伴ご家族も一緒に登録できます！"
    );
  }

  if (event.importantNotice?.trim()) {
    lines.push("");
    lines.push(`⚠️ 注意事項・特記事項:\n${event.importantNotice.trim()}`);
  }

  if (event.description) {
    lines.push("");
    lines.push(`📝 ご案内・連絡事項:\n${event.description}`);
  }

  if (includeUnansweredList) {
    const unanswered = event.households
      .filter((h) => !h.hasResponded && !h.isAllOnLeave)
      .map((h) => h.householdLabel);
    if (unanswered.length > 0) {
      lines.push("");
      lines.push(
        `🙏 未回答のご家庭・メンバー（${unanswered.length}件）:\n${unanswered.join(
          "、"
        )}`
      );
    }
  }

  if (pageUrl) {
    lines.push("");
    lines.push(`📲 出欠・アンケートの回答はこちら:\n${pageUrl}`);
  }

  return lines.join("\n");
}

/**
 * 📊 幹事・お店予約・全体報告向け：集計サマリーテキスト生成
 */
export function buildSpecialEventSummaryLineText(params: {
  event: SpecialEventDetailItem;
  teamName: string;
  includeHouseholdDetails?: boolean;
}): string {
  const { event, teamName, includeHouseholdDetails = true } = params;
  const cat = getSpecialEventCategoryMeta(event.category);
  const { summary } = event;
  const lines: string[] = [];

  lines.push(`${cat.icon} 【集計状況】${event.title}（${teamName}）`);
  lines.push("━━━━━━━━━━━━━━");

  if (event.mode === "date_poll") {
    lines.push(
      `📊 回答状況: ${summary.respondedHouseholdCount}/${summary.activeTargetHouseholdCount} 世帯回答済`
    );
    lines.push("");
    lines.push("■ 候補日ごとの集計");
    for (const cs of summary.candidateSummaries) {
      const crown = cs.isTopCandidate ? "👑 " : "・";
      const tLabel = buildSpecialEventTimeRangeLabel(cs.startTime, cs.endTime);
      lines.push(
        `${crown}${cs.dateLabel} ${tLabel}: ◯${cs.okCount} / △${cs.maybeCount} / ×${cs.ngCount}（予定計 約${cs.estimatedHeadcount}名）`
      );
    }
  } else {
    const dLabel = event.eventDateLabel || event.eventDate || "未定";
    lines.push(`📅 日時: ${dLabel} ${event.timeRangeLabel}`);
    if (event.location) {
      lines.push(`📍 会場: ${event.location}`);
    }
    lines.push(
      `👥 参加総人数: 計 ${summary.totalHeadcount} 名（出席 ${summary.attendingHouseholdCount}世帯 / 欠席 ${summary.absentHouseholdCount}世帯 / 未回答 ${summary.unansweredHouseholdCount}世帯）`
    );
    if (summary.companionCount > 0) {
      lines.push(
        `　└ 登録メンバー ${summary.presentMemberCount}名 ＋ ご兄弟・同伴家族 ${summary.companionCount}名`
      );
    }

    const nonZeroTiers = summary.tierTotals.filter((t) => t.totalCount > 0);
    if (nonZeroTiers.length > 0) {
      lines.push("");
      lines.push("■ 区分別の人数内訳（お店予約用）");
      for (const t of nonZeroTiers) {
        const feePart = event.useFeeCalculation
          ? `（@${t.unitAmount.toLocaleString()}円 ＝ ${t.subtotalAmount.toLocaleString()}円）`
          : "";
        lines.push(`・${t.label}: ${t.totalCount}名${feePart}`);
      }
    }

    if (event.useFeeCalculation) {
      lines.push(
        `💰 会費合計予定額: ${summary.expectedFeeTotal.toLocaleString()}円（集金済: ${summary.paidFeeTotal.toLocaleString()}円）`
      );
    }
  }

  if (event.importantNotice?.trim()) {
    lines.push("");
    lines.push(`⚠️ 注意事項・特記事項:\n${event.importantNotice.trim()}`);
  }

  if (summary.questionSummaries.length > 0) {
    lines.push("");
    lines.push("■ アンケート集計");
    for (const qs of summary.questionSummaries) {
      lines.push(`【${qs.title}】`);
      if (qs.type === "text") {
        if (qs.textAnswers.length === 0) {
          lines.push("　（回答なし）");
        } else {
          for (const ta of qs.textAnswers) {
            lines.push(`　・${ta.householdLabel}: ${ta.text}`);
          }
        }
      } else {
        for (const oc of qs.optionCounts) {
          if (oc.count === 0) continue;
          lines.push(`　・${oc.option}: ${oc.count}件`);
        }
      }
    }
  }

  if (summary.dietaryNotes.length > 0) {
    lines.push("");
    lines.push("■ 個別メモ・配慮事項");
    for (const dn of summary.dietaryNotes) {
      lines.push(`・${dn.householdLabel}（${dn.personLabel}）: ${dn.note}`);
    }
  }

  if (includeHouseholdDetails && event.mode === "rsvp") {
    const attendingList = event.households.filter(
      (h) => h.overallState === "attending"
    );
    if (attendingList.length > 0) {
      lines.push("");
      lines.push("■ 出席世帯・人数一覧");
      for (const hh of attendingList) {
        const names = [
          ...hh.memberEntries
            .filter((m) => m.status === "present")
            .map((m) => m.name),
          ...hh.companions.map((c) =>
            c.name ? `${c.name}(${c.relationLabel})` : c.relationLabel
          ),
        ];
        const feeText = event.useFeeCalculation
          ? ` / ${hh.totalFeeAmount.toLocaleString()}円${
              hh.feePaid ? "[済]" : ""
            }`
          : "";
        lines.push(
          `・${hh.householdLabel}: 計${hh.totalHeadcount}名（${names.join(
            "、"
          )}）${feeText}`
        );
      }
    }
  }

  return lines.join("\n");
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 📥 幹事・会計用 CSV エクスポート文字列生成（UTF-8 BOMは呼び出し側で付与可）
 */
export function buildSpecialEventCsvContent(
  event: SpecialEventDetailItem
): string {
  const tierHeaders = event.feeTiers
    .filter((t) => t.enabled)
    .map((t) => `${t.label}(名)`);
  const questionHeaders = event.questions.map((q) => q.title);

  const headerRow = [
    "世帯・氏名",
    "回答状態",
    "出席メンバー",
    "兄弟・同伴家族",
    "合計人数",
    ...tierHeaders,
    ...(event.useFeeCalculation ? ["会費合計(円)", "集金状況"] : []),
    ...questionHeaders,
    "連絡メモ",
  ];

  const rows: string[][] = [headerRow.map(escapeCsvCell)];
  const enabledTiers = event.feeTiers.filter((t) => t.enabled);

  for (const hh of event.households) {
    const stateLabel = !hh.hasResponded
      ? hh.isAllOnLeave
        ? "休部中"
        : "未回答"
      : hh.overallState === "attending"
      ? "出席"
      : hh.overallState === "absent"
      ? "欠席"
      : "未定";

    const presentNames = hh.memberEntries
      .filter((m) => m.status === "present")
      .map((m) => (m.note ? `${m.name}(${m.note})` : m.name))
      .join(" / ");

    const tierById = new Map(event.feeTiers.map((t) => [t.id, t.label]));
    const companionTexts = hh.companions
      .map((c) => {
        const tName = tierById.get(c.feeTierId) || c.feeTierId;
        const base = c.name
          ? `${c.name}[${c.relationLabel}・${tName}]`
          : `${c.relationLabel}[${tName}]`;
        return c.dietaryNote ? `${base}(${c.dietaryNote})` : base;
      })
      .join(" / ");

    const tierCountCells = enabledTiers.map((tier) => {
      const found = hh.tierBreakdown.find((b) => b.tierId === tier.id);
      return String(found?.count ?? 0);
    });

    const qCells = event.questions.map((q) => {
      const ans = hh.surveyAnswers[q.id];
      if (!ans) return "";
      return Array.isArray(ans) ? ans.join(" / ") : ans;
    });

    const row: Array<string | number> = [
      hh.householdLabel,
      stateLabel,
      presentNames,
      companionTexts,
      hh.totalHeadcount,
      ...tierCountCells,
      ...(event.useFeeCalculation
        ? [
            hh.totalFeeAmount,
            hh.overallState === "attending"
              ? hh.feePaid
                ? "集金済"
                : "未集金"
              : "-",
          ]
        : []),
      ...qCells,
      hh.comment,
    ];

    rows.push(row.map(escapeCsvCell));
  }

  return rows.map((r) => r.join(",")).join("\r\n");
}

/**
 * 🌟 体験デモチーム（`demo-team`）用の初期サンプルデータ生成
 */
export function buildDemoSpecialEventsBundle(): {
  events: SpecialEventDetailItem[];
  hubSummaries: HubSpecialEventSummary[];
  myHouseholdKey: string;
} {
  const demoUnits: TeamHouseholdUnit[] = [
    {
      householdKey: "hh_p_demo_1",
      householdLabel: "山田 家",
      sortCategory: "family",
      isAllOnLeave: false,
      members: [
        {
          entityType: "player",
          entityId: "demo-player-1",
          name: "山田 翔太",
          uniformNumber: "10",
          roleGroup: "player",
          defaultFeeTierId: "player",
        },
        {
          entityType: "member",
          entityId: "demo-mother-1",
          name: "山田 母",
          roleGroup: "mother",
          defaultFeeTierId: "adult",
        },
        {
          entityType: "member",
          entityId: "demo-father-1",
          name: "山田 父",
          roleGroup: "father",
          defaultFeeTierId: "adult",
        },
      ],
    },
    {
      householdKey: "hh_p_demo_2",
      householdLabel: "佐藤 家",
      sortCategory: "family",
      isAllOnLeave: false,
      members: [
        {
          entityType: "player",
          entityId: "demo-player-2",
          name: "佐藤 健太",
          uniformNumber: "1",
          roleGroup: "player",
          defaultFeeTierId: "player",
        },
        {
          entityType: "member",
          entityId: "demo-mother-2",
          name: "佐藤 母",
          roleGroup: "mother",
          defaultFeeTierId: "adult",
        },
      ],
    },
    {
      householdKey: "hh_p_demo_3",
      householdLabel: "鈴木 家",
      sortCategory: "family",
      isAllOnLeave: false,
      members: [
        {
          entityType: "player",
          entityId: "demo-player-3",
          name: "鈴木 陸",
          uniformNumber: "6",
          roleGroup: "player",
          defaultFeeTierId: "player",
        },
        {
          entityType: "member",
          entityId: "demo-mother-3",
          name: "鈴木 母",
          roleGroup: "mother",
          defaultFeeTierId: "adult",
        },
        {
          entityType: "member",
          entityId: "demo-father-3",
          name: "鈴木 父",
          roleGroup: "father",
          defaultFeeTierId: "adult",
        },
      ],
    },
    {
      householdKey: "hh_m_demo_coach",
      householdLabel: "高橋 監督",
      sortCategory: "staff",
      isAllOnLeave: false,
      members: [
        {
          entityType: "member",
          entityId: "demo-staff-1",
          name: "高橋 監督",
          roleGroup: "staff",
          defaultFeeTierId: "adult",
        },
      ],
    },
  ];

  const partyTiers = DEFAULT_SPECIAL_EVENT_FEE_TIERS.map((t) => ({ ...t }));
  const partyQuestions: SpecialEventQuestion[] = [
    {
      id: "q_drink",
      ...SURVEY_QUESTION_PRESETS[0].question,
    },
    {
      id: "q_afterparty",
      ...SURVEY_QUESTION_PRESETS[2].question,
    },
    {
      id: "q_allergy",
      ...SURVEY_QUESTION_PRESETS[1].question,
    },
  ];

  const partyResponses: RawSpecialEventResponseRow[] = [
    {
      id: "demo-resp-1",
      specialEventId: "demo-spev-party",
      householdKey: "hh_p_demo_1",
      householdLabel: "山田 家",
      memberEntriesJson: JSON.stringify([
        {
          entityType: "player",
          entityId: "demo-player-1",
          name: "山田 翔太",
          roleGroup: "player",
          status: "present",
          feeTierId: "player",
        },
        {
          entityType: "member",
          entityId: "demo-mother-1",
          name: "山田 母",
          roleGroup: "mother",
          status: "present",
          feeTierId: "adult",
        },
        {
          entityType: "member",
          entityId: "demo-father-1",
          name: "山田 父",
          roleGroup: "father",
          status: "present",
          feeTierId: "adult",
        },
      ]),
      companionsJson: JSON.stringify([
        {
          id: "comp-demo-1",
          name: "陽菜",
          relationLabel: "妹",
          feeTierId: "elementary",
          dietaryNote: "エビ抜き希望",
        },
        {
          id: "comp-demo-2",
          name: "湊",
          relationLabel: "弟",
          feeTierId: "infant_free",
        },
      ]),
      dateVotesJson: "[]",
      surveyAnswersJson: JSON.stringify({
        q_drink: "大人2名（アルコール1＋ソフト1）",
        q_afterparty: "参加する（1名）",
        q_allergy: "妹（陽菜）：エビアレルギーあり",
      }),
      comment: "家族5名で参加します！よろしくお願いいたします。",
      feePaid: true,
      updatedByUserId: "demo-user",
      updatedByName: "山田 母",
      updatedAt: "2026-11-20T10:00:00.000Z",
    },
    {
      id: "demo-resp-2",
      specialEventId: "demo-spev-party",
      householdKey: "hh_p_demo_2",
      householdLabel: "佐藤 家",
      memberEntriesJson: JSON.stringify([
        {
          entityType: "player",
          entityId: "demo-player-2",
          name: "佐藤 健太",
          roleGroup: "player",
          status: "present",
          feeTierId: "player",
        },
        {
          entityType: "member",
          entityId: "demo-mother-2",
          name: "佐藤 母",
          roleGroup: "mother",
          status: "present",
          feeTierId: "adult",
        },
      ]),
      companionsJson: JSON.stringify([
        {
          id: "comp-demo-3",
          name: "蒼",
          relationLabel: "弟",
          feeTierId: "preschool_meal",
        },
      ]),
      dateVotesJson: "[]",
      surveyAnswersJson: JSON.stringify({
        q_drink: "ソフトドリンク飲み放題",
        q_afterparty: "参加しない",
      }),
      comment: "車で行くためソフトドリンクでお願いします。",
      feePaid: false,
      updatedByUserId: "demo-user-2",
      updatedByName: "佐藤 母",
      updatedAt: "2026-11-20T12:00:00.000Z",
    },
    {
      id: "demo-resp-3",
      specialEventId: "demo-spev-party",
      householdKey: "hh_m_demo_coach",
      householdLabel: "高橋 監督",
      memberEntriesJson: JSON.stringify([
        {
          entityType: "member",
          entityId: "demo-staff-1",
          name: "高橋 監督",
          roleGroup: "staff",
          status: "present",
          feeTierId: "adult",
        },
      ]),
      companionsJson: "[]",
      dateVotesJson: "[]",
      surveyAnswersJson: JSON.stringify({
        q_drink: "アルコール飲み放題",
        q_afterparty: "参加する（1名）",
      }),
      comment: "1年間お疲れ様でした！楽しみにしています。",
      feePaid: true,
      updatedByUserId: "demo-coach",
      updatedByName: "高橋 監督",
      updatedAt: "2026-11-20T09:00:00.000Z",
    },
  ];

  const partyBuilt = buildSpecialEventHouseholdsAndSummary({
    units: demoUnits,
    responseRows: partyResponses,
    mode: "rsvp",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: partyTiers,
    candidateDates: [],
    questions: partyQuestions,
  });

  const partyEvent: SpecialEventDetailItem = {
    id: "demo-spev-party",
    teamId: "demo-team",
    title: "2026年 チーム忘年会・納会",
    category: "party",
    mode: "rsvp",
    status: "open",
    eventDate: "2026-12-19",
    eventDateLabel: formatDateKeyToJaLabel("2026-12-19"),
    startTime: "18:00",
    endTime: "20:30",
    timeRangeLabel: "18:00〜20:30",
    location: "和食ダイニング さくら駅前店（2F 貸切座敷）",
    locationUrl: "https://maps.google.com/",
    deadlineDate: "2026-12-06",
    deadlineDateLabel: formatDateKeyToJaLabel("2026-12-06"),
    description:
      "1年間の振り返りムービー上映＆ビンゴ大会を予定しています！ご兄弟や小さいお子様もぜひご一緒にご参加ください。服装は自由（私服）です。",
    importantNotice:
      "前日18時以降のキャンセルはお店規定によりコース料金100%が発生します。お車でお越しの方のアルコール飲酒は固くお断りいたします。",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: partyTiers,
    candidateDates: [],
    questions: partyQuestions,
    createdByUserId: "demo-user",
    createdByName: "父母会 幹事",
    canDelete: true,
    myHouseholdResponse:
      partyBuilt.households.find((h) => h.householdKey === "hh_p_demo_1") ||
      null,
    households: partyBuilt.households,
    summary: partyBuilt.summary,
  };

  // デモ2件目: 卒団式・謝恩会の候補日アンケート
  const pollCandidates: SpecialEventCandidateDate[] = [
    {
      id: "cand_1",
      dateStr: "2027-02-20",
      startTime: "12:00",
      endTime: "15:00",
      note: "土曜お昼・市民ホール第1会議室",
    },
    {
      id: "cand_2",
      dateStr: "2027-02-21",
      startTime: "12:00",
      endTime: "15:00",
      note: "日曜お昼・ホテルバンケット",
    },
    {
      id: "cand_3",
      dateStr: "2027-02-28",
      startTime: "11:30",
      endTime: "14:30",
      note: "予備日（日曜）",
    },
  ];
  const pollQuestions: SpecialEventQuestion[] = [
    {
      id: "q_help",
      ...SURVEY_QUESTION_PRESETS[3].question,
    },
  ];
  const pollResponses: RawSpecialEventResponseRow[] = [
    {
      id: "demo-poll-r1",
      specialEventId: "demo-spev-poll",
      householdKey: "hh_p_demo_2",
      householdLabel: "佐藤 家",
      memberEntriesJson: "[]",
      companionsJson: "[]",
      dateVotesJson: JSON.stringify([
        { candidateId: "cand_1", vote: "ok", headcountHint: 3 },
        { candidateId: "cand_2", vote: "ok", headcountHint: 3 },
        { candidateId: "cand_3", vote: "maybe", headcountHint: 2 },
      ]),
      surveyAnswersJson: JSON.stringify({
        q_help: ["受付・集金サポート", "写真・動画撮影"],
      }),
      comment: "どちらの週末でも調整可能です！",
      feePaid: false,
      updatedByUserId: "demo-user-2",
      updatedByName: "佐藤 母",
      updatedAt: "2026-11-20T13:00:00.000Z",
    },
    {
      id: "demo-poll-r2",
      specialEventId: "demo-spev-poll",
      householdKey: "hh_m_demo_coach",
      householdLabel: "高橋 監督",
      memberEntriesJson: "[]",
      companionsJson: "[]",
      dateVotesJson: JSON.stringify([
        { candidateId: "cand_1", vote: "maybe", headcountHint: 1 },
        { candidateId: "cand_2", vote: "ok", headcountHint: 1 },
        { candidateId: "cand_3", vote: "ng", headcountHint: 1 },
      ]),
      surveyAnswersJson: "{}",
      comment: "2/21(日)が一番動きやすいです。",
      feePaid: false,
      updatedByUserId: "demo-coach",
      updatedByName: "高橋 監督",
      updatedAt: "2026-11-20T14:00:00.000Z",
    },
  ];

  const pollBuilt = buildSpecialEventHouseholdsAndSummary({
    units: demoUnits,
    responseRows: pollResponses,
    mode: "date_poll",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: SPECIAL_EVENT_TEMPLATES[1].feeTiers.map((t) => ({ ...t })),
    candidateDates: pollCandidates,
    questions: pollQuestions,
  });

  const pollEvent: SpecialEventDetailItem = {
    id: "demo-spev-poll",
    teamId: "demo-team",
    title: "6年生 卒団式・謝恩会 開催日アンケート",
    category: "ceremony",
    mode: "date_poll",
    status: "open",
    eventDate: null,
    eventDateLabel: null,
    startTime: "12:00",
    endTime: "15:00",
    timeRangeLabel: "12:00〜15:00",
    location: "会場候補を調整中",
    locationUrl: "",
    deadlineDate: "2026-12-15",
    deadlineDateLabel: formatDateKeyToJaLabel("2026-12-15"),
    description:
      "卒団式・謝恩会の日程を決めるため、候補日のご都合をお知らせください。日程確定後、この画面からそのまま本出欠へ切り替えられます。",
    importantNotice: "",
    allowCompanions: true,
    useFeeCalculation: true,
    feeTiers: SPECIAL_EVENT_TEMPLATES[1].feeTiers.map((t) => ({ ...t })),
    candidateDates: pollCandidates,
    questions: pollQuestions,
    createdByUserId: "demo-user",
    createdByName: "父母会 幹事",
    canDelete: true,
    myHouseholdResponse:
      pollBuilt.households.find((h) => h.householdKey === "hh_p_demo_1") ||
      null,
    households: pollBuilt.households,
    summary: pollBuilt.summary,
  };

  const events = [partyEvent, pollEvent];
  const hubSummaries = events.map((ev) => toHubSpecialEventSummary(ev));

  return {
    events,
    hubSummaries,
    myHouseholdKey: "hh_p_demo_1",
  };
}

export function toHubSpecialEventSummary(
  ev: SpecialEventDetailItem
): HubSpecialEventSummary {
  const my = ev.myHouseholdResponse;
  const topCand =
    ev.summary.candidateSummaries.find((c) => c.isTopCandidate) ||
    ev.summary.candidateSummaries[0] ||
    null;

  return {
    id: ev.id,
    title: ev.title,
    category: ev.category,
    mode: ev.mode,
    status: ev.status,
    eventDate: ev.eventDate,
    eventDateLabel: ev.eventDateLabel,
    timeRangeLabel: ev.timeRangeLabel,
    location: ev.location,
    deadlineDate: ev.deadlineDate,
    deadlineDateLabel: ev.deadlineDateLabel,
    importantNotice: ev.importantNotice || "",
    totalHeadcount: ev.summary.totalHeadcount,
    presentMemberCount: ev.summary.presentMemberCount,
    companionCount: ev.summary.companionCount,
    attendingHouseholdCount: ev.summary.attendingHouseholdCount,
    absentHouseholdCount: ev.summary.absentHouseholdCount,
    unansweredHouseholdCount: ev.summary.unansweredHouseholdCount,
    respondedHouseholdCount: ev.summary.respondedHouseholdCount,
    activeTargetHouseholdCount: ev.summary.activeTargetHouseholdCount,
    tierTotals: ev.summary.tierTotals.map((t) => ({
      tierId: t.tierId,
      label: t.label,
      totalCount: t.totalCount,
    })),
    topCandidateSummary: topCand
      ? {
          dateLabel: topCand.dateLabel,
          okCount: topCand.okCount,
          maybeCount: topCand.maybeCount,
          ngCount: topCand.ngCount,
          estimatedHeadcount: topCand.estimatedHeadcount,
        }
      : null,
    myResponded: Boolean(my?.hasResponded),
    myOverallState: my?.overallState || "pending",
    myHeadcount: my?.totalHeadcount || 0,
    myFeeAmount: my?.totalFeeAmount || 0,
    useFeeCalculation: ev.useFeeCalculation,
  };
}
