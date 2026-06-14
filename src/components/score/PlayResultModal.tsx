// filepath: src/components/score/PlayResultModal.tsx
"use client";

import { useState, useEffect } from "react";
import type { BaseAdvance, RunnerDestinations } from "@/types/score";
import { useScore } from "@/contexts/ScoreContext";
import { createPortal } from "react-dom";
import { Minus, Plus, Check, Target, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlayResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (
    result: string,
    rbi: number,
    hits: number,
    errors: number,
    coordinate?: { x: number; y: number },
    outRunnerBase?: 1 | 2 | 3 | null,
    runnerDestinations?: RunnerDestinations
  ) => void;
  defaultHitType?: string;
}

export function PlayResultModal({ open, onOpenChange, onResult, defaultHitType }: PlayResultModalProps) {
  const { state } = useScore();
  const { runners } = state;

  const [selectedPosList, setSelectedPosList] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"onbase" | "out">("onbase");
  const [playResult, setPlayResult] = useState<string>("1B"); // デフォルトは単打
  const [course, setCourse] = useState<"front" | "line" | "over" | null>(null);
  const [trajectory, setTrajectory] = useState<"GO" | "FO" | "LO" | "BUNT" | null>(null);
  const [isFoul, setIsFoul] = useState(false);
  const [rbi, setRbi] = useState(0);
  const [showRbiDetail, setShowRbiDetail] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [outRunnerBase, setOutRunnerBase] = useState<1 | 2 | 3 | null>(null);
  const [destinations, setDestinations] = useState<RunnerDestinations>({});
  const [coordinate, setCoordinate] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 起点結果の選択肢定義
  const results = [
    // 出塁系 (緑)
    { id: "1B", label: "単打", type: "hit", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { id: "2B", label: "二塁打", type: "hit", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { id: "3B", label: "三塁打", type: "hit", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { id: "HR", label: "本塁打", type: "hit", color: "bg-primary/10 text-primary" },
    { id: "E", label: "失策", type: "error", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
    { id: "FC", label: "野選", type: "fc", color: "bg-zinc-500/10 dark:bg-zinc-800" },

    // アウト系 (灰・赤)
    { id: "GO", label: "ゴロアウト", type: "out", color: "bg-zinc-500/10" },
    { id: "FO", label: "フライアウト", type: "out", color: "bg-zinc-500/10" },
    { id: "LO", label: "ライナー", type: "out", color: "bg-zinc-500/10" },
    { id: "SO_K", label: "空振り三振", type: "out", color: "bg-rose-500/10 text-rose-800 dark:text-rose-400" },
    { id: "SO_M", label: "見逃し三振", type: "out", color: "bg-rose-500/10 text-rose-800 dark:text-rose-400" },
    { id: "SO_SF", label: "振り逃げ", type: "out", color: "bg-rose-500/10 text-rose-800 dark:text-rose-400" },
    { id: "SH", label: "犠打（バント）", type: "out", color: "bg-zinc-500/10" },
    { id: "SF", label: "犠飛", type: "out", color: "bg-zinc-500/10" },
    { id: "DP", label: "併殺打", type: "out", color: "bg-red-600/10 border-red-500/20 text-red-500 dark:text-red-400" },
    { id: "UN", label: "その他アウト", type: "out", color: "bg-zinc-500/10" },
  ];

  const trajectories = [
    { id: "GO", label: "ゴロ" },
    { id: "FO", label: "フライ" },
    { id: "LO", label: "ライナー" },
    { id: "BUNT", label: "バント" },
  ] as const;

  const courses = [
    { id: "front", label: "前 (ポテン)" },
    { id: "line", label: "線際" },
    { id: "over", label: "オーバー" },
  ] as const;

  const fieldAreas = [
    // 外野
    { id: "7", label: "左", name: "左翼", x: 18, y: 22 },
    { id: "78", label: "左中", name: "左中間", x: 34, y: 14 },
    { id: "8", label: "中", name: "中堅", x: 50, y: 10 },
    { id: "89", label: "右中", name: "右中間", x: 66, y: 14 },
    { id: "9", label: "右", name: "右翼", x: 82, y: 22 },
    
    // 内野の間
    { id: "56", label: "三遊", name: "三遊間", x: 26, y: 48 },
    { id: "46", label: "二遊", name: "二遊間", x: 50, y: 40 },
    { id: "34", label: "一二", name: "一二間", x: 74, y: 48 },
    
    // 内野守備
    { id: "5", label: "三", name: "三塁", x: 20, y: 68 },
    { id: "6", label: "遊", name: "遊撃", x: 35, y: 54 },
    { id: "4", label: "二", name: "二塁", x: 65, y: 54 },
    { id: "3", label: "一", name: "一塁", x: 80, y: 68 },
    
    // バッテリー
    { id: "1", label: "投", name: "投手", x: 50, y: 66 },
    { id: "2", label: "捕", name: "捕手", x: 50, y: 90 },
  ];

  // モーダルオープン時のリセット
  useEffect(() => {
    if (open) {
      setSelectedPosList([]);
      setSelectedArea(null);
      setCourse(null);
      setTrajectory(null);
      setCoordinate(null);
      setIsFoul(false);
      setOutRunnerBase(null);
      
      const initialType = defaultHitType || "1B";
      setPlayResult(initialType);
      setActiveTab(["1B", "2B", "3B", "HR", "E", "FC"].includes(initialType) ? "onbase" : "out");

      // destinations 初期値セット
      const initialDest: RunnerDestinations = {};
      const isOut = ["GO", "FO", "LO", "SO_K", "SO_M", "SH", "SF", "DP", "UN"].includes(initialType);
      
      if (isOut) {
        initialDest.batter = "out";
        if (runners.base1) initialDest.base1 = 1;
        if (runners.base2) initialDest.base2 = 2;
        if (runners.base3) initialDest.base3 = 3;
      } else {
        initialDest.batter = initialType === "HR" ? 4 : initialType === "3B" ? 3 : initialType === "2B" ? 2 : 1;
        if (runners.base1) initialDest.base1 = initialType === "HR" ? 4 : initialType === "3B" ? 4 : initialType === "2B" ? 3 : 2;
        if (runners.base2) initialDest.base2 = initialType === "HR" ? 4 : initialType === "3B" ? 4 : 4;
        if (runners.base3) initialDest.base3 = 4;
      }
      setDestinations(initialDest);
      setShowRbiDetail(false);
    }
  }, [open, defaultHitType, runners.base1, runners.base2, runners.base3]);

  // 起点結果が切り替わった際の自動進路デフォルト設定
  useEffect(() => {
    if (!open) return;

    const newDest: RunnerDestinations = {};
    const isOut = ["GO", "FO", "LO", "SO_K", "SO_M", "SH", "SF", "DP", "UN"].includes(playResult);

    if (isOut) {
      newDest.batter = "out";
      if (runners.base1) newDest.base1 = 1;
      if (runners.base2) newDest.base2 = 2;
      if (runners.base3) newDest.base3 = 3;

      if (playResult === "SF") {
        if (runners.base3) newDest.base3 = 4;
      } else if (playResult === "SH") {
        if (runners.base3) newDest.base3 = 4;
        if (runners.base2) newDest.base2 = 3;
        if (runners.base1) newDest.base1 = 2;
      } else if (playResult === "DP") {
        if (runners.base1) {
          newDest.base1 = "out";
          setOutRunnerBase(1);
        } else if (runners.base2) {
          newDest.base2 = "out";
          setOutRunnerBase(2);
        } else if (runners.base3) {
          newDest.base3 = "out";
          setOutRunnerBase(3);
        }
      }
    } else {
      // 出塁系 (安打・失策・野選)
      if (playResult === "HR") {
        if (runners.base1) newDest.base1 = 4;
        if (runners.base2) newDest.base2 = 4;
        if (runners.base3) newDest.base3 = 4;
        newDest.batter = 4;
      } else if (playResult === "3B") {
        if (runners.base1) newDest.base1 = 4;
        if (runners.base2) newDest.base2 = 4;
        if (runners.base3) newDest.base3 = 4;
        newDest.batter = 3;
      } else if (playResult === "2B") {
        if (runners.base1) newDest.base1 = 3;
        if (runners.base2) newDest.base2 = 4;
        if (runners.base3) newDest.base3 = 4;
        newDest.batter = 2;
      } else if (playResult === "1B" || playResult === "E" || playResult === "SO_SF") {
        if (runners.base1) newDest.base1 = 2;
        if (runners.base2) newDest.base2 = 3;
        if (runners.base3) newDest.base3 = 4;
        newDest.batter = 1;
      } else if (playResult === "FC") {
        if (runners.base1) newDest.base1 = 2;
        if (runners.base2) newDest.base2 = 3;
        if (runners.base3) newDest.base3 = 4;
        newDest.batter = 1;

        if (runners.base1) {
          newDest.base1 = "out";
          setOutRunnerBase(1);
        } else if (runners.base2) {
          newDest.base2 = "out";
          setOutRunnerBase(2);
        } else if (runners.base3) {
          newDest.base3 = "out";
          setOutRunnerBase(3);
        }
      }
    }

    setDestinations(newDest);

    // デフォルトRBIの計算
    let defaultRbi = 0;
    if (newDest.base1 === 4) defaultRbi++;
    if (newDest.base2 === 4) defaultRbi++;
    if (newDest.base3 === 4) defaultRbi++;
    if (newDest.batter === 4) defaultRbi++;
    setRbi(defaultRbi);
    setShowRbiDetail(defaultRbi > 0);
  }, [playResult, open, runners.base1, runners.base2, runners.base3]);

  const getPlayerName = (runnerId: string | null) => {
    if (!runnerId) return "";
    const isMyAttack = (state.isTop && state.isGuestFirst) || (!state.isTop && !state.isGuestFirst);
    const lineup = isMyAttack ? state.myLineup : state.opponentLineup;
    const player = lineup?.find((p: any) => p.playerId === runnerId || p.id === runnerId);
    let name = player?.playerName || player?.name || "走者";
    if (!player && runnerId.startsWith("custom-")) {
      name = runnerId.split("-")[1];
    }
    return name;
  };

  const handlePosTap = (id: string, x: number, y: number) => {
    const isRealFielder = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(id);

    if (isRealFielder) {
      setSelectedPosList(prev => {
        if (prev.includes(id)) {
          return prev.filter(item => item !== id);
        }
        return [...prev, id];
      });
    } else {
      setSelectedArea(prev => prev === id ? null : id);
    }
    setCoordinate({ x, y });
  };

  const handleConfirm = () => {
    if (!playResult) return;
    
    const parts: string[] = [];
    if (selectedPosList.length > 0) {
      parts.push(selectedPosList.join(">"));
    } else if (selectedArea) {
      parts.push(selectedArea);
    }
    
    const isOut = ["GO", "FO", "LO", "SO_K", "SO_M", "SH", "SF", "DP", "UN"].includes(playResult);

    if (course && !["SO_K", "SO_M", "SO_SF", "DP", "UN"].includes(playResult)) {
      parts.push(course);
    }
    if (isFoul && ["FO", "LO"].includes(playResult)) {
      parts.push("FOUL");
    }
    if (trajectory && !["SO_K", "SO_M", "SO_SF", "DP", "UN"].includes(playResult)) {
      parts.push(trajectory);
    }
    parts.push(playResult);
    
    const resultString = parts.join("-");

    const isHit = ["1B", "2B", "3B", "HR"].includes(playResult);
    const isError = playResult === "E";
    const hitsCount = isHit ? 1 : 0;
    const errorsCount = isError ? 1 : 0;

    let finalOutRunnerBase = outRunnerBase;
    if (destinations.base1 === "out") finalOutRunnerBase = 1;
    else if (destinations.base2 === "out") finalOutRunnerBase = 2;
    else if (destinations.base3 === "out") finalOutRunnerBase = 3;

    onResult(
      resultString,
      rbi,
      hitsCount,
      errorsCount,
      coordinate || undefined,
      finalOutRunnerBase,
      destinations
    );
    
    // リセット
    setSelectedPosList([]);
    setSelectedArea(null);
    setCourse(null);
    setTrajectory(null);
    setCoordinate(null);
    setRbi(0);
    setOutRunnerBase(null);
    setIsFoul(false);
    onOpenChange(false);
  };

  const getResultStyle = (resId: string) => {
    const isActive = playResult === resId;
    const item = results.find(r => r.id === resId);
    
    if (isActive) {
      if (resId === "HR") return "bg-primary border-primary text-primary-foreground shadow-sm";
      if (item?.type === "hit") return "bg-emerald-600 border-emerald-600 text-white shadow-sm";
      if (item?.type === "error" || resId === "DP" || resId.startsWith("SO_")) return "bg-rose-600 border-rose-600 text-white shadow-sm";
      return "bg-zinc-800 border-zinc-800 dark:bg-zinc-200 dark:border-zinc-200 text-white dark:text-zinc-950 shadow-sm";
    }
    
    return cn(
      "bg-zinc-50 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
      item?.color
    );
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-[450px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[95vh]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-3.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Batter & Play Action</span>
            <h3 className="text-sm font-black text-zinc-900 dark:text-white mt-0.5">
              打撃・インプレイ結果の記録
            </h3>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツエリア (統一レイアウト: タイトル -> フラット全体枠) */}
        <div className="p-4 overflow-y-auto space-y-5 flex-1">
          
          {/* ① 結果種別の選択 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                ① 打撃結果・アウト種別（起点）
              </label>
              {/* フラットなタブ切り替え */}
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-900 text-[10px] font-black">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("onbase");
                    setPlayResult("1B");
                  }}
                  className={cn(
                    "px-3 py-1 rounded-md transition-all cursor-pointer",
                    activeTab === "onbase"
                      ? "bg-white dark:bg-zinc-800 text-primary shadow-xs"
                      : "text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  出塁・安打
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("out");
                    setPlayResult("GO");
                  }}
                  className={cn(
                    "px-3 py-1 rounded-md transition-all cursor-pointer",
                    activeTab === "out"
                      ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-xs"
                      : "text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  アウト・三振
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="grid grid-cols-3 gap-2 animate-in fade-in duration-200">
                {results
                  .filter((res) => {
                    const isOnBase = ["1B", "2B", "3B", "HR", "E", "FC"].includes(res.id);
                    return activeTab === "onbase" ? isOnBase : !isOnBase;
                  })
                  .map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => {
                        setPlayResult(res.id);
                        if (res.id !== "FO" && res.id !== "LO") {
                          setIsFoul(false);
                        }
                      }}
                      className={cn(
                        "h-10 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center text-center leading-tight p-1",
                        getResultStyle(res.id)
                      )}
                    >
                      {res.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* ② 走者状況・進退設定 */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
              ② 走者状況・進退設定
            </label>
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              {!runners.base1 && !runners.base2 && !runners.base3 ? (
                <div className="text-center py-2 text-xs font-bold text-zinc-400 dark:text-zinc-500">
                  走者なし
                </div>
              ) : (
                <div className="flex flex-col gap-3 mt-1">
                  {/* 3塁走者 */}
                  {runners.base3 && (
                    <div className="flex flex-col gap-1.5 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5 last:border-0 last:pb-0">
                      <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex justify-between">
                        <span>3塁走者: {getPlayerName(runners.base3)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => setDestinations(prev => ({ ...prev, base3: 3 }))}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base3 === 3
                              ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 border-zinc-800 dark:border-zinc-200"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          3塁残留
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDestinations(prev => ({ ...prev, base3: 4 }));
                            setRbi(prev => Math.min(4, prev + 1));
                            setShowRbiDetail(true);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base3 === 4
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          本塁生還
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDestinations(prev => ({ ...prev, base3: "out" }));
                            setOutRunnerBase(3);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base3 === "out"
                              ? "bg-rose-600 border-rose-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          アウト
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2塁走者 */}
                  {runners.base2 && (
                    <div className="flex flex-col gap-1.5 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5 last:border-0 last:pb-0">
                      <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex justify-between">
                        <span>2塁走者: {getPlayerName(runners.base2)}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        <button
                          type="button"
                          onClick={() => setDestinations(prev => ({ ...prev, base2: 2 }))}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base2 === 2
                              ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 border-zinc-800 dark:border-zinc-200"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          2塁残留
                        </button>
                        <button
                          type="button"
                          onClick={() => setDestinations(prev => ({ ...prev, base2: 3 }))}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base2 === 3
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          3塁進塁
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDestinations(prev => ({ ...prev, base2: 4 }));
                            setRbi(prev => Math.min(4, prev + 1));
                            setShowRbiDetail(true);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base2 === 4
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          本塁生還
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDestinations(prev => ({ ...prev, base2: "out" }));
                            setOutRunnerBase(2);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base2 === "out"
                              ? "bg-rose-600 border-rose-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          アウト
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 1塁走者 */}
                  {runners.base1 && (
                    <div className="flex flex-col gap-1.5 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5 last:border-0 last:pb-0">
                      <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex justify-between">
                        <span>1塁走者: {getPlayerName(runners.base1)}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        <button
                          type="button"
                          onClick={() => setDestinations(prev => ({ ...prev, base1: 1 }))}
                          className={cn(
                            "h-8 rounded-lg text-[9px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base1 === 1
                              ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 border-zinc-800 dark:border-zinc-200"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          1塁残留
                        </button>
                        <button
                          type="button"
                          onClick={() => setDestinations(prev => ({ ...prev, base1: 2 }))}
                          className={cn(
                            "h-8 rounded-lg text-[9px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base1 === 2
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          2塁進塁
                        </button>
                        <button
                          type="button"
                          onClick={() => setDestinations(prev => ({ ...prev, base1: 3 }))}
                          className={cn(
                            "h-8 rounded-lg text-[9px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base1 === 3
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          3塁進塁
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDestinations(prev => ({ ...prev, base1: 4 }));
                            setRbi(prev => Math.min(4, prev + 1));
                            setShowRbiDetail(true);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[9px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base1 === 4
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          本塁生還
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDestinations(prev => ({ ...prev, base1: "out" }));
                            setOutRunnerBase(1);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[9px] font-bold border transition-all active:scale-95 cursor-pointer",
                            destinations.base1 === "out"
                              ? "bg-rose-600 border-rose-600 text-white"
                              : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          アウト
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* 打者走者 */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex justify-between">
                      <span>打者走者</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      <button
                        type="button"
                        onClick={() => setDestinations(prev => ({ ...prev, batter: "out" }))}
                        className={cn(
                          "h-8 rounded-lg text-[9.5px] font-bold border transition-all active:scale-95 cursor-pointer",
                          destinations.batter === "out"
                            ? "bg-rose-600 border-rose-600 text-white"
                            : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        アウト
                      </button>
                      <button
                        type="button"
                        onClick={() => setDestinations(prev => ({ ...prev, batter: 1 }))}
                        className={cn(
                          "h-8 rounded-lg text-[9.5px] font-bold border transition-all active:scale-95 cursor-pointer",
                          destinations.batter === 1
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        1塁出塁
                      </button>
                      <button
                        type="button"
                        onClick={() => setDestinations(prev => ({ ...prev, batter: 2 }))}
                        className={cn(
                          "h-8 rounded-lg text-[9.5px] font-bold border transition-all active:scale-95 cursor-pointer",
                          destinations.batter === 2
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        2塁進塁
                      </button>
                      <button
                        type="button"
                        onClick={() => setDestinations(prev => ({ ...prev, batter: 3 }))}
                        className={cn(
                          "h-8 rounded-lg text-[9.5px] font-bold border transition-all active:scale-95 cursor-pointer",
                          destinations.batter === 3
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        3塁進塁
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinations(prev => ({ ...prev, batter: 4 }));
                          setRbi(prev => Math.min(4, prev + 1));
                          setShowRbiDetail(true);
                        }}
                        className={cn(
                          "h-8 rounded-lg text-[9.5px] font-bold border transition-all active:scale-95 cursor-pointer",
                          destinations.batter === 4
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        本塁生還
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ③ 守備位置をタップ (グラフィック) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" />
              ③ 打球の飛んだ方向 / 守備位置をタップ (複数タップで連携経路)
            </label>
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="relative w-full aspect-square border border-zinc-100 dark:border-zinc-800/80 rounded-2xl bg-emerald-50/10 dark:bg-zinc-900/10 overflow-hidden">
                
                {/* 野球場グラフィック */}
                <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full select-none pointer-events-none">
                  {/* 外野の芝生 */}
                  <path d="M 1,71 A 140,140 0 0,1 199,71 L 100,170 Z" className="fill-emerald-500/15 dark:fill-emerald-950/20 stroke-emerald-500/25 dark:stroke-emerald-800/30 stroke-[1.5]" />
                  {/* 内野の土・ダイヤモンド */}
                  <path d="M 45,115 A 78,78 0 0,1 155,115 L 100,170 Z" className="fill-amber-500/10 dark:fill-amber-950/20 stroke-amber-500/20 dark:stroke-amber-800/15 stroke-1" />
                  {/* 内野ダイヤモンド白線 */}
                  <polygon points="100,170 128,142 100,114 72,142" className="fill-none stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5] stroke-dasharray-[2]" />
                  {/* マウンド */}
                  <circle cx="100" cy="142" r="5" className="fill-amber-500/5 dark:fill-amber-950/10 stroke-zinc-300 dark:stroke-zinc-700 stroke-[0.5]" />
                  {/* 各ベース */}
                  <polygon points="100,173 103,170 100,167 97,170" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                  <rect x="125.5" y="139.5" width="5" height="5" transform="rotate(45, 128, 142)" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                  <rect x="97.5" y="111.5" width="5" height="5" transform="rotate(45, 100, 114)" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                  <rect x="69.5" y="139.5" width="5" height="5" transform="rotate(45, 72, 142)" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                  {/* ファウルライン */}
                  <line x1="100" y1="170" x2="1" y2="71" className="stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5]" />
                  <line x1="100" y1="170" x2="199" y2="71" className="stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5]" />

                  {/* 🔴 守備経路の動的ガイドライン (複数野手タップを結ぶライン) */}
                  {selectedPosList.length > 1 && (
                    <polyline
                      points={selectedPosList.map(posId => {
                        const p = fieldAreas.find(x => x.id === posId);
                        return p ? `${p.x * 2},${p.y * 2}` : "";
                      }).filter(Boolean).join(" ")}
                      className="fill-none stroke-rose-500/80 stroke-[4.5] stroke-linecap-round stroke-linejoin-round"
                    />
                  )}
                </svg>

                {/* 物理配置された打球エリアバッジボタン */}
                {fieldAreas.map((area) => {
                  const isRealFielder = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(area.id);
                  const isActive = isRealFielder
                    ? selectedPosList.includes(area.id)
                    : selectedArea === area.id;
                  const tapOrderIndex = selectedPosList.indexOf(area.id);
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => handlePosTap(area.id, area.x, area.y)}
                      style={{ left: `${area.x}%`, top: `${area.y}%` }}
                      className={cn(
                        "absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-[9.5px] font-black tracking-tighter flex flex-col items-center justify-center shadow-sm select-none transition-all duration-300 active:scale-90 cursor-pointer border",
                        isActive
                          ? isRealFielder
                            ? "bg-rose-600 border-rose-600 text-white scale-110 z-30 shadow-md ring-2 ring-rose-500/20"
                            : "bg-blue-600 border-blue-600 text-white scale-110 z-30 shadow-md ring-2 ring-blue-500/20"
                          : "bg-white/90 border-zinc-200/80 text-zinc-800 hover:bg-zinc-150 hover:border-zinc-300 dark:bg-zinc-950/90 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      )}
                    >
                      <span>{area.label}</span>

                      {/* 🔴 タップ順序バッジのオーバーレイ (実在野手のみ) */}
                      {isRealFielder && isActive && (
                        <span className="absolute -top-1.5 -right-1.5 bg-rose-600 dark:bg-rose-500 text-white text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white dark:border-zinc-950 shadow-sm animate-scale-in">
                          {tapOrderIndex + 1}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* 🎯 最新のタップ位置に光を描画 */}
                {(selectedPosList.length > 0 || selectedArea) && coordinate && (
                  <div
                    style={{ left: `${coordinate.x}%`, top: `${coordinate.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-center w-8 h-8"
                  >
                    <span className="absolute h-6 w-6 rounded-full bg-rose-500 opacity-35 animate-ping" />
                    <span className="relative h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white shadow-md shadow-rose-600/30" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ④ オプション：打球性質＆コース（安打系） or 打球エリア（アウト系） */}
          {/* 安打・エラー・野選系が選ばれた場合 */}
          {["1B", "2B", "3B", "HR", "E", "FC"].includes(playResult) && (
            <div className="grid grid-cols-2 gap-4">
              {/* 打球性質 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
                  ④ 打球性質
                </label>
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="grid grid-cols-2 gap-1.5">
                    {trajectories.map((traj) => {
                      const isActive = trajectory === traj.id;
                      return (
                        <button
                          key={traj.id}
                          type="button"
                          onClick={() => setTrajectory(isActive ? null : traj.id)}
                          className={cn(
                            "h-9 rounded-xl border font-black text-[10.5px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                            isActive
                              ? "bg-primary border-primary text-white shadow-sm"
                              : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          )}
                        >
                          {traj.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* コース */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
                  ⑤ コース
                </label>
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="grid grid-cols-2 gap-1.5">
                    {courses.map((c) => {
                      const isActive = course === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCourse(isActive ? null : c.id)}
                          className={cn(
                            "h-9 rounded-xl border font-black text-[10.5px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                            isActive
                              ? "bg-primary border-primary text-white shadow-sm"
                              : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* フライ・ライナーアウト系が選ばれた場合 */}
          {["FO", "LO"].includes(playResult) && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
              <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
                ④ 打球エリア
              </label>
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFoul(false)}
                    className={cn(
                      "h-9 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                      !isFoul
                        ? "bg-primary border-primary text-white shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    フェアグラウンド
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFoul(true)}
                    className={cn(
                      "h-9 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                      isFoul
                        ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    ファウルエリア（邪飛・邪直）
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ⑤/⑥ 打点手動調整 */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
              {["1B", "2B", "3B", "HR", "E", "FC"].includes(playResult) ? "⑥" : "⑤"} 打点手動調整
            </label>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRbiDetail(!showRbiDetail)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 bg-transparent border-none"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-primary uppercase tracking-widest bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded">
                    打点: {rbi}点
                  </span>
                  <span className="text-xs font-black text-zinc-700 dark:text-zinc-300">
                    打点を手動調整する
                  </span>
                </div>
                <div className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                  {showRbiDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showRbiDetail && (
                <div className="p-3 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">RBI (打点)</p>
                    <p className="text-xs font-black italic text-zinc-900 dark:text-white tracking-tight">TOTAL RUNS</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRbi(Math.max(0, rbi - 1))}
                      className="h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-90 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xl font-black tabular-nums italic text-primary w-6 text-center">{rbi}</span>
                    <button
                      type="button"
                      onClick={() => setRbi(Math.min(4, rbi + 1))}
                      className="h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-90 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* モーダルフッター */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={handleConfirm}
            disabled={!playResult || (playResult === "FC" && (!!runners.base1 || !!runners.base2 || !!runners.base3) && !outRunnerBase) || (playResult === "DP" && (!!runners.base1 || !!runners.base2 || !!runners.base3) && !outRunnerBase)}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs tracking-wide disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="h-4.5 w-4.5 stroke-[3px]" />
            {selectedPosList.length > 0 ? "RECORD PLAY" : "QUICK RECORD"}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
