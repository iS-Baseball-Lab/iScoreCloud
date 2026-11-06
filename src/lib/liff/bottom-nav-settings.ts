// filepath: src/lib/liff/bottom-nav-settings.ts
import {
  QUICK_MENU_CATALOG,
  getQuickMenuItemById,
  type QuickMenuItemDef,
  type QuickMenuItemId,
} from "./quick-menu-settings";

export type BottomNavSlotKey = "left" | "center" | "right";
export type BottomNavStyleMode = "arch" | "flat";

export interface BottomNavConfig {
  leftId: QuickMenuItemId;
  centerId: QuickMenuItemId;
  rightId: QuickMenuItemId;
  style: BottomNavStyleMode;
}

export interface BottomNavStyleOption {
  id: BottomNavStyleMode;
  label: string;
  description: string;
}

export interface BottomNavPreset {
  id: "default" | "parent" | "live_reporter" | "scorer";
  label: string;
  description: string;
  leftId: QuickMenuItemId;
  centerId: QuickMenuItemId;
  rightId: QuickMenuItemId;
}

export const DEFAULT_BOTTOM_NAV_CONFIG: Readonly<BottomNavConfig> = {
  leftId: "schedule",
  centerId: "matches",
  rightId: "board",
  style: "arch",
};

export const BOTTOM_NAV_STYLE_OPTIONS: readonly BottomNavStyleOption[] = [
  {
    id: "arch",
    label: "中央丸ボタン（標準）",
    description: "中央の主要機能を大きく強調",
  },
  {
    id: "flat",
    label: "フラットバー",
    description: "突起なしのすっきり5分割",
  },
];

export const BOTTOM_NAV_PRESETS: readonly BottomNavPreset[] = [
  {
    id: "default",
    label: "標準バランス",
    description: "活動予定・試合情報・出欠一覧表",
    leftId: "schedule",
    centerId: "matches",
    rightId: "board",
  },
  {
    id: "parent",
    label: "保護者・送迎",
    description: "活動予定・配車表・球場マップ",
    leftId: "schedule",
    centerId: "carpool",
    rightId: "grounds",
  },
  {
    id: "live_reporter",
    label: "当日・LINE速報",
    description: "スタメン・試合速報・試合情報",
    leftId: "lineup",
    centerId: "news_generator",
    rightId: "matches",
  },
  {
    id: "scorer",
    label: "監督・スコアラー",
    description: "スタメン・スコア取込・チーム成績",
    leftId: "lineup",
    centerId: "scorebook_import",
    rightId: "stats",
  },
];

/**
 * 5分割ボトムナビの狭い横幅でも1行で美しく収まる専用短縮ラベル
 */
export const BOTTOM_NAV_SHORT_LABELS: Readonly<Record<QuickMenuItemId, string>> = {
  matches: "試合情報",
  lineup: "スタメン",
  stats: "チーム成績",
  players: "選手名鑑",
  player_growth: "個人成長",
  schedule: "活動予定",
  board: "出欠一覧表",
  carpool: "配車表",
  grounds: "球場・施設",
  rules: "ルール",
  faq: "よくある質問",
  documents: "資料・書類",
  links: "関連リンク",
  scorebook_import: "スコア取込",
  tools_index: "便利ツール",
  news_generator: "試合速報",
  cheer_songs: "応援歌",
  carpool_generator: "配車生成",
  profile: "プロフィール",
  score_settings: "スコア設定",
  team_settings: "チーム設定",
  admin: "IT管理",
};

export const LIFF_BOTTOM_NAV_STORAGE_KEY = "iscore-liff-bottom-nav-v1";
export const LIFF_BOTTOM_NAV_CHANGE_EVENT = "iscore-liff-bottom-nav-change";

const VALID_ITEM_ID_SET: ReadonlySet<string> = new Set(
  QUICK_MENU_CATALOG.map((item) => item.id)
);

const VALID_STYLE_SET: ReadonlySet<string> = new Set(
  BOTTOM_NAV_STYLE_OPTIONS.map((opt) => opt.id)
);

export function getBottomNavLabel(itemId: QuickMenuItemId): string {
  return (
    BOTTOM_NAV_SHORT_LABELS[itemId] ||
    getQuickMenuItemById(itemId)?.shortLabel ||
    "メニュー"
  );
}

export function resolveBottomNavSlotItem(
  itemId: QuickMenuItemId,
  fallbackId: QuickMenuItemId
): QuickMenuItemDef {
  return (
    getQuickMenuItemById(itemId) ||
    getQuickMenuItemById(fallbackId) ||
    QUICK_MENU_CATALOG[0]
  );
}

export function getDefaultBottomNavConfig(): BottomNavConfig {
  return { ...DEFAULT_BOTTOM_NAV_CONFIG };
}

