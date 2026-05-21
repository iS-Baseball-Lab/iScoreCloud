// src/components/score/AdvanceModal.tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Trophy, ShieldAlert, Footprints, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdvanceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // 💡 結果を確定した時に呼ばれるコールバック
    onComplete?: (result: string) => void;
}

// 💡 プレイ結果の選択肢マスター
const PLAY_RESULTS = {
    HITS: [
        { id: "1B", label: "単打", short: "1B", color: "emerald" },
        { id: "2B", label: "二塁打", short: "2B", color: "emerald" },
        { id: "3B", label: "三塁打", short: "3B", color: "emerald" },
        { id: "HR", label: "本塁打", short: "HR", color: "primary" }, // HRは特別色
    ],
    OUTS: [
        { id: "OUT", label: "ゴロ/フライ", short: "Out", color: "red" },
        { id: "DP", label: "併殺 (ゲッツー)", short: "DP", color: "red" },
        { id: "SAC", label: "犠打/犠飛", short: "Sac", color: "orange" },
        { id: "FC", label: "野手選択", short: "FC", color: "red" },
    ],
    ERRORS: [
        { id: "ERR", label: "エラー (失策)", short: "E", color: "amber" },
    ],
};

export function AdvanceModal({ open, onOpenChange, onComplete }: AdvanceModalProps) {
    // 選択された結果のID
    const [selectedResult, setSelectedResult] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setTimeout(() => setSelectedResult(null), 200);
        }
        onOpenChange(newOpen);
    };

    const handleComplete = () => {
        if (selectedResult) {
            onComplete?.(selectedResult);
            handleOpenChange(false);
        }
    };

    // 💡 カラーに応じたTailwindクラスを返すヘルパー
    const getColorClasses = (color: string, isSelected: boolean) => {
        switch (color) {
            case "emerald":
                return isSelected
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30";
            case "primary":
                return isSelected
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 text-primary hover:bg-primary/10 dark:hover:bg-primary/20";
            case "red":
                return isSelected
                    ? "bg-rose-500 border-rose-500 text-white"
                    : "bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/30";
            case "orange":
                return isSelected
                    ? "bg-orange-500 border-orange-500 text-white"
                    : "bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-orange-850 dark:text-orange-400 hover:bg-orange-100/50 dark:hover:bg-orange-950/30";
            case "amber":
                return isSelected
                    ? "bg-amber-500 border-amber-500 text-white"
                    : "bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-950/30";
            default:
                return "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white";
        }
    };

    if (!open || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
                
                {/* モーダルヘッダー */}
                <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl text-primary border border-primary/20">
                            <Footprints className="h-5 w-5" />
                        </div>
                        <div>
                            <span className="text-xs font-black text-primary uppercase tracking-widest leading-none">Play Result</span>
                            <h3 className="text-base font-black text-zinc-900 dark:text-white leading-tight mt-0.5">
                                プレイの結果
                            </h3>
                        </div>
                    </div>
                    <button
                        onClick={() => handleOpenChange(false)}
                        className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 選択ボタンエリア */}
                <div className="p-5 overflow-y-auto space-y-6 flex-1">
                    <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest px-1">
                        バッターの打席結果を選択してください。
                    </p>

                    {/* ① 安打 (HITS) */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest pl-1 flex items-center gap-1.5 leading-none">
                            <Trophy className="h-3.5 w-3.5" /> 安打 (Hit)
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {PLAY_RESULTS.HITS.map((item) => {
                                const isSelected = selectedResult === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedResult(item.id)}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl border transition-all duration-200 active:scale-95",
                                            getColorClasses(item.color, isSelected)
                                        )}
                                    >
                                        <span className="font-black text-lg tracking-tighter leading-none">{item.short}</span>
                                        <span className="text-[9px] font-bold opacity-90 leading-none mt-0.5">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ② アウト (OUTS) */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest pl-1 flex items-center gap-1.5 leading-none">
                            <ShieldAlert className="h-3.5 w-3.5" /> アウト (Out)
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {PLAY_RESULTS.OUTS.map((item) => {
                                const isSelected = selectedResult === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedResult(item.id)}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl border transition-all duration-200 active:scale-95",
                                            getColorClasses(item.color, isSelected)
                                        )}
                                    >
                                        <span className="font-black text-base tracking-tighter leading-none">{item.short}</span>
                                        <span className="text-[9px] font-bold opacity-90 leading-none mt-0.5">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ③ エラー (ERRORS) */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest pl-1 leading-none">
                            エラー・その他
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {PLAY_RESULTS.ERRORS.map((item) => {
                                const isSelected = selectedResult === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedResult(item.id)}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl border transition-all duration-200 active:scale-95",
                                            getColorClasses(item.color, isSelected)
                                        )}
                                    >
                                        <span className="font-black text-base tracking-tighter leading-none">{item.short}</span>
                                        <span className="text-[9px] font-bold opacity-90 leading-none mt-0.5">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                </div>

                {/* フッターアクションエリア */}
                <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                        disabled={!selectedResult}
                        onClick={handleComplete}
                        className="w-full h-12 rounded-xl font-black text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        {selectedResult ? "結果を確定して次へ" : "結果を選択してください"}
                        {selectedResult && <ChevronRight className="h-5 w-5" />}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}