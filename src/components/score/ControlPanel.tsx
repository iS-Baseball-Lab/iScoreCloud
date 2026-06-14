// filepath: src/components/score/ControlPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { PlayResultModal } from "./PlayResultModal";
import { FinishConfirmModal } from "./FinishConfirmModal";
import type { BaseAdvance, RunnerDestinations } from "@/types/score";

export function ControlPanel() {
  const router = useRouter();
  const { state, recordPitch, recordInPlay, undo, finishMatch, isSyncing } = useScore();
  const [playOpen, setPlayOpen] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
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

  const openPlayWithPreset = (hitType: string) => {
    setDefaultHitType(hitType);
    setPlayOpen(true);
  };

  const handlePlayResult = (
    rawResult: string,
    rbi: number,
    hits: number,
    errors: number,
    coordinate?: { x: number; y: number },
    outRunnerBase?: 1 | 2 | 3 | null,
    runnerDestinations?: RunnerDestinations
  ) => {
    let mappedString = "";

    if (rawResult.includes("-")) {
      const parts = rawResult.split("-");
      const pos = parts[0];
      const resultType = parts[parts.length - 1]; // 1B, 2B, 3B, HR, E, FC, GO, FO, LO, SO_K, SO_M, SH, SF, DP, UN

      const isFoul = parts.includes("FOUL");
      let course: string | null = null;
      let trajectory: string | null = null;

      const modifiers = parts.slice(1, parts.length - 1);
      for (const mod of modifiers) {
        if (["front", "line", "over"].includes(mod)) {
          course = mod;
        } else if (["GO", "FO", "LO", "BUNT"].includes(mod)) {
          trajectory = mod;
        }
      }

      const posMap: Record<string, string> = {
        "1": "投", "2": "捕", "3": "一", "4": "二", "5": "三",
        "6": "遊", "7": "左", "8": "中", "9": "右",
        "78": "左中", "89": "右中", "56": "三遊", "46": "二遊", "34": "一二"
      };

      const courseMap: Record<string, string> = {
        "front": "前", "line": "線", "over": "越"
      };

      const trajMap: Record<string, string> = {
        "GO": "ゴロ", "FO": "飛", "LO": "直", "BUNT": "バ"
      };

      const resultMap: Record<string, string> = {
        "1B": "安", "2B": "二", "3B": "三", "HR": "本", "E": "失", "FC": "選",
        "GO": "ゴロ", "FO": "飛", "LO": "直", "SO_K": "空振り三振", "SO_M": "見逃し三振", "SO_SF": "振り逃げ",
        "SH": "犠打", "SF": "犠飛", "DP": "併殺", "UN": "アウト"
      };

      const posChar = pos.includes(">")
        ? pos.split(">").map(p => posMap[p] || p).join("-")
        : (posMap[pos] || pos);
      const foulChar = isFoul ? "邪" : "";
      const courseChar = course ? (courseMap[course] || "") : "";
      const trajChar = trajectory ? (trajMap[trajectory] || "") : "";
      const resultChar = resultMap[resultType] || resultType;

      if (["GO", "FO", "LO", "SO_K", "SO_M", "SO_SF", "SH", "SF", "DP", "UN"].includes(resultType)) {
        mappedString = `${posChar}${foulChar}${resultChar}`;
      } else {
        mappedString = `${posChar}${courseChar}${trajChar}${resultChar}`;
      }
    } else {
      const quickMap: Record<string, string> = {
        "1B": "単打", "2B": "二塁打", "3B": "三塁打", "HR": "本塁打", "E": "エラー", "FC": "野選",
        "GO": "ゴロアウト", "FO": "フライアウト", "LO": "ライナー",
        "SO_K": "空振り三振", "SO_M": "見逃し三振", "SO_SF": "振り逃げ", "SH": "犠打", "SF": "犠飛", "DP": "併殺打", "UN": "アウト"
      };
      mappedString = quickMap[rawResult] || rawResult;
    }

    recordInPlay(mappedString, rbi, hits, errors, undefined, coordinate, outRunnerBase, runnerDestinations);
    setPlayOpen(false);
  };


  return (
    <div className="h-full w-full flex flex-col gap-1.5 p-0 select-none items-stretch">
      
      {/* 🚀 1段目 (投球・カウント用基本アクション)：高さ 38% */}
      <div className="grid grid-cols-4 gap-1.5 h-[38%] shrink-0">
        {/* Ball */}
        <button 
          type="button" 
          onClick={() => recordPitch("ball")} 
          disabled={isDisabled}
          className="h-full bg-emerald-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-sm border-b-2 border-emerald-800 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-xl font-black tracking-tighter leading-none">B</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">ボール</span>
        </button>

        {/* Strike (見逃し) */}
        <button 
          type="button" 
          onClick={() => recordPitch("strike")} 
          disabled={isDisabled}
          className="h-full bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-sm border-b-2 border-amber-700 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-xl font-black tracking-tighter leading-none">S</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">見逃</span>
        </button>

        {/* Strike (空振り) */}
        <button 
          type="button" 
          onClick={() => recordPitch("swinging_strike")} 
          disabled={isDisabled}
          className="h-full bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-sm border-b-2 border-amber-700 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-xl font-black tracking-tighter leading-none">S</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">空振</span>
        </button>

        {/* Foul */}
        <button 
          type="button" 
          onClick={() => recordPitch("foul")} 
          disabled={isDisabled}
          className="h-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-2xl flex flex-col items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-xl font-black tracking-tighter leading-none">F</span>
          <span className="text-[9px] font-bold opacity-80 mt-0.5">ファウル</span>
        </button>
      </div>

      {/* 🚀 2段目 (主要プレイ結果アクション - 特大サイズ)：高さ 38% */}
      <div className="grid grid-cols-4 gap-1.5 h-[38%] shrink-0">
        {/* 打撃結果 (インプレイ) */}
        <button 
          type="button" 
          onClick={() => openPlayWithPreset("1B")} 
          disabled={isDisabled}
          className="col-span-4 h-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex flex-col items-center justify-center shadow-sm border-b-2 border-blue-800 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-xl font-black tracking-widest leading-none">打撃結果 (インプレイ)</span>
          <span className="text-[9px] font-bold opacity-80 mt-1">安打・ゴロ・飛球・三振などを記録</span>
        </button>
      </div>

      {/* 🚀 3段目 (特殊出塁 & ユーティリティ)：高さ 24% */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 min-h-0 text-zinc-500 h-[24%]">
        {/* 死球 */}
        <button 
          onClick={() => recordPitch("hbp")} 
          disabled={isDisabled}
          className="h-full rounded-2xl border-2 border-amber-500/30 text-amber-600 dark:text-amber-400 font-black text-[10px] sm:text-xs active:bg-amber-500/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 leading-none"
        >
          <span className="font-bold">死球</span>
          <span className="text-[7.5px] opacity-70">HBP / WALK</span>
        </button>

        {/* 失策 (Error) */}
        <button 
          onClick={() => openPlayWithPreset("E")} 
          disabled={isDisabled}
          className="h-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 font-black text-[10px] sm:text-xs text-zinc-700 dark:text-zinc-300 active:bg-zinc-100 dark:active:bg-zinc-900 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 leading-none"
        >
          <span className="font-bold">失策</span>
          <span className="text-[7.5px] opacity-70">ERROR</span>
        </button>

        {/* Undo */}
        <button 
          onClick={undo} 
          disabled={isDisabled}
          className="h-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl text-[10px] sm:text-xs font-black active:bg-zinc-300 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 leading-none"
        >
          <span className="font-bold">戻す</span>
          <span className="text-[7.5px] opacity-70">UNDO</span>
        </button>

        {/* 試合終了 */}
        <button 
          onClick={() => setFinishModalOpen(true)} 
          disabled={isDisabled}
          className="h-full bg-rose-50/50 hover:bg-rose-100/50 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-2 border-rose-500/20 rounded-2xl text-[10px] sm:text-xs font-black active:bg-rose-500/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 leading-tight"
        >
          <span className="font-bold">試合終了</span>
          <span className="text-[7.5px] opacity-70">FINISH</span>
        </button>
      </div>

      {/* モーダル群 */}
      <FinishConfirmModal
        open={finishModalOpen}
        onOpenChange={setFinishModalOpen}
        onConfirmFinish={finishMatch}
        onReturnToDashboard={() => router.push("/dashboard")}
      />
      <PlayResultModal 
        open={playOpen} 
        onOpenChange={setPlayOpen} 
        onResult={handlePlayResult} 
        defaultHitType={defaultHitType}
      />
    </div>
  );
}
