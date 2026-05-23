// filepath: src/components/score/ControlPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { FieldModal } from "./FieldModal";
import { OutDetailModal } from "./OutDetailModal";
import type { BaseAdvance } from "@/types/score";

export function ControlPanel() {
  const { state, recordPitch, recordInPlay, undo, finishMatch, isSyncing } = useScore();
  const [fieldOpen, setFieldOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [defaultHitType, setDefaultHitType] = useState<string>("1B");

  const isDisabled = isSyncing || !state.isScorer;

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

  const openFieldWithPreset = (hitType: string) => {
    setDefaultHitType(hitType);
    setFieldOpen(true);
  };

  const handleOutResult = (rawResult: string, rbi: number) => {
    let mappedString = "";

    if (rawResult.includes("-")) {
      const [pos, outType] = rawResult.split("-");
      
      const posMap: Record<string, string> = {
        "1": "投", "2": "捕", "3": "一", "4": "二", "5": "三",
        "6": "遊", "7": "左", "8": "中", "9": "右"
      };

      const outMap: Record<string, string> = {
        "GO": "ゴロ",
        "FO": "飛",
        "LO": "直",
        "SO_K": "空振り三振",
        "SO_M": "見逃し三振",
        "SH": "犠打",
        "SF": "犠飛",
        "DP": "併殺",
        "UN": "アウト"
      };

      const posChar = posMap[pos] || pos;
      const outChar = outMap[outType] || outType;
      mappedString = `${posChar}${outChar}`;
    } else {
      const outType = rawResult;
      const quickMap: Record<string, string> = {
        "GO": "ゴロアウト",
        "FO": "フライアウト",
        "LO": "ライナー",
        "SO_K": "空振り三振",
        "SO_M": "見逃し三振",
        "SH": "犠打",
        "SF": "犠飛",
        "DP": "併殺打",
        "UN": "アウト"
      };
      mappedString = quickMap[outType] || outType;
    }

    recordInPlay(mappedString, rbi, 0, 0);
  };

  const handleFieldResult = (rawResult: string, rbi: number, advances?: BaseAdvance[]) => {
    let mappedString = "";
    let isHit = false;
    let isError = false;

    if (rawResult.includes("-")) {
      const [pos, hit] = rawResult.split("-");
      
      // ポジションマッピング (1-9)
      const posMap: Record<string, string> = {
        "1": "投", "2": "捕", "3": "一", "4": "二", "5": "三",
        "6": "遊", "7": "左", "8": "中", "9": "右"
      };

      // 結果種別マッピング
      const hitMap: Record<string, string> = {
        "GO": "ゴロ",
        "FO": "飛",
        "1B": "安",
        "2B": "二",
        "3B": "三",
        "HR": "本",
        "SH": "犠打",
        "SF": "犠飛",
        "E": "失"
      };

      const posChar = posMap[pos] || pos;
      const hitChar = hitMap[hit] || hit;
      mappedString = `${posChar}${hitChar}`;

      isHit = ["1B", "2B", "3B", "HR"].includes(hit);
      isError = hit === "E";
    } else {
      // クイック記録（守備位置なし）
      const hitType = rawResult;
      const quickMap: Record<string, string> = {
        "GO": "ゴロ",
        "FO": "飛球",
        "1B": "単打",
        "2B": "二塁打",
        "3B": "三塁打",
        "HR": "本塁打",
        "SH": "犠打",
        "SF": "犠飛",
        "E": "エラー"
      };
      mappedString = quickMap[hitType] || hitType;
      isHit = ["1B", "2B", "3B", "HR"].includes(hitType);
      isError = hitType === "E";
    }

    const hitsCount = isHit ? 1 : 0;
    const errorsCount = isError ? 1 : 0;

    recordInPlay(mappedString, rbi, hitsCount, errorsCount);
    setFieldOpen(false);
  };

  return (
    <div className="h-full w-full flex flex-col gap-1.5 p-0 select-none items-stretch">
      
      {/* 🚀 1段目 (アウト・ストライク・ボール)：高さ 38% */}
      <div className="grid grid-cols-4 gap-1.5 h-[38%] shrink-0">
        {/* Out */}
        <button 
          type="button" 
          onClick={() => setOutOpen(true)} 
          disabled={isDisabled}
          className="h-full bg-rose-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-rose-800 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">O</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">アウト</span>
        </button>

        {/* Strike (見逃し) */}
        <button 
          type="button" 
          onClick={() => recordPitch("strike")} 
          disabled={isDisabled}
          className="h-full bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-amber-700 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">S</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">見逃</span>
        </button>

        {/* Strike (空振り) */}
        <button 
          type="button" 
          onClick={() => recordPitch("swinging_strike")} 
          disabled={isDisabled}
          className="h-full bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-amber-700 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">S</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">空振</span>
        </button>

        {/* Ball */}
        <button 
          type="button" 
          onClick={() => recordPitch("ball")} 
          disabled={isDisabled}
          className="h-full bg-emerald-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-emerald-800 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">ボール</span>
        </button>
      </div>

      {/* 🚀 2段目 (安打モーダル連動)：高さ 38% */}
      <div className="grid grid-cols-4 gap-1.5 h-[38%] shrink-0">
        <button 
          type="button" 
          onClick={() => openFieldWithPreset("HR")} 
          disabled={isDisabled}
          className="h-full bg-rose-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-rose-800 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">HR</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">本塁打</span>
        </button>
        <button 
          type="button" 
          onClick={() => openFieldWithPreset("3B")} 
          disabled={isDisabled}
          className="h-full bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-blue-800 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">3B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">三塁打</span>
        </button>
        <button 
          type="button" 
          onClick={() => openFieldWithPreset("2B")} 
          disabled={isDisabled}
          className="h-full bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-blue-800 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">2B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">二塁打</span>
        </button>
        <button 
          type="button" 
          onClick={() => openFieldWithPreset("1B")} 
          disabled={isDisabled}
          className="h-full bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-md border-b-2 border-blue-800 active:scale-95 transition-all"
        >
          <span className="text-xl font-black tracking-tighter leading-none">1B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">単打</span>
        </button>
      </div>

      {/* 🚀 3段目 (ユーティリティ)：高さ 24% */}
      <div className="flex-1 grid grid-cols-5 gap-1.5 min-h-0 text-zinc-500 h-[24%]">
        <button 
          onClick={() => recordPitch("foul")} 
          disabled={isDisabled}
          className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] uppercase active:bg-zinc-100 dark:active:bg-zinc-900 transition-colors"
        >
          Foul
        </button>
        <button 
          onClick={() => recordPitch("hbp")} 
          disabled={isDisabled}
          className="h-full rounded-2xl border-2 border-amber-500/30 text-amber-600 dark:text-amber-400 font-black text-[10px] uppercase active:bg-amber-500/10 transition-colors"
        >
          HBP
        </button>
        <button 
          onClick={() => openFieldWithPreset("E")} 
          disabled={isDisabled}
          className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] uppercase active:bg-zinc-100 dark:active:bg-zinc-900 transition-colors"
        >
          Error
        </button>
        <button 
          onClick={undo} 
          disabled={isDisabled}
          className="h-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl text-[10px] sm:text-[12px] font-black uppercase tracking-widest active:bg-zinc-300 transition-colors"
        >
          Undo
        </button>
        <button 
          onClick={() => {
            if(window.confirm("試合を終了し、結果を確定しますか？")) {
              finishMatch();
            }
          }} 
          disabled={isDisabled}
          className="h-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border-2 border-rose-500/20 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest active:bg-rose-500/20 leading-tight transition-colors"
        >
          試合終了
        </button>
      </div>

      {/* モーダル群 */}
      <FieldModal 
        open={fieldOpen} 
        onOpenChange={setFieldOpen} 
        onResult={handleFieldResult} 
        defaultHitType={defaultHitType}
      />
      <OutDetailModal 
        open={outOpen} 
        onOpenChange={setOutOpen} 
        onResult={handleOutResult} 
      />
    </div>
  );
}
