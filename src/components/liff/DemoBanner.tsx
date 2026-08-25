// filepath: src/components/liff/DemoBanner.tsx
"use client";

import React from "react";
import { Sparkles, UserPlus, ShieldAlert, ArrowRight } from "lucide-react";

interface DemoBannerProps {
  onOpenJoinModal: () => void;
}

export function DemoBanner({ onOpenJoinModal }: DemoBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-amber-500/10 border-2 border-amber-500/30 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-foreground">
                体験用デモチーム表示中
              </span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-500 text-white text-[9px] font-black tracking-wide">
                SAMPLE
              </span>
            </div>
            <p className="text-[11px] font-bold text-muted-foreground leading-snug">
              現在はサンプルの予定・試合動画を表示しています。自分のチームに参加すると実際のデータが同期されます。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenJoinModal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs shadow-sm transition-all shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>招待コードで参加</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 背景の装飾 */}
      <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
    </div>
  );
}
