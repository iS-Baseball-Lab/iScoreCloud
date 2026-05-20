// filepath: src/components/score/ControlPanel.tsx
"use client";

import { useEffect } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";

export function ControlPanel() {
  const { state, recordPitch, recordInPlay, undo, finishMatch, isSyncing } = useScore();

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
    <div className="h-full w-full flex flex-col gap-1.5 p-0 select-none items-stretch">
      
      {/* 🚀 1段目：BSO (日本式配色 ＋ 太枠 ＋ 濃色背景) */}
      <div className="grid grid-cols-4 gap-1.5 h-[35%] shrink-0">
        {/* Ball */}
        <button type="button" onClick={() => recordPitch("ball")} disabled={isSyncing}
          className="h-full bg-emerald-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-emerald-800 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">ボール</span>
        </button>

        {/* Strike (見逃し) */}
        <button type="button" onClick={() => recordPitch("strike")} disabled={isSyncing}
          className="h-full bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-amber-700 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">S</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">見逃</span>
        </button>

        {/* Strike (空振り) */}
        <button type="button" onClick={() => recordPitch("swinging_strike")} disabled={isSyncing}
          className="h-full bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-amber-700 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">S</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">空振</span>
        </button>

        {/* Out */}
        <button type="button" onClick={() => recordPitch("out")} disabled={isSyncing}
          className="h-full bg-rose-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-rose-800 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">O</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">アウト</span>
        </button>
      </div>

      {/* 🚀 2段目：打球結果 (右手親指のアクセスを考慮し、右から単打・二・三・本塁打の順に配置) */}
      <div className="grid grid-cols-4 gap-1.5 h-[35%] shrink-0">
        <button type="button" onClick={() => recordInPlay("本塁打", 0, 1, 0)}
          className="h-full bg-rose-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-rose-800 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">HR</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">本塁打</span>
        </button>
        <button type="button" onClick={() => recordInPlay("三塁打", 0, 1, 0)}
          className="h-full bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-blue-800 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">3B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">三塁打</span>
        </button>
        <button type="button" onClick={() => recordInPlay("二塁打", 0, 1, 0)}
          className="h-full bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-blue-800 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">2B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">二塁打</span>
        </button>
        <button type="button" onClick={() => recordInPlay("単打", 0, 1, 0)}
          className="h-full bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-blue-800 active:scale-95 transition-all">
          <span className="text-xl font-black tracking-tighter leading-none">1B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">単打</span>
        </button>
      </div>

      {/* 🚀 3段目：サブアクション */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 min-h-0 text-zinc-500">
        <button onClick={() => recordPitch("foul")} className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] uppercase">Foul</button>
        <button onClick={() => recordInPlay("エラー", 0, 0, 1)} className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] uppercase">Error</button>
        <button onClick={undo} disabled={isSyncing}
          className="h-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl text-[10px] sm:text-[12px] font-black uppercase tracking-widest active:bg-zinc-300">
          Undo
        </button>
        <button onClick={() => {
            if(window.confirm("試合を終了し、結果を確定しますか？")) {
              finishMatch();
            }
          }} disabled={isSyncing}
          className="h-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border-2 border-rose-500/20 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest active:bg-rose-500/20 leading-tight">
          試合終了
        </button>
      </div>
    </div>
  );
}
