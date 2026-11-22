// filepath: src/lib/liff/hub-ticker.ts

import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import type { HubEventInputItem } from "@/components/liff/HubHeroSection";
import {
  findMyAssignedStaffRoles,
  findMyFamilyCarpoolMatches,
  splitPresetAndCustomStaffRoles,
  type LiffMyMatchIdentity,
} from "@/lib/liff/match-day-ops";
import {
  DEFAULT_PRACTICE_MATCH_LABEL,
  isGenericMatchTournamentName,
} from "@/lib/liff/scorebook-symbol-rules";
import type { HubSpecialEventSummary } from "@/lib/liff/special-events-schema";
import { extractYouTubeVideoId } from "@/lib/youtube";

export type HubManualTickerTone = "urgent" | "warning" | "info" | "celebration";

export type HubTickerBadgeVariant =
  | "urgent"
  | "live"
  | "warning"
  | "schedule"
  | "result"
  | "media"
  | "admin"
  | "info";

export type HubTickerCategoryKey =
  | "manual"
  | "important_notice"
  | "live_status"
  | "my_reminder"
  | "schedule_roles"
  | "results_media"
  | "admin_slogan";

export interface HubManualTickerItem {
  id: string;
  enabled: boolean;
  tone: HubManualTickerTone;
  badgeLabel: string;
  text: string;
  linkTarget: string;
  expiresAt: string | null; // "YYYY-MM-DD" or null
  updatedAt: string;
  updatedBy: string;
}

export interface HubTickerAutoSources {
  /** ① 当日・直近予定の注意事項・球場規定 */
  importantNotices: boolean;
  /** ② 試合中ライブ速報 ＆ 遠征配車ライブ稼働中 */
  liveStatus: boolean;
  /** ③ 個人別の未回答・当日担当・乗車号車リマインド */
  myReminders: boolean;
  /** ④ 次回予定の参加人数 ＆ 保護者役割の空き枠募集 */
  scheduleAndRoles: boolean;
  /** ⑤ 直近の試合結果・連勝・新着動画＆写真アルバム */
  resultsAndMedia: boolean;
  /** ⑥ 管理者向けの参加承認待ち通知 ＆ チームスローガン */
  adminAndSlogan: boolean;
}

export interface HubTickerConfig {
  enabled: boolean;
  autoSources: HubTickerAutoSources;
  manualItems: HubManualTickerItem[];
}

export interface HubTickerLiveReportSummary {
  matchId: string;
  opponentName: string;
  tournamentText: string;
  inningLabel: string;
  isGameFinished: boolean;
  updatedAtSec: number;
}

export interface HubTickerAlbumSummary {
  id: string;
  title: string;
  albumDate: string;
  photoCount: number;
  updatedAtSec: number;
}

export interface HubTickerServerContext {
  activeConvoyCars: number;
  convoyDestination: string | null;
  liveReport: HubTickerLiveReportSummary | null;
  latestAlbum: HubTickerAlbumSummary | null;
  pendingMemberCount: number;
  slogan: string | null;
  myMatchIdentity: LiffMyMatchIdentity | null;
}

export interface HubTickerResolvedItem {
  id: string;
  category: HubTickerCategoryKey;
  badgeText: string;
  badgeVariant: HubTickerBadgeVariant;
  text: string;
  /** 遷移先内部パス。空文字の場合はタップで全文詳細モーダルを開く */
  href: string;
  isManual?: boolean;
  manualItem?: HubManualTickerItem;
  metaText?: string;
}

export interface HubTickerLinkOption {
  value: string;
  label: string;
  subLabel: string;
  group: string;
}

export interface HubTickerQuickPreset {
  id: string;
  chipLabel: string;
  tone: HubManualTickerTone;
  badgeLabel: string;
  text: string;
  linkTarget: string;
  expiryPreset: "today" | "tomorrow" | "weekend" | "week" | "none";
}

export const DEMO_HUB_TICKER_STORAGE_KEY = "iscore_demo_hub_ticker_v1";
export const MAX_HUB_MANUAL_TICKER_ITEMS = 5;
export const MAX_HUB_MANUAL_TEXT_LENGTH = 160;

export const DEFAULT_HUB_TICKER_AUTO_SOURCES: HubTickerAutoSources = {
  importantNotices: true,
  liveStatus: true,
  myReminders: true,
  scheduleAndRoles: true,
  resultsAndMedia: true,
  adminAndSlogan: true,
};

export const DEFAULT_HUB_TICKER_CONFIG: HubTickerConfig = {
  enabled: true,
  autoSources: { ...DEFAULT_HUB_TICKER_AUTO_SOURCES },
  manualItems: [],
};

export const DEMO_DEFAULT_HUB_TICKER_CONFIG: HubTickerConfig = {
  enabled: true,
  autoSources: { ...DEFAULT_HUB_TICKER_AUTO_SOURCES },
  manualItems: [
    {
      id: "demo-manual-1",
      enabled: true,
      tone: "info",
      badgeLabel: "チーム連絡",
      text: "日曜の秋季大会2回戦は「07:45 本拠地集合・乗り合い出発」です！水分多めにご準備ください⚾",
      linkTarget: "/liff/matches?id=demo-match-3",
      expiresAt: null,
      updatedAt: "2026-08-28T09:00:00.000Z",
      updatedBy: "監督・スタッフ",
    },
  ],
};

