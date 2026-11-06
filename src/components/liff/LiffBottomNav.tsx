// filepath: src/components/liff/LiffBottomNav.tsx
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLiff } from "./LiffProvider";
import { handleLiffRootLinkClick } from "@/lib/liff/navigation";
import { warmupLiffEndpointForHref } from "@/lib/liff/api-cache";
import {
  DEFAULT_BOTTOM_NAV_CONFIG,
  LIFF_BOTTOM_NAV_CHANGE_EVENT,
  LIFF_BOTTOM_NAV_STORAGE_KEY,
  getBottomNavLabel,
  getDefaultBottomNavConfig,
  getSavedBottomNavConfig,
  isBottomNavItemActive,
  resolveBottomNavSlotItem,
  type BottomNavConfig,
} from "@/lib/liff/bottom-nav-settings";
import { 
  Home, 
  Trophy, 
  Video, 
  MapPin, 
  Menu, 
  X,
  Car,
  FileText,
  HelpCircle,
  AlertTriangle,
  Calendar,
  LayoutGrid,
  Settings,
  ChevronRight,
  ShieldCheck,
  Link2,
  BookOpen,
  ClipboardCheck,
  Users,
  UserCircle,
  SlidersHorizontal,
  IdCard,
  Wrench,
  ScanLine,
  Megaphone,
  Music,
  Wand2,
} from "lucide-react";

type MenuCategory = "schedule" | "manual" | "settings";
type MenuSubGroup =
  | "match_team"
  | "schedule_access"
  | "docs"
  | "tools"
  | "settings_general"
  | "settings_admin";

interface MenuItem {
  title: string;
  subtitle: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  hoverBorderClass?: string;
  category: MenuCategory;
  subGroup?: MenuSubGroup;
  fullWidth?: boolean;
}

const MENU_TABS = [
  { id: "schedule" as const, label: "試合・予定", icon: Calendar },
  { id: "manual" as const, label: "資料・ツール", icon: BookOpen },
  { id: "settings" as const, label: "設定・管理", icon: Settings },
];

const CATEGORY_SECTIONS: Record<
  MenuCategory,
  Array<{
    key: MenuSubGroup;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconTextClass: string;
  }>
> = {
  schedule: [
    { key: "match_team", label: "試合・チーム", icon: Trophy, iconTextClass: "text-primary" },
    { key: "schedule_access", label: "予定・配車・施設", icon: Calendar, iconTextClass: "text-teal-600 dark:text-teal-400" },
  ],
  manual: [
    { key: "docs", label: "資料・マニュアル", icon: BookOpen, iconTextClass: "text-amber-600 dark:text-amber-400" },
    { key: "tools", label: "便利ツール", icon: Wrench, iconTextClass: "text-primary" },
  ],
  settings: [
    { key: "settings_general", label: "設定", icon: Settings, iconTextClass: "text-slate-600 dark:text-slate-400" },
    { key: "settings_admin", label: "管理", icon: ShieldCheck, iconTextClass: "text-slate-600 dark:text-slate-400" },
  ],
};

