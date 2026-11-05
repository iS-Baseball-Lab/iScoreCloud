// filepath: src/components/liff/DeleteMatchModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeleteMatchModalProps {
  isOpen: boolean;
  matchId: string;
  opponentName: string;
  matchDateText?: string;
  scoreSummaryText?: string;
  hasPersonalStatsData?: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteMatchModal({
  isOpen,
  matchId,
  opponentName,
  matchDateText,
  scoreSummaryText,
  hasPersonalStatsData = false,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteMatchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // SKILL.md 規約5: 対象試合や開閉状態の変化時に確認チェックを安全にリセット
  useEffect(() => {
    if (!isOpen) {
      setIsAcknowledged(false);
    }
  }, [isOpen, matchId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!mounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-match-modal-title"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground animate-in slide-in-from-bottom-3 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 Dark Solid Header Cap (Danger: border-rose-600) */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-600 px-4 py-3.5 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="delete-match-modal-title"
                className="text-sm sm:text-base font-black text-white leading-snug"
              >
                この試合データを完全に削除しますか？
              </h3>
              <p className="text-[11px] font-bold text-slate-300 mt-0.5 truncate">
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
            className="w-8 h-8 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* スクロール可能な注意喚起ボディ */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-500 space-y-2">
            <p className="text-xs font-black text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>注意：この操作は取り消せません</span>
            </p>
            <p className="text-[11px] font-bold text-foreground leading-relaxed">
              試合そのものに加えて、紐づく<strong className="text-rose-700 dark:text-rose-300 font-black">すべての関連データが完全に消去</strong>され、復元することはできません。
            </p>
            <ul className="space-y-1 text-[11px] font-bold text-foreground/90 pl-1 pt-0.5">
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600 font-black shrink-0">・</span>
                <span>試合予定・対戦結果・イニングスコア・YouTube動画リンク</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600 font-black shrink-0">・</span>
                <span>出場スタメン・相手打順・控え/欠席・途中交代記録</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600 font-black shrink-0">・</span>
                <span>全打席の1球履歴・走塁記録・打撃/投手個人成績（チーム通算成績からも除外）</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600 font-black shrink-0">・</span>
                <span>清書スコアブック解析データ・当日のしおり・審判/運営役割メモ</span>
              </li>
            </ul>
          </div>

          {hasPersonalStatsData && (
            <div className="p-3 rounded-xl bg-muted/60 border border-border flex items-start gap-2 text-[11px] font-bold text-muted-foreground leading-relaxed">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                試合日程やスコアは残して「打席・個人成績だけ」を取り込み直したい場合は、キャンセルして<strong className="text-foreground">「この試合の個人データを削除」</strong>をご利用ください。
              </span>
            </div>
          )}

          {/* 誤操作防止の必須確認チェックボックス */}
          <label
            className={cn(
              "flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer select-none transition-colors",
              isAcknowledged
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-500"
                : "bg-card border-border hover:bg-muted/40"
            )}
          >
            <input
              type="checkbox"
              checked={isAcknowledged}
              disabled={isDeleting}
              onChange={(e) => setIsAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-rose-600 shrink-0 cursor-pointer"
            />
            <span className="text-xs font-black text-foreground leading-snug">
              関連データも含めてすべて削除され、元に戻せないことを確認しました
            </span>
          </label>
        </div>

        {/* フッターアクション（Safe Area対応） */}
        <div className="px-4 sm:px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-4 bg-muted/40 border-t border-border grid grid-cols-2 gap-2.5 shrink-0">
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
            disabled={!isAcknowledged || isDeleting}
            onClick={onConfirm}
            className={cn(
              "h-11 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer",
              isAcknowledged && !isDeleting
                ? "bg-rose-600 hover:bg-rose-700 text-white active:scale-95"
                : "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-65"
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>完全削除中...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>試合データを完全削除</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

