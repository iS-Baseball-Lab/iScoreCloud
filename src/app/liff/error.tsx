// filepath: src/app/liff/error.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Home, Loader2, RefreshCw } from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import {
  isDeploySkewOrChunkError,
  reloadCurrentPageCleanly,
  tryAutoRecoverFromErrorBoundary,
} from "@/lib/liff/runtime-recovery";

interface LiffErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LiffErrorBoundary({
  error,
  reset,
}: LiffErrorBoundaryProps) {
  const [isAutoReloading, setIsAutoReloading] = useState<boolean>(() =>
    isDeploySkewOrChunkError(error)
  );

  useEffect(() => {
    console.error("[LiffErrorBoundary] Caught runtime error:", error);
    const triggered = tryAutoRecoverFromErrorBoundary(error);
    if (!triggered) {
      setIsAutoReloading(false);
    }
  }, [error]);

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
              {isAutoReloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="text-sm font-black text-white truncate">
                {isAutoReloading
                  ? "最新バージョンへ更新しています..."
                  : "ページの読み込みに失敗しました"}
              </h1>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                {isAutoReloading
                  ? "自動的にページを再読み込みします"
                  : "アプリ更新直後や通信環境の影響の可能性があります"}
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {isAutoReloading ? (
              <div className="py-4 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs font-bold">
                  最新の画面データを取得しています...
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  一時的な通信エラー、またはアプリのアップデート直後に古いキャッシュが干渉した可能性があります。下の「再読み込み」をお試しください。
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reloadCurrentPageCleanly()}
                    className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    <span>ページを再読み込み</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => reset()}
                    className="h-11 px-4 rounded-xl border border-border bg-card text-foreground hover:bg-muted font-black text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>もう一度試す</span>
                  </button>

                  <Link
                    href="/liff"
                    className="h-11 px-4 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted font-bold text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Home className="w-4 h-4 shrink-0" />
                    <span>ホームへ戻る</span>
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