const MENU_ITEMS: MenuItem[] = [
  // 🏆 試合・予定（試合・チーム）
  {
    title: "試合情報",
    subtitle: "試合動画 & スコア",
    href: "/liff/matches",
    icon: Video,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule" as const,
    subGroup: "match_team",
  },
  {
    title: "スタメン・出欠登録",
    subtitle: "スタメン・ベンチ設定",
    href: "/liff/matches/lineup",
    icon: Users,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule" as const,
    subGroup: "match_team",
  },
  {
    title: "チーム成績",
    subtitle: "勝敗・得失点・個人成績",
    href: "/liff/stats",
    icon: Trophy,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule" as const,
    subGroup: "match_team",
  },
  {
    title: "選手名鑑",
    subtitle: "背番号・守備・選手紹介",
    href: "/liff/players",
    icon: IdCard,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule" as const,
    subGroup: "match_team",
  },

  // 📅 試合・予定（予定・配車・施設）
  {
    title: "活動予定",
    subtitle: "当番・イベントスケジュール",
    href: "/liff/schedule",
    icon: Calendar,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule" as const,
    subGroup: "schedule_access",
  },
  {
    title: "出欠一覧表",
    subtitle: "当番集計・出欠確認",
    href: "/liff/schedule/board",
    icon: ClipboardCheck,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule" as const,
    subGroup: "schedule_access",
  },
  {
    title: "配車表",
    subtitle: "乗車割り・集合時間",
    href: "/liff/carpool",
    icon: Car,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule" as const,
    subGroup: "schedule_access",
  },
  {
    title: "球場 & 施設",
    subtitle: "アクセス・駐車場",
    href: "/liff/grounds",
    icon: MapPin,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule" as const,
    subGroup: "schedule_access",
  },

  // 📖 資料・ツール
  {
    title: "ルール & 注意事項",
    subtitle: "試合・配車・活動心得",
    href: "/liff/rules",
    icon: AlertTriangle,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "manual" as const,
    subGroup: "docs",
  },
  {
    title: "資料ダウンロード",
    subtitle: "規約・配車マニュアル",
    href: "/liff/documents",
    icon: FileText,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "manual" as const,
    subGroup: "docs",
  },
  {
    title: "よくある質問",
    subtitle: "雨天判断・Q&A",
    href: "/liff/faq",
    icon: HelpCircle,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "manual" as const,
    subGroup: "docs",
  },
  {
    title: "関連リンク集",
    subtitle: "連盟・大会速報・SNS",
    href: "/liff/links",
    icon: Link2,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "manual" as const,
    subGroup: "docs",
  },
  {
    title: "スコアブック取り込み",
    subtitle: "手書きスコア画像データ化",
    href: "/liff/tools/scorebook-import",
    icon: ScanLine,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "manual" as const,
    subGroup: "tools",
  },
  {
    title: "試合速報ジェネレータ",
    subtitle: "簡易入力で速報文を作成",
    href: "/liff/tools/news-generator",
    icon: Megaphone,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "manual" as const,
    subGroup: "tools",
  },
  {
    title: "応援歌あんちょこ",
    subtitle: "選手名入り歌詞・コール",
    href: "/liff/tools/cheer-songs",
    icon: Music,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "manual" as const,
    subGroup: "tools",
  },
  {
    title: "配車ジェネレータ",
    subtitle: "配車割り作成支援 (検討中)",
    href: "/liff/tools/carpool-generator",
    icon: Wand2,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "manual" as const,
    subGroup: "tools",
  },

  // ⚙️ 設定・管理（設定）
  {
    title: "プロフィール",
    subtitle: "表示名・お子様紐付け・マイカー",
    href: "/liff/profile",
    icon: UserCircle,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings" as const,
    subGroup: "settings_general",
  },
  {
    title: "アプリ設定",
    subtitle: "メニュー・ボトムナビ・カラー設定",
    href: "/liff/settings",
    icon: Settings,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings" as const,
    subGroup: "settings_general",
  },
  {
    title: "チーム設定",
    subtitle: "チーム情報・活動班・マスタ管理",
    href: "/liff/settings/team",
    icon: SlidersHorizontal,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings" as const,
    subGroup: "settings_general",
  },
  {
    title: "スコア設定",
    subtitle: "試合規定・記号早見表・AI読取",
    href: "/liff/settings/score",
    icon: BookOpen,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings" as const,
    subGroup: "settings_general",
  },

  // 🛡️ 設定・管理（管理）
  {
    title: "IT管理コンソール",
    subtitle: "参加承認・メンバー管理・招待",
    href: "/liff/admin",
    icon: ShieldCheck,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings" as const,
    subGroup: "settings_admin",
  },
];

let hydratedBottomNavConfig: BottomNavConfig | null = null;

