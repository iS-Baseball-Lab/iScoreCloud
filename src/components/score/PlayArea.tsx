// filepath: `src/components/score/PlayArea.tsx`
"use client";

import React from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

export function PlayArea() {
  const { state, updateRunners, recordInPlay } = useScore();
  const { runners } = state;

  // 🌟 究極ポイント：ベースを叩いて状況を操作する
  const handleBaseClick = (baseNum: 1 | 2 | 3) => {
    const key = `base${baseNum}` as keyof typeof runners;
    const isCurrentlyRunner = !!runners[key];
    
    // 現在のランナー状態を反転させる（簡易的な進塁操作）
    const newRunners = {
      ...runners,
      [key]: isCurrentlyRunner ? null : "player-id-placeholder", // 本来は名簿から選択
    };
    
    updateRunners(newRunners);
    
    // 💡 触覚フィードバック（ブラウザが対応していれば）
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  };

  const Base = ({ baseNum, isRunner }: { baseNum: 1 | 2 | 3; isRunner: boolean }) => {
    const positions = {
      1: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
      2: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
      3: "left-0 top-1/2 -translate-y-1/2 -translate-x-1/2",
    };

    return (
      <button
        onClick={() => handleBaseClick(baseNum)}
        className={cn(
          "absolute w-12 h-12 sm:w-14 sm:h-14 transition-all duration-300 z-20 flex items-center justify-center outline-none",
          positions[baseNum]
        )}
      >
        {/* ランナーがいる時の波紋エフェクト */}
        {isRunner && (
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        )}

        <div
          className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 rotate-45 rounded-sm border-2 transition-all duration-500",
            isRunner
              ? "bg-primary border-primary shadow-[0_0_20px_rgba(var(--primary),0.6)] scale-110"
              : "bg-background dark:bg-zinc-900 border-muted-foreground/30 dark:border-white/10 opacity-80"
          )}
        >
          {/* ベース内部のデザイン */}
          <div className="absolute inset-[2px] border border-black/5 dark:border-white/10 rounded-sm" />
          
          {/* ランナーがいる時だけ表示される背番号風ドット */}
          {isRunner && (
            <div className="-rotate-45 h-full w-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="relative w-full max-w-[280px] aspect-square mx-auto my-8">

      {/* 🏟 ダイヤモンド（土のライン） */}
      <div className="absolute inset-4 border-[3px] border-dashed border-primary/20 dark:border-white/10 rotate-45 rounded-sm shadow-inner" />

      {/* 各ベース（インタラクティブ） */}
      <Base baseNum={1} isRunner={!!runners.base1} />
      <Base baseNum={2} isRunner={!!runners.base2} />
      <Base baseNum={3} isRunner={!!runners.base3} />

      {/* 🏠 ホームベース（戻り値：得点への意志） */}
      <button 
        onClick={() => {
          recordInPlay("得点", 1, 0, 0);
          if (runners.base3) {
            updateRunners({ ...runners, base3: null });
          }
          if (window.navigator.vibrate) window.navigator.vibrate(20);
        }}
        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-12 h-12 flex flex-col items-center group active:scale-90 transition-transform cursor-pointer outline-none"
      >
        <div className="w-9 h-6 bg-white dark:bg-zinc-100 border-2 border-muted-foreground/30 shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
        <div className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-t-[14px] border-t-white dark:border-t-zinc-100 relative -mt-[2px]" />
      </button>

      {/* 投球・打者情報（浮遊感のあるモダンなバッジ） */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl scale-[3]" />
          <div className="relative bg-card/40 dark:bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full px-5 py-2 flex flex-col items-center gap-0.5 shadow-2xl">
            <span className="text-[7px] font-black text-primary/60 uppercase tracking-[0.2em]">Pitcher</span>
            <span className="text-[10px] font-black text-foreground tracking-tighter">
              {(() => {
                const defenseLineup = state.isTop 
                  ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
                  : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
                const pitcher = defenseLineup?.find(p => p.position === "1");
                return pitcher?.name || "未設定";
              })()}
            </span>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-full text-center pointer-events-none">
        <div className="inline-flex flex-col items-center gap-1">
          <div className="bg-primary px-4 py-1 rounded-full shadow-[0_0_15px_rgba(var(--primary),0.4)]">
            <span className="text-[10px] font-black text-primary-foreground tracking-widest uppercase">Batter Up</span>
          </div>
          <p className="text-[12px] font-black text-foreground mt-1">
            {(() => {
              const offenseLineup = state.isTop 
                ? (state.isGuestFirst ? state.myLineup : state.opponentLineup)
                : (state.isGuestFirst ? state.opponentLineup : state.myLineup);
              const batter = offenseLineup?.find(p => p.order === 1); // 簡易的に1番打者を表示（本来は打順計算が必要）
              return batter?.name || "未設定";
            })()}
          </p>
        </div>
      </div>

    </div>
  );
}
