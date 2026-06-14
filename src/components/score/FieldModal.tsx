// filepath: src/components/score/FieldModal.tsx
"use client";

import { useState, useEffect } from "react";
import type { BaseAdvance } from "@/types/score";
import { useScore } from "@/contexts/ScoreContext";
import { createPortal } from "react-dom";
import { Minus, Plus, Check, Target, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (result: string, rbi: number, advances: BaseAdvance[], coordinate?: { x: number; y: number }, outRunnerBase?: 1 | 2 | 3 | null) => void;
  defaultHitType?: string;
}

export function FieldModal({ open, onOpenChange, onResult, defaultHitType }: FieldModalProps) {
  const { state } = useScore();
  const { runners } = state;

  const [selectedPosList, setSelectedPosList] = useState<string[]>([]);
  const [hitType, setHitType] = useState<string>("1B"); // デフォルトを単打 (1B)
  const [course, setCourse] = useState<"front" | "line" | "over" | null>(null); // 前, 線際, オーバー
  const [trajectory, setTrajectory] = useState<"GO" | "FO" | "LO" | "BUNT" | null>(null); // ゴロ, フライ, ライナー, バント
  const [rbi, setRbi] = useState(0);
  const [showRbiDetail, setShowRbiDetail] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [outRunnerBase, setOutRunnerBase] = useState<1 | 2 | 3 | null>(null);
  
  // スプレーチャート用座標 (パーセンテージベース)
  const [coordinate, setCoordinate] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // モーダルオープン時のリセット
  useEffect(() => {
    if (open) {
      setSelectedPosList([]);
      setCourse(null);
      setTrajectory(null);
      setCoordinate(null);
      
      const initialHit = defaultHitType === "E" ? "E" : "1B";
      setHitType(initialHit);
      setRbi(calculateDefaultRbi(initialHit));
      setShowRbiDetail(false);
      setOutRunnerBase(null);
    }
  }, [open, defaultHitType]);

  const calculateDefaultRbi = (type: string) => {
    const r1 = runners?.base1 ? 1 : 0;
    const r2 = runners?.base2 ? 1 : 0;
    const r3 = runners?.base3 ? 1 : 0;
    const runnersCount = r1 + r2 + r3;

    switch (type) {
      case "HR":
        return runnersCount + 1;
      case "3B":
        return runnersCount;
      case "2B":
        return r2 + r3;
      case "1B":
        return r3;
      default:
        return 0;
    }
  };

  const handleHitTypeSelect = (type: string) => {
    setHitType(type);
    setRbi(calculateDefaultRbi(type));
  };

  // 🏟️ 野球場の各エリアボタンの定義 (誤タップを防ぐため内野と間エリアを広げて再配置)
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

  // 結果種別
  const results = [
    { id: "1B", label: "単打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "2B", label: "二塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "3B", label: "三塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "HR", label: "本塁打", color: "bg-primary text-primary-foreground" },
    { id: "E", label: "失策", color: "bg-rose-50/20 text-rose-600 dark:text-rose-400" },
    { id: "FC", label: "野選", color: "bg-zinc-500/10" },
  ];

  // 打球の性質
  const trajectories = [
    { id: "GO", label: "ゴロ" },
    { id: "FO", label: "フライ" },
    { id: "LO", label: "ライナー" },
    { id: "BUNT", label: "バント" },
  ] as const;

  // 打球コース
  const courses = [
    { id: "front", label: "前 (ポテン)" },
    { id: "line", label: "線際" },
    { id: "over", label: "オーバー" },
  ] as const;

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
    setSelectedPosList(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      return [...prev, id];
    });
    setCoordinate({ x, y });
  };

  const handleConfirm = () => {
    if (!hitType) return;
    
    const parts: string[] = [];
    if (selectedPosList.length > 0) {
      parts.push(selectedPosList.join(">"));
    }
    if (course) parts.push(course);
    if (trajectory) parts.push(trajectory);
    parts.push(hitType);
    
    const resultString = parts.join("-");

    onResult(resultString, rbi, [], coordinate || undefined, outRunnerBase);
    
    // リセット
    setSelectedPosList([]);
    setCourse(null);
    setTrajectory(null);
    setCoordinate(null);
    setRbi(0);
    setOutRunnerBase(null);
  };

  const getResultStyle = (resId: string) => {
    const isActive = hitType === resId;
    if (["1B", "2B", "3B"].includes(resId)) {
      return isActive
        ? "bg-emerald-500 border-emerald-500 text-white"
        : "bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30";
    }
    if (resId === 'HR') {
      return isActive
        ? "bg-primary border-primary text-primary-foreground"
        : "bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 text-primary hover:bg-primary/10 dark:hover:bg-primary/20";
    }
    if (resId === 'E') {
      return isActive
        ? "bg-rose-500 border-rose-500 text-white"
        : "bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/30";
    }
    return isActive
      ? "bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-950 dark:text-white"
      : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800";
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-[440px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[95vh]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-3.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">In Play Record</span>
            <h3 className="text-sm font-black text-zinc-900 dark:text-white mt-0.5">
              打球・安打結果記録
            </h3>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツエリア (究極の操作性を求めた並び順: 結果 -> 走者 -> グラフィック -> オプション) */}
        <div className="p-4 overflow-y-auto space-y-5 flex-1">
          
          {/* 1. 結果種別の選択 */}
          <div className="space-y-1.5">
            <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">① 安打・エラー結果（起点）</label>
            <div className="grid grid-cols-3 gap-2">
              {results.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => handleHitTypeSelect(res.id)}
                  className={cn(
                    "h-10 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                    getResultStyle(res.id)
                  )}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 走者アウト / 進塁死の選択UI (走者がいる場合は常に表示、トグル解除対応) */}
          {(state.runners.base1 || state.runners.base2 || state.runners.base3) && (
            <div className="space-y-1.5 p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 animate-in slide-in-from-top-2 duration-200">
              <label className="text-[9.5px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest px-1">
                ② {hitType === "FC" ? "野選によりアウトになった走者 (必須)" : "走者アウト / 進塁死 (任意)"}
              </label>
              <div className="flex flex-col gap-1.5 mt-1">
                {state.runners.base1 && (
                  <button
                    key="fc-runner-1"
                    type="button"
                    onClick={() => setOutRunnerBase(outRunnerBase === 1 ? null : 1)}
                    className={cn(
                      "h-9 rounded-xl border text-[11px] font-bold flex items-center justify-between px-3 active:scale-95 transition-all cursor-pointer",
                      outRunnerBase === 1
                        ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span>1塁走者: {getPlayerName(state.runners.base1)}</span>
                    <span className="text-[8px] opacity-70">2塁でアウト</span>
                  </button>
                )}
                {state.runners.base2 && (
                  <button
                    key="fc-runner-2"
                    type="button"
                    onClick={() => setOutRunnerBase(outRunnerBase === 2 ? null : 2)}
                    className={cn(
                      "h-9 rounded-xl border text-[11px] font-bold flex items-center justify-between px-3 active:scale-95 transition-all cursor-pointer",
                      outRunnerBase === 2
                        ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span>2塁走者: {getPlayerName(state.runners.base2)}</span>
                    <span className="text-[8px] opacity-70">3塁でアウト</span>
                  </button>
                )}
                {state.runners.base3 && (
                  <button
                    key="fc-runner-3"
                    type="button"
                    onClick={() => setOutRunnerBase(outRunnerBase === 3 ? null : 3)}
                    className={cn(
                      "h-9 rounded-xl border text-[11px] font-bold flex items-center justify-between px-3 active:scale-95 transition-all cursor-pointer",
                      outRunnerBase === 3
                        ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span>3塁走者: {getPlayerName(state.runners.base3)}</span>
                    <span className="text-[8px] opacity-70">本塁でアウト</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 3. プレミアムSVG野球場グラフィックUI (順路ガイド線 ＋ タップ順バッジ付き) */}
          <div className="space-y-2">
            <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" />
              ③ 打球の飛んだ方向 / 守備位置をタップ (複数で連携プレー記録)
            </label>
            
            <div className="relative w-full aspect-square border border-zinc-100 dark:border-zinc-800/80 rounded-2xl bg-emerald-50/10 dark:bg-zinc-900/10 overflow-hidden shadow-inner">
              
              {/* 美しい野球場グラフィック */}
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
                
                {/* 外野フェンスポールへのファウルライン */}
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
                    style={{ filter: "drop-shadow(0px 2px 4px rgba(244,63,94,0.3))" }}
                  />
                )}
              </svg>

              {/* 物理配置された打球エリアバッジボタン */}
              {fieldAreas.map((area) => {
                const isActive = selectedPosList.includes(area.id);
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
                        ? "bg-rose-600 border-rose-600 text-white scale-110 z-30 shadow-md ring-2 ring-rose-500/20"
                        : "bg-white/90 border-zinc-200/80 text-zinc-800 hover:bg-zinc-150 hover:border-zinc-300 dark:bg-zinc-950/90 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    )}
                  >
                    <span>{area.label}</span>

                    {/* 🔴 タップ順序バッジのオーバーレイ */}
                    {isActive && (
                      <span className="absolute -top-1.5 -right-1.5 bg-rose-600 dark:bg-rose-500 text-white text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white dark:border-zinc-950 shadow-sm animate-scale-in">
                        {tapOrderIndex + 1}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* 🎯 最新のタップ位置にアニメーション光を描画 */}
              {selectedPosList.length > 0 && coordinate && (
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

          {/* 4. 打球の性質と打球コース (オプション) */}
          <div className="grid grid-cols-2 gap-4">
            {/* 4.1. 打球性質の選択 */}
            <div className="space-y-1.5">
              <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">④ 打球性質</label>
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
                          ? "bg-zinc-850 dark:bg-zinc-200 border-zinc-850 dark:border-zinc-200 text-white dark:text-zinc-950 shadow-sm"
                          : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      )}
                    >
                      {traj.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4.2. 打球コースの選択 */}
            <div className="space-y-1.5">
              <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">⑤ コース</label>
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
                          ? "bg-zinc-850 dark:bg-zinc-200 border-zinc-850 dark:border-zinc-200 text-white dark:text-zinc-950 shadow-sm"
                          : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5. 打点手動調整 */}
          <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/30">
            <button
              type="button"
              onClick={() => setShowRbiDetail(!showRbiDetail)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40"
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

        {/* モーダルフッター */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={handleConfirm}
            disabled={!hitType || (hitType === "FC" && (!!state.runners.base1 || !!state.runners.base2 || !!state.runners.base3) && !outRunnerBase)}
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