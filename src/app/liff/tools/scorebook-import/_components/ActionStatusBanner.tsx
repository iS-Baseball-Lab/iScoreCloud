// filepath: src/app/liff/tools/scorebook-import/_components/ActionStatusBanner.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";

interface ActionStatusBannerProps {
  isLoading: boolean;
  loadingTitle: string;
  loadingDetail?: string;
  errorMessage?: string | null;
  onDismissError?: () => void;
}

export function ActionStatusBanner({
  isLoading,
  loadingTitle,
  loadingDetail,
  errorMessage,
  onDismissError,
}: ActionStatusBannerProps) {
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if ((isLoading || errorMessage) && bannerRef.current) {
      bannerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isLoading, errorMessage]);

  if (!isLoading && !errorMessage) {
    return null;
  }

  return (
    <div ref={bannerRef} className="space-y-2.5">
      {isLoading && (
        <div className="p-4 rounded-2xl bg-card border-2 border-indigo-500/45 shadow-xs flex items-start gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-black text-foreground">{loadingTitle}</p>
            {loadingDetail && (
              <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 leading-relaxed wrap-break-word">
                {loadingDetail}
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

