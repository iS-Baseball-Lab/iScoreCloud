// src/components/score/OutDetailModal.tsx
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Check, Target, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OutDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (result: string, rbi: number) => void;
}

export function OutDetailModal({ open, onOpenChange, onResult }: OutDetailModalProps) {
  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const [outType, setOutType] = useState<string>("GO");
  const [isFoul, setIsFoul] = useState(false);
  const [rbi, setRbi] = useState(0);
  const [showRbiDetail, setShowRbiDetail] = useState(false);
  const [mounted, setMounted] = useState(false);

  // スプレーチャート用・タップピン表示用座標
  const [coordinate, setCoordinate] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setSelectedPos(null);
      setCoordinate(null);
      setOutType("GO");
      setIsFoul(false);
      setRbi(0);
      setShowRbiDetail(false);
    }
  }, [open]);

  // 🏟️ 野球場の各エリアボタンの定義 (1-9基本ポジション。精密幾何学グラフィックと100%同期)
  const fieldPositions = [
    // 外野
    { id: "7", label: "左", name: "左翼", x: 20, y: 25 },
    { id: "8", label: "中", name: "中堅", x: 50, y: 15 },
    { id: "9", label: "right", name: "右翼", x: 80, y: 25 },
    
    // 内野守備
    { id: "5", label: "三", name: "三塁", x: 25, y: 68 },
    { id: "6", label: "遊", name: "遊撃", x: 38, y: 58 },
    { id: "4", label: "二", name: "二塁", x: 62, y: 58 },
    { id: "3", label: "一", name: "一塁", x: 75, y: 68 },
    
    // バッテリー
    { id: "1", label: "投", name: "投手", x: 50, y: 68 },
    { id: "2", label: "捕", name: "捕手", x: 50, y: 86 },
  ];

  const outTypes = [
    { id: "GO", label: "ゴロアウト", color: "bg-zinc-500/10" },
    { id: "FO", label: "フライアウト", color: "bg-zinc-500/10" },
    { id: "LO", label: "ライナー（直）", color: "bg-zinc-500/10" },
    { id: "SO_K", label: "空振り三振", color: "bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400" },
    { id: "SO_M", label: "見逃し三振", color: "bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400" },
    { id: "SH", label: "犠打（バント）", color: "bg-zinc-500/10" },
    { id: "SF", label: "犠牲フライ", color: "bg-zinc-500/10" },
    { id: "DP", label: "併殺打", color: "bg-red-50/50 dark:bg-red-950/20 text-red-800 dark:text-red-400" },
    { id: "UN", label: "その他アウト", color: "bg-zinc-500/10" },
  ];

  const handleConfirm = () => {
    if (!outType) return;
    
    const parts: string[] = [];
    if (selectedPos) parts.push(selectedPos);
    if (isFoul && (outType === "FO" || outType === "LO")) {
      parts.push("FOUL");
    }
    parts.push(outType);

    const resultString = parts.join("-");
    onResult(resultString, rbi);
    onOpenChange(false);
  };

  const getOutStyle = (id: string) => {
    const isActive = outType === id;
    if (id.startsWith("SO_")) {
      return isActive
        ? "bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/20"
        : "bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/30";
    }
    if (id === 'DP') {
      return isActive
        ? "bg-red-600 border-red-600 text-white shadow-md shadow-red-600/20"
        : "bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-950/30";
    }
    return isActive
      ? "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/20"
      : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800";
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-[440px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[95vh]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-3.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Out Action Detail</span>
            <h3 className="text-sm font-black text-zinc-900 dark:text-white mt-0.5">
              アウト詳細・守備記録
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
              アウトをとった守備位置をタップ (任意)
            </label>
            
            <div className="relative w-full aspect-square border border-zinc-100 dark:border-zinc-800/80 rounded-2xl bg-emerald-50/10 dark:bg-zinc-900/10 overflow-hidden shadow-inner">
              
              {/* 美しい野球場グラフィック (幾何学的に精密なSVG背景) */}
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full select-none pointer-events-none">
                {/* 外野の芝生 (ホーム 100,170 を中心とする半径 140 の美しい扇形) */}
                <path d="M 1,71 A 140,140 0 0,1 199,71 L 100,170 Z" className="fill-emerald-500/15 dark:fill-emerald-950/20 stroke-emerald-500/25 dark:stroke-emerald-800/30 stroke-[1.5]" />
                
                {/* 内野の土・ダイヤモンド (ホーム 100,170 を中心とする半径 78 の扇形) */}
                <path d="M 45,115 A 78,78 0 0,1 155,115 L 100,170 Z" className="fill-amber-500/10 dark:fill-amber-950/20 stroke-amber-500/20 dark:stroke-amber-800/15 stroke-1" />
                
                {/* 内野ダイヤモンド白線 (45度傾斜でベースと完璧に合致) */}
                <polygon points="100,170 128,142 100,114 72,142" className="fill-none stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5] stroke-dasharray-[2]" />
                
                {/* マウンド */}
                <circle cx="100" cy="142" r="5" className="fill-amber-500/5 dark:fill-amber-950/10 stroke-zinc-300 dark:stroke-zinc-700 stroke-[0.5]" />
                
                {/* 各ベース */}
                {/* 本塁 */}
                <polygon points="100,173 103,170 100,167 97,170" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                {/* 一塁 */}
                <rect x="125.5" y="139.5" width="5" height="5" transform="rotate(45, 128, 142)" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                {/* 二塁 */}
                <rect x="97.5" y="111.5" width="5" height="5" transform="rotate(45, 100, 114)" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                {/* 三塁 */}
                <rect x="69.5" y="139.5" width="5" height="5" transform="rotate(45, 72, 142)" className="fill-white stroke-zinc-400 stroke-[0.5]" />
                
                {/* 外野フェンスポールへの45度ファウルライン */}
                <line x1="100" y1="170" x2="1" y2="71" className="stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5]" />
                <line x1="100" y1="170" x2="199" y2="71" className="stroke-zinc-300 dark:stroke-zinc-800 stroke-[1.5]" />
              </svg>

              {/* 物理配置されたポジションバッジボタン */}
              {fieldPositions.map((pos) => {
                const isActive = selectedPos === pos.id;
                // ラベルマッピング
                const displayLabel = pos.label === "right" ? "右" : pos.label;
                
                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => {
                      setSelectedPos(pos.id === selectedPos ? null : pos.id);
                      setCoordinate({ x: pos.x, y: pos.y });
                    }}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-[9px] font-black tracking-tighter flex flex-col items-center justify-center shadow-sm select-none transition-all duration-300 active:scale-90 cursor-pointer border",
                      isActive
                        ? "bg-primary border-primary text-primary-foreground scale-110 z-30 shadow-md ring-2 ring-primary/20"
                        : "bg-white/90 border-zinc-200/80 text-zinc-800 hover:bg-zinc-150 hover:border-zinc-300 dark:bg-zinc-950/90 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    )}
                  >
                    <span>{displayLabel}</span>
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

          {/* 2. アウト種別の選択 */}
          <div className="space-y-1.5">
            <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">アウト種別</label>
            <div className="grid grid-cols-3 gap-2">
              {outTypes.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => {
                    setOutType(res.id);
                    // フライ/ライナー以外になったらファウルを強制オフ
                    if (res.id !== "FO" && res.id !== "LO") {
                      setIsFoul(false);
                    }
                  }}
                  className={cn(
                    "h-10 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center text-center leading-tight p-1",
                    getOutStyle(res.id)
                  )}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2.5. ファウルエリアでの捕球（邪）のトグル (フライ/ライナー選択時のみ表示) */}
          {(outType === "FO" || outType === "LO") && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
              <label className="text-[9.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">打球エリア（ファウルグラウンド判定）</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsFoul(false)}
                  className={cn(
                    "h-9 rounded-xl border font-black text-[11px] tracking-tight transition-all active:scale-95 cursor-pointer flex items-center justify-center",
                    !isFoul
                      ? "bg-primary/10 border-primary/20 text-primary"
                      : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                      : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  )}
                >
                  ファウルエリア（邪飛・邪直）
                </button>
              </div>
            </div>
          )}

          {/* 3. 打点手動調整（アコーディオン仕様） */}
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
            disabled={!outType}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs tracking-wide disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="h-4.5 w-4.5 stroke-[3px]" />
            {selectedPos ? "RECORD OUT" : "QUICK RECORD OUT"}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
