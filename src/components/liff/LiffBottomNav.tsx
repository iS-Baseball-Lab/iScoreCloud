// filepath: src/components/liff/LiffBottomNav.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  Trophy, 
  Video, 
  Search, 
  Menu, 
  X,
  Car,
  FileText,
  HelpCircle,
  Calendar,
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
          
          {/* 🌟 100%真円幾何学ドーム ＆ 逆角丸フィレットによる完全なノッチ */}
          <div className="relative w-full select-none">
            
            {/* ① 中央の白い真円ドーム台座（直径68px） */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-6 w-[70px] h-[70px] rounded-full bg-card border-t border-border/80 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-0 pointer-events-none" />

            {/* ② 左側の滑らかな逆角丸フィレット (S字トランジション) */}
            <div className="absolute right-1/2 mr-[32px] -top-3 w-4 h-3 pointer-events-none overflow-hidden z-0">
              <div className="w-8 h-8 rounded-full border-r border-b border-border/80 bg-card -translate-x-4 -translate-y-5 shadow-[4px_4px_0_0_hsl(var(--card))]" />
            </div>

            {/* ③ 右側の滑らかな逆角丸フィレット (S字トランジション) */}
            <div className="absolute left-1/2 ml-[32px] -top-3 w-4 h-3 pointer-events-none overflow-hidden z-0">
              <div className="w-8 h-8 rounded-full border-l border-b border-border/80 bg-card translate-x-0 -translate-y-5 shadow-[-4px_4px_0_0_hsl(var(--card))]" />
            </div>

            {/* ④ メインの水平ナビゲーションバー */}
            <nav className="relative bg-card border-t border-border/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-10">
              
              {/* 中央の青い円形突出ボタン (FAB) - 真円ドームと同心円 (直径58px, 均等6pxマージン) */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-30">
                <Link
                  href="/liff/matches"
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`w-[58px] h-[58px] rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-white bg-gradient-to-tr from-[#0066EE] via-[#0088FF] to-[#00B4D8] shadow-[#0080FF]/35 ${
                    isMatches && !isOtherMenuOpen 
                      ? "ring-4 ring-[#0080FF]/30 scale-105" 
                      : "hover:brightness-110"
                  }`}
                  title="試合情報"
                >
                  <Video className="w-5 h-5 -mb-0.5" />
                  <span className="text-[9px] font-black tracking-tighter leading-none mt-1">
                    試合情報
                  </span>
                </Link>
              </div>

              {/* 5分割メニューグリッド */}
              <div className="grid grid-cols-5 h-[56px] items-center px-1">
                
                {/* 1. 🏠 ホーム */}
                <Link
                  href="/liff"
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all select-none active:scale-90 ${
                    isHome && !isOtherMenuOpen
                      ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Home className={`w-5 h-5 transition-transform ${isHome && !isOtherMenuOpen ? "scale-110" : ""}`} />
                  <span className="text-[10px] leading-none tracking-tight">ホーム</span>
                </Link>

                {/* 2. 🏆 チーム成績 */}
                <Link
                  href="/liff/stats"
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all select-none active:scale-90 ${
                    isStats && !isOtherMenuOpen
                      ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Trophy className={`w-5 h-5 transition-transform ${isStats && !isOtherMenuOpen ? "scale-110" : ""}`} />
                  <span className="text-[10px] leading-none tracking-tight">チーム成績</span>
                </Link>

                {/* 3. 中央プレースホルダー（FABボタンの空間） */}
                <div className="pointer-events-none" />

                {/* 4. 🔍 検索 */}
                <Link
                  href="/liff/grounds"
                  onClick={() => setIsOtherMenuOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all select-none active:scale-90 ${
                    isSearch && !isOtherMenuOpen
                      ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Search className={`w-5 h-5 transition-transform ${isSearch && !isOtherMenuOpen ? "scale-110" : ""}`} />
                  <span className="text-[10px] leading-none tracking-tight">検索</span>
                </Link>

                {/* 5. ⋯ その他 */}
                <button
                  type="button"
                  onClick={() => setIsOtherMenuOpen((prev) => !prev)}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all select-none active:scale-90 ${
                    isOtherMenuOpen || isOther
                      ? "text-[#0080FF] dark:text-[#38bdf8] font-black"
                      : "text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <Menu className={`w-5 h-5 transition-transform ${isOtherMenuOpen ? "rotate-90 scale-110" : ""}`} />
                  <span className="text-[10px] leading-none tracking-tight">その他</span>
                </button>

              </div>

              {/* iPhone セーフエリア下部余白 */}
              <div className="h-[max(env(safe-area-inset-bottom),8px)]" />

            </nav>

          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📑 「その他」タップ時のボトムシートメニュー
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isOtherMenuOpen && (
        <div className="fixed inset-0 z-40 flex justify-center items-end bg-background/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="absolute inset-0"
            onClick={() => setIsOtherMenuOpen(false)}
          />

          <div className="w-full max-w-lg bg-card rounded-t-3xl border-t border-x border-border shadow-2xl p-5 pb-28 space-y-4 relative z-10 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0080FF]" />
                <h4 className="text-sm font-black text-foreground">その他のメニュー</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsOtherMenuOpen(false)}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* 📅 予定 & 出欠 */}
              <Link
                href="/liff/schedule"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Calendar className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">予定 & 出欠</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">当番・出欠確認</p>
                </div>
              </Link>

              {/* 🚗 配車表 */}
              <Link
                href="/liff/carpool"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <Car className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">配車表</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">乗車割り・集合時間</p>
                </div>
              </Link>

              {/* 📄 資料ダウンロード */}
              <Link
                href="/liff/documents"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 hover:bg-muted border border-border/60 transition-all group"
              >
                <span className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black shrink-0 group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">資料ダウンロード</p>
                  <p className="text-[10px] text-muted-foreground font-bold truncate">規約・遠征のしおり</p>
                </div>
              </Link>

              {/* ❓ よくある質問 */}
              <Link
                href="/liff/faq"
                onClick={() => setIsOtherMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 hover:bg-muted border border-border/60 transition-all group"
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
