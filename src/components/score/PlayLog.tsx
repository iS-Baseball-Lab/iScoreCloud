// filepath: `src/components/score/PlayLog.tsx`
/* 💡 Contextのstate.logsを直接参照し、入力の瞬間(0秒)でフィードバックを返す。 */

"use client";

import React, { useMemo } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { History, Trophy, ArrowUpRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayLogProps {
  limit?: number;
}

export function PlayLog({ limit = 3 }: PlayLogProps) {
  const { state } = useScore();

  // 💡 修正の肝: APIフェッチではなく、Contextのstate.logsを直接使う
  const displayLogs = useMemo(() => {
    return limit ? state.logs.slice(0, limit) : state.logs;
  }, [state.logs, limit]);

  if (displayLogs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center opacity-30">
        <div className="text-center">
          <History className="h-6 w-6 mx-auto mb-1 stroke-[1px]" />
          <p className="text-[8px] font-black uppercase tracking-widest">Ready</p>
        </div>
      </div>
    );
  }

  const parseLogDescription = (desc: string) => {
    const bsoMatch = desc.match(/\s\[B:(\d+),\s*S:(\d+),\s*O:(\d+)\]$/);
    if (bsoMatch) {
      const balls = parseInt(bsoMatch[1], 10);
      const strikes = parseInt(bsoMatch[2], 10);
      const outs = parseInt(bsoMatch[3], 10);
      const cleanDesc = desc.replace(/\s\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "");
      return { cleanDesc, bso: { balls, strikes, outs } };
    }
    return { cleanDesc: desc, bso: null };
  };

  return (
    <div className="flex flex-col gap-1.5 h-full overflow-hidden">
      {displayLogs.map((log, index) => {
        const isLatest = index === 0;
        const { cleanDesc, bso } = parseLogDescription(log.description);
        
        // 簡易的な判定ロジック
        const isScore = cleanDesc.includes("得点") || cleanDesc.includes("SCORE");
        const isOut = cleanDesc.includes("三振") || cleanDesc.includes("アウト");
        const isHit = cleanDesc.includes("安打") || cleanDesc.includes("塁打") || cleanDesc.includes("単打") || cleanDesc.includes("HIT");

        return (
          <div
            key={log.id}
            className={cn(
              "relative flex items-center gap-3 transition-all duration-300",
              // 💡 ユーザー要望: 先頭行をメタリックグラデーション&境界光彩でプレミアム化し、通常行もガラス調ダークで灰色のチープさを払拭
              isLatest 
                ? "bg-gradient-to-r from-primary/95 to-primary/80 text-primary-foreground px-4 py-2.5 rounded-[20px] shadow-lg shadow-primary/20 border border-white/10 animate-playlog-slide-in z-10" 
                : "bg-zinc-100/50 dark:bg-zinc-900/30 text-foreground/75 px-4 py-2 rounded-[18px] border border-zinc-200/55 dark:border-zinc-800/30 opacity-75 hover:opacity-100 hover:scale-[1.005] transition-all"
            )}
          >
            {/* イニング (例: 1T) */}
            <div className={cn(
              "flex items-center justify-center min-w-[28px] h-5 rounded-full text-[9px] font-black italic border",
              isLatest ? "bg-white/20 border-white/30" : "bg-background border-border"
            )}>
              {log.inning}{log.isTop ? "T" : "B"}
            </div>

            {/* 説明 */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className={cn(
                "font-black tracking-tighter truncate",
                limit === 1 ? "text-[14px]" : "text-[12px]"
              )}>
                {cleanDesc}
              </span>
              {isHit && <ArrowUpRight className="h-3 w-3 text-blue-400 shrink-0" />}
              {isScore && <Trophy className="h-3 w-3 text-yellow-400 shrink-0" />}
              {isOut && <Circle className="h-2 w-2 fill-rose-500 text-rose-500 shrink-0" />}
            </div>

            {/* BSO または 時間(フォールバック) - 💡 極上漆黒バックスクリーン風カプセルデザイン */}
            {bso ? (
              <div className={cn(
                "flex items-center gap-2 shrink-0 rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-tighter shadow-md transition-all duration-300",
                isLatest 
                  ? "bg-black/35 text-white border border-white/15" 
                  : "bg-zinc-950/70 border border-zinc-200/20 dark:border-zinc-800/50 text-foreground"
              )}>
                {/* Ball */}
                <div className="flex gap-1 items-center">
                  <span className="text-emerald-500 font-extrabold text-[8px]">B</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full border transition-all duration-300",
                          num <= bso.balls 
                            ? "bg-emerald-500 border-emerald-500 shadow-[0_0_8px_#10b981]" 
                            : "bg-zinc-900 border-zinc-800/60"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <span className="opacity-20 text-[8px] font-light text-zinc-500">|</span>

                {/* Strike */}
                <div className="flex gap-1 items-center">
                  <span className="text-amber-400 font-extrabold text-[8px]">S</span>
                  <div className="flex gap-0.5">
                    {[1, 2].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full border transition-all duration-300",
                          num <= bso.strikes 
                            ? "bg-amber-400 border-amber-400 shadow-[0_0_8px_#fbbf24]" 
                            : "bg-zinc-900 border-zinc-800/60"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <span className="opacity-20 text-[8px] font-light text-zinc-500">|</span>

                {/* Out */}
                <div className="flex gap-1 items-center">
                  <span className="text-rose-500 font-extrabold text-[8px]">O</span>
                  <div className="flex gap-0.5">
                    {[1, 2].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full border transition-all duration-300",
                          num <= bso.outs 
                            ? "bg-rose-500 border-rose-500 shadow-[0_0_8px_#f43f5e]" 
                            : "bg-zinc-900 border-zinc-800/60"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-[8px] font-mono opacity-40 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
