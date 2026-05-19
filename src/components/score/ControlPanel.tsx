// filepath: `src/components/score/ControlPanel.tsx`
"use client";

import { useEffect } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";

export function ControlPanel() {
  const { state, recordPitch, recordInPlay, changeInning, isSyncing } = useScore();

  useEffect(() => {
    const className = "hide-global-fab";
    if (typeof document !== "undefined") {
      document.body.classList.add(className);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove(className);
      }
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col gap-2 p-0 select-none items-stretch">
      
      {/* 🚀 1段目：BSO (日本式配色 ＋ 太枠 ＋ 濃色背景) */}
      <div className="grid grid-cols-3 gap-2 h-[46%] shrink-0">
        {/* Ball */}
        <button type="button" onClick={() => recordPitch("ball")} disabled={isSyncing}
          className="h-full w-full flex flex-col items-center justify-center gap-2 border-4 border-emerald-600/50 bg-emerald-100 dark:bg-emerald-900/40 rounded-3xl active:bg-emerald-600 transition-all shadow-sm">
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className={cn("w-4.5 h-4.5 rounded-full border-2", i <= state.balls ? "bg-emerald-500 border-emerald-300 shadow-[0_0_15px_#10b981]" : "bg-emerald-950/20 border-emerald-600/30")} />
            ))}
          </div>
          <span className="text-4xl font-black italic text-emerald-800 dark:text-emerald-300">B</span>
        </button>

        {/* Strike */}
        <button type="button" onClick={() => recordPitch("strike")} disabled={isSyncing}
          className="h-full w-full flex flex-col items-center justify-center gap-2 border-4 border-amber-500/50 bg-amber-100 dark:bg-amber-900/40 rounded-3xl active:bg-amber-500 transition-all shadow-sm">
          <div className="flex gap-2">
            {[1, 2].map(i => (
              <div key={i} className={cn("w-4.5 h-4.5 rounded-full border-2", i <= state.strikes ? "bg-amber-400 border-amber-200 shadow-[0_0_15px_#fbbf24]" : "bg-amber-950/20 border-amber-500/30")} />
            ))}
          </div>
          <span className="text-4xl font-black italic text-amber-800 dark:text-amber-300">S</span>
        </button>

        {/* Out */}
        <button type="button" onClick={() => recordPitch("out")} disabled={isSyncing}
          className="h-full w-full flex flex-col items-center justify-center gap-2 border-4 border-rose-600/50 bg-rose-100 dark:bg-rose-900/40 rounded-3xl active:bg-rose-600 transition-all shadow-sm">
          <div className="flex gap-2">
            {[1, 2].map(i => (
              <div key={i} className={cn("w-4.5 h-4.5 rounded-full border-2", i <= state.outs ? "bg-rose-500 border-rose-300 shadow-[0_0_15px_#f43f5e]" : "bg-rose-950/20 border-rose-600/30")} />
            ))}
          </div>
          <span className="text-4xl font-black italic text-rose-800 dark:text-rose-300">O</span>
        </button>
      </div>

      {/* 🚀 2段目：打球結果 (🌟 動的得点振分けロジック) */}
      <div className="grid grid-cols-4 gap-2 h-[35%] shrink-0">
        <button type="button" onClick={() => recordInPlay("単打", 0, 1, 0)}
          className="col-span-2 h-full bg-zinc-950 dark:bg-zinc-100 text-white dark:text-black rounded-3xl flex flex-col items-center justify-center shadow-xl active:scale-95 transition-all">
          <span className="text-3xl font-black italic tracking-tighter">HIT</span>
        </button>

        <button type="button" 
          onClick={() => {
            recordInPlay("得点", 1, 0, 0);
          }}
          className="col-span-2 h-full bg-blue-700 text-white rounded-3xl flex flex-col items-center justify-center shadow-xl border-b-4 border-blue-900 active:scale-95 transition-all"
        >
          <span className="text-xl font-black italic leading-none">SCORE</span>
          <span className="text-3xl font-black mt-1">+1</span>
        </button>
      </div>

      {/* 🚀 3段目：サブアクション */}
      <div className="flex-1 grid grid-cols-4 gap-2 min-h-0 text-zinc-500">
        <button onClick={() => recordPitch("foul")} className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] uppercase">Foul</button>
        <button onClick={() => recordInPlay("エラー", 0, 0, 1)} className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] uppercase">Error</button>
        <button onClick={changeInning} disabled={isSyncing}
          className="col-span-2 h-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl text-[12px] font-black uppercase tracking-[0.3em] active:bg-zinc-300">
          Change
        </button>
      </div>
    </div>
  );
}
