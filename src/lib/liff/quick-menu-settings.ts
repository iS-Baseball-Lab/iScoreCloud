// filepath: src/lib/liff/quick-menu-settings.ts
import type React from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  Camera,
  Car,
  ClipboardCheck,
  FileText,
  HelpCircle,
  IdCard,
  Link2,
  MapPin,
  Megaphone,
  Music,
  ScanLine,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";

export type QuickMenuItemId =
  | "schedule"
  | "board"
  | "carpool"
  | "grounds"
  | "matches"
  | "lineup"
  | "news_generator"
  | "scorebook_import"
  | "players"
  | "stats"
  | "player_growth"
  | "gallery"
  | "cheer_songs"
  | "rules"
  | "faq"
  | "documents"
  | "links"
  | "profile"
  | "app_settings"
  | "team_settings"
  | "score_settings"
  | "admin";

export type QuickMenuLayoutMode = "standard" | "slim" | "compact";

export type QuickMenuCategoryId =
  | "schedule_match"
  | "player_docs"
  | "settings_admin";

export type QuickMenuTone =
  | "primary"
  | "amber"
  | "teal"
  | "purple"
  | "sky"
  | "blue"
  | "red"
  | "cyan"
  | "emerald"
  | "indigo"
  | "rose"
  | "orange";

export interface QuickMenuToneStyle {
  iconBoxClass: string;
  badgeClass: string;
  hoverBorderClass: string;
  topBarClass: string;
}

const PRIMARY_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-primary/12 text-primary",
  badgeClass: "bg-primary/12 text-primary",
  hoverBorderClass: "hover:border-primary/50",
  topBarClass: "bg-primary",
};

const TEAL_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  badgeClass: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  hoverBorderClass: "hover:border-teal-500/50",
  topBarClass: "bg-teal-600",
};

const AMBER_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  badgeClass: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  hoverBorderClass: "hover:border-amber-500/50",
  topBarClass: "bg-amber-500",
};

const SLATE_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  badgeClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  hoverBorderClass: "hover:border-slate-500/50",
  topBarClass: "bg-slate-600",
};

export const QUICK_MENU_TONE_STYLES: Record<QuickMenuTone, QuickMenuToneStyle> = {
  primary: PRIMARY_QUICK_MENU_TONE_STYLE,
  amber: AMBER_QUICK_MENU_TONE_STYLE,
  teal: TEAL_QUICK_MENU_TONE_STYLE,
  purple: AMBER_QUICK_MENU_TONE_STYLE,
  sky: SLATE_QUICK_MENU_TONE_STYLE,
  blue: TEAL_QUICK_MENU_TONE_STYLE,
  red: PRIMARY_QUICK_MENU_TONE_STYLE,
  cyan: PRIMARY_QUICK_MENU_TONE_STYLE,
  emerald: TEAL_QUICK_MENU_TONE_STYLE,
  indigo: PRIMARY_QUICK_MENU_TONE_STYLE,
  rose: PRIMARY_QUICK_MENU_TONE_STYLE,
  orange: PRIMARY_QUICK_MENU_TONE_STYLE,
};

const TEAL_SCHEDULE_ITEM_IDS: ReadonlySet<QuickMenuItemId> = new Set([
  "schedule",
  "board",
  "carpool",
  "grounds",
]);

const AMBER_DOCS_ITEM_IDS: ReadonlySet<QuickMenuItemId> = new Set([
  "rules",
  "faq",
  "documents",
  "links",
]);

const SLATE_SETTINGS_ITEM_IDS: ReadonlySet<QuickMenuItemId> = new Set([
  "profile",
  "app_settings",
  "score_settings",
  "team_settings",
  "admin",
]);

export function getQuickMenuItemToneStyle(
  item: Pick<QuickMenuItemDef, "id" | "category">,
): QuickMenuToneStyle {
  if (TEAL_SCHEDULE_ITEM_IDS.has(item.id)) {
    return TEAL_QUICK_MENU_TONE_STYLE;
  }
  if (AMBER_DOCS_ITEM_IDS.has(item.id)) {
    return AMBER_QUICK_MENU_TONE_STYLE;
  }
  if (item.category === "settings_admin" || SLATE_SETTINGS_ITEM_IDS.has(item.id)) {
    return SLATE_QUICK_MENU_TONE_STYLE;
  }
  return PRIMARY_QUICK_MENU_TONE_STYLE;
}

