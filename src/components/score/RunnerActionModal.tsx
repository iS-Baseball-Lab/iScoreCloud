// filepath: src/components/score/RunnerActionModal.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { X, Trophy, AlertTriangle, Play, HelpCircle } from "lucide-react";

interface RunnerActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseNum: 1 | 2 | 3;
  playerName: string;
  onSelectAction: (
    action: "steal_success" | "steal_out" | "pickoff_out" | "wp_advance" | "pb_advance" | "balk_advance" | "error_advance" | "clear"
  ) => void;
}

export function RunnerActionModal({
  isOpen,
  onClose,
  baseNum,
  playerName,
  onSelectAction,
}: RunnerActionModalProps) {
  if (!isOpen) return null;

  const actions = [
    {
      id: "steal_success",
      label: "🏃‍♂️ 盗塁成功",
      desc: "次の塁へ進みます",
      color: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500",
    },
    {
      id: "steal_out",
      label: "⚠️ 盗塁死 (CS)",
      desc: "盗塁失敗でアウトになります",
      color: "bg-rose-600 hover:bg-rose-700 text-white border-rose-500",
    },
    {
      id: "pickoff_out",
      label: "🎯 牽制死",
      desc: "牽制球でタッチアウト",
      color: "bg-red-700 hover:bg-red-800 text-white border-red-600",
    },
    {
      id: "wp_advance",
      label: "💨 暴投進塁 (WP)",
      desc: "ピッチャーのワイルドピッチで進塁",
      color: "bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white border-zinc-500",
    },
    {
      id: "pb_advance",
      label: "捕逸進塁 (PB)",
      desc: "キャッチャーのパスボールで進塁",
      color: "bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white border-zinc-500",
    },
    {
      id: "balk_advance",
      label: "⚡️ ボーク進塁",
      desc: "ボーク（投手の反則）で進塁",
      color: "bg-amber-600 hover:bg-amber-700 text-white border-amber-500",
    },
    {
      id: "error_advance",
      label: "🛠 エラー進塁",
      desc: "相手のエラーで進塁",
      color: "bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white border-zinc-500",
    },
    {
      id: "clear",
      label: "❌ 走者解除 (記録なし)",
      desc: "ログに残さず単に走者を消去",
      color: "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-600 border-zinc-300 dark:border-zinc-600",
    },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-800">
          <div className="flex flex-col">
            <span className="text-xs font-black text-primary uppercase tracking-widest">Base Runner Action</span>
            <h3 className="text-base font-black text-white flex items-center gap-2 mt-0.5">
              <span>{baseNum}塁走者:</span>
              <span className="text-yellow-400 font-extrabold">{playerName}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* アクションリスト */}
        <div className="p-4 grid grid-cols-1 gap-2.5 max-h-[70vh] overflow-y-auto">
          {actions.map((act) => (
            <button
              key={act.id}
              onClick={() => {
                onSelectAction(act.id);
                onClose();
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

        {/* モーダルフッター */}
        <div className="bg-zinc-900 px-4 py-3 flex justify-end border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black tracking-wider transition-colors active:scale-95"
          >
            キャンセル
          </button>
        </div>

      </div>
    </div>
  );
}
