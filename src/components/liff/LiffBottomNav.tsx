// filepath: src/components/liff/LiffBottomNav.tsx
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
  Shield,
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
  Handshake,
  Gamepad2,
} from "lucide-react";

type MenuCategory = "schedule_match" | "player_docs" | "settings_admin";
type MenuSubGroup =
  | "schedule_access"
  | "match_record"
  | "team_player"
  | "photo_cheer"
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
    { key: "team_player", label: "チーム・選手", icon: IdCard, iconTextClass: "text-primary" },
    { key: "photo_cheer", label: "写真・応援", icon: Camera, iconTextClass: "text-primary" },
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
  {
    title: "関連チーム",
    subtitle: "所属連盟・対戦チームの公式HP・SNS",
    href: "/liff/related-teams",
    icon: Handshake,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule_match" as const,
    subGroup: "match_record",
  },
  {
    title: "野球盤ゲーム",
    subtitle: "投げて打つ懐かしの盤上対決",
    href: "/liff/baseball-board",
    icon: Gamepad2,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "schedule_match" as const,
    subGroup: "match_record",
  },

  // 📖 タブ2: 選手・資料（① チーム・選手）
  {
    title: "チーム情報",
    subtitle: "クラブ概要・指導体制・拠点・戦績",
    href: "/liff/team",
    icon: Shield,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "team_player",
  },
  {
    title: "選手名鑑",
    subtitle: "背番号・プロフィール・選手紹介",
    href: "/liff/players",
    icon: IdCard,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "team_player",
  },
  {
    title: "チーム成績",
    subtitle: "勝敗・得失点・個人ランキング",
    href: "/liff/stats",
    icon: BarChart3,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "team_player",
  },
  {
    title: "個人成長レポート",
    subtitle: "打撃・投球・守備の推移グラフ",
    href: "/liff/players/growth",
    icon: TrendingUp,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "team_player",
  },

  // 📖 タブ2: 選手・資料（② 写真・応援）
  {
    title: "写真アルバム",
    subtitle: "試合写真の共有・一括保存",
    href: "/liff/gallery",
    icon: Camera,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "photo_cheer",
  },
  {
    title: "応援歌・コール",
    subtitle: "選手名入り歌詞・応援コール",
    href: "/liff/tools/cheer-songs",
    icon: Music,
    colorClass: "bg-primary/12 text-primary",
    hoverBorderClass: "hover:border-primary/40",
    category: "player_docs" as const,
    subGroup: "photo_cheer",
  },

  // 📖 タブ2: 選手・資料（③ ルール・資料）
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
    title: "メンバー・権限管理",
    subtitle: "参加承認・手動追加・役職・招待",
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
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuScrollBodyRef = useRef<HTMLDivElement | null>(null);
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const swipeTrackRef = useRef<HTMLDivElement | null>(null);
  const tabPillRef = useRef<HTMLDivElement | null>(null);
  const suppressLinkClickUntilRef = useRef<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("schedule_match");
  const [navConfig, setNavConfig] = useState<BottomNavConfig>(
    () => hydratedBottomNavConfig ?? getDefaultBottomNavConfig()
  );

  const activeTabIndex = useMemo(
    () => Math.max(0, MENU_TABS.findIndex((t) => t.id === selectedCategory)),
    [selectedCategory]
  );
  const activeTabIndexRef = useRef(activeTabIndex);
  activeTabIndexRef.current = activeTabIndex;

  const clearCloseMenuTimer = useCallback(() => {
    if (closeMenuTimerRef.current !== null) {
      clearTimeout(closeMenuTimerRef.current);
      closeMenuTimerRef.current = null;
    }
  }, []);

  const closeMenuImmediate = useCallback(() => {
    clearCloseMenuTimer();
    setIsOtherMenuOpen(false);
    setIsMenuClosing(false);
  }, [clearCloseMenuTimer]);

  const handleMenuItemLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (performance.now() < suppressLinkClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      closeMenuImmediate();
    },
    [closeMenuImmediate]
  );

  const openMenu = useCallback(() => {
    clearCloseMenuTimer();
    setIsMenuClosing(false);
    setIsOtherMenuOpen(true);
  }, [clearCloseMenuTimer]);

  const closeMenuAnimated = useCallback(() => {
    clearCloseMenuTimer();
    setIsOtherMenuOpen(false);
    setIsMenuClosing(true);
    closeMenuTimerRef.current = setTimeout(() => {
      setIsMenuClosing(false);
      closeMenuTimerRef.current = null;
    }, 200);
  }, [clearCloseMenuTimer]);

  const toggleOtherMenu = useCallback(() => {
    if (isOtherMenuOpen) {
      closeMenuAnimated();
    } else {
      openMenu();
    }
  }, [closeMenuAnimated, isOtherMenuOpen, openMenu]);

  const handleSelectCategory = useCallback((category: MenuCategory) => {
    if (swipeTrackRef.current) {
      swipeTrackRef.current.style.transitionDuration = "";
    }
    if (tabPillRef.current) {
      tabPillRef.current.style.transitionDuration = "";
    }
    setSelectedCategory(category);
    if (menuScrollBodyRef.current && menuScrollBodyRef.current.scrollTop > 0) {
      menuScrollBodyRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const isMenuPortalVisible = isOtherMenuOpen || isMenuClosing;

  useEffect(() => {
    if (!isMenuPortalVisible) return;
    const scrollBody = menuScrollBodyRef.current;
    if (!scrollBody) return;

    const gesture = {
      active: false,
      axis: "undecided" as "undecided" | "horizontal" | "vertical",
      startX: 0,
      startY: 0,
      lastX: 0,
      startTime: 0,
      width: 360,
      startIndex: 0,
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        gesture.active = false;
        return;
      }
      const touch = e.touches[0];
      gesture.active = true;
      gesture.axis = "undecided";
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.lastX = touch.clientX;
      gesture.startTime = performance.now();
      gesture.width = Math.max(
        1,
        swipeViewportRef.current?.clientWidth || scrollBody.clientWidth || 360
      );
      gesture.startIndex = activeTabIndexRef.current;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!gesture.active || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.axis === "undecided") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.1) {
          gesture.axis = "horizontal";
          if (swipeTrackRef.current) {
            swipeTrackRef.current.style.transitionDuration = "0ms";
          }
          if (tabPillRef.current) {
            tabPillRef.current.style.transitionDuration = "0ms";
          }
        } else {
          gesture.axis = "vertical";
          return;
        }
      }

      if (gesture.axis !== "horizontal") return;
      if (e.cancelable) {
        e.preventDefault();
      }

      gesture.lastX = touch.clientX;
      const maxIndex = MENU_TABS.length - 1;
      const isAtEdge =
        (gesture.startIndex === 0 && dx > 0) ||
        (gesture.startIndex === maxIndex && dx < 0);
      const clampedDx = Math.max(-gesture.width, Math.min(gesture.width, dx));
      const effectiveDx = isAtEdge ? clampedDx * 0.26 : clampedDx;

      if (swipeTrackRef.current) {
        swipeTrackRef.current.style.transform = `translate3d(calc(${
          -gesture.startIndex * 100
        }% + ${effectiveDx}px), 0, 0)`;
      }
      if (tabPillRef.current) {
        const pillProgress = Math.max(
          -0.26,
          Math.min(
            maxIndex + 0.26,
            gesture.startIndex - effectiveDx / gesture.width
          )
        );
        tabPillRef.current.style.transform = `translate3d(${
          pillProgress * 100
        }%, 0, 0)`;
      }
    };

    const finishGesture = () => {
      if (!gesture.active) return;
      const wasHorizontal = gesture.axis === "horizontal";
      const totalDx = gesture.lastX - gesture.startX;
      const elapsed = Math.max(1, performance.now() - gesture.startTime);
      const velocity = Math.abs(totalDx) / elapsed;
      const startIndex = gesture.startIndex;
      const width = gesture.width;

      gesture.active = false;
      gesture.axis = "undecided";

      if (!wasHorizontal) return;

      suppressLinkClickUntilRef.current = performance.now() + 320;

      if (swipeTrackRef.current) {
        swipeTrackRef.current.style.transitionDuration = "";
      }
      if (tabPillRef.current) {
        tabPillRef.current.style.transitionDuration = "";
      }

      const maxIndex = MENU_TABS.length - 1;
      const threshold = Math.min(60, width * 0.16);
      const isFastFlick = Math.abs(totalDx) >= 22 && velocity >= 0.32;

      let nextIndex = startIndex;
      if (
        (totalDx <= -threshold || (totalDx < 0 && isFastFlick)) &&
        startIndex < maxIndex
      ) {
        nextIndex = startIndex + 1;
      } else if (
        (totalDx >= threshold || (totalDx > 0 && isFastFlick)) &&
        startIndex > 0
      ) {
        nextIndex = startIndex - 1;
      }

      if (swipeTrackRef.current) {
        swipeTrackRef.current.style.transform = `translate3d(${
          -nextIndex * 100
        }%, 0, 0)`;
      }
      if (tabPillRef.current) {
        tabPillRef.current.style.transform = `translate3d(${
          nextIndex * 100
        }%, 0, 0)`;
      }

      if (nextIndex !== startIndex) {
        handleSelectCategory(MENU_TABS[nextIndex].id);
      }
    };

    scrollBody.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollBody.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollBody.addEventListener("touchend", finishGesture, { passive: true });
    scrollBody.addEventListener("touchcancel", finishGesture, {
      passive: true,
    });

    return () => {
      scrollBody.removeEventListener("touchstart", onTouchStart);
      scrollBody.removeEventListener("touchmove", onTouchMove);
      scrollBody.removeEventListener("touchend", finishGesture);
      scrollBody.removeEventListener("touchcancel", finishGesture);
    };
  }, [isMenuPortalVisible, handleSelectCategory]);

  useEffect(() => {
    return () => {
      clearCloseMenuTimer();
    };
  }, [clearCloseMenuTimer]);

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
    closeMenuImmediate();
    if (
      pathname?.startsWith("/liff/profile") ||
      pathname?.startsWith("/liff/settings") ||
      pathname?.startsWith("/liff/admin")
    ) {
      setSelectedCategory("settings_admin");
    } else if (
      pathname === "/liff/team" ||
      pathname?.startsWith("/liff/team/") ||
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
  }, [pathname, currentTeam?.id, closeMenuImmediate]);

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

  // 1画面コックピット画面（試合速報ジェネレータ・野球盤ゲーム）ではボトムナビを非表示
  if (
    pathname?.startsWith("/liff/tools/news-generator") ||
    pathname?.startsWith("/liff/baseball-board")
  ) {
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
                  onClick={closeMenuImmediate}
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
                    handleLiffRootLinkClick(e, router, pathname, closeMenuImmediate)
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
                  onClick={closeMenuImmediate}
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
                  onClick={closeMenuImmediate}
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
                  onClick={toggleOtherMenu}
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
                    handleLiffRootLinkClick(e, router, pathname, closeMenuImmediate)
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
                  onClick={closeMenuImmediate}
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
                  onClick={closeMenuImmediate}
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
                  onClick={closeMenuImmediate}
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
                  onClick={toggleOtherMenu}
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
          📑 「メニュー」タップ時の全メニュー一覧ボトムシート（Portal化・全3タブ高さ完全統一・下からスライド表示）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {(isOtherMenuOpen || isMenuClosing) &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`fixed inset-0 z-[9990] flex justify-center items-end overflow-hidden ${
              !isOtherMenuOpen && isMenuClosing ? "pointer-events-none" : ""
            }`}
          >
            <div
              className={`absolute inset-0 bg-slate-950/60 ${
                !isOtherMenuOpen && isMenuClosing
                  ? "animate-liff-backdrop-out"
                  : "animate-liff-backdrop-in"
              }`}
              onClick={closeMenuAnimated}
            />

            <div
              className={`w-full max-w-lg bg-background rounded-t-2xl border-t border-x border-border shadow-2xl relative z-10 max-h-[88dvh] flex flex-col overflow-hidden ${
                !isOtherMenuOpen && isMenuClosing
                  ? "animate-liff-sheet-down"
                  : "animate-liff-sheet-up"
              }`}
            >
              {/* 🏷️ 固定ヘッダー (A-3 Dark Solid Header Cap) & 3分割カテゴリタブ */}
              <div className="shrink-0 bg-background border-b border-border">
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center">
                      <LayoutGrid className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-black text-white">メニュー</h4>
                  </div>
                  <button
                    type="button"
                    onClick={closeMenuAnimated}
                    className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-90 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* 🏷️ 均等3分割セグメントタブ（スライドピル連動・チラつきゼロ） */}
                <div className="px-5 py-3 bg-card">
                  <div className="relative grid grid-cols-3 p-1 bg-muted rounded-2xl border border-border overflow-hidden">
                    <div
                      ref={tabPillRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-card border border-border shadow-xs transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        transform: `translate3d(${activeTabIndex * 100}%, 0, 0)`,
                      }}
                    />
                    {MENU_TABS.map((tab) => {
                      const isSelected = selectedCategory === tab.id;
                      const TabIcon = tab.icon;
                      const count = MENU_ITEMS.filter((i) => i.category === tab.id).length;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleSelectCategory(tab.id)}
                          className={`relative z-10 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-black transition-colors duration-150 cursor-pointer select-none ${
                            isSelected
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <TabIcon
                            className={`w-3.5 h-3.5 shrink-0 transition-colors duration-150 ${
                              isSelected ? "text-primary" : ""
                            }`}
                          />
                          <span className="truncate">{tab.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full border font-black transition-colors duration-150 ${
                              isSelected
                                ? "bg-primary/12 text-primary border-transparent"
                                : "bg-card text-muted-foreground border-border"
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

              {/* 🌟 スクロール＆左右スワイプ領域（横並び3ペイントラックにより全3タブ高さ完全統一＆チラつきゼロ） */}
              <div
                ref={menuScrollBodyRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-4 pb-[max(env(safe-area-inset-bottom),24px)] flex flex-col touch-pan-y"
              >
                <div ref={swipeViewportRef} className="w-full overflow-hidden">
                  <div
                    ref={swipeTrackRef}
                    className="flex w-full items-start transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{
                      transform: `translate3d(${-activeTabIndex * 100}%, 0, 0)`,
                    }}
                  >
                    {MENU_TABS.map((tab) => {
                      const isTabSelected = selectedCategory === tab.id;
                      const tabItems = MENU_ITEMS.filter((item) => item.category === tab.id);
                      const sections = CATEGORY_SECTIONS[tab.id];

                      return (
                        <div
                          key={tab.id}
                          aria-hidden={!isTabSelected}
                          className="w-full shrink-0 px-5 self-start space-y-4 select-none"
                        >
                          {sections ? (
                            sections.map((section) => {
                              const SectionIcon = section.icon;
                              const sectionItems = tabItems.filter(
                                (item) => item.subGroup === section.key
                              );
                              return (
                                <div key={section.key} className="space-y-2">
                                  <div className="flex items-center justify-between gap-2 px-1 min-h-[22px]">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <SectionIcon
                                        className={`w-3.5 h-3.5 shrink-0 ${section.iconTextClass}`}
                                      />
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
                                        {section.badgeAdmin && (
                                          <Lock className="w-2.5 h-2.5 shrink-0" />
                                        )}
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
                                          draggable={false}
                                          tabIndex={isTabSelected ? undefined : -1}
                                          onPointerDown={() => handlePointerWarmup(item.href)}
                                          onClick={handleMenuItemLinkClick}
                                          className={`min-h-[62px] flex items-center gap-2.5 p-3 rounded-2xl border border-border bg-card shadow-xs ${
                                            item.hoverBorderClass ?? "hover:border-primary/40"
                                          } transition-[transform,border-color] duration-150 group active:scale-[0.98] ${
                                            isFullWidth ? "col-span-2" : ""
                                          }`}
                                        >
                                          <span
                                            className={`relative w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform duration-150 shadow-2xs ${item.colorClass}`}
                                          >
                                            <ItemIcon className="w-5 h-5" />
                                            {item.adminOnly && (
                                              <span
                                                aria-label="管理者専用"
                                                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#0f172a] text-amber-300 border border-card flex items-center justify-center shadow-2xs"
                                              >
                                                <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                                              </span>
                                            )}
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
                            })
                          ) : (
                            <div className="grid grid-cols-2 gap-2.5">
                              {tabItems.map((item) => {
                                const ItemIcon = item.icon;
                                const isFullWidth = item.fullWidth;

                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    draggable={false}
                                    tabIndex={isTabSelected ? undefined : -1}
                                    onPointerDown={() => handlePointerWarmup(item.href)}
                                    onClick={handleMenuItemLinkClick}
                                    className={`min-h-[62px] flex items-center gap-2.5 p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-[transform,border-color] duration-150 group active:scale-[0.98] ${
                                      isFullWidth ? "col-span-2" : ""
                                    }`}
                                  >
                                    <span
                                      className={`relative w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform duration-150 shadow-2xs ${item.colorClass}`}
                                    >
                                      <ItemIcon className="w-5 h-5" />
                                      {item.adminOnly && (
                                        <span
                                          aria-label="管理者専用"
                                          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#0f172a] text-amber-300 border border-card flex items-center justify-center shadow-2xs"
                                        >
                                          <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                                        </span>
                                      )}
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
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 📜 法務・規約リンク */}
                <div className="mt-4 mx-5 pt-3 border-t border-border flex items-center justify-center gap-3 shrink-0">
                  <Link
                    href="/liff/terms"
                    draggable={false}
                    onClick={handleMenuItemLinkClick}
                    className="py-1.5 px-3 rounded-full bg-card hover:bg-muted active:scale-95 border border-border text-[11px] font-bold text-muted-foreground hover:text-foreground shadow-xs transition-[transform,background-color,color] duration-150 flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>利用規約</span>
                  </Link>

                  <Link
                    href="/liff/privacy"
                    draggable={false}
                    onClick={handleMenuItemLinkClick}
                    className="py-1.5 px-3 rounded-full bg-card hover:bg-muted active:scale-95 border border-border text-[11px] font-bold text-muted-foreground hover:text-foreground shadow-xs transition-[transform,background-color,color] duration-150 flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span>プライバシーポリシー</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
