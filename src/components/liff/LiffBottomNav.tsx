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
  BarChart3,
  MapPin, 
  Menu, 
  X,
  Car,
  Camera,
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
  TrendingUp,
  ScanLine,
  Megaphone,
  Music,
  Building2,
  Bus,
  KeyRound,
  Package,
  Lock,
} from "lucide-react";

type MenuCategory = "schedule_match" | "player_docs" | "settings_admin";
type MenuSubGroup =
  | "schedule_access"
  | "match_record"
  | "player_media"
  | "docs_rules"
  | "settings_personal"
  | "settings_operation"
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
  adminOnly?: boolean;
}

const MENU_TABS = [
  { id: "schedule_match" as const, label: "予定・試合", icon: Calendar },
  { id: "player_docs" as const, label: "選手・資料", icon: IdCard },
  { id: "settings_admin" as const, label: "設定・管理", icon: Settings },
];

const CATEGORY_SECTIONS: Record<
  MenuCategory,
  Array<{
    key: MenuSubGroup;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconTextClass: string;
    badgeLabel?: string;
    badgeAdmin?: boolean;
  }>
> = {
  schedule_match: [
    { key: "schedule_access", label: "予定・送迎", icon: Calendar, iconTextClass: "text-teal-600 dark:text-teal-400" },
    { key: "match_record", label: "試合・記録", icon: Trophy, iconTextClass: "text-primary" },
  ],
  player_docs: [
    { key: "player_media", label: "選手・成績・写真", icon: IdCard, iconTextClass: "text-primary" },
    { key: "docs_rules", label: "ルール・資料", icon: BookOpen, iconTextClass: "text-amber-600 dark:text-amber-400" },
  ],
  settings_admin: [
    { key: "settings_personal", label: "個人設定", icon: UserCircle, iconTextClass: "text-slate-600 dark:text-slate-400", badgeLabel: "全員" },
    { key: "settings_operation", label: "運用・規定", icon: SlidersHorizontal, iconTextClass: "text-slate-600 dark:text-slate-400", badgeLabel: "指導者・スコアラー" },
    { key: "settings_admin", label: "チーム管理", icon: ShieldCheck, iconTextClass: "text-slate-600 dark:text-slate-400", badgeLabel: "管理者専用", badgeAdmin: true },
  ],
};