export interface QuickMenuItemDef {
  id: QuickMenuItemId;
  label: string;
  shortLabel: string;
  description: string;
  badge: string;
  href: string;
  category: QuickMenuCategoryId;
  tone: QuickMenuTone;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export interface QuickMenuCategoryDef {
  id: QuickMenuCategoryId;
  label: string;
}

export interface QuickMenuLayoutOption {
  id: QuickMenuLayoutMode;
  label: string;
  description: string;
}

export interface QuickMenuPreset {
  id: "default" | "parent" | "scorer" | "guide";
  label: string;
  description: string;
  itemIds: readonly QuickMenuItemId[];
}

export interface QuickMenuConfig {
  itemIds: QuickMenuItemId[];
  layout: QuickMenuLayoutMode;
}

export const QUICK_MENU_CATEGORIES: readonly QuickMenuCategoryDef[] = [
  { id: "schedule_match", label: "予定・試合" },
  { id: "player_docs", label: "選手・資料" },
  { id: "settings_admin", label: "設定・管理" },
];

export const QUICK_MENU_LAYOUT_OPTIONS: readonly QuickMenuLayoutOption[] = [
  { id: "standard", label: "標準カード", description: "2列・説明付き" },
  { id: "slim", label: "スリム", description: "2列・省スペース" },
  { id: "compact", label: "コンパクト", description: "3列・アイコン" },
];

export const QUICK_MENU_CATALOG: readonly QuickMenuItemDef[] = [
  // 🗓️ 予定・試合（予定・送迎 ➔ 試合・記録）
  {
    id: "schedule",
    label: "活動予定",
    shortLabel: "活動予定",
    description: "練習・試合スケジュール・当番",
    badge: "予定",
    href: "/liff/schedule",
    category: "schedule_match",
    tone: "teal",
    icon: Calendar,
  },
  {
    id: "board",
    label: "出欠一覧表",
    shortLabel: "出欠一覧",
    description: "全員の出欠・当番集計ボード",
    badge: "出欠",
    href: "/liff/schedule/board",
    category: "schedule_match",
    tone: "teal",
    icon: ClipboardCheck,
  },
  {
    id: "carpool",
    label: "配車表",
    shortLabel: "配車表",
    description: "号車割り・集合時間・隊列マップ",
    badge: "送迎",
    href: "/liff/carpool",
    category: "schedule_match",
    tone: "teal",
    icon: Car,
  },
  {
    id: "grounds",
    label: "球場・施設マップ",
    shortLabel: "球場マップ",
    description: "アクセス・駐車場・スパイク規定",
    badge: "球場",
    href: "/liff/grounds",
    category: "schedule_match",
    tone: "teal",
    icon: MapPin,
  },
  {
    id: "matches",
    label: "試合・スコア",
    shortLabel: "試合・スコア",
    description: "試合予定・結果・スコア・動画",
    badge: "試合",
    href: "/liff/matches",
    category: "schedule_match",
    tone: "primary",
    icon: Trophy,
  },
  {
    id: "lineup",
    label: "スタメン・ベンチ編成",
    shortLabel: "スタメン編成",
    description: "打順・守備位置・ベンチ入り設定",
    badge: "編成",
    href: "/liff/matches/lineup",
    category: "schedule_match",
    tone: "primary",
    icon: Users,
  },
  {
    id: "news_generator",
    label: "LINE試合速報",
    shortLabel: "LINE速報",
    description: "打席ごとの速報テキスト作成",
    badge: "速報",
    href: "/liff/tools/news-generator",
    category: "schedule_match",
    tone: "primary",
    icon: Megaphone,
  },
  {
    id: "scorebook_import",
    label: "スコアAI取込",
    shortLabel: "スコア取込",
    description: "紙スコア撮影・AIデータ化",
    badge: "AI取込",
    href: "/liff/tools/scorebook-import",
    category: "schedule_match",
    tone: "primary",
    icon: ScanLine,
  },

  // 📖 選手・資料（選手・成績・写真 ➔ ルール・資料）
  {
    id: "players",
    label: "選手名鑑",
    shortLabel: "選手名鑑",
    description: "背番号・プロフィール・選手紹介",
    badge: "名鑑",
    href: "/liff/players",
    category: "player_docs",
    tone: "primary",
    icon: IdCard,
  },
  {
    id: "stats",
    label: "チーム成績",
    shortLabel: "チーム成績",
    description: "勝敗・得失点・個人ランキング",
    badge: "成績",
    href: "/liff/stats",
    category: "player_docs",
    tone: "primary",
    icon: BarChart3,
  },
  {
    id: "player_growth",
    label: "個人成長レポート",
    shortLabel: "個人成長",
    description: "打撃・投球・守備の推移グラフ",
    badge: "成長",
    href: "/liff/players/growth",
    category: "player_docs",
    tone: "primary",
    icon: TrendingUp,
  },
  {
    id: "gallery",
    label: "写真アルバム",
    shortLabel: "写真アルバム",
    description: "試合写真の共有・一括保存",
    badge: "写真",
    href: "/liff/gallery",
    category: "player_docs",
    tone: "primary",
    icon: Camera,
  },
  {
    id: "cheer_songs",
    label: "応援歌・コール",
    shortLabel: "応援歌",
    description: "選手名入り歌詞・応援コール",
    badge: "応援",
    href: "/liff/tools/cheer-songs",
    category: "player_docs",
    tone: "primary",
    icon: Music,
  },
  {
    id: "rules",
    label: "チームルール・心得",
    shortLabel: "チームルール",
    description: "活動ルール・当番・配車の決まり",
    badge: "ルール",
    href: "/liff/rules",
    category: "player_docs",
    tone: "amber",
    icon: AlertTriangle,
  },
  {
    id: "faq",
    label: "よくある質問",
    shortLabel: "よくある質問",
    description: "雨天判断・服装・当番のQ&A",
    badge: "Q&A",
    href: "/liff/faq",
    category: "player_docs",
    tone: "amber",
    icon: HelpCircle,
  },
  {
    id: "documents",
    label: "配布資料・書類",
    shortLabel: "配布資料",
    description: "規約・マニュアル・各種様式",
    badge: "資料",
    href: "/liff/documents",
    category: "player_docs",
    tone: "amber",
    icon: FileText,
  },
  {
    id: "links",
    label: "関連リンク集",
    shortLabel: "関連リンク",
    description: "連盟公式・大会速報・SNS",
    badge: "リンク",
    href: "/liff/links",
    category: "player_docs",
    tone: "amber",
    icon: Link2,
  },

  // ⚙️ 設定・管理（個人設定 ➔ 運用・規定 ➔ チーム管理）
  {
    id: "profile",
    label: "マイプロフィール",
    shortLabel: "プロフィール",
    description: "表示名・お子様紐付け・マイカー",
    badge: "個人",
    href: "/liff/profile",
    category: "settings_admin",
    tone: "sky",
    icon: UserCircle,
  },
  {
    id: "app_settings",
    label: "画面・メニュー設定",
    shortLabel: "画面設定",
    description: "ホーム・下部ナビ・外観カスタム",
    badge: "個人",
    href: "/liff/settings",
    category: "settings_admin",
    tone: "sky",
    icon: Settings,
  },
  {
    id: "team_settings",
    label: "チーム表示・予定設定",
    shortLabel: "表示・予定",
    description: "ロゴ・背景・練習試合呼称・標準時間",
    badge: "運用規定",
    href: "/liff/settings/team",
    category: "settings_admin",
    tone: "sky",
    icon: SlidersHorizontal,
  },
  {
    id: "score_settings",
    label: "スコア・試合規定",
    shortLabel: "スコア規定",
    description: "規定回数・スコア記号・早見表",
    badge: "運用規定",
    href: "/liff/settings/score",
    category: "settings_admin",
    tone: "sky",
    icon: BookOpen,
  },
  {
    id: "admin",
    label: "チーム管理",
    shortLabel: "チーム管理",
    description: "参加承認・編成・権限・車両マスタ",
    badge: "管理者専用",
    href: "/liff/admin",
    category: "settings_admin",
    tone: "sky",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

export const DEFAULT_QUICK_MENU_IDS: readonly QuickMenuItemId[] = [
  "schedule",
  "board",
  "carpool",
  "matches",
  "players",
  "gallery",
];

export const DEFAULT_QUICK_MENU_LAYOUT: QuickMenuLayoutMode = "standard";

export const QUICK_MENU_PRESETS: readonly QuickMenuPreset[] = [
  {
    id: "default",
    label: "標準バランス",
    description: "予定・出欠・配車・試合・名鑑・写真",
    itemIds: DEFAULT_QUICK_MENU_IDS,
  },
  {
    id: "parent",
    label: "保護者・送迎",
    description: "予定・出欠・配車・球場・成長・写真",
    itemIds: ["schedule", "board", "carpool", "grounds", "player_growth", "gallery"],
  },
  {
    id: "scorer",
    label: "監督・スコアラー",
    description: "試合・編成・LINE速報・AI取込・成績・出欠",
    itemIds: ["matches", "lineup", "news_generator", "scorebook_import", "stats", "board"],
  },
  {
    id: "guide",
    label: "入団案内・資料",
    description: "予定・配車・ルール・Q&A・資料・リンク",
    itemIds: ["schedule", "carpool", "rules", "faq", "documents", "links"],
  },
];

export const LIFF_QUICK_MENU_STORAGE_KEY = "iscore-liff-quick-menu-v1";
export const LIFF_QUICK_MENU_CHANGE_EVENT = "iscore-liff-quick-menu-change";

const LEGACY_ITEM_ID_MIGRATIONS: Readonly<Record<string, QuickMenuItemId>> = {
  carpool_generator: "carpool",
  tools_index: "scorebook_import",
};

const VALID_ITEM_ID_SET: ReadonlySet<string> = new Set(
  QUICK_MENU_CATALOG.map((item) => item.id),
);

const VALID_LAYOUT_SET: ReadonlySet<string> = new Set(
  QUICK_MENU_LAYOUT_OPTIONS.map((opt) => opt.id),
);

const CATALOG_MAP: ReadonlyMap<QuickMenuItemId, QuickMenuItemDef> = new Map(
  QUICK_MENU_CATALOG.map((item) => [item.id, item]),
);

export function normalizeQuickMenuItemId(raw: unknown): QuickMenuItemId | null {
  if (typeof raw !== "string") return null;
  const migrated = LEGACY_ITEM_ID_MIGRATIONS[raw] ?? raw;
  return VALID_ITEM_ID_SET.has(migrated) ? (migrated as QuickMenuItemId) : null;
}

export function getQuickMenuItemById(id: QuickMenuItemId): QuickMenuItemDef | undefined {
  return CATALOG_MAP.get(id);
}

export function resolveQuickMenuItems(itemIds: readonly QuickMenuItemId[]): QuickMenuItemDef[] {
  const result: QuickMenuItemDef[] = [];
  for (const id of itemIds) {
    const found = CATALOG_MAP.get(id);
    if (found) {
      result.push(found);
    }
  }
  return result;
}

export function getDefaultQuickMenuConfig(): QuickMenuConfig {
  return {
    itemIds: [...DEFAULT_QUICK_MENU_IDS],
    layout: DEFAULT_QUICK_MENU_LAYOUT,
  };
}

interface StoredQuickMenuPayload {
  itemIds?: unknown;
  layout?: unknown;
}

export function getSavedQuickMenuConfig(): QuickMenuConfig {
  if (typeof window === "undefined") {
    return getDefaultQuickMenuConfig();
  }

  try {
    const raw = localStorage.getItem(LIFF_QUICK_MENU_STORAGE_KEY);
    if (!raw) {
      return getDefaultQuickMenuConfig();
    }

    const parsed = JSON.parse(raw) as StoredQuickMenuPayload;

    const layout: QuickMenuLayoutMode =
      typeof parsed.layout === "string" && VALID_LAYOUT_SET.has(parsed.layout)
        ? (parsed.layout as QuickMenuLayoutMode)
        : DEFAULT_QUICK_MENU_LAYOUT;

    if (!Array.isArray(parsed.itemIds)) {
      return {
        itemIds: [...DEFAULT_QUICK_MENU_IDS],
        layout,
      };
    }

    const deduplicated: QuickMenuItemId[] = [];
    const seen = new Set<QuickMenuItemId>();
    for (const candidate of parsed.itemIds) {
      const typedId = normalizeQuickMenuItemId(candidate);
      if (typedId && !seen.has(typedId)) {
        seen.add(typedId);
        deduplicated.push(typedId);
      }
    }

    return {
      itemIds: deduplicated,
      layout,
    };
  } catch {
    return getDefaultQuickMenuConfig();
  }
}

export function saveQuickMenuConfig(config: QuickMenuConfig): void {
  if (typeof window === "undefined") return;
  const deduplicated: QuickMenuItemId[] = [];
  const seen = new Set<QuickMenuItemId>();
  for (const id of config.itemIds) {
    const typedId = normalizeQuickMenuItemId(id);
    if (typedId && !seen.has(typedId)) {
      seen.add(typedId);
      deduplicated.push(typedId);
    }
  }
  const normalized: QuickMenuConfig = {
    itemIds: deduplicated,
    layout: VALID_LAYOUT_SET.has(config.layout) ? config.layout : DEFAULT_QUICK_MENU_LAYOUT,
  };
  localStorage.setItem(LIFF_QUICK_MENU_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(LIFF_QUICK_MENU_CHANGE_EVENT));
}

export function resetQuickMenuConfig(): QuickMenuConfig {
  const defaults = getDefaultQuickMenuConfig();
  if (typeof window !== "undefined") {
    localStorage.removeItem(LIFF_QUICK_MENU_STORAGE_KEY);
    window.dispatchEvent(new Event(LIFF_QUICK_MENU_CHANGE_EVENT));
  }
  return defaults;
}

export function isDefaultQuickMenuConfig(config: QuickMenuConfig): boolean {
  if (config.layout !== DEFAULT_QUICK_MENU_LAYOUT) return false;
  if (config.itemIds.length !== DEFAULT_QUICK_MENU_IDS.length) return false;
  return config.itemIds.every((id, idx) => id === DEFAULT_QUICK_MENU_IDS[idx]);
}