export const DEMO_HUB_TICKER_SERVER_CONTEXT: HubTickerServerContext = {
  activeConvoyCars: 0,
  convoyDestination: null,
  liveReport: null,
  latestAlbum: {
    id: "demo-album-1",
    title: "秋季大会 1回戦 ハイライト写真",
    albumDate: "2026-08-23",
    photoCount: 48,
    updatedAtSec: 0,
  },
  pendingMemberCount: 1,
  slogan: "全力疾走・声でつなぐ全員野球！",
  myMatchIdentity: null,
};

const VALID_TONES = new Set<HubManualTickerTone>([
  "urgent",
  "warning",
  "info",
  "celebration",
]);

export const HUB_MANUAL_TONE_META: Record<
  HubManualTickerTone,
  {
    defaultBadge: string;
    shortOptionLabel: string;
    badgeVariant: HubTickerBadgeVariant;
  }
> = {
  urgent: {
    defaultBadge: "🚨 緊急",
    shortOptionLabel: "🚨 緊急",
    badgeVariant: "urgent",
  },
  warning: {
    defaultBadge: "⚠️ 重要",
    shortOptionLabel: "⚠️ 重要",
    badgeVariant: "warning",
  },
  info: {
    defaultBadge: "📣 案内",
    shortOptionLabel: "📣 案内",
    badgeVariant: "info",
  },
  celebration: {
    defaultBadge: "🎉 報告",
    shortOptionLabel: "🎉 報告",
    badgeVariant: "result",
  },
};

export const HUB_TICKER_LINK_OPTIONS: readonly HubTickerLinkOption[] = [
  {
    value: "",
    label: "ポップアップで全文表示（画面移動なし）",
    subLabel: "タップすると連絡文の全文・更新日時を大きく表示します",
    group: "表示アクション",
  },
  {
    value: "/liff/schedule",
    label: "活動予定（スケジュール・出欠入力）",
    subLabel: "雨天変更・時間変更・週末予定の確認へ誘導",
    group: "予定・送迎",
  },
  {
    value: "/liff/schedule/board",
    label: "出欠一覧表（全員の回答マトリクス）",
    subLabel: "出欠未回答の確認・代理入力へ誘導",
    group: "予定・送迎",
  },
  {
    value: "/liff/carpool",
    label: "配車・送迎（隊列ライブマップ）",
    subLabel: "号車割当・乗り合わせ・現在地確認へ誘導",
    group: "予定・送迎",
  },
  {
    value: "/liff/events",
    label: "行事・アンケート（納会・合宿・投票）",
    subLabel: "特別行事の出欠回答・日程アンケートへ誘導",
    group: "予定・送迎",
  },
  {
    value: "/liff/grounds",
    label: "球場・施設マップ（駐車場・スパイク規定）",
    subLabel: "グラウンド地図・駐車ルール確認へ誘導",
    group: "予定・送迎",
  },
  {
    value: "/liff/matches",
    label: "試合・スコア（当日のしおり・役割・結果）",
    subLabel: "試合詳細・審判/スコア役割・動画へ誘導",
    group: "試合・チーム",
  },
  {
    value: "/liff/tools/news-generator",
    label: "LINE試合速報（ライブ閲覧・実況）",
    subLabel: "リアルタイム速報モニターへ誘導",
    group: "試合・チーム",
  },
  {
    value: "/liff/gallery",
    label: "写真アルバム（試合・行事フォト）",
    subLabel: "新着写真の閲覧・一括保存へ誘導",
    group: "資料・ギャラリー",
  },
  {
    value: "/liff/documents",
    label: "配布資料・書類（大会要項・同意書）",
    subLabel: "PDF資料・提出書類の確認へ誘導",
    group: "資料・ギャラリー",
  },
  {
    value: "/liff/rules",
    label: "チームルール・心得",
    subLabel: "当番・送迎・緊急時ルールの確認へ誘導",
    group: "資料・ギャラリー",
  },
  {
    value: "/liff/team",
    label: "チーム情報（スローガン・指導方針）",
    subLabel: "クラブ概要・代表挨拶・戦績へ誘導",
    group: "資料・ギャラリー",
  },
  {
    value: "/liff/admin",
    label: "チーム管理（メンバー承認・招待）",
    subLabel: "管理者向けメンバー・権限設定へ誘導",
    group: "管理",
  },
] as const;

