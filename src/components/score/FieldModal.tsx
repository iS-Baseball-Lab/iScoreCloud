// src/components/score/FieldModal.tsx
"use client";

import { useState, useEffect } from "react";
import type { BaseAdvance } from "@/types/score";
import { useScore } from "@/contexts/ScoreContext";
/**
 * 💡 打球結果記録モーダル (究極UI版)
 * 1. 意匠: bg-background/60 と backdrop-blur-2xl による極上の透過感。
 * 2. 構造: ポジション選択(1-9)を野球の守備位置に合わせたグリッドで配置。
 * 3. 整理: 打点 (RBI) 入力と結果選択を1つのフローに集約。
 * 4. 規則: 影なし。角丸40px。border-border/40。
 */
import { createPortal } from "react-dom";
import { Minus, Plus, Check, Target, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (result: string, rbi: number, advances: BaseAdvance[]) => void;
  defaultHitType?: string;
}

export function FieldModal({ open, onOpenChange, onResult, defaultHitType }: FieldModalProps) {
  const { state } = useScore();
  const { runners } = state;

  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const [hitType, setHitType] = useState<string>("GO"); // GO: Ground Out, 1B: Single, etc.
  const [rbi, setRbi] = useState(0);
  const [showRbiDetail, setShowRbiDetail] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setSelectedPos(null);
      const initialHit = defaultHitType || "GO";
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

  const positions = [
    { id: "1", label: "P", name: "投手" },
    { id: "2", label: "C", name: "捕手" },
    { id: "3", label: "1B", name: "一塁" },
    { id: "4", label: "2B", name: "二塁" },
    { id: "5", label: "3B", name: "三塁" },
    { id: "6", label: "SS", name: "遊撃" },
    { id: "7", label: "LF", name: "左翼" },
    { id: "8", label: "CF", name: "中堅" },
    { id: "9", label: "RF", name: "右翼" },
  ];

  const results = [
    { id: "GO", label: "ゴロ", color: "bg-zinc-500/10" },
    { id: "FO", label: "飛球", color: "bg-zinc-500/10" },
    { id: "1B", label: "単打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "2B", label: "二塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "3B", label: "三塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "HR", label: "本塁打", color: "bg-primary text-primary-foreground" },
    { id: "SH", label: "犠打", color: "bg-zinc-500/10" },
    { id: "SF", label: "犠飛", color: "bg-zinc-500/10" },
    { id: "E", label: "失策", color: "bg-red-500/20 text-red-600 dark:text-red-400" },
  ];

  const handleConfirm = () => {
    if (!hitType) return;
    const resultString = selectedPos ? `${selectedPos}-${hitType}` : hitType;
    onResult(resultString, rbi, []);
    // Reset
    setSelectedPos(null);
    setHitType("GO");
    setRbi(0);
  };

  if (!open || !mounted) return null;

  const getResultStyle = (resId: string) => {
    const isActive = hitType === resId;
    if (resId === '1B' || resId === '2B' || resId === '3B') {
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
    // GO, FO, SH, SF などその他
    return isActive
      ? "bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-950 dark:text-white"
      : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800";
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <span className="text-xs font-black text-primary uppercase tracking-widest">In Play Action</span>
            <h3 className="text-base font-black text-zinc-900 dark:text-white mt-0.5">
              打球結果記録
            </h3>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          
          {/* 1. ポジション選択 */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] px-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" /> Select Field Position
            </label>
            <div className="grid grid-cols-3 gap-2">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => setSelectedPos(pos.id === selectedPos ? null : pos.id)}
                  className={cn(
                    "h-14 rounded-xl border font-black italic text-base transition-all active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group",
                    selectedPos === pos.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-555 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-white"
                  )}
                >
                  <span className="text-[8px] opacity-60 group-hover:opacity-100 transition-opacity uppercase leading-none">{pos.name}</span>
                  <span className="text-lg leading-none mt-0.5">{pos.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. 結果種別 */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] px-1">Result Type</label>
            <div className="flex flex-wrap gap-2">
              {results.map((res) => (
                <button
                  key={res.id}
                  onClick={() => handleHitTypeSelect(res.id)}
                  className={cn(
                    "px-4 py-2 rounded-xl border font-black text-xs tracking-tight transition-all active:scale-95",
                    getResultStyle(res.id)
                  )}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. 打点手動調整（アコーディオン仕様） */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/30">
            <button
              type="button"
              onClick={() => setShowRbiDetail(!showRbiDetail)}
              className="w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded animate-in zoom-in duration-200">
                  RBI: {rbi}点
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
              <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between animate-in slide-in-from-top-2 duration-250">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">RBI (打点)</p>
                  <p className="text-sm font-black italic text-zinc-900 dark:text-white tracking-tight">TOTAL RUNS</p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setRbi(Math.max(0, rbi - 1))}
                    className="h-10 w-10 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-90 transition-all flex items-center justify-center shadow-sm"
                  >
                    <Minus className="h-4.5 w-4.5" />
                  </button>
                  <span className="text-3xl font-black tabular-nums italic text-primary w-8 text-center">{rbi}</span>
                  <button
                    type="button"
                    onClick={() => setRbi(Math.min(4, rbi + 1))}
                    className="h-10 w-10 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-90 transition-all flex items-center justify-center shadow-sm"
                  >
                    <Plus className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* モーダルフッター */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={handleConfirm}
            disabled={!hitType}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Check className="h-5 w-5 stroke-[3px]" />
            {selectedPos ? "RECORD PLAY" : "QUICK RECORD"}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}