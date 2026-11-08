// filepath: src/components/liff/DemoBanner.tsx
"use client";

import React, { useState } from "react";
import { UserPlus, ArrowRight, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { LiffPendingTeamItem } from "./LiffProvider";

interface DemoBannerProps {
  onOpenJoinModal: () => void;
  pendingTeams?: LiffPendingTeamItem[];
  onRefreshStatus?: () => Promise<void> | void;
}

export function DemoBanner({
  onOpenJoinModal,
  pendingTeams = [],
  onRefreshStatus,
}: DemoBannerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    if (!onRefreshStatus || isRefreshing) return;
    try {
      setIsRefreshing(true);
      await onRefreshStatus();
      toast.success("最新の承認状況を確認しました");
    } finally {
      setIsRefreshing(false);
    }
  };

  // ⏳ 参加申請済み・管理者の承認待ち状態
  if (pendingTeams.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/liff-logo.webp"
              alt="iScoreCloud LINEミニアプリ"
              width={24}
              height={24}
              className="w-6 h-6 rounded-[22%] bg-slate-900 border border-slate-700 object-contain shrink-0"
            />
            <span className="text-xs font-black text-white truncate">
              チーム参加・承認待ち
            </span>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shrink-0">
            <Clock className="w-3 h-3" />
            管理者確認中
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-2">
            {pendingTeams.map((pt) => (
              <div
                key={pt.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted border border-border"
              >
                <img
                  src={pt.logoImageUrl || "/liff-logo.webp"}
                  alt={pt.name}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-lg bg-card border border-border object-contain shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-foreground truncate">
                    現在「{pt.name}」への参加承認待ちです
                  </p>
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    参加申請は正常に送信されています
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            チーム管理者が承認すると、この画面から実際の予定・出欠・配車・試合データが自動的に表示されます。（承認までは体験用デモ画面をお試しいただけます）
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {onRefreshStatus && (
              <button
                type="button"
                onClick={() => void handleRefreshClick()}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground font-black text-xs shadow-xs transition-all disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span>{isRefreshing ? "確認中..." : "承認状況を更新"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenJoinModal}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-muted hover:bg-muted/80 active:scale-95 text-foreground font-black text-xs transition-all"
            >
              <UserPlus className="w-3.5 h-3.5 text-primary" />
              <span>別の招待コードを入力</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 🌟 通常の体験デモチーム表示バナー
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border border-l-4 border-l-amber-500 bg-card p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-start gap-2.5">
          <img
            src="/liff-logo.webp"
            alt="iScoreCloud LINEミニアプリ"
            width={36}
            height={36}
            className="w-9 h-9 rounded-[22%] border border-border bg-slate-900 object-contain shrink-0 mt-0.5 shadow-xs"
          />
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
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground font-black text-xs shadow-xs transition-all shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>招待コードで参加</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