export const HUB_TICKER_QUICK_PRESETS: readonly HubTickerQuickPreset[] = [
  {
    id: "rain_change",
    chipLabel: "☔ 雨天中止・変更",
    tone: "urgent",
    badgeLabel: "🚨 雨天変更",
    text: "本日の活動は雨天のため予定変更（または中止）となりました。集合時間・場所を予定欄でご確認ください。",
    linkTarget: "/liff/schedule",
    expiryPreset: "today",
  },
  {
    id: "time_change",
    chipLabel: "⏰ 集合時間変更",
    tone: "urgent",
    badgeLabel: "🚨 時間変更",
    text: "明日の集合時間が【08:00】に変更となりました。お間違えのないようご確認ください！",
    linkTarget: "/liff/schedule",
    expiryPreset: "tomorrow",
  },
  {
    id: "parking_rule",
    chipLabel: "🅿️ 駐車・来場注意",
    tone: "warning",
    badgeLabel: "⚠️ 来場注意",
    text: "次回の球場は駐車台数制限があります。必ず配車表の乗り合わせ・指定駐車場をご確認ください。",
    linkTarget: "/liff/carpool",
    expiryPreset: "weekend",
  },
  {
    id: "rsvp_request",
    chipLabel: "📝 出欠入力お願い",
    tone: "info",
    badgeLabel: "📣 出欠依頼",
    text: "今週末の活動予定・配車作成のため、未回答の方は本日中に出欠のご入力をお願いします！",
    linkTarget: "/liff/schedule",
    expiryPreset: "weekend",
  },
  {
    id: "win_celebration",
    chipLabel: "🎉 試合勝利報告",
    tone: "celebration",
    badgeLabel: "🎉 勝利報告",
    text: "本日の公式戦、全員野球で見事勝利しました！たくさんのご声援・審判や配車のご協力ありがとうございました🔥",
    linkTarget: "/liff/matches",
    expiryPreset: "week",
  },
] as const;

