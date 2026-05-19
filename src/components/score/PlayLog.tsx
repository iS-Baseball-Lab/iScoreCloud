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

  return (
    <div className="flex flex-col gap-1.5 h-full overflow-hidden">
      {displayLogs.map((log, index) => {
        const isLatest = index === 0;
        // 簡易的な判定ロジック
        const isScore = log.description.includes("得点") || log.description.includes("SCORE");
        const isOut = log.description.includes("三振") || log.description.includes("アウト");
        const isHit = log.description.includes("安打") || log.description.includes("塁打") || log.description.includes("単打") || log.description.includes("HIT");

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
                {log.description}
              </span>
              {isHit && <ArrowUpRight className="h-3 w-3 text-blue-400 shrink-0" />}
              {isScore && <Trophy className="h-3 w-3 text-yellow-400 shrink-0" />}
              {isOut && <Circle className="h-2 w-2 fill-rose-500 text-rose-500 shrink-0" />}
            </div>

            {/* 時間 */}
            <span className="text-[8px] font-mono opacity-40 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
