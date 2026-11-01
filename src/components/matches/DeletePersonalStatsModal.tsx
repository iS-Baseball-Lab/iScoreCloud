// filepath: src/components/matches/DeletePersonalStatsModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeletePersonalStatsOptions {
  clearLineups: boolean;
  resetMatchScore: boolean;
}

export interface DeletePersonalStatsModalProps {
  isOpen: boolean;
  matchId: string;
  opponentName: string;
  matchDateText?: string;
  scoreSummaryText?: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: (options: DeletePersonalStatsOptions) => void;
}

export function DeletePersonalStatsModal({
  isOpen,
  matchId,
  opponentName,
  matchDateText,
  scoreSummaryText,
  isDeleting,
  onCancel,
  onConfirm,
}: DeletePersonalStatsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [clearLineups, setClearLineups] = useState(false);
  const [resetMatchScore, setResetMatchScore] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // SKILL.md 規約5: 対象試合や開閉状態の変化時にオプション状態を安全にリセット
  useEffect(() => {
    if (!isOpen) {
      setClearLineups(false);
      setResetMatchScore(false);
    }
  }, [isOpen, matchId]);

  if (!mounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-personal-stats-title"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-card border-2 border-border shadow-2xl p-5 space-y-4 text-foreground animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <h3
                id="delete-personal-stats-title"
                className="text-sm sm:text-base font-black text-foreground leading-snug"
              >
                試合の個人データを削除しますか？
              </h3>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                vs {opponentName}
                {matchDateText ? `（${matchDateText}）` : ""}
                {scoreSummaryText ? ` ${scoreSummaryText}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            aria-label="閉じる"
            className="w-8 h-8 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 削除されるデータ・保持されるデータの明確な案内 */}
        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/80 space-y-1">
            <p className="font-black text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>削除される個人データ</span>
            </p>
            <p className="text-[11px] font-bold text-foreground/90 leading-relaxed pl-5">
              打撃・走塁・守備の個人成績、投手成績、各回の打席経過（1球履歴）、途中交代記録、保存済みスコアブック解析データ（チーム成績の個人集計からも除外されます）
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/70 space-y-1">
            <p className="font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>そのまま残るデータ</span>
            </p>
            <p className="text-[11px] font-bold text-foreground/90 leading-relaxed pl-5">
              試合日程・対戦相手・球場・YouTube動画URL・出欠情報
              {!resetMatchScore && "・イニングスコア（勝敗・得失点）"}
              {!clearLineups && "・登録済みスタメン"}
            </p>
          </div>
        </div>

        {/* 追加オプション（デフォルトOFFで誤消去を防止） */}
        <div className="rounded-2xl bg-muted/60 border border-border p-3 space-y-2.5">
          <p className="text-[10px] font-black text-muted-foreground">
            追加オプション（必要な場合のみチェック）
          </p>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={clearLineups}
              disabled={isDeleting}
              onChange={(e) => setClearLineups(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-rose-600 shrink-0 cursor-pointer"
            />
            <span className="text-[11px] font-bold text-foreground leading-snug">
              出場メンバー（スタメン・相手打順）もあわせてクリアする
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={resetMatchScore}
              disabled={isDeleting}
              onChange={(e) => setResetMatchScore(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-rose-600 shrink-0 cursor-pointer"
            />
            <span className="text-[11px] font-bold text-foreground leading-snug">
              イニングスコア（得点・失点・安打・失策）も 0 にリセットする
            </span>
          </label>
        </div>

        {/* アクションボタン */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            className="h-11 px-4 rounded-2xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            キャンセル
          </button>

          <button
            type="button"
            disabled={isDeleting}
            onClick={() =>
              onConfirm({
                clearLineups,
                resetMatchScore,
              })
            }
            className={cn(
              "h-11 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>削除中...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>個人データを削除</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

