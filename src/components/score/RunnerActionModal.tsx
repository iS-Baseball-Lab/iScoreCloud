// filepath: src/components/score/RunnerActionModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, Trophy, AlertTriangle, Play, HelpCircle } from "lucide-react";

interface RunnerActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseNum: 1 | 2 | 3;
  playerName: string;
  onSelectAction: (
    action: "steal_success" | "steal_out" | "pickoff_out" | "pickoff_safe" | "wp_advance" | "pb_advance" | "balk_advance" | "error_advance" | "clear"
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

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen) return null;
  if (!mounted) return null;

  const actions = [
    {
      id: "steal_success",
      label: "🏃‍♂️ 盗塁成功",
      desc: "次の塁へ進みます",
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
      id: "clear",
      label: "❌ 走者解除 (記録なし)",
      desc: "ログに残さず単に走者を消去",
      color: "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-transparent",
    },
  ] as const;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)]">
        
        {/* モーダルヘッダー */}
        <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-col">
            <span className="text-xs font-black text-primary uppercase tracking-widest">Base Runner Action</span>
            <h3 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2 mt-0.5">
              <span>{baseNum}塁走者:</span>
              <span className="text-primary font-extrabold">{playerName}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* アクションリスト */}
        <div className="p-5 grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto">
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
        <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 flex justify-end border-t border-zinc-100 dark:border-zinc-800">
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