export function toJstIsoDateString(dateObj: Date = new Date()): string {
  const jstMs = dateObj.getTime() + 9 * 3600 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

export function shiftIsoDateString(baseIsoDate: string, deltaDays: number): string {
  const m = baseIsoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return baseIsoDate;
  const utc = Date.UTC(
    Number.parseInt(m[1], 10),
    Number.parseInt(m[2], 10) - 1,
    Number.parseInt(m[3], 10) + deltaDays
  );
  return new Date(utc).toISOString().slice(0, 10);
}

export function resolveQuickExpiryDate(
  preset: "today" | "tomorrow" | "weekend" | "week" | "none",
  nowDate: Date = new Date()
): string | null {
  if (preset === "none") return null;
  const today = toJstIsoDateString(nowDate);
  if (preset === "today") return today;
  if (preset === "tomorrow") return shiftIsoDateString(today, 1);
  if (preset === "week") return shiftIsoDateString(today, 7);

  // "weekend": 直近の日曜日（今日が日曜なら今日、月〜土なら次の日曜）
  const [y, mo, d] = today.split("-").map((v) => Number.parseInt(v, 10));
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
  return shiftIsoDateString(today, daysUntilSunday);
}

export function normalizeExpiryDateInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(
    d
  ).padStart(2, "0")}`;
}

export function isHubManualTickerExpired(
  expiresAt: string | null | undefined,
  nowDate: Date = new Date()
): boolean {
  const normalized = normalizeExpiryDateInput(expiresAt);
  if (!normalized) return false;
  const todayKey = toJstIsoDateString(nowDate);
  return normalized < todayKey;
}

export function formatShortMonthDay(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const m = isoDate.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return isoDate;
  return `${Number.parseInt(m[2], 10)}/${Number.parseInt(m[3], 10)}`;
}

function sanitizeSafeLiffPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("/liff")) return "";
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return "";
  return trimmed.slice(0, 160);
}

function sanitizeCleanText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim().slice(0, maxLen);
}

export function sanitizeSingleLineTickerText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function parseHubTickerConfigJson(raw: unknown): HubTickerConfig {
  if (!raw) {
    return {
      enabled: true,
      autoSources: { ...DEFAULT_HUB_TICKER_AUTO_SOURCES },
      manualItems: [],
    };
  }

  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          obj = parsed as Record<string, unknown>;
        }
      } catch {
        obj = null;
      }
    }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) {
    return {
      enabled: true,
      autoSources: { ...DEFAULT_HUB_TICKER_AUTO_SOURCES },
      manualItems: [],
    };
  }

  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : true;

  const rawAuto =
    obj.autoSources &&
    typeof obj.autoSources === "object" &&
    !Array.isArray(obj.autoSources)
      ? (obj.autoSources as Record<string, unknown>)
      : {};

  const autoSources: HubTickerAutoSources = {
    importantNotices:
      typeof rawAuto.importantNotices === "boolean"
        ? rawAuto.importantNotices
        : true,
    liveStatus:
      typeof rawAuto.liveStatus === "boolean" ? rawAuto.liveStatus : true,
    myReminders:
      typeof rawAuto.myReminders === "boolean" ? rawAuto.myReminders : true,
    scheduleAndRoles:
      typeof rawAuto.scheduleAndRoles === "boolean"
        ? rawAuto.scheduleAndRoles
        : true,
    resultsAndMedia:
      typeof rawAuto.resultsAndMedia === "boolean"
        ? rawAuto.resultsAndMedia
        : true,
    adminAndSlogan:
      typeof rawAuto.adminAndSlogan === "boolean"
        ? rawAuto.adminAndSlogan
        : true,
  };

  const rawList = Array.isArray(obj.manualItems) ? obj.manualItems : [];
  const manualItems: HubManualTickerItem[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const entry = rawList[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const text = sanitizeCleanText(item.text, MAX_HUB_MANUAL_TEXT_LENGTH);
    if (!text) continue;

    const rawTone = typeof item.tone === "string" ? item.tone.trim() : "";
    const tone: HubManualTickerTone = VALID_TONES.has(
      rawTone as HubManualTickerTone
    )
      ? (rawTone as HubManualTickerTone)
      : "info";

    const id =
      sanitizeCleanText(item.id, 64) || `ticker_${Date.now()}_${i + 1}`;
    const itemEnabled =
      typeof item.enabled === "boolean" ? item.enabled : true;
    const badgeLabel =
      sanitizeCleanText(item.badgeLabel, 12) ||
      HUB_MANUAL_TONE_META[tone].defaultBadge;
    const linkTarget = sanitizeSafeLiffPath(item.linkTarget);
    const expiresAt = normalizeExpiryDateInput(item.expiresAt);
    const updatedAt =
      sanitizeCleanText(item.updatedAt, 40) || new Date().toISOString();
    const updatedBy = sanitizeCleanText(item.updatedBy, 40);

    manualItems.push({
      id,
      enabled: itemEnabled,
      tone,
      badgeLabel,
      text,
      linkTarget,
      expiresAt,
      updatedAt,
      updatedBy,
    });

    if (manualItems.length >= MAX_HUB_MANUAL_TICKER_ITEMS) break;
  }

  return {
    enabled,
    autoSources,
    manualItems,
  };
}

export function serializeHubTickerConfigJson(
  input: Partial<HubTickerConfig>
): string {
  const normalized = parseHubTickerConfigJson(input);
  return JSON.stringify(normalized);
}

export function loadDemoHubTickerConfig(): HubTickerConfig {
  if (typeof window === "undefined") {
    return parseHubTickerConfigJson(DEMO_DEFAULT_HUB_TICKER_CONFIG);
  }
  try {
    const saved = localStorage.getItem(DEMO_HUB_TICKER_STORAGE_KEY);
    if (!saved) {
      return parseHubTickerConfigJson(DEMO_DEFAULT_HUB_TICKER_CONFIG);
    }
    return parseHubTickerConfigJson(saved);
  } catch {
    return parseHubTickerConfigJson(DEMO_DEFAULT_HUB_TICKER_CONFIG);
  }
}

export function saveDemoHubTickerConfig(config: HubTickerConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DEMO_HUB_TICKER_STORAGE_KEY,
      serializeHubTickerConfigJson(config)
    );
  } catch {
    // ignore storage errors
  }
}

function extractMatchIsoDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function diffDaysBetweenIsoDates(fromIso: string, toIso: string): number | null {
  const m1 = fromIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m2 = toIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m1 || !m2) return null;
  const t1 = Date.UTC(
    Number.parseInt(m1[1], 10),
    Number.parseInt(m1[2], 10) - 1,
    Number.parseInt(m1[3], 10)
  );
  const t2 = Date.UTC(
    Number.parseInt(m2[1], 10),
    Number.parseInt(m2[2], 10) - 1,
    Number.parseInt(m2[3], 10)
  );
  return Math.round((t2 - t1) / (24 * 3600 * 1000));
}

function formatMatchContextTitle(
  match: MatchCardData,
  practiceMatchLabel: string
): string {
  if (
    match.tournamentName &&
    !isGenericMatchTournamentName(match.tournamentName)
  ) {
    return match.tournamentName.trim();
  }
  if (match.matchType === "official") {
    return "公式戦";
  }
  return practiceMatchLabel || DEFAULT_PRACTICE_MATCH_LABEL;
}

const MANUAL_TONE_RANK: Record<HubManualTickerTone, number> = {
  urgent: 0,
  warning: 1,
  celebration: 2,
  info: 3,
};

export interface BuildHubTickerFeedParams {
  config: HubTickerConfig;
  events: HubEventInputItem[];
  specialEvents: HubSpecialEventSummary[];
  matches: MatchCardData[];
  serverContext?: HubTickerServerContext | null;
  canManage: boolean;
  isDemo?: boolean;
  practiceMatchLabel?: string;
  userName?: string;
  nowDate?: Date;
}

/**
 * ⚾ トップページ最上部ティッカーの配信アイテム一覧を優先度順（①〜⑥）に構築する純粋関数
 */
export function buildHubTickerFeed(
  params: BuildHubTickerFeedParams
): HubTickerResolvedItem[] {
  const {
    config,
    events,
    specialEvents,
    matches,
    serverContext,
    canManage,
    isDemo = false,
    practiceMatchLabel = DEFAULT_PRACTICE_MATCH_LABEL,
    userName = "",
    nowDate = new Date(),
  } = params;

  if (!config.enabled) {
    return [];
  }

  const todayKey = toJstIsoDateString(nowDate);
  const nowSec = Math.floor(nowDate.getTime() / 1000);
  const items: HubTickerResolvedItem[] = [];
  const auto = config.autoSources;

  // =========================================================
  // ① 🚨【最優先】手動ピン留め連絡 ＆ 当日・直近予定の重要注意事項
  // =========================================================
  const activeManuals = config.manualItems
    .map((item, idx) => ({ item, idx }))
    .filter(
      ({ item }) =>
        item.enabled &&
        Boolean(item.text.trim()) &&
        !isHubManualTickerExpired(item.expiresAt, nowDate)
    )
    .sort((a, b) => {
      const rankDiff =
        MANUAL_TONE_RANK[a.item.tone] - MANUAL_TONE_RANK[b.item.tone];
      return rankDiff !== 0 ? rankDiff : a.idx - b.idx;
    });

  for (const { item } of activeManuals) {
    const toneMeta = HUB_MANUAL_TONE_META[item.tone];
    const expiryMeta = item.expiresAt
      ? `${formatShortMonthDay(item.expiresAt)}まで掲示`
      : undefined;
    items.push({
      id: `manual:${item.id}`,
      category: "manual",
      badgeText: item.badgeLabel || toneMeta.defaultBadge,
      badgeVariant: toneMeta.badgeVariant,
      text: sanitizeSingleLineTickerText(item.text),
      href: item.linkTarget || "",
      isManual: true,
      manualItem: item,
      metaText: expiryMeta,
    });
  }

  // Upcoming events sorted chronologically (for demo mode where dates may be sample dates, fall back gracefully)
  const upcomingEvents = events.filter((ev) => {
    if (ev.eventType === "off") return false;
    if (!ev.dateStr) return true;
    return ev.dateStr >= todayKey;
  });
  const effectiveUpcomingEvents =
    upcomingEvents.length > 0 ? upcomingEvents : isDemo ? events : [];

  if (auto.importantNotices) {
    // 1-A. 直近予定（10日以内）の注意事項・特記事項
    const noticeEvent = effectiveUpcomingEvents.find((ev) => {
      const notice = ev.importantNotice?.trim();
      if (!notice) return false;
      if (!ev.dateStr || isDemo) return true;
      const diff = diffDaysBetweenIsoDates(todayKey, ev.dateStr);
      return diff !== null && diff >= 0 && diff <= 10;
    });
    if (noticeEvent && noticeEvent.importantNotice?.trim()) {
      const cleanNotice = sanitizeSingleLineTickerText(
        noticeEvent.importantNotice
      );
      const datePrefix = noticeEvent.date ? `${noticeEvent.date} ` : "";
      items.push({
        id: `ev-notice:${noticeEvent.id}`,
        category: "important_notice",
        badgeText: "⚠️ 注意事項",
        badgeVariant: "warning",
        text: `${datePrefix}${noticeEvent.title || "活動予定"}：${cleanNotice}`,
        href: "/liff/schedule",
      });
    }

    // 1-B. 募集中の特別行事・アンケートの注意事項
    const noticeSpecial = specialEvents.find(
      (sp) => sp.status === "open" && Boolean(sp.importantNotice?.trim())
    );
    if (noticeSpecial && noticeSpecial.importantNotice?.trim()) {
      items.push({
        id: `sp-notice:${noticeSpecial.id}`,
        category: "important_notice",
        badgeText: "⚠️ 行事注意",
        badgeVariant: "warning",
        text: `「${noticeSpecial.title}」${sanitizeSingleLineTickerText(
          noticeSpecial.importantNotice
        )}`,
        href: `/liff/events?id=${encodeURIComponent(noticeSpecial.id)}`,
      });
    }

    // 1-C. 直近予定試合（3日以内）の球場駐車制限・スパイク規定
    const upcomingRuleMatch = matches.find((m) => {
      if (m.status !== "scheduled") return false;
      const hasVenueRule = Boolean(
        m.venueParkingInfo?.trim() || m.venueSpikeRule?.trim()
      );
      if (!hasVenueRule) return false;
      const mDate = extractMatchIsoDate(m.date);
      if (!mDate) return false;
      const diff = diffDaysBetweenIsoDates(todayKey, mDate);
      return diff !== null && diff >= 0 && diff <= 3;
    });
    if (upcomingRuleMatch) {
      const mDate = extractMatchIsoDate(upcomingRuleMatch.date);
      const ruleParts: string[] = [];
      if (upcomingRuleMatch.venueParkingInfo?.trim()) {
        ruleParts.push(
          sanitizeSingleLineTickerText(upcomingRuleMatch.venueParkingInfo)
        );
      }
      if (upcomingRuleMatch.venueSpikeRule?.trim()) {
        ruleParts.push(
          sanitizeSingleLineTickerText(upcomingRuleMatch.venueSpikeRule)
        );
      }
      const venueLabel =
        upcomingRuleMatch.venueShortName?.trim() ||
        upcomingRuleMatch.venueName?.trim() ||
        "試合会場";
      items.push({
        id: `venue-rule:${upcomingRuleMatch.id}`,
        category: "important_notice",
        badgeText: "🅿️ 球場規定",
        badgeVariant: "warning",
        text: `${formatShortMonthDay(mDate)} ${venueLabel}：${ruleParts.join(" ／ ")}`,
        href: `/liff/matches?id=${encodeURIComponent(upcomingRuleMatch.id)}`,
      });
    }
  }

  // =========================================================
  // ② 🔴【ライブ連動】試合中リアルタイム速報 ＆ 遠征隊列ライブ稼働中
  // =========================================================
  if (auto.liveStatus) {
    const liveMatch = matches.find(
      (m) => m.status === "live" || m.status === "in_progress"
    );
    const activeReport = serverContext?.liveReport;

    if (liveMatch) {
      const mLabel = formatMatchContextTitle(liveMatch, practiceMatchLabel);
      const inningPart =
        activeReport && activeReport.matchId === liveMatch.id && activeReport.inningLabel
          ? `${activeReport.inningLabel} `
          : "";
      items.push({
        id: `live-match:${liveMatch.id}`,
        category: "live_status",
        badgeText: "🔴 試合速報中",
        badgeVariant: "live",
        text: `${mLabel} vs ${liveMatch.opponent}｜${inningPart}${liveMatch.myScore} - ${liveMatch.opponentScore}（タップでライブ速報へ）`,
        href: `/liff/tools/news-generator?matchId=${encodeURIComponent(liveMatch.id)}`,
      });
    } else if (
      activeReport &&
      !activeReport.isGameFinished &&
      activeReport.updatedAtSec > 0 &&
      nowSec - activeReport.updatedAtSec <= 4 * 3600
    ) {
      const matchedCard = matches.find((m) => m.id === activeReport.matchId);
      const scorePart = matchedCard
        ? ` ${matchedCard.myScore} - ${matchedCard.opponentScore}`
        : "";
      items.push({
        id: `live-report:${activeReport.matchId}`,
        category: "live_status",
        badgeText: "🔴 速報配信中",
        badgeVariant: "live",
        text: `vs ${activeReport.opponentName || "対戦相手"}｜${activeReport.inningLabel}${scorePart}（ライブ速報を見る）`,
        href: `/liff/tools/news-generator?matchId=${encodeURIComponent(activeReport.matchId)}`,
      });
    }

    const convoyCount = serverContext?.activeConvoyCars || 0;
    if (convoyCount > 0) {
      const destPart = serverContext?.convoyDestination
        ? `「${serverContext.convoyDestination}」へ`
        : "";
      items.push({
        id: `live-convoy:${convoyCount}`,
        category: "live_status",
        badgeText: "🚗 遠征移動中",
        badgeVariant: "live",
        text: `現在 ${convoyCount}台が${destPart}位置共有で移動中です（隊列ライブマップを開く）`,
        href: "/liff/carpool",
      });
    }
  }

  // =========================================================
  // ③ 🙋‍♂️【個人別】未回答リマインド・当日担当・乗車号車案内
  // =========================================================
  if (auto.myReminders) {
    // 3-A. ログインメンバー本人の直近予定試合での役割担当・家族乗車号車
    const effectiveIdentity: LiffMyMatchIdentity | null =
      serverContext?.myMatchIdentity ||
      (userName && userName !== "メンバー"
        ? {
            memberId: null,
            memberName: null,
            displayName: userName,
            childNames: [],
          }
        : null);

    if (effectiveIdentity) {
      const scheduledMatches = matches.filter((m) => {
        if (m.status !== "scheduled") return false;
        const mDate = extractMatchIsoDate(m.date);
        if (!mDate) return false;
        if (isDemo) return true;
        const diff = diffDaysBetweenIsoDates(todayKey, mDate);
        return diff !== null && diff >= 0 && diff <= 7;
      });

      for (const sm of scheduledMatches) {
        const myRoles = findMyAssignedStaffRoles(sm.matchDayOps, effectiveIdentity);
        const myCars = sm.scheduleSync?.cars
          ? findMyFamilyCarpoolMatches(sm.scheduleSync.cars, effectiveIdentity)
          : [];
        if (myRoles.length > 0 || myCars.length > 0) {
          const summaryTokens: string[] = [];
          if (myRoles.length > 0) {
            summaryTokens.push(
              `役割「${myRoles.map((r) => r.roleLabel).join("・")}」`
            );
          }
          if (myCars.length > 0) {
            summaryTokens.push(
              myCars
                .map((c) =>
                  c.isDriver ? `${c.carNumber}号車運転` : `${c.carNumber}号車乗車`
                )
                .join("・")
            );
          }
          const mDate = extractMatchIsoDate(sm.date);
          const datePrefix = mDate ? `${formatShortMonthDay(mDate)} ` : "";
          items.push({
            id: `my-duty:${sm.id}`,
            category: "my_reminder",
            badgeText: "🧢 担当確認",
            badgeVariant: "schedule",
            text: `${datePrefix}vs ${sm.opponent}戦：ご自身の${summaryTokens.join(" ／ ")}が登録されています`,
            href: `/liff/matches?id=${encodeURIComponent(sm.id)}`,
          });
          break;
        }
      }
    }

    // 3-B. 未回答の通常活動予定（直近21日以内）
    const unansweredEvents = effectiveUpcomingEvents.filter((ev) => {
      if (ev.myStatus !== "pending") return false;
      if (!ev.dateStr || isDemo) return true;
      const diff = diffDaysBetweenIsoDates(todayKey, ev.dateStr);
      return diff !== null && diff >= 0 && diff <= 21;
    });

    if (unansweredEvents.length > 0) {
      const firstEv = unansweredEvents[0];
      const firstLabel = firstEv.date || formatShortMonthDay(firstEv.dateStr) || "直近";
      const text =
        unansweredEvents.length === 1
          ? `${firstLabel}「${firstEv.title || "活動予定"}」の出欠が未回答です（タップで回答へ）`
          : `${firstLabel} ほか ${unansweredEvents.length}件の活動予定が未回答です（タップで回答へ）`;
      items.push({
        id: `my-unanswered-ev:${firstEv.id}:${unansweredEvents.length}`,
        category: "my_reminder",
        badgeText: "📝 出欠未回答",
        badgeVariant: "warning",
        text,
        href: "/liff/schedule",
      });
    }

    // 3-C. 未回答の特別行事・アンケート
    const unansweredSpecial = specialEvents.find(
      (sp) => sp.status === "open" && !sp.myResponded
    );
    if (unansweredSpecial) {
      const isPoll = unansweredSpecial.mode === "date_poll";
      const deadlinePart = unansweredSpecial.deadlineDateLabel
        ? `（〆${unansweredSpecial.deadlineDateLabel}）`
        : "";
      items.push({
        id: `my-unanswered-sp:${unansweredSpecial.id}`,
        category: "my_reminder",
        badgeText: "🎉 行事未回答",
        badgeVariant: "warning",
        text: `「${unansweredSpecial.title}」の${isPoll ? "日程アンケート" : "出欠回答"}を受付中です${deadlinePart}`,
        href: `/liff/events?id=${encodeURIComponent(unansweredSpecial.id)}`,
      });
    }
  }

  // =========================================================
  // ④ 📅【チーム予定】次回スケジュールの参加人数 ＆ 役割の空き枠募集
  // =========================================================
  if (auto.scheduleAndRoles) {
    // 4-A. 次回活動予定の参加状況サマリー
    const nextEv = effectiveUpcomingEvents[0];
    if (nextEv) {
      const playerPresent = nextEv.groupAttendCount?.player?.present;
      const totalPresent = nextEv.attendCount?.present;
      const attendPart =
        typeof playerPresent === "number"
          ? `選手${playerPresent}名参加予定`
          : typeof totalPresent === "number"
          ? `参加${totalPresent}名`
          : "";
      const timeLabel =
        nextEv.amTime ||
        nextEv.pmTime ||
        (typeof (nextEv as { time?: string }).time === "string"
          ? (nextEv as { time?: string }).time!
          : "");
      const metaBits: string[] = [];
      if (attendPart) metaBits.push(attendPart);
      if (nextEv.dutyGroup?.trim()) {
        metaBits.push(`当番: ${nextEv.dutyGroup.trim()}`);
      }
      metaBits.push(nextEv.needsLunch ? "弁当あり" : "弁当なし");

      const dateText = nextEv.date || formatShortMonthDay(nextEv.dateStr) || "次回";
      const locPart = nextEv.location ? `＠${nextEv.location}` : "";
      items.push({
        id: `next-schedule:${nextEv.id}`,
        category: "schedule_roles",
        badgeText: "📅 次回予定",
        badgeVariant: "schedule",
        text: `${dateText} ${nextEv.title || "活動"}${timeLabel ? `（${timeLabel}）` : ""}${locPart}｜${metaBits.join("・")}`,
        href: "/liff/schedule",
      });
    }

    // 4-B. 直近予定試合（10日以内）の保護者役割空き枠案内
    const roleNeededMatch = matches.find((m) => {
      if (m.status !== "scheduled") return false;
      const mDate = extractMatchIsoDate(m.date);
      if (!mDate) return false;
      if (!isDemo) {
        const diff = diffDaysBetweenIsoDates(todayKey, mDate);
        if (diff === null || diff < 0 || diff > 10) return false;
      }
      const split = splitPresetAndCustomStaffRoles(m.matchDayOps);
      if (split.isAllRolesNone || split.activePresetCount === 0) return false;
      const unfilledCount = split.presetRoles.filter(
        (r) => !r.isNone && !r.isAssigned
      ).length;
      // 1枠以上入力開始済み、または5日以内の直近試合で未定枠がある場合のみ募集表示
      const diff = diffDaysBetweenIsoDates(todayKey, mDate);
      const isImminent = diff !== null && diff >= 0 && diff <= 5;
      return (
        unfilledCount > 0 && (split.assignedPresetCount > 0 || isImminent)
      );
    });

    if (roleNeededMatch) {
      const split = splitPresetAndCustomStaffRoles(roleNeededMatch.matchDayOps);
      const unfilled = split.presetRoles.filter(
        (r) => !r.isNone && !r.isAssigned
      );
      const sampleLabels = unfilled
        .slice(0, 2)
        .map((r) => `「${r.roleLabel}」`)
        .join("");
      const restSuffix =
        unfilled.length > 2 ? `ほか${unfilled.length}枠` : "";
      const mDate = extractMatchIsoDate(roleNeededMatch.date);
      items.push({
        id: `role-open:${roleNeededMatch.id}`,
        category: "schedule_roles",
        badgeText: "🤝 役割募集",
        badgeVariant: "schedule",
        text: `${formatShortMonthDay(mDate)} vs ${roleNeededMatch.opponent}戦の${sampleLabels}${restSuffix}担当が未定です`,
        href: `/liff/matches?id=${encodeURIComponent(roleNeededMatch.id)}`,
      });
    }
  }

  // =========================================================
  // ⑤ 🏆【盛り上げ枠】直近の試合結果・連勝記録・新着動画＆新着写真
  // =========================================================
  if (auto.resultsAndMedia) {
    const finishedMatches = matches.filter(
      (m) => m.status === "finished" || m.status === "completed"
    );

    if (finishedMatches.length > 0) {
      const latestFinished = finishedMatches[0];
      let winStreak = 0;
      for (const fm of finishedMatches) {
        if (fm.myScore > fm.opponentScore) {
          winStreak += 1;
        } else {
          break;
        }
      }

      const mLabel = formatMatchContextTitle(
        latestFinished,
        practiceMatchLabel
      );
      const isWin = latestFinished.myScore > latestFinished.opponentScore;
      const isDraw = latestFinished.myScore === latestFinished.opponentScore;

      const resultText = isWin
        ? `${mLabel} vs ${latestFinished.opponent}に ${latestFinished.myScore} - ${latestFinished.opponentScore} で勝利！${
            winStreak >= 2 ? `現在チーム${winStreak}連勝中🔥` : "スコア詳細を見る"
          }`
        : isDraw
        ? `${mLabel} vs ${latestFinished.opponent}は ${latestFinished.myScore} - ${latestFinished.opponentScore} の引き分け（スコアブック公開中）`
        : `${mLabel} vs ${latestFinished.opponent}（${latestFinished.myScore} - ${latestFinished.opponentScore}）スコア・個人成績を公開中`;

      items.push({
        id: `match-result:${latestFinished.id}`,
        category: "results_media",
        badgeText: isWin ? "🏆 試合結果" : "⚾ 試合結果",
        badgeVariant: "result",
        text: resultText,
        href: `/liff/matches?id=${encodeURIComponent(latestFinished.id)}`,
      });
    }

    // 5-B. YouTube 試合映像が登録されている直近試合
    const videoMatch = matches.find((m) =>
      Boolean(extractYouTubeVideoId(m.youtubeUrl))
    );
    if (videoMatch) {
      const mDate = extractMatchIsoDate(videoMatch.date);
      const datePart = mDate ? `（${formatShortMonthDay(mDate)}）` : "";
      items.push({
        id: `match-video:${videoMatch.id}`,
        category: "results_media",
        badgeText: "▶️ 試合動画",
        badgeVariant: "media",
        text: `vs ${videoMatch.opponent}戦${datePart}のYouTube試合映像を配信中！タップで再生`,
        href: `/liff/matches?id=${encodeURIComponent(videoMatch.id)}&section=video`,
      });
    }

    // 5-C. 新着写真アルバム（直近21日以内、またはデモ体験時）
    const latestAlbum = serverContext?.latestAlbum;
    if (
      latestAlbum &&
      latestAlbum.photoCount > 0 &&
      (isDemo ||
        latestAlbum.updatedAtSec <= 0 ||
        nowSec - latestAlbum.updatedAtSec <= 21 * 24 * 3600)
    ) {
      items.push({
        id: `gallery-album:${latestAlbum.id}`,
        category: "results_media",
        badgeText: "📸 新着写真",
        badgeVariant: "media",
        text: `写真アルバム「${latestAlbum.title}」（${latestAlbum.photoCount}枚）が公開されています`,
        href: "/liff/gallery",
      });
    }
  }

  // =========================================================
  // ⑥ 🛡️【管理者専用 ＆ 平常時】参加承認待ち通知 ／ チームスローガン
  // =========================================================
  if (auto.adminAndSlogan) {
    const pendingCount = canManage
      ? serverContext?.pendingMemberCount || 0
      : 0;
    if (canManage && pendingCount > 0) {
      // 管理者が気づきやすいよう、個人リマインド直前〜上位に挿入しても良いが、ローテーション内で確実に目に入る専用バッジで追加
      items.splice(Math.min(items.length, activeManuals.length + 1), 0, {
        id: `admin-pending:${pendingCount}`,
        category: "admin_slogan",
        badgeText: "🛡️ 承認待ち",
        badgeVariant: "admin",
        text: `新しいメンバーからチーム参加申請が ${pendingCount}件 届いています（タップで承認画面へ）`,
        href: "/liff/admin",
      });
    }

    const cleanSlogan = serverContext?.slogan
      ? sanitizeSingleLineTickerText(serverContext.slogan)
      : "";
    if (cleanSlogan) {
      items.push({
        id: "team-slogan",
        category: "admin_slogan",
        badgeText: "⚾ スローガン",
        badgeVariant: "info",
        text: `「${cleanSlogan}」`,
        href: "/liff/team",
      });
    }
  }

  // 万が一すべての項目が 0 件の新規立ち上げ直後チームでもデッドエンドを作らないウェルカム案内
  if (items.length === 0) {
    items.push({
      id: "welcome-fallback",
      category: "admin_slogan",
      badgeText: "📣 チーム案内",
      badgeVariant: "info",
      text: canManage
        ? "予定・試合・出欠状況がここに自動で流れます（右の「編集」から連絡文もピン留めできます）"
        : "チームの最新スケジュール・出欠・試合速報がここにリアルタイム表示されます",
      href: "/liff/schedule",
    });
  }

  return items;
}
