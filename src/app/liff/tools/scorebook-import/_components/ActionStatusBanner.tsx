// filepath: src/app/liff/tools/scorebook-import/_components/ActionStatusBanner.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
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
  /** 完了・中断後の確定トータル所要時間（ミリ秒） */
  totalDurationMs?: number | null;
  /** 現在実行中のサブステップ名（単一指定用） */
  activeSubStepLabel?: string | null;
  /** 現在並列実行中のサブステップ名リスト（例: ["2回表", "2回裏"]） */
  activeSubStepLabels?: string[];
  /** 現在実行中のサブステップ開始時刻 (Date.now()) */
  activeSubStepStartedAtMs?: number | null;
  /** 完了・エラー記録済みのイニング・シート別所要秒数リスト */
  completedTimings?: ScorebookTimingEntry[];
  /** ローディング終了・エラー閉じた後も解析経過パネルを常時表示するか */
  persistTimingsWhenIdle?: boolean;
  /** 待機中に個別イニングバッジをタップして単独再解析するコールバック */
  onRetryEntry?: (entry: ScorebookTimingEntry) => void;
  /** 現在単独再解析中のエントリキー */
  retryingEntryKey?: string | null;
}

export function ActionStatusBanner({
  isLoading,
  loadingTitle,
  loadingDetail,
  errorMessage,
  onDismissError,
  autoScrollOnLoading = true,
  startedAtMs = null,
  totalDurationMs = null,
  activeSubStepLabel = null,
  activeSubStepLabels,
  activeSubStepStartedAtMs = null,
  completedTimings = [],
  persistTimingsWhenIdle = false,
  onRetryEntry,
  retryingEntryKey = null,
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

  const activeLabels =
    activeSubStepLabels && activeSubStepLabels.length > 0
      ? activeSubStepLabels
      : activeSubStepLabel
      ? [activeSubStepLabel]
      : [];

  const showIdleBreakdown =
    !isLoading &&
    completedTimings.length > 0 &&
    (Boolean(errorMessage) || persistTimingsWhenIdle || Boolean(retryingEntryKey));

  if (!isLoading && !errorMessage && !showIdleBreakdown) {
    return null;
  }

  const totalElapsedMs =
    startedAtMs && nowMs >= startedAtMs ? nowMs - startedAtMs : null;
  const subElapsedMs =
    activeSubStepStartedAtMs && nowMs >= activeSubStepStartedAtMs
      ? nowMs - activeSubStepStartedAtMs
      : null;
  const hasTimingBreakdown =
    completedTimings.length > 0 || activeLabels.length > 0;

  const successCount = completedTimings.filter(
    (e) => e.status !== "error"
  ).length;
  const errorCount = completedTimings.filter(
    (e) => e.status === "error"
  ).length;
  const idleDisplayTotalMs =
    totalDurationMs ??
    (completedTimings.length > 0
      ? completedTimings.reduce((acc, item) => acc + item.durationMs, 0)
      : null);

  const renderTimingBadges = (interactive: boolean) => (
    <div className="flex flex-wrap gap-1.5">
      {completedTimings.map((entry) => {
        const isEntryError = entry.status === "error";
        const isRetryingThis = retryingEntryKey === entry.key;
        const canClickRetry =
          interactive && Boolean(onRetryEntry) && !retryingEntryKey;

        if (isRetryingThis) {
          return (
            <span
              key={entry.key}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black tabular-nums inline-flex items-center gap-1"
            >
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span>{entry.label}</span>
              <span>再解析中...</span>
            </span>
          );
        }

        const badgeContent = (
          <>
            {isEntryError ? (
              <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span>{entry.label}</span>
            <span
              className={
                isEntryError
                  ? "text-destructive"
                  : "text-emerald-700 dark:text-emerald-300"
              }
            >
              {isEntryError
                ? `エラー (${formatElapsedSeconds(entry.durationMs)})`
                : entry.fromCache
                ? "保持済"
                : formatElapsedSeconds(entry.durationMs)}
            </span>
            {interactive && onRetryEntry && (
              <span
                className={`ml-0.5 pl-1 border-l inline-flex items-center gap-0.5 ${
                  isEntryError
                    ? "border-destructive/35 text-destructive"
                    : "border-border text-indigo-600 dark:text-indigo-400"
                }`}
              >
                <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                {isEntryError && <span>再解析</span>}
              </span>
            )}
          </>
        );

        const badgeClassName = `px-2 py-1 rounded-lg bg-card border text-[10px] font-black tabular-nums inline-flex items-center gap-1 ${
          isEntryError
            ? "border-destructive/60 text-destructive"
            : "border-emerald-500/45 text-foreground"
        } ${
          canClickRetry
            ? "cursor-pointer hover:bg-muted active:scale-95 transition-all"
            : ""
        }`;

        if (interactive && onRetryEntry) {
          return (
            <button
              key={entry.key}
              type="button"
              disabled={!canClickRetry}
              onClick={() => onRetryEntry(entry)}
              title={`${entry.label}をAI再解析`}
              className={badgeClassName}
            >
              {badgeContent}
            </button>
          );
        }

        return (
          <span key={entry.key} className={badgeClassName}>
            {badgeContent}
          </span>
        );
      })}

      {isLoading &&
        activeLabels.map((lbl, idx) => (
          <span
            key={`active-${lbl}-${idx}`}
            className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black tabular-nums inline-flex items-center gap-1"
          >
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>{lbl}</span>
            {idx === 0 && subElapsedMs !== null && activeLabels.length === 1 && (
              <span>{formatElapsedSeconds(subElapsedMs)}</span>
            )}
          </span>
        ))}
    </div>
  );

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
                イニング・シート別の解析経過（完了分は自動保持されます）
              </p>
              {renderTimingBadges(false)}
            </div>
          )}
        </div>
      )}

      {/* エラー発生時や中断後も、完了済み・エラー箇所の解析経過を消さずに残すパネル */}
      {showIdleBreakdown && (
        <div
          className={`p-3.5 rounded-2xl bg-card border-2 shadow-xs space-y-2 ${
            errorCount > 0
              ? "border-amber-500/55"
              : "border-emerald-500/45"
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <p className="text-xs font-black text-foreground">
                解析経過（完了 {successCount}件
                {errorCount > 0 ? ` / エラー ${errorCount}件` : ""}）
              </p>
            </div>
            {idleDisplayTotalMs !== null && idleDisplayTotalMs > 0 && (
              <span className="px-2.5 py-0.5 rounded-lg bg-muted border border-border text-foreground text-[11px] font-black tabular-nums shrink-0">
                合計 {formatTotalElapsedSeconds(idleDisplayTotalMs)}
              </span>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-muted border border-border space-y-1.5">
            {renderTimingBadges(true)}
            {onRetryEntry && (
              <p className="text-[10px] font-bold text-muted-foreground pt-0.5">
                💡 各イニングのバッジをタップすると、その回だけピンポイントでAI再解析できます
              </p>
            )}
          </div>
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

