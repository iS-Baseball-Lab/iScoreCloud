// filepath: `src/components/score/PlayArea.tsx`
"use client";

import React from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

export function PlayArea() {
  const { state, updateRunners, recordInPlay, substitutePlayer } = useScore();
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
    <div className="relative w-full max-w-[220px] aspect-square mx-auto mt-16 mb-4">

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

      {/* 守備位置の表示 */}
      <div className="absolute inset-0 pointer-events-none">
        {(() => {
          const defenseLineup = state.isTop 
            ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
            : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
          
          if (!defenseLineup) return null;

          // ポジション番号と座標のマッピング
          const positions: Record<string, { label: string, posClass: string }> = {
            "1": { label: "P", posClass: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" },
            "2": { label: "C", posClass: "bottom-[-5px] left-1/2 -translate-x-1/2" },
            "3": { label: "1B", posClass: "top-[60%] right-[-10px]" },
            "4": { label: "2B", posClass: "top-[25%] right-[20%]" },
            "5": { label: "3B", posClass: "top-[60%] left-[-10px]" },
            "6": { label: "SS", posClass: "top-[25%] left-[20%]" },
            "7": { label: "LF", posClass: "top-[-15%] left-[5%]" },
            "8": { label: "CF", posClass: "top-[-20%] left-1/2 -translate-x-1/2" },
            "9": { label: "RF", posClass: "top-[-15%] right-[5%]" },
          };

          return Object.entries(positions).map(([posNum, { label, posClass }]) => {
            const player = defenseLineup.find(p => p.position === posNum);

            // 野手の表示
            return (
              <div key={posNum} className={`absolute ${posClass} flex flex-col items-center z-10`}>
                <div className="bg-white border border-black/10 dark:border-white/20 rounded-md px-1.5 py-0.5 flex flex-col items-center min-w-[36px] shadow-sm">
                  <span className="text-[6px] font-bold text-black/60">{label}</span>
                  <span className="text-[8px] font-bold text-black truncate max-w-[48px]">
                    {player?.playerName || player?.name || "-"}
                  </span>
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[120%] text-center">
        {(() => {
          const isMyAttack = (state.isTop && state.isGuestFirst) || (!state.isTop && !state.isGuestFirst);
          const offenseLineup = isMyAttack ? state.myLineup : state.opponentLineup;
          const index = isMyAttack ? state.myBattingIndex : state.opponentBattingIndex;
          const batter = offenseLineup && offenseLineup.length > index ? offenseLineup[index] : null;
          const batterName = batter ? (batter.playerName || batter.name || "名称未設定") : "(未設定)";
          
          const searchPrefix = `${index + 1}番`;
          const previousLogs = state.logs.filter(l => l.description.startsWith(searchPrefix) && l.isTop === state.isTop);
          let prevResult = "データなし";
          if (previousLogs.length > 0) {
            const desc = previousLogs[0].description;
            const parts = desc.split(/[:：]/);
            prevResult = parts.length > 1 ? parts[1].trim() : desc;
          }

          const nextIndex = (index + 1) % (offenseLineup?.length || 9);
          const nextBatter = offenseLineup && offenseLineup.length > nextIndex ? offenseLineup[nextIndex] : null;
          const nextBatterName = nextBatter ? (nextBatter.playerName || nextBatter.name || "未設定") : "(未設定)";

          return (
            <div className="flex items-center justify-center w-full gap-1 px-1">
              {/* 前打席 */}
              <div className="flex-1 flex justify-end min-w-0">
                <span className="text-[8px] font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-full truncate max-w-full border border-border/50">
                  前: {prevResult}
                </span>
              </div>

              {/* 現在のバッター */}
              <div className="shrink-0 flex items-center gap-1 bg-primary px-3 py-1 rounded-full shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                <span className="text-[9px] font-black text-primary-foreground/80 uppercase tracking-wider">Bat</span>
                <span className="text-[12px] font-black text-primary-foreground">
                  {`${index + 1}番 ${batterName}`}
                </span>
                {state.isScorer && (
                  <button
                    type="button"
                    className="pointer-events-auto ml-1 bg-white/20 hover:bg-white/30 text-primary-foreground text-[8px] font-bold px-1.5 py-0.5 rounded transition-colors"
                    onClick={() => {
                      const newName = window.prompt("代打の選手名を入力してください");
                      if (newName) {
                        const newId = `sub-${Date.now()}`;
                        substitutePlayer?.(isMyAttack ? 'my' : 'opponent', index, newId, newName);
                      }
                    }}
                  >
                    代打
                  </button>
                )}
              </div>

              {/* NEXTバッター */}
              <div className="flex-1 flex justify-start min-w-0">
                <span className="text-[8px] font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-full truncate max-w-full border border-border/50">
                  次: {nextBatterName}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}