function sanitizeDistinctTriple(
  leftRaw: unknown,
  centerRaw: unknown,
  rightRaw: unknown
): [QuickMenuItemId, QuickMenuItemId, QuickMenuItemId] {
  const fallbackPool: QuickMenuItemId[] = [
    DEFAULT_BOTTOM_NAV_CONFIG.leftId,
    DEFAULT_BOTTOM_NAV_CONFIG.centerId,
    DEFAULT_BOTTOM_NAV_CONFIG.rightId,
    "carpool",
    "lineup",
    "stats",
  ];

  const pickValid = (val: unknown, def: QuickMenuItemId): QuickMenuItemId =>
    typeof val === "string" && VALID_ITEM_ID_SET.has(val)
      ? (val as QuickMenuItemId)
      : def;

  const chosen: QuickMenuItemId[] = [];
  const candidates: QuickMenuItemId[] = [
    pickValid(leftRaw, DEFAULT_BOTTOM_NAV_CONFIG.leftId),
    pickValid(centerRaw, DEFAULT_BOTTOM_NAV_CONFIG.centerId),
    pickValid(rightRaw, DEFAULT_BOTTOM_NAV_CONFIG.rightId),
  ];

  for (const c of candidates) {
    if (!chosen.includes(c)) {
      chosen.push(c);
    } else {
      const replacement = fallbackPool.find(
        (fb) => !chosen.includes(fb) && !candidates.includes(fb)
      ) || fallbackPool.find((fb) => !chosen.includes(fb));
      if (replacement) chosen.push(replacement);
    }
  }

  return [
    chosen[0] || DEFAULT_BOTTOM_NAV_CONFIG.leftId,
    chosen[1] || DEFAULT_BOTTOM_NAV_CONFIG.centerId,
    chosen[2] || DEFAULT_BOTTOM_NAV_CONFIG.rightId,
  ];
}

interface StoredBottomNavPayload {
  leftId?: unknown;
  centerId?: unknown;
  rightId?: unknown;
  style?: unknown;
}

export function getSavedBottomNavConfig(): BottomNavConfig {
  if (typeof window === "undefined") {
    return getDefaultBottomNavConfig();
  }

  try {
    const raw = localStorage.getItem(LIFF_BOTTOM_NAV_STORAGE_KEY);
    if (!raw) {
      return getDefaultBottomNavConfig();
    }

    const parsed = JSON.parse(raw) as StoredBottomNavPayload;
    const [leftId, centerId, rightId] = sanitizeDistinctTriple(
      parsed.leftId,
      parsed.centerId,
      parsed.rightId
    );
    const style: BottomNavStyleMode =
      typeof parsed.style === "string" && VALID_STYLE_SET.has(parsed.style)
        ? (parsed.style as BottomNavStyleMode)
        : DEFAULT_BOTTOM_NAV_CONFIG.style;

    return { leftId, centerId, rightId, style };
  } catch {
    return getDefaultBottomNavConfig();
  }
}

export function saveBottomNavConfig(config: BottomNavConfig): BottomNavConfig {
  const [leftId, centerId, rightId] = sanitizeDistinctTriple(
    config.leftId,
    config.centerId,
    config.rightId
  );
  const style: BottomNavStyleMode = VALID_STYLE_SET.has(config.style)
    ? config.style
    : DEFAULT_BOTTOM_NAV_CONFIG.style;

  const normalized: BottomNavConfig = {
    leftId,
    centerId,
    rightId,
    style,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(
      LIFF_BOTTOM_NAV_STORAGE_KEY,
      JSON.stringify(normalized)
    );
    window.dispatchEvent(new Event(LIFF_BOTTOM_NAV_CHANGE_EVENT));
  }
  return normalized;
}

export function resetBottomNavConfig(): BottomNavConfig {
  const defaults = getDefaultBottomNavConfig();
  if (typeof window !== "undefined") {
    localStorage.removeItem(LIFF_BOTTOM_NAV_STORAGE_KEY);
    window.dispatchEvent(new Event(LIFF_BOTTOM_NAV_CHANGE_EVENT));
  }
  return defaults;
}

export function isDefaultBottomNavConfig(config: BottomNavConfig): boolean {
  return (
    config.leftId === DEFAULT_BOTTOM_NAV_CONFIG.leftId &&
    config.centerId === DEFAULT_BOTTOM_NAV_CONFIG.centerId &&
    config.rightId === DEFAULT_BOTTOM_NAV_CONFIG.rightId &&
    config.style === DEFAULT_BOTTOM_NAV_CONFIG.style
  );
}

/**
 * 親子関係のあるルート（/liff/matches と /liff/matches/lineup 等）でも
 * 二重ハイライトを起こさず正確にアクティブ状態を判定する
 */
export function isBottomNavItemActive(
  itemId: QuickMenuItemId,
  pathname: string | null
): boolean {
  if (!pathname) return false;

  switch (itemId) {
    case "schedule":
      return (
        pathname === "/liff/schedule" ||
        pathname.startsWith("/liff/schedule/admin")
      );
    case "board":
      return pathname.startsWith("/liff/schedule/board");
    case "matches":
      return (
        pathname === "/liff/matches" ||
        (pathname.startsWith("/liff/matches/") &&
          !pathname.startsWith("/liff/matches/lineup"))
      );
    case "lineup":
      return pathname.startsWith("/liff/matches/lineup");
    case "players":
      return (
        pathname === "/liff/players" ||
        (pathname.startsWith("/liff/players/") &&
          !pathname.startsWith("/liff/players/growth"))
      );
    case "player_growth":
      return pathname.startsWith("/liff/players/growth");
    case "tools_index":
      return pathname === "/liff/tools";
    case "score_settings":
      return pathname.startsWith("/liff/settings/score");
    case "team_settings":
      return pathname.startsWith("/liff/settings/team");
    default: {
      const def = getQuickMenuItemById(itemId);
      if (!def) return false;
      return pathname === def.href || pathname.startsWith(`${def.href}/`);
    }
  }
}

