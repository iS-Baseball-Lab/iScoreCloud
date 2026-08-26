// filepath: src/components/liff/LiffBottomNav.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  Calendar, 
  Car, 
  Video, 
  FileText, 
  Trophy,
  LayoutGrid
} from "lucide-react";

export function LiffBottomNav() {
  const pathname = usePathname();

  const isHome = pathname === "/liff";
  const isSchedule = pathname?.startsWith("/liff/schedule");
  const isMatches = pathname?.startsWith("/liff/matches");
  const isCarpool = pathname?.startsWith("/liff/carpool");
  const isStatsOrDocs = pathname?.startsWith("/liff/stats") || pathname?.startsWith("/liff/documents") || pathname?.startsWith("/liff/faq") || pathname?.startsWith("/liff/grounds");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="w-full max-w-lg pointer-events-auto relative">
        
        {/* 🌟 背景ナビゲーションバー本体 */}
        <nav className="relative bg-card/95 backdrop-blur-xl border-t border-border/60 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
          
          <div className="flex items-end justify-between relative h-12 px-1">
            
            {/* 1. 🏠 ホーム */}
            <Link
              href="/liff"
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-all select-none active:scale-90 ${
                isHome
                  ? "text-primary font-black"
                  : "text-muted-foreground hover:text-foreground font-bold"
              }`}
            >
              <Home className={`w-5 h-5 transition-transform ${isHome ? "scale-110" : ""}`} />
              <span className="text-[10px] leading-none tracking-tight">ホーム</span>
            </Link>

            {/* 2. 📅 予定・出欠 */}
            <Link
              href="/liff/schedule"
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-all select-none active:scale-90 ${
                isSchedule
                  ? "text-primary font-black"
                  : "text-muted-foreground hover:text-foreground font-bold"
              }`}
            >
              <Calendar className={`w-5 h-5 transition-transform ${isSchedule ? "scale-110" : ""}`} />
              <span className="text-[10px] leading-none tracking-tight">予定・出欠</span>
            </Link>

            {/* 🌟 3. 中央: 突出した円形フローティングボタン (FAB) */}
            <div className="flex-1 flex flex-col items-center justify-center relative -top-5">
              {/* 白い外側台座 (画像の notch / 円形ベース) */}
              <div className="absolute -top-1.5 w-16 h-16 rounded-full bg-card border-t border-border/40 shadow-sm flex items-center justify-center pointer-events-none" />
              
              <Link
                href="/liff/matches"
                className={`relative z-10 w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-white ${
                  isMatches
                    ? "bg-gradient-to-tr from-primary to-blue-500 shadow-primary/40 ring-4 ring-primary/20"
                    : "bg-gradient-to-tr from-blue-600 via-primary to-sky-500 shadow-blue-500/30 hover:shadow-primary/40"
                }`}
                title="試合動画・スコア"
              >
                <Video className="w-6 h-6 -mb-0.5" />
                <span className="text-[9px] font-black tracking-tighter leading-none mt-0.5">
                  試合動画
                </span>
              </Link>
            </div>

            {/* 4. 🚗 配車・当番 */}
            <Link
              href="/liff/carpool"
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-all select-none active:scale-90 ${
                isCarpool
                  ? "text-primary font-black"
                  : "text-muted-foreground hover:text-foreground font-bold"
              }`}
            >
              <Car className={`w-5 h-5 transition-transform ${isCarpool ? "scale-110" : ""}`} />
              <span className="text-[10px] leading-none tracking-tight">配車表</span>
            </Link>

            {/* 5. 📊 成績・その他 */}
            <Link
              href="/liff/stats"
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-all select-none active:scale-90 ${
                isStatsOrDocs
                  ? "text-primary font-black"
                  : "text-muted-foreground hover:text-foreground font-bold"
              }`}
            >
              <Trophy className={`w-5 h-5 transition-transform ${isStatsOrDocs ? "scale-110" : ""}`} />
              <span className="text-[10px] leading-none tracking-tight">チーム成績</span>
            </Link>

          </div>
        </nav>
      </div>
    </div>
  );
}
