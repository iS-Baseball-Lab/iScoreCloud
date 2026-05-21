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
              // 💡 通知の代わり：最新の1件だけブランドカラーで強力に強調
              isLatest 
                ? "bg-primary text-primary-foreground px-4 py-2.5 rounded-[20px] shadow-lg animate-in fade-in slide-in-from-bottom-2 scale-100 z-10" 
                : "bg-muted/40 text-foreground/60 px-4 py-2 rounded-[18px] border border-border/20 opacity-60"
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

            {/* BSO または 時間(フォールバック) */}
            {bso ? (
              <div className={cn(
                "flex flex-col gap-[2px] shrink-0 text-[8px] font-black leading-none rounded-lg p-1 min-w-[45px] items-start justify-center",
                isLatest ? "bg-white/10" : "bg-zinc-950/20 border border-zinc-800/40"
              )}>
                {/* Ball */}
                <div className="flex gap-1 items-center">
                  <span className={cn("text-[7px] font-extrabold w-2", isLatest ? "text-white" : "text-emerald-400")}>B</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full border",
                          isLatest ? "border-white/20" : "border-emerald-500/30",
                          num <= bso.balls 
                            ? (isLatest ? "bg-white" : "bg-emerald-500 shadow-[0_0_3px_rgba(16,185,129,0.8)]") 
                            : "bg-zinc-950/40"
                        )}
                      />
                    ))}
                  </div>
                </div>
                {/* Strike */}
                <div className="flex gap-1 items-center">
                  <span className={cn("text-[7px] font-extrabold w-2", isLatest ? "text-white" : "text-amber-400")}>S</span>
                  <div className="flex gap-0.5">
                    {[1, 2].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full border",
                          isLatest ? "border-white/20" : "border-amber-500/30",
                          num <= bso.strikes 
                            ? (isLatest ? "bg-white" : "bg-amber-400 shadow-[0_0_3px_rgba(251,191,36,0.8)]") 
                            : "bg-zinc-950/40"
                        )}
                      />
                    ))}
                  </div>
                </div>
                {/* Out */}
                <div className="flex gap-1 items-center">
                  <span className={cn("text-[7px] font-extrabold w-2", isLatest ? "text-white" : "text-rose-500")}>O</span>
                  <div className="flex gap-0.5">
                    {[1, 2].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full border",
                          isLatest ? "border-white/20" : "border-rose-500/30",
                          num <= bso.outs 
                            ? (isLatest ? "bg-white" : "bg-rose-500 shadow-[0_0_3px_rgba(244,63,94,0.8)]") 
                            : "bg-zinc-950/40"
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
