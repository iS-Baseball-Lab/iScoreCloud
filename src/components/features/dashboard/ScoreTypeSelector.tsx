// filepath: `src/components/features/dashboard/ScoreTypeSelector.tsx`
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const ScoreTypeSelector = () => {
  const router = useRouter();
  const cardStyle = "rounded-3xl";

  // 💡 共通の文字間隔スタイル
  const titleTracking = "tracking-[0.25em] sm:tracking-[0.4em]";

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 px-1">
      {/* --- Live Score --- */}
      <button
        onClick={() => router.push('/matches/create?mode=live')}
        className={cn(
          "relative group overflow-hidden flex flex-col items-center justify-center p-5 sm:p-8 transition-all active:scale-[0.96]",
          "bg-primary text-primary-foreground shadow-sm shadow-primary/20 border border-white/10",
          cardStyle
        )}
      >
        <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform duration-500">
          <PencilLine className="w-24 h-24 sm:w-28 sm:h-28 rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col items-center text-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
            <PencilLine className="h-7 w-7 sm:h-9 sm:w-9 text-white" />
          </div>
          <div className="space-y-2 sm:space-y-3">
            <h3 className={cn(
              "text-sm sm:text-xl font-black uppercase leading-tight pl-[0.15em] sm:pl-[0.2em]",
              titleTracking
            )}>
              Live Score
            </h3>
            {/* 💡 whitespace-nowrapを外し、美しい2行のキャッチコピーに */}
            <p className="text-[9px] sm:text-[10px] font-bold text-primary-foreground/80 tracking-[0.05em] leading-relaxed">
              次世代リアルタイム<br />スコア入力
            </p>
          </div>
        </div>
      </button>

      {/* --- Quick Score --- */}
      <button
        onClick={() => router.push('/matches/create?mode=quick')}
        className={cn(
          "relative group overflow-hidden flex flex-col items-center justify-center p-5 sm:p-8 transition-all active:scale-[0.96]",
          "bg-card border-[3px] sm:border-[4px] border-primary text-foreground shadow-sm",
          cardStyle
        )}
      >
        <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform duration-500">
          <Zap className="w-24 h-24 sm:w-28 sm:h-28 rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col items-center text-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
            <Zap className="h-7 w-7 sm:h-9 sm:w-9 text-amber-600" />
          </div>
          <div className="space-y-2 sm:space-y-3">
            <h3 className={cn(
              "text-sm sm:text-xl font-black uppercase leading-tight pl-[0.15em] sm:pl-[0.2em]",
              titleTracking
            )}>
              Quick Score
            </h3>
            {/* 💡 こちらも2行のコピーに最適化 */}
            <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground tracking-[0.05em] leading-relaxed">
              超簡単<br />イニングスコア入力
            </p>
          </div>
        </div>
      </button>
    </div>
  );
};
