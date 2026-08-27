// filepath: src/components/liff/LiffBottomNav.tsx
"use client";

import React, { useState } from "react";
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
  Calendar,
  LayoutGrid,
} from "lucide-react";

export function LiffBottomNav() {
  const pathname = usePathname();
  const [isOtherMenuOpen, setIsOtherMenuOpen] = useState(false);

  const isHome = pathname === "/liff";
  const isStats = pathname?.startsWith("/liff/stats");
  const isMatches = pathname?.startsWith("/liff/matches");
  const isSearch = pathname?.startsWith("/liff/grounds");
  const isOther = isOtherMenuOpen || pathname?.startsWith("/liff/documents") || pathname?.startsWith("/liff/faq") || pathname?.startsWith("/liff/carpool") || pathname?.startsWith("/liff/schedule");

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

            {/* 🌟 中央: 青い円形試合情報ボタン */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-20">
              <Link
                href="/liff/matches"
                onClick={() => setIsOtherMenuOpen(false)}
                className={`w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-white bg-gradient-to-tr from-[#0066EE] via-[#0088FF] to-[#00B4D8] shadow-[#0080FF]/35 ${
                  isMatches && !isOtherMenuOpen 
                    ? "ring-3 ring-[#0080FF]/30 scale-105" 
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
                    ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
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
                    ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
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
                    ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <MapPin className={`w-5 h-5 transition-transform ${isSearch && !isOtherMenuOpen ? "scale-110" : ""}`} />
                <span className="text-[9.5px] leading-none tracking-tight">球場 & 施設</span>
              </Link>

              {/* ⑤ ⋯ その他 */}
              <button
                type="button"
                onClick={() => setIsOtherMenuOpen((prev) => !prev)}
                className={`flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-90 ${
                  isOtherMenuOpen || isOther
                    ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <Menu className={`w-5 h-5 transition-transform ${isOtherMenuOpen ? "rotate-90 scale-110" : ""}`} />
                <span className="text-[10px] leading-none tracking-tight">その他</span>
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

          <div className="w-full max-w-lg bg-card rounded-t-3xl border-t border-x border-border shadow-2xl p-5 pb-28 space-y-4 relative z-10 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-[#0080FF]" />
                <h4 className="text-sm font-black text-foreground">すべてのメニュー</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsOtherMenuOpen(false)}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 🌟 すべてのメニュー項目 (全8機能) */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* ① 🏠 ホーム */}
              <Link
                href="/liff"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Home className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">ホーム</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">トップページ</p>
                </div>
              </Link>

              {/* ② 🏆 チーム成績 */}
              <Link
                href="/liff/stats"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Trophy className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">チーム成績</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">勝敗・打撃個人成績</p>
                </div>
              </Link>

              {/* ③ 📹 試合情報 */}
              <Link
                href="/liff/matches"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Video className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">試合情報</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">試合動画 & スコア</p>
                </div>
              </Link>

              {/* ④ 📍 球場 & 施設 */}
              <Link
                href="/liff/grounds"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <MapPin className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">球場 & 施設</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">アクセス・駐車場</p>
                </div>
              </Link>

              {/* ⑤ 📅 予定 & 欠席 */}
              <Link
                href="/liff/schedule"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Calendar className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">予定 & 欠席</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">当番・出欠確認</p>
                </div>
              </Link>

              {/* ⑥ 🚗 配車表 */}
              <Link
                href="/liff/carpool"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Car className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">配車表</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">乗車割り・集合時間</p>
                </div>
              </Link>

              {/* ⑦ 📄 資料ダウンロード */}
              <Link
                href="/liff/documents"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">資料ダウンロード</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">規約・配車マニュアル</p>
                </div>
              </Link>

              {/* ⑧ ❓ よくある質問 */}
              <Link
                href="/liff/faq"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <HelpCircle className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">よくある質問</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">雨天判断・用具規定</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
