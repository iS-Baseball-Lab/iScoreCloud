// filepath: src/components/score/RunnerActionModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, Trophy, AlertTriangle, Play, HelpCircle, ArrowLeft } from "lucide-react";

interface RunnerActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseNum: 1 | 2 | 3;
  playerName: string;
  onSelectAction: (
    action: "steal_success" | "steal_out" | "pickoff_out" | "pickoff_safe" | "wp_advance" | "pb_advance" | "balk_advance" | "error_advance" | "hit_advance" | "clear" | "silent_advance",
    targetBase?: 2 | 3 | 4
  ) => void;
}

export function RunnerActionModal({
  isOpen,
  onClose,
  baseNum,
  playerName,
  onSelectAction,
}: RunnerActionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"action" | "target-base">("action");
  const [pendingAction, setPendingAction] = useState<
    "steal_success" | "steal_out" | "pickoff_out" | "pickoff_safe" | "wp_advance" | "pb_advance" | "balk_advance" | "error_advance" | "hit_advance" | "clear" | null
  >(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // モーダルの開閉時に状態をリセット
  useEffect(() => {
    if (!isOpen) {
      setStep("action");
      setPendingAction(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (!mounted) return null;

  const actions = [
    {
      id: "hit_advance",
      label: "🏃‍♂️ 進塁 (打球・その他)",
      desc: "打球や犠打、野手選択などのプレイで進塁します",
      color: "bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300",
    },
    {
      id: "steal_success",
      label: "🏃‍♂️ 盗塁成功",
      desc: "次の塁へ盗塁します",
      color: "bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300",
    },
    {
      id: "steal_out",
      label: "⚠️ 盗塁死 (CS)",
      desc: "盗塁失敗でアウトになります",
      color: "bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300",
    },
    {
      id: "pickoff_out",
      label: "🎯 牽制死",
      desc: "牽制球でタッチアウト",
      color: "bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300",
    },
    {
      id: "pickoff_safe",
      label: "⚾️ 牽制球 (セーフ)",
      desc: "牽制球を投げました（走者セーフ）",
      color: "bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300",
    },
    {
      id: "wp_advance",
      label: "💨 暴投進塁 (WP)",
      desc: "ピッチャーのワイルドピッチで進塁",
      color: "bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white",
    },
    {
      id: "pb_advance",
      label: "捕逸進塁 (PB)",
      desc: "キャッチャーのパスボールで進塁",
      color: "bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white",
    },
    {
      id: "balk_advance",
      label: "⚡️ ボーク進塁",
      desc: "ボーク（投手の反則）で進塁",
      color: "bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300",
    },
    {
      id: "error_advance",
      label: "🛠 エラー進塁",
      desc: "相手のエラーで進塁",
      color: "bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white",
    },
    {
      id: "silent_advance",
      label: "🔄 記録なし進塁 (位置スライド)",
      desc: "ログに残さず、走者の位置だけを別の塁に移動させます",
      color: "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 border-dashed",
    },
    {
      id: "clear",
      label: "❌ 走者解除 (記録なし)",
      desc: "ログに残さず単に走者を消去",
      color: "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-transparent",
    },
  ] as const;

  // 進塁先ターゲットオプション
  const getAdvanceTargets = () => {
    if (baseNum === 1) {
      return [
        { base: 2 as const, label: "👉 2塁へ進む", color: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300" },
        { base: 3 as const, label: "👉 3塁へ進む (一発進塁)", color: "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300" },
        { base: 4 as const, label: "🔥 本塁へ生還 (ホームイン)", color: "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" },
      ];
    }
    if (baseNum === 2) {
      return [
        { base: 3 as const, label: "👉 3塁へ進む", color: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300" },
        { base: 4 as const, label: "🔥 本塁へ生還 (ホームイン)", color: "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" },
      ];
    }
    return [];
  };

  const getActionLabel = (id: string | null) => {
    return actions.find(a => a.id === id)?.label || "進塁";
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)] transition-all duration-300">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {step === "target-base" && (
              <button
                onClick={() => {
                  setStep("action");
                  setPendingAction(null);
                }}
                className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                title="戻る"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-xs font-black text-primary uppercase tracking-widest">
                {step === "action" ? "Base Runner Action" : "Select Advance Base"}
              </span>
              <h3 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2 mt-0.5">
                <span>{baseNum}塁走者:</span>
                <span className="text-primary font-extrabold">{playerName}</span>
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── ステップ1: アクション一覧 ─── */}
        {step === "action" && (
          <div className="p-5 grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
            {actions.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  const isAdvance = [
                    "hit_advance",
                    "steal_success",
                    "wp_advance",
                    "pb_advance",
                    "balk_advance",
                    "error_advance",
                    "silent_advance"
                  ].includes(act.id);

                  if (isAdvance && baseNum < 3) {
                    // 1塁・2塁走者かつ進塁アクションの場合は進塁先選択ステップへ移行
                    setPendingAction(act.id as any);
                    setStep("target-base");
                  } else {
                    // それ以外は即決定 (3塁走者の進塁は本塁4確定)
                    const target = (baseNum === 3 && isAdvance) ? 4 : undefined;
                    onSelectAction(act.id as any, target);
                    onClose();
                  }
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border flex flex-col justify-center active:scale-[0.98] transition-all",
                  act.color
                )}
              >
                <span className="text-sm font-bold tracking-wide">{act.label}</span>
                <span className="text-[10px] opacity-80 mt-0.5">{act.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* ─── ステップ2: 進塁先の選択 ─── */}
        {step === "target-base" && (
          <div className="p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-200">
            <div className="text-xs text-muted-foreground flex flex-col bg-zinc-50 dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <span className="font-bold text-zinc-500 dark:text-zinc-400">選択したアクション:</span>
              <span className="text-sm font-black text-zinc-800 dark:text-white mt-1">{getActionLabel(pendingAction)}</span>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">進塁先の塁を選択</span>
              {getAdvanceTargets().map((tgt) => (
                <button
                  key={tgt.base}
                  onClick={() => {
                    if (pendingAction) {
                      onSelectAction(pendingAction, tgt.base);
                    }
                    onClose();
                  }}
                  className={cn(
                    "w-full text-center px-4 py-3.5 rounded-xl border font-black text-sm active:scale-[0.97] transition-all shadow-sm",
                    tgt.color
                  )}
                >
                  {tgt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* モーダルフッター */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 flex justify-between border-t border-zinc-100 dark:border-zinc-800">
          {step === "target-base" ? (
            <button
              onClick={() => {
                setStep("action");
                setPendingAction(null);
              }}
              className="px-4 py-2 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white text-xs font-black tracking-wider transition-colors active:scale-95 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              戻る
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-black tracking-wider transition-colors active:scale-95"
          >
            キャンセル
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

