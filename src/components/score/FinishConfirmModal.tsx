// filepath: src/components/score/FinishConfirmModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Home, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinishConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmFinish: () => void;
  onReturnToDashboard: () => void;
}

export function FinishConfirmModal({
  open,
  onOpenChange,
  onConfirmFinish,
  onReturnToDashboard,
}: FinishConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open) return null;
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-2xl p-6 space-y-6 animate-in slide-in-from-bottom-4 duration-300">
        
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center shrink-0">
            <AlertCircle className="h-6 w-6 text-rose-500" />
          </div>
          <div>
            <h3 className="font-black text-base text-foreground leading-tight">試合終了の選択</h3>
            <p className="text-xs text-muted-foreground mt-0.5">次に行うアクションを選択してください</p>
          </div>
        </div>

        {/* アクションリスト */}
        <div className="space-y-2">
          {/* 本当に試合を終了する */}
          <button
            type="button"
            onClick={() => {
              onConfirmFinish();
              onOpenChange(false);
            }}
            className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl flex items-center justify-between px-4 transition-all active:scale-[0.98] shadow-md border-b-2 border-rose-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <span className="block font-black text-[12px]">本当に試合を終了する</span>
                <span className="block text-[8.5px] font-medium opacity-80 mt-0.5">結果を確定し、試合を正式に終了（ゲームセット）します</span>
              </div>
            </div>
          </button>

          {/* ダッシュボードに戻る（中断） */}
          <button
            type="button"
            onClick={() => {
              onReturnToDashboard();
              onOpenChange(false);
            }}
            className="w-full h-14 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 font-black text-xs rounded-2xl flex items-center justify-between px-4 transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-3 text-foreground">
              <Home className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <span className="block font-black text-[12px]">一時保存してダッシュボードに戻る</span>
                <span className="block text-[8.5px] font-medium text-muted-foreground mt-0.5">記録は終了せず、後から編集を再開できます</span>
              </div>
            </div>
          </button>
        </div>

        {/* キャンセルボタン */}
        <div className="pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full h-12 rounded-2xl font-bold gap-2 text-xs"
          >
            <X className="w-4 h-4" />
            キャンセル（Liveスコアに戻る）
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