export function LiffBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentTeam } = useLiff();
  const [isOtherMenuOpen, setIsOtherMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("schedule");
  const [navConfig, setNavConfig] = useState<BottomNavConfig>(
    () => hydratedBottomNavConfig ?? getDefaultBottomNavConfig()
  );

  const handlePointerWarmup = useCallback(
    (href: string) => {
      router.prefetch(href);
      warmupLiffEndpointForHref(href, currentTeam?.id);
    },
    [currentTeam?.id, router]
  );

  useEffect(() => {
    const syncNav = () => {
      const saved = getSavedBottomNavConfig();
      hydratedBottomNavConfig = saved;
      setNavConfig(saved);
    };
    syncNav();

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === LIFF_BOTTOM_NAV_STORAGE_KEY) {
        syncNav();
      }
    };

    window.addEventListener(LIFF_BOTTOM_NAV_CHANGE_EVENT, syncNav);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(LIFF_BOTTOM_NAV_CHANGE_EVENT, syncNav);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    setIsOtherMenuOpen(false);
    if (
      pathname?.startsWith("/liff/profile") ||
      pathname?.startsWith("/liff/settings") ||
      pathname?.startsWith("/liff/admin")
    ) {
      setSelectedCategory("settings");
    } else if (
      pathname?.startsWith("/liff/rules") ||
      pathname?.startsWith("/liff/documents") ||
      pathname?.startsWith("/liff/faq") ||
      pathname?.startsWith("/liff/links") ||
      pathname?.startsWith("/liff/tools")
    ) {
      setSelectedCategory("manual");
    } else {
      setSelectedCategory("schedule");
    }
  }, [pathname, currentTeam?.id]);

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  const leftSlotItem = useMemo(
    () =>
      resolveBottomNavSlotItem(
        navConfig.leftId,
        DEFAULT_BOTTOM_NAV_CONFIG.leftId
      ),
    [navConfig.leftId]
  );
  const centerSlotItem = useMemo(
    () =>
      resolveBottomNavSlotItem(
        navConfig.centerId,
        DEFAULT_BOTTOM_NAV_CONFIG.centerId
      ),
    [navConfig.centerId]
  );
  const rightSlotItem = useMemo(
    () =>
      resolveBottomNavSlotItem(
        navConfig.rightId,
        DEFAULT_BOTTOM_NAV_CONFIG.rightId
      ),
    [navConfig.rightId]
  );

  const LeftIcon = leftSlotItem.icon;
  const CenterIcon = centerSlotItem.icon;
  const RightIcon = rightSlotItem.icon;

  const leftLabel = getBottomNavLabel(leftSlotItem.id);
  const centerLabel = getBottomNavLabel(centerSlotItem.id);
  const rightLabel = getBottomNavLabel(rightSlotItem.id);

  const isHome = pathname === "/liff";
  const isLeftActive = isBottomNavItemActive(leftSlotItem.id, pathname);
  const isCenterActive = isBottomNavItemActive(centerSlotItem.id, pathname);
  const isRightActive = isBottomNavItemActive(rightSlotItem.id, pathname);
  const isOther =
    isOtherMenuOpen ||
    (!isHome && !isLeftActive && !isCenterActive && !isRightActive);
  const isArchStyle = navConfig.style === "arch";

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="w-full max-w-lg pointer-events-auto relative">
          {isArchStyle ? (
            /* 🌟 標準モード: 連続ベジェ曲線アーチ ＋ 中央プライマリー円形ボタン */
            <div className="relative w-full h-[68px] select-none">
              <svg
                viewBox="0 -26 375 94"
                preserveAspectRatio="none"
                className="absolute -top-[26px] inset-x-0 w-full h-[94px] overflow-visible filter drop-shadow-[0_-3px_8px_rgba(0,0,0,0.10)] pointer-events-none"
                fill="none"
              >
                <path
                  d="M 0,16 
                     L 126,16 
                     C 152,16 162,-14 187.5,-14 
                     C 213,-14 223,16 249,16 
                     L 375,16 
                     L 375,68 
                     L 0,68 Z"
                  className="fill-card"
                />
                <path
                  d="M 0,16 
                     L 126,16 
                     C 152,16 162,-14 187.5,-14 
                     C 213,-14 223,16 249,16 
                     L 375,16"
                  className="stroke-border"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>

              {/* 🌟 中央: カスタマイズ対応の円形メインボタン */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-20">
                <Link
                  href={centerSlotItem.href}
                  onPointerDown={() => handlePointerWarmup(centerSlotItem.href)}
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center px-1 shadow-lg active:scale-95 transition-all text-primary-foreground bg-primary shadow-primary/35 ${
                    isCenterActive && !isOtherMenuOpen
                      ? "ring-3 ring-primary/30 scale-105"
                      : "hover:brightness-110"
                  }`}
                  title={centerSlotItem.label}
                >
                  <CenterIcon className="w-6 h-6 -mb-0.5 shrink-0" />
                  <span className="text-[10px] font-black tracking-tighter leading-none mt-1 truncate max-w-[60px]">
                    {centerLabel}
                  </span>
                </Link>
              </div>

              {/* ナビゲーションメニューアイテム（5分割グリッド） */}
              <div className="relative z-10 grid grid-cols-5 h-full items-end pb-2 px-1">
                {/* ① 🏠 ホーム（固定） */}
                <Link
                  href="/liff"
                  onPointerDown={() => handlePointerWarmup("/liff")}
                  onClick={(e) =>
                    handleLiffRootLinkClick(e, router, pathname, () =>
                      setIsOtherMenuOpen(false)
                    )
                  }
                  className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 ${
                    isHome && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Home
                    className={`w-5 h-5 transition-transform ${
                      isHome && !isOtherMenuOpen ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-[10px] leading-none tracking-tight">
                    ホーム
                  </span>
                </Link>

                {/* ② 左カスタム枠 */}
                <Link
                  href={leftSlotItem.href}
                  onPointerDown={() => handlePointerWarmup(leftSlotItem.href)}
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 px-0.5 transition-all select-none active:scale-90 ${
                    isLeftActive && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <LeftIcon
                    className={`w-5 h-5 transition-transform ${
                      isLeftActive && !isOtherMenuOpen ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-[9.5px] leading-none tracking-tight truncate max-w-full">
                    {leftLabel}
                  </span>
                </Link>

                {/* ③ 中央プレースホルダー */}
                <div className="pointer-events-none" />

                {/* ④ 右カスタム枠 */}
                <Link
                  href={rightSlotItem.href}
                  onPointerDown={() => handlePointerWarmup(rightSlotItem.href)}
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 px-0.5 transition-all select-none active:scale-90 ${
                    isRightActive && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <RightIcon
                    className={`w-5 h-5 transition-transform ${
                      isRightActive && !isOtherMenuOpen ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-[9.5px] leading-none tracking-tight truncate max-w-full">
                    {rightLabel}
                  </span>
                </Link>

                {/* ⑤ ⋯ メニュー（固定） */}
                <button
                  type="button"
                  onClick={() => setIsOtherMenuOpen((prev) => !prev)}
                  className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 cursor-pointer ${
                    isOtherMenuOpen || isOther
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Menu
                    className={`w-5 h-5 transition-transform ${
                      isOtherMenuOpen ? "rotate-90 scale-110" : ""
                    }`}
                  />
                  <span className="text-[10px] leading-none tracking-tight">
                    メニュー
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* 🌟 フラットモード: 突起なしのソリッド5分割バー */
            <div className="relative w-full h-[60px] bg-card border-t border-border shadow-[0_-3px_8px_rgba(0,0,0,0.08)] select-none">
              <div className="grid grid-cols-5 h-full items-center px-1">
                {/* ① 🏠 ホーム（固定） */}
                <Link
                  href="/liff"
                  onPointerDown={() => handlePointerWarmup("/liff")}
                  onClick={(e) =>
                    handleLiffRootLinkClick(e, router, pathname, () =>
                      setIsOtherMenuOpen(false)
                    )
                  }
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all select-none active:scale-90 ${
                    isHome && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Home
                    className={`w-5 h-5 transition-transform ${
                      isHome && !isOtherMenuOpen ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-[10px] leading-none tracking-tight">
                    ホーム
                  </span>
                </Link>

                {/* ② 左カスタム枠 */}
                <Link
                  href={leftSlotItem.href}
                  onPointerDown={() => handlePointerWarmup(leftSlotItem.href)}
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 px-0.5 transition-all select-none active:scale-90 ${
                    isLeftActive && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <LeftIcon
                    className={`w-5 h-5 transition-transform ${
                      isLeftActive && !isOtherMenuOpen ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-[9.5px] leading-none tracking-tight truncate max-w-full">
                    {leftLabel}
                  </span>
                </Link>

                {/* ③ 中央カスタム枠（フラット時は上端アクセント付き） */}
                <Link
                  href={centerSlotItem.href}
                  onPointerDown={() => handlePointerWarmup(centerSlotItem.href)}
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`relative flex flex-col items-center justify-center gap-1 py-1 px-0.5 transition-all select-none active:scale-90 ${
                    isCenterActive && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-foreground hover:text-primary font-black"
                  }`}
                >
                  <span
                    className={`w-8 h-6 rounded-lg flex items-center justify-center ${
                      isCenterActive && !isOtherMenuOpen
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/12 text-primary"
                    }`}
                  >
                    <CenterIcon className="w-4 h-4" />
                  </span>
                  <span className="text-[9.5px] leading-none tracking-tight truncate max-w-full">
                    {centerLabel}
                  </span>
                </Link>

                {/* ④ 右カスタム枠 */}
                <Link
                  href={rightSlotItem.href}
                  onPointerDown={() => handlePointerWarmup(rightSlotItem.href)}
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 px-0.5 transition-all select-none active:scale-90 ${
                    isRightActive && !isOtherMenuOpen
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <RightIcon
                    className={`w-5 h-5 transition-transform ${
                      isRightActive && !isOtherMenuOpen ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-[9.5px] leading-none tracking-tight truncate max-w-full">
                    {rightLabel}
                  </span>
                </Link>

                {/* ⑤ ⋯ メニュー（固定） */}
                <button
                  type="button"
                  onClick={() => setIsOtherMenuOpen((prev) => !prev)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all select-none active:scale-90 cursor-pointer ${
                    isOtherMenuOpen || isOther
                      ? "text-primary font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Menu
                    className={`w-5 h-5 transition-transform ${
                      isOtherMenuOpen ? "rotate-90 scale-110" : ""
                    }`}
                  />
                  <span className="text-[10px] leading-none tracking-tight">
                    メニュー
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* iPhone セーフエリア下部背景 */}
          <div className="h-[max(env(safe-area-inset-bottom),8px)] bg-card" />

        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📑 「その他」タップ時の全メニュー一覧ボトムシート（Portal化してDOM階層を分離）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isOtherMenuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9990] flex justify-center items-end bg-slate-950/60">
            <div 
              className="absolute inset-0"
              onClick={() => setIsOtherMenuOpen(false)}
            />

            <div className="w-full max-w-lg bg-background rounded-t-2xl border-t border-x border-border shadow-2xl px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-0 space-y-4 relative z-10 max-h-[88dvh] overflow-y-auto">
            {/* 🏷️ スティッキーヘッダー (A-3 Dark Solid Header Cap) & 3分割カテゴリタブ */}
            <div className="sticky top-0 -mx-5 bg-background z-10 border-b border-border">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-5 py-3.5 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4" />
                  </span>
                  <h4 className="text-sm font-black text-white">メニュー一覧</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOtherMenuOpen(false)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-90 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 🏷️ 均等3分割セグメントタブ（横スクロール一切なし・全画面幅フィット） */}
              <div className="px-5 py-3 bg-card">
                <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-2xl border border-border">
                  {MENU_TABS.map((tab) => {
                    const isSelected = selectedCategory === tab.id;
                    const TabIcon = tab.icon;
                    const count = MENU_ITEMS.filter((i) => i.category === tab.id).length;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedCategory(tab.id)}
                        className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl border text-xs transition-all active:scale-95 ${
                          isSelected
                            ? "bg-card text-foreground border-border shadow-xs font-black"
                            : "border-transparent text-muted-foreground hover:text-foreground font-bold"
                        }`}
                      >
                        <TabIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary" : ""}`} />
                        <span className="truncate">{tab.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isSelected 
                              ? "bg-primary/12 text-primary font-black" 
                              : "bg-card text-muted-foreground border border-border"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 🌟 フィルタリングされたメニュー項目グリッド */}
            {CATEGORY_SECTIONS[selectedCategory] ? (
              <div className="space-y-4">
                {CATEGORY_SECTIONS[selectedCategory]?.map((section) => {
                  const SectionIcon = section.icon;
                  const sectionItems = filteredItems.filter((item) => item.subGroup === section.key);
                  return (
                    <div key={section.key} className="space-y-2">
                      <div className="flex items-center gap-1.5 px-1">
                        <SectionIcon className={`w-3.5 h-3.5 ${section.iconTextClass}`} />
                        <span className="text-[11px] font-black tracking-tight text-muted-foreground">
                          {section.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {sectionItems.map((item) => {
                          const ItemIcon = item.icon;
                          const isFullWidth = item.fullWidth;

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onPointerDown={() => handlePointerWarmup(item.href)}
                              onClick={() => setIsOtherMenuOpen(false)}
                              className={`flex items-center gap-3 p-3 rounded-2xl border border-border bg-card shadow-xs ${item.hoverBorderClass ?? "hover:border-primary/40"} transition-all group active:scale-95 ${
                                isFullWidth ? "col-span-2" : ""
                              }`}
                            >
                              <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${item.colorClass}`}>
                                <ItemIcon className="w-5 h-5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-foreground truncate">
                                  {item.title}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-bold truncate">
                                  {item.subtitle}
                                </p>
                              </div>
                              {isFullWidth && (
                                <ChevronRight className="w-4 h-4 text-muted-foreground mr-1 shrink-0" />
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {filteredItems.map((item) => {
                  const ItemIcon = item.icon;
                  const isFullWidth = item.fullWidth;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onPointerDown={() => handlePointerWarmup(item.href)}
                      onClick={() => setIsOtherMenuOpen(false)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all group active:scale-95 ${
                        isFullWidth ? "col-span-2" : ""
                      }`}
                    >
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${item.colorClass}`}>
                        <ItemIcon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-foreground truncate">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-bold truncate">
                          {item.subtitle}
                        </p>
                      </div>
                      {isFullWidth && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground mr-1 shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* 📜 法務・規約リンク */}
            <div className="pt-3 border-t border-border flex items-center justify-center gap-3">
              <Link
                href="/liff/terms"
                onClick={() => setIsOtherMenuOpen(false)}
                className="py-1.5 px-3 rounded-full bg-card hover:bg-muted active:scale-95 border border-border text-[11px] font-bold text-muted-foreground hover:text-foreground shadow-xs transition-all flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>利用規約</span>
              </Link>

              <Link
                href="/liff/privacy"
                onClick={() => setIsOtherMenuOpen(false)}
                className="py-1.5 px-3 rounded-full bg-card hover:bg-muted active:scale-95 border border-border text-[11px] font-bold text-muted-foreground hover:text-foreground shadow-xs transition-all flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span>プライバシーポリシー</span>
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
