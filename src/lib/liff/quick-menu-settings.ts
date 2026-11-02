// filepath: src/lib/liff/quick-menu-settings.ts
import type React from "react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
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
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  UserCircle,
  Users,
  Video,
  Wand2,
  Wrench,
} from "lucide-react";

export type QuickMenuItemId =
  | "rules"
  | "faq"
  | "documents"
  | "links"
  | "schedule"
  | "carpool"
  | "board"
  | "grounds"
  | "matches"
  | "lineup"
  | "stats"
  | "players"
  | "player_growth"
  | "scorebook_import"
  | "tools_index"
  | "news_generator"
  | "cheer_songs"
  | "carpool_generator"
  | "profile"
  | "score_settings"
  | "team_settings"
  | "admin";

export type QuickMenuLayoutMode = "standard" | "slim" | "compact";

export type QuickMenuCategoryId =
  | "match_team"
  | "schedule_access"
  | "docs"
  | "tools_settings";

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
}

const PRIMARY_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-primary/12 text-primary",
  badgeClass: "bg-primary/10 text-primary",
  hoverBorderClass: "hover:border-primary/40",
};

const TEAL_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  badgeClass: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  hoverBorderClass: "hover:border-teal-500/40",
};

const AMBER_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  hoverBorderClass: "hover:border-amber-500/40",
};

