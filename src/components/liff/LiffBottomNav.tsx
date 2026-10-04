// filepath: src/components/liff/LiffBottomNav.tsx
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  CalendarDays,
  LayoutGrid,
  Settings,
  ChevronRight,
  ShieldCheck,
  Link2,
  BookOpen,
} from "lucide-react";

type MenuCategory = "schedule" | "manual" | "settings";

const MENU_TABS = [
  { id: "schedule" as const, label: "活動・予定", icon: Calendar },
  { id: "manual" as const, label: "マニュアル", icon: BookOpen },
  { id: "settings" as const, label: "設定", icon: Settings },
];

const MENU_ITEMS = [
  // 📅 活動・予定
  {
    title: "試合情報",
    subtitle: "試合動画 & スコア",
    href: "/liff/matches",
    icon: Video,
    colorClass: "bg-red-500/15 text-red-600 dark:text-red-400",
    category: "schedule" as const,
  },
  {
    title: "チーム成績",
    subtitle: "勝敗・打撃個人成績",
    href: "/liff/stats",
    icon: Trophy,
    colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    category: "schedule" as const,
  },
  {
    title: "予定 & 出欠",
    subtitle: "当番・出欠確認",
    href: "/liff/schedule",
    icon: Calendar,
    colorClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    category: "schedule" as const,
  },
  {
    title: "配車表",
    subtitle: "乗車割り・集合時間",
    href: "/liff/carpool",
    icon: Car,
    colorClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    category: "schedule" as const,
  },
  {
    title: "球場 & 施設",
    subtitle: "アクセス・駐車場",
    href: "/liff/grounds",
    icon: MapPin,
    colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    category: "schedule" as const,
  },
  {
    title: "予定スケジューラー",
    subtitle: "月間カレンダー・活動日設定",
    href: "/liff/schedule/admin",
    icon: CalendarDays,
    colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    category: "schedule" as const,
  },

  // 📖 マニュアル
  {
    title: "ルール & 注意事項",
    subtitle: "試合・配車・活動心得",
    href: "/liff/rules",
    icon: AlertTriangle,
    colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    category: "manual" as const,
  },
  {
    title: "資料ダウンロード",
    subtitle: "規約・配車マニュアル",
    href: "/liff/documents",
    icon: FileText,
    colorClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    category: "manual" as const,
  },
  {
    title: "よくある質問",
    subtitle: "雨天判断・Q&A",
    href: "/liff/faq",
    icon: HelpCircle,
    colorClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    category: "manual" as const,
  },
  {
    title: "関連リンク集",
    subtitle: "連盟・大会速報・SNS",
    href: "/liff/links",
    icon: Link2,
    colorClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    category: "manual" as const,
  },

  // ⚙️ 設定
  {
    title: "アプリ設定",
    subtitle: "表示テーマ・立場・スコア入力設定",
    href: "/liff/settings",
    icon: Settings,
    colorClass: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    category: "settings" as const,
    fullWidth: true,
  },
];

