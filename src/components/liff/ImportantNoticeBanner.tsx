// filepath: src/components/liff/ImportantNoticeBanner.tsx
"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportantNoticeBannerProps {
  notice?: string | null;
  compact?: boolean;
  className?: string;
}

/**
 * ⚠️ 注意事項・特記事項の常時強調表示バナー（A-3 ソリッド規格・グラデーション/透過ブラー不使用）
 * - 未入力（空文字・空白のみ）の場合は何も描画しない
 * - 入力がある場合はアコーディオン等で隠さず、屋外でも一目で視認できるソリッド警告枠で常時表示する
 */
export function ImportantNoticeBanner({
  notice,
  compact = false,
  className,
}: ImportantNoticeBannerProps) {
  const trimmed = typeof notice === "string" ? notice.trim() : "";
  if (!trimmed) return null;

  if (compact) {
    return (
      <div
        className={cn(
          "px-2 py-1 rounded-lg border border-rose-500/35 border-l-[3px] border-l-rose-600 bg-rose-500/8 dark:bg-rose-500/12 flex items-center gap-1.5 min-w-0",
          className
        )}
      >
        <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
        <span className="text-[10px] font-black text-rose-800 dark:text-rose-200 truncate">
          {trimmed.replace(/\s+/g, " ")}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-rose-500/40 border-l-4 border-l-rose-600 bg-rose-500/8 dark:bg-rose-500/12 p-3 space-y-1.5 shadow-2xs",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        <span className="text-[11px] font-black text-rose-700 dark:text-rose-300">
          注意事項・特記事項
        </span>
        <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9.5px] font-black shrink-0">
          重要
        </span>
      </div>
      <p className="text-xs font-black text-foreground whitespace-pre-wrap leading-relaxed">
        {trimmed}
      </p>
    </div>
  );
}
