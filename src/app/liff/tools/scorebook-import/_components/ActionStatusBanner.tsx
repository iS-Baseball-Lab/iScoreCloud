// filepath: src/app/liff/tools/scorebook-import/_components/ActionStatusBanner.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, X } from "lucide-react";
import {
  formatElapsedSeconds,
  formatTotalElapsedSeconds,
  type ScorebookTimingEntry,
} from "@/types/scorebook-v2";

interface ActionStatusBannerProps {
  isLoading: boolean;
  loadingTitle: string;
  loadingDetail?: string;
  errorMessage?: string | null;
  onDismissError?: () => void;
  autoScrollOnLoading?: boolean;
  /** 全体解析の開始時刻 (Date.now()) — 指定時はリアルタイム経過秒数をカウントアップ表示 */
  startedAtMs?: number | null;
  /** 現在実行中のサブステップ名（例: "3回表" / "先攻シート"） */
  activeSubStepLabel?: string | null;
  /** 現在実行中のサブステップ開始時刻 (Date.now()) */
  activeSubStepStartedAtMs?: number | null;
  /** 完了済みのイニング・シート別所要秒数リスト */
  completedTimings?: ScorebookTimingEntry[];
}

export function ActionStatusBanner({
  isLoading,
  loadingTitle,
  loadingDetail,
  errorMessage,
  onDismissError,
  autoScrollOnLoading = true,
  startedAtMs = null,
  activeSubStepLabel = null,
  activeSubStepStartedAtMs = null,
  completedTimings = [],
}: ActionStatusBannerProps) {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const shouldScroll =
      Boolean(errorMessage) || (isLoading && autoScrollOnLoading);
    if (shouldScroll && bannerRef.current) {
      bannerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isLoading, autoScrollOnLoading, errorMessage]);

  useEffect(() => {
    if (!isLoading || (!startedAtMs && !activeSubStepStartedAtMs)) {
      return;
    }
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => window.clearInterval(timer);
  }, [isLoading, startedAtMs, activeSubStepStartedAtMs]);

  if (!isLoading && !errorMessage) {
    return null;
  }

  const totalElapsedMs =
    startedAtMs && nowMs >= startedAtMs ? nowMs - startedAtMs : null;
  const subElapsedMs =
    activeSubStepStartedAtMs && nowMs >= activeSubStepStartedAtMs
      ? nowMs - activeSubStepStartedAtMs
      : null;
  const hasTimingBreakdown =
    completedTimings.length > 0 || Boolean(activeSubStepLabel);

  return (
    <div ref={bannerRef} className="space-y-2.5">
      {isLoading && (
        <div className="p-4 rounded-2xl bg-card border-2 border-indigo-500/45 shadow-xs space-y-2.5">
          <div className="flex items-start gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-black text-foreground">
                  {loadingTitle}
                </p>
                {totalElapsedMs !== null && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black tabular-nums flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>合計 {formatTotalElapsedSeconds(totalElapsedMs)}</span>
                  </span>
                )}
              </div>
              {loadingDetail && (
                <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 leading-relaxed wrap-break-word">
                  {loadingDetail}
                </p>
              )}
            </div>
          </div>

          {hasTimingBreakdown && (
            <div className="p-2.5 rounded-xl bg-muted border border-border space-y-1.5">
              <p className="text-[10px] font-black text-muted-foreground">
                イニング・シート別の所要秒数
              </p>
              <div className="flex flex-wrap gap-1.5">
                {completedTimings.map((entry) => (
                  <span
                    key={entry.key}
                    className="px-2 py-1 rounded-lg bg-card border border-emerald-500/40 text-foreground text-[10px] font-black tabular-nums inline-flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{entry.label}</span>
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {entry.fromCache
                        ? "キャッシュ済"
                        : formatElapsedSeconds(entry.durationMs)}
                    </span>
                  </span>
                ))}

                {activeSubStepLabel && (
                  <span className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black tabular-nums inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    <span>{activeSubStepLabel}</span>
                    {subElapsedMs !== null && (
                      <span>{formatElapsedSeconds(subElapsedMs)}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-card border-2 border-destructive/60 shadow-xs flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-black text-destructive">
              エラーが発生しました
            </p>
            <p className="text-[11px] font-bold text-foreground leading-relaxed wrap-break-word">
              {errorMessage}
            </p>
          </div>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              className="p-1 rounded-full bg-muted hover:bg-destructive/15 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer transition-colors"
              aria-label="エラー表示を閉じる"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