export function LiffBottomNav() {
  const pathname = usePathname();
  const [isOtherMenuOpen, setIsOtherMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("schedule");

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  const isHome = pathname === "/liff";
  const isStats = pathname?.startsWith("/liff/stats");
  const isMatches = pathname?.startsWith("/liff/matches");
  const isSearch = pathname?.startsWith("/liff/grounds");
  const isOther = isOtherMenuOpen || pathname?.startsWith("/liff/documents") || pathname?.startsWith("/liff/faq") || pathname?.startsWith("/liff/rules") || pathname?.startsWith("/liff/links") || pathname?.startsWith("/liff/carpool") || pathname?.startsWith("/liff/schedule");

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="w-full max-w-lg pointer-events-auto relative">
          
          {/* 🌟 完全なめらか連続曲線・適度なクッキリ影・絶妙な青丸位置のボトムナビ */}
          <div className="relative w-full h-[68px] select-none">
            
            {/* SVG背景: 継ぎ目のない一体型ベジェ曲線 */}
            <svg
              viewBox="0 -26 375 94"
              preserveAspectRatio="none"
              className="absolute -top-[26px] inset-x-0 w-full h-[94px] overflow-visible filter drop-shadow-[0_-3px_8px_rgba(0,0,0,0.10)]"
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
                className="stroke-border/80"
                strokeWidth="1.2"
                fill="none"
              />
            </svg>

            {/* 🌟 中央: プライマリーカラーの円形試合情報ボタン（カラーテーマ完全連動） */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-20">
              <Link
                href="/liff/matches"
                onClick={() => setIsOtherMenuOpen(false)}
                className={`w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-primary-foreground bg-primary shadow-primary/35 ${
                  isMatches && !isOtherMenuOpen 
                    ? "ring-3 ring-primary/30 scale-105" 
                    : "hover:brightness-110"
                }`}
                title="試合情報"
              >
                <Video className="w-6 h-6 -mb-0.5" />
                <span className="text-[10px] font-black tracking-tighter leading-none mt-1">
                  試合情報
                </span>
              </Link>
            </div>

            {/* ナビゲーションメニューアイテム（5分割グリッド） */}
            <div className="relative z-10 grid grid-cols-5 h-full items-end pb-2 px-1">
              
              {/* ① 🏠 ホーム */}
              <Link
                href="/liff"
                onClick={() => setIsOtherMenuOpen(false)}
                className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 ${
                  isHome && !isOtherMenuOpen
                    ? "text-primary font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <Home className={`w-5 h-5 transition-transform ${isHome && !isOtherMenuOpen ? "scale-110" : ""}`} />
                <span className="text-[10px] leading-none tracking-tight">ホーム</span>
              </Link>

              {/* ② 🏆 チーム成績 */}
              <Link
                href="/liff/stats"
                onClick={() => setIsOtherMenuOpen(false)}
                className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 ${
                  isStats && !isOtherMenuOpen
                    ? "text-primary font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <Trophy className={`w-5 h-5 transition-transform ${isStats && !isOtherMenuOpen ? "scale-110" : ""}`} />
                <span className="text-[10px] leading-none tracking-tight">チーム成績</span>
              </Link>

              {/* ③ 中央プレースホルダー */}
              <div className="pointer-events-none" />

              {/* ④ 📍 球場 & 施設 */}
              <Link
                href="/liff/grounds"
                onClick={() => setIsOtherMenuOpen(false)}
                className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 ${
                  isSearch && !isOtherMenuOpen
                    ? "text-primary font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <MapPin className={`w-5 h-5 transition-transform ${isSearch && !isOtherMenuOpen ? "scale-110" : ""}`} />
                <span className="text-[9.5px] leading-none tracking-tight">球場 & 施設</span>
              </Link>

              {/* ⑤ ⋯ メニュー */}
              <button
                type="button"
                onClick={() => setIsOtherMenuOpen((prev) => !prev)}
                className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 ${
                  isOtherMenuOpen || isOther
                    ? "text-primary font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <Menu className={`w-5 h-5 transition-transform ${isOtherMenuOpen ? "rotate-90 scale-110" : ""}`} />
                <span className="text-[10px] leading-none tracking-tight">メニュー</span>
              </button>

            </div>
          </div>

          {/* iPhone セーフエリア下部背景 */}
          <div className="h-[max(env(safe-area-inset-bottom),8px)] bg-card" />

        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📑 「その他」タップ時の全メニュー一覧ボトムシート
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isOtherMenuOpen && (
        <div className="fixed inset-0 z-40 flex justify-center items-end bg-background/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="absolute inset-0"
            onClick={() => setIsOtherMenuOpen(false)}
          />

          <div className="w-full max-w-lg bg-card rounded-t-3xl border-t border-x border-border shadow-2xl p-5 pb-36 space-y-4 relative z-10 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
            {/* 🏷️ スティッキーヘッダー & 3分割カテゴリタブ */}
            <div className="sticky -top-5 -mt-5 pt-5 pb-3 bg-card/95 backdrop-blur-md z-10 border-b border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-black text-foreground">メニュー一覧</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOtherMenuOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 🏷️ 均等3分割セグメントタブ（横スクロール一切なし・全画面幅フィット） */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-muted/60 rounded-2xl border border-border/40">
                {MENU_TABS.map((tab) => {
                  const isSelected = selectedCategory === tab.id;
                  const TabIcon = tab.icon;
                  const count = MENU_ITEMS.filter((i) => i.category === tab.id).length;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedCategory(tab.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs transition-all active:scale-95 ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 font-black"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50 font-bold"
                      }`}
                    >
                      <TabIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected 
                            ? "bg-primary-foreground/20 text-primary-foreground" 
                            : "bg-background/80 text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 🌟 フィルタリングされたメニュー項目グリッド */}
            <div className="grid grid-cols-2 gap-2.5">
              {filteredItems.map((item) => {
                const ItemIcon = item.icon;
                const isFullWidth = item.fullWidth;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOtherMenuOpen(false)}
                    className={`flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-50 border border-slate-200/90 dark:border-slate-800 shadow-xs ring-1 ring-black/5 dark:ring-white/5 transition-all group active:scale-95 ${
                      isFullWidth ? "col-span-2" : ""
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${item.colorClass}`}>
                      <ItemIcon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold truncate">
                        {item.subtitle}
                      </p>
                    </div>
                    {isFullWidth && (
                      <ChevronRight className="w-4 h-4 text-slate-400 mr-1 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* 📜 法務・規約リンク */}
            <div className="pt-3 border-t border-border/40 flex items-center justify-center gap-3">
              <Link
                href="/liff/terms"
                onClick={() => setIsOtherMenuOpen(false)}
                className="py-1.5 px-3 rounded-full bg-muted/60 hover:bg-muted active:scale-95 border border-border/60 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>利用規約</span>
              </Link>

              <Link
                href="/liff/privacy"
                onClick={() => setIsOtherMenuOpen(false)}
                className="py-1.5 px-3 rounded-full bg-muted/60 hover:bg-muted active:scale-95 border border-border/60 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span>プライバシーポリシー</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