const MENU_ITEMS: MenuItem[] = [
  // 🗓️ タブ1: 予定・試合（① 予定・送迎 — 毎週全員が使う順）
  {
    title: "活動予定",
    subtitle: "練習・試合スケジュール・当番",
    href: "/liff/schedule",
    icon: Calendar,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule_match" as const,
    subGroup: "schedule_access",
  },
  {
    title: "出欠一覧表",
    subtitle: "全員の出欠・当番集計ボード",
    href: "/liff/schedule/board",
    icon: ClipboardCheck,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule_match" as const,
    subGroup: "schedule_access",
  },
  {
    title: "配車表",
    subtitle: "号車割り・集合時間・隊列マップ",
    href: "/liff/carpool",
    icon: Car,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule_match" as const,
    subGroup: "schedule_access",
  },
  {
    title: "球場・施設マップ",
    subtitle: "アクセス・駐車場・スパイク規定",
    href: "/liff/grounds",
    icon: MapPin,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "schedule_match" as const,
    subGroup: "schedule_access",
  },

  // 🗓️ タブ1: 予定・試合（② 試合・記録 — 事前準備 ➔ 試合中 ➔ 試合後）
  {
    title: "試合・スコア",
    subtitle: "試合予定・結果・スコア・動画",
    href: "/liff/matches",
    icon: Trophy,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule_match" as const,
    subGroup: "match_record",
  },
  {
    title: "スタメン・ベンチ編成",
    subtitle: "打順・守備位置・ベンチ入り設定",
    href: "/liff/matches/lineup",
    icon: Users,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule_match" as const,
    subGroup: "match_record",
  },
  {
    title: "LINE試合速報",
    subtitle: "打席ごとの速報テキスト作成",
    href: "/liff/tools/news-generator",
    icon: Megaphone,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule_match" as const,
    subGroup: "match_record",
  },
  {
    title: "スコアAI取込",
    subtitle: "紙スコア撮影・AIデータ化",
    href: "/liff/tools/scorebook-import",
    icon: ScanLine,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule_match" as const,
    subGroup: "match_record",
  },

  // 📖 タブ2: 選手・資料（① 選手・成績・写真）
  {
    title: "選手名鑑",
    subtitle: "背番号・プロフィール・選手紹介",
    href: "/liff/players",
    icon: IdCard,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "player_media",
  },
  {
    title: "チーム成績",
    subtitle: "勝敗・得失点・個人ランキング",
    href: "/liff/stats",
    icon: BarChart3,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "player_media",
  },
  {
    title: "個人成長レポート",
    subtitle: "打撃・投球・守備の推移グラフ",
    href: "/liff/players/growth",
    icon: TrendingUp,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "player_media",
  },
  {
    title: "写真アルバム",
    subtitle: "試合写真の共有・一括保存",
    href: "/liff/gallery",
    icon: Camera,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "player_media",
  },
  {
    title: "応援歌・コール",
    subtitle: "選手名入り歌詞・応援コール",
    href: "/liff/tools/cheer-songs",
    icon: Music,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "player_media",
  },

  // 📖 タブ2: 選手・資料（② ルール・資料）
  {
    title: "チームルール・心得",
    subtitle: "活動ルール・当番・配車の決まり",
    href: "/liff/rules",
    icon: AlertTriangle,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "player_docs" as const,
    subGroup: "docs_rules",
  },
  {
    title: "よくある質問",
    subtitle: "雨天判断・服装・当番のQ&A",
    href: "/liff/faq",
    icon: HelpCircle,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "player_docs" as const,
    subGroup: "docs_rules",
  },
  {
    title: "配布資料・書類",
    subtitle: "規約・マニュアル・各種様式",
    href: "/liff/documents",
    icon: FileText,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "player_docs" as const,
    subGroup: "docs_rules",
  },
  {
    title: "関連リンク集",
    subtitle: "連盟公式・大会速報・SNS",
    href: "/liff/links",
    icon: Link2,
    colorClass: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "player_docs" as const,
    subGroup: "docs_rules",
  },

  // ⚙️ タブ3: 設定・管理（① 個人設定 — 全員）
  {
    title: "マイプロフィール",
    subtitle: "表示名・お子様紐付け・マイカー",
    href: "/liff/profile",
    icon: UserCircle,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_personal",
  },
  {
    title: "画面・メニュー設定",
    subtitle: "ホーム・下部ナビ・外観カスタム",
    href: "/liff/settings",
    icon: Settings,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_personal",
  },

  // ⚙️ タブ3: 設定・管理（② 運用・規定 — 指導者・スコアラー）
  {
    title: "チーム表示・予定設定",
    subtitle: "ロゴ・背景・練習試合呼称・標準時間",
    href: "/liff/settings/team",
    icon: SlidersHorizontal,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_operation",
  },
  {
    title: "スコア・試合規定",
    subtitle: "規定回数・スコア記号・早見表",
    href: "/liff/settings/score",
    icon: BookOpen,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_operation",
  },

  // 🛡️ タブ3: 設定・管理（③ チーム管理 — 管理者専用：「人・組織」➔「車両・大会・備品」順）
  {
    title: "参加承認・LINE招待",
    subtitle: "参加申請の承認・招待リンク共有",
    href: "/liff/admin",
    icon: ShieldCheck,
    colorClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    hoverBorderClass: "hover:border-slate-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
  {
    title: "チーム・編成管理",
    subtitle: "クラブ基本情報・A/B編成の追加",
    href: "/liff/admin/teams",
    icon: Building2,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
  {
    title: "権限・役職管理",
    subtitle: "監督・コーチ・管理者の権限と肩書",
    href: "/liff/admin/roles",
    icon: KeyRound,
    colorClass: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
  {
    title: "家族・当番班管理",
    subtitle: "親子紐付け・当番班の一括割当",
    href: "/liff/admin/family",
    icon: Users,
    colorClass: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    hoverBorderClass: "hover:border-emerald-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
  {
    title: "車両・バス管理",
    subtitle: "マイクロバス・道具車・家庭車台帳",
    href: "/liff/admin/cars",
    icon: Bus,
    colorClass: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
    hoverBorderClass: "hover:border-teal-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
  {
    title: "大会・リーグ管理",
    subtitle: "公式戦マスタ・大会規定の登録",
    href: "/liff/admin/tournaments",
    icon: Trophy,
    colorClass: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
  {
    title: "道具・備品管理",
    subtitle: "防具・テント等のチーム備品台帳",
    href: "/liff/admin/equipments",
    icon: Package,
    colorClass: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40",
    category: "settings_admin" as const,
    subGroup: "settings_admin",
    adminOnly: true,
  },
];

let hydratedBottomNavConfig: BottomNavConfig | null = null;

export function LiffBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentTeam } = useLiff();
  const [isOtherMenuOpen, setIsOtherMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("schedule_match");
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
      setSelectedCategory("settings_admin");
    } else if (
      pathname?.startsWith("/liff/players") ||
      pathname?.startsWith("/liff/stats") ||
      pathname?.startsWith("/liff/gallery") ||
      pathname?.startsWith("/liff/tools/cheer-songs") ||
      pathname?.startsWith("/liff/rules") ||
      pathname?.startsWith("/liff/faq") ||
      pathname?.startsWith("/liff/documents") ||
      pathname?.startsWith("/liff/links")
    ) {
      setSelectedCategory("player_docs");
    } else {
      setSelectedCategory("schedule_match");
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

  // 試合速報ジェネレータではボトムナビの代わりに最下部固定キーパッドを配置するため非表示
  if (pathname?.startsWith("/liff/tools/news-generator")) {
    return null;
  }

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
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <SectionIcon className={`w-3.5 h-3.5 shrink-0 ${section.iconTextClass}`} />
                          <span className="text-[11px] font-black tracking-tight text-muted-foreground">
                            {section.label}
                          </span>
                        </div>
                        {section.badgeLabel && (
                          <span
                            className={
                              section.badgeAdmin
                                ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9.5px] font-black shrink-0"
                                : "inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-[9.5px] font-bold shrink-0"
                            }
                          >
                            {section.badgeAdmin && <Lock className="w-2.5 h-2.5 shrink-0" />}
                            <span>{section.badgeLabel}</span>
                          </span>
                        )}
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
                              className={`flex items-center gap-2.5 p-3 rounded-2xl border border-border bg-card shadow-xs ${item.hoverBorderClass ?? "hover:border-primary/40"} transition-all group active:scale-95 ${
                                isFullWidth ? "col-span-2" : ""
                              }`}
                            >
                              <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${item.colorClass}`}>
                                <ItemIcon className="w-5 h-5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                {item.adminOnly && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[8.5px] font-black leading-tight mb-0.5">
                                    <Lock className="w-2 h-2 shrink-0" />
                                    <span>管理者専用</span>
                                  </span>
                                )}
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
                      className={`flex items-center gap-2.5 p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all group active:scale-95 ${
                        isFullWidth ? "col-span-2" : ""
                      }`}
                    >
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${item.colorClass}`}>
                        <ItemIcon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {item.adminOnly && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[8.5px] font-black leading-tight mb-0.5">
                            <Lock className="w-2 h-2 shrink-0" />
                            <span>管理者専用</span>
                          </span>
                        )}
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
