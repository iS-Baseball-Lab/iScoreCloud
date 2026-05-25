// src/components/score/FieldModal.tsx
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
  onResult: (result: string, rbi: number, advances: BaseAdvance[], coordinate?: { x: number; y: number }) => void;
  defaultHitType?: string;
}

export function FieldModal({ open, onOpenChange, onResult, defaultHitType }: FieldModalProps) {
  const { state } = useScore();
  const { runners } = state;

  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const [hitType, setHitType] = useState<string>("1B"); // デフォルトを単打 (1B) に変更
  const [trajectory, setTrajectory] = useState<"GO" | "FO" | "LO" | null>(null); // ゴロ, フライ, ライナー
  const [rbi, setRbi] = useState(0);
  const [showRbiDetail, setShowRbiDetail] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // スプレーチャート用座標 (パーセンテージベース)
  const [coordinate, setCoordinate] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // モーダルオープン時のリセット
  useEffect(() => {
    if (open) {
      setSelectedPos(null);
      setTrajectory(null);
      setCoordinate(null);
      
      const initialHit = defaultHitType === "E" ? "E" : "1B"; // E以外ならデフォルト単打 (1B)
      setHitType(initialHit);
      setRbi(calculateDefaultRbi(initialHit));
      setShowRbiDetail(false);
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

  // 🏟️ 野球場の各エリアボタンの定義 (left, top は % 位置)
  const fieldAreas = [
    // 外野
    { id: "7", label: "左", name: "左翼", x: 15, y: 18 },
    { id: "78", label: "左中", name: "左中間", x: 32, y: 13 },
    { id: "8", label: "中", name: "中堅", x: 50, y: 11 },
    { id: "89", label: "右中", name: "右中間", x: 68, y: 13 },
    { id: "9", label: "右", name: "右翼", x: 85, y: 18 },
    
    // 内野の間
    { id: "56", label: "三遊", name: "三遊間", x: 31, y: 46 },
    { id: "46", label: "二遊", name: "二遊間", x: 50, y: 39 },
    { id: "34", label: "一二", name: "一二間", x: 69, y: 46 },
    
    // 内野守備
    { id: "5", label: "三", name: "三塁", x: 21, y: 61 },
    { id: "6", label: "遊", name: "遊撃", x: 39, y: 51 },
    { id: "4", label: "二", name: "二塁", x: 61, y: 51 },
    { id: "3", label: "一", name: "一塁", x: 79, y: 61 },
    
    // バッテリー
    { id: "1", label: "投", name: "投手", x: 50, y: 64 },
    { id: "2", label: "捕", name: "捕手", x: 50, y: 88 },
  ];

  // 結果種別 (Safe Results Only - ゴロアウトや犠打などのアウト系は排除)
  const results = [
    { id: "1B", label: "単打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "2B", label: "二塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "3B", label: "三塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "HR", label: "本塁打", color: "bg-primary text-primary-foreground" },
    { id: "E", label: "失策", color: "bg-red-50/20 text-red-600 dark:text-red-400" },
    { id: "FC", label: "野選", color: "bg-zinc-500/10" },
  ];

  // 打球の性質 (ゴロ, フライ, ライナー)
  const trajectories = [
    { id: "GO", label: "ゴロ" },
    { id: "FO", label: "フライ" },
    { id: "LO", label: "ライナー" },
  ] as const;

  const handleConfirm = () => {
    if (!hitType) return;
    
    // 文字列の組み立て: pos-hit または pos-trajectory-hit 形式
    let resultString = "";
    if (selectedPos) {
      if (trajectory) {
        resultString = `${selectedPos}-${trajectory}-${hitType}`;
      } else {
        resultString = `${selectedPos}-${hitType}`;
      }
    } else {
      if (trajectory) {
        resultString = `${trajectory}-${hitType}`;
      } else {
        resultString = hitType;
      }
    }

    onResult(resultString, rbi, [], coordinate || undefined);
    
    // リセット
    setSelectedPos(null);
    setTrajectory(null);
    setCoordinate(null);
    setRbi(0);
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

        {/* コンテンツエリア */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          
          {/* 1. プレミアムSVG野球場グラフィックUI */}
          <div className="space-y-2">
            <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" />
              打球の落下地点 / 飛んだ方向をタップ
            </label>
            
            <div className="relative w-full aspect-square border border-zinc-100 dark:border-zinc-800/80 rounded-2xl bg-emerald-50/10 dark:bg-zinc-900/10 overflow-hidden shadow-inner">
              
              {/* 美しい野球場グラフィック (SVG背景) */}
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full select-none pointer-events-none">
                {/* 外野の芝生 */}
                <path d="M 30,170 A 100,100 0 0,1 170,170 L 100,170 Z" className="fill-emerald-500/15 dark:fill-emerald-950/20 stroke-emerald-500/20 dark:stroke-emerald-800/20 stroke-1" />
                <path d="M 45,150 A 80,80 0 0,1 155,150 L 100,170 Z" className="fill-emerald-500/5 dark:fill-emerald-900/10" />
                
                {/* 内野の芝生 */}
                <path d="M 65,135 L 100,100 L 135,135 L 100,170 Z" className="fill-amber-500/15 dark:fill-amber-950/25 stroke-amber-500/30 dark:stroke-amber-800/20 stroke-1" />
                
                {/* 内野ダイヤモンド (白線) */}
                <polygon points="100,170 145,135 100,100 55,135" className="fill-none stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5] stroke-dasharray-[2]" />
                
                {/* ホームプレート、マウンド、ベース */}
                <circle cx="100" cy="170" r="3" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                <circle cx="100" cy="135" r="4.5" className="fill-zinc-300 dark:fill-zinc-800 stroke-zinc-400 dark:stroke-zinc-700 stroke-[0.5]" />
                <rect x="142" y="132" width="6" height="6" className="fill-white stroke-zinc-400 stroke-[0.5] rotate-45" />
                <rect x="97" y="97" width="6" height="6" className="fill-white stroke-zinc-400 stroke-[0.5] rotate-45" />
                <rect x="52" y="132" width="6" height="6" className="fill-white stroke-zinc-400 stroke-[0.5] rotate-45" />
                
                {/* バッターボックスとファウルライン */}
                <line x1="100" y1="170" x2="15" y2="85" className="stroke-zinc-300 dark:stroke-zinc-800 stroke-[1]" />
                <line x1="100" y1="170" x2="185" y2="85" className="stroke-zinc-300 dark:stroke-zinc-800 stroke-[1]" />
              </svg>

              {/* 物理配置された打球エリアバッジボタン */}
              {fieldAreas.map((area) => {
                const isActive = selectedPos === area.id;
                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => {
                      setSelectedPos(area.id === selectedPos ? null : area.id);
                      setCoordinate({ x: area.x, y: area.y });
                    }}
                    style={{ left: `${area.x}%`, top: `${area.y}%` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-[9px] font-black tracking-tighter flex flex-col items-center justify-center shadow-sm select-none transition-all duration-300 active:scale-90 cursor-pointer border",
                      isActive
                        ? "bg-primary border-primary text-primary-foreground scale-110 z-30 shadow-md ring-2 ring-primary/20"
                        : "bg-white/90 border-zinc-200/80 text-zinc-800 hover:bg-zinc-150 hover:border-zinc-300 dark:bg-zinc-950/90 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    )}
                  >
                    <span>{area.label}</span>
                  </button>
                );
              })}

              {/* 🎯 タップ位置にアニメーションする光る赤いピンプロットを描画 */}
              {selectedPos && coordinate && (
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

          {/* 2. 結果種別の選択 */}
          <div className="space-y-1.5">
            <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">結果</label>
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

          {/* 3. 打球性質の選択 (ゴロ, フライ, ライナー) */}
          <div className="space-y-1.5">
            <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">打球の性質（オプション）</label>
            <div className="grid grid-cols-4 gap-2">
              {trajectories.map((traj) => {
                const isActive = trajectory === traj.id;
                return (
                  <button
                    key={traj.id}
                    type="button"
                    onClick={() => setTrajectory(isActive ? null : traj.id)}
                    className={cn(
                      "h-9 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                      isActive
                        ? "bg-zinc-800 dark:bg-zinc-200 border-zinc-800 dark:border-zinc-200 text-white dark:text-zinc-950 shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    {traj.label}
                  </button>
                );
              })}
              
              {/* 指定なしボタン */}
              <button
                type="button"
                onClick={() => setTrajectory(null)}
                className={cn(
                  "h-9 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                  trajectory === null
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                指定なし
              </button>
            </div>
          </div>

          {/* 4. 打点手動調整（アコーディオン仕様） */}
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
            disabled={!hitType}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs tracking-wide disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="h-4.5 w-4.5 stroke-[3px]" />
            {selectedPos ? "RECORD PLAY" : "QUICK RECORD"}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}