const SLATE_QUICK_MENU_TONE_STYLE: QuickMenuToneStyle = {
  iconBoxClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  hoverBorderClass: "hover:border-slate-500/40",
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

const SLATE_SETTINGS_ITEM_IDS: ReadonlySet<QuickMenuItemId> = new Set([
  "profile",
  "score_settings",
  "team_settings",
  "admin",
]);

export function getQuickMenuItemToneStyle(
  item: Pick<QuickMenuItemDef, "id" | "category">,
): QuickMenuToneStyle {
  if (item.category === "match_team") {
    return PRIMARY_QUICK_MENU_TONE_STYLE;
  }
  if (item.category === "schedule_access" || item.id === "carpool_generator") {
    return TEAL_QUICK_MENU_TONE_STYLE;
  }
  if (item.category === "docs") {
    return AMBER_QUICK_MENU_TONE_STYLE;
  }
  if (SLATE_SETTINGS_ITEM_IDS.has(item.id)) {
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
  id: "default" | "parent" | "scorer";
  label: string;
  description: string;
  itemIds: readonly QuickMenuItemId[];
}

export interface QuickMenuConfig {
  itemIds: QuickMenuItemId[];
  layout: QuickMenuLayoutMode;
}

export const QUICK_MENU_CATEGORIES: readonly QuickMenuCategoryDef[] = [
  { id: "match_team", label: "試合・選手" },
  { id: "schedule_access", label: "予定・送迎" },
  { id: "docs", label: "情報・ガイド" },
  { id: "tools_settings", label: "ツール・管理" },
];

export const QUICK_MENU_LAYOUT_OPTIONS: readonly QuickMenuLayoutOption[] = [
  { id: "standard", label: "標準カード", description: "2列・説明付き" },
  { id: "slim", label: "スリム", description: "2列・省スペース" },
  { id: "compact", label: "コンパクト", description: "3列・アイコン" },
];

export const QUICK_MENU_CATALOG: readonly QuickMenuItemDef[] = [
  // 🏆 試合・選手
  {
    id: "matches",
    label: "試合情報",
    shortLabel: "試合情報",
    description: "試合動画・スコア・成績明細",
    badge: "試合",
    href: "/liff/matches",
    category: "match_team",
    tone: "red",
    icon: Video,
  },
  {
    id: "lineup",
    label: "スタメン登録",
    shortLabel: "スタメン",
    description: "打順・守備・ベンチ編成",
    badge: "編成",
    href: "/liff/matches/lineup",
    category: "match_team",
    tone: "primary",
    icon: Users,
  },
  {
    id: "stats",
    label: "チーム成績",
    shortLabel: "チーム成績",
    description: "勝敗・得失点・個人ランキング",
    badge: "成績",
    href: "/liff/stats",
    category: "match_team",
    tone: "amber",
    icon: Trophy,
  },
  {
    id: "players",
    label: "選手名鑑",
    shortLabel: "選手名鑑",
    description: "背番号・実戦守備・選手紹介",
    badge: "名鑑",
    href: "/liff/players",
    category: "match_team",
    tone: "cyan",
    icon: IdCard,
  },
  {
    id: "player_growth",
    label: "個人成長レポート",
    shortLabel: "個人成長",
    description: "打撃・投球・守備の成長推移",
    badge: "成長",
    href: "/liff/players/growth",
    category: "match_team",
    tone: "emerald",
    icon: TrendingUp,
  },

  // 📅 予定・送迎
  {
    id: "schedule",
    label: "予定 & 出欠",
    shortLabel: "予定・出欠",
    description: "当番・出欠の確認",
    badge: "予定",
    href: "/liff/schedule",
    category: "schedule_access",
    tone: "amber",
    icon: Calendar,
  },
  {
    id: "board",
    label: "出欠一覧表",
    shortLabel: "出欠一覧",
    description: "全員の出欠・当番集計ボード",
    badge: "集計",
    href: "/liff/schedule/board",
    category: "schedule_access",
    tone: "indigo",
    icon: ClipboardCheck,
  },
  {
    id: "carpool",
    label: "配車表",
    shortLabel: "配車表",
    description: "乗車割り・集合場所",
    badge: "送迎",
    href: "/liff/carpool",
    category: "schedule_access",
    tone: "blue",
    icon: Car,
  },
  {
    id: "grounds",
    label: "球場 & 施設",
    shortLabel: "球場マップ",
    description: "アクセス・駐車場案内",
    badge: "球場",
    href: "/liff/grounds",
    category: "schedule_access",
    tone: "emerald",
    icon: MapPin,
  },

  // 📖 情報・ガイド（初期表示のチーム情報 & ガイド項目）
  {
    id: "rules",
    label: "ルール & 注意事項",
    shortLabel: "ルール・規程",
    description: "試合・配車・活動心得",
    badge: "規程",
    href: "/liff/rules",
    category: "docs",
    tone: "amber",
    icon: AlertTriangle,
  },
  {
    id: "faq",
    label: "よくある質問",
    shortLabel: "よくある質問",
    description: "雨天連絡・当番の疑問",
    badge: "FAQ",
    href: "/liff/faq",
    category: "docs",
    tone: "teal",
    icon: HelpCircle,
  },
  {
    id: "documents",
    label: "資料ダウンロード",
    shortLabel: "資料・書類",
    description: "規約・配車マニュアル",
    badge: "書類",
    href: "/liff/documents",
    category: "docs",
    tone: "purple",
    icon: FileText,
  },
  {
    id: "links",
    label: "関連リンク集",
    shortLabel: "関連リンク",
    description: "連盟・大会速報・SNS",
    badge: "リンク",
    href: "/liff/links",
    category: "docs",
    tone: "sky",
    icon: Link2,
  },

  // 🛠️ ツール・管理
  {
    id: "scorebook_import",
    label: "スコアブック取込",
    shortLabel: "スコア取込",
    description: "手書きスコアAIデータ化",
    badge: "AI取込",
    href: "/liff/tools/scorebook-import",
    category: "tools_settings",
    tone: "indigo",
    icon: ScanLine,
  },
  {
    id: "tools_index",
    label: "便利ツール一覧",
    shortLabel: "便利ツール",
    description: "チーム運営サポートツール集",
    badge: "ツール",
    href: "/liff/tools",
    category: "tools_settings",
    tone: "primary",
    icon: Wrench,
  },
  {
    id: "news_generator",
    label: "試合速報作成",
    shortLabel: "試合速報",
    description: "LINE速報テキストを簡単作成",
    badge: "速報",
    href: "/liff/tools/news-generator",
    category: "tools_settings",
    tone: "rose",
    icon: Megaphone,
  },
  {
    id: "cheer_songs",
    label: "応援歌あんちょこ",
    shortLabel: "応援歌",
    description: "選手名入り歌詞・コール",
    badge: "応援",
    href: "/liff/tools/cheer-songs",
    category: "tools_settings",
    tone: "orange",
    icon: Music,
  },
  {
    id: "carpool_generator",
    label: "配車ジェネレータ",
    shortLabel: "配車生成",
    description: "乗車割り作成サポート",
    badge: "配車支援",
    href: "/liff/tools/carpool-generator",
    category: "tools_settings",
    tone: "emerald",
    icon: Wand2,
  },
  {
    id: "profile",
    label: "プロフィール設定",
    shortLabel: "プロフィール",
    description: "表示名・お子様・マイカー登録",
    badge: "個人",
    href: "/liff/profile",
    category: "tools_settings",
    tone: "sky",
    icon: UserCircle,
  },
  {
    id: "score_settings",
    label: "スコア設定",
    shortLabel: "スコア設定",
    description: "試合規定・記号早見表の登録",
    badge: "規定",
    href: "/liff/settings/score",
    category: "tools_settings",
    tone: "indigo",
    icon: BookOpen,
  },
  {
    id: "team_settings",
    label: "チーム設定",
    shortLabel: "チーム設定",
    description: "基本情報・活動班・球場マスタ",
    badge: "管理",
    href: "/liff/settings/team",
    category: "tools_settings",
    tone: "primary",
    icon: SlidersHorizontal,
  },
  {
    id: "admin",
    label: "IT管理コンソール",
    shortLabel: "IT管理",
    description: "参加承認・メンバー管理・招待",
    badge: "IT管理",
    href: "/liff/admin",
    category: "tools_settings",
    tone: "emerald",
    icon: ShieldCheck,
  },
];

export const DEFAULT_QUICK_MENU_IDS: readonly QuickMenuItemId[] = [
  "rules",
  "faq",
  "documents",
  "links",
  "schedule",
  "carpool",
];

export const DEFAULT_QUICK_MENU_LAYOUT: QuickMenuLayoutMode = "standard";

export const QUICK_MENU_PRESETS: readonly QuickMenuPreset[] = [
  {
    id: "default",
    label: "標準ガイド",
    description: "情報・予定・配車の基本6項目",
    itemIds: DEFAULT_QUICK_MENU_IDS,
  },
  {
    id: "parent",
    label: "保護者・送迎",
    description: "出欠・配車・球場・成長記録",
    itemIds: ["schedule", "board", "carpool", "grounds", "players", "player_growth"],
  },
  {
    id: "scorer",
    label: "監督・スコアラー",
    description: "試合・編成・AI取込・成績分析",
    itemIds: ["matches", "lineup", "scorebook_import", "stats", "player_growth", "board"],
  },
];

export const LIFF_QUICK_MENU_STORAGE_KEY = "iscore-liff-quick-menu-v1";
export const LIFF_QUICK_MENU_CHANGE_EVENT = "iscore-liff-quick-menu-change";

const VALID_ITEM_ID_SET: ReadonlySet<string> = new Set(
  QUICK_MENU_CATALOG.map((item) => item.id),
);

const VALID_LAYOUT_SET: ReadonlySet<string> = new Set(
  QUICK_MENU_LAYOUT_OPTIONS.map((opt) => opt.id),
);

const CATALOG_MAP: ReadonlyMap<QuickMenuItemId, QuickMenuItemDef> = new Map(
  QUICK_MENU_CATALOG.map((item) => [item.id, item]),
);

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
      if (typeof candidate === "string" && VALID_ITEM_ID_SET.has(candidate)) {
        const typedId = candidate as QuickMenuItemId;
        if (!seen.has(typedId)) {
          seen.add(typedId);
          deduplicated.push(typedId);
        }
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
    if (VALID_ITEM_ID_SET.has(id) && !seen.has(id)) {
      seen.add(id);
      deduplicated.push(id);
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

