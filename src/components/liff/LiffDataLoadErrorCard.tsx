// filepath: src/components/liff/LiffDataLoadErrorCard.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";
import { cn } from "@/lib/utils";

/**
 * LINE トーク画面からの復帰・BFCache 復帰・オンライン回復時に、
 * 直前の通信失敗状態が残っていれば自動で再取得コールバックをトリガーする共通フック
 */
export function useLiffAutoRetryOnResume(
  shouldRetry: boolean,
  onRetry: () => void
): void {
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;
  const lastAutoRetryAtRef = useRef<number>(0);

  useEffect(() => {
    if (!shouldRetry || typeof window === "undefined") return;

    const triggerIfCooledDown = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const now = Date.now();
      if (now - lastAutoRetryAtRef.current < 1_500) return;
      lastAutoRetryAtRef.current = now;
      onRetryRef.current();
    };

    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, triggerIfCooledDown);
    window.addEventListener("online", triggerIfCooledDown);
    return () => {
      window.removeEventListener(LIFF_WEBVIEW_RESUMED_EVENT, triggerIfCooledDown);
      window.removeEventListener("online", triggerIfCooledDown);
    };
  }, [shouldRetry]);
}

interface LiffDataLoadErrorCardProps {
  title?: string;
  description?: string;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

/**
 * 🛡️ 通信エラー・一時的な接続不良時の専用リカバリーカード（A-3 Solid 2-Tier デザイン）
 * - 「データがありません」と誤認させず、ワンタップ再取得＆電波回復時の自動再取得を提供する。
 */
export function LiffDataLoadErrorCard({
  title = "通信が不安定なためデータを読み込めませんでした",
  description = "モバイル回線の切替や電波状況の影響で一時的に取得できませんでした。「再読み込み」を押すか、電波の良い場所で自動的に再取得されます。",
  onRetry,
  isRetrying = false,
  className,
}: LiffDataLoadErrorCardProps) {
  useLiffAutoRetryOnResume(!isRetrying, onRetry);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card shadow-xs overflow-hidden",
        className
      )}
    >
      <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[11px] font-black">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>通信リトライ待機中</span>
        </span>
        <span className="text-[11px] font-bold text-slate-300">
          データは消えていません
        </span>
      </div>

      <div className="p-5 flex flex-col items-center text-center space-y-3.5">
        <div className="w-11 h-11 rounded-2xl bg-amber-500/12 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <WifiOff className="w-5 h-5" />
        </div>

        <div className="space-y-1 max-w-sm">
          <h4 className="text-sm font-black text-foreground">{title}</h4>
          <p className="text-xs font-bold text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground text-xs font-black shadow-xs active:scale-95 transition-all cursor-pointer"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5 shrink-0", isRetrying && "animate-spin")}
          />
          <span>{isRetrying ? "再取得中..." : "再読み込み"}</span>
        </button>
      </div>
    </section>
  );
}
